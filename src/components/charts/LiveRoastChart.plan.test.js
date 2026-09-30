import { buildLiveChartModel } from "./LiveRoastChart";

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
