// First-crack (FC) ETA -- the pure maths behind the "FC IN m:ss" chip on the
// live chart. No React, no clock, no storage: series in, one verdict out, so it
// can be unit-tested and replayed against recorded roasts (fcEta.backtest.test.js).
//
// THE ESTIMATE. (400 - BT) / RoR * 60, the constant-rate rule Artisan uses.
// BT and RoR are the live chart's OWN smoothed series (buildLiveChartModel's
// data[].temp and data[].ror), so the countdown agrees with the lines it sits on.
// It reads EARLY while RoR is falling -- the rate it divides by is faster than
// the rate the bean will have -- and the back-test measures that bias.
//
// WHEN IT STARTS. Caramelization has begun when ANY of these holds:
//   1. a CARAMELIZATION entry is in the log (the ladder's 340 F rising crossing);
//   2. the stored curve contains a RISING crossing of 340 F -- a sample at or
//      above it whose previous measured sample was below. Reads across a dropout
//      too, which the ladder cannot (it re-seeds after a gap). The first sample
//      of a roast has no predecessor, so a hot charge is not a crossing;
//   3. a bridge that joined late: the clock is past TURNAROUND_WINDOW and the
//      newest BT is at or above 340. NEVER plain "was ever >= 340" -- a charge at
//      the preheat temperature would start the chip at t = 0 with a bogus number.
//      The start it records is the first sample of the newest UNBROKEN run -- walk
//      back from the newest measured second while the previous measured sample is
//      within LIVE_GAP_S -- not the first sample of the roast. A hot charge, a
//      feed dropout, then a rejoin at 345 F must not borrow the charge's 420 F as
//      its "reached 400" origin. Derived from the series, so it survives a reload.
//      KNOWN LIMIT: rule 3 does not ask how old the newest BT is. If the feed died
//      on a hot reading and stays dead past TURNAROUND_WINDOW, that stale reading
//      still counts as "newest BT >= 340" until the feed returns. Requiring a fresh
//      BT would close it, but would also hide the chip on a reload of a late-join
//      roast until the feed reconnects -- a trade-off left for a decision.
// Once started it is LATCHED: rule 1 and 2 live in stored data and survive a
// reload; rule 3 is latched through `prior` (pass the last call's nextPrior).
//
// STATES. hidden (not started / gate closed) | counting | held | overdue |
// resolved (first crack or drop marked -- the question is answered, show nothing).
//   counting  RoR has been at or above ROR_MIN for each of the last
//             ROR_RELEASE_S seconds, AND the BT is fresh (measured this second, or --
//             with lastRealBtT, see below -- no older than LIVE_GAP_S). Quick to
//             leave, slow to come back, so the number cannot flicker at the threshold.
//   held      anything else once started: RoR flat, negative, null, or the feed
//             quiet. The value is (400 - newest MEASURED BT) / last good RoR, where
//             "last good" is the RoR at the end of the newest ROR_RELEASE_S-second
//             run -- so a one-second spike can never become the rate. It is NOT a
//             wall-clock countdown: a clock reaches 0:00 while a bean sits stalled
//             at 370, a confident wrong number. Held tracks the bean and is frozen
//             while the bean is. null (shown as NO_ETA) only when no good RoR has
//             ever existed, e.g. for the first ~16 s after a bridge joins late (RoR
//             needs 16 contiguous samples).
//             KNOWN BIAS, pinned by a test so changing it is a decision: after a heat
//             cut it reads LATE, about (400 - BT) x 12 s while held. RoR slides down
//             rather than jumping, so the newest second still >= ROR_MIN is at about
//             ROR_MIN itself, and (400 - BT) / 5 x 60 = (400 - BT) x 12. At 370 F that
//             is 6:00 against a 1:00 job at the pre-cut 30 F/min. It is the number
//             the plan chose (the HELD tag marks it low-confidence); the alternative
//             is a time-decaying or pace-aware value, deliberately not built.
//   overdue   BT has reached 400 with no first crack marked: counts UP from the
//             first second at or above 400 since caramelization began. Latched.
//             After a late join that second is the join, not the real crossing.
//
// NULLS. Every series is nullable. Nothing here does arithmetic on a null (in JS
// 400 - null is 400, which would turn an unmeasured second into a 6-minute
// answer): BT now is the newest NON-null smoothed sample, and its age is reported.
//
// A DYING FEED -- WHAT THE CHART MODEL MUST PASS (integration contract).
// buildLiveChartModel repeats the last reading for up to LIVE_GAP_S seconds after
// the last real sample (its `carried` value), so data[].temp stays non-null for six
// seconds after the feed died. From the arrays alone a repeated second is
// indistinguishable from a measured one: the age would read 0 and the chip would
// keep saying "counting" on a number nobody is measuring. So the caller passes:
//   1. lastRealBtT  the second (index) of the newest REAL BT sample -- the largest
//                   Math.round(p.t) over the curve points with a finite bt, i.e. the
//                   same indexing the model uses for its btAt map -- NOT the newest
//                   non-null data[].temp.
//   2. rors         built from REAL samples only at the trailing edge. Interior
//                   holes no longer than LIVE_GAP_S may still be filled (they are
//                   between two real samples, and RoR needs an unbroken window), but
//                   nothing is carried PAST the newest real sample: rors must be
//                   null after lastRealBtT, so a repeated reading can never extend a
//                   run of "good" seconds. (data[].temp may keep its trailing carry
//                   for drawing; only RoR must not use it.)
// With lastRealBtT, btAgeSeconds = elapsed - lastRealBtT, and counting needs both
// the rate good through lastRealBtT and an age no greater than LIVE_GAP_S -- the
// same threshold the chart carries over and the hook calls stale -- so a clock-drift
// hole of a second does not flicker the chip, and a dead feed flips it to held
// once the carry is spent. Absent or non-finite, nothing changes: the age is
// measured from the newest non-null temp and counting needs age 0.
//
// `prior` is optional memory, { startedAt, t }, and only ever fills gaps: the same
// inputs give the same verdict with or without it, except that it keeps a late-join
// start (and that start's overdue origin) alive. Pass null at the start of each
// roast; a clock that goes backwards also discards it.

