// Display smoothing for the roast curves -- shared by the History chart
// (RoastCurveChart) and the live chart (LiveRoastChart) so the two can never
// drift apart again.
//
// Why this exists: a 1 Hz K-type probe reads in whole-ish degrees with a few
// tenths of noise. Drawn raw, the temp line is fuzzy, and RoR -- a derivative,
// which multiplies that noise by 60/window -- reads as mountain peaks. The
// 2026-08-27 retune shortened RoR from a 30 s window to 12 s so short test
// roasts showed RoR sooner, and on a real 10-12 minute roast that made it
// roughly 5x rougher (measured on a synthetic roast in the session that
// replaced it; see src/lib/curveSmoothing.test.js for the guarantees).
//
// A centred least-squares slope over +/-15 s is both smoother than the old
// trailing 30 s difference AND closer to the true rate, because it has no lag.
//
// Gaps stay gaps. A null in the input (a real signal dropout) stays null in the
// temp output, and RoR is null wherever its window would straddle one -- these
// helpers must never bridge a dropout the probe did not fill.

// Centred moving average, +/- `half` samples. Null in, null out.
export function smoothSeries(values, half = 2) {
  return values.map((v, t) => {
    if (v == null) return null;
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, t - half); k <= Math.min(values.length - 1, t + half); k++) {
      if (values[k] != null) {
        sum += values[k];
        n++;
      }
    }
    return n ? sum / n : null;
  });
}

// Rate of rise in degrees/minute from a per-second temperature series (index =
// second). Centred least-squares slope over +/-`half` seconds; the window
// shrinks to one side at the very start and end, so the newest live point still
// gets a value. Null when there are too few points, or the window contains a gap.
export function rorSeries(values, half = 15) {
  const minPoints = half + 1;
  return values.map((v, t) => {
    if (v == null) return null;
    const a = Math.max(0, t - half);
    const b = Math.min(values.length - 1, t + half);
    let first = -1;
    let last = -1;
    for (let k = a; k <= b; k++) {
      if (values[k] != null) {
        if (first < 0) first = k;
        last = k;
      }
    }
    if (first < 0) return null;
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let k = first; k <= last; k++) {
      if (values[k] == null) return null; // window straddles a dropout
      n++;
      sx += k;
      sy += values[k];
      sxx += k * k;
      sxy += k * values[k];
    }
    if (n < minPoints) return null;
    const denom = n * sxx - sx * sx;
    return denom ? (60 * (n * sxy - sx * sy)) / denom : null;
  });
}
