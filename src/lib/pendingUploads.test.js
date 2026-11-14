import {
  PENDING_UPLOADS_KEY,
  readPending,
  markPending,
  clearPending,
  trackUpload,
  drainPending,
  clearPendingIfUnchanged,
  enqueueUpload,
  markDeleted,
  hasUploadInFlight,
  sendLatest,
  withoutTombstoned,
  queueCloudDelete,
} from "./pendingUploads";
import { USER_DATA_KEYS } from "./userDataKeys";

// RL-075: a roast whose upload failed is retried later, but ONLY if this device
// marked it pending and it is still in local storage at the moment of sending.
// Each test pins one way a careless retry would resurrect a deleted roast, send
// stale data, or double-send.

function makeStorage(seed = {}) {
  const data = { ...seed };
  const store = {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: jest.fn((k, v) => {
      data[k] = String(v);
    }),
    removeItem: (k) => {
      delete data[k];
    },
  };
  return store;
}

const roast = (id, extra = {}) => ({ id, beanName: "E2E Ethiopia", ...extra });
const setRoasts = (s, list) => s.setItem("roasts", JSON.stringify(list));

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("pendingUploads", () => {
  test("never sends a local roast that was not marked pending", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(1), roast(2)]);
    const upload = jest.fn().mockResolvedValue(true);
    const res = await drainPending({ storage: s, uid: "A", upload, remove: jest.fn() });
    expect(upload).not.toHaveBeenCalled();
    expect(res).toEqual({ sent: 0, remaining: 0 });
  });

  test("drops a pending entry whose roast is gone from storage and sends nothing", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(2)]);
    markPending(s, 1, "A");
    const upload = jest.fn().mockResolvedValue(true);
    const res = await drainPending({ storage: s, uid: "A", upload, remove: jest.fn() });
    expect(upload).not.toHaveBeenCalled();
    expect(readPending(s)).toEqual([]);
    expect(res.remaining).toBe(0);
  });

  test("sends what storage holds at send time, not at mark time", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(1, { notes: "old" })]);
    markPending(s, 1, "A");
    setRoasts(s, [roast(1, { notes: "edited" })]);
    const upload = jest.fn().mockResolvedValue(true);
    await drainPending({ storage: s, uid: "A", upload, remove: jest.fn() });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][0].notes).toBe("edited");
    expect(readPending(s)).toEqual([]);
  });

  test("keeps the entry when upload resolves false", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(1)]);
    markPending(s, 1, "A");
    const res = await drainPending({ storage: s, uid: "A", upload: async () => false, remove: jest.fn() });
    expect(readPending(s)).toEqual([{ id: 1, uid: "A" }]);
    expect(res).toEqual({ sent: 0, remaining: 1 });
  });

  test("keeps the entry when upload throws, and carries on with the next", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(1), roast(2)]);
    markPending(s, 1, "A");
    markPending(s, 2, "A");
    const upload = jest.fn(async (r) => {
      if (r.id === 1) throw new Error("offline");
      return true;
    });
    const res = await drainPending({ storage: s, uid: "A", upload, remove: jest.fn() });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(readPending(s)).toEqual([{ id: 1, uid: "A" }]);
    expect(res).toEqual({ sent: 1, remaining: 1 });
  });

  test("keeps the entry when the stored roast changed while the upload was in flight", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(1, { notes: "a" })]);
    markPending(s, 1, "A");
    const upload = jest.fn(async () => {
      setRoasts(s, [roast(1, { notes: "b" })]);
      return true;
    });
    await drainPending({ storage: s, uid: "A", upload, remove: jest.fn() });
    expect(readPending(s)).toEqual([{ id: 1, uid: "A" }]);
  });

  test("calls remove(id) for a tombstoned roast deleted while its upload was in flight", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(1)]);
    markPending(s, 1, "A");
    const remove = jest.fn().mockResolvedValue(true);
    const upload = jest.fn(async () => {
      setRoasts(s, []);
      markDeleted(s, 1, "A"); // what handleDeleteRoast does when an upload is in flight
      return true;
    });
    await drainPending({ storage: s, uid: "A", upload, remove });
    expect(remove).toHaveBeenCalledWith(1);
    expect(readPending(s)).toEqual([]);
  });

  test("remove resolving false keeps the tombstone so the next drain retries", async () => {
    const s = makeStorage();
    setRoasts(s, []);
    markPending(s, 1, "A");
    markDeleted(s, 1, "A");
    const remove = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await drainPending({ storage: s, uid: "A", upload: jest.fn(), remove });
    expect(readPending(s)).toEqual([{ id: 1, uid: "A", deleted: true }]);
    await drainPending({ storage: s, uid: "A", upload: jest.fn(), remove });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(readPending(s)).toEqual([]);
  });

  test("a roast merely missing from storage (no tombstone) sends no DELETE", async () => {
    const s = makeStorage();
    setRoasts(s, []);
    markPending(s, 1, "A");
    const remove = jest.fn().mockResolvedValue(true);
    const upload = jest.fn().mockResolvedValue(true);
    await drainPending({ storage: s, uid: "A", upload, remove });
    expect(remove).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(readPending(s)).toEqual([]);
  });

  test("a roast that vanishes during its upload with no tombstone sends no DELETE", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(1)]);
    markPending(s, 1, "A");
    const remove = jest.fn().mockResolvedValue(true);
    await drainPending({ storage: s, uid: "A", upload: async () => { setRoasts(s, []); return true; }, remove });
    expect(remove).not.toHaveBeenCalled();
    expect(readPending(s)).toEqual([]);
  });

  test("isCurrent false mid-drain stops: no remove, no clearPending, no further upload", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(1), roast(2)]);
    markPending(s, 1, "A");
    markPending(s, 2, "A");
    markPending(s, 3, "A");
    markDeleted(s, 3, "A");
    let current = true;
    const upload = jest.fn(async () => { current = false; return true; });
    const remove = jest.fn().mockResolvedValue(true);
    await drainPending({ storage: s, uid: "A", upload, remove, isCurrent: () => current });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    expect(readPending(s).map((e) => e.id)).toEqual([1, 2, 3]); // nothing cleared
  });

  test("isCurrent false before the first upload changes nothing", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(1)]);
    markPending(s, 1, "A");
    const upload = jest.fn().mockResolvedValue(true);
    await drainPending({ storage: s, uid: "A", upload, remove: jest.fn(), isCurrent: () => false });
    expect(upload).not.toHaveBeenCalled();
    expect(readPending(s)).toEqual([{ id: 1, uid: "A" }]);
  });

  test("readPending tolerates and keeps the deleted flag", () => {
    const s = makeStorage({ [PENDING_UPLOADS_KEY]: JSON.stringify([{ id: 1, uid: "A", deleted: true }, { id: 2 }]) });
    expect(readPending(s)).toEqual([{ id: 1, uid: "A", deleted: true }, { id: 2, uid: null }]);
  });

  test("a later write for the same id waits for a drain upload and reads storage at send time", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(1, { notes: "a" })]);
    markPending(s, 1, "A");
    const d = deferred();
    const upload = jest.fn(() => d.promise);
    const drain = drainPending({ storage: s, uid: "A", upload, remove: jest.fn() });
    expect(hasUploadInFlight(1)).toBe(true);

    const second = jest.fn(async () => sendLatest(s, 1, upload2));
    const upload2 = jest.fn().mockResolvedValue(true);
    const queued = enqueueUpload(1, second);
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(second).not.toHaveBeenCalled(); // first write has not settled

    setRoasts(s, [roast(1, { notes: "edited while first in flight" })]);
    d.resolve(true);
    await drain;
    await queued;
    expect(second).toHaveBeenCalledTimes(1);
    expect(upload2.mock.calls[0][0].notes).toBe("edited while first in flight");
    expect(hasUploadInFlight(1)).toBe(false);
  });

  test("enqueueUpload runs one id's writes in order; other ids are not blocked", async () => {
    const order = [];
    const d = deferred();
    const a1 = enqueueUpload(7, async () => { order.push("a1"); return d.promise; });
    const a2 = enqueueUpload(7, async () => { order.push("a2"); return true; });
    const b = enqueueUpload(8, async () => { order.push("b"); return true; });
    await b;
    expect(order).toEqual(["a1", "b"]);
    d.resolve(true);
    await Promise.all([a1, a2]);
    expect(order).toEqual(["a1", "b", "a2"]);
  });

  test("a failed write does not jam the queue", async () => {
    const first = enqueueUpload(11, async () => { throw new Error("boom"); });
    const second = enqueueUpload(11, async () => "ok");
    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toBe("ok");
  });

  test("sendLatest sends nothing and resolves null for a roast that is gone", async () => {
    const s = makeStorage();
    setRoasts(s, []);
    const upload = jest.fn();
    expect(await sendLatest(s, 1, upload)).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  test("a second drain that is skipped says so", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(1)]);
    markPending(s, 1, "A");
    const d = deferred();
    const first = drainPending({ storage: s, uid: "A", upload: () => d.promise, remove: jest.fn() });
    const second = await drainPending({ storage: s, uid: "A", upload: jest.fn(), remove: jest.fn() });
    expect(second).toEqual({ skipped: true, sent: 0, remaining: 1 });
    d.resolve(true);
    expect(await first).toEqual({ sent: 1, remaining: 0 });
  });

  test("pendingRoastUploads is quarantined with the user data and is not a live_ key", () => {
    expect(USER_DATA_KEYS).toContain("pendingRoastUploads");
    expect(USER_DATA_KEYS).toContain(PENDING_UPLOADS_KEY);
    expect(PENDING_UPLOADS_KEY.startsWith("live_")).toBe(false);
  });

  test("skips an id whose save or edit write is still in flight", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(1)]);
    markPending(s, 1, "A");
    const d = deferred();
    trackUpload(1, d.promise);
    const upload = jest.fn().mockResolvedValue(true);
    const res = await drainPending({ storage: s, uid: "A", upload, remove: jest.fn() });
    expect(upload).not.toHaveBeenCalled();
    expect(readPending(s)).toEqual([{ id: 1, uid: "A" }]);
    expect(res.remaining).toBe(1);
    // Once the write settles the id is free again.
    d.resolve(true);
    await d.promise;
    await Promise.resolve();
    await drainPending({ storage: s, uid: "A", upload, remove: jest.fn() });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  test("trackUpload returns the original promise and swallows rejection internally", async () => {
    const p = Promise.reject(new Error("boom"));
    expect(trackUpload(9, p)).toBe(p);
    await expect(p).rejects.toThrow("boom");
  });

  test("skips an entry stamped with a different uid, and one stamped A while the current uid is null", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(1), roast(2)]);
    markPending(s, 1, "B");
    markPending(s, 2, "A");
    const upload = jest.fn().mockResolvedValue(true);
    await drainPending({ storage: s, uid: "A", upload, remove: jest.fn() });
    expect(upload.mock.calls.map((c) => c[0].id)).toEqual([2]);
    expect(readPending(s)).toEqual([{ id: 1, uid: "B" }]);

    const s2 = makeStorage();
    setRoasts(s2, [roast(3)]);
    markPending(s2, 3, "A");
    const upload2 = jest.fn().mockResolvedValue(true);
    await drainPending({ storage: s2, uid: null, upload: upload2, remove: jest.fn() });
    expect(upload2).not.toHaveBeenCalled();
    expect(readPending(s2)).toEqual([{ id: 3, uid: "A" }]);
  });

  test("treats a null uid and an undefined uid as the same user", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(1)]);
    markPending(s, 1, null);
    const upload = jest.fn().mockResolvedValue(true);
    await drainPending({ storage: s, uid: undefined, upload, remove: jest.fn() });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(readPending(s)).toEqual([]);
  });

  test("a second drain while one is running sends nothing twice", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(1)]);
    markPending(s, 1, "A");
    const d = deferred();
    const upload = jest.fn(() => d.promise);
    const first = drainPending({ storage: s, uid: "A", upload, remove: jest.fn() });
    const second = await drainPending({ storage: s, uid: "A", upload, remove: jest.fn() });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(second.sent).toBe(0);
    d.resolve(true);
    const res = await first;
    expect(res.sent).toBe(1);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  test("never writes the roasts key", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(1), roast(2), roast(3)]);
    s.setItem.mockClear();
    markPending(s, 1, "A");
    markPending(s, 2, "A");
    markPending(s, 3, "A");
    await drainPending({
      storage: s,
      uid: "A",
      upload: async (r) => {
        if (r.id === 2) setRoasts(s, [roast(1), roast(3)]);
        return r.id !== 3;
      },
      remove: jest.fn(),
    });
    clearPending(s, 1);
    const keys = s.setItem.mock.calls.map((c) => c[0]).filter((k) => k !== "roasts");
    expect(keys.every((k) => k === PENDING_UPLOADS_KEY)).toBe(true);
    // The only "roasts" write is the test's own mid-flight edit above.
    expect(s.setItem.mock.calls.filter((c) => c[0] === "roasts")).toHaveLength(1);
  });

  test("corrupt pending JSON reads as empty and does not throw", () => {
    for (const bad of ["{not json", '{"a":1}', "42", "null", '"x"']) {
      const s = makeStorage({ [PENDING_UPLOADS_KEY]: bad });
      expect(() => readPending(s)).not.toThrow();
      expect(readPending(s)).toEqual([]);
    }
  });

  test("markPending keeps the first entry for an id, and the key is not a live_ key", () => {
    const s = makeStorage();
    markPending(s, 1, "A");
    markPending(s, 1, "B");
    markPending(s, 2, null);
    expect(readPending(s)).toEqual([
      { id: 1, uid: "A" },
      { id: 2, uid: null },
    ]);
    expect(PENDING_UPLOADS_KEY.startsWith("live_")).toBe(false);
  });

  test("clearPendingIfUnchanged clears only an unchanged, already-pending roast", () => {
    const s = makeStorage();
    setRoasts(s, [roast(1), roast(2), roast(3)]);
    markPending(s, 1, "A");
    markPending(s, 2, "A");
    // unchanged: cleared
    expect(clearPendingIfUnchanged(s, roast(1))).toBe(true);
    // changed since it was sent: kept
    expect(clearPendingIfUnchanged(s, roast(2, { notes: "old" }))).toBe(false);
    // never pending: no entry is created or touched
    expect(clearPendingIfUnchanged(s, roast(3))).toBe(false);
    // deleted locally: kept for drain to handle
    setRoasts(s, [roast(3)]);
    expect(clearPendingIfUnchanged(s, roast(2))).toBe(false);
    expect(readPending(s)).toEqual([{ id: 2, uid: "A" }]);
  });

  // ---- second-round review fixes (B1, S1, security LOW) ----
  test("withoutTombstoned drops cloud roasts whose id has a deleted entry, and only those", () => {
    const s = makeStorage();
    markPending(s, 1, "A");
    markDeleted(s, 2, "A");
    const cloud = [roast(1), roast(2), roast("3")];
    expect(withoutTombstoned(cloud, readPending(s)).map((r) => r.id)).toEqual([1, "3"]);
    expect(withoutTombstoned(cloud, []).length).toBe(3);
  });

  test("markPending replaces a tombstone with a fresh entry", () => {
    const s = makeStorage();
    markDeleted(s, 5, "A");
    markPending(s, 5, "B");
    expect(readPending(s)).toEqual([{ id: 5, uid: "B" }]);
  });

  test("queueCloudDelete runs behind an in-flight upload and clears the tombstone only on exactly true", async () => {
    const s = makeStorage();
    markDeleted(s, 7, "A");
    const gate = deferred();
    const order = [];
    const up = enqueueUpload(7, async () => { await gate.promise; order.push("upload"); return true; });
    const remove = jest.fn(async () => { order.push("delete"); return true; });
    const q = queueCloudDelete(s, 7, remove);
    await Promise.resolve();
    expect(remove).not.toHaveBeenCalled();
    expect(readPending(s).length).toBe(1);
    gate.resolve();
    await up;
    expect(await q).toBe(true);
    expect(order).toEqual(["upload", "delete"]);
    expect(readPending(s)).toEqual([]);
  });

  test("queueCloudDelete keeps the tombstone when the delete is false, throws or is truthy-but-not-true", async () => {
    for (const result of [false, "yes", undefined]) {
      const s = makeStorage();
      markDeleted(s, 8, "A");
      await queueCloudDelete(s, 8, async () => result);
      expect(readPending(s).length).toBe(1);
    }
    const s = makeStorage();
    markDeleted(s, 8, "A");
    expect(await queueCloudDelete(s, 8, async () => { throw new Error("x"); })).toBe(false);
    expect(readPending(s).length).toBe(1);
  });

  test("the drain passes its expected uid to the upload", async () => {
    const s = makeStorage();
    setRoasts(s, [roast(9)]);
    markPending(s, 9, "A");
    const upload = jest.fn().mockResolvedValue(true);
    await drainPending({ storage: s, uid: "A", upload, remove: jest.fn() });
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }), "A");
  });
});
