import React from "react";

// Compact live readout for the Roast tab: a status dot, the live bean temp in
// the instrument's mono numerals, and smoothed RoR. Stays hidden for "idle",
// "connecting", and "no-bridge" -- so a probe-less manual roast never shows a
// nagging "offline" banner. It only reveals itself once a bridge has actually
// been seen on the channel, at which point "bridge-only" (device unreachable)
// becomes useful troubleshooting info rather than noise.
//
// The one exception is `held` (cluster variant only): a PROBE roast under way.
// From START until the roast is saved or discarded -- not until COOLING START, since
// a hold that ends at a tap collapses the hero under the thumb -- the readout's slot
// belongs to the probe, so it never disappears. It says what the feed is doing, in one
// muted look, and its height never changes, so a feed change never moves a control
// (RL-039):
//   live        Bean temp   (unchanged)
//   no-signal   No signal   (unchanged; error red means "go check the device")
//   feed-lost   Feed lost   status "no-bridge": the bridge app is gone
//   connecting  Connecting  status "idle"/"connecting": a reload, not yet an alarm
//                           (the caller turns it into "no-bridge" after ~15 s of no
//                           answer: readoutFeedStatus in lib/liveChartAutoOpen.js)
// The two held looks show dashes, not the last reading: a measurement that has
// stopped shows no number (a frozen 34 px 386 reads as live at arm's length). The
// chart, still mounted, shows the last reading and how old it is. No card, no red:
// the roast is fine, only the feed is not.

const DOT = {
  live: "bg-success",
  "bridge-only": "bg-error",
};

const LABEL = {
  live: "LIVE",
  "bridge-only": "NO SIGNAL",
};

// status -> the look. Anything else that gets this far is held and not yet heard from.
const VIEW = {
  live: "live",
  "bridge-only": "no-signal",
  "no-bridge": "feed-lost",
};

const HELD_LABEL = {
  "feed-lost": "Feed lost",
  connecting: "Connecting",
};

export default function LiveRoastReadout({ status, bt, ror, viewers, expanded, onToggle, inset = false, cluster = false, held = false }) {
  const signalled = status === "live" || status === "bridge-only";
  if (!signalled && !held) return null;

  const rorText =
    typeof ror === "number" ? `${ror >= 0 ? "+" : ""}${ror.toFixed(1)}` : "--";

  // Cluster variant: the right half of the instrument's top row, so the elapsed
  // time and the bean temp read as one instrument panel instead of two widgets.
  if (cluster) {
    const view = VIEW[status] || "connecting";
    const isHeld = !signalled;
    // No onToggle = nothing to draw yet (a Razzo roast started with the bridge off):
    // the cue still shows, but it is not a button that could arm a chart that would
    // pop in under the thumb later.
    const inert = !onToggle;
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={inert}
        aria-expanded={!!expanded}
        data-testid="live-readout"
        data-state={view}
        className={`flex shrink-0 items-start gap-1 text-right transition ${inert ? "" : "active:scale-[0.98]"}`}
      >
        <span className="block">
          <span className="flex items-center justify-end gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-muted">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isHeld ? "bg-ink-muted" : `${DOT[status]} ${status === "live" ? "animate-pulse" : ""}`
              }`}
            />
            {isHeld ? HELD_LABEL[view] : status === "live" ? "Bean temp" : "No signal"}
          </span>
          <span className={`mt-1 block font-mono text-[34px] font-semibold leading-none tabular-nums ${isHeld ? "text-ink-muted" : "text-chart-temp"}`}>
            {!isHeld && typeof bt === "number" ? Math.round(bt) : "--"}
            <span className="ml-0.5 text-[13px] font-medium text-ink-muted">&deg;F</span>
          </span>
          <span className={`mt-1.5 block font-mono text-[12px] tabular-nums ${isHeld ? "text-ink-muted" : "text-chart-ror"}`}>
            {isHeld ? "--" : rorText}
            <span className="ml-1 text-[9px] uppercase tracking-[0.08em] text-ink-muted">&deg;/min</span>
          </span>
        </span>
        <svg
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform ${expanded ? "rotate-180" : ""} ${inert ? "opacity-40" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>
    );
  }

  // The card variants have no held look: without a signal they stay hidden.
  if (!signalled) return null;

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
