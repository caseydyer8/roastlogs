// Roaster hardware vocabulary, shared across the setup selector, History
// detail, the comparison tool, and the Phase 2 capability gate. Ordered
// most-used first. Only the Razzo carries a probe, which is why `probe` is
// stored on the roast rather than re-derived later -- the capability gate
// (no probe => no live mode) reads this one field.
export const EQUIPMENT_OPTIONS = [
  { id: "razzo-v5t", label: "SR540 + Razzo V5T", probe: "k-type" },
  { id: "oem-tube", label: "SR540 + OEM Extension Tube", probe: null },
  { id: "sr540", label: "Standard SR540", probe: null },
];

export const equipmentLabel = (setup) =>
  EQUIPMENT_OPTIONS.find((o) => o.id === setup)?.label || "Not recorded";

export const equipmentHasProbe = (setup) =>
  EQUIPMENT_OPTIONS.find((o) => o.id === setup)?.probe != null;