import { CARAMELIZATION_F } from "./roastPhases";
import { LIVE_GAP_S } from "./liveSample";

export const FC_TARGET_F = 400;
export const ROR_MIN = 5; // F/min; under this a "rate" is noise, not a rate
export const ROR_RELEASE_S = 5; // consecutive good seconds before counting resumes
export const TURNAROUND_WINDOW = 240; // seconds; mirrors App.js, which does not export it

// Display rules (formatEta): above a minute the number moves in 5 s steps so it
// does not twitch, at or under a minute it moves every second, and nothing is
// shown past 9:59 -- that far out the number is a hint, not a prediction.
const SNAP_S = 5;
const SNAP_ABOVE_S = 60;
const MAX_SHOWN_S = 599;
export const NO_ETA = "–:––";
const FAR_AWAY_ARIA = "First crack is more than 10 minutes away";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const list = (v) => (Array.isArray(v) ? v : []);

function newestMeasured(temps) {
  for (let i = temps.length - 1; i >= 0; i--) if (isNum(temps[i])) return i;
  return -1;
}

// First measured second of the newest unbroken run that ends at `idxNow`: walk back
// while the previous measured sample is no more than LIVE_GAP_S earlier -- the same
// threshold the chart uses to call a gap a gap. Everything before a wider hole is
// another life of the probe (a hot charge before a dropout) and is left alone.
function unbrokenRunStart(temps, idxNow) {
  let start = idxNow;
  for (let i = idxNow - 1; i >= 0 && start - i <= LIVE_GAP_S; i--) {
    if (isNum(temps[i])) start = i;
  }
  return start;
}

function firstRisingCrossing(temps) {
  let prev = null;
  for (let i = 0; i < temps.length; i++) {
    if (!isNum(temps[i])) continue;
    if (prev !== null && prev < CARAMELIZATION_F && temps[i] >= CARAMELIZATION_F) return i;
    prev = temps[i];
  }
  return -1;
}

// Index of the newest second that ends a run of ROR_RELEASE_S consecutive good
// seconds; -1 if there has never been one.
function lastGoodRunEnd(rors) {
  let run = 0;
  let end = -1;
  for (let i = 0; i < rors.length; i++) {
    if (isNum(rors[i]) && rors[i] >= ROR_MIN) {
      run++;
      if (run >= ROR_RELEASE_S) end = i;
    } else {
      run = 0;
    }
  }
  return end;
}

function firstAtOrAbove(temps, from, f) {
  for (let i = from; i < temps.length; i++) if (isNum(temps[i]) && temps[i] >= f) return i;
  return -1;
}

const earliest = (...xs) => {
  const v = xs.filter(isNum);
  return v.length ? Math.min(...v) : null;
};

