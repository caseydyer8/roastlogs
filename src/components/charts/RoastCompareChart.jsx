import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { equipmentLabel } from "../../lib/equipment";

// Same-bean roast comparison. Read-only over already-saved roasts — no data
// model changes. Each roast gets one identity color carried across the temp
// overlay, the Fan/Heat step overlays, the chips, and the stats table so a
// line never needs decoding. Capped at 3 series (beyond that nothing reads).

const SERIES_COLORS = [
  "rgb(var(--accent))",       // newest — ember
  "rgb(var(--chart-ror))",    // muted violet
  "rgb(var(--success-text))", // sage
];

const formatMMSS = (s) => {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
};

// Pull {t, v} readings of a field out of a saved roastLog (chronological).
const readings = (roast, field) =>
  (roast.roastLog || [])
    .filter((e) => (e.type === "adjustment" || e.type === "start_settings"))
    .map((e) => ({ t: e.t, v: e[field] === "" || e[field] == null ? null : Number(e[field]) }))
    .filter((p) => p.v != null && !Number.isNaN(p.v))
    .sort((a, b) => a.t - b.t);

const phaseT = (roast, label) => {
  const e = (roast.roastLog || []).find((x) => x.type === "phase" && x.label === label);
  return e ? e.t : null;
};

// Linear-interpolate a field's value at time t from its readings.
const valueAt = (pts, t) => {
  if (!pts.length) return null;
  if (t <= pts[0].t) return pts[0].v;
  if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].v;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].t >= t) {
      const a = pts[i - 1];
      const b = pts[i];
      const f = (t - a.t) / (b.t - a.t || 1);
      return a.v + (b.v - a.v) * f;
    }
  }
  return pts[pts.length - 1].v;
};

const roastStats = (roast) => {
  const temps = readings(roast, "temp");
  const fc = phaseT(roast, "FIRST CRACK");
  const cool = phaseT(roast, "COOLING START");
  const total = cool != null ? cool : roast.totalSeconds || 0;
  const fcTemp = fc != null ? valueAt(temps, fc) : null;
  const gw = Number(roast.greenWeight);
  const rw = Number(roast.roastedWeight);
  const wtLoss = gw > 0 && rw > 0 && rw < gw ? ((gw - rw) / gw) * 100 : null;
  const dtr = fc != null && total > 0 ? ((total - fc) / total) * 100 : null;
  return {
    duration: formatMMSS(total),
    fcTemp: fcTemp != null ? `${Math.round(fcTemp)}°` : "—",
    wtLoss: wtLoss != null ? `${wtLoss.toFixed(1)}%` : "—",
    dtr: dtr != null ? `${dtr.toFixed(0)}%` : "—",
  };
};

// Merge each roast's field readings onto a shared time grid so Recharts can
// overlay them (sparse rows + connectNulls draw each line through its points).
const buildGrid = (roasts, field) => {
  const perRoast = roasts.map((r) => readings(r, field));
  const allT = [...new Set(perRoast.flatMap((pts) => pts.map((p) => p.t)))].sort((a, b) => a - b);
  return allT.map((t) => {
    const row = { t };
    perRoast.forEach((pts, i) => {
      const exact = pts.find((p) => p.t === t);
      row[`s${i}`] = exact ? exact.v : null;
    });
    return row;
  });
};

