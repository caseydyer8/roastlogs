import React from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
} from "recharts";
import {
  PHASE_NAMES,
  PHASE_VAR,
  MOMENT_LABELS,
  ownEntry,
  phaseBoundaries,
  momentsFrom,
  phaseKeyAt,
  phaseSpans,
} from "../../lib/roastPhases";
import { LIVE_GAP_S } from "../../lib/liveSample";
import { MAX_ROAST_S } from "../../lib/limits";
import { smoothSeries, chartRor, CHART_ROR_HALF_S } from "../../lib/curveSmoothing";
import { computeFcEta, chipView } from "../../lib/fcEta";

// ---------------------------------------------------------------------------
// LiveRoastChart — the in-progress roast, drawn while it happens.
//
// Deliberately a SEPARATE component from RoastCurveChart (the finished-roast
// History view): that one renders a known, complete roast, this one renders a
// buffer that is still growing, with a moving "now" edge and a live phase
// band. Keeping them apart means the History chart carries zero risk from
// live-only concerns (windowing, follow-the-tip, partial data).
//
// Reads only state the app already has in memory during a roast:
//   curve   -> [{ t: roastSeconds, bt }]  (the recording-gate buffer)
//   roastLog-> phase entries + logged Fan/Heat adjustments
//   profile -> profileFollowing.steps, drawn as the planned target to follow
//
// Fan/Heat are discrete dials, so their lines are stepAfter, never smoothed
// (project convention). Temp is monotone. RoR is derived and smoothed.
// ---------------------------------------------------------------------------

const WINDOW_SECONDS = 180; // the "last 3 minutes" scrolling window

// A profile saved from a roast lets you roast against that roast: its bean-temp
// curve is drawn as a dashed ghost, its milestones as markers, and the chart
// looks LOOKAHEAD seconds past "now" so the next planned step and milestone are
// visible before you reach them.
const LOOKAHEAD = 30;
const PLAN_MARK = { YELLOWING: "Y", "FIRST CRACK": "FC", "COOLING START": "DROP", MAILLARD: "MAI", CARAMELIZATION: "CAR" };
// Tooltip row order on the temp panel (its series names).
const TOOLTIP_ROWS = ["Temp", "Temp (plan)", "RoR", "RoR (plan)"];

// The model builds one row per second, so what it sizes rows by must be bounded
// (RL-030). Source-roast points and milestones outside 0..MAX_ROAST_S are not
// readings of this roast and are ignored here. The roast being drawn (the clock, the
// last live point, DROP) is capped at MAX_ROAST_S where `total` is computed below.
const inRoast = (t) => t >= 0 && t <= MAX_ROAST_S;

// Why a followed profile has no ghost line, in words. State the fact the app
// holds, not a guess about history (same stance as equipment's "Not recorded"):
// a profile with no sourceRoastId is "no source roast", not "built by hand".
// The separator is U+00B7, as in the tooltip header (`00:00 · Phase`).
export const GHOST_CAPTION = {
  "no-source": "No ghost · no source roast",
  "source-missing": "No ghost · source roast not on this device",
  "source-no-curve": "No ghost · source roast has no curve",
};

// Bridge holes of a few seconds in the ghost with a straight line; anything
// longer stays a gap -- the ghost is a reference, but it should not invent a
// stretch the source roast's probe never measured.
function fillShortHoles(arr, maxRun) {
  const out = arr.slice();
  let i = 0;
  while (i < out.length) {
    if (out[i] != null) { i++; continue; }
    let j = i;
    while (j < out.length && out[j] == null) j++;
    if (i > 0 && j < out.length && j - i <= maxRun) {
      const a = out[i - 1], b = out[j];
      for (let k = i; k < j; k++) out[k] = a + ((b - a) * (k - i + 1)) / (j - i + 1);
    }
    i = j;
  }
  return out;
}

// The source roast's rate of rise, one entry per second of `filled` (its readings
// after fillShortHoles). chartRor is the live line's own recipe, so the two compare
// like for like. On its own it would still price a window that merely touches a
// hole -- rorSeries trims a null at the edge of its window and slopes what is left --
// so the seconds either side of every hole are cleared too: the RoR ghost breaks
// where the BT ghost does, a window's width wider. A hole is a null left BETWEEN
// readings; seconds before the source's first reading are not one.
function ghostRor(filled) {
  const out = chartRor(filled);
  const lead = filled.findIndex((v) => v != null);
  if (lead < 0) return out;
  for (let i = lead + 1; i < filled.length; i++) {
    if (filled[i] != null) continue;
    for (let k = Math.max(0, i - CHART_ROR_HALF_S); k <= Math.min(filled.length - 1, i + CHART_ROR_HALF_S); k++) out[k] = null;
  }
  return out;
}

// Temp and RoR display smoothing lives in src/lib/curveSmoothing.js, shared with
// the History chart. The old 12 s difference / +/-4 s average recipe made RoR
// read as mountain peaks on a real roast.

