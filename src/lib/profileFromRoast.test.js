import {
  stepsFromRoast, milestonesFromRoast, planFromRoast, profileFromRoast,
  roastDeviatedFromPlan, planDiffers, curveTempNear, formatMMSS,
} from "./profileFromRoast";

// OLDEST-FIRST, as saved.
const roast = {
  id: 42,
  beanName: "Guji",
  roastLog: [
    { type: "start_settings", t: 0, heat: "7", fan: "4", temp: "150", label: "START" },
    { type: "adjustment", t: 60, heat: "7", fan: "5", temp: "200" },
    { type: "adjustment", t: 90, heat: "", fan: "", temp: "230" }, // temp only: not a plan change
    { type: "adjustment", t: 120, heat: "6", fan: "", temp: "250" }, // fan blank = unchanged
    { type: "phase", t: 300, label: "YELLOWING", temp: "305" },
    { type: "phase", t: 300, label: "YELLOWING", temp: "999" }, // duplicate label ignored
    { type: "phase", t: 480, label: "FIRST CRACK", temp: "" },
    { type: "phase", t: 500, label: "START (RESUME)" },
    { type: "phase", t: 600, label: "COOLING START", temp: "" },
  ],
  curve: [{ t: 479, bt: 381.4 }, { t: 600, bt: 412 }],
};

describe("stepsFromRoast", () => {
  it("keeps every Fan/Heat change, carries blanks forward, and drops temp-only entries", () => {
    expect(stepsFromRoast(roast)).toEqual([
      { time: "00:00", totalSeconds: 0, heat: "7", fan: "4" },
      { time: "01:00", totalSeconds: 60, heat: "7", fan: "5" },
      { time: "02:00", totalSeconds: 120, heat: "6", fan: "5" },
    ]);
  });
  it("is empty for a roast with no settings", () => {
    expect(stepsFromRoast({ roastLog: [] })).toEqual([]);
    expect(stepsFromRoast(null)).toEqual([]);
  });
});

describe("milestonesFromRoast", () => {
  it("records every phase mark once, skips START/RESUME, and finds temps in the log or the curve", () => {
    expect(milestonesFromRoast(roast)).toEqual([
      { label: "YELLOWING", t: 300, temp: 305 },
      { label: "FIRST CRACK", t: 480, temp: 381 },
      { label: "COOLING START", t: 600, temp: 412 },
    ]);
  });
});

describe("profile from roast", () => {
  it("carries the source roast id, so the profile can follow later History edits", () => {
    const p = profileFromRoast(roast, { id: 7, name: "Guji A", beanName: "Guji" });
    expect(p).toMatchObject({ id: 7, name: "Guji A", beanName: "Guji", sourceRoastId: 42, isDefault: false });
    expect(p.steps).toHaveLength(3);
    expect(p.milestones).toHaveLength(3);
  });
  it("detects deviation from the followed plan by Fan/Heat only", () => {
    const plan = planFromRoast(roast);
    expect(roastDeviatedFromPlan(roast, plan)).toBe(false);
    const changed = { ...roast, roastLog: [...roast.roastLog, { type: "adjustment", t: 400, heat: "5", fan: "6", temp: "" }] };
    expect(roastDeviatedFromPlan(changed, plan)).toBe(true);
    expect(roastDeviatedFromPlan(roast, null)).toBe(true);
  });
  it("planDiffers notices a milestone-only edit (History time fix) too", () => {
    const profile = { ...planFromRoast(roast), name: "x" };
    expect(planDiffers(roast, profile)).toBe(false);
    const edited = { ...roast, roastLog: roast.roastLog.map((e) => (e.label === "FIRST CRACK" ? { ...e, t: 490 } : e)) };
    expect(planDiffers(edited, profile)).toBe(true);
  });
});

describe("helpers", () => {
  it("formats mm:ss and finds the nearest curve reading within a second", () => {
    expect(formatMMSS(125)).toBe("02:05");
    expect(curveTempNear(roast.curve, 480)).toBe(381);
    expect(curveTempNear(roast.curve, 300)).toBeNull();
  });
});
