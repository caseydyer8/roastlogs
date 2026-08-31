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
  ReferenceLine,
} from "recharts";

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

// Short names for the phase ribbon. Kept in one place because the ribbon lane
// is narrow: these want to stay 3-4 characters so a short phase still shows a
// readable name rather than a bare colour block.
const PHASE_TAGS = {
  drying: "DRY",
  maillard: "MAI",
  development: "DEV",
  cooling: "COOL",
};

// Acronyms belong on the charts, where space is the constraint. Everywhere with
// room -- the tooltip here, the Roast Timeline over in App.js -- says the full
// word, so the tooltip doubles as the key for the ribbon's short tags.
const PHASE_NAMES = {
  drying: "Drying",
  maillard: "Maillard",
  development: "Development",
  cooling: "Cooling",
};

// One tint per phase, shared by the ribbon segment and the shaded band beneath
// it so the two read as the same object. Previously every band used the same
// grey at 0.07 and only the active one differed, which on a dark ground made
// the phases indistinguishable in the plot.
const PHASE_VAR = {
  drying: "--phase-dry",
  maillard: "--phase-mai",
  caramelization: "--phase-car",
  development: "--phase-dev",
  cooling: "--phase-cool",
};
const ROR_LOOKBACK = 12;    // seconds; matches the retuned live/History tuning
const ROR_SMOOTH = 4;       // +/- seconds of moving average

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
export function buildLiveChartModel({ curve = [], roastLog = [], profile = null, elapsedSeconds = 0 }) {
    const total = Math.max(elapsedSeconds, curve.length ? curve[curve.length - 1].t : 0, 1);

    // Phase boundaries from the roast log.
    const phaseAt = (label) => {
      const e = roastLog.find((x) => x && x.type === "phase" && x.label === label);
      return e ? Number(e.t) : null;
    };
    const yellowing = phaseAt("YELLOWING");
    const firstCrack = phaseAt("FIRST CRACK");
    const cooling = phaseAt("COOLING START");

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

    const data = [];
    let heat = null, fan = null, eIdx = 0;
    let pHeat = null, pFan = null, sIdx = 0;
    let lastBt = null;

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
      if (bt != null) lastBt = bt;
      data.push({
        t,
        temp: bt != null ? Math.round(bt * 10) / 10 : null,
        heat,
        fan,
        profHeat: pHeat,
        profFan: pFan,
        ror: null,
      });
    }

    // RoR over a trailing window, then lightly smoothed -- a raw point-to-point
    // slope on 1Hz thermocouple data reads as pure jitter.
    const raw = new Array(data.length).fill(null);
    for (let t = ROR_LOOKBACK; t < data.length; t++) {
      const a = data[t - ROR_LOOKBACK].temp;
      const b = data[t].temp;
      if (a != null && b != null) raw[t] = (b - a) * (60 / ROR_LOOKBACK);
    }
    for (let t = 0; t < data.length; t++) {
      if (raw[t] == null) continue;
      let sum = 0, n = 0;
      for (let k = Math.max(0, t - ROR_SMOOTH); k <= Math.min(data.length - 1, t + ROR_SMOOTH); k++) {
        if (raw[k] != null) { sum += raw[k]; n++; }
      }
      data[t].ror = n ? Math.round((sum / n) * 10) / 10 : null;
    }

    return { data, total, yellowing, firstCrack, cooling, lastBt, hasProfile: steps.length > 0 };
}

export default function LiveRoastChart({
  curve = [],
  roastLog = [],
  profile = null,
  elapsedSeconds = 0,
  windowMode = "scroll", // "scroll" (last 3 min, pannable) | "expand" (whole roast)
  onWindowModeChange,
  attached = false, // rendered inside the hero card -> no border/background of its own
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

  const model = React.useMemo(
    () => buildLiveChartModel({ curve, roastLog, profile, elapsedSeconds }),
    [curve, roastLog, profile, elapsedSeconds]
  );

  const { data, total, yellowing, firstCrack, cooling, hasProfile } = model;

  // X domain: either the whole roast, or a trailing window the user can pan.
  const domain = React.useMemo(() => {
    if (windowMode === "expand") return [0, Math.max(total, 60)];
    const end = Math.max(WINDOW_SECONDS, total) - panOffset;
    return [Math.max(0, end - WINDOW_SECONDS), Math.max(WINDOW_SECONDS, end)];
  }, [windowMode, total, panOffset]);

  // Which phase is happening right now -- this is the band that gets lit up.
  const currentPhase = cooling != null ? "cooling"
    : firstCrack != null ? "development"
    : yellowing != null ? "maillard"
    : "drying";

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

  const now = Math.max(elapsedSeconds, total);

  // Which phase a given second falls in, for the tooltip header. Read from the
  // same boundaries the bands and ribbon use, so the three can never disagree.
  const phaseNameAt = (t) => {
    if (cooling != null && t >= cooling) return PHASE_NAMES.cooling;
    if (firstCrack != null && t >= firstCrack) return PHASE_NAMES.development;
    if (yellowing != null && t >= yellowing) return PHASE_NAMES.maillard;
    if (t >= 0) return PHASE_NAMES.drying;
    return null;
  };
  const tooltipLabel = (v) => {
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
  const phases = [
    { tag: PHASE_TAGS.drying, from: 0, to: yellowing ?? now, key: "drying" },
    { tag: PHASE_TAGS.maillard, from: yellowing, to: firstCrack ?? now, key: "maillard" },
    { tag: PHASE_TAGS.development, from: firstCrack, to: cooling ?? now, key: "development" },
    { tag: PHASE_TAGS.cooling, from: cooling, to: cooling != null ? now : null, key: "cooling" },
  ];
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
      {/* Window controls */}
      <div className="mb-2 flex items-center justify-between">
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
          {band(0, yellowing ?? now, "b-dry", currentPhase === "drying", "drying")}
          {band(yellowing, firstCrack ?? now, "b-mail", currentPhase === "maillard", "maillard")}
          {band(firstCrack, cooling ?? now, "b-dev", currentPhase === "development", "development")}
          {cooling != null && band(cooling, now, "b-cool", currentPhase === "cooling", "cooling")}
          <Tooltip
            contentStyle={{ background: "rgb(var(--bg-surface))", border: "1px solid rgb(var(--border-color))", borderRadius: 12, fontSize: 11 }}
            labelFormatter={tooltipLabel}
            formatter={(v, n) => [v, n]}
          />
          <Line yAxisId="ror" type="monotone" dataKey="ror" name="RoR" stroke="rgb(var(--chart-ror))" strokeWidth={1.6} dot={false} connectNulls isAnimationActive={false} />
          <Line yAxisId="temp" type="monotone" dataKey="temp" name="Temp" stroke="rgb(var(--chart-temp))" strokeWidth={2.4} dot={false} connectNulls isAnimationActive={false} />
          <ReferenceLine x={now} yAxisId="temp" stroke="rgb(var(--accent-fill))" strokeOpacity={0.5} strokeDasharray="2 3" />
        </ComposedChart>
      </ResponsiveContainer>

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
