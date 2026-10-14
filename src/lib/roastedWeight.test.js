import { parseRoastedWeight, weightLossPercent, formatWeightLoss } from "./roastedWeight";

// RL-025: the roasted (drop) weight is asked for right after SAVE ROAST, with the
// weight-loss % moving as it is typed. Two rules matter and both are tested here:
//   - the % is the History "Wt Loss" tile's own number, one rule in one place:
//     green and roasted both > 0 and roasted < green, to one decimal;
//   - what is typed is saved only if it is a real weight. Empty, non-numeric, zero
//     or negative saves nothing, and never turns into a stored 0 (a 0 reads as
//     "no weight yet", so it would silently erase a weight the roast already had).
describe("weightLossPercent / formatWeightLoss (the History Wt Loss tile's rule)", () => {
  it("227 g green to 190 g roasted loses 16.3%", () => {
    expect(formatWeightLoss(weightLossPercent(227, 190))).toBe("16.3%");
    expect(weightLossPercent(227, 190)).toBeCloseTo(16.3, 1);
  });

  it("rounds to one decimal, like the tile -- it does not floor", () => {
    expect(formatWeightLoss(weightLossPercent(227, 190.5))).toBe("16.1%");
    expect(formatWeightLoss(weightLossPercent(227, 226))).toBe("0.4%");
    expect(formatWeightLoss(weightLossPercent(227, 1))).toBe("99.6%");
    expect(formatWeightLoss(weightLossPercent(250, 212.5))).toBe("15.0%");
  });

  it("reads stored strings and numbers alike (the seeded fixture roast stores strings)", () => {
    expect(formatWeightLoss(weightLossPercent("226", "190"))).toBe("15.9%");
    expect(formatWeightLoss(weightLossPercent("227", 190))).toBe("16.3%");
  });

  it("is null when roasted is not below green: that is not a weight loss", () => {
    expect(weightLossPercent(227, 227)).toBeNull();
    expect(weightLossPercent(227, 230)).toBeNull();
  });

  it("is null when either weight is unset, zero, negative or not a number", () => {
    for (const bad of [0, "0", "", null, undefined, -5, "-5", "abc", NaN]) {
      expect(weightLossPercent(227, bad)).toBeNull();
      expect(weightLossPercent(bad, 190)).toBeNull();
    }
    expect(weightLossPercent(0, 0)).toBeNull();
  });
});

describe("parseRoastedWeight (what SAVE WEIGHT is allowed to write)", () => {
  it("takes a positive number, typed as text or as a number", () => {
    expect(parseRoastedWeight("190")).toBe(190);
    expect(parseRoastedWeight("190.5")).toBe(190.5);
    expect(parseRoastedWeight(" 190 ")).toBe(190);
    expect(parseRoastedWeight(190)).toBe(190);
  });

  it("gives null -- never 0 -- for empty, blank or non-numeric entries", () => {
    for (const bad of ["", " ", "   ", "abc", "19o", "1,5", "--", "e", null, undefined, {}, [], true, false]) {
      expect(parseRoastedWeight(bad)).toBeNull();
    }
  });

  it("gives null for zero, negative and non-finite weights", () => {
    for (const bad of ["0", "0.0", "-5", "-0.1", 0, -5, NaN, Infinity, -Infinity, "Infinity", "1e999"]) {
      expect(parseRoastedWeight(bad)).toBeNull();
    }
  });

  it("gives null for absurd weights, so a slipped key cannot reach storage or the cloud", () => {
    for (const bad of ["1e308", "1e21", "5e-324", "0.01", "100001", 100001, 1e308, 5e-324, 0.01, "99999999999999999999999"]) {
      expect(parseRoastedWeight(bad)).toBeNull();
    }
  });

  it("still takes the edges of the allowed range", () => {
    expect(parseRoastedWeight("0.1")).toBe(0.1);
    expect(parseRoastedWeight("100000")).toBe(100000);
  });
});
