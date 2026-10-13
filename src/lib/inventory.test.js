import { roastMatchesBean, beanStock, beanHistory, sameHistorySets } from "./inventory";

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

// RL-026. One pure helper decides which roasts and tastings belong to a bag, and
// the delete cascade, its cloud-delete list, the modal counts and Bean Detail all
// read it -- so what the modal promises is what gets deleted (and the click
// re-checks it with sameHistorySets, below). Shape:
//   beanHistory(bean, { roasts, tastings, beans }) ->
//     { roasts, tastings, unlinked: { roasts, tastings }, otherBag: { roasts, tastings }, nameShared }
// `roasts`/`tastings` are what belongs to THIS bag (and what a cascade deletes);
// `unlinked` is older history that carries only a name, so it cannot be tied to
// this bag -- listed in Bean Detail and KEPT, never deleted; `otherBag` is history
// that provably belongs to a DIFFERENT saved bag of the same name -- noted in Bean
// Detail, never listed, never deleted.
describe("beanHistory", () => {
  const dupA = bean({ id: 1, name: "Dup" });
  const dupB = bean({ id: 2, name: "Dup" });
  const ids = (list) => list.map((x) => x.id).sort((a, b) => a - b);

  it("matches a linked roast on id only, even when the stored name is stale", () => {
    const roasts = [
      { id: 11, beanId: 1, beanName: "Dup" },
      { id: 12, beanId: 2, beanName: "Dup" },
      { id: 13, beanId: 1, beanName: "Renamed since" },
    ];
    const ctx = { roasts, tastings: [], beans: [dupA, dupB] };
    expect(ids(beanHistory(dupA, ctx).roasts)).toEqual([11, 13]);
    expect(ids(beanHistory(dupB, ctx).roasts)).toEqual([12]);
  });

  it("reads a beanId stored as a string the same as a number", () => {
    const ctx = { roasts: [{ id: 11, beanId: "1", beanName: "Dup" }], tastings: [], beans: [dupA, dupB] };
    expect(ids(beanHistory(dupA, ctx).roasts)).toEqual([11]);
    expect(ids(beanHistory(dupB, ctx).roasts)).toEqual([]);
  });

  it("includes a legacy roast (no beanId) whose name belongs to one bag only", () => {
    const guji = bean({ id: 7, name: "Guji" });
    const other = bean({ id: 8, name: "Yirg" });
    const roasts = [
      { id: 21, beanName: "Guji" },
      { id: 22, beanId: null, beanName: "Guji" },
      { id: 23, beanId: "", beanName: "Guji" },
      { id: 24, beanName: "Yirg" },
    ];
    const h = beanHistory(guji, { roasts, tastings: [], beans: [guji, other] });
    expect(ids(h.roasts)).toEqual([21, 22, 23]);
    expect(h.unlinked.roasts).toEqual([]);
  });

  it("marks a legacy roast whose name is shared by 2+ bags unlinked, and claims it for neither", () => {
    const legacy = { id: 31, beanId: null, beanName: "Dup" };
    const roasts = [{ id: 11, beanId: 1, beanName: "Dup" }, { id: 12, beanId: 2, beanName: "Dup" }, legacy];
    const ctx = { roasts, tastings: [], beans: [dupA, dupB] };
    [dupA, dupB].forEach((b) => {
      const h = beanHistory(b, ctx);
      expect(ids(h.roasts)).not.toContain(31);
      expect(ids(h.unlinked.roasts)).toEqual([31]);
    });
  });

  it("gives every roast at most one home across same-named bags", () => {
    const roasts = [
      { id: 11, beanId: 1, beanName: "Dup" },
      { id: 12, beanId: 2, beanName: "Dup" },
      { id: 31, beanName: "Dup" },
      { id: 32, beanId: null, beanName: "Dup" },
    ];
    const ctx = { roasts, tastings: [], beans: [dupA, dupB] };
    const a = ids(beanHistory(dupA, ctx).roasts);
    const b = ids(beanHistory(dupB, ctx).roasts);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
    expect([...a, ...b].sort()).toEqual([11, 12]);
  });

  it("lets a bag with no id (left by KEEP HISTORY) pick up an orphan, but not another bag's roast", () => {
    const real = bean({ id: 5, name: "Real" });
    const virtual = { name: "Gone" };
    const roasts = [
      { id: 41, beanId: 999, beanName: "Gone" }, // beanId points at no bag at all
      { id: 42, beanId: null, beanName: "Gone" }, // legacy, name only
      { id: 43, beanName: "Gone" }, // legacy, key missing
      { id: 44, beanId: 5, beanName: "Gone" }, // belongs to an existing, differently named bag
      { id: 45, beanId: 999, beanName: "Elsewhere" },
    ];
    const h = beanHistory(virtual, { roasts, tastings: [], beans: [real] });
    expect(ids(h.roasts)).toEqual([41, 42, 43]);
    expect(h.unlinked.roasts).toEqual([]);
  });

  it("makes a tasting follow its roast, not its name", () => {
    const roasts = [{ id: 11, beanId: 1, beanName: "Dup" }, { id: 12, beanId: 2, beanName: "Dup" }];
    const tastings = [
      { id: 51, roastId: "11", beanName: "Dup" },
      { id: 52, roastId: "12", beanName: "Dup" },
      { id: 53, roastId: 11, beanName: "Dup" }, // numeric roastId reads the same
    ];
    const ctx = { roasts, tastings, beans: [dupA, dupB] };
    expect(ids(beanHistory(dupA, ctx).tastings)).toEqual([51, 53]);
    expect(ids(beanHistory(dupB, ctx).tastings)).toEqual([52]);
  });

  it("makes a tasting of an unlinked roast unlinked too, and keeps it", () => {
    const roasts = [{ id: 31, beanId: null, beanName: "Dup" }];
    const tastings = [{ id: 54, roastId: "31", beanName: "Dup" }];
    const h = beanHistory(dupA, { roasts, tastings, beans: [dupA, dupB] });
    expect(h.tastings).toEqual([]);
    expect(ids(h.unlinked.tastings)).toEqual([54]);
  });

  it("matches a manual tasting (no roast) on name: kept when the name is unique, unlinked when shared", () => {
    const manual = [{ id: 55, roastId: "", beanName: "Dup" }, { id: 56, beanName: "Dup" }];
    const shared = beanHistory(dupA, { roasts: [], tastings: manual, beans: [dupA, dupB] });
    expect(shared.tastings).toEqual([]);
    expect(ids(shared.unlinked.tastings)).toEqual([55, 56]);

    const solo = bean({ id: 9, name: "Solo" });
    const own = [{ id: 57, beanName: "Solo" }, { id: 58, roastId: "", beanName: "Solo" }];
    const h = beanHistory(solo, { roasts: [], tastings: own, beans: [solo] });
    expect(ids(h.tastings)).toEqual([57, 58]);
    expect(h.unlinked.tastings).toEqual([]);
  });

  it("returns the exact set a cascade deletes: ids of roasts and tastings, never an unlinked one", () => {
    const roasts = [
      { id: 11, beanId: 1, beanName: "Dup" },
      { id: 12, beanId: 2, beanName: "Dup" },
      { id: 31, beanId: null, beanName: "Dup" },
    ];
    const tastings = [
      { id: 51, roastId: "11", beanName: "Dup" },
      { id: 52, roastId: "12", beanName: "Dup" },
      { id: 54, roastId: "31", beanName: "Dup" },
    ];
    const h = beanHistory(dupA, { roasts, tastings, beans: [dupA, dupB] });
    expect(h.roasts.map((r) => r.id)).toEqual([11]);
    expect(h.tastings.map((t) => t.id)).toEqual([51]);
  });

  it("never claims a name-only roast for a bag with no id when a saved bag holds that name", () => {
    const real = bean({ id: 5, name: "Dup" });
    const roasts = [{ id: 61, beanId: null, beanName: "Dup" }, { id: 62, beanId: 999, beanName: "Dup" }];
    const h = beanHistory({ name: "Dup" }, { roasts, tastings: [], beans: [real] });
    expect(ids(h.roasts)).toEqual([62]); // points at no bag: still its own
    expect(ids(h.unlinked.roasts)).toEqual([61]); // could be the saved bag's: kept
  });

  it("marks a roast whose beanId points at no bag, under a saved bag of the same name, unlinked: counted, kept, never deleted", () => {
    // Left by KEEP HISTORY on a bag that is gone. It is not provably this bag's, so the
    // cascade must not delete it -- but Bean Detail used to show it by name, so it is
    // counted in the "older roasts ... will be kept" note rather than silently dropped.
    const roasts = [{ id: 63, beanId: 999, beanName: "Dup" }];
    const tastings = [{ id: 64, roastId: "63", beanName: "Dup" }];
    const h = beanHistory(dupA, { roasts, tastings, beans: [dupA] });
    expect(h.roasts).toEqual([]);
    expect(h.tastings).toEqual([]);
    expect(ids(h.unlinked.roasts)).toEqual([63]);
    expect(ids(h.unlinked.tastings)).toEqual([64]);
  });

  it("excludes a dangling-beanId roast under a saved bag when its name differs", () => {
    const roasts = [{ id: 65, beanId: 999, beanName: "Elsewhere" }];
    const h = beanHistory(dupA, { roasts, tastings: [], beans: [dupA] });
    expect(h.roasts).toEqual([]);
    expect(h.unlinked.roasts).toEqual([]);
  });

  it("excludes a roast whose beanId belongs to ANOTHER existing bag even when the name matches", () => {
    // Bag 2 exists, so the roast is provably bag 2's: not bag 1's, not even "unlinked".
    const roasts = [{ id: 66, beanId: 2, beanName: "Dup" }];
    const h = beanHistory(dupA, { roasts, tastings: [], beans: [dupA, dupB] });
    expect(h.roasts).toEqual([]);
    expect(h.unlinked.roasts).toEqual([]);
    // A string id for that other bag reads the same.
    const asString = beanHistory(dupA, { roasts: [{ id: 67, beanId: "2", beanName: "Dup" }], tastings: [], beans: [dupA, dupB] });
    expect(asString.roasts).toEqual([]);
    expect(asString.unlinked.roasts).toEqual([]);
  });

  describe("otherBag: same-named history that provably belongs to a different saved bag", () => {
    const roasts = [
      { id: 11, beanId: 1, beanName: "Dup" },
      { id: 12, beanId: 2, beanName: "Dup" },
      { id: 13, beanId: "2", beanName: "Dup" },
    ];
    const tastings = [
      { id: 51, roastId: "11", beanName: "Dup" },
      { id: 52, roastId: "12", beanName: "Dup" },
      { id: 53, roastId: 13, beanName: "Dup" },
    ];
    const ctx = { roasts, tastings, beans: [dupA, dupB] };

    it("collects the other bag's roasts and tastings, and keeps them out of this bag's own set", () => {
      const h = beanHistory(dupA, ctx);
      expect(ids(h.roasts)).toEqual([11]);
      expect(ids(h.tastings)).toEqual([51]);
      expect(ids(h.otherBag.roasts)).toEqual([12, 13]);
      expect(ids(h.otherBag.tastings)).toEqual([52, 53]);
      expect(h.unlinked).toEqual({ roasts: [], tastings: [] });
    });

    it("is symmetric: each bag sees the other's records as otherBag", () => {
      const h = beanHistory(dupB, ctx);
      expect(ids(h.roasts)).toEqual([12, 13]);
      expect(ids(h.otherBag.roasts)).toEqual([11]);
      expect(ids(h.otherBag.tastings)).toEqual([51]);
    });

    it("never overlaps own or unlinked: every record lands in exactly one bucket", () => {
      const withLegacy = { ...ctx, roasts: [...roasts, { id: 14, beanName: "Dup" }, { id: 15, beanId: 999, beanName: "Dup" }] };
      const h = beanHistory(dupA, withLegacy);
      const all = [...h.roasts, ...h.unlinked.roasts, ...h.otherBag.roasts].map((r) => r.id);
      expect(all.sort((a, b) => a - b)).toEqual([11, 12, 13, 14, 15]);
      expect(new Set(all).size).toBe(all.length);
    });

    it("does NOT count a roast that belongs to another bag whose CURRENT name differs", () => {
      // Bag 2 was renamed, so "another bag named Dup" would be false. Nothing is hidden
      // from a bag it belongs to; this bag simply has no business with it.
      const renamed = bean({ id: 2, name: "Renamed" });
      const h = beanHistory(dupA, { roasts: [{ id: 12, beanId: 2, beanName: "Dup" }], tastings: [{ id: 52, roastId: "12", beanName: "Dup" }], beans: [dupA, renamed] });
      expect(h.otherBag).toEqual({ roasts: [], tastings: [] });
      expect(h.roasts).toEqual([]);
      expect(h.unlinked).toEqual({ roasts: [], tastings: [] });
    });

    it("does NOT count a differently named roast under another bag", () => {
      const h = beanHistory(dupA, { roasts: [{ id: 12, beanId: 2, beanName: "Elsewhere" }], tastings: [], beans: [dupA, dupB] });
      expect(h.otherBag).toEqual({ roasts: [], tastings: [] });
    });

    it("applies to a bag with no saved record too, when a saved bag of that name owns the roast", () => {
      const real = bean({ id: 5, name: "Gone" });
      const h = beanHistory({ name: "Gone" }, { roasts: [{ id: 44, beanId: 5, beanName: "Gone" }], tastings: [], beans: [real] });
      expect(h.roasts).toEqual([]);
      expect(ids(h.otherBag.roasts)).toEqual([44]);
    });

    it("hands back the caller's own objects, and an empty otherBag when there is nothing to report", () => {
      const roast = { id: 12, beanId: 2, beanName: "Dup" };
      expect(beanHistory(dupA, { roasts: [roast], tastings: [], beans: [dupA, dupB] }).otherBag.roasts[0]).toBe(roast);
      const solo = beanHistory(dupA, { roasts: [{ id: 11, beanId: 1, beanName: "Dup" }], tastings: [], beans: [dupA] });
      expect(solo.otherBag).toEqual({ roasts: [], tastings: [] });
    });
  });

  describe("nameShared: does a second saved bag carry this bag's name?", () => {
    it("is true only when a different saved bag has the same name", () => {
      expect(beanHistory(dupA, { beans: [dupA, dupB] }).nameShared).toBe(true);
      expect(beanHistory(dupA, { beans: [dupA] }).nameShared).toBe(false);
      expect(beanHistory(dupA, { beans: [dupA, bean({ id: 3, name: "Other" })] }).nameShared).toBe(false);
      expect(beanHistory({ name: "Dup" }, { beans: [dupA] }).nameShared).toBe(true);
      expect(beanHistory(null, {}).nameShared).toBe(false);
    });
  });

  it("falls back to the name rule for a tasting whose roast no longer exists", () => {
    const tastings = [{ id: 59, roastId: "404", beanName: "Dup" }];
    const shared = beanHistory(dupA, { roasts: [], tastings, beans: [dupA, dupB] });
    expect(shared.tastings).toEqual([]);
    expect(ids(shared.unlinked.tastings)).toEqual([59]);
    const solo = beanHistory(dupA, { roasts: [], tastings, beans: [dupA] });
    expect(ids(solo.tastings)).toEqual([59]);
  });

  it("hands back the caller's own objects, not copies", () => {
    const roast = { id: 11, beanId: 1, beanName: "Dup" };
    expect(beanHistory(dupA, { roasts: [roast], tastings: [], beans: [dupA, dupB] }).roasts[0]).toBe(roast);
  });

  it("tolerates a missing bean and missing lists", () => {
    const empty = { roasts: [], tastings: [], unlinked: { roasts: [], tastings: [] }, otherBag: { roasts: [], tastings: [] } };
    expect(beanHistory(null, {})).toMatchObject(empty);
    expect(beanHistory(dupA, {})).toMatchObject(empty);
    expect(beanHistory(dupA, { roasts: null, tastings: null, beans: null })).toMatchObject(empty);
  });
});