function OverlayChart({ roasts, field, curveType, height, yDomain, yTicks }) {
  const data = buildGrid(roasts, field);
  const maxT = Math.max(1, ...roasts.map((r) => phaseT(r, "COOLING START") || r.totalSeconds || 0));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 10, bottom: 2, left: 0 }}>
        <CartesianGrid stroke="rgb(var(--chart-grid))" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={[0, maxT]}
          tickFormatter={formatMMSS}
          stroke="rgb(var(--border-color))"
          tick={{ fill: "rgb(var(--chart-tick))", fontSize: 10 }}
          minTickGap={40}
        />
        <YAxis
          domain={yDomain}
          ticks={yTicks}
          stroke="rgb(var(--border-color))"
          tick={{ fill: "rgb(var(--chart-tick))", fontSize: 10 }}
          width={40}
        />
        <Tooltip
          contentStyle={{
            background: "rgb(var(--bg-surface))",
            border: "1px solid rgb(var(--border-color))",
            borderRadius: 12,
            fontSize: 11,
          }}
          labelFormatter={(t) => formatMMSS(t)}
        />
        {roasts.map((r, i) => (
          <Line
            key={r.id}
            type={curveType}
            dataKey={`s${i}`}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={i === 0 ? 2.4 : 2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

const shortDate = (d) => (d || "").split(",")[0];

export default function RoastCompareChart({ roasts }) {
  const list = (roasts || []).slice(0, 3);
  if (list.length < 2) return null;

  // Flag it, don't guess it: roasts missing `equipment` entirely (pre-v3.7.0,
  // or "Not recorded") aren't a contradiction, so they never trigger this --
  // only two or more KNOWN, DIFFERENT setups do. The Razzo's thicker glass
  // carries more thermal mass, so a curve shift here can be hardware, not
  // technique.
  const knownSetups = [...new Set(list.map((r) => r.equipment?.setup).filter(Boolean))];
  const mixedEquipment = knownSetups.length > 1;

  return (
    <div className="space-y-4">
      {mixedEquipment && (
        <div className="rounded-2xl border border-accent/40 bg-accent/5 px-3 py-2 text-[11px] font-medium text-accent-text">
          Different equipment — {knownSetups.map(equipmentLabel).join(", ")} — curves
          aren't directly comparable.
        </div>
      )}

      {/* Legend chips */}
      <div className="flex flex-wrap gap-2">
        {list.map((r, i) => (
          <span
            key={r.id}
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/40 px-3 py-1.5 text-[11px] font-bold text-ink"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
            {shortDate(r.date)} · {r.targetLevel?.split(" ")[0]}
          </span>
        ))}
      </div>

      {/* Bean temp overlay */}
      <div className="rounded-3xl border border-border/50 bg-primary/40 p-4">
        <div className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-muted">Bean temp °F</div>
        <OverlayChart roasts={list} field="temp" curveType="monotone" height={170} yDomain={[100, 470]} yTicks={[150, 250, 350, 450]} />
      </div>

      {/* Fan + Heat step overlays */}
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-3xl border border-border/50 bg-primary/40 p-4">
          <div className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-muted">Fan · dial 1–9</div>
          <OverlayChart roasts={list} field="fan" curveType="stepAfter" height={110} yDomain={[1, 9]} yTicks={[1, 3, 5, 7, 9]} />
        </div>
        <div className="rounded-3xl border border-border/50 bg-primary/40 p-4">
          <div className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-muted">Heat · dial 1–9</div>
          <OverlayChart roasts={list} field="heat" curveType="stepAfter" height={110} yDomain={[1, 9]} yTicks={[1, 3, 5, 7, 9]} />
        </div>
      </div>

      {/* Side-by-side stats */}
      <div className="overflow-hidden rounded-2xl border border-border/60">
        <table className="w-full text-center">
          <thead>
            <tr className="bg-surface/40">
              <th className="p-2 text-left text-[9px] font-bold uppercase tracking-widest text-ink-muted"></th>
              {list.map((r, i) => (
                <th key={r.id} className="p-2">
                  <span className="inline-flex items-center gap-1.5 font-cond text-[11px] font-bold text-ink">
                    <span className="h-2 w-2 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                    {shortDate(r.date)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono text-[12.5px] tabular-nums text-ink">
            {[
              ["Duration", "duration"],
              ["FC Temp", "fcTemp"],
              ["Wt Loss", "wtLoss"],
              ["DTR", "dtr"],
            ].map(([label, key]) => (
              <tr key={key} className="border-t border-border/50">
                <td className="p-2 text-left font-sans text-[9px] font-bold uppercase tracking-widest text-ink-muted">{label}</td>
                {list.map((r) => (
                  <td key={r.id} className="p-2">{roastStats(r)[key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
