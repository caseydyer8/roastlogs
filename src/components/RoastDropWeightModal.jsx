import React from "react";
import { parseRoastedWeight, weightLossPercent, formatWeightLoss } from "../lib/roastedWeight";

// The question SAVE ROAST leaves behind: what did the roasted beans weigh?
//
// The roast is already written -- to storage and to the cloud queue -- before
// this opens, so no answer, SKIP included, can lose a roast. SAVE WEIGHT only
// ever adds one number to it. The weight-loss % moves with every keystroke and
// is the History "Wt Loss" tile's own figure (lib/roastedWeight.js).
//
// Purely presentational: App.js patches the roast, syncs it, and decides what
// comes next (the "keep this as a profile?" sheet, when one is due).

const primary =
  "w-full rounded-2xl bg-accent py-3.5 font-cond text-base font-bold uppercase tracking-[0.06em] text-accent-ink shadow-sm transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40";

export default function RoastDropWeightModal({
  roast,
  onSave,   // (grams: number) -> void
  onSkip,
}) {
  const [text, setText] = React.useState("");
  // null for anything that is not a real weight: nothing is saved, and SAVE
  // WEIGHT waits. An empty field is never read as 0.
  const weight = parseRoastedWeight(text);
  const loss = weightLossPercent(roast.greenWeight, weight);
  const green = Number(roast.greenWeight);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-primary/80 p-3 pt-[12vh] backdrop-blur-sm sm:items-center sm:pt-3"
      role="dialog"
      aria-modal="true"
      aria-label="Roasted weight"
      data-testid="drop-weight"
    >
      {/* Sits in the upper part of a phone screen, not the bottom: the number
          keypad rises over the bottom, and both buttons must stay in sight. */}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (weight !== null) onSave(weight);
        }}
        className="w-full max-w-sm rounded-3xl border border-border/60 bg-surface p-5 shadow-2xl"
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-success-text">Roast saved</div>
        <h3 className="mt-1 font-cond text-2xl font-bold text-ink">Roasted weight</h3>
        <p className="mt-1 text-xs text-ink-muted">
          {green > 0 && (
            <>
              From <span className="font-mono font-bold tabular-nums text-ink">{green}g</span> green.{" "}
            </>
          )}
          Add it now, or later from History.
        </p>

        <div className="mt-4 rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20">
          <div className="flex items-baseline gap-1">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="190"
              aria-label="Roasted weight in grams"
              className="w-full bg-transparent font-mono text-2xl font-bold tabular-nums text-ink outline-none placeholder:text-ink-muted"
            />
            <span className="text-xs font-medium text-ink-muted">g</span>
          </div>
        </div>

        {/* Always there, so the card does not jump as the first digit lands. */}
        <div className="mt-3 flex items-baseline justify-between rounded-2xl border border-border/60 bg-primary/30 px-4 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Weight loss</div>
          <div
            aria-live="polite"
            className={`font-mono text-lg font-bold tabular-nums ${loss !== null ? "text-success-text" : "text-ink-muted"}`}
          >
            {loss !== null ? formatWeightLoss(loss) : "—"}
          </div>
        </div>

        {/* A typo hint, never a gate: the green weight may be the wrong number, so
            SAVE WEIGHT stays available. Absent without a green weight to compare to. */}
        {green > 0 && weight !== null && weight >= green && (
          <p className="mt-2 text-xs text-ink-muted">Heavier than the {green} g green weight: check the scale.</p>
        )}

        <div className="mt-4 space-y-2">
          <button type="submit" disabled={weight === null} className={primary}>
            SAVE WEIGHT
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full py-2.5 text-xs font-bold uppercase tracking-widest text-ink-muted transition hover:text-ink"
          >
            SKIP
          </button>
        </div>
      </form>
    </div>
  );
}
