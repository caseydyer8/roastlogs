// ---------------------------------------------------------------------------
// Pending roast uploads (RL-075).
//
// A roast saved with bad signal gets one upload attempt. This module keeps an
// explicit list, on the device, of roasts whose upload has not been confirmed,
// and drains it later. Pure logic: storage and network are injected, so it has
// no React and no supabase import.
//
// Design:
//   1. A roast is marked pending the moment it is saved, BEFORE the upload.
//   2. The entry comes off only when an upload succeeds AND the stored copy is
//      unchanged since it was sent.
//   3. A retry sends only roasts that are on the list and still in local
//      storage, re-read at the moment of sending.
//   4. This module never writes the `roasts` key; it only writes
//      PENDING_UPLOADS_KEY.
//
// Why a list and not "push everything the cloud lacks": both accounts can see
// every row, so "not in the cloud" does not prove "never uploaded" -- the other
// device may have deleted it, and pushing it back would resurrect it.
//
// ACCEPTED GAP: if an upload reaches the server but the reply is lost, and the
// other device deletes that roast before this device reconnects, the retry can
// bring it back once. Closing that fully needs a server-side deletions table (a
// database change), deliberately not done.
// ---------------------------------------------------------------------------

// Deliberately NOT a `live_` key: AuthContext purges every live_* key, which
// would silently drop the list.
export const PENDING_UPLOADS_KEY = "pendingRoastUploads";

const ROASTS_KEY = "roasts";