// The delete modal is drawn from one beanHistory result and the click re-reads
// storage for another. sameHistorySets is how the click proves the user is
// confirming what they were shown: only the OWN sets decide (those are the only
// ones a cascade deletes), compared as sorted key lists so a duplicate id is
// still counted twice. Anything doubtful answers false -- delete nothing.
describe("sameHistorySets", () => {
  const h = (roasts = [], tastings = [], extra = {}) => ({ roasts, tastings, unlinked: { roasts: [], tastings: [] }, otherBag: { roasts: [], tastings: [] }, ...extra });

  it("is true for the same own sets, whatever the order", () => {
    expect(sameHistorySets(h([{ id: 2 }, { id: 1 }], [{ id: 9 }, { id: 8 }]), h([{ id: 1 }, { id: 2 }], [{ id: 8 }, { id: 9 }]))).toBe(true);
    expect(sameHistorySets(h(), h())).toBe(true);
  });

  it("is true across freshly parsed copies (compares by key, not by object identity)", () => {
    const a = h([{ id: 1, date: "x" }], [{ id: 5 }]);
    const b = JSON.parse(JSON.stringify(a));
    expect(sameHistorySets(a, b)).toBe(true);
  });

  it("is false when one more tasting appeared (the launch-sync race this guards)", () => {
    expect(sameHistorySets(h([{ id: 1 }], []), h([{ id: 1 }], [{ id: 5 }]))).toBe(false);
  });

  it("is false when one more roast appeared, or one went missing", () => {
    expect(sameHistorySets(h([{ id: 1 }]), h([{ id: 1 }, { id: 2 }]))).toBe(false);
    expect(sameHistorySets(h([{ id: 1 }, { id: 2 }]), h([{ id: 1 }]))).toBe(false);
  });

  it("is false when the counts match but a record was swapped", () => {
    expect(sameHistorySets(h([{ id: 1 }]), h([{ id: 2 }]))).toBe(false);
    expect(sameHistorySets(h([], [{ id: 5 }]), h([], [{ id: 6 }]))).toBe(false);
  });

  it("does not collapse duplicate ids: two records sharing an id are two", () => {
    expect(sameHistorySets(h([{ id: 1 }, { id: 1 }]), h([{ id: 1 }]))).toBe(false);
    expect(sameHistorySets(h([{ id: 1 }]), h([{ id: 1 }, { id: 1 }]))).toBe(false);
    expect(sameHistorySets(h([{ id: 1 }, { id: 1 }]), h([{ id: 1 }, { id: 1 }]))).toBe(true);
  });

  it("counts id-less records instead of ignoring them", () => {
    expect(sameHistorySets(h([{}, {}]), h([{}]))).toBe(false);
    expect(sameHistorySets(h([{}, {}], [{}]), h([{}, {}], [{}]))).toBe(true);
  });

  it("keeps roasts and tastings apart: roast 1 is not tasting 1", () => {
    expect(sameHistorySets(h([{ id: 1 }], []), h([], [{ id: 1 }]))).toBe(false);
  });

  it("reads a string id the same as a number", () => {
    expect(sameHistorySets(h([{ id: 1 }]), h([{ id: "1" }]))).toBe(true);
  });

  it("ignores unlinked and otherBag: nothing in them is ever deleted", () => {
    const withExtras = h([{ id: 1 }], [], { unlinked: { roasts: [{ id: 7 }], tastings: [] }, otherBag: { roasts: [{ id: 8 }], tastings: [{ id: 9 }] } });
    expect(sameHistorySets(h([{ id: 1 }]), withExtras)).toBe(true);
  });

  it("answers false for a missing or malformed history, so a doubtful click deletes nothing", () => {
    expect(sameHistorySets(null, h())).toBe(false);
    expect(sameHistorySets(h(), undefined)).toBe(false);
    expect(sameHistorySets(null, null)).toBe(false);
    expect(sameHistorySets({}, {})).toBe(false);
    expect(sameHistorySets({ roasts: [] }, { roasts: [] })).toBe(false);
  });

  it("agrees with beanHistory: a new tasting of this bag changes the answer, a new tasting of another bag does not", () => {
    const bagA = bean({ id: 1, name: "Dup" });
    const bagB = bean({ id: 2, name: "Dup" });
    const roasts = [{ id: 11, beanId: 1, beanName: "Dup" }, { id: 12, beanId: 2, beanName: "Dup" }];
    const before = beanHistory(bagA, { roasts, tastings: [], beans: [bagA, bagB] });
    const ownLater = beanHistory(bagA, { roasts, tastings: [{ id: 51, roastId: "11", beanName: "Dup" }], beans: [bagA, bagB] });
    const otherLater = beanHistory(bagA, { roasts, tastings: [{ id: 52, roastId: "12", beanName: "Dup" }], beans: [bagA, bagB] });
    expect(sameHistorySets(before, ownLater)).toBe(false);
    expect(sameHistorySets(before, otherLater)).toBe(true);
  });
});

