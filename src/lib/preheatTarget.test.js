import { parsePreheatTarget, clampPreheatTarget, storedPreheatTarget, PREHEAT_MIN_F, PREHEAT_MAX_F, DEFAULT_PREHEAT_F } from "./preheatTarget";

// RL-029: the preheat target is never outside 200-500 F, and the two ways of
// changing it follow two different rules.
//   typed entry  parsePreheatTarget: in range commits, ANYTHING else changes
//                nothing. A half-typed "3" must not become a near-cold 200 F
//                target -- that is the bug being fixed, by another route.
//   the stepper  clampPreheatTarget: -5 floors at 200, +5 stops at 500.
describe("preheat target range", () => {
  it("keeps the range and the default where the app documents them", () => {
    expect([PREHEAT_MIN_F, PREHEAT_MAX_F, DEFAULT_PREHEAT_F]).toEqual([200, 500, 315]);
  });
});

describe("parsePreheatTarget (typed entry)", () => {
  it("accepts the edges and anything between, typed as text or as a number", () => {
    expect(parsePreheatTarget("200", 315)).toBe(200);
    expect(parsePreheatTarget("330", 315)).toBe(330);
    expect(parsePreheatTarget("500", 315)).toBe(500);
    expect(parsePreheatTarget(330, 315)).toBe(330);
  });
  it("keeps the previous target for anything out of range -- it never clamps", () => {
    for (const bad of ["3", "33", "-10", "0", "150", "199", "501", "99999", "1e9", "-1e9"]) {
      expect(parsePreheatTarget(bad, 330)).toBe(330);
    }
    expect(parsePreheatTarget(505, 330)).toBe(330);
    expect(parsePreheatTarget(195, 330)).toBe(330);
  });
  it("keeps the previous target for anything that is not a number, never 0 or 200", () => {
    for (const bad of ["", " ", "   ", "abc", "3e", NaN, Infinity, -Infinity, "Infinity", null, undefined, {}, [], true]) {
      expect(parsePreheatTarget(bad, 330)).toBe(330);
    }
  });
  it("rounds a fractional target to a whole degree, then checks the range", () => {
    expect(parsePreheatTarget("330.4", 315)).toBe(330);
    expect(parsePreheatTarget("330.6", 315)).toBe(331);
    expect(parsePreheatTarget("499.6", 315)).toBe(500);
    expect(parsePreheatTarget("500.6", 330)).toBe(330); // rounds to 501: out
    expect(parsePreheatTarget("199.4", 330)).toBe(330); // rounds to 199: out
  });
  it("falls back to the default when no previous target is given", () => {
    expect(parsePreheatTarget("")).toBe(315);
    expect(parsePreheatTarget("3")).toBe(315);
    expect(parsePreheatTarget("340")).toBe(340);
  });
});

describe("clampPreheatTarget (the preheat screen's -5 / +5)", () => {
  it("leaves a step that stays in range alone", () => {
    expect(clampPreheatTarget(330 - 5, 330)).toBe(325);
    expect(clampPreheatTarget(330 + 5, 330)).toBe(335);
  });
  it("floors -5 at 200 and stops +5 at 500", () => {
    expect(clampPreheatTarget(195, 200)).toBe(200);
    expect(clampPreheatTarget(505, 500)).toBe(500);
    expect(clampPreheatTarget(200 - 5, 200)).toBe(200);
    expect(clampPreheatTarget(500 + 5, 500)).toBe(500);
  });
  it("rounds a fractional step to a whole degree", () => {
    expect(clampPreheatTarget(330.4, 330)).toBe(330);
    expect(clampPreheatTarget(330.6, 330)).toBe(331);
  });
  // The clamp is for numbers the app computed. Typed text goes through
  // parsePreheatTarget, so a string here is a caller mistake: it gets the
  // fallback, never a silent "3" -> 200.
  it("gives the fallback for anything that is not a finite number", () => {
    for (const bad of ["3", "330", "", NaN, Infinity, null, undefined, {}, true]) {
      expect(clampPreheatTarget(bad, 330)).toBe(330);
    }
  });
});

describe("storedPreheatTarget", () => {
  it("reads a valid stored target back as it was", () => {
    expect(storedPreheatTarget("200")).toBe(200);
    expect(storedPreheatTarget("330")).toBe(330);
    expect(storedPreheatTarget("500")).toBe(500);
  });
  it("reads anything out of range, or not a number, as the default -- it never clamps", () => {
    for (const bad of ["0", "3", "-10", "199", "501", "9999", "1e9", "abc", "", " ", "Infinity", null, undefined]) {
      expect(storedPreheatTarget(bad)).toBe(315);
    }
  });
});
