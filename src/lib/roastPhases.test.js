import { momentsFrom, MOMENT_LABELS } from "./roastPhases";

const phase = (label, t = 5) => ({ type: "phase", label, t, temp: "" });

describe("momentsFrom", () => {
  it("names the moments the vocabulary knows, in log order", () => {
    const m = momentsFrom([phase("FIRST CRACK", 480), phase("COOLING START", 600)]);
    expect(m.map((x) => x.name)).toEqual(["First crack", "Drop"]);
    expect(m.map((x) => x.t)).toEqual([480, 600]);
  });

  it("gives every label in MOMENT_LABELS its own entry's name", () => {
    for (const [label, name] of Object.entries(MOMENT_LABELS)) {
      expect(momentsFrom([phase(label)])).toEqual([{ label, name, t: 5, temp: null }]);
    }
  });

  it("skips labels the vocabulary does not know, and entries that are not phases", () => {
    expect(momentsFrom([phase("SOMETHING ELSE"), { type: "adjustment", label: "FIRST CRACK", t: 9 }])).toEqual([]);
  });

  // Hygiene, not a crash fix: MOMENT_LABELS is a plain object, so these labels
  // found an inherited Object.prototype member and came back as a "moment" named
  // [object Object] or function source. Only the label's own entry may count.
  it.each(["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"])(
    "%s is not a moment",
    (label) => {
      expect(momentsFrom([phase(label)])).toEqual([]);
    }
  );

  it("an inherited-looking label does not disturb the real moments around it", () => {
    const m = momentsFrom([phase("YELLOWING", 300), phase("__proto__", 310), phase("constructor", 320), phase("FIRST CRACK", 480)]);
    expect(m.map((x) => x.name)).toEqual(["Yellowing", "First crack"]);
  });
});
