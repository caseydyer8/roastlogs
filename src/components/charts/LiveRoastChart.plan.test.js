import { buildLiveChartModel, GHOST_CAPTION } from "./LiveRoastChart";
import { LIVE_GAP_S } from "../../lib/liveSample";
import { smoothSeries, rorSeries } from "../../lib/curveSmoothing";
import { NO_ETA } from "../../lib/fcEta";

// Source roast: 1 Hz curve rising 200 -> 300F over 100s, with milestones.
const curve = Array.from({ length: 101 }, (_, t) => ({ t, bt: 200 + t }));
const plan = {
  curve,
  milestones: [
    { label: "YELLOWING", t: 40, temp: 240 },
    { label: "FIRST CRACK", t: 80, temp: 280 },
    { label: "COOLING START", t: 100, temp: 300 },
    { label: "SOMETHING ELSE", t: 50, temp: 250 }, // not a chart marker
  ],
};
const live = Array.from({ length: 21 }, (_, t) => ({ t, bt: 190 + t }));
const base = { curve: live, roastLog: [], profile: null, elapsedSeconds: 20 };

describe("buildLiveChartModel with a plan", () => {
  it("is unchanged without a plan: no ghost, no lookahead, rows stop at now", () => {
    const m = buildLiveChartModel(base);
    expect(m.planMarkers).toEqual([]);
    expect(m.lookahead).toBe(0);
    expect(m.data).toHaveLength(21);
    expect(m.data.some((d) => d.planTemp != null)).toBe(false);
  });

  it("draws the source curve as a ghost and looks 30s past now", () => {
    const m = buildLiveChartModel({ ...base, plan });
    expect(m.lookahead).toBe(30);
    expect(m.data.length).toBeGreaterThanOrEqual(101); // extended to the end of the plan
    expect(m.data[10].planTemp).toBeCloseTo(210, 0);
    expect(m.data[20].temp).toBeDefined(); // live curve unchanged (edge point is a short average)
    expect(Math.abs(m.data[20].temp - 210)).toBeLessThanOrEqual(1.5);
    // Beyond "now" only the ghost has values.
    expect(m.data[60].temp).toBeNull();
    expect(m.data[60].planTemp).toBeCloseTo(260, 0);
  });

  it("marks only the milestones the chart has tags for", () => {
    const m = buildLiveChartModel({ ...base, plan });
    expect(m.planMarkers.map((x) => x.tag)).toEqual(["Y", "FC", "DROP"]);
    expect(m.planEnd).toBe(100);
  });

  it("supports a plan that has milestones but no curve (source roast deleted)", () => {
    const m = buildLiveChartModel({ ...base, plan: { curve: [], milestones: plan.milestones } });
    expect(m.planMarkers).toHaveLength(3);
    expect(m.data.some((d) => d.planTemp != null)).toBe(false);
  });

  it("drops the ghost once the roast is dropped", () => {
    const roastLog = [{ type: "phase", label: "COOLING START", t: 18, temp: "" }];
    const m = buildLiveChartModel({ ...base, roastLog, plan });
    expect(m.planMarkers).toEqual([]);
    expect(m.lookahead).toBe(0);
  });
});