const fmt = (s) => {
  const v = Math.max(0, Math.round(Number(s) || 0));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};

// The app stores profile step times as totalSeconds, but older/edited steps can
// carry an "MM:SS" string instead -- same defensive read the roast engine uses.
const parseMMSS = (str) => {
  if (typeof str !== "string") return 0;
  const [m, s] = str.split(":").map((n) => parseInt(n, 10));
  return (m || 0) * 60 + (s || 0);
};
const stepSeconds = (step) =>
  step && step.totalSeconds !== undefined ? Number(step.totalSeconds) : parseMMSS(step && step.time);

// Pure model builder -- exported so the series maths (RoR smoothing, profile
// overlay, carry-forward dials, phase boundaries) can be verified headlessly
// rather than only by eyeballing a chart.
//
// `showFcEta` is the equipment gate for the first-crack countdown (the caller passes
// equipmentHasProbe); `fcEtaPrior` is the previous build's fcEta.nextPrior, which keeps a
// late-join start alive (see fcEta.js).
export function buildLiveChartModel({ curve = [], roastLog = [], profile = null, plan = null, elapsedSeconds = 0, showFcEta = false, fcEtaPrior = null }) {
    // Drop ends the tracked roast. The SR540 runs its own 3-minute cool cycle
    // afterwards and there is nothing worth charting in it, so once DROP is
    // logged the chart stops growing instead of trailing a flat empty tail
    // while the timer runs on to the save screen.
    const b = phaseBoundaries(roastLog);
    const rawTotal = Math.max(elapsedSeconds, curve.length ? curve[curve.length - 1].t : 0, 1);
    // Capped: each second of `total` is a row, and the clock, the last curve
    // point and a logged DROP all come from storage.
    const total = Math.min(b.drop != null ? Math.max(b.drop, 1) : rawTotal, MAX_ROAST_S);
    const yellowing = b.yellowing;
    const firstCrack = b.firstCrack;
    const drop = b.drop;

    const maillard = b.maillard;
    const caramelization = b.caramelization;

    // Moments: instants worth a dot. Drawn only where the curve actually has a
    // reading at that second, so a probe-less roast quietly shows none.
    const moments = momentsFrom(roastLog);

    // Actual Fan/Heat, carried forward from logged adjustments.
    const events = roastLog
      .filter((e) => e && (e.type === "adjustment" || e.type === "start_settings"))
      .slice()
      .sort((a, b) => Number(a.t) - Number(b.t));

    // Planned Fan/Heat from the profile being followed.
    const steps = (profile && Array.isArray(profile.steps) ? profile.steps : [])
      .map((s) => ({ t: stepSeconds(s), heat: Number(s.heat), fan: Number(s.fan) }))
      .filter((s) => Number.isFinite(s.t))
      .sort((a, b) => a.t - b.t);

    // Bean temp by second (the curve is already ~1Hz; index it for fast lookup).
    const btAt = new Map();
    for (const p of curve) {
      if (p && Number.isFinite(p.t) && Number.isFinite(p.bt)) btAt.set(Math.round(p.t), p.bt);
    }

    // TRUE signal gaps, by the same LIVE_GAP_S rule History uses, so the two
    // views cannot disagree about what counts as a dropout.
    //
    // This matters because the device clock is a FIXED 1Hz
    // (docs/roastlink-live-data-plan.md) and does not phase-lock to our own 1Hz
    // elapsedSeconds clock. They drift, so on a perfectly healthy feed a whole
    // second occasionally receives no sample. Those one-second holes are NOT
    // dropouts -- LIVE_GAP_S explicitly says so -- but this model indexes bean
    // temp per second and never interpolates, so an unhandled hole would render
    // as a break in the line and, because RoR needs a full unbroken window, as
    // TWO breaks in RoR. The result would be a fault-looking fragmented curve
    // on a roast where nothing was wrong.
    const curveTs = curve
      .filter((p) => p && Number.isFinite(p.t) && Number.isFinite(p.bt))
      .map((p) => Math.round(p.t))
      .sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < curveTs.length; i++) {
      if (curveTs[i] - curveTs[i - 1] > LIVE_GAP_S) gaps.push([curveTs[i - 1], curveTs[i]]);
    }
    const inGap = (t) => {
      for (const [a, b] of gaps) if (t > a && t < b) return true;
      return false;
    };

    const data = [];
    let heat = null, fan = null, eIdx = 0;
    let pHeat = null, pFan = null, sIdx = 0;
    let lastBt = null;
    let lastBtT = null;

    for (let t = 0; t <= total; t++) {
      while (eIdx < events.length && Number(events[eIdx].t) <= t) {
        const e = events[eIdx];
        if (e.heat !== "" && e.heat != null) heat = Number(e.heat);
        if (e.fan !== "" && e.fan != null) fan = Number(e.fan);
        eIdx++;
      }
      while (sIdx < steps.length && steps[sIdx].t <= t) {
        pHeat = steps[sIdx].heat;
        pFan = steps[sIdx].fan;
        sIdx++;
      }
      const bt = btAt.has(t) ? btAt.get(t) : null;
      if (bt != null) { lastBt = bt; lastBtT = t; }
      // Carry the last reading across a clock-drift hole, but NEVER into a real
      // gap and NEVER past the freshness window. The two conditions cover
      // different shapes: inGap rules out the interior of a dropout, and the age
      // check rules out the trailing edge after the feed dies (where there is no
      // later sample, so no gap interval exists to test against). Outside both,
      // this is one measurement held a fraction of a second -- the same latitude
      // the app already grants everywhere else via STALE_MS -- not a fabricated
      // flat segment.
      const carried =
        bt == null && lastBt != null && !inGap(t) && t - lastBtT <= LIVE_GAP_S ? lastBt : null;
      const shown = bt != null ? bt : carried;
      data.push({
        t,
        temp: shown != null ? Math.round(shown * 10) / 10 : null,
        heat,
        fan,
        profHeat: pHeat,
        profFan: pFan,
        ror: null,
      });
    }

    // Display smoothing, identical to the History chart: temp +/-2 s moving
    // average, RoR a centred +/-15 s least-squares slope over lightly smoothed
    // temps. The newest point uses a one-sided window, so the leading edge is
    // slightly noisier than the settled curve behind it. Gaps stay gaps.
    const rawTemps = data.map((d) => d.temp);
    const shownTemps = smoothSeries(rawTemps, 2);
    const rors = chartRor(rawTemps);
    for (let t = 0; t < data.length; t++) {
      data[t].temp = shownTemps[t] != null ? Math.round(shownTemps[t] * 10) / 10 : null;
      data[t].ror = rors[t] != null ? Math.round(rors[t] * 10) / 10 : null;
    }

    // The first-crack countdown (src/lib/fcEta.js). This block is the other half of the
    // "A DYING FEED" contract in that file's header:
    //   temps        the line drawn above, so the number agrees with what it sits on;
    //   lastRealBtT  the second of the newest REAL sample -- `carried` keeps data[].temp
    //                non-null for LIVE_GAP_S after the feed dies, and from the arrays alone
    //                a repeated reading looks measured. Same indexing as btAt (and so as
    //                curveTs), limited to the seconds this model has a row for;
    //   rors         the RoR line's own recipe, from real seconds only: nothing past
    //                lastRealBtT, so a repeated reading can neither extend a run of good
    //                rate nor flatten the rate a held value divides by. Holes inside the
    //                reading stay bridged by `carried`, as they are for the line.
    // A closed equipment gate builds nothing: the verdict is hidden whatever the data says.
    let fcTemps = [];
    let fcRors = [];
    let lastRealBtT = null;
    if (showFcEta) {
      for (let i = curveTs.length - 1; i >= 0 && lastRealBtT === null; i--) {
        if (curveTs[i] <= total) lastRealBtT = curveTs[i];
      }
      fcTemps = data.map((d) => d.temp);
      fcRors = chartRor(rawTemps.map((v, t) => (lastRealBtT !== null && t <= lastRealBtT ? v : null)));
    }
    const fcEta = computeFcEta({
      temps: fcTemps,
      rors: fcRors,
      elapsed: Math.min(elapsedSeconds, MAX_ROAST_S),
      marks: b,
      hasProbe: showFcEta,
      prior: fcEtaPrior,
      lastRealBtT: lastRealBtT !== null ? lastRealBtT : undefined,
    });

    // The ghost. Only while the roast is still running: after DROP the chart stops
    // growing, and there is nothing left to steer by.
    //
    // What the plan CAN draw is worked out first and kept apart from that DROP
    // gate: `ghostStatus` / `ghostReason` describe the plan, not the moment, so
    // the "why no ghost" caption does not vanish (and shove the controls under a
    // thumb) the instant DROP is logged.
    //   drawn         2+ valid curve points -> a ghost line
    //   markers-only  fewer, but at least one milestone the chart has a tag for
    //   none          neither (or no plan at all)
    // `plan.source` ("none" | "missing" | "found") says whether the profile
    // references a source roast and whether it is on this device. A plan without
    // it (or an unknown value) gets no reason rather than a guessed one.
    let planMarkers = [];
    let planEnd = 0;
    let lookahead = 0;
    let ghostStatus = "none";
    let ghostReason = null;
    const byT = new Map();
    let lastCurveT = -1;
    let markers = [];
    if (plan) {
      const planCurve = Array.isArray(plan.curve) ? plan.curve : [];
      for (const p of planCurve) {
        if (p && inRoast(Number(p.t)) && Number.isFinite(Number(p.bt))) byT.set(Math.round(Number(p.t)), Number(p.bt));
      }
      lastCurveT = byT.size ? Math.max(...byT.keys()) : -1;
      markers = (plan.milestones || [])
        .filter((m) => ownEntry(PLAN_MARK, m.label) && inRoast(Number(m.t)))
        .map((m) => ({ t: Math.round(Number(m.t)), tag: ownEntry(PLAN_MARK, m.label), label: m.label, temp: m.temp }));

      ghostStatus = byT.size >= 2 ? "drawn" : markers.length ? "markers-only" : "none";
      if (ghostStatus !== "drawn") {
        ghostReason =
          plan.source === "none" ? "no-source"
          : plan.source === "missing" ? "source-missing"
          : plan.source === "found" ? "source-no-curve"
          : null;
      }
    }
    // A plan with nothing drawable adds no rows and no lookahead, exactly as if
    // there were no plan: otherwise the 3-minute window would slide 30 s into
    // empty future on a roast that has no ghost to look ahead to.
    if (plan && drop == null && ghostStatus !== "none") {
      planMarkers = markers;
      planEnd = Math.max(lastCurveT, ...planMarkers.map((m) => m.t), 0);
      lookahead = LOOKAHEAD;

      const rowsEnd = Math.max(total + lookahead, planEnd);
      const bridged = fillShortHoles(Array.from({ length: lastCurveT + 1 }, (_, t) => (byT.has(t) ? byT.get(t) : null)), LIVE_GAP_S);
      const ghost = smoothSeries(bridged, 2);
      // The pace is read from the bridged readings, not from `ghost`: the live RoR
      // comes from the raw readings, never from the +/-2 s line you look at, and
      // the ghost's must too. The BT ghost has no time shift, so neither does
      // this: both clocks count roast-seconds from START.
      const ghostRors = ghostStatus === "drawn" ? ghostRor(bridged) : [];
      for (let t = 0; t <= rowsEnd; t++) {
        const planTemp = ghost[t] != null ? Math.round(ghost[t] * 10) / 10 : null;
        const planRor = ghostRors[t] != null ? Math.round(ghostRors[t] * 10) / 10 : null;
        if (t < data.length) {
          data[t].planTemp = planTemp;
          data[t].planRor = planRor;
        } else {
          while (sIdx < steps.length && steps[sIdx].t <= t) {
            pHeat = steps[sIdx].heat;
            pFan = steps[sIdx].fan;
            sIdx++;
          }
          data.push({ t, temp: null, heat: null, fan: null, profHeat: pHeat, profFan: pFan, ror: null, planTemp, planRor });
        }
      }
    }

    return { data, total, yellowing, maillard, caramelization, firstCrack, drop, moments, lastBt, hasProfile: steps.length > 0, planMarkers, planEnd, lookahead, ghost: ghostStatus, ghostReason, fcEta };
}

