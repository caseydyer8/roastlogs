import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";

/**
 * RoastCurveChart
 *
 * Mobile-first Recharts component for one RoastLogs roast session.
 * - Temperature is smoothed with monotone interpolation.
 * - Heat and fan are discrete SR540 dial settings and MUST remain stepAfter.
 * - Data is passed in as props; this component does not query Supabase.
 */

const PHASES = [
  ["dryingEnd", "DE", "Drying End"],
  ["maillardEnd", "ME", "Maillard End"],
  ["firstCrack", "FC", "First Crack"],
  ["coolingStart", "Cool", "Cooling Start"],
];

const THEME = {
  dark: {
    shell: "bg-neutral-950 border-neutral-800 text-neutral-100",
    card: "bg-neutral-900/85 border-neutral-800",
    muted: "text-neutral-400",
    grid: "#27272a",
    axis: "#a1a1aa",
    tooltipBg: "#18181b",
    tooltipBorder: "#3f3f46",
    tooltipText: "#f4f4f5",
    temp: "#f59e0b",
    heat: "#ef4444",
    fan: "#38bdf8",
    ror: "#a78bfa",
    phase: "#d4d4d8",
  },
  light: {
    shell: "bg-stone-50 border-stone-200 text-stone-950",
    card: "bg-amber-50/70 border-stone-200",
    muted: "text-stone-500",
    grid: "#e7e5e4",
    axis: "#78716c",
    tooltipBg: "#fff7ed",
    tooltipBorder: "#d6d3d1",
    tooltipText: "#292524",
    temp: "#b45309",
    heat: "#dc2626",
    fan: "#0284c7",
    ror: "#7c3aed",
    phase: "#57534e",
  },
};