// The "why is there no ghost" status. `ghost` is what the plan can draw;
// `ghostReason` is why not (null whenever a ghost line is drawn, or there is no
// plan). The caption shows exactly when ghostReason is non-null.
describe("buildLiveChartModel ghost status", () => {
  const found = { ...plan, source: "found" };

  it("drawn: 2+ valid curve points -> no reason", () => {
    for (const source of ["found", "missing", "none", undefined]) {
      const m = buildLiveChartModel({ ...base, plan: { ...plan, source } });
      expect(m.ghost).toBe("drawn");
      expect(m.ghostReason).toBeNull();
    }
  });

  it("markers-only when the source roast is not on this device", () => {
    const m = buildLiveChartModel({ ...base, plan: { curve: [], milestones: plan.milestones, source: "missing" } });
    expect(m.ghost).toBe("markers-only");
    expect(m.ghostReason).toBe("source-missing");
    expect(m.planMarkers).toHaveLength(3);
    expect(m.lookahead).toBe(30); // markers-only keeps today's lookahead
  });

  it("markers-only when the source roast is found but has a single curve point", () => {
    const m = buildLiveChartModel({ ...base, plan: { curve: [{ t: 5, bt: 250 }], milestones: plan.milestones, source: "found" } });
    expect(m.ghost).toBe("markers-only");
    expect(m.ghostReason).toBe("source-no-curve");
    expect(m.lookahead).toBe(30);
  });

  it("none: nothing drawable and no source -> no-source, and no extra rows or lookahead", () => {
    const m = buildLiveChartModel({ ...base, plan: { curve: [], milestones: [], source: "none" } });
    expect(m.ghost).toBe("none");
    expect(m.ghostReason).toBe("no-source");
    expect(m.lookahead).toBe(0);
    expect(m.planEnd).toBe(0);
    expect(m.planMarkers).toEqual([]);
    expect(m.data).toHaveLength(21); // rows stop at now, same as no plan
    expect(m.data.some((d) => d.planTemp != null)).toBe(false);
  });

  it("none: found source with no curve and no milestones -> source-no-curve, lookahead 0", () => {
    const m = buildLiveChartModel({ ...base, plan: { curve: [], milestones: [], source: "found" } });
    expect(m.ghost).toBe("none");
    expect(m.ghostReason).toBe("source-no-curve");
    expect(m.lookahead).toBe(0);
    expect(m.data).toHaveLength(21);
  });

  it("none: missing source -> source-missing", () => {
    const m = buildLiveChartModel({ ...base, plan: { curve: [], milestones: [], source: "missing" } });
    expect(m.ghost).toBe("none");
    expect(m.ghostReason).toBe("source-missing");
  });

  it("counts valid points from the same map the ghost draws: NaN bt does not count", () => {
    const bad = [{ t: 0, bt: NaN }, { t: 1, bt: NaN }, { t: 2, bt: NaN }];
    const m = buildLiveChartModel({ ...base, plan: { curve: bad, milestones: [], source: "found" } });
    expect(m.ghost).toBe("none");
    expect(m.ghostReason).toBe("source-no-curve");
  });

  it("counts distinct rounded seconds: two readings in one second are one point", () => {
    const dup = [{ t: 10.2, bt: 250 }, { t: 10.4, bt: 251 }];
    const m = buildLiveChartModel({ ...base, plan: { curve: dup, milestones: [], source: "found" } });
    expect(m.ghost).toBe("none");
    expect(m.ghostReason).toBe("source-no-curve");
  });

  it("two valid points are enough to draw", () => {
    const two = [{ t: 0, bt: 200 }, { t: 30, bt: 230 }];
    const m = buildLiveChartModel({ ...base, plan: { curve: two, milestones: [], source: "found" } });
    expect(m.ghost).toBe("drawn");
    expect(m.ghostReason).toBeNull();
  });

  it("a milestone with a non-numeric t or no chart tag does not make markers-only", () => {
    const milestones = [{ label: "YELLOWING", t: "x" }, { label: "SOMETHING ELSE", t: 50 }];
    const m = buildLiveChartModel({ ...base, plan: { curve: [], milestones, source: "found" } });
    expect(m.ghost).toBe("none");
    expect(m.ghostReason).toBe("source-no-curve");
    expect(m.lookahead).toBe(0);
  });

  it("after DROP the status is unchanged while markers and lookahead still drop", () => {
    const roastLog = [{ type: "phase", label: "COOLING START", t: 18, temp: "" }];
    const missing = buildLiveChartModel({ ...base, roastLog, plan: { curve: [], milestones: plan.milestones, source: "missing" } });
    expect(missing.ghost).toBe("markers-only");
    expect(missing.ghostReason).toBe("source-missing");
    expect(missing.planMarkers).toEqual([]);
    expect(missing.lookahead).toBe(0);

    const drawn = buildLiveChartModel({ ...base, roastLog, plan: found });
    expect(drawn.ghost).toBe("drawn");
    expect(drawn.ghostReason).toBeNull();
    expect(drawn.planMarkers).toEqual([]);
  });

  it("no plan (no profile followed) -> none with no reason", () => {
    for (const noPlan of [null, undefined]) {
      const m = buildLiveChartModel({ ...base, plan: noPlan });
      expect(m.ghost).toBe("none");
      expect(m.ghostReason).toBeNull();
    }
  });

  it("a plan with no source field gets no reason rather than a guessed one", () => {
    const m = buildLiveChartModel({ ...base, plan: { curve: [], milestones: [] } });
    expect(m.ghost).toBe("none");
    expect(m.ghostReason).toBeNull();
  });
});

describe("GHOST_CAPTION", () => {
  it("has the exact wording for every reason the model can return", () => {
    expect(GHOST_CAPTION).toEqual({
      "no-source": "No ghost \u00b7 no source roast",
      "source-missing": "No ghost \u00b7 source roast not on this device",
      "source-no-curve": "No ghost \u00b7 source roast has no curve",
    });
  });
});

// RL-027: the ghost stays a gap where the source roast's probe was out. The
// model has always emitted null there, so this only guards that (and the short
// bridging next to it). Whether the dashed LINE then breaks is decided when it
// is drawn, and is covered in the browser: "ghost breaks across a probe gap" in
// e2e/app.spec.js.
describe("buildLiveChartModel ghost across a probe gap", () => {
  const longCurve = Array.from({ length: 301 }, (_, t) => ({ t, bt: 200 + t / 2 }));
  // The source curve with seconds `from`..`to` (inclusive) never recorded.
  const withHole = (from, to) => ({ curve: longCurve.filter((p) => p.t < from || p.t > to), milestones: [] });
  const rows = (m, from, to) => m.data.slice(from, to + 1).map((d) => d.planTemp);

  it("a 20 s hole stays null, and the seconds either side of it are drawn", () => {
    const m = buildLiveChartModel({ ...base, plan: withHole(200, 219) });
    expect(rows(m, 200, 219).every((v) => v === null)).toBe(true);
    expect(m.data[199].planTemp).not.toBeNull();
    expect(m.data[220].planTemp).not.toBeNull();
  });

  it("a 5 s hole is bridged with a straight run", () => {
    const m = buildLiveChartModel({ ...base, plan: withHole(200, 204) });
    expect(rows(m, 200, 204).every((v) => v != null)).toBe(true);
  });

  it("the bridge ends at LIVE_GAP_S: a hole of that many seconds is filled, one second more is not", () => {
    const at = (len) => buildLiveChartModel({ ...base, plan: withHole(200, 200 + len - 1) });
    expect(rows(at(LIVE_GAP_S), 200, 200 + LIVE_GAP_S - 1).every((v) => v != null)).toBe(true);
    expect(rows(at(LIVE_GAP_S + 1), 200, 200 + LIVE_GAP_S).every((v) => v === null)).toBe(true);
  });
});

