// Shared contract for a live RoastLink bean-temp sample, as it arrives in the
// browser over Supabase Realtime.
//
// Why this file exists: `typeof x === "number"` is true for NaN and for
// Infinity, so the original checks let a faulty probe (or a malformed device
// frame) put a nonsense reading straight onto the roast curve. A k-type
// thermocouple that loses its junction classically reports a large negative
// sentinel (-9999), and a JSON frame carrying `1e309` parses to Infinity.
//
// The bridge validates the same way at the device edge (bridge/lib/roastlink.js,
// _onFrame). That duplication is deliberate: `bridge/` is a separate CommonJS
// package with its own lockfile and does not share a module graph with `src/`,
// so the two cannot import one definition. Change one, change the other.

// How long a reading stays trustworthy. Past this, the hook reports
// "bridge-only" rather than "live" and the roast curve stops recording, so a
// dropout leaves a real gap instead of a flat fabricated segment.
export const STALE_MS = 6000;

// The same threshold in seconds, used to recognise a gap when reading a saved
// curve back. Spacing wider than this means recording had legitimately stopped,
// so the history chart must not interpolate across it.
export const LIVE_GAP_S = STALE_MS / 1000;

// FAULT-DETECTION bounds, not a calibration claim. Deliberately far outside any
// real roast (ambient ~60F, drop ~430F) so they can never reject a genuine
// reading -- their only job is to catch non-finite values and the known
// open-thermocouple sentinels. Invalid data is REJECTED, never clamped: a
// clamped value would look like a plausible temperature and silently corrupt
// the curve, which is the exact failure this guards against.
export const TEMP_MIN_F = -50;
export const TEMP_MAX_F = 1000;

// A finite number inside [min, max]. Rejects NaN and +/-Infinity, which both
// pass a bare typeof check.
export function isFiniteInRange(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

// Optional numeric field: absent/null is fine, present-but-invalid is not.
function optional(value, min, max) {
  if (value === null || value === undefined) return null;
  return isFiniteInRange(value, min, max) ? value : null;
}

// Validate a broadcast payload and return a normalized sample, or null if the
// frame cannot be trusted. `bt` (bean temp) is the only required measure --
// it is what the curve and every temperature-derived milestone read.
export function normalizeLiveSample(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (!isFiniteInRange(payload.bt, TEMP_MIN_F, TEMP_MAX_F)) return null;
  return {
    bt: payload.bt,
    et: optional(payload.et, TEMP_MIN_F, TEMP_MAX_F),
    at: optional(payload.at, TEMP_MIN_F, TEMP_MAX_F),
    ah: optional(payload.ah, 0, 100),
    tDevice: optional(payload.tDevice, 0, Number.MAX_SAFE_INTEGER),
    receivedAt: optional(payload.receivedAt, 0, Number.MAX_SAFE_INTEGER),
  };
}