export default function LiveRoastChart({
  curve = [],
  roastLog = [],
  profile = null,
  plan = null, // { curve, milestones, source: "none"|"missing"|"found" } from the profile's source roast
  elapsedSeconds = 0,
  windowMode = "scroll", // "scroll" (last 3 min, pannable) | "expand" (whole roast)
  onWindowModeChange,
  attached = false, // rendered inside the hero card -> no border/background of its own
  showFcEta = false, // the first-crack countdown: a Razzo probe roast only (App passes equipmentHasProbe)
  paused = false, // the roast clock is stopped, so the model is not re-run and a countdown is stale
  fcEtaPriorRef = null, // App's { current } holding the countdown's memory across this chart's mounts
}) {
  const [panOffset, setPanOffset] = React.useState(0); // seconds scrolled back from live
  const following = panOffset === 0;

  // Rendered width of the phase-ribbon lane, so a segment too narrow for its
  // name shows colour alone instead of a truncated word.
  const ribbonRef = React.useRef(null);
  const [ribbonWidth, setRibbonWidth] = React.useState(0);

  // Measure the tag for real rather than estimating ~6px per character. The
  // estimate was pessimistic by a couple of pixels, which is the whole margin
  // on a short phase: a 45-second DEV band at the end of a roast came out at
  // 24px against a 25.9px estimate and lost its name for no reason.
  const measureRef = React.useRef(null);
  const tagWidth = React.useCallback((tag) => {
    if (!measureRef.current) {
      if (typeof document === "undefined") return tag.length * 6;
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return tag.length * 6;
      ctx.font = "8.5px ui-monospace, SFMono-Regular, monospace";
      measureRef.current = ctx;
    }
    // measureText does not know about letter-spacing, so add it back: 0.1em.
    return measureRef.current.measureText(tag).width + tag.length * 0.85;
  }, []);
  React.useEffect(() => {
    const el = ribbonRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setRibbonWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  });

  // The countdown's memory: each build is handed the previous build's verdict-to-be, which
  // is how a start found by the late-join rule (in no log and no crossing) outlives the bean
  // dipping back under 340 F. Written after the commit and read by the next build, so
  // render itself stays pure. The ref is APP's (fcEtaPriorRef, reset when no roast is under
  // way), not this component's: the Roast tab unmounts on a tab switch and the readout's toggle
  // unmounts and remounts the chart, and a memory that died with each mount would drop the chip
  // on return whenever the bean sat under 340 F. A reload is still the limit (see fcEta.js).
  // Without the prop (nobody above is holding it) the chart keeps its own, per mount.
  const ownPriorRef = React.useRef(null);
  const priorRef = fcEtaPriorRef || ownPriorRef;
  const model = React.useMemo(
    () => buildLiveChartModel({ curve, roastLog, profile, plan, elapsedSeconds, showFcEta, fcEtaPrior: priorRef.current }),
    [curve, roastLog, profile, plan, elapsedSeconds, showFcEta, priorRef]
  );
  React.useEffect(() => {
    priorRef.current = model.fcEta.nextPrior;
  }, [model, priorRef]);

  const { data, total, maillard, caramelization, firstCrack, drop, moments, hasProfile, planMarkers, planEnd, lookahead, ghost, ghostReason, fcEta } = model;

  // Paused, the clock is stopped and the model is not re-run, so nothing on the chip is live:
  // EVERY visible state keeps its own text and takes the held look -- a counting number is stale,
  // and an overdue +m:ss is frozen, not counting (see chipView).
  const fcChip = chipView(fcEta, paused);

  // X domain: either the whole roast, or a trailing window the user can pan.
  const domain = React.useMemo(() => {
    if (windowMode === "expand") return [0, Math.max(total, 60, planEnd)];
    const end = Math.max(WINDOW_SECONDS, total + lookahead) - panOffset;
    return [Math.max(0, end - WINDOW_SECONDS), Math.max(WINDOW_SECONDS, end)];
  }, [windowMode, total, panOffset, planEnd, lookahead]);

  // Phase bands shade the plot to show each phase's real DURATION, which four
  // evenly spaced rail nodes never could. They carry no text: the name lives in
  // the ribbon above the plot instead. In-plot labels sat at the band's
  // top-left, which is exactly where the y-axis ticks are, and any band under
  // 20% of the window dropped its label entirely -- so on a full-roast view DEV
  // and COOL went unnamed, in the mode where the name matters most.
  const band = (from, to, key, active, phaseKey) => {
    if (from == null || to == null || to <= from) return null;
    return (
      <ReferenceArea
        key={key}
        x1={from}
        x2={to}
        yAxisId="temp"
        fill={`rgb(var(${PHASE_VAR[phaseKey] || "--border-color"}))`}
        fillOpacity={active ? 0.2 : 0.1}
        stroke="none"
      />
    );
  };

  // Capped like the model's `total`: the stored clock can run past it (the
  // timer keeps going after DROP), and this feeds the live-edge line and the
  // phase spans, so 1e9 here must not reach the SVG.
  const now = Math.min(Math.max(elapsedSeconds, total), MAX_ROAST_S);
  // Where the tracked roast stops: the drop if there is one, otherwise the
  // moving live edge.
  const end = drop != null ? Math.min(drop, MAX_ROAST_S) : now;

  // Which phase is happening right now -- this is the band that gets lit up.
  // Declared after `now` deliberately: it reads it.
  const bounds = { maillard, caramelization, firstCrack, drop };
  const currentPhase = phaseKeyAt(now, bounds) || "drying";

  // Which phase a given second falls in, for the tooltip header. Read from the
  // same boundaries the bands and ribbon use, so the three can never disagree.
  const phaseNameAt = (t) => PHASE_NAMES[phaseKeyAt(t, bounds)] || null;
  // A moment within a few seconds of the scan point wins the header: that is
  // the question being asked when you put a finger on a dot. Otherwise the
  // header names the phase this second falls in.
  const momentNear = (t) => {
    let best = null;
    for (const m of moments) {
      const d = Math.abs(m.t - t);
      if (d <= 4 && (!best || d < Math.abs(best.t - t))) best = m;
    }
    return best;
  };
  const tooltipLabel = (v) => {
    const m = momentNear(v);
    if (m) return `${fmt(v)} · ${m.name}`;
    const name = phaseNameAt(v);
    return name ? `${fmt(v)} · ${name}` : fmt(v);
  };

  // Phase ribbon -- a dedicated lane above the plot carrying the phase names.
  // Its own row is the whole point: a name here can never collide with the
  // curve, the y-axis ticks, or the next phase's name, so every phase stays
  // named at every window width instead of dropping out when its band is
  // narrow. Segment WIDTH still reads as duration, same as the bands below.
  //
  // Geometry note: the segments must line up with the plot area, not the
  // container, so the lane is inset by the two y-axis widths below.
  // Four spans. No Cooling band: the roaster runs its own cool cycle after the
  // drop and there is nothing to track in it, so DROP is where the data ends.
  const phases = phaseSpans({ maillard, caramelization, firstCrack }, end);
  const span = domain[1] - domain[0];
  const segments = phases
    .map((p) => {
      if (p.from == null || p.to == null || p.to <= p.from) return null;
      // Clamp into the visible window; a phase that started before it still
      // shows, anchored at the left edge.
      const a = Math.max(p.from, domain[0]);
      const b = Math.min(p.to, domain[1]);
      if (span <= 0 || b <= a) return null;
      const left = ((a - domain[0]) / span) * 100;
      const width = ((b - a) / span) * 100;
      const fits = ribbonWidth > 0 && (width / 100) * ribbonWidth >= tagWidth(p.tag) + 6;
      return { ...p, left, width, fits, active: currentPhase === p.key };
    })
    .filter(Boolean);

  return (
    <div className={attached
      ? "px-2 pb-3 pt-3"
      : "mt-3 rounded-2xl border border-border/60 bg-card p-3"}>
      {/* Window controls. With a caption under them the row's own bottom margin
          drops to 2px and the caption carries the 8px, so the gap to the ribbon
          is unchanged. */}
      <div className={`${ghostReason ? "mb-0.5" : "mb-2"} flex items-center justify-between`}>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-muted">Live curve</span>
          {hasProfile && (
            <span className="rounded-full border border-border/60 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-ink-muted">
              profile
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {windowMode === "scroll" && (
            <>
              <button
                type="button"
                onClick={() => setPanOffset((p) => p + 30)}
                className="rounded-lg border border-border/60 px-2 py-1 font-mono text-[10px] text-ink-muted transition active:scale-95"
                aria-label="Scroll back 30 seconds"
              >
                &#9664;
              </button>
              <button
                type="button"
                onClick={() => setPanOffset((p) => Math.max(0, p - 30))}
                className="rounded-lg border border-border/60 px-2 py-1 font-mono text-[10px] text-ink-muted transition active:scale-95"
                aria-label="Scroll forward 30 seconds"
              >
                &#9654;
              </button>
              {!following && (
                <button
                  type="button"
                  onClick={() => setPanOffset(0)}
                  className="rounded-lg bg-accent px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-accent-text transition active:scale-95"
                >
                  Live
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => { setPanOffset(0); onWindowModeChange && onWindowModeChange(windowMode === "scroll" ? "expand" : "scroll"); }}
            className="rounded-lg border border-border/60 px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-ink-muted transition active:scale-95"
          >
            {windowMode === "scroll" ? "3 min" : "Full"}
          </button>
        </div>
      </div>

      {/* Why there is no ghost line, when a followed profile promised one. Its own
          row, never beside the badge: text that changes length must not share a
          row with the fixed controls or they wrap at 390px. Left edge matches the
          "Live curve" label (it captions the header, not the plot), so it is NOT
          inset like the ribbon. Stays through DROP and in both window modes so
          the controls below do not move under a thumb. Muted, not an error. */}
      {ghostReason && GHOST_CAPTION[ghostReason] && (
        <div data-testid="ghost-caption" className="mb-2 truncate font-mono text-[10px] text-ink-muted">
          {GHOST_CAPTION[ghostReason]}
        </div>
      )}

      {/* Phase ribbon. Inset by the two y-axis widths (42 left, 40 right) so the
          segments sit exactly over the plot area they describe. The right inset
          is 44, not 40: the RoR axis is 40 wide and the chart carries a further
          4px right margin. Measured against the rendered grid, not guessed. */}
      {segments.length > 0 && (
        <div className="mb-1 flex h-4 overflow-hidden rounded-[3px]" style={{ marginLeft: 42, marginRight: 44 }}>
          <div ref={ribbonRef} className="relative w-full">
            {segments.map((seg) => (
              <div
                key={seg.key}
                className="absolute inset-y-0 flex items-center justify-center overflow-hidden"
                style={{
                  left: `${seg.left}%`,
                  width: `${seg.width}%`,
                  background: `rgb(var(${PHASE_VAR[seg.key] || "--border-color"}) / ${seg.active ? 0.42 : 0.2})`,
                }}
                title={`${seg.tag} ${fmt(seg.from)}`}
              >
                {seg.fits && (
                  <span
                    className="px-[3px] font-mono text-[8.5px] uppercase tracking-[0.1em]"
                    style={{ color: `rgb(var(${PHASE_VAR[seg.key] || "--chart-tick"}))` }}
                  >
                    {seg.tag}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Temp + RoR. Its x-axis is hidden: the control map directly below shares
          this exact domain and carries the one time ruler for both panels.
          Two identical rulers 80px apart was the single biggest piece of
          restatement in this zone. */}
      <div className="relative">
      <ResponsiveContainer width="100%" height={attached ? 116 : 134}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgb(var(--border-color))" strokeOpacity={0.35} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={domain}
            allowDataOverflow
            tick={false}
            height={2}
            stroke="rgb(var(--border-color))"
          />
          <YAxis
            yAxisId="temp"
            // 475F is the ceiling: no roast has ever gone past it, so pinning the
            // top stops the curve rescaling itself every time the peak nudges up.
            // allowDataOverflow is required -- without it Recharts quietly widens
            // the domain to swallow any outlier and the cap does nothing.
            domain={["auto", 475]}
            allowDataOverflow
            ticks={[200, 275, 350, 425, 475]}
            width={42}
            stroke="rgb(var(--border-color))"
            fontSize={9}
            tick={{ fill: "rgb(var(--chart-tick))" }}
          />
          <YAxis
            yAxisId="ror"
            orientation="right"
            width={40}
            // Rounded up to a whole 10: the raw max * 1.2 printed ticks like
            // "489.5999" against the container edge.
            domain={[0, (max) => Math.max(10, Math.ceil((max * 1.2) / 10) * 10)]}
            allowDecimals={false}
            stroke="rgb(var(--border-color))"
            fontSize={9}
            tick={{ fill: "rgb(var(--chart-tick))" }}
          />
          {phases.map((p) =>
            band(p.from, p.to, `b-${p.key}`, currentPhase === p.key, p.key)
          )}
          {/* Moments: a dot on the curve at the reading it happened at. No text
              label -- Case reads the mark itself, and the tooltip names it on a
              scan. Rendered only where the curve has a value at that second, so
              a probe-less roast shows none rather than dots pinned at zero. */}
          {moments.map((m) => {
            const pt = data[Math.round(m.t)];
            const y = m.temp != null ? m.temp : (pt ? pt.temp : null);
            if (y == null) return null;
            return (
              <ReferenceDot
                key={`m-${m.label}`}
                x={m.t}
                y={y}
                yAxisId="temp"
                r={3.5}
                fill="rgb(var(--bg-surface))"
                stroke="rgb(var(--chart-temp))"
                strokeWidth={2}
                isFront
              />
            );
          })}
          <Tooltip
            contentStyle={{ background: "rgb(var(--bg-surface))", border: "1px solid rgb(var(--border-color))", borderRadius: 12, fontSize: 11 }}
            labelFormatter={tooltipLabel}
            formatter={(v, n) => [v, n]}
            // Painted above the countdown chip, which sits over the plot's top-left.
            wrapperStyle={{ zIndex: 20 }}
            // Each live value with its plan underneath. Recharts' default sorts by
            // name, which would read RoR first.
            itemSorter={(item) => TOOLTIP_ROWS.indexOf(item.name)}
          />
          {/* connectNulls is deliberately OFF on these two. This model already
              emits temp: null for a second with no reading (btAt is a per-second
              Map, not an interpolation), so a signal dropout is genuinely absent
              from the data -- connectNulls was drawing a straight line across it
              and making the live view claim a measurement it never had. The
              planned Fan/Heat lines in the control map below DO keep it: those
              steps are sparse by design, and joining them is the whole point.
              The ghost Temp (plan) line is not one of them -- it is a measured
              curve like these two, so it is OFF as well (see its own note).
              Leading nulls before the first reading are unaffected either way. */}
          {planMarkers.map((m) => (
            <ReferenceLine
              key={`plan-${m.label}`}
              x={m.t}
              yAxisId="temp"
              stroke="rgb(var(--chart-tick))"
              strokeOpacity={0.55}
              strokeDasharray="2 3"
              label={{ value: m.tag, position: "insideTopRight", fontSize: 8, fill: "rgb(var(--chart-tick))" }}
            />
          ))}
          {/* The source roast's pace, the twin of the bean-temp ghost below: the same
              dash and faintness in the RoR colour. It exists exactly when the BT
              ghost is drawn (a source too short for a pace simply has none) and,
              like it, has no connectNulls: the model leaves it null around a source
              hole. The ghost stack mirrors the live one, so every ghost sits under
              every live line. */}
          {ghost === "drawn" && planEnd > 0 && (
            <Line yAxisId="ror" type="monotone" dataKey="planRor" name="RoR (plan)" stroke="rgb(var(--chart-ror))" strokeWidth={1.2} strokeDasharray="4 3" strokeOpacity={0.5} dot={false} isAnimationActive={false} />
          )}
          {/* The source roast's bean-temp curve, drawn before the live lines so the
              live curve sits on top of what it is being steered against. No
              connectNulls: fillShortHoles already bridged every hole of LIVE_GAP_S
              or less, so a null left in the ghost is a stretch where the source
              roast's probe was out. It stays a gap rather than a dashed line to
              steer by over readings that never existed. */}
          {planEnd > 0 && (
            <Line yAxisId="temp" type="monotone" dataKey="planTemp" name="Temp (plan)" stroke="rgb(var(--chart-temp))" strokeWidth={1.4} strokeDasharray="4 3" strokeOpacity={0.5} dot={false} isAnimationActive={false} />
          )}
          <Line yAxisId="ror" type="monotone" dataKey="ror" name="RoR" stroke="rgb(var(--chart-ror))" strokeWidth={1.6} dot={false} isAnimationActive={false} />
          <Line yAxisId="temp" type="monotone" dataKey="temp" name="Temp" stroke="rgb(var(--chart-temp))" strokeWidth={2.4} dot={false} isAnimationActive={false} />
          <ReferenceLine x={now} yAxisId="temp" stroke="rgb(var(--accent-fill))" strokeOpacity={0.5} strokeDasharray="2 3" />
        </ComposedChart>
      </ResponsiveContainer>
      {/* First-crack countdown: one small window over the plot's top-left, where the
          curve is not yet (it climbs left to right) and, WHILE THE RoR AXIS FLOOR IS 0, the
          RoR line is not either. That condition is what the placement rests on: a charge dip
          pulls the floor down to about -99, and a 14-54 F/min RoR can then run under the chip's
          band in the 3-minute view at 390 px. Not verified on a device yet (visual_pending);
          the A11 check is the one that looks. An overlay, so nothing under the thumb moves
          when it arrives, and pointer-events-none so a finger scanning the chart under it still
          gets the tooltip. 48px = the 42px temp axis + 6. From the 340 F crossing until First
          crack or DROP; a feed that goes quiet, a paused clock or a flat rate only make it
          HELD -- the number stays. The HELD tag sits under the label, so a held chip is no
          wider than a counting one. */}
      {showFcEta && fcChip.parts && (
        <div
          data-testid="fc-eta"
          data-state={fcChip.state}
          role="timer"
          aria-label={fcChip.parts.ariaLabel}
          className={`pointer-events-none absolute left-[48px] top-2 flex items-center gap-1.5 rounded-md bg-surface/85 px-1.5 py-0.5 ${
            fcChip.state === "overdue" ? "ring-1 ring-accent/50" : ""
          }`}
        >
          <span className="flex flex-col items-start gap-px font-mono text-[9px] uppercase leading-[11px] tracking-[0.16em] text-ink-muted">
            <span>{fcChip.parts.label}</span>
            {fcChip.parts.tag && <span>{fcChip.parts.tag}</span>}
          </span>
          <span
            className={`font-mono text-[24px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${
              fcChip.parts.muted ? "text-ink-muted" : "text-accent-text"
            }`}
          >
            {fcChip.parts.numeral}
          </span>
        </div>
      )}
      </div>

      {/* Control map: actual vs planned */}
      <ResponsiveContainer width="100%" height={attached ? 90 : 104}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 10, left: 0 }}>
          <CartesianGrid stroke="rgb(var(--border-color))" strokeOpacity={0.3} vertical={false} />
          <XAxis dataKey="t" type="number" domain={domain} allowDataOverflow tickFormatter={fmt} stroke="rgb(var(--border-color))" fontSize={9} tick={{ fill: "rgb(var(--chart-tick))" }} />
          <YAxis
            yAxisId="dial"
            domain={[0, 10]}
            ticks={[1, 5, 9]}
            width={42}
            stroke="rgb(var(--border-color))"
            fontSize={9}
            tick={{ fill: "rgb(var(--chart-tick))" }}
          />
          {/* Invisible counterweight to the temp panel's right-hand RoR axis.
              Without it this panel's plot area is 40px wider than the one above,
              the two time scales disagree, and the shared ruler below lies about
              the curve. */}
          <YAxis yAxisId="dial-spacer" orientation="right" width={40} tick={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: "rgb(var(--bg-surface))", border: "1px solid rgb(var(--border-color))", borderRadius: 12, fontSize: 11 }}
            labelFormatter={tooltipLabel}
          />
          {/* Planned first, so actual draws on top of its target. */}
          {hasProfile && (
            <Line yAxisId="dial" type="stepAfter" dataKey="profFan" name="Fan (plan)" stroke="rgb(var(--chart-fan))" strokeWidth={1.2} strokeDasharray="3 3" strokeOpacity={0.75} dot={false} connectNulls isAnimationActive={false} />
          )}
          {hasProfile && (
            <Line yAxisId="dial" type="stepAfter" dataKey="profHeat" name="Heat (plan)" stroke="rgb(var(--chart-heat))" strokeWidth={1.2} strokeDasharray="3 3" strokeOpacity={0.75} dot={false} connectNulls isAnimationActive={false} />
          )}
          <Line yAxisId="dial" type="stepAfter" dataKey="fan" name="Fan" stroke="rgb(var(--chart-fan))" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          <Line yAxisId="dial" type="stepAfter" dataKey="heat" name="Heat" stroke="rgb(var(--chart-heat))" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          <ReferenceLine x={now} yAxisId="dial" stroke="rgb(var(--accent-fill))" strokeOpacity={0.5} strokeDasharray="2 3" />
        </ComposedChart>
      </ResponsiveContainer>

    </div>
  );
}
