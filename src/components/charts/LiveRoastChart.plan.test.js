import { buildLiveChartModel, GHOST_CAPTION } from "./LiveRoastChart";
import { LIVE_GAP_S } from "../../lib/liveSample";
import { smoothSeries, rorSeries } from "../../lib/curveSmoothing";

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