// RL-030: every time the model sizes its rows by is bounded. It builds one row
// per second up to the largest t it is handed, so a damaged or hand-edited t of
// 1e9 froze the tab and one of 2^32 or more threw a RangeError out of render.
// The bound is 7200 s (src/lib/limits.js): the ledger text said ~1800, but a
// normal SR540 roast is far under either, and 7200 matches the milestone cap in
// profileFromRoast.js. The "huge" values below are 1e6, not the 1e9 of the bug
// report: against unbounded code 1e9 would not fail this suite, it would hang it
// (the browser test in e2e/app.spec.js uses the real 1e9).
describe("buildLiveChartModel bounds every time it sizes rows by", () => {
  const MAX_S = 7200;
  const MAX_ROWS = MAX_S + 30 + 1; // 7200 s of roast, the 30 s lookahead, and row 0
  const milestoneAt = (t) => ({ curve, milestones: [{ label: "CARAMELIZATION", t, temp: 300 }] });

  it("a source curve point at t = 2^32 does not throw, and the rest of the ghost is intact", () => {
    const huge = { ...plan, curve: [...curve, { t: 2 ** 32, bt: 400 }] };
    let m;
    expect(() => { m = buildLiveChartModel({ ...base, plan: huge }); }).not.toThrow();
    expect(m.planEnd).toBeLessThanOrEqual(MAX_S);
    expect(m.data.length).toBeLessThanOrEqual(MAX_ROWS);
    expect(m.data[60].planTemp).toBeCloseTo(260, 0);
  });

  it("a source curve point far past the bound does not stretch the chart", () => {
    const m = buildLiveChartModel({ ...base, plan: { ...plan, curve: [...curve, { t: 1e6, bt: 400 }] } });
    expect(m.planEnd).toBeLessThanOrEqual(MAX_S);
    expect(m.data.length).toBeLessThanOrEqual(MAX_ROWS);
  });

  // "Ignored" means ignored: a point outside 0..7200 is not a reading, so it must
  // not count towards the two points a ghost needs.
  it.each([-5, MAX_S + 1, 1e6])("a source curve point at t = %p is ignored, so one real point is still no ghost", (t) => {
    const m = buildLiveChartModel({ ...base, plan: { curve: [{ t: 10, bt: 200 }, { t, bt: 210 }], milestones: [], source: "found" } });
    expect(m.ghost).toBe("none");
    expect(m.ghostReason).toBe("source-no-curve");
  });

  it("a stored clock of 1e6 s does not make a million rows", () => {
    const m = buildLiveChartModel({ ...base, elapsedSeconds: 1e6 });
    expect(m.total).toBeLessThanOrEqual(MAX_S);
    expect(m.data.length).toBeLessThanOrEqual(MAX_ROWS);
  });

  it("a live curve point at t = 1e6 does not make a million rows", () => {
    const m = buildLiveChartModel({ ...base, curve: [...live, { t: 1e6, bt: 300 }] });
    expect(m.total).toBeLessThanOrEqual(MAX_S);
    expect(m.data.length).toBeLessThanOrEqual(MAX_ROWS);
  });

  it("a DROP logged at t = 1e6 does not make a million rows", () => {
    const roastLog = [{ type: "phase", label: "COOLING START", t: 1e6, temp: "" }];
    const m = buildLiveChartModel({ ...base, roastLog });
    expect(m.total).toBeLessThanOrEqual(MAX_S);
    expect(m.data.length).toBeLessThanOrEqual(MAX_ROWS);
  });

  it("a milestone far past the bound is not a marker and does not stretch the chart", () => {
    const m = buildLiveChartModel({ ...base, plan: { ...plan, milestones: [...plan.milestones, { label: "CARAMELIZATION", t: 1e6, temp: 300 }] } });
    expect(m.planMarkers.map((x) => x.tag)).toEqual(["Y", "FC", "DROP"]);
    expect(m.planEnd).toBe(100);
    expect(m.data.length).toBeLessThanOrEqual(MAX_ROWS);
  });

  it("a milestone exactly at the bound is kept", () => {
    const m = buildLiveChartModel({ ...base, plan: milestoneAt(MAX_S) });
    expect(m.planMarkers.map((x) => x.tag)).toEqual(["CAR"]);
    expect(m.planEnd).toBe(MAX_S);
  });

  it("a milestone one second past the bound, or before 0:00, is not a marker", () => {
    expect(buildLiveChartModel({ ...base, plan: milestoneAt(MAX_S + 1) }).planMarkers).toEqual([]);
    expect(buildLiveChartModel({ ...base, plan: milestoneAt(-1) }).planMarkers).toEqual([]);
  });

  it("leaves a normal roast alone: same rows, same plan end, an hour-long roast not clipped", () => {
    const m = buildLiveChartModel({ ...base, plan });
    expect(m.total).toBe(20);
    expect(m.planEnd).toBe(100);
    expect(m.lookahead).toBe(30);
    expect(m.data).toHaveLength(101);

    const long = buildLiveChartModel({ ...base, elapsedSeconds: 3600 });
    expect(long.total).toBe(3600);
    expect(long.data).toHaveLength(3601);
  });
});

