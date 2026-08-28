import React from "react";

// Compact live readout for the Roast tab: a status dot, the live bean temp in
// the instrument's mono numerals, and smoothed RoR. Stays hidden for "idle",
// "connecting", and "no-bridge" -- so a probe-less manual roast never shows a
// nagging "offline" banner. It only reveals itself once a bridge has actually
// been seen on the channel, at which point "bridge-only" (device unreachable)
// becomes useful troubleshooting info rather than noise.

const DOT = {
  live: "bg-success",
  "bridge-only": "bg-error",
};

const LABEL = {
  live: "LIVE",
  "bridge-only": "NO SIGNAL",
};

export default function LiveRoastReadout({ status, bt, ror, viewers, expanded, onToggle }) {
  if (status !== "live" && status !== "bridge-only") return null;

  const rorText =
    typeof ror === "number" ? `${ror >= 0 ? "+" : ""}${ror.toFixed(1)}` : "--";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!!expanded}
      className="mb-4 flex w-full items-center justify-between rounded-2xl border border-border/60 bg-card px-4 py-3 text-left transition active:scale-[0.99]">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${DOT[status]} ${status === "live" ? "animate-pulse" : ""}`} />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
          {LABEL[status]}
        </span>
        {status === "bridge-only" && (
          <span className="text-[11px] font-medium text-ink-muted">· bridge up, device unreachable</span>
        )}
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
        <svg
          className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </button>
  );
}
