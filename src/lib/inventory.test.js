import { roastMatchesBean, beanStock } from "./inventory";

const day = (d) => new Date(`${d}T12:00:00`).getTime();
const bean = (extra = {}) => ({ id: 1, name: "Guji", purchaseWeight: "1000", weightAdjustments: [], ...extra });

describe("roastMatchesBean", () => {
  it("matches a linked roast on id only", () => {
    expect(roastMatchesBean({ beanId: 1, beanName: "Renamed" }, bean())).toBe(true);
    expect(roastMatchesBean({ beanId: 2, beanName: "Guji" }, bean())).toBe(false);
  });
  it("matches a legacy roast on name only", () => {
    expect(roastMatchesBean({ beanName: "Guji" }, bean())).toBe(true);
    expect(roastMatchesBean({ beanId: null, beanName: "Guji" }, bean())).toBe(true);
    expect(roastMatchesBean({ beanName: "Other" }, bean())).toBe(false);
  });
});

describe("beanStock", () => {
  it("is purchase minus roasts plus adjustments", () => {
    const b = bean({ weightAdjustments: [{ date: "2026-09-02", delta: -50 }] });
    const roasts = [
      { id: day("2026-09-03"), beanId: 1, greenWeight: 250 },
      { id: day("2026-09-04"), beanName: "Guji", greenWeight: 100 },
      { id: day("2026-09-04"), beanId: 2, greenWeight: 999 },
    ];
    expect(beanStock(b, roasts)).toBe(600);
  });
  it("floors at zero and never goes negative", () => {
    expect(beanStock(bean({ purchaseWeight: "200" }), [{ id: day("2026-09-03"), beanId: 1, greenWeight: 500 }])).toBe(0);
  });
  it("forgives an overdraft on restock: -100g then +500g reads 500g", () => {
    const b = bean({ purchaseWeight: "400", weightAdjustments: [{ date: "2026-09-10", delta: 500 }] });
    const roasts = [{ id: day("2026-09-05"), beanId: 1, greenWeight: 500 }];
    expect(beanStock(b, roasts)).toBe(500);
  });
  it("does not forgive a restock that arrives BEFORE the overdraft", () => {
    const b = bean({ purchaseWeight: "400", weightAdjustments: [{ date: "2026-09-01", delta: 500 }] });
    const roasts = [{ id: day("2026-09-05"), beanId: 1, greenWeight: 900 }];
    expect(beanStock(b, roasts)).toBe(0);
  });
  it("tolerates blanks and missing fields", () => {
    expect(beanStock(bean({ purchaseWeight: "" }), [])).toBe(0);
    expect(beanStock(null, [])).toBe(0);
    expect(beanStock(bean(), [{ id: day("2026-09-03"), beanId: 1, greenWeight: "" }])).toBe(1000);
  });
});
