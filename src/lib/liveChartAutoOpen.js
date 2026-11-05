// ---------------------------------------------------------------------------
// When the Roast tab opens the live chart by itself (RL-063).
//
// The chart is about 260 px tall and sits ABOVE the Mark / PAUSE row. Opening
// it is only ever safe while the roaster is looking at the screen anyway: at
// START, or when the page comes back into a roast under way. Opening it at any
// other moment drops the controls ~260 px down while a thumb is on them (RL-039).
// So the decision is a pure function of five facts, and every one of them can
// say no:
//
//   hasProbe / roastStarted  only a probe roast has a curve, and only once it is under way
//   coolingStarted           after COOLING START the roast is over bar SAVE ROAST;
//                            a chart arriving then would push SAVE ROAST down
//   drawable now             the feed is live or bridge-only, or the roast already has a
//                            curve (a reload: the stored curve is on screen at once)
//   sinceMs                  how long ago START (or the page load) was. A bridge that
//                            joins late is drawable, but not NEAR START: the readout
//                            appears collapsed and the roaster taps it when ready
// ---------------------------------------------------------------------------

// "About 15 seconds": long enough for the feed to answer after a START or a reload
// (a cold iOS reload takes a few seconds to resubscribe), short enough that a
// bridge app started mid-roast never counts.
export const AUTO_OPEN_WINDOW_MS = 15000;

export function shouldAutoOpenLiveChart({ hasProbe, roastStarted, coolingStarted, status, curvePoints, sinceMs }) {
  if (!hasProbe || !roastStarted || coolingStarted) return false;
  const drawableNow = status === "live" || status === "bridge-only" || curvePoints > 0;
  if (!drawableNow) return false;
  // A time it cannot read is late, never on time.
  return typeof sinceMs === "number" && Number.isFinite(sinceMs) && sinceMs <= AUTO_OPEN_WINDOW_MS;
}

// "Connecting" has a ceiling (RL-063 D8). The hook reads "connecting" from mount until its
// first presence sync and has no error state, so a phone that reloads offline, or a Realtime
// that refuses the subscribe, would leave the readout promising a feed for the rest of the
// roast. Once the page has waited as long as the auto-open window (one rule, not a setting)
// without hearing from the channel, the feed reads as lost. Only a feed that has NOT answered
// is rewritten; live, bridge-only and no-bridge are real answers and pass through.
// `ceilingPassed` is a flag, not a clock, so the render stays pure: the caller flips it from
// a single timer.
export function readoutFeedStatus(status, ceilingPassed) {
  const notHeardFrom = status === "idle" || status === "connecting";
  return notHeardFrom && ceilingPassed === true ? "no-bridge" : status;
}
