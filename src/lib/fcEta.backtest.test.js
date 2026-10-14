import fs from "fs";
import { buildLiveChartModel } from "../components/charts/LiveRoastChart";
import { phaseBoundaries } from "./roastPhases";
import { LIVE_GAP_S } from "./liveSample";
import { MAX_ROAST_S } from "./limits";
import { smoothSeries } from "./curveSmoothing";
import { computeFcEta, FC_TARGET_F } from "./fcEta";
import { fixtureGhostSourceRow } from "../../e2e/fixtures";
import {
  linearRoast,
  mockDeviceRoast,
  stallRoast,
  heatCutRoast,
  withDropout,
  joinedAt,
  hotChargeRejoinRoast,
} from "./__fixtures__/syntheticRoasts";

// ---------------------------------------------------------------------------
// Back-test for the first-crack ETA: replay a recorded roast as a fake LIVE feed,
// one second at a time, and compare what the chip would have said with what
// happened.
//
// METHOD. At each second s the harness hands buildLiveChartModel only what the
// app would hold at that moment -- the samples with t <= s, a roastLog holding
// the CARAMELIZATION entry the temperature ladder would have logged, elapsed = s
// -- and feeds the model's own smoothed temp and RoR rows to computeFcEta. That is
// the path the live chart takes. Truth is the second the (centred-)smoothed BT
// first reaches 400 F. Error = predicted - actual, so NEGATIVE means the chip
// said "sooner" than it happened.
//
// TOLERANCES ARE LOOSE ON PURPOSE, and they come from the synthetic model itself:
// the mock-device formula is the same family of curve the estimator was reasoned
// about on, so this proves "no gross error and no regression", NOT "accurate on
// a real Razzo". On the mock-device roast it measures about -9 s at T-60 and
// -2..-3 s at T-30 (it reads early while RoR is falling); the gates are 15 and 8.
// T-120 and T-90 are printed but not gated -- a constant-rate rule is early by
// design that far out (about -30 s at T-120). The real gate is A7: the same
// harness on real SR540 + Razzo roasts (RL_BACKTEST_FILE, below).
//
// NO REAL ROAST DATA lives in this file or in __fixtures__. Real results are
// private: never paste them into this public repo.
// ---------------------------------------------------------------------------

jest.setTimeout(120000);

const VISIBLE = new Set(["counting", "held", "overdue"]);
const OFFSETS = [120, 90, 60, 30];
const report = [];

// What the live ladder (App.js LADDER_STEPS) would have logged by now: a RISING
// crossing of 340 F between two samples no more than LIVE_GAP_S apart, stamped at
// the interpolated second. After a gap the ladder re-seeds and fires nothing.
function ladderLog(prefix) {
  let prev = null;
  for (const p of prefix) {
    if (prev && p.t - prev.t > LIVE_GAP_S) prev = null;
    if (prev && prev.bt < 340 && p.bt >= 340) {
      const frac = (340 - prev.bt) / (p.bt - prev.bt);
      const t = Math.round(prev.t + frac * (p.t - prev.t));
      return [{ type: "phase", label: "CARAMELIZATION", t, temp: "340" }];
    }
    prev = p;
  }
  return [];
}

// Replay `curve` second by second. `logAt(prefix, s)` says what the roastLog
// holds at that moment; `usePrior: false` throws the memory away every second,
// which is what a reload does.
function replay(curve, { fromS = 0, toS, logAt = (prefix) => ladderLog(prefix), usePrior = true } = {}) {
  const last = toS === undefined ? curve[curve.length - 1].t : toS;
  const rows = [];
  let prior = null;
  let k = 0;
  for (let s = 0; s <= last; s++) {
    while (k < curve.length && curve[k].t <= s) k++;
    if (s < fromS) continue;
    const prefix = curve.slice(0, k);
    const roastLog = logAt(prefix, s);
    const model = buildLiveChartModel({ curve: prefix, roastLog, elapsedSeconds: s });
    const r = computeFcEta({
      temps: model.data.map((d) => d.temp),
      rors: model.data.map((d) => d.ror),
      elapsed: s,
      marks: phaseBoundaries(roastLog),
      hasProbe: true,
      prior: usePrior ? prior : null,
      // The second of the newest REAL sample, which is what the chart model will
      // pass once it is wired in (see the fcEta.js header). The model's own RoR still
      // carries the last reading into the trailing seconds, so this harness cannot
      // yet reproduce the real-only RoR that contract asks for.
      lastRealBtT: prefix.length ? Math.round(prefix[prefix.length - 1].t) : undefined,
    });
    prior = r.nextPrior;
    rows.push({ s, state: r.state, seconds: r.seconds, btAge: r.btAgeSeconds });
  }
  return rows;
}
const rowAt = (rows, s) => rows.find((r) => r.s === s);

