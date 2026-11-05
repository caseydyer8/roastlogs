// Synthetic roast curves for the first-crack ETA back-test
// (src/lib/fcEta.backtest.test.js). Every number here is invented by a formula:
// there is NO real roast data in this file, and there must never be -- this repo
// is public. Curves are [{ t, bt }] at 1 Hz, the shape a live roast records and a
// saved roast stores.
//
// Not imported by app code, so it is not bundled; CRA's Jest only collects
// *.test.js, so this is not run as a test either.

// Small seeded generator (an LCG) so a "noisy" curve is the same curve every run.
export function seeded(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

const round1 = (v) => Math.round(v * 10) / 10;

// A roast defined by its rate of rise: bt(t + 1) = bt(t) + rate(t) / 60, where
// rate(t) is F/min. `noise` is the half-width of uniform probe noise in F.
export function rateRoast({ start = 200, rate, length, noise = 0, seed = 1 }) {
  const rnd = seeded(seed);
  const curve = [];
  let bt = start;
  for (let t = 0; t < length; t++) {
    curve.push({ t, bt: round1(bt + noise * (rnd() * 2 - 1)) });
    bt += rate(t) / 60;
  }
  return curve;
}

// (0) A straight ramp -- the sanity case: constant RoR is exactly what the
// estimator assumes, so its error should be about nothing.
export function linearRoast({ start = 200, perMin = 25, length = 520 } = {}) {
  return rateRoast({ start, rate: () => perMin, length });
}

// (1) The mock RoastLink device's curve (bridge/test/mock-roastlink.js, the
// T_CHARGE ... TAU block and btAt(), lines 28-66 at the time of writing). Copied
// rather than imported because bridge/ is a separate CommonJS package outside
// Jest's root and the mock does not export it. If the mock's anchors change this
// copy does not follow -- that only matters for what the back-test calls
// "realistic", not for the maths under test.
//
// A six-minute batch: charge at 214, a turnaround low of 196 at 0:42, then an
// exponential climb to 404 at the 6:00 drop. RoR decays from ~35 F/min at 340 F
// to ~18 F/min at 400 F -- the falling-rate case the estimator reads early on.
// The mock adds (Math.random() - 0.5) * 0.6 of probe noise; this uses a seeded
// +/-0.3 and rounds to 0.1 like the device frame (bt: +bt.toFixed(1)).
const MOCK = { T_CHARGE: 214, T_MIN: 196, T_MIN_AT: 42, T_END: 404, DROP_AT: 360, TAU: 210 };
export function mockDeviceBt(t) {
  const { T_CHARGE, T_MIN, T_MIN_AT, T_END, DROP_AT, TAU } = MOCK;
  const climbNorm = 1 - Math.exp(-(DROP_AT - T_MIN_AT) / TAU);
  if (t <= 0) return T_CHARGE;
  if (t < T_MIN_AT) {
    const k = 1 - t / T_MIN_AT;
    return T_CHARGE - (T_CHARGE - T_MIN) * (1 - k * k);
  }
  return T_MIN + ((T_END - T_MIN) * (1 - Math.exp(-(t - T_MIN_AT) / TAU))) / climbNorm;
}
export function mockDeviceRoast({ seed = 1, noise = 0.3, length = MOCK.DROP_AT + 1 } = {}) {
  const rnd = seeded(seed);
  return Array.from({ length }, (_, t) => ({ t, bt: round1(mockDeviceBt(t) + noise * (rnd() * 2 - 1)) }));
}

// (2) A slow stall: the smooth "truth" curve from src/lib/curveSmoothing.test.js.
// It heads for 410 F and its RoR is under ROR_MIN well before it gets near 400,
// so the estimator spends the whole late roast HELD. Report-only -- there is no
// honest "right answer" to gate on, only the promise that the number stays.
export function stallBt(t) {
  return 200 + 210 * (1 - Math.exp(-t / 260)) - 40 * Math.exp(-t / 25);
}
export function stallRoast({ noise = 0.3, seed = 3, length = 900 } = {}) {
  const rnd = seeded(seed);
  return Array.from({ length }, (_, t) => ({ t, bt: round1(stallBt(t) + noise * (rnd() * 2 - 1)) }));
}

// (3) A scripted heat cut: 30 F/min up to ~370 F at t = 300, then the roaster is
// backed off -- RoR swings to -15 F/min and stays negative for 20 s -- and
// recovers to 30 F/min. The case the "never disappears" promise is about.
export function heatCutRoast({ cutAt = 300, hold = 20, noise = 0.2, seed = 5, length = 430 } = {}) {
  const rate = (t) => {
    const u = t - cutAt;
    if (u < 0) return 30;
    if (u < 5) return 30 - 9 * u; // 30 -> -15 over 5 s
    if (u < 5 + hold) return -15;
    if (u < 10 + hold) return -15 + 9 * (u - 5 - hold); // -15 -> 30 over 5 s
    return 30;
  };
  return rateRoast({ start: 220, rate, length, noise, seed });
}

// A dropout: no samples in [from, to), the way a lost RoastLink feed leaves a
// gap rather than a flat line.
export const withDropout = (curve, from, to) => curve.filter((p) => p.t < from || p.t >= to);

// A bridge that joined late: nothing was recorded before `at`.
export const joinedAt = (curve, at) => curve.filter((p) => p.t >= at);

// (5) A hot charge, a feed dropout, then a late rejoin: the probe reads `chargeF`
// for the first few seconds, goes quiet at `dropAt`, and comes back at `rejoinAt`
// already at 345 F climbing 25 F/min. The charge belongs to a run that ended four
// minutes earlier -- it must not become the chip's "reached 400" origin.
export function hotChargeRejoinRoast({
  chargeF = 420,
  dropAt = 9,
  rejoinAt = 250,
  rejoinF = 345,
  perMin = 25,
  length = 420,
} = {}) {
  return Array.from({ length }, (_, t) => ({ t, bt: t < dropAt ? chargeF : round1(rejoinF + (perMin * (t - rejoinAt)) / 60) })).filter(
    (p) => p.t < dropAt || p.t >= rejoinAt
  );
}