// Records current behaviour, not an endorsement: RL-026 deliberately leaves the
// stock rule alone (plan item B2, "refused"). A shared-name legacy roast is
// `unlinked` in Bean Detail, yet beanStock still draws it down from EVERY bag
// that carries the name. If stock is ever made to follow beanHistory instead,
// flip this test on purpose.
describe("beanStock and unlinked roasts", () => {
  it("still charges a shared-name legacy roast to each same-named bag", () => {
    const a = bean({ id: 1, name: "Dup", purchaseWeight: "1000" });
    const b = bean({ id: 2, name: "Dup", purchaseWeight: "1000" });
    const roasts = [{ id: day("2026-09-03"), beanId: null, beanName: "Dup", greenWeight: 100 }];
    expect(beanStock(a, roasts)).toBe(900);
    expect(beanStock(b, roasts)).toBe(900);
  });
  it("charges a linked roast to its own bag only", () => {
    const a = bean({ id: 1, name: "Dup", purchaseWeight: "1000" });
    const b = bean({ id: 2, name: "Dup", purchaseWeight: "1000" });
    const roasts = [{ id: day("2026-09-03"), beanId: 2, beanName: "Dup", greenWeight: 100 }];
    expect(beanStock(a, roasts)).toBe(1000);
    expect(beanStock(b, roasts)).toBe(900);
  });
});