// The second the smoothed BT first reaches 400 -- the harness's own definition of
// "first crack" for a curve with none marked.
function crossing400(curve) {
  const raw = [];
  curve.forEach((p) => {
    raw[Math.round(p.t)] = p.bt;
  });
  const dense = Array.from({ length: raw.length }, (_, i) => (raw[i] === undefined ? null : raw[i]));
  return smoothSeries(dense, 2).findIndex((v) => v != null && v >= FC_TARGET_F);
}

// Error (s) at T-120/-90/-60/-30, or null where the chip showed no number.
function errorsFor(rows, t400) {
  return OFFSETS.map((x) => {
    const r = rowAt(rows, t400 - x);
    return r && VISIBLE.has(r.state) && r.seconds !== null ? r.seconds - x : null;
  });
}
const f1 = (v) => (v === null ? "  n/a" : (v >= 0 ? "+" : "") + v.toFixed(1));
const tableRow = (name, t400, errs, note = "") =>
  `${name.padEnd(30)} t400=${String(t400).padStart(4)}  ` + errs.map((e, i) => `T-${OFFSETS[i]}: ${f1(e).padStart(6)}`).join("  ") + (note ? `   ${note}` : "");
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// "The number never disappears": from the moment caramelization is known until
// `toS` (the 400 F crossing, where the answer is in; default: the end of the replay)
// the chip is up and has a finite number -- except for `noRateWindow` seconds right
// after a late bridge join, when no RoR exists yet. Refuses to pass on an empty
// window, so a gate that stopped looking at anything cannot go green.
function expectNeverDisappears(rows, { fromS, toS = Infinity, noRateWindow = 0 }) {
  const inRange = rows.filter((r) => r.s >= fromS && r.s <= toS);
  expect(inRange.length).toBeGreaterThan(0);
  const bad = inRange.filter(
    (r) =>
      !VISIBLE.has(r.state) ||
      (r.seconds === null && r.s >= fromS + noRateWindow) ||
      (r.seconds !== null && !Number.isFinite(r.seconds))
  );
  expect(bad.slice(0, 3)).toEqual([]);
}
const firstTriggerS = (curve) => {
  for (let s = 0; s <= curve[curve.length - 1].t; s++) {
    if (ladderLog(curve.filter((p) => p.t <= s)).length) return s;
  }
  return -1;
};

afterAll(() => {
  // eslint-disable-next-line no-console
  console.log(
    "FC ETA back-test: error = predicted - actual seconds before the smoothed BT first reaches 400 F (negative = chip said sooner)\n" +
      report.join("\n")
  );
});

// ---------------------------------------------------------------------------

