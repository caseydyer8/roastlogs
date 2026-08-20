import React from "react";

// Compact live readout for the Roast tab: a status dot, the live bean temp in
// the instrument's mono numerals, and smoothed RoR. Renders nothing until the
// bridge has been seen, so it stays invisible for probe-less setups and when no
// bridge is running — the manual flow is untouched underneath.

const DOT = {
  live: "bg-success",
  stale: "bg-error",
  connecting: "bg-ink-muted",
  idle: "bg-ink-muted",
};

const LABEL = {
  live: "LIVE",
  stale: "SIGNAL LOST",
  connecting: "CONNECTING",
  idle: "OFFLINE",
};

export default function LiveRoastReadout({ status, bt, ror, viewers }) {
  // Stay out of the way entirely until there is a bridge to talk to.
  if (status === "idle" || status === "connecting") return null;

  const rorText =
    typeof ror === "number" ? `${ror >= 0 ? "+" : ""}${ror.toFixed(1)}` : "--";

  return (
    <div className="mb-4 flex items-center justify-between rounded-2xl border border-border/60 bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${DOT[status] || DOT.idle} ${status === "live" ? "animate-pulse" : ""}`} />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
          {LABEL[status] || "OFFLINE"}
        </span>
        {viewers > 1 && (
          <span className="text-[11px] font-medium text-ink-muted">· {viewers} screens</span>
        )}
      </div>
      <div className="flex items-baseline gap-4">
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-2xl font-semibold tabular-nums text-ink">
            {typeof bt === "number" ? Math.round(bt) : "--"}
          </span>
          <span className="text-xs font-medium text-ink-muted">°F BT</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-lg font-semibold tabular-nums text-accent-text">
            {rorText}
          </span>
          <span className="text-xs font-medium text-ink-muted">°/min</span>
        </div>
      </div>
    </div>
  );
}
