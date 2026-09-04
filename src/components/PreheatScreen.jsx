import React from "react";

// Fun, and spoken-and-shown as ONE message, so the phone (pocketed or
// face-down on a bench) and the screen always agree on what just happened.
// Change this one line to change the wording everywhere it appears.
const READY_MESSAGE = "Roaster's warmed up!";

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  return audioCtx;
}

// iOS Safari (and iOS PWAs) block WebAudio and speechSynthesis until a real
// user gesture has happened at least once. Call this from any early tap in
// the app -- by the time the preheat screen actually needs to alert, that
// gesture has already occurred, so the alert isn't the thing trying (and
// silently failing) to unlock audio for the first time.
export function primeAudio() {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  if (window.speechSynthesis) {
    const warm = new SpeechSynthesisUtterance(" ");
    warm.volume = 0;
    window.speechSynthesis.speak(warm);
  }
}

function playChime() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.5);
}

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

// Full-bleed preheat instrument. Takes over the Roast tab's hero slot
// whenever a probe is selected, a real live reading is on screen, and no
// roast has started yet -- see `preheatActive` in App.js. Fires the same
// alert every time BT rises through target, on ANY roast (not just
// back-to-back batches): a rising crossing is a rising crossing.
export default function PreheatScreen({ bt, target, onTargetChange }) {
  const [flash, setFlash] = React.useState(false);
  const [editingTarget, setEditingTarget] = React.useState(false);
  const hasReading = typeof bt === "number";
  const ready = hasReading && bt >= target;
  // Seeded from the FIRST real reading, not hardcoded true -- otherwise a
  // mount that lands already at/above target (chamber left warming, or the
  // screen re-engaging for the next batch) reads as a crossing that never
  // happened and alerts on nothing.
  const wasBelowRef = React.useRef(!ready);

  React.useEffect(() => {
    const isBelow = !(hasReading && bt >= target);
    // Only a RISING crossing alerts -- re-arms if the chamber cools back down
    // (e.g. the door was opened) and climbs through target again.
    if (wasBelowRef.current && !isBelow) {
      playChime();
      speak(READY_MESSAGE);
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1500);
      wasBelowRef.current = isBelow;
      return () => clearTimeout(t);
    }
    wasBelowRef.current = isBelow;
  }, [bt, target, hasReading]);

  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
        {ready ? "Ready to charge" : hasReading ? "Preheating" : "Preheat needed"}
      </div>

      <div
        className={`font-mono font-semibold leading-none tabular-nums transition-colors duration-300 text-[72px] ${
          ready ? "text-success-text" : "text-accent-text"
        } ${flash ? "animate-pulse" : ""}`}
      >
        {hasReading ? Math.round(bt) : "--"}
        <span className="ml-1 text-[22px] font-medium text-ink-muted">&deg;F</span>
      </div>

      <button
        type="button"
        onClick={() => setEditingTarget((v) => !v)}
        className="mt-1 font-mono text-[12px] text-ink-muted underline decoration-dotted underline-offset-4"
      >
        Target {target}&deg;F
      </button>

      {editingTarget && (
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => onTargetChange(Math.max(200, target - 5))}
            className="rounded-full border border-border/60 px-3 py-1 font-mono text-sm text-ink transition active:scale-95"
          >
            &minus;5
          </button>
          <span className="w-14 font-mono text-sm tabular-nums text-ink">{target}&deg;F</span>
          <button
            type="button"
            onClick={() => onTargetChange(target + 5)}
            className="rounded-full border border-border/60 px-3 py-1 font-mono text-sm text-ink transition active:scale-95"
          >
            +5
          </button>
        </div>
      )}

      {ready && (
        <div className="mt-1 font-cond text-[15px] font-bold text-success-text">
          {READY_MESSAGE}
        </div>
      )}
    </div>
  );
}