// Hygiene, not a crash fix: PLAN_MARK is a plain object, so a label like
// "constructor" or "__proto__" found an inherited Object.prototype member and was
// treated as a milestone with a junk tag. Nothing throws; a stray marker is the
// worst of it. The lookup has to ask for the label's OWN entry.
describe("buildLiveChartModel milestone labels", () => {
  const INHERITED = ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"];

  it("only a label the chart has a tag for becomes a marker", () => {
    const milestones = [{ label: "__proto__", t: 60 }, { label: "constructor", t: 70 }, { label: "FIRST CRACK", t: 80, temp: 280 }];
    const m = buildLiveChartModel({ ...base, plan: { curve, milestones } });
    expect(m.planMarkers).toHaveLength(1);
    expect(m.planMarkers[0].tag).toBe("FC");
  });

  it.each(INHERITED)("%s alone is not a marker, so the plan is not markers-only", (label) => {
    const m = buildLiveChartModel({ ...base, plan: { curve: [], milestones: [{ label, t: 60 }], source: "found" } });
    expect(m.planMarkers).toEqual([]);
    expect(m.ghost).toBe("none");
    expect(m.ghostReason).toBe("source-no-curve");
  });

  it("every real label keeps its tag, as text", () => {
    const labels = ["YELLOWING", "FIRST CRACK", "COOLING START", "MAILLARD", "CARAMELIZATION"];
    const m = buildLiveChartModel({ ...base, plan: { curve, milestones: labels.map((label, i) => ({ label, t: 10 * (i + 1) })) } });
    expect(m.planMarkers.map((x) => x.tag)).toEqual(["Y", "FC", "DROP", "MAI", "CAR"]);
  });
});

// The live RoR line, pinned to the numbers it drew before its recipe moved into chartRor
// (src/lib/curveSmoothing.js) to be shared with the ghost. Where the maths lives must not
// move a single point of the line Case steers by. The values were read off the code before
// the move, on this curve.
describe("buildLiveChartModel live RoR", () => {
  const curve600 = Array.from({ length: 601 }, (_, t) => ({
    t,
    bt: Math.round((200 + 210 * (1 - Math.exp(-t / 260)) - 40 * Math.exp(-t / 25)) * 10) / 10,
  }));

  it("is exactly what it drew before the shared recipe", () => {
    const m = buildLiveChartModel({ curve: curve600, roastLog: [], profile: null, elapsedSeconds: 600 });
    const ror = m.data.map((d) => d.ror);
    for (const [t, v] of [[0, 117.3], [1, 116.1], [15, 100], [100, 34.8], [300, 15.3], [599, 4.8], [600, 4.8]]) {
      expect(ror[t]).toBeCloseTo(v, 5);
    }
    expect(ror.filter((v) => v != null)).toHaveLength(601);
    expect(Math.round(ror.reduce((a, v) => a + v, 0) * 10) / 10).toBe(13701.9);
  });
});

