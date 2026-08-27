import React from "react";

// Always-visible RoastLink status in Settings -- this is the "check from my
// phone whether the bridge is even running" view Case asked for, distinct
// from LiveRoastReadout (which only appears on the Roast tab, and only once a
// bridge has actually been seen, so it doesn't nag a probe-less roast).

const COPY = {
  idle: {
    dot: "bg-ink-muted",
    title: "Checking…",
    detail: "Connecting to the live channel.",
  },
  connecting: {
    dot: "bg-ink-muted",
    title: "Checking…",
    detail: "Connecting to the live channel.",
  },
  "no-bridge": {
    dot: "bg-ink-muted",
    title: "No bridge running",
    detail: "Open RoastLogs Bridge on the Mac and press Connect.",
  },
  "bridge-only": {
    dot: "bg-error",
    title: "Bridge up, device unreachable",
    detail: "The Mac app is connected, but no RoastLink temp has arrived. Check the device's WiFi and that a probe is seated.",
  },
  live: {
    dot: "bg-success",
    title: "Live",
    detail: "Receiving bean temp from the RoastLink.",
  },
};

export default function RoastLinkStatusCard({ status, bt, viewers }) {
  const c = COPY[status] || COPY.idle;
  return (
    <div className="rounded-2xl border border-border/60 bg-primary/20 p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${c.dot} ${status === "live" ? "animate-pulse" : ""}`} />
        <span className="text-sm font-semibold text-ink">{c.title}</span>
      </div>
      <div className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">{c.detail}</div>
      {status === "live" && (
        <div className="mt-3 flex items-center gap-4 border-t border-border/40 pt-3">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-lg font-semibold tabular-nums text-ink">
              {typeof bt === "number" ? Math.round(bt) : "--"}
            </span>
            <span className="text-[11px] font-medium text-ink-muted">°F BT</span>
          </div>
          <div className="text-[11px] font-medium text-ink-muted">
            {viewers} {viewers === 1 ? "screen" : "screens"} watching
          </div>
        </div>
      )}
    </div>
  );
}
