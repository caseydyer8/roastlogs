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
    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/40 px-2 py-2.5 text-center">
      <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-base font-extrabold tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "#09090b",
  border: "1px solid #3f3f46",
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

    const phaseT = (label) => {
      const e = log.find((p) => p.type === "phase" && p.label === label);
      return e ? Number(e.t) : null;
    };
    const yellowing = phaseT("YELLOWING");
    const firstCrack = phaseT("FIRST CRACK");
    const coolingStart = phaseT("COOLING START");

    // Real temp readings, sorted ascending, plus dial state per second.
    const events = log
      .filter((e) => e.type === "adjustment" || e.type === "start_settings")
      .slice()
      .sort((a, b) => Number(a.t) - Number(b.t));
    const tempReadings = events
      .filter((e) => e.temp !== "" && e.temp !== null && e.temp !== undefined && Number(e.temp) > 0)
      .map((e) => [Number(e.t), Number(e.temp)]);

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

    // RoR in °/min over a trailing 30s window, then lightly smoothed (±10s
    // moving average). Derived only where real readings bracket the window.
    if (hasTemp) {
      const raw = new Array(total + 1).fill(null);
      for (let t = firstTempT + 30; t <= lastTempT; t++) {
        const a = data[t - 30]?.temp;
        const b = data[t]?.temp;
        if (a != null && b != null) raw[t] = (b - a) * 2; // °/30s → °/min
      }
      for (let t = 0; t <= total; t++) {
        if (raw[t] == null) continue;
        let sum = 0;
        let count = 0;
        for (let k = Math.max(0, t - 10); k <= Math.min(total, t + 10); k++) {
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

    return { data, total, yellowing, firstCrack, coolingStart, avgTemp, avgRor, dropTemp, dtr, phases, deviations, hasTemp };
  }, [roast]);

  if (!model) return null;

  const { data, total, yellowing, firstCrack, coolingStart, avgTemp, avgRor, dropTemp, dtr, deviations, hasTemp } = model;

  // Which roast phase a given time (seconds) falls in, using the same
  // yellowing / firstCrack / coolingStart boundaries as the bands. Falls back
  // sensibly when a boundary is missing.
  const phaseForT = (t) => {
    if (t == null) return null;
    if (yellowing != null && firstCrack != null) {
      if (t < yellowing) return "Drying";
      if (t < firstCrack) return "Maillard";
      if (coolingStart != null && t >= coolingStart) return "Cooling";
      return "Development";
    }
    if (firstCrack != null) return t < firstCrack ? "Pre-first-crack" : "Development";
    if (yellowing != null) return t < yellowing ? "Drying" : "Maillard";
    return null;
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
      if (temp != null) rows.push(["Temp", `${temp}°`, "#f59e0b"]);
      if (ror != null) rows.push(["RoR", `${ror}°/min`, "#a78bfa"]);
    } else {
      const heat = valOf("heat");
      const fan = valOf("fan");
      if (heat != null) rows.push(["Heat", `${heat}`, "#ef4444"]);
      if (fan != null) rows.push(["Fan", `${fan}`, "#38bdf8"]);
    }
    return (
      <div style={tooltipStyle}>
        <div style={{ color: "#fafafa", fontWeight: 700, marginBottom: 3 }}>{formatMMSS(t)}</div>
        {phase && (
          <div style={{ fontSize: 11, marginBottom: 2 }}>
            <span style={{ color: "#71717a" }}>Phase </span>
            <span style={{ color: "#e4e4e7", fontWeight: 600 }}>{phase}</span>
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
        <rect x={cx - w / 2} y={boxY} width={w} height={h} rx={3} fill="#18181b" stroke="#3f3f46" strokeWidth={0.5} opacity={0.92} />
        <text x={cx} y={boxY + h / 2 + 0.5} textAnchor="middle" dominantBaseline="central" fill={color} fontSize={10} fontWeight={600}>
          {text}
        </text>
      </g>
    );
  };

  const bands = (axisId) => (
    <>
      {yellowing != null && <ReferenceArea yAxisId={axisId} x1={0} x2={yellowing} fill="#f59e0b" fillOpacity={0.05} strokeOpacity={0} />}
      {yellowing != null && firstCrack != null && (
        <ReferenceArea yAxisId={axisId} x1={yellowing} x2={firstCrack} fill="#22c55e" fillOpacity={0.06} strokeOpacity={0} />
      )}
      {firstCrack != null && (
        <ReferenceArea yAxisId={axisId} x1={firstCrack} x2={coolingStart != null ? coolingStart : total} fill="#a78bfa" fillOpacity={0.07} strokeOpacity={0} />
      )}
    </>
  );

  const phaseLines = (withLabels, axisId) => (
    <>
      {yellowing != null && (
        <ReferenceLine yAxisId={axisId} x={yellowing} stroke="#52525b" strokeDasharray="3 4">
          {withLabels && <Label content={phaseLabelContent("YELLOW", "#a1a1aa")} />}
        </ReferenceLine>
      )}
      {firstCrack != null && (
        <ReferenceLine yAxisId={axisId} x={firstCrack} stroke="#52525b" strokeDasharray="3 4">
          {withLabels && <Label content={phaseLabelContent("FC", "#a78bfa")} />}
        </ReferenceLine>
      )}
      {coolingStart != null && (
        <ReferenceLine yAxisId={axisId} x={coolingStart} stroke="#52525b" strokeDasharray="3 4">
          {withLabels && <Label content={phaseLabelContent("DROP", "#a1a1aa")} />}
        </ReferenceLine>
      )}
    </>
  );

  const xAxisProps = {
    dataKey: "t",
    type: "number",
    domain: [0, total],
    tickFormatter: formatMMSS,
    stroke: "#52525b",
    fontSize: 10,
    tick: { fill: "#71717a" },
    minTickGap: 40,
  };

  return (
    <div className="space-y-4">
      {/* Headline metric tiles */}
      <div className="grid grid-cols-4 gap-2">
        <StatTile label="Avg RoR" value={avgRor != null ? `${avgRor.toFixed(1)}°/m` : "—"} accent="text-violet-400" />
        <StatTile label="Avg Temp" value={avgTemp != null ? `${Math.round(avgTemp)}°` : "—"} accent="text-amber-400" />
        <StatTile label="Drop Temp" value={dropTemp != null ? `${Math.round(dropTemp)}°` : "—"} accent="text-red-400" />
        <StatTile label="DTR" value={dtr != null ? `${dtr.toFixed(1)}%` : "—"} accent="text-green-400" />
      </div>

      {/* Top chart — Development curve: temp + RoR over phase bands */}
      <div className="rounded-3xl border border-zinc-800/50 bg-zinc-950/50 p-4">
        <div className="mb-2 flex items-center gap-4 text-[11px] text-zinc-400">
          <span className="font-semibold uppercase tracking-widest text-zinc-500">Development curve</span>
          <span><span className="mr-1.5 inline-block h-[3px] w-3.5 rounded bg-amber-500 align-middle" />Temp</span>
          <span><span className="mr-1.5 inline-block h-[3px] w-3.5 rounded bg-violet-400 align-middle" />RoR</span>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} syncId="roastStory" margin={{ top: 22, right: 10, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              {bands("temp")}
              <XAxis {...xAxisProps} />
              <YAxis yAxisId="temp" stroke="#52525b" fontSize={10} tick={{ fill: "#a1a1aa" }} domain={["auto", "auto"]} width={44} />
              <YAxis yAxisId="ror" hide domain={[0, (dataMax) => Math.max(10, dataMax * 1.15)]} />
              <Tooltip content={<CustomTooltip variant="temp" />} />
              {phaseLines(true, "temp")}
              {hasTemp && (
                <Line yAxisId="ror" type="monotone" dataKey="ror" stroke="#a78bfa" strokeWidth={1.75} dot={false} name="RoR" connectNulls isAnimationActive={false} />
              )}
              {hasTemp && (
                <Line yAxisId="temp" type="monotone" dataKey="temp" stroke="#f59e0b" strokeWidth={2.5} dot={false} name="Temp" connectNulls isAnimationActive={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom chart — Control map: heat + fan steps, same phase timing */}
      <div className="rounded-3xl border border-zinc-800/50 bg-zinc-950/50 p-4">
        <div className="mb-2 flex items-center gap-4 text-[11px] text-zinc-400">
          <span className="font-semibold uppercase tracking-widest text-zinc-500">Control map</span>
          <span><span className="mr-1.5 inline-block h-[3px] w-3.5 rounded bg-red-500 align-middle" />Heat</span>
          <span><span className="mr-1.5 inline-block h-[3px] w-3.5 rounded bg-sky-400 align-middle" />Fan</span>
          {deviations.length > 0 && (
            <span className="ml-auto text-[10px] text-red-400">⚠ {deviations.length} profile deviation{deviations.length > 1 ? "s" : ""}</span>
          )}
        </div>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} syncId="roastStory" margin={{ top: 22, right: 10, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              {bands("dial")}
              <XAxis {...xAxisProps} />
              <YAxis yAxisId="dial" stroke="#52525b" fontSize={10} tick={{ fill: "#a1a1aa" }} domain={[0, 10]} ticks={[1, 3, 5, 7, 9]} width={44} />
              <Tooltip content={<CustomTooltip variant="dial" />} />
              {phaseLines(true, "dial")}
              <Line yAxisId="dial" type="stepAfter" dataKey="heat" stroke="#ef4444" strokeWidth={2.25} dot={false} name="Heat" isAnimationActive={false} />
              <Line yAxisId="dial" type="stepAfter" dataKey="fan" stroke="#38bdf8" strokeWidth={2} dot={false} name="Fan" isAnimationActive={false} />
              {/* IDEA-004: profile deviation markers */}
              {deviations.map((d, idx) =>
                d.logged !== 0 ? (
                  <ReferenceDot key={`dev-${idx}`} yAxisId="dial" x={d.t} y={d.logged} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} isFront />
                ) : null
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
