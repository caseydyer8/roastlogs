import { EQUIPMENT_OPTIONS, equipmentHasProbe } from "./equipment";

// The first-crack ETA is gated on equipmentHasProbe(setup): only the Razzo has a
// probe, so only the Razzo may show the chip. If a second probe setup is ever
// added this test should fail loudly, so the gate is revisited on purpose.
describe("equipmentHasProbe", () => {
  it("is true for razzo-v5t and for nothing else", () => {
    expect(equipmentHasProbe("razzo-v5t")).toBe(true);
    EQUIPMENT_OPTIONS.filter((o) => o.id !== "razzo-v5t").forEach((o) => {
      expect(equipmentHasProbe(o.id)).toBe(false);
    });
    expect(EQUIPMENT_OPTIONS.filter((o) => equipmentHasProbe(o.id)).map((o) => o.id)).toEqual(["razzo-v5t"]);
  });

  it("is false for an unrecorded or unknown setup", () => {
    [undefined, null, "", "unknown-setup", "razzo"].forEach((setup) => {
      expect(equipmentHasProbe(setup)).toBe(false);
    });
  });
});
