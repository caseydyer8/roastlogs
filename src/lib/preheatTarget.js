// ---------------------------------------------------------------------------
// The preheat target, in degrees F: the BT the Roast tab waits for before it
// says "Ready to charge". Two screens edit it (Setup's field, the preheat
// screen's -5 / +5) and App.js reads it back from storage, so the range lives
// here once. A target outside it is never "ready" for the right reason -- a
// stored 0 reads as ready against a cold roaster and the warm-up chime, which
// needs a rising crossing of the target, can never fire.
//
// The two editors follow different rules on purpose:
//   typed entry   parsePreheatTarget -- an in-range whole number commits, ANYTHING
//                 else changes nothing. A half-typed "3" (the start of 330) must
//                 not become a near-cold 200 F target; that would recreate the
//                 bug it fixes.
//   the stepper   clampPreheatTarget -- -5 floors at 200, +5 stops at 500.
// ---------------------------------------------------------------------------

export const PREHEAT_MIN_F = 200;
export const PREHEAT_MAX_F = 500;
export const DEFAULT_PREHEAT_F = 315;

// Typed text or a number -> a number, or NaN. Number("") and Number(null) are
// both 0, which would otherwise read as a valid (cold) target.
const toNumber = (value) =>
  typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;

// What typed entry commits: the number, rounded to a whole degree, if that is in
// range. Out of range, empty, or not a number gives `fallback` -- the caller
// passes the target it already has, so a bad draft changes nothing.
export function parsePreheatTarget(value, fallback = DEFAULT_PREHEAT_F) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return fallback;
  const whole = Math.round(n);
  return whole >= PREHEAT_MIN_F && whole <= PREHEAT_MAX_F ? whole : fallback;
}

// What the preheat screen's -5 / +5 commits: a number the app computed, rounded
// and held to the range. Not for typed text -- a string here is a caller mistake
// and gets `fallback`, so it can never turn a "3" into 200.
export function clampPreheatTarget(value, fallback = DEFAULT_PREHEAT_F) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(PREHEAT_MAX_F, Math.max(PREHEAT_MIN_F, Math.round(value)));
}

// What the app trusts when it reads the stored value back at launch. Like typed
// entry, never a clamp: a stored value outside the range was never a deliberate
// choice (a build before this stored whatever the field held mid-keystroke: 0,
// or the 3 of a half-typed 330), so it falls back to the default.
export function storedPreheatTarget(raw) {
  return parsePreheatTarget(raw, DEFAULT_PREHEAT_F);
}
