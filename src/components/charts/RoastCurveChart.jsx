import React from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
  ReferenceArea,
  Label,
} from "recharts";
import {
  PHASE_NAMES,
  PHASE_VAR,
  MOMENT_LABELS,
  phaseBoundaries,
  momentsFrom,
  phaseKeyAt,
  phaseSpans,
} from "../../lib/roastPhases";

// ---------------------------------------------------------------------------
// RoastCurveChart — "Split Roast Story" History detail visualization (v1.1)
//
// Top chart:    Bean temp (monotone) + smoothed RoR over roast phase bands
// Bottom chart: Heat + Fan control map (stepAfter — discrete dial inputs are
//               NEVER smoothed) on the same phase timing, tooltips synced.
// Tiles:        Avg RoR · Avg Temp · Drop Temp · DTR. Current phase is
//               surfaced in the shared tooltip (not as standalone tiles).
// Preserves:    IDEA-004 profile deviation markers (on the control map).
//
// Data contract: receives the app's roast object; reads roast.roastLog
// (mixed entries: {type:'adjustment'|'start_settings'|'phase', t, heat, fan,
// temp, label}), roast.totalSeconds, roast.profile?.steps.
// ---------------------------------------------------------------------------

const formatMMSS = (secs) => {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

// Fritsch–Carlson monotone cubic interpolation. Honest smoothing: the curve
// passes exactly through every real temp reading and never invents overshoot.
function buildMonotoneInterpolator(points) {
  const pts = points.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  if (n === 0) return () => null;
  if (n === 1) return () => pts[0][1];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1));
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) {
        const tScale = 3 / Math.sqrt(s);
        m[i] = tScale * a * d[i];
        m[i + 1] = tScale * b * d[i];
      }
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let j = 0;
    while (xs[j + 1] < x) j++;
    const h = xs[j + 1] - xs[j];
    const u = (x - xs[j]) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (
      ys[j] * (2 * u3 - 3 * u2 + 1) +
      m[j] * h * (u3 - 2 * u2 + u) +
      ys[j + 1] * (-2 * u3 + 3 * u2) +
      m[j + 1] * h * (u3 - u2)
    );
  };
}

