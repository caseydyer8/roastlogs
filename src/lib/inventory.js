// Bean inventory arithmetic. Stock is DERIVED, never stored: purchase weight,
// minus the green weight of every roast drawn from the bag, plus signed weight
// adjustments. Kept out of App.js so the rule lives in one place and can be
// tested without rendering anything.

// Does this roast draw from this bean? A roast logged from the Setup screen
// carries `beanId` and matches on id ONLY; a legacy roast (or a free-text one)
// has none and matches on name ONLY. Exactly one rule applies to any roast, so
// nothing is ever counted twice and no legacy roast needs a backfill.
export function roastMatchesBean(roast, bean) {
  if (!roast || !bean) return false;
  if (roast.beanId != null && roast.beanId !== "") {
    return Number(roast.beanId) === Number(bean.id);
  }
  return roast.beanName === bean.name;
}

const hasBeanId = (roast) => roast.beanId != null && roast.beanId !== "";
const hasRoastId = (tasting) => tasting.roastId != null && tasting.roastId !== "";

// Which roasts and tastings belong to THIS bag? One answer, read by everything
// that has to agree: Bean Detail's lists and counts, the delete modal's counts,
// and the delete cascade (local filter AND cloud-delete list). The modal is drawn
// from this answer, and the click asks again and compares (sameHistorySets below),
// so a cascade only ever deletes the set the user was shown -- if storage changed
// in between, it deletes nothing and redraws the modal.
//   roasts/tastings    belong to this bag; a cascade deletes exactly these, and
//                      ONLY these. Nothing else here is ever deleted.
//   unlinked.*         older history that carries only a NAME this bag holds, so
//                      nothing says whose it is (a name another bag shares, or a
//                      beanId that points at no bag). Shown in Bean Detail as a
//                      separate list, never claimed and never deleted -- an
//                      unlinked roast left behind is recoverable, a wrong delete
//                      is not.
//   otherBag.*         history that carries this bag's name but whose beanId is a
//                      DIFFERENT saved bag that has the same name now. Bean Detail
//                      notes how many it is not listing. Never deleted, never in
//                      the modal's counts.
//   nameShared         a second saved bag carries this bag's name.
// Rules: a roast with a beanId matches on id only -- except that, under a saved bag, a
// roast whose beanId points at no existing bag but whose name is this bag's is
// unlinked (counted, kept). A legacy roast (no beanId)
// matches on name, and is unlinked when another bag carries that name. A bag with
// no saved record (what KEEP HISTORY, DELETE BEAN ONLY leaves behind) takes roasts
// that carry its name and whose beanId points at no bag at all -- not a roast
// that belongs to some other, renamed bag. A roast whose beanId is another saved
// bag is otherBag only when that bag's CURRENT name is this one's (the note says
// "another bag named ..."); a renamed bag's roast is simply not this bag's. A
// tasting follows its roast; one without a roast (or whose roast is gone) follows
// the legacy name rule.
// Returns the caller's own objects, so a cascade can filter by identity or id.
export function beanHistory(bean, { roasts, tastings, beans } = {}) {
  const history = {
    roasts: [],
    tastings: [],
    unlinked: { roasts: [], tastings: [] },
    otherBag: { roasts: [], tastings: [] },
    nameShared: false,
  };
  if (!bean) return history;

  const inventory = (Array.isArray(beans) ? beans : []).filter(Boolean);
  const saved = bean.id != null && bean.id !== "";
  const nameIsShared = inventory.some((b) => b.name === bean.name && !(saved && Number(b.id) === Number(bean.id)));
  history.nameShared = nameIsShared;
  const savedBags = inventory.filter((b) => b.id != null && b.id !== "");
  const savedIds = new Set(savedBags.map((b) => Number(b.id)));
  // Is this beanId a different saved bag that carries THIS bag's name today?
  const isSameNamedOtherBag = (id) => savedBags.some((b) => Number(b.id) === id && b.name === bean.name);
  const byName = (item) => !!bean.name && item.beanName === bean.name;

  // Every roast's verdict, kept (null included) so a tasting can follow its roast.
  const roastVerdict = new Map();
  (Array.isArray(roasts) ? roasts : []).forEach((roast) => {
    if (!roast) return;
    let verdict = null;
    if (hasBeanId(roast)) {
      const id = Number(roast.beanId);
      // Under a saved bag a beanId matches on id only. The exceptions only ever ADD to
      // what is kept or noted, never to what is deleted: a roast whose beanId points at NO
      // existing bag but whose name is this bag's is what KEEP HISTORY leaves behind, so it
      // is "unlinked" (listed, kept). A roast whose beanId belongs to ANOTHER saved bag is
      // excluded from this bag -- "otherBag" (noted, never listed) when that bag shares the name.
      if (saved && id === Number(bean.id)) verdict = "own";
      else if (byName(roast)) {
        if (!savedIds.has(id)) verdict = saved ? "unlinked" : "own";
        else if (isSameNamedOtherBag(id)) verdict = "otherBag";
      }
    } else if (byName(roast)) {
      verdict = nameIsShared ? "unlinked" : "own";
    }
    roastVerdict.set(String(roast.id), verdict);
    if (verdict === "own") history.roasts.push(roast);
    else if (verdict === "unlinked") history.unlinked.roasts.push(roast);
    else if (verdict === "otherBag") history.otherBag.roasts.push(roast);
  });

  (Array.isArray(tastings) ? tastings : []).forEach((tasting) => {
    if (!tasting) return;
    const key = hasRoastId(tasting) ? String(tasting.roastId) : null;
    let verdict = null;
    if (key !== null && roastVerdict.has(key)) verdict = roastVerdict.get(key);
    else if (byName(tasting)) verdict = nameIsShared ? "unlinked" : "own";
    if (verdict === "own") history.tastings.push(tasting);
    else if (verdict === "unlinked") history.unlinked.tastings.push(tasting);
    else if (verdict === "otherBag") history.otherBag.tastings.push(tasting);
  });

  return history;
}