function formatTime(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return "—";
  const safeSeconds = Math.max(0, Math.round(Number(seconds)));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function movingAverage(points, key, windowSize = 3) {
  return points.map((point, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const values = points
      .slice(start, index + 1)
      .map((item) => item[key])
      .filter(isNumber);

    if (!values.length) return { ...point, [key]: null };

    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return { ...point, [key]: Number(average.toFixed(1)) };
  });
}

function buildRoR(adjustments, perSeconds = 60) {
  const tempPoints = adjustments
    .filter((point) => isNumber(point.t) && isNumber(point.temp))
    .sort((a, b) => a.t - b.t);

  if (tempPoints.length < 2) return [];

  const raw = tempPoints.map((point, index) => {
    if (index === 0) return { t: point.t, ror: null };

    const previous = tempPoints[index - 1];
    const deltaTemp = point.temp - previous.temp;
    const deltaTime = point.t - previous.t;

    if (deltaTime <= 0) return { t: point.t, ror: null };

    return {
      t: point.t,
      ror: Number(((deltaTemp / deltaTime) * perSeconds).toFixed(1)),
    };
  });

  return movingAverage(raw, "ror", 3);
}

function clampDial(value) {
  if (!isNumber(value)) return null;
  return Math.min(9, Math.max(1, value));
}

function normalizeAdjustments(adjustments, showRoR) {
  const safeAdjustments = Array.isArray(adjustments) ? adjustments : [];
  const sorted = safeAdjustments
    .filter((point) => isNumber(point?.t))
    .sort((a, b) => a.t - b.t)
    .map((point) => ({
      ...point,
      heat: clampDial(point.heat),
      fan: clampDial(point.fan),
      temp: isNumber(point.temp) ? point.temp : null,
      note: point.note || null,
    }));

  if (!showRoR) return sorted;

  const rorByTime = new Map(buildRoR(sorted).map((point) => [point.t, point.ror]));
  return sorted.map((point) => ({
    ...point,
    ror: rorByTime.has(point.t) ? rorByTime.get(point.t) : null,
  }));
}

function getStats(data, phases) {
  const maxAdjustmentTime = data.length ? Math.max(...data.map((point) => point.t)) : null;
  const coolingStart = isNumber(phases?.coolingStart) ? phases.coolingStart : null;
  const firstCrack = isNumber(phases?.firstCrack) ? phases.firstCrack : null;
  const totalTime = coolingStart ?? maxAdjustmentTime;

  const hasDtr =
    isNumber(firstCrack) &&
    isNumber(coolingStart) &&
    coolingStart > 0 &&
    coolingStart > firstCrack;

  return {
    totalTime,
    firstCrack,
    dtr: hasDtr ? ((coolingStart - firstCrack) / coolingStart) * 100 : null,
  };
}

function EmptyState({ palette }) {
  return (
    <div className={`rounded-2xl border p-4 ${palette.shell}`}>
      <div className={`rounded-xl border p-5 text-center ${palette.card}`}>
        <p className="text-sm font-semibold">No roast curve data yet</p>
        <p className={`mt-1 text-xs ${palette.muted}`}>
          Add at least one adjustment entry to show heat, fan, and temperature.
        </p>
      </div>
    </div>
  );
}

function RoastTooltip({ active, payload, label, palette, tempUnit, showRoR }) {
  if (!active || !payload?.length) return null;

  const values = Object.fromEntries(payload.map((item) => [item.dataKey, item.value]));
  const point = payload[0]?.payload || {};

  return (
    <div
      className="max-w-[230px] rounded-xl border px-3 py-2 text-xs shadow-xl"
      style={{
        background: palette.tooltipBg,
        borderColor: palette.tooltipBorder,
        color: palette.tooltipText,
      }}
    >
      <div className="mb-1 font-semibold">{formatTime(label)}</div>
      {values.temp != null && <div>Temp: {values.temp}°{tempUnit}</div>}
      {values.heat != null && <div>Heat: {values.heat}</div>}
      {values.fan != null && <div>Fan: {values.fan}</div>}
      {showRoR && values.ror != null && <div>RoR: {values.ror}°{tempUnit}/min</div>}
      {point.note && (
        <div className="mt-2 border-t pt-2" style={{ borderColor: palette.tooltipBorder }}>
          {point.note}
        </div>
      )}
    </div>
  );
}

export default function RoastCurveChart({
  adjustments = [],
  phases = {},
  tempUnit = "F",
  theme = "dark",
  showRoR = true,
}) {
  const palette = THEME[theme] || THEME.dark;
  const data = useMemo(
    () => normalizeAdjustments(adjustments, showRoR),
    [adjustments, showRoR]
  );
  const stats = useMemo(() => getStats(data, phases), [data, phases]);

  const hasTemp = data.some((point) => isNumber(point.temp));
  const hasDialData = data.some((point) => isNumber(point.heat) || isNumber(point.fan));
  const hasRoR = showRoR && data.some((point) => isNumber(point.ror));

  if (!data.length) return <EmptyState palette={palette} />;

  return (
    <section className={`rounded-2xl border p-3 shadow-sm ${palette.shell}`}>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className={`rounded-xl border p-2 ${palette.card}`}>
          <div className={`text-[10px] uppercase tracking-wide ${palette.muted}`}>Total</div>
          <div className="text-sm font-semibold">{formatTime(stats.totalTime)}</div>
        </div>
        <div className={`rounded-xl border p-2 ${palette.card}`}>
          <div className={`text-[10px] uppercase tracking-wide ${palette.muted}`}>First crack</div>
          <div className="text-sm font-semibold">{formatTime(stats.firstCrack)}</div>
        </div>
        <div className={`rounded-xl border p-2 ${palette.card}`}>
          <div className={`text-[10px] uppercase tracking-wide ${palette.muted}`}>DTR</div>
          <div className="text-sm font-semibold">
            {stats.dtr == null ? "—" : `${stats.dtr.toFixed(1)}%`}
          </div>
        </div>
      </div>

      <div className={`rounded-2xl border p-2 ${palette.card}`}>
        <div className="h-[290px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 16, right: 4, bottom: 6, left: -12 }}
            >
              <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />

              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={formatTime}
                tick={{ fill: palette.axis, fontSize: 11 }}
                axisLine={{ stroke: palette.grid }}
                tickLine={{ stroke: palette.grid }}
                minTickGap={18}
              />

              {hasTemp && (
                <YAxis
                  yAxisId="temp"
                  orientation="left"
                  width={42}
                  tick={{ fill: palette.axis, fontSize: 11 }}
                  axisLine={{ stroke: palette.grid }}
                  tickLine={{ stroke: palette.grid }}
                  label={{
                    value: `°${tempUnit}`,
                    angle: -90,
                    position: "insideLeft",
                    fill: palette.axis,
                    fontSize: 11,
                  }}
                />
              )}

              {hasDialData && (
                <YAxis
                  yAxisId="dial"
                  orientation="right"
                  domain={[1, 9]}
                  ticks={[1, 3, 5, 7, 9]}
                  width={28}
                  tick={{ fill: palette.axis, fontSize: 11 }}
                  axisLine={{ stroke: palette.grid }}
                  tickLine={{ stroke: palette.grid }}
                />
              )}

              {hasRoR && (
                <YAxis
                  yAxisId="ror"
                  orientation="right"
                  hide
                  domain={["dataMin - 5", "dataMax + 5"]}
                />
              )}

              <Tooltip
                content={
                  <RoastTooltip
                    palette={palette}
                    tempUnit={tempUnit}
                    showRoR={showRoR}
                  />
                }
              />
              <Legend
                verticalAlign="bottom"
                height={28}
                wrapperStyle={{ color: palette.axis, fontSize: 11 }}
              />

              {PHASES.map(([key, shortLabel], index) => {
                const phaseTime = phases?.[key];
                if (!isNumber(phaseTime)) return null;

                return (
                  <ReferenceLine
                    key={key}
                    x={phaseTime}
                    stroke={palette.phase}
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                    label={{
                      value: shortLabel,
                      position: index % 2 === 0 ? "top" : "insideTop",
                      fill: palette.phase,
                      fontSize: 10,
                    }}
                  />
                );
              })}

              {hasTemp && (
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="temp"
                  name="Temp"
                  stroke={palette.temp}
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                  isAnimationActive={false}
                />
              )}

              {hasDialData && (
                <>
                  <Line
                    yAxisId="dial"
                    type="stepAfter"
                    dataKey="heat"
                    name="Heat"
                    stroke={palette.heat}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="dial"
                    type="stepAfter"
                    dataKey="fan"
                    name="Fan"
                    stroke={palette.fan}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                </>
              )}

              {hasRoR && (
                <Line
                  yAxisId="ror"
                  type="monotone"
                  dataKey="ror"
                  name={`RoR °${tempUnit}/min`}
                  stroke={palette.ror}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

export { buildRoR, formatTime };