function StatTile({ label, value, accent }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-primary/40 px-2 py-2.5 text-center">
      <div className="text-[9px] font-semibold uppercase tracking-widest text-ink-muted">{label}</div>
      <div className={`mt-0.5 text-base font-extrabold tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "rgb(var(--bg-card))",
  border: "1px solid rgb(var(--border-color))",
  borderRadius: "14px",
  fontSize: "12px",
  padding: "8px 12px",
};

export default function RoastCurveChart({ roast }) {
  const model = React.useMemo(() => {
    if (!roast || !Array.isArray(roast.roastLog)) return null;
    const log = roast.roastLog;
    const total = Number(roast.totalSeconds) || 0;
    if (total <= 0) return null;

    // Shared with the live chart, fallback and all: Maillard opens at the 305F
    // crossing when the ladder logged one, and at the YELLOWING mark when it did
    // not. In History that fallback is the COMMON path -- every roast saved
    // before 2026-08-31 has no MAILLARD entry.
    const bounds = phaseBoundaries(log);
    const yellowing = bounds.yellowing;
    const firstCrack = bounds.firstCrack;
    const coolingStart = bounds.drop;
    const moments = momentsFrom(log);

    // Real temp readings, sorted ascending, plus dial state per second.
    const events = log
      .filter((e) => e.type === "adjustment" || e.type === "start_settings")
      .slice()
      .sort((a, b) => Number(a.t) - Number(b.t));
    // Prefer the live RoastLink curve (dense ~1Hz bean temp) when the roast has
    // one — the probe is the source of truth. Everything downstream (the temp
    // line, RoR, avg/FC/drop temps, DTR) reads from tempReadings, so this single
    // swap makes the whole chart probe-driven. Manual typed temps are the fallback
    // for roasts logged without the bridge.
    const curvePts = Array.isArray(roast.curve)
      ? roast.curve
          .filter((p) => p && Number.isFinite(Number(p.t)) && Number.isFinite(Number(p.bt)))
          .map((p) => [Number(p.t), Number(p.bt)])
      : [];
    const manualTemps = events
      .filter((e) => e.temp !== "" && e.temp !== null && e.temp !== undefined && Number(e.temp) > 0)
      .map((e) => [Number(e.t), Number(e.temp)]);
    const tempReadings = curvePts.length >= 2 ? curvePts : manualTemps;

    const tempAt = buildMonotoneInterpolator(tempReadings);
    const hasTemp = tempReadings.length >= 2;
    const firstTempT = tempReadings.length ? tempReadings[0][0] : null;
    const lastTempT = tempReadings.length ? tempReadings[tempReadings.length - 1][0] : null;

    // Per-second series: temp interpolated, RoR derived, dials carried forward.
    let heat = 0;
    let fan = 0;
    let eIdx = 0;
    const data = [];
    for (let t = 0; t <= total; t++) {
      while (eIdx < events.length && Number(events[eIdx].t) <= t) {
        const e = events[eIdx];
        if (e.heat) heat = Number(e.heat);
        if (e.fan) fan = Number(e.fan);
        eIdx++;
      }
      const inRange = hasTemp && t >= firstTempT && t <= lastTempT;
      const temp = inRange ? tempAt(t) : null;
      data.push({ t, temp: temp != null ? Math.round(temp * 10) / 10 : null, heat, fan, ror: null });
    }

    // RoR in °/min over a trailing 12s window, then lightly smoothed (±4s
    // moving average). Derived only where real readings bracket the window.
    // A 30s/±10s window (the original tuning) ate the first quarter of a
    // short 2-minute test roast before RoR could draw at all — 12s/±4s keeps
    // the same noise-smoothing intent while surfacing much sooner.
    if (hasTemp) {
      const RW = 12; // lookback window, seconds
      const SM = 4;  // smoothing half-width, seconds
      const raw = new Array(total + 1).fill(null);
      for (let t = firstTempT + RW; t <= lastTempT; t++) {
        const a = data[t - RW]?.temp;
        const b = data[t]?.temp;
        if (a != null && b != null) raw[t] = (b - a) * (60 / RW); // °/RWs → °/min
      }
      for (let t = 0; t <= total; t++) {
        if (raw[t] == null) continue;
        let sum = 0;
        let count = 0;
        for (let k = Math.max(0, t - SM); k <= Math.min(total, t + SM); k++) {
          if (raw[k] != null) {
            sum += raw[k];
            count++;
          }
        }
        data[t].ror = count ? Math.round((sum / count) * 10) / 10 : null;
      }
    }

    // Headline metrics.
    const temps = data.filter((d) => d.temp != null);
    const rors = data.filter((d) => d.ror != null);
    const avgTemp = temps.length ? temps.reduce((s, d) => s + d.temp, 0) / temps.length : null;
    const avgRor = rors.length ? rors.reduce((s, d) => s + d.ror, 0) / rors.length : null;
    const dropT = coolingStart != null ? coolingStart : total;
    const dropTemp = hasTemp ? tempAt(Math.min(dropT, lastTempT)) : null;
    const dtr = firstCrack != null && total > 0 ? ((dropT - firstCrack) / total) * 100 : null;
    // FC Temp = bean temp at first crack; Wt Loss = green→roasted mass lost.
    const fcTemp = hasTemp && firstCrack != null ? tempAt(Math.min(firstCrack, lastTempT)) : null;
    const gw = Number(roast.greenWeight);
    const rw = Number(roast.roastedWeight);
    const weightLoss = gw > 0 && rw > 0 && rw < gw ? ((gw - rw) / gw) * 100 : null;

    // Phase durations (Drying = start→yellowing, Maillard = yellowing→FC,
    // Development = FC→drop).
    const phases = {
      drying: yellowing != null ? yellowing : null,
      maillard: yellowing != null && firstCrack != null ? firstCrack - yellowing : null,
      development: firstCrack != null ? dropT - firstCrack : null,
    };

    // IDEA-004: profile deviation markers (ported from the original chart).
    const profileSteps = roast.profile && Array.isArray(roast.profile.steps) ? roast.profile.steps : [];
    const stepSecondsOf = (step) => {
      if (step.totalSeconds !== undefined && step.totalSeconds !== null) return step.totalSeconds;
      if (typeof step.time === "string" && step.time.includes(":")) {
        const [mm, ss] = step.time.split(":");
        return (parseInt(mm, 10) || 0) * 60 + (parseInt(ss, 10) || 0);
      }
      return 0;
    };
    const deviations = [];
    profileSteps.forEach((step) => {
      const stepSeconds = stepSecondsOf(step);
      const idx = Math.min(Math.max(stepSeconds, 0), data.length - 1);
      const inEffect = data[idx];
      if (!inEffect || (Number(inEffect.heat) === 0 && Number(inEffect.fan) === 0)) return;
      [
        { field: "Heat", target: Number(step.heat), logged: Number(inEffect.heat) },
        { field: "Fan", target: Number(step.fan), logged: Number(inEffect.fan) },
      ].forEach((c) => {
        if (Number.isNaN(c.target) || Number.isNaN(c.logged)) return;
        if (Math.abs(c.logged - c.target) > 1) {
          deviations.push({ t: stepSeconds, field: c.field, target: c.target, logged: c.logged });
        }
      });
    });

    return { data, total, yellowing, firstCrack, coolingStart, bounds, moments, avgTemp, avgRor, dropTemp, dtr, fcTemp, weightLoss, phases, deviations, hasTemp };
  }, [roast]);

  if (!model) return null;

  const { data, total, yellowing, firstCrack, coolingStart, bounds, moments, avgTemp, avgRor, dropTemp, dtr, fcTemp, weightLoss, deviations, hasTemp } = model;

  // Which roast phase a given second falls in -- resolved through the same
  // shared helper the live chart uses, so the two can never disagree about what
  // a moment in the roast is called.
  const phaseForT = (t) => (t == null ? null : PHASE_NAMES[phaseKeyAt(t, bounds)] || null);

  // A moment within a few seconds of the scan point wins the tooltip header:
  // that is the question being asked when you put a finger on a dot.
  const momentNear = (t) => {
    if (t == null) return null;
    let best = null;
    for (const m of moments) {
      const d = Math.abs(m.t - t);
      if (d <= 4 && (!best || d < Math.abs(best.t - t))) best = m;
    }
    return best;
  };

  // Shared dark tooltip for both charts. `variant` selects which measures to
  // show: "temp" → Temp + RoR (top chart), "dial" → Heat + Fan (bottom chart).
  const CustomTooltip = ({ active, payload, variant }) => {
    if (!active || !payload || !payload.length) return null;
    const t = payload[0]?.payload?.t;
    const phase = phaseForT(t);
    const valOf = (key) => {
      const item = payload.find((p) => p.dataKey === key);
      return item && item.value != null ? item.value : null;
    };
    const rows = [];
    if (variant === "temp") {
      const temp = valOf("temp");
      const ror = valOf("ror");
      if (temp != null) rows.push(["Temp", `${temp}°`, "rgb(var(--chart-temp))"]);
      if (ror != null) rows.push(["RoR", `${ror}°/min`, "rgb(var(--chart-ror))"]);
    } else {
      const heat = valOf("heat");
      const fan = valOf("fan");
      if (heat != null) rows.push(["Heat", `${heat}`, "rgb(var(--chart-heat))"]);
      if (fan != null) rows.push(["Fan", `${fan}`, "rgb(var(--chart-fan))"]);
    }
    return (
      <div style={tooltipStyle}>
        <div style={{ color: "rgb(var(--text-primary))", fontWeight: 700, marginBottom: 3 }}>
          {formatMMSS(t)}
          {(() => { const m = momentNear(t); return m ? ` · ${m.name}` : ""; })()}
        </div>
        {phase && (
          <div style={{ fontSize: 11, marginBottom: 2 }}>
            <span style={{ color: "rgb(var(--text-muted))" }}>Phase </span>
            <span style={{ color: "rgb(var(--text-primary))", fontWeight: 600 }}>{phase}</span>
          </div>
        )}
        {rows.map(([label, val, color]) => (
          <div key={label} style={{ color, fontSize: 12, padding: "1px 0" }}>
            {label}: {val}
          </div>
        ))}
      </div>
    );
  };

  // Divider label as a small pill sitting just above the plot area (in the top
  // margin) so it reads clearly without overlapping the curves.
  const phaseLabelContent = (text, color) => ({ viewBox }) => {
    const cx = viewBox.x;
    const topY = viewBox.y;
    const w = text.length * 6.5 + 10;
    const h = 14;
    const boxY = topY - h - 2;
    return (
      <g>
        <rect x={cx - w / 2} y={boxY} width={w} height={h} rx={3} fill="rgb(var(--bg-surface))" stroke="rgb(var(--border-color))" strokeWidth={0.5} opacity={0.92} />
        <text x={cx} y={boxY + h / 2 + 0.5} textAnchor="middle" dominantBaseline="central" fill={color} fontSize={10} fontWeight={600}>
          {text}
        </text>
      </g>
    );
  };

  // Four spans, tinted from the same semantic tokens the live chart uses. These
  // were three hardcoded hexes (#f59e0b, #22c55e, #a78bfa) that ignored the
  // light/dark toggle entirely and matched nothing in the live palette, so the
  // same roast was amber on one screen and warm grey on the other.
  // Phase ribbon. History is ALWAYS a full-roast view, so it is the worst case
  // for fit rather than the average -- measure the lane and test each tag
  // against its own segment rather than assuming the live chart's numbers.
  const ribbonRef = React.useRef(null);
  const [ribbonWidth, setRibbonWidth] = React.useState(0);
  React.useEffect(() => {
    const el = ribbonRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setRibbonWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const measureRef = React.useRef(null);
  const tagWidth = React.useCallback((tag) => {
    if (!measureRef.current) {
      if (typeof document === "undefined") return tag.length * 6;
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return tag.length * 6;
      ctx.font = "8.5px ui-monospace, SFMono-Regular, monospace";
      measureRef.current = ctx;
    }
    return measureRef.current.measureText(tag).width + tag.length * 0.85;
  }, []);

  const spanEnd = coolingStart != null ? coolingStart : total;
  const spans = phaseSpans(bounds, spanEnd).filter(
    (p) => p.from != null && p.to != null && p.to > p.from
  );

  const ribbonSegments = spans
    .map((p) => {
      if (!(total > 0)) return null;
      const left = (p.from / total) * 100;
      const width = ((p.to - p.from) / total) * 100;
      const fits = ribbonWidth > 0 && (width / 100) * ribbonWidth >= tagWidth(p.tag) + 6;
      return { ...p, left, width, fits };
    })
    .filter(Boolean);

  // Inset to match the plot area: 44px left axis, 10px right margin.
  const phaseRibbon = ribbonSegments.length > 0 && (
    <div className="mb-1 flex h-4 overflow-hidden rounded-[3px]" style={{ marginLeft: 44, marginRight: 10 }}>
      <div ref={ribbonRef} className="relative w-full">
        {ribbonSegments.map((seg) => (
          <div
            key={`rib-${seg.key}`}
            className="absolute inset-y-0 flex items-center justify-center overflow-hidden"
            style={{
              left: `${seg.left}%`,
              width: `${seg.width}%`,
              background: `rgb(var(${PHASE_VAR[seg.key] || "--border-color"}) / 0.28)`,
            }}
            title={`${seg.tag} ${formatMMSS(seg.from)}`}
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
  );

  // Moment dots, drawn only where the saved curve actually has a reading at
  // that second. A roast recorded before RoastLink carries no curve at all, so
  // this quietly renders nothing rather than pinning dots at zero.
  const momentDots = (axisId) =>
    momentsFrom(roast && roast.roastLog).map((m) => {
      const pt = data[Math.round(m.t)];
      const y = m.temp != null ? m.temp : (pt ? pt.temp : null);
      if (y == null) return null;
      return (
        <ReferenceDot
          key={`md-${axisId}-${m.label}`}
          x={m.t}
          y={y}
          yAxisId={axisId}
          r={3.5}
          fill="rgb(var(--bg-surface))"
          stroke="rgb(var(--chart-temp))"
          strokeWidth={2}
          isFront
        />
      );
    });

  const bands = (axisId) => (
    <>
      {spans.map((p) => (
        <ReferenceArea
          key={`band-${axisId}-${p.key}`}
          yAxisId={axisId}
          x1={p.from}
          x2={p.to}
          fill={`rgb(var(${PHASE_VAR[p.key] || "--border-color"}))`}
          fillOpacity={0.12}
          strokeOpacity={0}
        />
      ))}
    </>
  );

  // Boundary rules only. The in-plot pill labels are gone: they sat where the
  // y-axis ticks are, and the phase ribbon above the plot names every span
  // without ever colliding.
  const phaseLines = (withLabels, axisId) => (
    <>
      {[bounds.maillard, bounds.caramelization, firstCrack, coolingStart]
        .filter((t) => t != null)
        .map((t, i) => (
          <ReferenceLine
            key={`pl-${axisId}-${i}-${t}`}
            yAxisId={axisId}
            x={t}
            stroke="rgb(var(--border-color))"
            strokeDasharray="3 4"
          />
        ))}
    </>
  );

  const xAxisProps = {
    dataKey: "t",
    type: "number",
    domain: [0, total],
    tickFormatter: formatMMSS,
    stroke: "rgb(var(--border-color))",
    fontSize: 10,
    tick: { fill: "rgb(var(--chart-tick))" },
    minTickGap: 40,
  };

  return (
    <div className="space-y-4">
      {/* Headline metric tiles */}
      <div className="grid grid-cols-4 gap-2">
        <StatTile label="Avg RoR" value={avgRor != null ? `${avgRor.toFixed(1)}°/m` : "—"} accent="text-chart-ror" />
        <StatTile label="FC Temp" value={fcTemp != null ? `${Math.round(fcTemp)}°` : "—"} accent="text-accent-text" />
        <StatTile label="Wt Loss" value={weightLoss != null ? `${weightLoss.toFixed(1)}%` : "—"} accent="text-success-text" />
        <StatTile label="DTR" value={dtr != null ? `${dtr.toFixed(1)}%` : "—"} accent="text-ink" />
      </div>

      {/* Top chart — Development curve: temp + RoR over phase bands */}
      <div className="rounded-3xl border border-border/50 bg-primary/50 p-4">
        <div className="mb-2 flex items-center gap-4 text-[11px] text-ink-muted">
          <span className="font-semibold uppercase tracking-widest text-ink-muted">Development curve</span>
          <span><span className="mr-1.5 inline-block h-[3px] w-3.5 rounded bg-chart-temp align-middle" />Temp</span>
          <span><span className="mr-1.5 inline-block h-[3px] w-3.5 rounded bg-chart-ror align-middle" />RoR</span>
        </div>
        {phaseRibbon}
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} syncId="roastStory" margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--chart-grid))" vertical={false} />
              {bands("temp")}
              <XAxis {...xAxisProps} />
              <YAxis yAxisId="temp" stroke="rgb(var(--border-color))" fontSize={10} tick={{ fill: "rgb(var(--chart-tick))" }} domain={["auto", "auto"]} width={44} />
              <YAxis yAxisId="ror" hide domain={[0, (dataMax) => Math.max(10, dataMax * 1.15)]} />
              <Tooltip content={<CustomTooltip variant="temp" />} />
              {phaseLines(true, "temp")}
              {momentDots("temp")}
              {hasTemp && (
                <Line yAxisId="ror" type="monotone" dataKey="ror" stroke="rgb(var(--chart-ror))" strokeWidth={1.75} dot={false} name="RoR" connectNulls isAnimationActive={false} />
              )}
              {hasTemp && (
                <Line yAxisId="temp" type="monotone" dataKey="temp" stroke="rgb(var(--chart-temp))" strokeWidth={2.5} dot={false} name="Temp" connectNulls isAnimationActive={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom chart — Control map: heat + fan steps, same phase timing */}
      <div className="rounded-3xl border border-border/50 bg-primary/50 p-4">
        <div className="mb-2 flex items-center gap-4 text-[11px] text-ink-muted">
          <span className="font-semibold uppercase tracking-widest text-ink-muted">Control map</span>
          <span><span className="mr-1.5 inline-block h-[3px] w-3.5 rounded bg-chart-heat align-middle" />Heat</span>
          <span><span className="mr-1.5 inline-block h-[3px] w-3.5 rounded bg-chart-fan align-middle" />Fan</span>
          {deviations.length > 0 && (
            <span className="ml-auto text-[10px] text-error-text">⚠ {deviations.length} profile deviation{deviations.length > 1 ? "s" : ""}</span>
          )}
        </div>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} syncId="roastStory" margin={{ top: 22, right: 10, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--chart-grid))" vertical={false} />
              {bands("dial")}
              <XAxis {...xAxisProps} />
              <YAxis yAxisId="dial" stroke="rgb(var(--border-color))" fontSize={10} tick={{ fill: "rgb(var(--chart-tick))" }} domain={[0, 10]} ticks={[1, 3, 5, 7, 9]} width={44} />
              <Tooltip content={<CustomTooltip variant="dial" />} />
              {phaseLines(true, "dial")}
              <Line yAxisId="dial" type="stepAfter" dataKey="heat" stroke="rgb(var(--chart-heat))" strokeWidth={2.25} dot={false} name="Heat" isAnimationActive={false} />
              <Line yAxisId="dial" type="stepAfter" dataKey="fan" stroke="rgb(var(--chart-fan))" strokeWidth={2} dot={false} name="Fan" isAnimationActive={false} />
              {/* IDEA-004: profile deviation markers */}
              {deviations.map((d, idx) =>
                d.logged !== 0 ? (
                  <ReferenceDot key={`dev-${idx}`} yAxisId="dial" x={d.t} y={d.logged} r={5} fill="rgb(var(--chart-heat))" stroke="#fff" strokeWidth={1.5} isFront />
                ) : null
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
