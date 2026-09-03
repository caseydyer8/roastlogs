// ---------------------------------------------------------------------------
// Roast phase vocabulary — the single source of truth for BOTH charts.
//
// LiveRoastChart (a roast in progress) and RoastCurveChart (a finished roast in
// History) are deliberately separate components: one renders a growing buffer
// with a moving now-edge, the other a known, complete roast. That separation is
// worth keeping. What is NOT worth keeping separate is the vocabulary — when
// each chart carried its own names, tags and colours they drifted, and the same
// roast ended up looking like two different roasts depending on which screen it
// was opened from. Anything here is imported, never re-declared.
//
// PHASE vs MOMENT is the load-bearing distinction:
//   A PHASE is a span. It gets a shaded band and a ribbon segment, and its
//   width means duration.
//   A MOMENT is an instant. It gets a dot on the curve and a Roast Timeline
//   row, and nothing else. A zero-length event forced into a span renders as a
//   ~10px sliver that can never hold its own name.
// ---------------------------------------------------------------------------

// Short tags for the ribbon lane, which is narrow. 3-4 characters so a brief
// phase still shows a readable name rather than a bare colour block.
export const PHASE_TAGS = {
  drying: "DRY",
  maillard: "MAI",
  caramelization: "CAR",
  development: "DEV",
};

// Acronyms belong on the charts, where space is the constraint. Everywhere with
// room -- chart tooltips, the Roast Timeline in App.js -- says the full word, so
// the tooltip doubles as the key for the ribbon's short tags.
export const PHASE_NAMES = {
  drying: "Drying",
  maillard: "Maillard",
  caramelization: "Caramelization",
  development: "Development",
};

// One tint per phase, shared by the ribbon segment and the band beneath it so
// the two read as the same object. Semantic tokens, so both themes come free.
export const PHASE_VAR = {
  drying: "--phase-dry",
  maillard: "--phase-mai",
  caramelization: "--phase-car",
  development: "--phase-dev",
};

// Moments, keyed by the label stored in roastLog. Labels are stored in FULL
// because the Roast Timeline renders entry.label directly; the charts
// abbreviate at their own edge.
export const MOMENT_LABELS = {
  TURNAROUND: "Turnaround",
  YELLOWING: "Yellowing",
  "MAILLARD APPROACH": "Maillard approach",
  "CARAMELIZATION APPROACH": "Caramelization approach",
  "FC APPROACH": "First crack approach",
  "FIRST CRACK": "First crack",
  "COOLING START": "Drop",
};

// Phase boundaries from a roast log, with the compatibility rule that keeps
// History working.
//
// Maillard opens at the 305F crossing the temperature ladder logged. When there
// is none it falls back to the YELLOWING mark — which is what EVERY roast saved
// before 2026-08-31 has, and what a probe-less manual roast still produces
// today. So old roasts render exactly as they always did and no migration is
// needed; only a live probe roast gets the temperature-accurate boundary.
//
// In History this fallback is the COMMON path, not the exception.
export function phaseBoundaries(roastLog) {
  const log = Array.isArray(roastLog) ? roastLog : [];
  const at = (label) => {
    const e = log.find((x) => x && x.type === "phase" && x.label === label);
    return e ? Number(e.t) : null;
  };
  const yellowing = at("YELLOWING");
  const maillardMark = at("MAILLARD");
  return {
    yellowing,
    maillard: maillardMark != null ? maillardMark : yellowing,
    caramelization: at("CARAMELIZATION"),
    firstCrack: at("FIRST CRACK"),
    // The roaster runs its own cool cycle after the drop, so DROP ends the
    // tracked roast rather than opening a Cooling phase.
    drop: at("COOLING START"),
  };
}

// Moments worth a dot, in log order.
export function momentsFrom(roastLog) {
  const log = Array.isArray(roastLog) ? roastLog : [];
  return log
    .filter((e) => e && e.type === "phase" && MOMENT_LABELS[e.label])
    .map((e) => ({ label: e.label, name: MOMENT_LABELS[e.label], t: Number(e.t) }))
    .filter((m) => Number.isFinite(m.t));
}

// Which phase a given second falls in. Both charts resolve the tooltip header
// through this, so they can never disagree about what a moment in the roast is
// called.
export function phaseKeyAt(t, b) {
  if (!b) return null;
  if (b.firstCrack != null && t >= b.firstCrack) return "development";
  if (b.caramelization != null && t >= b.caramelization) return "caramelization";
  if (b.maillard != null && t >= b.maillard) return "maillard";
  if (t >= 0) return "drying";
  return null;
}

// The four spans, clamped so each ends where the next begins and the last ends
// at the drop (or the live edge, before one is marked).
export function phaseSpans(b, end) {
  if (!b) return [];
  return [
    { key: "drying", tag: PHASE_TAGS.drying, from: 0, to: b.maillard != null ? b.maillard : end },
    { key: "maillard", tag: PHASE_TAGS.maillard, from: b.maillard,
      to: b.caramelization != null ? b.caramelization : (b.firstCrack != null ? b.firstCrack : end) },
    { key: "caramelization", tag: PHASE_TAGS.caramelization, from: b.caramelization,
      to: b.firstCrack != null ? b.firstCrack : end },
    { key: "development", tag: PHASE_TAGS.development, from: b.firstCrack, to: end },
  ];
}
