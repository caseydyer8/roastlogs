// Turning a finished roast into a profile, and keeping the two in step.
//
// A profile is a Fan/Heat plan by time (`steps`) plus, since v3.9.0, the
// milestones the source roast actually hit (`milestones`) and the id of that
// roast (`sourceRoastId`). The live chart uses the source roast's bean-temp
// curve as a ghost to roast against, which is why the profile REFERENCES the
// roast rather than copying its ~600-point curve.
//
// Saved roasts keep roastLog OLDEST-FIRST (handleStop reverses the live,
// newest-first log before saving); a roast read back from History is the same.

const START_LABELS = new Set(["START", "START (RESUME)"]);

const pad2 = (n) => String(n).padStart(2, "0");
export const formatMMSS = (secs) => {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
};

const isDial = (v) => v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v));

// Nearest bean-temp reading in a saved curve, tolerating the one-second hole a
// dropped sample can leave. Null when there is none.
export function curveTempNear(curve, t) {
  if (!Array.isArray(curve)) return null;
  const want = Math.round(Number(t));
  let best = null;
  for (const p of curve) {
    if (!p || !Number.isFinite(Number(p.t)) || !Number.isFinite(Number(p.bt))) continue;
    const d = Math.abs(Math.round(Number(p.t)) - want);
    if (d <= 1 && (best == null || d < best.d)) best = { d, bt: Number(p.bt) };
  }
  return best ? Math.round(best.bt) : null;
}

// Every logged Fan/Heat setting, oldest first, with the dials carried forward
// (a blank field on an adjustment means "unchanged"). Consecutive entries that
// leave both dials where they were collapse into one step -- a temperature-only
// adjustment is not a plan change. Temperature is deliberately ignored: the plan
// is what the hands did, the temperature is what came of it.
export function stepsFromRoast(roast) {
  const log = Array.isArray(roast && roast.roastLog) ? roast.roastLog : [];
  const events = log
    .filter((e) => e && (e.type === "start_settings" || e.type === "adjustment"))
    .slice()
    .sort((a, b) => Number(a.t) - Number(b.t));
  const steps = [];
  let fan = null;
  let heat = null;
  for (const e of events) {
    const nextFan = isDial(e.fan) ? String(e.fan) : fan;
    const nextHeat = isDial(e.heat) ? String(e.heat) : heat;
    if (nextFan === null || nextHeat === null) {
      fan = nextFan;
      heat = nextHeat;
      continue; // no complete setting yet
    }
    if (nextFan !== fan || nextHeat !== heat || steps.length === 0) {
      const totalSeconds = Math.max(0, Math.round(Number(e.t) || 0));
      steps.push({ time: formatMMSS(totalSeconds), totalSeconds, heat: nextHeat, fan: nextFan });
    }
    fan = nextFan;
    heat = nextHeat;
  }
  return steps;
}

// Every phase mark and auto-logged threshold crossing the roast recorded, with
// the bean temp at that moment (the logged temp, else the probe curve). START
// is not a milestone; it is where the roast begins. Oldest first, one per label.
export function milestonesFromRoast(roast) {
  const log = Array.isArray(roast && roast.roastLog) ? roast.roastLog : [];
  const seen = new Set();
  const out = [];
  log
    .filter((e) => e && e.type === "phase" && e.label && !START_LABELS.has(String(e.label).toUpperCase()))
    .slice()
    .sort((a, b) => Number(a.t) - Number(b.t))
    .forEach((e) => {
      if (seen.has(e.label)) return;
      seen.add(e.label);
      const logged = e.temp !== "" && e.temp !== null && e.temp !== undefined ? Number(e.temp) : NaN;
      const temp = Number.isFinite(logged) && logged > 0 ? Math.round(logged) : curveTempNear(roast.curve, e.t);
      out.push({ label: e.label, t: Math.round(Number(e.t) || 0), temp });
    });
  return out;
}

// The fields a roast contributes to a profile. Name, bean, default flag and
// notes stay whatever the profile already had.
export function planFromRoast(roast) {
  return {
    steps: stepsFromRoast(roast),
    milestones: milestonesFromRoast(roast),
    sourceRoastId: roast ? roast.id : null,
  };
}

export function profileFromRoast(roast, { id, name, beanName }) {
  return {
    id,
    name,
    beanName: beanName ?? "",
    isDefault: false,
    notes: "",
    ...planFromRoast(roast),
  };
}

const stepKey = (s) => `${Math.round(Number(s.totalSeconds) || 0)}:${s.fan}:${s.heat}`;
const milestoneKey = (m) => `${m.label}:${m.t}:${m.temp ?? ""}`;

export function sameSteps(a, b) {
  const x = (a || []).map(stepKey);
  const y = (b || []).map(stepKey);
  return x.length === y.length && x.every((k, i) => k === y[i]);
}

export function sameMilestones(a, b) {
  const x = (a || []).map(milestoneKey);
  const y = (b || []).map(milestoneKey);
  return x.length === y.length && x.every((k, i) => k === y[i]);
}

// Did the roast differ from the plan it was following? Only the Fan/Heat plan
// counts: milestones always differ a little run to run and would prompt every time.
export function roastDeviatedFromPlan(roast, profile) {
  if (!profile) return true;
  return !sameSteps(stepsFromRoast(roast), profile.steps);
}

// Would pushing this roast's data into the profile change it?
export function planDiffers(roast, profile) {
  const next = planFromRoast(roast);
  return !sameSteps(next.steps, profile.steps) || !sameMilestones(next.milestones, profile.milestones);
}