describe("FC ETA back-test: synthetic roasts", () => {
  it("(0) a straight ramp is read almost exactly", () => {
    const curve = linearRoast();
    const rows = replay(curve);
    const t400 = crossing400(curve);
    const errs = errorsFor(rows, t400);
    report.push(tableRow("(0) linear 25 F/min", t400, errs, "gate |err| <= 5"));
    errs.forEach((e) => {
      expect(e).not.toBeNull();
      expect(Math.abs(e)).toBeLessThanOrEqual(5);
    });
    expectNeverDisappears(rows, { fromS: firstTriggerS(curve), toS: t400 });
  });

  it("(1) mock-device roast, 20 seeds: bounded error at T-60 and T-30, reading early not late", () => {
    const at60 = [];
    const at30 = [];
    for (let seed = 1; seed <= 20; seed++) {
      const curve = mockDeviceRoast({ seed });
      const rows = replay(curve, { fromS: 150 });
      const t400 = crossing400(curve);
      const errs = errorsFor(rows, t400);
      if (seed <= 3) report.push(tableRow(`(1) mock device seed ${seed}`, t400, errs));
      expectNeverDisappears(rows, { fromS: firstTriggerS(curve), toS: t400 });
      // The chip must have a number at both gated points, or the gate is vacuous.
      expect(errs[2]).not.toBeNull();
      expect(errs[3]).not.toBeNull();
      at60.push(errs[2]);
      at30.push(errs[3]);
      expect(Math.abs(errs[2])).toBeLessThanOrEqual(15);
      expect(Math.abs(errs[3])).toBeLessThanOrEqual(8);
    }
    report.push(
      `(1) mock device, 20 seeds       mean T-60: ${f1(mean(at60))}  (worst ${f1(at60.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)))})` +
        `   mean T-30: ${f1(mean(at30))}  (worst ${f1(at30.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)))})   gate |err| <= 15 / 8, mean <= 0`
    );
    expect(mean(at60)).toBeLessThanOrEqual(0);
    expect(mean(at30)).toBeLessThanOrEqual(0);
  });

  it("(1b) a roast with no CARAMELIZATION entry (stored-curve crossing only) reads the same", () => {
    const curve = mockDeviceRoast({ seed: 2 });
    const t400 = crossing400(curve);
    const withLadder = errorsFor(replay(curve, { fromS: 150 }), t400);
    const noEntry = errorsFor(replay(curve, { fromS: 150, logAt: () => [] }), t400);
    expect(noEntry).toEqual(withLadder);
  });

  it("(1c) a reload every second (no memory carried) changes nothing", () => {
    const curve = mockDeviceRoast({ seed: 4 });
    const kept = replay(curve, { fromS: 150 });
    const reloaded = replay(curve, { fromS: 150, usePrior: false });
    expect(reloaded.map((r) => [r.state, r.seconds])).toEqual(kept.map((r) => [r.state, r.seconds]));
  });

  it("(4) the e2e ghost-source ramp: the chip follows the straight-line extrapolation", () => {
    // 200 + t/4 F, i.e. 15 F/min with integer-step quantisation, ending at 365 F
    // at t = 660: it never reaches 400, but the straight line would at t = 800.
    const curve = fixtureGhostSourceRow.curve;
    const rows = replay(curve, { fromS: 520 });
    const probes = [600, 660].map((s) => {
      const r = rowAt(rows, s);
      return { s, state: r.state, err: r.seconds - (800 - s) };
    });
    report.push(`(4) e2e fixture ramp           ${probes.map((p) => `s=${p.s}: ${p.state} ${f1(p.err)}`).join("   ")}   gate |err| <= 8`);
    probes.forEach((p) => {
      expect(p.state).toBe("counting");
      expect(Math.abs(p.err)).toBeLessThanOrEqual(8);
    });
    expectNeverDisappears(rows, { fromS: firstTriggerS(curve) });
  });

  it("(2) a slow stall: report only, and the number stays", () => {
    const curve = stallRoast();
    const rows = replay(curve);
    const t400 = crossing400(curve);
    report.push(tableRow("(2) slow stall", t400, errorsFor(rows, t400), "report only"));
    expect(rows.filter((r) => r.state === "held").length).toBeGreaterThan(30); // it really stalled
    expectNeverDisappears(rows, { fromS: firstTriggerS(curve) });
  });

  it("(3) a scripted heat cut (RoR below 0 for 20 s at ~370 F): the number stays", () => {
    const curve = heatCutRoast();
    const rows = replay(curve);
    const t400 = crossing400(curve);
    report.push(tableRow("(3) heat cut at 370 F", t400, errorsFor(rows, t400), "report only"));
    // Non-vacuity: the chip really did go HELD through the cut.
    expect(rows.filter((r) => r.state === "held").length).toBeGreaterThanOrEqual(10);
    expectNeverDisappears(rows, { fromS: firstTriggerS(curve) });
  });
});

