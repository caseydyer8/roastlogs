import { buildLiveChartModel, GHOST_CAPTION } from "./LiveRoastChart";
import { LIVE_GAP_S } from "../../lib/liveSample";

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
