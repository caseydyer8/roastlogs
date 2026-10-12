import {
  stepsFromRoast, milestonesFromRoast, planFromRoast, profileFromRoast,
  roastDeviatedFromPlan, planDiffers, curveTempNear, formatMMSS,
  planForProfile, resolveProfilePlan, isFollowableProfile, lastStepBefore,
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

// The live chart's ghost. `roasts` is passed in -- planForProfile never reads
// storage, so it can be re-run when a source roast arrives from the cloud.
describe("planForProfile", () => {
  const curve = Array.from({ length: 11 }, (_, t) => ({ t, bt: 200 + t }));
  const sourceWithCurve = { ...roast, curve };
  const handMilestones = [{ label: "FIRST CRACK", t: 480, temp: 381 }];

  it("returns the source roast's curve and milestones for a full profile", () => {
    const profile = { id: 1, sourceRoastId: 42, milestones: handMilestones };
    expect(planForProfile(profile, [sourceWithCurve])).toEqual({ curve, milestones: handMilestones });
  });

  it("falls back to the source roast's own milestones when the profile has none", () => {
    const plan = planForProfile({ id: 1, sourceRoastId: 42, milestones: [] }, [sourceWithCurve]);
    expect(plan.curve).toBe(curve);
    expect(plan.milestones).toEqual(milestonesFromRoast(sourceWithCurve));
  });

  it("matches the source id as a string, so 42 and \"42\" are the same roast", () => {
    expect(planForProfile({ sourceRoastId: "42" }, [sourceWithCurve]).curve).toBe(curve);
    expect(planForProfile({ sourceRoastId: 42 }, [{ ...sourceWithCurve, id: "42" }]).curve).toBe(curve);
  });

  it("gives milestones only when the source roast is not here (deleted, or not synced yet)", () => {
    const profile = { sourceRoastId: 42, milestones: handMilestones };
    expect(planForProfile(profile, [])).toEqual({ curve: [], milestones: handMilestones });
    expect(planForProfile(profile, [{ id: 7, curve }])).toEqual({ curve: [], milestones: handMilestones });
    expect(planForProfile(profile, null)).toEqual({ curve: [], milestones: handMilestones });
  });

  it("gains the curve once the source roast arrives -- the same profile, re-run with the new data", () => {
    const profile = { sourceRoastId: 42, milestones: handMilestones };
    expect(planForProfile(profile, []).curve).toEqual([]);
    expect(planForProfile(profile, [sourceWithCurve]).curve).toBe(curve);
  });

  it("is null when there is neither a curve nor milestones", () => {
    expect(planForProfile(null, [sourceWithCurve])).toBeNull();
    expect(planForProfile({ steps: [] }, [sourceWithCurve])).toBeNull(); // built by hand
    expect(planForProfile({ sourceRoastId: 42, milestones: [] }, [])).toBeNull();
    expect(planForProfile({ sourceRoastId: 42 }, [{ id: 42, roastLog: [], curve: [] }])).toBeNull();
  });

  it("treats a source roast with a sub-2-point curve as having no curve", () => {
    const short = { id: 42, roastLog: [], curve: [{ t: 0, bt: 200 }] };
    // Nothing else to show: no ghost at all.
    expect(planForProfile({ sourceRoastId: 42, milestones: [] }, [short])).toBeNull();
    expect(planForProfile({ sourceRoastId: 42, milestones: [] }, [{ ...short, curve: [] }])).toBeNull();
    expect(planForProfile({ sourceRoastId: 42, milestones: [] }, [{ ...short, curve: undefined }])).toBeNull();
    // Milestones still draw their markers; the one-point curve rides along unchanged
    // (the chart draws no line from fewer than two points).
    expect(planForProfile({ sourceRoastId: 42, milestones: handMilestones }, [short]))
      .toEqual({ curve: short.curve, milestones: handMilestones });
  });
});

describe("resolveProfilePlan source facts", () => {
  const curve = [{ t: 0, bt: 200 }, { t: 1, bt: 201 }];
  const why = (profile, roasts) => {
    const { plan, ...rest } = resolveProfilePlan(profile, roasts);
    return rest;
  };

  it("says there is no profile", () => {
    expect(why(null, [])).toEqual({ hasSourceId: false, sourceFound: false });
  });
  it("tells a hand-built profile (no source id) from a missing source roast", () => {
    expect(why({ steps: [] }, [{ id: 42, curve }])).toEqual({ hasSourceId: false, sourceFound: false });
    expect(why({ sourceRoastId: 42 }, [])).toEqual({ hasSourceId: true, sourceFound: false });
    expect(why({ sourceRoastId: 42 }, [{ id: 42, curve }])).toEqual({ hasSourceId: true, sourceFound: true });
  });
  it("gives no verdict on the curve -- whether it draws is the chart's call", () => {
    // Same result for a usable curve, a one-point curve and no curve at all.
    for (const src of [{ id: 42, curve }, { id: 42, curve: [{ t: 0, bt: 200 }] }, { id: 42 }]) {
      expect(Object.keys(resolveProfilePlan({ sourceRoastId: 42 }, [src])).sort())
        .toEqual(["hasSourceId", "plan", "sourceFound"]);
    }
  });
  it("still makes a plan from milestones when the source roast is missing", () => {
    const r = resolveProfilePlan({ sourceRoastId: 42, milestones: [{ label: "FIRST CRACK", t: 480, temp: 381 }] }, []);
    expect(r.plan).not.toBeNull();
    expect(r.sourceFound).toBe(false);
  });
});

describe("resolveProfilePlan on damaged cache data", () => {
  const weird = { toString: 1 }; // String(weird) throws: no valid toString
  it("never throws, whatever the cached ids and labels look like", () => {
    expect(() => resolveProfilePlan({ sourceRoastId: 42 }, [{ id: weird }, null, { id: 42 }])).not.toThrow();
    expect(() => resolveProfilePlan({ sourceRoastId: weird }, [{ id: 42 }])).not.toThrow();
    const bad = { id: 42, roastLog: [{ type: "phase", label: weird }] };
    expect(() => resolveProfilePlan({ sourceRoastId: 42 }, [bad])).not.toThrow();
  });
  it("skips a damaged entry and still finds the real source roast after it", () => {
    const curve = [{ t: 0, bt: 200 }, { t: 1, bt: 201 }];
    const r = resolveProfilePlan({ sourceRoastId: 42 }, [{ id: weird }, { id: 42, curve }]);
    expect(r.sourceFound).toBe(true);
    expect(r.plan.curve).toEqual(curve);
  });
  it("a non-text phase label is ignored, not thrown on", () => {
    expect(milestonesFromRoast({ roastLog: [{ type: "phase", label: weird, time: 5 }] })).toEqual([]);
  });
});

// A profile read back from storage mid-roast is rendered with no error boundary
// above it, so this check must reject everything the Roast tab / live chart cannot
// draw. Each rejected shape below crashed (or would crash) a render.
describe("isFollowableProfile", () => {
  const good = {
    id: 1, name: "Guji", beanName: "Guji", sourceRoastId: 42,
    steps: [
      { time: "00:00", totalSeconds: 0, heat: "7", fan: "4" },
      { time: "04:00", totalSeconds: 240, heat: "5", fan: "5" },
    ],
    milestones: [{ label: "FIRST CRACK", t: 480, temp: 381 }],
  };
  const withStep = (step) => ({ ...good, steps: [step] });

  it("accepts the shapes the app itself writes", () => {
    expect(isFollowableProfile(good)).toBe(true);
    expect(isFollowableProfile({ ...good, milestones: undefined })).toBe(true);
    expect(isFollowableProfile({ ...good, milestones: null })).toBe(true);
    expect(isFollowableProfile({ ...good, name: undefined })).toBe(true);
    expect(isFollowableProfile({ ...good, steps: [] })).toBe(true);
    expect(isFollowableProfile(withStep({ totalSeconds: 90, heat: "5", fan: "5" }))).toBe(true); // cloud shape: no time
    expect(isFollowableProfile(withStep({ time: "01:30", heat: 5, fan: 5 }))).toBe(true); // older shape: no totalSeconds
    expect(isFollowableProfile(withStep({ totalSeconds: 0, heat: null, fan: undefined }))).toBe(true);
  });
  it("rejects what is not a profile", () => {
    for (const bad of [null, undefined, 0, "x", true, [], [good], {}, { name: "No Steps" }, { steps: "nope" }, { steps: {} }]) {
      expect(isFollowableProfile(bad)).toBe(false);
    }
  });
  it("rejects a step the Roast tab cannot read a time from (parseMMSS(undefined) threw)", () => {
    expect(isFollowableProfile(withStep({ heat: "5", fan: "4" }))).toBe(false);
    expect(isFollowableProfile(withStep({}))).toBe(false);
    expect(isFollowableProfile(withStep({ time: 4, heat: "5", fan: "4" }))).toBe(false);
    expect(isFollowableProfile(withStep({ time: null, heat: "5", fan: "4" }))).toBe(false);
    expect(isFollowableProfile(withStep({ time: {}, totalSeconds: 5 }))).toBe(false);
    expect(isFollowableProfile(withStep({ totalSeconds: "90" }))).toBe(false);
    expect(isFollowableProfile(withStep({ totalSeconds: null, time: "01:30" }))).toBe(false);
    expect(isFollowableProfile(withStep({ totalSeconds: NaN }))).toBe(false);
  });
  it("rejects a step that is not an object, or whose dials are (rendered as text)", () => {
    for (const step of [null, undefined, 5, "01:00", [], [0]]) expect(isFollowableProfile(withStep(step))).toBe(false);
    expect(isFollowableProfile(withStep({ totalSeconds: 0, fan: {}, heat: "5" }))).toBe(false);
    expect(isFollowableProfile(withStep({ totalSeconds: 0, fan: "4", heat: ["5"] }))).toBe(false);
  });
  it("rejects a name that is not text (rendered as a React child)", () => {
    expect(isFollowableProfile({ ...good, name: { a: 1 } })).toBe(false);
    expect(isFollowableProfile({ ...good, name: ["x"] })).toBe(false);
    expect(isFollowableProfile({ ...good, name: 5 })).toBe(false);
  });
  it("rejects milestones the chart would choke on", () => {
    expect(isFollowableProfile({ ...good, milestones: "FIRST CRACK" })).toBe(false);
    expect(isFollowableProfile({ ...good, milestones: {} })).toBe(false);
    expect(isFollowableProfile({ ...good, milestones: [null] })).toBe(false); // m.label threw
    expect(isFollowableProfile({ ...good, milestones: [5] })).toBe(false);
    expect(isFollowableProfile({ ...good, milestones: [{ t: 480 }] })).toBe(false);
    expect(isFollowableProfile({ ...good, milestones: [{ label: {}, t: 480 }] })).toBe(false);
    expect(isFollowableProfile({ ...good, milestones: [{ label: "FIRST CRACK", t: "soon" }] })).toBe(false);
    expect(isFollowableProfile({ ...good, milestones: [{ label: "FIRST CRACK" }] })).toBe(false);
  });
  it("rejects ids that are not text or numbers, a non-text beanName, and absurd lengths", () => {
    expect(isFollowableProfile({ ...good, id: { toString: 1 } })).toBe(false);
    expect(isFollowableProfile({ ...good, sourceRoastId: { toString: 1 } })).toBe(false);
    expect(isFollowableProfile({ ...good, beanName: { a: 1 } })).toBe(false);
    expect(isFollowableProfile({ ...good, id: undefined, sourceRoastId: null })).toBe(true);
    const step = { time: "00:00", totalSeconds: 0, heat: "5", fan: "4" };
    expect(isFollowableProfile({ ...good, steps: Array.from({ length: 500 }, () => step) })).toBe(true);
    expect(isFollowableProfile({ ...good, steps: Array.from({ length: 501 }, () => step) })).toBe(false);
    const ms = { label: "FIRST CRACK", t: 480 };
    expect(isFollowableProfile({ ...good, milestones: Array.from({ length: 50 }, () => ms) })).toBe(true);
    expect(isFollowableProfile({ ...good, milestones: Array.from({ length: 51 }, () => ms) })).toBe(false);
  });
  it("rejects a milestone time that would make the chart build millions of rows", () => {
    expect(isFollowableProfile({ ...good, milestones: [{ label: "FIRST CRACK", t: 2000000 }] })).toBe(false);
    expect(isFollowableProfile({ ...good, milestones: [{ label: "FIRST CRACK", t: 1e308 }] })).toBe(false);
    expect(isFollowableProfile({ ...good, milestones: [{ label: "FIRST CRACK", t: -1 }] })).toBe(false);
    expect(isFollowableProfile({ ...good, milestones: [{ label: "FIRST CRACK", t: 7200 }] })).toBe(true);
  });
});

describe("lastStepBefore", () => {
  const steps = [
    { time: "00:00", totalSeconds: 0 },
    { time: "04:00", totalSeconds: 240 },
    { time: "06:00", totalSeconds: 360 },
  ];
  it("is the last step the clock has passed", () => {
    expect(lastStepBefore(steps, 130)).toBe(0);
    expect(lastStepBefore(steps, 300)).toBe(1);
    expect(lastStepBefore(steps, 9999)).toBe(2);
  });
  it("is -1 before any step, and for a clock that is not a number", () => {
    expect(lastStepBefore(steps, 0)).toBe(-1);
    expect(lastStepBefore(steps, NaN)).toBe(-1);
    expect(lastStepBefore([], 130)).toBe(-1);
  });
  it("leaves a step landing exactly on the clock still due (strictly before)", () => {
    expect(lastStepBefore(steps, 240)).toBe(0);
    expect(lastStepBefore(steps, 241)).toBe(1);
  });
  it("reads an \"MM:SS\" time when there is no totalSeconds", () => {
    expect(lastStepBefore([{ time: "00:30" }, { time: "02:00" }], 100)).toBe(0);
    expect(lastStepBefore([{ time: "00:30" }, { time: "02:00" }], 121)).toBe(1);
  });
});
