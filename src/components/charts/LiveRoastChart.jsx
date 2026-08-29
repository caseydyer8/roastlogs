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

  // Phase bands carry their own name and start time, which is what retired the
  // separate phase rail. A band's WIDTH is the phase's real duration, so this
  // says strictly more than four evenly spaced nodes ever could.
  //
  // The label sits at the band's top-left, which is the one corner guaranteed to
  // be clear: at the moment a phase begins the curve is at its lowest point for
  // that phase, so it is always well below the label.
  const band = (from, to, key, active, tag) => {
    if (from == null || to == null || to <= from) return null;
    // Skip the label on a band too narrow to hold it, otherwise adjacent labels
    // collide the instant a milestone is logged and the new band is one pixel wide.
    const span = domain[1] - domain[0];
    const wideEnough = span > 0 && (to - from) / span >= 0.2;
    return (
      <ReferenceArea
        key={key}
        x1={from}
        x2={to}
        yAxisId="temp"
        fill={active ? "rgb(var(--accent-fill))" : "rgb(var(--border-color))"}
        fillOpacity={active ? 0.16 : 0.07}
        stroke="none"
        label={wideEnough && tag ? {
          value: `${tag} ${fmt(from)}`,
          position: "insideTopLeft",
          offset: 5,
          fontSize: 8.5,
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          letterSpacing: "0.1em",
          fill: active ? "rgb(var(--accent-text))" : "rgb(var(--chart-tick))",
        } : undefined}
      />
    );
  };

  const now = Math.max(elapsedSeconds, total);

  return (
    <div className={attached
      ? "px-2 pb-2 pt-3"
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

      {/* Temp + RoR */}
      <ResponsiveContainer width="100%" height={attached ? 132 : 150}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgb(var(--border-color))" strokeOpacity={0.35} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={domain}
            allowDataOverflow
            tickFormatter={fmt}
            stroke="rgb(var(--border-color))"
            fontSize={9}
            tick={{ fill: "rgb(var(--chart-tick))" }}
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
            domain={[0, (max) => Math.max(10, max * 1.2)]}
            stroke="rgb(var(--border-color))"
            fontSize={9}
            tick={{ fill: "rgb(var(--chart-tick))" }}
          />
          {band(0, yellowing ?? now, "b-dry", currentPhase === "drying", "DRY")}
          {band(yellowing, firstCrack ?? now, "b-mail", currentPhase === "maillard", "MAILLARD")}
          {band(firstCrack, cooling ?? now, "b-dev", currentPhase === "development", "DEV")}
          {cooling != null && band(cooling, now, "b-cool", currentPhase === "cooling", "COOL")}
          <Tooltip
            contentStyle={{ background: "rgb(var(--bg-surface))", border: "1px solid rgb(var(--border-color))", borderRadius: 12, fontSize: 11 }}
            labelFormatter={(v) => fmt(v)}
            formatter={(v, n) => [v, n]}
          />
          <Line yAxisId="ror" type="monotone" dataKey="ror" name="RoR" stroke="rgb(var(--chart-ror))" strokeWidth={1.6} dot={false} connectNulls isAnimationActive={false} />
          <Line yAxisId="temp" type="monotone" dataKey="temp" name="Temp" stroke="rgb(var(--chart-temp))" strokeWidth={2.4} dot={false} connectNulls isAnimationActive={false} />
          <ReferenceLine x={now} yAxisId="temp" stroke="rgb(var(--accent-fill))" strokeOpacity={0.5} strokeDasharray="2 3" />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Control map: actual vs planned */}
      <ResponsiveContainer width="100%" height={attached ? 94 : 108}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 14, left: 0 }}>
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
          <Tooltip
            contentStyle={{ background: "rgb(var(--bg-surface))", border: "1px solid rgb(var(--border-color))", borderRadius: 12, fontSize: 11 }}
            labelFormatter={(v) => fmt(v)}
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

      {/* Legend */}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-wider text-ink-muted">
        <span className="flex items-center gap-1"><span className="h-0.5 w-3 rounded" style={{ background: "rgb(var(--chart-temp))" }} />Temp &deg;F</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-3 rounded" style={{ background: "rgb(var(--chart-ror))" }} />RoR &deg;/min</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-3 rounded" style={{ background: "rgb(var(--chart-fan))" }} />Fan</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-3 rounded" style={{ background: "rgb(var(--chart-heat))" }} />Heat <span className="opacity-60">dial 1-9</span></span>
        {hasProfile && <span className="opacity-70">dashed = plan</span>}
      </div>
    </div>
  );
}
