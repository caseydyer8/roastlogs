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