describe("FC ETA back-test: the number never disappears", () => {
  it("through a feed dropout: held on the last real BT, then back, never absurd", () => {
    const curve = withDropout(mockDeviceRoast({ seed: 1 }), 300, 312);
    const rows = replay(curve);
    expectNeverDisappears(rows, { fromS: firstTriggerS(curve) });
    // Once the 6 s carry is spent the newest second is unmeasured: held, from a
    // measured BT, and nowhere near the 400/rate answer a null would give.
    const quiet = rows.filter((r) => r.s >= 307 && r.s < 312);
    expect(quiet.length).toBeGreaterThan(0);
    quiet.forEach((r) => {
      expect(r.state).toBe("held");
      expect(r.btAge).toBeGreaterThan(0);
      expect(r.seconds).toBeGreaterThan(0);
      expect(r.seconds).toBeLessThan(120);
    });
    // And it recovers: RoR is blind for ~20 s after a dropout, then counting resumes.
    const t400 = crossing400(curve);
    expect(rowAt(rows, t400 - 5).state).toBe("counting");
    report.push(tableRow("dropout 300-312 s", t400, errorsFor(rows, t400), "report only"));
  });

  it("a feed that dies for good: the age follows the real clock and it goes HELD, frozen", () => {
    // The model repeats the last reading for LIVE_GAP_S after the feed dies. The age
    // must still count from the last REAL sample, and the chip must leave "counting"
    // once the carry is spent -- on a number that then stays put.
    const curve = mockDeviceRoast({ seed: 1 }).filter((p) => p.t <= 300);
    const rows = replay(curve, { fromS: 250, toS: 340 });
    expect(rowAt(rows, 300)).toEqual(expect.objectContaining({ state: "counting", btAge: 0 }));
    expect(rowAt(rows, 304)).toEqual(expect.objectContaining({ state: "counting", btAge: 4 }));
    expect(rowAt(rows, 300 + LIVE_GAP_S)).toEqual(expect.objectContaining({ state: "counting", btAge: LIVE_GAP_S }));
    for (let s = 300 + LIVE_GAP_S + 1; s <= 340; s++) {
      expect(rowAt(rows, s)).toEqual(expect.objectContaining({ state: "held", btAge: s - 300 }));
    }
    expect(rowAt(rows, 340).seconds).toBe(rowAt(rows, 307).seconds);
    expect(rowAt(rows, 340).seconds).toBeGreaterThan(0);
    expect(rowAt(rows, 340).seconds).toBeLessThan(120); // the last real BT was ~380 F
    expectNeverDisappears(rows, { fromS: firstTriggerS(curve) });
  });

  it("(5) a hot charge, a dropout, then a rejoin at 345 F: never 'overdue' before it is", () => {
    const curve = hotChargeRejoinRoast();
    // From the rejoin on. (While the feed is still dead, t = 240..249, the stale 420 F
    // still reads as a late join -- a known limit, see the fcEta.js header.)
    const rows = replay(curve, { fromS: 250 });
    // Truth is the climb after the rejoin; the 420 F charge is not a 400 F crossing.
    const t400 = crossing400(curve.filter((p) => p.t >= 250));
    const errs = errorsFor(rows, t400);
    report.push(tableRow("(5) hot charge, dropout, rejoin", t400, errs, "gate |err| <= 5 at T-60/T-30"));
    expect(t400).toBeGreaterThan(250);
    // The 420 F charge must not stand in for the 400 F crossing the roast has not reached.
    expect(rows.filter((r) => r.s < t400 && r.state === "overdue")).toEqual([]);
    // From the rejoin on the chip is up; only the no-rate window (RoR needs 16 samples) is blank.
    expectNeverDisappears(rows, { fromS: 250, toS: t400, noRateWindow: 16 });
    expect(errs[2]).not.toBeNull();
    expect(errs[3]).not.toBeNull();
    expect(Math.abs(errs[2])).toBeLessThanOrEqual(5);
    expect(Math.abs(errs[3])).toBeLessThanOrEqual(5);
  });

  it("when the bridge joins late, after caramelization: only the no-rate window is blank", () => {
    const curve = joinedAt(mockDeviceRoast({ seed: 1 }), 260);
    const rows = replay(curve, { fromS: 240 });
    expect(rowAt(rows, 259).state).toBe("hidden"); // nothing measured yet
    expectNeverDisappears(rows.filter((r) => r.s >= 260), { fromS: 260, noRateWindow: 16 });
    const blank = rows.filter((r) => r.s >= 260 && r.seconds === null).length;
    expect(blank).toBeGreaterThan(0); // the window is real, not hypothetical
    const t400 = crossing400(curve);
    report.push(tableRow("late join at 260 s", t400, errorsFor(rows, t400), `report only; blank ${blank} s`));
  });
});

