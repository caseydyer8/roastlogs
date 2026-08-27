// Rate of Rise from a live bean-temp stream.
//
// RoR is a derivative, so raw 1 Hz thermocouple noise would make a naive
// point-to-point slope jump around by tens of degrees/min and read as broken.
// Instead we fit a least-squares line across a rolling time window and take its
// slope — that smooths the noise while staying responsive. Result is degF/min.
//
// samples: array of { t, bt } where t is a millisecond timestamp (wall clock is
// fine; only differences matter). Newest-last or newest-first both work.

export function computeRoR(samples, opts = {}) {
  // Shorter than the original 30s/8s tuning: that lagged 3-5s behind live BT
  // changes and, on a short test roast, took a quarter of the roast to appear
  // at all. 12s/4s keeps the least-squares fit stable against 5Hz thermocouple
  // noise while responding fast enough to feel live.
  const windowMs = opts.windowMs ?? 12000; // ~12s fit window
  const minSpanMs = opts.minSpanMs ?? 4000; // need a real spread before trusting a slope
  const minPoints = opts.minPoints ?? 4;

  if (!Array.isArray(samples) || samples.length < minPoints) return null;

  // Keep valid points within the window of the most recent timestamp.
  const pts = samples.filter((s) => s && typeof s.bt === "number" && typeof s.t === "number");
  if (pts.length < minPoints) return null;
  const tMax = Math.max(...pts.map((s) => s.t));
  const win = pts.filter((s) => tMax - s.t <= windowMs);
  if (win.length < minPoints) return null;

  const span = tMax - Math.min(...win.map((s) => s.t));
  if (span < minSpanMs) return null;

  // Least-squares slope of bt over seconds.
  const n = win.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  const t0 = win[0].t;
  for (const s of win) {
    const x = (s.t - t0) / 1000; // seconds
    const y = s.bt;
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slopePerSec = (n * sxy - sx * sy) / denom;
  return slopePerSec * 60; // degF per minute
}
