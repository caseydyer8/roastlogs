import { buildLiveChartModel, GHOST_CAPTION } from "./LiveRoastChart";

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
