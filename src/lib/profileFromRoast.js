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

import { MAX_ROAST_S } from "./limits";

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
    .filter((e) => e && e.type === "phase" && typeof e.label === "string" && e.label && !START_LABELS.has(e.label.toUpperCase()))
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

// The live chart's ghost for a followed profile: the source roast's bean-temp
// curve (REFERENCED by id, never copied into the profile) plus the profile's
// milestone markers. Pure -- the caller reads `roasts` from wherever it lives
// and re-runs this when that data changes, because a source roast can arrive
// after the profile does (cloud merge, or recorded on another device).
//
// `resolveProfilePlan` also says whether the profile promised a ghost at all, so
// the UI can tell a hand-built profile from a source roast that has not synced
// to this device:
//   plan           { curve, milestones } for LiveRoastChart, or null when the
//                  profile has neither a curve nor milestones to show
//   hasSourceId    the profile references a source roast at all
//   sourceFound    that roast is in `roasts` (false whenever hasSourceId is false)
// It deliberately gives no verdict on WHY a curve is not drawn: that rule (valid,
// distinct seconds) belongs to the chart, and a second verdict here disagreed
// with it. The `curve.length >= 2` below only decides whether there is anything
// to hand over. A shorter curve still rides along in `plan.curve` when there
// are milestones to show (the chart draws no line from it) -- the shape the live
// memo always had.
// Ids are numbers or strings. Anything else (an object read back from a damaged
// cache) never matches, instead of throwing out of String() during render.
const idKey = (v) => (typeof v === "string" || typeof v === "number" ? String(v) : null);

export function resolveProfilePlan(profile, roasts) {
  if (!profile) return { plan: null, hasSourceId: false, sourceFound: false };
  const hasSourceId = profile.sourceRoastId != null;
  try {
    const want = idKey(profile.sourceRoastId);
    const src = hasSourceId && want !== null && Array.isArray(roasts)
      ? roasts.find((r) => r && idKey(r.id) === want) || null
      : null;
    const curve = src && Array.isArray(src.curve) ? src.curve : [];
    const milestones = Array.isArray(profile.milestones) && profile.milestones.length
      ? profile.milestones
      : src ? milestonesFromRoast(src) : [];
    return {
      plan: curve.length >= 2 || milestones.length ? { curve, milestones } : null,
      hasSourceId,
      sourceFound: !!src,
    };
  } catch (e) {
    // A damaged roast in the cache costs the ghost, never the app.
    return { plan: null, hasSourceId, sourceFound: false };
  }
}

export function planForProfile(profile, roasts) {
  return resolveProfilePlan(profile, roasts).plan;
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

// Can a profile read back from storage be shown by the Roast tab and the live
// chart? They render it with no error boundary above them, and the persist effect
// that would overwrite a bad stored value never runs once a render throws -- so a
// value they cannot draw would blank the app on EVERY launch until site data is
// cleared. This asks for exactly what they read, and nothing more:
//   name         text, or absent
//   steps[]      objects whose seconds come from a finite `totalSeconds` or, when
//                that is absent, an "MM:SS" `time` string; `time` is text or
//                absent, and `fan` / `heat` are plain values (all three render)
//   milestones[] optional; objects with a text `label` and a `t` between 0 and
//                MAX_ROAST_S -- the live chart builds one row per second up to
//                the latest milestone, so an absurd `t` would freeze it
// Anything else falls back to "no profile": the ghost is lost, the app boots.
const MAX_STEPS = 500; // a hand-built profile is dozens; a corruption guard, not a product limit
const MAX_MILESTONES = 50;
export function isFollowableProfile(p) {
  const plain = (v) => v == null || typeof v !== "object";
  const goodStep = (s) =>
    !!s && typeof s === "object" && !Array.isArray(s)
    && (s.totalSeconds === undefined ? typeof s.time === "string" : Number.isFinite(s.totalSeconds))
    && (s.time == null || typeof s.time === "string")
    && plain(s.fan) && plain(s.heat);
  const goodMilestone = (m) =>
    !!m && typeof m === "object" && typeof m.label === "string"
    && Number(m.t) >= 0 && Number(m.t) <= MAX_ROAST_S;
  // id / sourceRoastId are String()-ed in render and in handleStop; beanName is compared.
  const idLike = (v) => v == null || typeof v === "string" || typeof v === "number";
  return !!p && typeof p === "object" && !Array.isArray(p)
    && idLike(p.id) && idLike(p.sourceRoastId)
    && (p.name == null || typeof p.name === "string")
    && (p.beanName == null || typeof p.beanName === "string")
    && Array.isArray(p.steps) && p.steps.length <= MAX_STEPS && p.steps.every(goodStep)
    && (p.milestones == null
      || (Array.isArray(p.milestones) && p.milestones.length <= MAX_MILESTONES && p.milestones.every(goodMilestone)));
}

// Index of the last profile step the clock is already past, counting from the
// first -- the value a resumed roast must hold so it waits for the NEXT step, not
// for step 0 at a 0:00 the clock will never see again. Strictly before `elapsed`:
// a step landing exactly on it is still due on resume (its log row is skipped if
// that second already has one). -1 when no step has been passed.
export function lastStepBefore(steps, elapsed) {
  const startOf = (s) => {
    if (s.totalSeconds !== undefined) return s.totalSeconds;
    const [m, sec] = String(s.time).split(":").map(Number);
    return m * 60 + sec;
  };
  let idx = -1;
  while (idx + 1 < steps.length && startOf(steps[idx + 1]) < elapsed) idx++;
  return idx;
}
