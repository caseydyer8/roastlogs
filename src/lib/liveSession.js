// ---------------------------------------------------------------------------
// The live roast session in localStorage (the `live_*` keys), and the one
// question SAVE ROAST has to answer about it: has THIS session's roast already
// been saved? (RL-043)
//
// handleStop gives every call a fresh id and clears the session only 2 s later,
// so a second tap -- or a reload inside that window, which restores the finished
// roast as a paused one with SAVE ROAST showing -- put the same roast into
// History twice. The cure is a marker, `live_savedRoast`, that SAVE ROAST writes
// into the session: { id, stamp }.
//
// A marker read carelessly is a worse bug than the one it cures: it would drop
// the NEXT real roast, or wipe one that is under way. So it counts only when
// BOTH hold:
//   1. the roast it names is still in History (deleted since = it proves nothing)
//   2. its stamp is this session's stamp (an earlier roast's leftover is not)
// Anything else is ignored and the save goes ahead. Failing open is deliberate:
// the worst a wrong "no" does is let a duplicate through, as before; a wrong
// "yes" loses a roast.
// ---------------------------------------------------------------------------

export const LIVE_CURVE_KEY = "live_curve";
export const SAVED_ROAST_KEY = "live_savedRoast";

// Every key that belongs to the roast in progress. keepSetup: after a SAVE the
// last bean / weight / level carry forward so a back-to-back roast is a
// click-through. Discard still wipes everything.
export function liveSessionKeys({ keepSetup = false } = {}) {
  return [
    ...(keepSetup ? [] : ["live_beanName", "live_beanId", "live_greenWeightGrams", "live_targetRoastLevel"]),
    "live_startingHeat",
    "live_startingFan",
    "live_startingTemp",
    "live_elapsedSeconds",
    "live_devSeconds",
    "live_firstCrackTime",
    "live_coolingStartTime",
    "live_roastLog",
    "live_profileFollowing",
    "live_currentProfileStepIdx",
    // The curve was persisted so a mid-roast reload keeps its trace, but
    // Discard never cleared it. startRoast masked that by resetting curveRef
    // on a fresh roast -- until the timeline gained a curve fallback for
    // missing temperatures, which would then paint a DISCARDED roast's
    // readings onto the next one after a reload. Same-account bleed, not a
    // cross-account leak: the "live_" prefix purge already covers sign-in.
    LIVE_CURVE_KEY,
    // Vestigial: read at startup but never written since an old version.
    // Purged so a stale copy on a long-lived install cannot hydrate.
    "live_adjustments",
    // Belongs to the session it was written for, so it goes with it.
    SAVED_ROAST_KEY,
  ];
}

// Where the session stood when it was saved: the clock and the length of the
// log. SAVE ROAST only appears after COOLING START has stopped the timer, so
// both stay put until RESUME -- what handleStop stamps from state is what a
// reload reads back from storage. A RESUME row or a tick changes the stamp, and
// then the marker no longer speaks for the session (it fails open, on purpose).
export function liveSessionStamp(elapsedSeconds, logLength) {
  return `${Number(elapsedSeconds) || 0}:${Number(logLength) || 0}`;
}

// The same stamp, read back from storage the way the app restores the session.
function storedLiveSessionStamp() {
  let logLength = 0;
  try {
    const log = JSON.parse(localStorage.getItem("live_roastLog") || "[]");
    if (Array.isArray(log)) logLength = log.length;
  } catch (e) {
    // An unreadable log gives a stamp no marker carries -- never a match.
  }
  return liveSessionStamp(localStorage.getItem("live_elapsedSeconds"), logLength);
}

function readSavedMarker() {
  try {
    const marker = JSON.parse(localStorage.getItem(SAVED_ROAST_KEY));
    // An id is a number or a non-blank string: Number("") equals Number(null), so a
    // blank id could otherwise match a stored roast that has no id.
    const hasId = marker && (typeof marker.id === "number" || (typeof marker.id === "string" && marker.id.trim() !== ""));
    return marker && typeof marker === "object" && hasId && typeof marker.stamp === "string"
      ? marker
      : null;
  } catch (e) {
    return null;
  }
}

// Has the session with this stamp already been saved? `roasts` is what History
// holds right now (an array of roasts, as stored).
export function liveSessionAlreadySaved(stamp, roasts) {
  const marker = readSavedMarker();
  if (!marker || marker.stamp !== stamp) return false;
  return (Array.isArray(roasts) ? roasts : []).some((r) => r && Number(r.id) === Number(marker.id));
}

// Called by handleStop right AFTER the roast is written, so the marker can never
// name a roast that is not there. It must not be able to break a save: a full
// quota here costs only the double-tap guard, and the roast is already stored.
export function markRoastSaved(roastId, stamp) {
  try {
    localStorage.setItem(SAVED_ROAST_KEY, JSON.stringify({ id: roastId, stamp }));
  } catch (e) {
    // The roast is saved; only the repeat-save guard is lost.
  }
}

// A new roast starts with no history of being saved.
export function clearSavedMarker() {
  try {
    localStorage.removeItem(SAVED_ROAST_KEY);
  } catch (e) {
    // Nothing to do: the marker is only ever honoured under both conditions above.
  }
}

// Boot, BEFORE any state reads live_*. A marker that vouches for the stored
// session (both conditions) means the roast was saved and only the 2 s clear
// never ran: finish that clear, exactly as it would have, so the roast comes
// back as finished (Setup) rather than paused with SAVE ROAST. Any other marker
// is dead weight and is dropped; the session, if there is one, is left alone.
// Returns whether it finished a session.
export function settleSavedLiveSession(roasts) {
  try {
    const finished = liveSessionAlreadySaved(storedLiveSessionStamp(), roasts);
    clearSavedMarker();
    if (finished) liveSessionKeys({ keepSetup: true }).forEach((k) => localStorage.removeItem(k));
    return finished;
  } catch (e) {
    return false;
  }
}