// Is the history a delete modal was DRAWN from the same one a click is about to
// delete? Compares only the OWN sets (roasts/tastings) -- the only records a
// cascade removes -- as sorted key lists: 'r'+id per roast, 't'+id per tasting.
// Sorted ARRAYS, not Sets, so two records sharing an id (or two id-less ones) are
// still two, and one more or one fewer is a difference. The two histories are
// separate parses of storage, so object identity cannot be compared; the key is
// all there is. Anything missing or malformed answers false: when in doubt the
// caller deletes nothing, and a record left behind is recoverable.
export function sameHistorySets(a, b) {
  const keys = (history) => {
    if (!history || !Array.isArray(history.roasts) || !Array.isArray(history.tastings)) return null;
    return [
      ...history.roasts.map((r) => `r${r && r.id}`),
      ...history.tastings.map((t) => `t${t && t.id}`),
    ].sort();
  };
  const left = keys(a);
  const right = keys(b);
  if (!left || !right || left.length !== right.length) return false;
  return left.every((key, i) => key === right[i]);
}

// Adjustments are dated YYYY-MM-DD; parse as LOCAL midnight so a same-day
// restock sorts before that afternoon's roast (roast ids are Date.now()).
function adjustmentTime(adjustment) {
  const parsed = Date.parse(`${adjustment.date}T00:00:00`);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// Remaining grams. The history is replayed in time order with the running
// balance floored at 0 at EVERY step, so an overdraft is absorbed the moment it
// happens and a later restock starts from zero: a bag 100g short that gets
// +500g reads 500g, not 400g. Flooring only the final figure would give 400.
// On the usual path (no overdraft) this equals purchase - used + adjustments.
export function beanStock(bean, roasts) {
  if (!bean) return 0;
  const events = [];
  (roasts || []).forEach((r) => {
    if (roastMatchesBean(r, bean)) {
      events.push({ t: Number(r.id) || 0, delta: -(Number(r.greenWeight) || 0) });
    }
  });
  (bean.weightAdjustments || []).forEach((a) => {
    events.push({ t: adjustmentTime(a), delta: Number(a.delta) || 0 });
  });
  // Stable sort: same-instant events keep insertion order (roasts, then adjustments).
  events.sort((a, b) => a.t - b.t);

  let balance = Math.max(0, Number(bean.purchaseWeight) || 0);
  events.forEach((e) => {
    balance = Math.max(0, balance + e.delta);
  });
  return balance;
}
