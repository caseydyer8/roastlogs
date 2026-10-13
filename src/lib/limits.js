// ---------------------------------------------------------------------------
// Sanity bounds on values read back from storage.
//
// The charts build one row per second of roast, up to the largest time they are
// handed. Times arrive from places the app does not control -- a cloud row, a
// hand-edited localStorage entry -- so an absurd one (1e9 froze the tab, 2^32 or
// more threw "Invalid array length" out of render) must be ignored or clamped
// before anything is sized by it. Neutral on purpose: profile validation, the
// live chart and the History chart all import it, and none of them should have
// to import another's module to share a number.
// ---------------------------------------------------------------------------

// Two hours, in seconds. A normal SR540 roast is minutes. The ledger text for
// RL-030 said "~1800"; 7200 is deliberately looser, matching the milestone cap
// profile validation already enforced, so no real roast can ever be clipped by it.
export const MAX_ROAST_S = 7200;