// The source roast's rate of rise (RL-056): data[t].planRor, the RoR ghost's series. It is
// the live line's own recipe applied to the plan's per-second readings, so the two can be
// compared by eye. The test below pins that; the rest pin where it is null, and that
// nothing is drawn unless the BT ghost is.
describe("buildLiveChartModel ghost RoR (planRor)", () => {
  const isNum = (v) => typeof v === "number";
  const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
  const count = (m) => m.data.filter((d) => isNum(d.planRor)).length;
  const truth = (t) => Math.round((200 + 210 * (1 - Math.exp(-t / 260)) - 40 * Math.exp(-t / 25)) * 10) / 10;
  const roast600 = Array.from({ length: 601 }, (_, t) => ({ t, bt: truth(t) }));
  const withHole = (from, to) => roast600.filter((p) => p.t < from || p.t > to);
  const planOf = (c) => ({ curve: c, milestones: [], source: "found" });

  it("is the live line's recipe: the same curve as live and as plan gives the same RoR at every second", () => {
    const m = buildLiveChartModel({ curve: roast600, roastLog: [], profile: null, plan: planOf(roast600), elapsedSeconds: 600 });
    let compared = 0;
    for (let t = 0; t < m.data.length; t++) {
      const { ror, planRor } = m.data[t];
      if (ror == null || planRor == null) continue;
      compared++;
      expect(Math.abs(planRor - ror)).toBeLessThan(1e-6);
    }
    expect(compared).toBeGreaterThan(500);
  });

  // Not the same curve this time, and noisy enough that the +/-2 s display smoothing the
  // BT ghost goes through would move the numbers: the series must come from the plan's own
  // readings, after the short holes are bridged and before that smoothing, with no time shift.
  it("is rorSeries(smoothSeries(plan, 1), 15) of the plan's own per-second readings, to 0.1", () => {
    let seed = 11;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const noisy = Array.from({ length: 601 }, (_, t) => ({ t, bt: Math.round((truth(t) + (rnd() - 0.5) * 4) * 10) / 10 }));
    const bts = noisy.map((p) => p.bt);
    const expected = rorSeries(smoothSeries(bts, 1), 15).map(round1);
    // The check can tell the two orders apart: smoothing first would have read differently.
    const smoothedFirst = rorSeries(smoothSeries(smoothSeries(bts, 2), 1), 15).map(round1);
    expect(expected.some((v, t) => Math.abs(v - smoothedFirst[t]) > 0.5)).toBe(true);

    const m = buildLiveChartModel({ ...base, plan: planOf(noisy) });
    for (let t = 0; t <= 600; t++) expect(m.data[t].planRor).toBeCloseTo(expected[t], 5);
  });

  it("reads a known pace from second 0 to the end of the plan (0.3 F/s = 18 F/min)", () => {
    const ramp = Array.from({ length: 301 }, (_, t) => ({ t, bt: Math.round((200 + t * 0.3) * 10) / 10 }));
    const m = buildLiveChartModel({ ...base, plan: planOf(ramp) });
    expect(m.data[100].planRor).toBeCloseTo(18, 1);
    expect(m.data[200].planRor).toBeCloseTo(18, 1);
    // The first and last seconds use a one-sided window and the light smoothing nudges the end
    // points, so there the pace is right to within 2%, but it is there.
    for (const t of [0, 300]) expect(Math.abs(m.data[t].planRor - 18)).toBeLessThan(0.36);
  });

  it("carries the plan's pace on the lookahead rows, past the live edge", () => {
    const m = buildLiveChartModel({ ...base, plan }); // plan: 1 F/s = 60 F/min, to 100 s
    expect(m.data.length).toBeGreaterThanOrEqual(101);
    expect(m.data[60].planRor).toBeCloseTo(60, 1); // second 60 is past the live edge (20)
    // Near either end the window is one-sided and the light smoothing nudges the end point: within 2%.
    for (const t of [0, 10, 100]) expect(Math.abs(m.data[t].planRor - 60)).toBeLessThan(1.2);
  });

  it("is stored rounded to 0.1", () => {
    const m = buildLiveChartModel({ ...base, plan: planOf(roast600) });
    expect(count(m)).toBeGreaterThan(500);
    for (const d of m.data) if (isNum(d.planRor)) expect(Math.abs(d.planRor * 10 - Math.round(d.planRor * 10))).toBeLessThan(1e-6);
  });

  it("a 10 s hole in the plan is null for 15 s either side of it, and the pace is there on both sides", () => {
    const m = buildLiveChartModel({ ...base, plan: planOf(withHole(300, 309)) });
    const ts = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
    // Listing the offending seconds, rather than failing on the first.
    expect(ts(285, 324).filter((t) => m.data[t].planRor != null)).toEqual([]);
    expect([100, 250, 360, 500].filter((t) => !isNum(m.data[t].planRor))).toEqual([]);
  });

  it("a 5 s hole is bridged before the slope is taken, so the pace runs straight through it", () => {
    const ramp = Array.from({ length: 301 }, (_, t) => ({ t, bt: 200 + t / 2 })); // 0.5 F/s = 30 F/min
    const m = buildLiveChartModel({ ...base, plan: planOf(ramp.filter((p) => p.t < 200 || p.t > 204)) });
    const off = Array.from({ length: 71 }, (_, i) => 170 + i).filter((t) => !(isNum(m.data[t].planRor) && Math.abs(m.data[t].planRor - 30) < 0.1));
    expect(off).toEqual([]);
  });

  it("is absent after DROP, with the ghost it belongs to", () => {
    const before = buildLiveChartModel({ ...base, plan });
    expect(count(before)).toBeGreaterThan(50); // the control: without DROP there is a pace
    const roastLog = [{ type: "phase", label: "COOLING START", t: 18, temp: "" }];
    const after = buildLiveChartModel({ ...base, roastLog, plan });
    expect(after.data.some((d) => d.planRor != null)).toBe(false);
  });

  it.each([
    ["markers-only (source not on this device)", { curve: [], milestones: plan.milestones, source: "missing" }],
    ["none: no source roast", { curve: [], milestones: [], source: "none" }],
    ["none: source roast not on this device", { curve: [], milestones: [], source: "missing" }],
    ["none: source roast with no curve", { curve: [], milestones: [], source: "found" }],
    ["none: a single curve point", { curve: [{ t: 10, bt: 200 }], milestones: [], source: "found" }],
  ])("is null on every row when the ghost is %s", (_name, p) => {
    const m = buildLiveChartModel({ ...base, plan: p });
    expect(m.data.some((d) => d.planRor != null)).toBe(false);
  });

  it("is null on every row with no plan at all", () => {
    expect(buildLiveChartModel(base).data.some((d) => d.planRor != null)).toBe(false);
  });

  // The ghost draws from two readings, but a pace needs 16 unbroken seconds: a shorter
  // plan has a BT ghost and, silently, no RoR ghost.
  it("a plan too short for a pace still draws its BT ghost and has no RoR", () => {
    const m = buildLiveChartModel({ ...base, plan: planOf(roast600.slice(0, 10)) });
    expect(m.ghost).toBe("drawn");
    expect(m.data[5].planTemp).not.toBeNull();
    expect(m.data.some((d) => d.planRor != null)).toBe(false);
  });

  // RL-030: it is built from the bounded source readings only, never from the raw curve.
  it("ignores a source point at t = 1e9 or 2^32 + 5: same pace, built in well under a second", () => {
    const clean = buildLiveChartModel({ ...base, plan: planOf(roast600) });
    expect(count(clean)).toBeGreaterThan(500); // the control
    const started = Date.now();
    const huge = buildLiveChartModel({ ...base, plan: planOf([...roast600, { t: 1e9, bt: 400 }, { t: 2 ** 32 + 5, bt: 400 }]) });
    expect(Date.now() - started).toBeLessThan(200);
    expect(huge.data.map((d) => d.planRor)).toEqual(clean.data.map((d) => d.planRor));
  });

  // Critic correction 6: the ghost's pace is on the RoR axis from second 0, so a source whose
  // first 15 s fall at -100 F/min must not push the axis out. Encoded as a BOUND on the series
  // (the ceiling stays at the plan's real peak, nothing below the dip itself), not as a cap:
  // a faithful, uncapped series passes, and so would one that capped the early pace. The
  // synthetic roast's true pace peaks at 45 F/min, and a slope over a window can never exceed
  // the pace inside it.
  it("a charge dip of -100 F/min does not push the ceiling past the plan's real peak (45 F/min)", () => {
    const pace = [[0, -100], [15, -100], [30, -30], [60, 40], [120, 45], [240, 32], [360, 22], [480, 15], [600, 10]];
    const paceAt = (t) => {
      for (let i = 1; i < pace.length; i++) {
        if (t <= pace[i][0]) {
          const [t0, p0] = pace[i - 1];
          const [t1, p1] = pace[i];
          return p0 + ((p1 - p0) * (t - t0)) / (t1 - t0);
        }
      }
      return pace[pace.length - 1][1];
    };
    let bt = 230;
    const dip = Array.from({ length: 661 }, (_, t) => {
      const point = { t, bt: Math.round(bt * 10) / 10 };
      bt += paceAt(t) / 60;
      return point;
    });
    const m = buildLiveChartModel({ ...base, plan: planOf(dip) });
    const values = m.data.map((d) => d.planRor).filter(isNum);
    expect(values.length).toBeGreaterThan(600);
    expect(Math.max(...values)).toBeLessThanOrEqual(47);
    expect(Math.max(...values)).toBeGreaterThanOrEqual(40); // the real recovery is still drawn
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-101);
  });
});

