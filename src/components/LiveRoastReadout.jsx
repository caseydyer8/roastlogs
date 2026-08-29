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

export default function LiveRoastReadout({ status, bt, ror, viewers, expanded, onToggle, inset = false, cluster = false }) {
  if (status !== "live" && status !== "bridge-only") return null;

  const rorText =
    typeof ror === "number" ? `${ror >= 0 ? "+" : ""}${ror.toFixed(1)}` : "--";

  // Cluster variant: the right half of the instrument's top row, so the elapsed
  // time and the bean temp read as one instrument panel instead of two widgets.
  if (cluster) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!!expanded}
        className="flex shrink-0 items-start gap-1 text-right transition active:scale-[0.98]"
      >
        <span className="block">
          <span className="flex items-center justify-end gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]} ${status === "live" ? "animate-pulse" : ""}`} />
            {status === "live" ? "Bean temp" : "No signal"}
          </span>
          <span className="mt-1 block font-mono text-[34px] font-semibold leading-none tabular-nums text-chart-temp">
            {typeof bt === "number" ? Math.round(bt) : "--"}
            <span className="ml-0.5 text-[13px] font-medium text-ink-muted">&deg;F</span>
          </span>
          <span className="mt-1.5 block font-mono text-[12px] tabular-nums text-chart-ror">
            {rorText}
            <span className="ml-1 text-[9px] uppercase tracking-[0.08em] text-ink-muted">&deg;/min</span>
          </span>
        </span>
        <svg
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!!expanded}
      className={inset
        ? "mt-4 flex w-full items-center justify-between border-t border-border/50 pt-3 text-left transition active:scale-[0.99]"
        : "mb-4 flex w-full items-center justify-between rounded-2xl border border-border/60 bg-card px-4 py-3 text-left transition active:scale-[0.99]"}>
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