// temps    smoothed BT by second since START (index = second), null where unmeasured
// rors     smoothed RoR (F/min) on the same index, null where not computable
// elapsed  seconds since START now
// marks    { caramelization, firstCrack, drop }: the logged second, or null/absent.
//          This is exactly what phaseBoundaries(roastLog) returns.
// hasProbe the equipment gate (equipmentHasProbe(setup))
// prior    the previous call's nextPrior, or null
// lastRealBtT  optional: the second of the newest REAL BT sample (see "A DYING FEED"
//          in the header for exactly what the chart model passes). Drives
//          btAgeSeconds and the counting/held freshness test when it is a finite
//          number; ignored otherwise.
//
// -> { state, seconds, parts, btAgeSeconds, nextPrior }
//    seconds  counting/held: seconds to 400 F (null when held with no rate);
//             overdue: seconds since BT first reached 400; otherwise null
//    parts    { label, numeral, tag, muted, ariaLabel } for the chip, null when nothing shows
//    btAgeSeconds  how stale the newest REAL BT sample is (0 = this second): measured
//             from lastRealBtT when given, else from the newest non-null temp
export function computeFcEta({ temps, rors, elapsed, marks, hasProbe = false, prior = null, lastRealBtT } = {}) {
  if (!hasProbe) return verdict("hidden", null, null, prior);

  const bt = list(temps);
  const ror = list(rors);
  const m = marks && typeof marks === "object" ? marks : {};
  const idxNow = newestMeasured(bt);
  const now = isNum(elapsed) ? Math.max(0, Math.floor(elapsed)) : Math.max(0, idxNow);
  const btNow = idxNow >= 0 ? bt[idxNow] : null;
  const lastReal = isNum(lastRealBtT) ? Math.round(lastRealBtT) : null;
  const btAge = idxNow >= 0 ? Math.max(0, now - (lastReal !== null ? lastReal : idxNow)) : null;
  const memory = prior && isNum(prior.t) && now >= prior.t ? prior : null;

  const cross = firstRisingCrossing(bt);
  let startedAt = earliest(m.caramelization, cross >= 0 ? cross : null, memory && memory.startedAt);
  if (startedAt === null && now >= TURNAROUND_WINDOW && btNow !== null && btNow >= CARAMELIZATION_F) {
    startedAt = unbrokenRunStart(bt, idxNow);
  }
  const nextPrior = { startedAt, t: now };
  const result = (state, seconds) => verdict(state, seconds, btAge, nextPrior);

  // Marked is marked: presence is what counts, not whether its time parses.
  if (m.firstCrack != null || m.drop != null) return result("resolved", null);
  if (startedAt === null) return result("hidden", null);

  let t400 = firstAtOrAbove(bt, Math.max(0, Math.floor(startedAt)), FC_TARGET_F);
  if (t400 < 0 && btNow !== null && btNow >= FC_TARGET_F) t400 = idxNow;
  if (t400 >= 0) return result("overdue", Math.max(0, now - t400));

  const goodEnd = lastGoodRunEnd(ror);
  const rate = goodEnd >= 0 ? ror[goodEnd] : null;
  const seconds = rate !== null && btNow !== null ? ((FC_TARGET_F - btNow) / rate) * 60 : null;
  // Counting needs the rate good right up to the newest REAL sample and that sample
  // fresh. Without lastRealBtT the newest non-null temp stands in for it and
  // "fresh" means measured this very second (today's rule).
  const rateIsCurrent = goodEnd >= (lastReal !== null ? Math.min(lastReal, now) : now);
  const fresh = btAge !== null && (lastReal !== null ? btAge <= LIVE_GAP_S : btAge === 0);
  return result(rateIsCurrent && fresh ? "counting" : "held", seconds);
}

function verdict(state, seconds, btAgeSeconds, nextPrior) {
  return { state, seconds, parts: etaParts(state, seconds), btAgeSeconds, nextPrior };
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// The whole seconds the chip will actually display, or null for "no number".
const snapped = (seconds) => {
  if (!isNum(seconds)) return null;
  return seconds <= SNAP_ABOVE_S ? Math.round(seconds) : Math.round(seconds / SNAP_S) * SNAP_S;
};

// What the chip shows after the label: "2:05", ">9:59", "+0:12", or NO_ETA.
export function formatEta(seconds, state = "counting") {
  if (state === "overdue") return `+${mmss(isNum(seconds) ? Math.max(0, Math.round(seconds)) : 0)}`;
  const s = snapped(seconds);
  if (s === null) return NO_ETA;
  return s > MAX_SHOWN_S ? ">9:59" : mmss(Math.max(0, s));
}

const spoken = (s) => {
  const m = Math.floor(s / 60);
  const r = s % 60;
  const part = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  return [m ? part(m, "minute") : null, r || !m ? part(r, "second") : null].filter(Boolean).join(" ");
};

// The text parts for a state: null when nothing is shown (hidden, resolved).
//   muted  the chip should look low-confidence: HELD, or a countdown so far out
//          (the numeral reads ">9:59") that it is a hint, not a prediction. Never
//          true for overdue -- that is a count UP from a fact, not an estimate.
export function etaParts(state, seconds) {
  if (state !== "counting" && state !== "held" && state !== "overdue") return null;
  const numeral = formatEta(seconds, state);
  if (state === "overdue") {
    return {
      label: "400°",
      numeral,
      tag: null,
      muted: false,
      ariaLabel: `Bean temperature reached 400 degrees ${spoken(Math.max(0, Math.round(seconds) || 0))} ago and first crack is not marked`,
    };
  }
  const shown = snapped(seconds);
  const farAway = shown !== null && shown > MAX_SHOWN_S;
  // One sentence for the ">9:59" numeral, in either state, so what is heard matches
  // what is seen (the HELD tag still shows; at that distance it hardly matters).
  const about = shown === null ? null : spoken(Math.max(0, shown));
  if (state === "held") {
    return {
      label: "FC IN",
      numeral,
      tag: "HELD",
      muted: true,
      ariaLabel: farAway
        ? FAR_AWAY_ARIA
        : about === null
        ? "First crack estimate not available yet, waiting for a rate of rise"
        : `First crack estimate held at about ${about}, waiting for a steady rate of rise`,
    };
  }
  return {
    label: "FC IN",
    numeral,
    tag: null,
    muted: farAway,
    ariaLabel: farAway ? FAR_AWAY_ARIA : `First crack in about ${about}`,
  };
}
