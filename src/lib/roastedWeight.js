// ---------------------------------------------------------------------------
// The roasted (drop) weight: asked for right after SAVE ROAST (RL-025), shown
// as a weight-loss % in History. Pure, so the prompt and the History "Wt Loss"
// tile share ONE rule and the prompt's live figure can never disagree with the
// tile it ends up in.
//
// Weights are grams, stored as numbers; a roast with no roasted weight yet
// stores 0. That 0 means "unset", so a typed entry must never be allowed to
// become one: parseRoastedWeight gives null for anything that is not a real
// weight, and the caller saves nothing.
// ---------------------------------------------------------------------------

// Typed text or a number -> a number, or NaN. Number("") and Number(null) are
// both 0, which would otherwise read as a valid weight.
const toNumber = (value) =>
  typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;

// Grams. Far below any real batch and far above it: wide enough that no real
// weight is ever refused, narrow enough that a slipped key (1e308, 1900000) cannot
// reach storage or a numeric database column.
export const MIN_ROASTED_GRAMS = 0.1;
export const MAX_ROASTED_GRAMS = 100000;

// What SAVE WEIGHT may write: the weight, if it is a finite number inside
// MIN..MAX grams. Empty, non-numeric, zero, negative, infinite or absurd gives
// null -- the caller leaves the roast alone rather than store 0.
export function parseRoastedWeight(value) {
  const n = toNumber(value);
  return Number.isFinite(n) && n >= MIN_ROASTED_GRAMS && n <= MAX_ROASTED_GRAMS ? n : null;
}

// Share of the green weight the roast drove off, as a raw percentage, or null.
// This is the History "Wt Loss" tile's rule, moved here so it is written once:
// both weights above zero and roasted below green. Roasted at or above green is
// not a weight loss (a typo, or the wrong bag), so it reads as "no figure".
export function weightLossPercent(green, roasted) {
  const gw = Number(green);
  const rw = Number(roasted);
  return gw > 0 && rw > 0 && rw < gw ? ((gw - rw) / gw) * 100 : null;
}

// One decimal, with the % sign, exactly as the tile prints it.
export function formatWeightLoss(percent) {
  return `${percent.toFixed(1)}%`;
}