// ---------------------------------------------------------------------------
// A7 hook: the same harness on REAL roasts. Skipped unless RL_BACKTEST_FILE points
// at a Settings -> Export JSON backup. Keep that file OUTSIDE this repo; results
// stay in the private ops ledger.
//   RL_BACKTEST_FILE=/path/roastlogs-backup-....json npm run test:unit -- fcEta.backtest
// Pass bar (from the plan): >= 3 razzo-v5t roasts reach 400 F, median |error| at
// T-60 <= 15 s, none worse than 30 s, and no gap between the trigger and FC.
// Error against the roast's own FIRST CRACK mark is printed for information.
// ---------------------------------------------------------------------------
const REAL_FILE = process.env.RL_BACKTEST_FILE;
(REAL_FILE ? describe : describe.skip)("FC ETA back-test: real roasts (RL_BACKTEST_FILE)", () => {
  it("replays every razzo-v5t roast that has a curve", () => {
    const backup = JSON.parse(fs.readFileSync(REAL_FILE, "utf8"));
    const roasts = (Array.isArray(backup.roastSessions) ? backup.roastSessions : []).filter(
      (r) => r && r.equipment && r.equipment.setup === "razzo-v5t" && Array.isArray(r.curve)
    );
    const rowsOut = [];
    // The replay indexes one row per second up to the largest t it is handed, so a
    // hand-edited or corrupt export (t = 1e9) must not size anything: points with
    // t < 0 or t > MAX_ROAST_S (and anything that is not a finite number pair) are
    // dropped, and counted so a quietly mangled file is visible in the output.
    let dropped = 0;
    roasts.forEach((r, i) => {
      const curve = r.curve
        .filter((p) => p && typeof p.t === "number" && typeof p.bt === "number")
        .map((p) => ({ t: Math.round(p.t), bt: p.bt }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.bt) && p.t >= 0 && p.t <= MAX_ROAST_S)
        .sort((a, b) => a.t - b.t);
      dropped += r.curve.length - curve.length;
      if (curve.length < 60) return;
      // The log as the live app held it at second s: only what had happened by then.
      const saved = (Array.isArray(r.roastLog) ? r.roastLog : []).filter(
        (e) => e && e.type === "phase" && ["CARAMELIZATION", "FIRST CRACK", "COOLING START"].includes(e.label)
      );
      const logAt = (_prefix, s) => saved.filter((e) => Number(e.t) <= s);
      const fc = saved.find((e) => e.label === "FIRST CRACK");
      const t400 = crossing400(curve);
      const rows = replay(curve, { logAt });
      const trigger = rows.find((x) => x.state !== "hidden");
      const stop = fc ? Number(fc.t) : t400 >= 0 ? t400 : Infinity;
      const gaps = trigger
        ? rows.filter((x) => x.s >= trigger.s && x.s < stop && (!VISIBLE.has(x.state) || x.seconds === null)).length
        : 0;
      const errs = t400 >= 0 ? errorsFor(rows, t400) : [null, null, null, null];
      rowsOut.push({ errs, gaps, reached: t400 >= 0 });
      report.push(
        tableRow(`real roast #${i + 1}`, t400, errs, `gap s: ${gaps}${fc && t400 >= 0 ? `  FC mark vs 400 crossing: ${Number(fc.t) - t400}` : ""}`)
      );
    });
    const reached = rowsOut.filter((x) => x.reached && x.errs[2] !== null);
    const abs60 = reached.map((x) => Math.abs(x.errs[2])).sort((a, b) => a - b);
    const median = abs60.length ? abs60[Math.floor(abs60.length / 2)] : null;
    report.push(`real roasts: dropped ${dropped} curve point(s) (t outside 0..${MAX_ROAST_S} s, or not a finite number pair)`);
    report.push(`real roasts: ${rowsOut.length} replayed, ${reached.length} reached 400 F with a T-60 reading, median |err| at T-60: ${median === null ? "n/a" : median.toFixed(1)} s`);
    expect(reached.length).toBeGreaterThanOrEqual(3);
    expect(median).toBeLessThanOrEqual(15);
    expect(abs60[abs60.length - 1]).toBeLessThanOrEqual(30);
    rowsOut.forEach((x) => expect(x.gaps).toBe(0));
  });
});