// ---------------------------------------------------------------------------
// The first-crack countdown, as the live chart's model hands it to the chip (model.fcEta).
// The maths is src/lib/fcEta.js and is tested in fcEta.test.js; what is tested HERE is the
// wiring, i.e. that the model feeds it the right series and the right facts:
//   - the model's OWN smoothed temp and RoR, so the number agrees with the lines it sits on;
//   - lastRealBtT, the second of the newest REAL sample. The chart carries the last reading
//     for LIVE_GAP_S after a feed dies, and from the arrays alone a carried second looks
//     measured -- the "A DYING FEED" contract in the fcEta.js header;
//   - a rate of rise built from real samples only at the trailing edge, so carried seconds
//     can never extend a run of good rate, nor dilute the rate a held value divides by;
//   - fcEtaPrior, the previous call's fcEta.nextPrior, which keeps a late-join start alive.
// `showFcEta` is the equipment gate (the component's prop; App passes equipmentHasProbe).
// Without it the verdict is hidden, whatever the data says.
// ---------------------------------------------------------------------------
describe("buildLiveChartModel fcEta (the first-crack countdown)", () => {
  const climb = (from, perMin, t0, t1) =>
    Array.from({ length: t1 - t0 + 1 }, (_, i) => ({ t: t0 + i, bt: Math.round((from + (perMin * i) / 60) * 10) / 10 }));
  const flat = (bt, t0, t1) => climb(bt, 0, t0, t1);
  const last = (curve) => curve[curve.length - 1].t;
  const modelOf = (curve, extra = {}) =>
    buildLiveChartModel({ curve, roastLog: [], profile: null, elapsedSeconds: last(curve), showFcEta: true, ...extra });
  // The verdict, after checking the model returns one at all (a clearer failure than a TypeError).
  const verdict = (curve, extra) => {
    const m = modelOf(curve, extra);
    expect(m.fcEta).toBeDefined(); // buildLiveChartModel returns an fcEta verdict
    return m.fcEta;
  };
  const caramelization = (t) => ({ type: "phase", label: "CARAMELIZATION", t, temp: "340" });

  // 220 F climbing 30 F/min: 370 F at second 300, so the textbook answer there is 60 s.
  const run300 = climb(220, 30, 0, 300);

  describe("the gate", () => {
    it("is hidden, with nothing to show, when the equipment gate is closed -- on any data", () => {
      const log = [caramelization(200)];
      for (const extra of [{}, { showFcEta: false }]) {
        const m = buildLiveChartModel({ curve: run300, roastLog: log, profile: null, elapsedSeconds: 300, ...extra });
        expect(m.fcEta).toBeDefined(); // the verdict exists even with the gate closed
        expect(m.fcEta.state).toBe("hidden");
        expect(m.fcEta.parts).toBeNull();
        expect(m.fcEta.seconds).toBeNull();
      }
      // The same data with the gate open is not hidden: the gate is what hid it.
      expect(verdict(run300, { roastLog: log }).state).not.toBe("hidden");
    });

    it("returns a hidden verdict, not nothing, for a roast with no curve at all", () => {
      const m = buildLiveChartModel({ curve: [], roastLog: [], profile: null, elapsedSeconds: 0, showFcEta: true });
      expect(m.fcEta).toBeDefined();
      expect(m.fcEta.state).toBe("hidden");
    });

    it("changes no row the chart draws", () => {
      const log = [caramelization(200)];
      const off = buildLiveChartModel({ curve: run300, roastLog: log, profile: null, elapsedSeconds: 300 });
      const on = buildLiveChartModel({ curve: run300, roastLog: log, profile: null, elapsedSeconds: 300, showFcEta: true });
      expect(on.data).toEqual(off.data);
      expect(on.total).toBe(off.total);
    });
  });

  describe("counting", () => {
    it("counts on a clean 30 F/min climb: 370 F is 60 s from 400 F, and the data is fresh", () => {
      const v = verdict(run300);
      expect(v.state).toBe("counting");
      expect(v.btAgeSeconds).toBe(0);
      expect(v.seconds).toBeGreaterThan(55);
      expect(v.seconds).toBeLessThan(65);
      expect(v.parts.label).toBe("FC IN");
      expect(v.parts.numeral).toMatch(/^\d:\d\d$/);
    });

    it("is read off the model's own lines: (400 - the temp drawn) / the RoR drawn", () => {
      const m = modelOf(run300);
      const edge = m.data[300];
      expect(Math.abs(m.fcEta.seconds - ((400 - edge.temp) / edge.ror) * 60)).toBeLessThan(1);
    });

    it("reads past an interior hole of LIVE_GAP_S or less: the rate is not blinded by a short dropout", () => {
      const holed = run300.filter((p) => p.t < 200 || p.t > 200 + LIVE_GAP_S - 1); // 5 s missing
      const v = verdict(holed);
      expect(v.state).toBe("counting");
      expect(v.seconds).toBeGreaterThan(50);
      expect(v.seconds).toBeLessThan(70);
    });

    it("after a dropout longer than LIVE_GAP_S the rate is blind for a while: held on the last good rate, still a number", () => {
      const holed = run300.filter((p) => p.t < 280 || p.t > 289); // 10 s missing, 11 s of samples after
      const v = verdict(holed);
      expect(v.state).toBe("held");
      expect(Number.isFinite(v.seconds)).toBe(true);
      expect(v.seconds).toBeGreaterThan(40);
      expect(v.seconds).toBeLessThan(120); // not the (400 - null) / rate answer of a missing reading
      expect(v.parts.numeral).not.toBe(NO_ETA);
    });
  });

  describe("a dying feed", () => {
    // The last real sample is second 300. The chart repeats it for LIVE_GAP_S after that
    // (data[].temp stays non-null), and the clock runs on.
    it.each([0, 1, 3, LIVE_GAP_S])("still counts when the last reading is %i s old, and says how old it is", (age) => {
      const m = modelOf(run300, { elapsedSeconds: 300 + age });
      if (age > 0) expect(m.data[300 + age].temp).not.toBeNull(); // the chart still carries the reading
      expect(m.fcEta.state).toBe("counting");
      expect(m.fcEta.btAgeSeconds).toBe(age);
    });

    it.each([LIVE_GAP_S + 1, LIVE_GAP_S + 5, 60])("is held, not counting, when the last reading is %i s old", (age) => {
      const m = modelOf(run300, { elapsedSeconds: 300 + age });
      expect(m.fcEta.state).toBe("held");
      expect(m.fcEta.btAgeSeconds).toBe(age);
      expect(m.fcEta.parts.tag).toBe("HELD");
      // From a measured reading and the last good rate, near the 60 s the bean was from 400 F.
      expect(m.fcEta.seconds).toBeGreaterThan(50);
      expect(m.fcEta.seconds).toBeLessThan(70);
    });

    it("freezes: the held value does not move as the silence goes on", () => {
      const at = (age) => verdict(run300, { elapsedSeconds: 300 + age }).seconds;
      expect(at(LIVE_GAP_S + 1)).toBe(at(120));
      expect(at(LIVE_GAP_S + 20)).toBe(at(120));
    });

    it("does not let the carried seconds dilute the rate: a 60 F/min climb that dies at 350 F is still ~50 s from 400 F", () => {
      const fast = climb(290, 60, 0, 60); // 350 F at second 60, past 340 F at second 50
      const v = verdict(fast, { elapsedSeconds: 60 + LIVE_GAP_S + 1 });
      expect(v.state).toBe("held");
      // Divided by the rate the bean really had (60 F/min), not by the slower rate of a window
      // that is part flat carry (about 35 F/min, which would read 1:25 or more).
      expect(v.seconds).toBeGreaterThan(44);
      expect(v.seconds).toBeLessThan(58);
    });
  });

  describe("when it starts", () => {
    it("a probe already at 350 F from second 0 has crossed nothing: nothing to count in the first four minutes", () => {
      expect(verdict(flat(350, 0, 200)).state).toBe("hidden");
      expect(verdict(flat(350, 0, 239)).state).toBe("hidden");
    });

    it("...but once the clock passes 4:00 a hot probe starts it, held, with no rate yet", () => {
      const v = verdict(flat(350, 0, 300));
      expect(v.state).toBe("held");
      expect(v.seconds).toBeNull();
      expect(v.parts.numeral).toBe(NO_ETA);
    });

    it("a bridge that joins at 3:20, already hot, starts the chip at 4:00 and not before", () => {
      expect(verdict(flat(350, 200, 239)).state).toBe("hidden");
      const v = verdict(flat(350, 200, 240));
      expect(v.state).toBe("held");
      expect(v.seconds).toBeNull();
    });

    it("a late join that is climbing counts as soon as it has 16 s of rate", () => {
      const v = verdict(climb(345, 30, 250, 300)); // 370 F at 300
      expect(v.state).toBe("counting");
      expect(v.seconds).toBeGreaterThan(55);
      expect(v.seconds).toBeLessThan(65);
    });

    it("a late join already past 400 F counts up from the join", () => {
      const v = verdict(flat(405, 250, 255));
      expect(v.state).toBe("overdue");
      expect(v.seconds).toBe(5);
      expect(v.parts.numeral).toBe("+0:05");
    });

    it("the 340 F rising crossing in the stored curve starts it with no log entry and no memory (a reload)", () => {
      const v = verdict(climb(290, 30, 0, 130)); // past 340 F at second 100
      expect(v.state).toBe("counting");
      expect(v.seconds).toBeGreaterThan(80);
      expect(v.seconds).toBeLessThan(100);
    });

    it("the CARAMELIZATION entry alone starts it, whatever the curve looks like", () => {
      const v = verdict(flat(350, 0, 130), { roastLog: [caramelization(100)] });
      expect(v.state).toBe("held");
      expect(v.parts).not.toBeNull();
    });

    it("below 340 F, with no entry, there is nothing to count", () => {
      expect(verdict(climb(220, 30, 0, 200)).state).toBe("hidden"); // 320 F
    });
  });

  describe("the latch", () => {
    // A late join found by the 4:00 rule: it is in no log and in no crossing, so it lives only in
    // the caller's memory -- the previous verdict's nextPrior.
    const joined = climb(345, 30, 250, 300); // 370 F at 300
    const falling = Array.from({ length: 20 }, (_, i) => ({ t: 301 + i, bt: Math.round((370 - (i + 1) * 1.75) * 10) / 10 })); // 335 F at 320
    const later = [...joined, ...falling];

    it("hands back its memory: { startedAt, t }", () => {
      const v = verdict(joined);
      expect(v.nextPrior).toEqual({ startedAt: 250, t: 300 });
    });

    it("a late-join start survives the bean dipping back under 340 F when the caller passes the memory back", () => {
      const first = verdict(joined);
      // Without it the dip erases the start: nothing says caramelization began.
      expect(verdict(later).state).toBe("hidden");
      const v = verdict(later, { fcEtaPrior: first.nextPrior });
      expect(v.state).toBe("held");
      expect(Number.isFinite(v.seconds)).toBe(true);
    });

    it("a start found in the stored curve survives a dip with no memory at all", () => {
      const curve = [...climb(290, 30, 0, 130), ...Array.from({ length: 30 }, (_, i) => ({ t: 131 + i, bt: 355 - (i + 1) }))]; // 325 F at 160
      expect(verdict(curve).state).toBe("held");
    });
  });

  describe("answered", () => {
    it("FIRST CRACK in the log ends it: resolved, nothing to show", () => {
      const v = verdict(run300, { roastLog: [{ type: "phase", label: "FIRST CRACK", t: 290, temp: "368" }] });
      expect(v.state).toBe("resolved");
      expect(v.parts).toBeNull();
    });

    it("so does COOLING START (the drop), even with no first crack marked", () => {
      const v = verdict(run300, { roastLog: [{ type: "phase", label: "COOLING START", t: 290, temp: "368" }] });
      expect(v.state).toBe("resolved");
      expect(v.parts).toBeNull();
    });

    it("past 400 F with no first crack it counts up from the second the bean temp reached 400", () => {
      const v = verdict(climb(280, 57.6, 0, 130)); // 0.96 F/s: 400 F at second 125
      expect(v.state).toBe("overdue");
      expect(v.seconds).toBeGreaterThanOrEqual(4);
      expect(v.seconds).toBeLessThanOrEqual(6);
      expect(v.parts.numeral).toMatch(/^\+0:0[4-6]$/);
    });
  });

  describe("bounds", () => {
    it("a stored clock of 1e9 s sizes nothing and still gives a verdict", () => {
      const started = Date.now();
      const m = buildLiveChartModel({ curve: run300, roastLog: [caramelization(200)], profile: null, elapsedSeconds: 1e9, showFcEta: true });
      expect(Date.now() - started).toBeLessThan(2000);
      expect(m.fcEta).toBeDefined();
      expect(m.fcEta.state).toBe("held");
      expect(m.fcEta.parts).not.toBeNull();
    });
  });
});