function readJsonArray(storage, key) {
  try {
    const parsed = JSON.parse(storage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readPending(storage) {
  return readJsonArray(storage, PENDING_UPLOADS_KEY).filter(
    (e) => e && typeof e === "object" && e.id !== undefined && e.id !== null
  ).map((e) => {
    const out = { id: e.id, uid: e.uid === undefined ? null : e.uid };
    if (e.deleted === true) out.deleted = true; // tombstone: the user deleted this roast
    return out;
  });
}

function writePending(storage, list) {
  storage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(list));
}

// Idempotent per id: the first entry (and its uid) wins.
export function markPending(storage, id, uid) {
  const list = readPending(storage);
  const existing = list.find((e) => Number(e.id) === Number(id));
  if (existing && !existing.deleted) return;
  // A stale tombstone must not cloud-delete a roast that was re-added: replace it.
  writePending(storage, [
    ...list.filter((e) => e !== existing),
    { id, uid: uid === undefined ? null : uid },
  ]);
  if (existing) return;
  writePending(storage, [...list, { id, uid: uid === undefined ? null : uid }]);
}

export function clearPending(storage, id) {
  const list = readPending(storage);
  const next = list.filter((e) => Number(e.id) !== Number(id));
  if (next.length !== list.length) writePending(storage, next);
}

// After a SUCCESSFUL upload of `sent`: drop the pending entry only if the roast
// in storage is still exactly what was sent (same compare drainPending uses).
// Never adds an entry. Returns true when an entry was cleared.
export function clearPendingIfUnchanged(storage, sent) {
  if (!sent || sent.id === undefined || sent.id === null) return false;
  if (!readPending(storage).some((e) => Number(e.id) === Number(sent.id))) return false;
  const after = readJsonArray(storage, ROASTS_KEY).find(
    (r) => r && Number(r.id) === Number(sent.id)
  );
  if (!after || JSON.stringify(after) !== JSON.stringify(sent)) return false;
  clearPending(storage, sent.id);
  return true;
}

// Tombstone: the user deleted this roast while an upload of it was in flight or
// queued, so that upload may have (re)created the cloud row. The drain sends a
// cloud DELETE for a tombstoned entry and ONLY for one: a roast that is merely
// missing from storage (purge, corrupt JSON) is not evidence of a user delete.
export function markDeleted(storage, id, uid) {
  const list = readPending(storage).filter((e) => Number(e.id) !== Number(id));
  const prior = readPending(storage).find((e) => Number(e.id) === Number(id));
  writePending(storage, [
    ...list,
    { id, uid: prior ? prior.uid : uid === undefined ? null : uid, deleted: true },
  ]);
}

// B1: the launch add-only merge must not bring back a roast the user deleted whose
// upload landed after the DELETE. Cloud roasts whose id has a tombstone are skipped.
export function withoutTombstoned(cloudRoasts, pending) {
  const dead = new Set((pending || []).filter((e) => e && e.deleted).map((e) => Number(e.id)));
  if (dead.size === 0) return cloudRoasts;
  return cloudRoasts.filter((r) => !(r && dead.has(Number(r.id))));
}

// ids with a save / edit / drop-weight / drain write in flight or queued, so a
// drain never races them.
const inFlight = new Map();
// Per-id tail of the write queue (never rejects).
const queues = new Map();

export function hasUploadInFlight(id) {
  return inFlight.has(Number(id));
}

export function trackUpload(id, promise) {
  const key = Number(id);
  inFlight.set(key, (inFlight.get(key) || 0) + 1);
  const done = () => {
    const n = (inFlight.get(key) || 1) - 1;
    if (n <= 0) inFlight.delete(key);
    else inFlight.set(key, n);
  };
  // Settle handlers swallow the rejection here; the caller still gets the
  // original promise and decides what to do with it.
  Promise.resolve(promise).then(done, done);
  return promise;
}

// Chains every write of one roast id behind the previous one for that id, so the
// LAST write queued is the LAST to land. `makeUpload` is called only when its turn
// comes, so it can read the latest stored roast at SEND time. Returns the promise
// of makeUpload's result (rejects if it does); a failure never jams the queue.
export function enqueueUpload(id, makeUpload) {
  const key = Number(id);
  const prev = queues.get(key) || Promise.resolve();
  const run = prev.then(() => makeUpload());
  const tail = run.then(() => undefined, () => undefined);
  queues.set(key, tail);
  tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return trackUpload(id, run);
}

// S1: a follow-up cloud DELETE on the roast's own queue, so it lands AFTER an upload
// that was in flight when the user deleted. The tombstone comes off only when this
// delete resolves exactly true. Resolves true / false (never rejects).
export function queueCloudDelete(storage, id, remove) {
  return enqueueUpload(id, async () => {
    let ok = false;
    try {
      ok = (await remove(id)) === true;
    } catch {
      ok = false;
    }
    if (ok && (readPending(storage).find((e) => Number(e.id) === Number(id)) || {}).deleted) {
      clearPending(storage, id);
    }
    return ok;
  }).catch(() => false);
}

const findRoast = (storage, id) =>
  readJsonArray(storage, ROASTS_KEY).find((r) => r && Number(r.id) === Number(id));

// Upload the roast as stored RIGHT NOW. Null when it is gone (nothing is sent, so
// a deleted roast is never re-created). On a confirmed upload of an unchanged copy
// the pending entry (never added here) comes off. Resolves upload's own result.
export async function sendLatest(storage, id, upload) {
  const latest = findRoast(storage, id);
  if (!latest) return null;
  const res = await upload(latest);
  if (res === true) clearPendingIfUnchanged(storage, latest);
  return res;
}

// null and undefined are the same "no user" (the e2e bypass has no user id).
const sameUid = (a, b) => (a == null && b == null) || a === b;

let draining = false;

const STOP = Symbol("stop");

// `isCurrent()` is asked before every upload and every remove; once false the
// drain stops at once and changes nothing (the account or the page went away).
export async function drainPending({ storage, uid, upload, remove, isCurrent = () => true }) {
  if (draining) return { skipped: true, sent: 0, remaining: readPending(storage).length };
  draining = true;
  let sent = 0;
  const entryNow = (id) => readPending(storage).find((e) => Number(e.id) === Number(id));
  // Cloud DELETE for a tombstone; the entry comes off only on exactly `true`.
  const removeTombstone = async (id) => {
    if (!isCurrent()) return STOP;
    let ok = false;
    try {
      ok = (await remove(id)) === true;
    } catch {
      ok = false;
    }
    if (!isCurrent()) return STOP;
    if (ok) clearPending(storage, id);
    return null;
  };
  try {
    for (const entry of readPending(storage)) {
      if (!isCurrent()) break;
      if (entry.deleted) {
        if (!sameUid(entry.uid, uid)) continue;
        if (inFlight.has(Number(entry.id))) continue;
        if ((await removeTombstone(entry.id)) === STOP) break;
        continue;
      }
      const latest = findRoast(storage, entry.id);
      if (!latest) {
        clearPending(storage, entry.id); // merely missing: drop it, send nothing
        continue;
      }
      if (!sameUid(entry.uid, uid)) continue;
      if (inFlight.has(Number(entry.id))) continue;

      // Registered in the id's write queue: a later edit or drop weight waits for it.
      const outcome = await enqueueUpload(entry.id, async () => {
        if (!isCurrent()) return STOP;
        const current = findRoast(storage, entry.id);
        if (!current) return null; // gone since the check above: send nothing
        const payload = JSON.stringify(current);
        let ok = false;
        try {
          ok = (await upload(current, uid)) === true;
        } catch {
          ok = false;
        }
        return ok ? { payload } : false;
      });
      if (outcome === STOP || !isCurrent()) break;
      if (outcome === null) {
        if (!findRoast(storage, entry.id) && !(entryNow(entry.id) || {}).deleted) clearPending(storage, entry.id);
        continue;
      }
      if (outcome === false) continue;
      sent += 1;

      const after = findRoast(storage, entry.id);
      if (!after) {
        // Deleted during the upload: DELETE only if the delete path left a tombstone.
        if ((entryNow(entry.id) || {}).deleted) {
          if ((await removeTombstone(entry.id)) === STOP) break;
        } else {
          clearPending(storage, entry.id);
        }
      } else if (JSON.stringify(after) === outcome.payload) {
        clearPending(storage, entry.id);
      }
      // else: changed mid-flight; keep the entry so the next drain sends it.
    }
  } finally {
    draining = false;
  }
  return { sent, remaining: readPending(storage).length };
}
