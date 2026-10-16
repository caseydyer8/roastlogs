const { test, expect } = require("@playwright/test");
const { readFile } = require("fs/promises");
const {
  fixtureRoast, fixtureTasting, fixtureBean, fixtureProfile, fixtureLiveRoast,
  fixtureGhostSourceRow, fixtureGhostProfile,
} = require("./fixtures");
const { fullPageShot, mockRoastLinkFeed, holdCloudRoasts } = require("./helpers");

test.beforeEach(async ({ context, page }) => {
  // Hard guarantee: zero Supabase traffic leaves the test browser.
  await context.route(/supabase\.co/, (route) => route.abort());
  // Enable the dev-only auth bypass and seed one deterministic roast + tasting.
  await page.addInitScript(({ roast, tasting }) => {
    window.localStorage.setItem("roastlogs_e2e", "1");
    window.localStorage.setItem("roasts", JSON.stringify([roast]));
    window.localStorage.setItem("tastingNotes", JSON.stringify([tasting]));
  }, { roast: fixtureRoast, tasting: fixtureTasting });
  await page.goto("/");
  // App is loaded once the bottom nav is visible.
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });
});

test("roast tab: starting settings ordered Fan, Heat, Temp", async ({ page }) => {
  const grid = page.locator("div.grid.grid-cols-3").first();
  const labels = await grid.locator("label > div:first-child").allInnerTexts();
  expect(labels[0]).toMatch(/fan/i);
  expect(labels[1]).toMatch(/heat/i);
  expect(labels[2]).toMatch(/temp/i);
  await fullPageShot(page, "roast-tab.png");
});

test("equipment: selector offers the three setups and persists across a reload", async ({ page }) => {
  const select = page.getByLabel("Roaster Setup");
  await expect(select).toBeVisible();

  const options = await select.locator("option").allInnerTexts();
  expect(options).toEqual([
    "SR540 + Razzo V5T",
    "SR540 + OEM Extension Tube",
    "Standard SR540",
  ]);

  // Equipment is hardware, not per-roast scratch -- it is stored under a
  // `roastlogs_` key precisely so it survives when live_* state does not.
  await select.selectOption("sr540");
  await page.reload();
  await expect(page.getByLabel("Roaster Setup")).toHaveValue("sr540");
});

test("equipment: a roast logged before v3.7.0 reads 'Not recorded', never a guess", async ({ page }) => {
  await page.getByRole("button", { name: "History" }).click();
  await page.getByText("E2E Ethiopia Test").first().click();
  // The fixture predates the equipment field, exactly like the 26 real roasts.
  await expect(page.getByText("Not recorded")).toBeVisible();
});

test("equipment: comparison tool flags two DIFFERENT known setups", async ({ page }) => {
  const roastA = { ...fixtureRoast, id: 1, date: "2026-07-01", equipment: { setup: "razzo-v5t", probe: "k-type" } };
  const roastB = { ...fixtureRoast, id: 2, date: "2026-07-02", equipment: { setup: "sr540", probe: null } };
  // Stacks after beforeEach's init script -- both run in order on reload, so
  // this one overwrites the single-roast seed with our two-roast pair.
  await page.addInitScript(([a, b]) => window.localStorage.setItem("roasts", JSON.stringify([a, b])), [roastA, roastB]);
  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Beans" }).click();
  await page.getByText(fixtureRoast.beanName).click();
  await page.getByText(/^Compare \d+ roasts$/).click();

  await expect(page.getByText(/Different equipment/)).toBeVisible();
  await expect(page.getByText("SR540 + Razzo V5T")).toBeVisible();
  await expect(page.getByText("Standard SR540")).toBeVisible();
});

test("equipment: comparison tool does NOT flag matching or unrecorded equipment", async ({ page }) => {
  // One roast records equipment, the other predates the field entirely (like
  // the 26 real pre-v3.7.0 roasts) -- missing data is not a contradiction.
  const roastA = { ...fixtureRoast, id: 1, date: "2026-07-01", equipment: { setup: "razzo-v5t", probe: "k-type" } };
  const roastB = { ...fixtureRoast, id: 2, date: "2026-07-02" };
  await page.addInitScript(([a, b]) => window.localStorage.setItem("roasts", JSON.stringify([a, b])), [roastA, roastB]);
  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Beans" }).click();
  await page.getByText(fixtureRoast.beanName).click();
  await page.getByText(/^Compare \d+ roasts$/).click();

  await expect(page.getByText(/Different equipment/)).toHaveCount(0);
});

test("app shell: bottom nav stays pinned to the viewport bottom while content scrolls", async ({ page }) => {
  // Guards the v3 app-shell fix directly, in place of the full-page pixel
  // diff that used to (accidentally) cover it. The old bug: the bar rendered
  // mid-page with content continuing beneath it on iOS.
  const nav = page.locator("nav").last();
  const viewport = page.viewportSize();

  const atBottom = async (label) => {
    const box = await nav.boundingBox();
    expect(box, `${label}: nav should be visible`).not.toBeNull();
    // Bottom edge of the nav sits on the bottom edge of the viewport.
    expect(
      Math.abs(box.y + box.height - viewport.height),
      `${label}: nav bottom should touch viewport bottom`
    ).toBeLessThanOrEqual(1);
  };

  await atBottom("initial");

  // Scroll <main> to its end — the nav must not travel with the content.
  const main = page.locator("main");
  await main.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect
    .poll(async () => main.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await atBottom("after scrolling main to bottom");

  // And the document itself must not scroll — that was the mid-page float.
  const docScrolls = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight + 1
  );
  expect(docScrolls, "document should not scroll; <main> owns scrolling").toBe(false);
});

test("profile builder: steppers ordered Fan→Heat; time picker fits viewport", async ({ page }) => {
  // The Build Profile card became "+ Build new" in Setup's Profile section (v3.9.0).
  await page.getByRole("button", { name: "+ Build new" }).click();
  await page.getByText("+ ADD STEP").click();

  // 2026-07 UI: Fan and Heat are inline −/+ steppers (still discrete 1-9), Fan first.
  const fanPlus = page.getByLabel("Increase Fan");
  const heatPlus = page.getByLabel("Increase Heat");
  await expect(fanPlus).toBeVisible();
  await expect(heatPlus).toBeVisible();
  const fanBox = await fanPlus.boundingBox();
  const heatBox = await heatPlus.boundingBox();
  expect(fanBox.x).toBeLessThan(heatBox.x);

  // One tappable MM:SS chip opens a single combined minutes:seconds picker.
  await page.locator("button.font-mono").first().click();
  await expect(page.getByText("STEP TIME (MM:SS)")).toBeVisible();

  // The regression this guards (from the old drum picker): the picker card
  // must fit entirely inside the viewport at both sizes.
  const card = page
    .locator("div.max-w-sm", { has: page.getByText("STEP TIME (MM:SS)") })
    .last();
  const box = await card.boundingBox();
  const viewport = page.viewportSize();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

  await fullPageShot(page, "time-chip-picker.png");
});

test("brew: photo picker removed; dark bag-label summary with half-star rating", async ({ page }) => {
  await page.getByRole("button", { name: "Brew" }).click();

  // Photo feature is fully removed from Brew setup.
  await expect(page.getByText("Tap to add photo")).toHaveCount(0);
  await expect(page.getByText("Photo", { exact: true })).toHaveCount(0);

  await page.getByPlaceholder("e.g., Ethiopia Yirgacheffe").fill("E2E Brew Bean");
  await page.getByText("START TASTING").click();
  await page.getByText("NEXT").click();
  await page.getByText("Chocolatey").click();
  await page.getByText("NEXT").click();
  await page.getByText("Dark Chocolate", { exact: true }).click();
  await page.getByText("NEXT").click();

  // Step 4: ONE combined dark bag-label card (no white surface anywhere).
  await expect(page.getByText("SINGLE ORIGIN ROAST")).toBeVisible();
  await page.getByLabel("3.5 stars").click();

  await fullPageShot(page, "brew-summary.png");
});

test("beans: monogram rows with count pills and half-star average", async ({ page }) => {
  await page.getByRole("button", { name: "Beans" }).click();

  // Derived bean row: monogram avatar, count pills, 3.5 average from the fixture tasting.
  await expect(page.getByText("1 roasts")).toBeVisible();
  await expect(page.getByText("1 tastings")).toBeVisible();
  await expect(page.getByText("3.5", { exact: true })).toBeVisible();

  await fullPageShot(page, "beans-list.png");
});

test("beans: add bean captures full provenance and shows on detail", async ({ page }) => {
  await page.getByRole("button", { name: "Beans" }).click();
  await page.getByText("ADD BEAN").click();

  await page.getByPlaceholder("e.g., Ethiopia Yirgacheffe").fill("E2E Provenance Bean");
  await page.getByPlaceholder("e.g., Ethiopia", { exact: true }).fill("Kenya");
  await page.getByPlaceholder("Optional").fill("Kiambu Cooperative");
  await page.getByPlaceholder("e.g., Yirgacheffe").fill("Nyeri");
  await page.getByPlaceholder("e.g., Heirloom").fill("SL28");
  await page.getByPlaceholder("e.g., Washed").fill("Washed");
  await page.getByPlaceholder("e.g., 1900").fill("1750");
  await page.getByPlaceholder("e.g., Sweet Maria's").fill("Sweet Maria's");
  await page.getByPlaceholder("Name printed on the bag, if different").fill("Sunrise Reserve");
  await page.getByPlaceholder("Flavor notes listed on the bag, or what you're aiming for").fill("Blackcurrant, brown sugar");
  await page.getByText("SAVE BEAN").click();

  await page.getByText("E2E Provenance Bean").click();
  await expect(page.getByText('"Sunrise Reserve"')).toBeVisible();
  await expect(page.getByText("Kiambu Cooperative")).toBeVisible();
  await expect(page.getByText("Nyeri", { exact: true })).toBeVisible();
  await expect(page.getByText("SL28", { exact: true })).toBeVisible();
  await expect(page.getByText("1750 MASL")).toBeVisible();
  await expect(page.getByText("via Sweet Maria's")).toBeVisible();
  await expect(page.getByText("Blackcurrant, brown sugar")).toBeVisible();
});

test("beans: edit bean persists changes and keeps name read-only", async ({ page }) => {
  await page.getByRole("button", { name: "Beans" }).click();
  await page.getByText("ADD BEAN").click();
  await page.getByPlaceholder("e.g., Ethiopia Yirgacheffe").fill("E2E Edit Bean");
  await page.getByPlaceholder("e.g., Ethiopia", { exact: true }).fill("Colombia");
  await page.getByText("SAVE BEAN").click();

  await page.getByText("E2E Edit Bean").click();
  await page.getByRole("button", { name: "EDIT" }).click();

  await expect(page.getByPlaceholder("e.g., Ethiopia Yirgacheffe")).toBeDisabled();
  await page.getByPlaceholder("Optional").fill("Finca La Esperanza");
  await page.getByText("SAVE CHANGES").click();

  await expect(page.getByText("Finca La Esperanza")).toBeVisible();
});

test("beans: weight adjustment updates remaining stock and log", async ({ page }) => {
  await page.getByRole("button", { name: "Beans" }).click();
  await page.getByText("ADD BEAN").click();
  await page.getByPlaceholder("e.g., Ethiopia Yirgacheffe").fill("E2E Weight Bean");
  await page.getByPlaceholder("e.g., 1000").fill("500");
  await page.locator('input[type="date"]').fill("2026-07-18");
  await page.getByText("SAVE BEAN").click();

  await page.getByText("E2E Weight Bean").click();
  await expect(page.getByText("500g / 500g")).toBeVisible();

  await page.getByText("+ ADJUST WEIGHT").click();
  await page.getByPlaceholder("e.g., -15 or 250").fill("-20");
  await page.getByPlaceholder("e.g., Spilled during grind, Restocked").fill("Spilled");
  await page.getByText("SAVE", { exact: true }).click();

  await expect(page.getByText("480g / 500g")).toBeVisible();
  await expect(page.getByText("Spilled")).toBeVisible();
  await expect(page.getByText("-20g")).toBeVisible();
});

test("beans: delete bean with no history removes it immediately", async ({ page }) => {
  await page.getByRole("button", { name: "Beans" }).click();
  await page.getByText("ADD BEAN").click();
  await page.getByPlaceholder("e.g., Ethiopia Yirgacheffe").fill("E2E Delete No History");
  await page.getByText("SAVE BEAN").click();

  await page.getByText("E2E Delete No History").click();
  await page.getByText("DELETE BEAN").click();
  await expect(page.getByText("This cannot be undone.")).toBeVisible();
  await page.getByRole("button", { name: "DELETE", exact: true }).click();

  await expect(page.getByText("E2E Delete No History")).toHaveCount(0);
});

test("beans: delete bean with history offers keep-or-remove choice; bean-only preserves history", async ({ page }) => {
  await page.getByRole("button", { name: "Beans" }).click();
  await page.getByText("ADD BEAN").click();
  await page.getByPlaceholder("e.g., Ethiopia Yirgacheffe").fill("E2E Ethiopia Test");
  await page.getByText("SAVE BEAN").click();

  await page.getByText("E2E Ethiopia Test").first().click();
  await page.getByText("DELETE BEAN").click();
  await expect(page.getByText("This bean has 1 roast + 1 tasting. Choose whether to keep or remove them too.")).toBeVisible();
  await page.getByText("KEEP HISTORY, DELETE BEAN ONLY").click();

  // Bean reappears as a bare entry since the roast/tasting still reference its name
  await expect(page.getByText("E2E Ethiopia Test").first()).toBeVisible();
  await expect(page.getByText("1 roasts")).toBeVisible();
});

test("beans: cascade delete removes bean and all linked history", async ({ page }) => {
  await page.getByRole("button", { name: "Beans" }).click();
  await page.getByText("ADD BEAN").click();
  await page.getByPlaceholder("e.g., Ethiopia Yirgacheffe").fill("E2E Ethiopia Test");
  await page.getByText("SAVE BEAN").click();

  await page.getByText("E2E Ethiopia Test").first().click();
  await page.getByText("DELETE BEAN").click();
  await page.getByText("DELETE BEAN + 1 ROAST + 1 TASTING").click();

  await expect(page.getByText("E2E Ethiopia Test")).toHaveCount(0);

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByText("E2E Ethiopia Test")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// RL-026: a bag is matched to its roasts by beanId, not by name. A roast logged
// from the Setup screen (v3.9.0+) carries its bag's id; an older one carries only
// a name. Two bags can share a name (an old bag plus a restock), and "delete
// roasts too" used to remove BOTH bags' history because it matched on name.
//
// The Beans list is keyed by name, so a shared name is ONE row that opens the
// first matching bag -- bag A below. Deleting from it must touch bag A's history
// and nothing else.
// ---------------------------------------------------------------------------
const bagA = { ...fixtureBean, id: 1750000000101, name: "Dup Bean" };
const bagB = { ...fixtureBean, id: 1750000000102, name: "Dup Bean" };
// Dates differ so Bean Detail rows can be told apart by what they print.
const roastA = { ...fixtureRoast, id: 1750000000301, date: "2026-08-01", beanName: "Dup Bean", beanId: bagA.id };
const roastB = { ...fixtureRoast, id: 1750000000302, date: "2026-08-15", beanName: "Dup Bean", beanId: bagB.id };
// Logged before v3.9.0: a name and no beanId, so nothing says WHICH Dup Bean it used.
const roastOlder = { ...fixtureRoast, id: 1750000000303, date: "2026-06-01", beanName: "Dup Bean", beanId: null };
const tastingA = { ...fixtureTasting, id: 1750000000401, roastId: String(roastA.id), beanName: "Dup Bean" };
const tastingB = { ...fixtureTasting, id: 1750000000402, roastId: String(roastB.id), beanName: "Dup Bean" };

// Replaces the beforeEach seed with this inventory and history. The init script
// stacks after beforeEach's (both re-run on reload), so this one wins.
async function seedBeanHistory(page, { beans = [], roasts = [], tastings = [] }) {
  await page.addInitScript((seed) => {
    window.localStorage.setItem("beans", JSON.stringify(seed.beans));
    window.localStorage.setItem("roasts", JSON.stringify(seed.roasts));
    window.localStorage.setItem("tastingNotes", JSON.stringify(seed.tastings));
  }, { beans, roasts, tastings });
  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });
}

// Every DELETE the app aims at the cloud, as "table?id=eq.N". The context route
// aborts them, but the 'request' event still fires, so each attempt is visible.
// That is what makes a negative assertion honest: "no delete for roast B" only
// means something once "a delete for roast A WAS sent" has been seen, because a
// client that sends nothing at all would pass the negative just as happily.
function recordCloudDeletes(page) {
  const sent = [];
  page.on("request", (req) => {
    if (req.method() !== "DELETE") return;
    const match = req.url().match(/\/rest\/v1\/(.+)$/);
    if (match) sent.push(decodeURIComponent(match[1]));
  });
  return {
    // Waits for at least `n` deletes (so a client that sent none fails here, not
    // silently), then returns every one sent, sorted. The app fires its deletes
    // as one burst; the short wait gives a stray extra one time to land before
    // the caller asserts on what must NOT be there.
    async sentAfter(n) {
      await expect.poll(() => sent.length, { message: `cloud DELETEs sent (expected at least ${n})` }).toBeGreaterThanOrEqual(n);
      await page.waitForTimeout(250);
      return [...sent].sort();
    },
    // What has been sent so far, without waiting -- for asserting that a tap sent NOTHING.
    // Only honest after the page has visibly reacted to the tap (the handler sends
    // its deletes synchronously, so by then any it was going to send are in).
    snapshot() {
      return [...sent].sort();
    },
  };
}

const storedIds = (page, key) =>
  page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) || "[]").map((x) => x.id), key);
// The "N sessions" pill above the roast list on Bean Detail.
const sessionsPill = (page) => page.getByText(/^\d+ sessions$/);
const deleteModal = (page) => page.locator("div.fixed.inset-0").filter({ hasText: "Delete this bean?" });
async function openBeanDetail(page, name) {
  await page.getByRole("button", { name: "Beans" }).click();
  await page.getByText(name).first().click();
}

test("beans: same-named bags -- deleting one bag with its roasts leaves the other bag's roasts alone", async ({ page }) => {
  await seedBeanHistory(page, { beans: [bagA, bagB], roasts: [roastA, roastB] });
  const deletes = recordCloudDeletes(page);

  await openBeanDetail(page, "Dup Bean");
  await page.getByText("DELETE BEAN").click();
  // The modal counts what the cascade will delete: bag A's one roast, not the two
  // that share its name.
  const modal = deleteModal(page);
  await expect(modal).toContainText("This bean has 1 roast + 0 tastings.");
  const cascade = modal.getByRole("button", { name: "DELETE BEAN + 1 ROAST + 0 TASTINGS", exact: true });
  await expect(cascade).toBeVisible();
  await cascade.click();

  const sent = await deletes.sentAfter(2);
  // Positive control: the client DID send the delete for bag A's roast, so the
  // absence of roast B's below is a finding rather than an artefact of nothing
  // being observable.
  expect(sent).toContain(`roasts?id=eq.${roastA.id}`);
  expect(sent).not.toContain(`roasts?id=eq.${roastB.id}`);
  // And that is the whole of it: bag A's roast and bag A itself.
  expect(sent).toEqual([`beans?id=eq.${bagA.id}`, `roasts?id=eq.${roastA.id}`]);

  expect(await storedIds(page, "roasts")).toEqual([roastB.id]);
  expect(await storedIds(page, "beans")).toEqual([bagB.id]);
});

test("beans: same-named bags -- a tasting is deleted with its own roast, not with the other bag's", async ({ page }) => {
  await seedBeanHistory(page, { beans: [bagA, bagB], roasts: [roastA, roastB], tastings: [tastingA, tastingB] });
  const deletes = recordCloudDeletes(page);

  await openBeanDetail(page, "Dup Bean");
  await page.getByText("DELETE BEAN").click();
  const modal = deleteModal(page);
  await expect(modal).toContainText("This bean has 1 roast + 1 tasting.");
  const cascade = modal.getByRole("button", { name: "DELETE BEAN + 1 ROAST + 1 TASTING", exact: true });
  await expect(cascade).toBeVisible();
  await cascade.click();

  expect(await deletes.sentAfter(3)).toEqual([
    `beans?id=eq.${bagA.id}`,
    `roasts?id=eq.${roastA.id}`,
    `tasting_notes?id=eq.${tastingA.id}`,
  ]);
  expect(await storedIds(page, "roasts")).toEqual([roastB.id]);
  expect(await storedIds(page, "tastingNotes")).toEqual([tastingB.id]);
});

test("beans: same-named bags -- older roasts tied only by name are kept, and the modal says how many", async ({ page }) => {
  await seedBeanHistory(page, { beans: [bagA, bagB], roasts: [roastA, roastB, roastOlder] });
  const deletes = recordCloudDeletes(page);

  await openBeanDetail(page, "Dup Bean");
  await page.getByText("DELETE BEAN").click();
  const modal = deleteModal(page);
  await expect(modal).toContainText("This bean has 1 roast + 0 tastings.");
  // Not deletable (which bag did it come from?), so it is not in the button's
  // count -- but Case is told it exists and that it stays.
  await expect(modal.getByText(/1 older roast.*not tied to one bag.*kept/i)).toBeVisible();
  const cascade = modal.getByRole("button", { name: "DELETE BEAN + 1 ROAST + 0 TASTINGS", exact: true });
  await expect(cascade).toBeVisible();
  await cascade.click();

  expect(await deletes.sentAfter(2)).toEqual([`beans?id=eq.${bagA.id}`, `roasts?id=eq.${roastA.id}`]);
  expect((await storedIds(page, "roasts")).sort()).toEqual([roastB.id, roastOlder.id]);
});

test("beans: same-named bags -- the delete modal no longer says history goes for every bag of that name", async ({ page }) => {
  await seedBeanHistory(page, { beans: [bagA, bagB], roasts: [roastA, roastB] });

  await openBeanDetail(page, "Dup Bean");
  await page.getByText("DELETE BEAN").click();
  const modal = deleteModal(page);
  await expect(modal).toBeVisible();
  // The old warning was true when history was matched by name; it is false now
  // that only the bag's own history is removed, and false text on an irreversible
  // action is worse than none.
  await expect(modal.getByText(/removes it for all of them/)).toHaveCount(0);
  await expect(modal.getByText(/\b(only|just) this bag/i)).toBeVisible();
});

test("beans: same-named bags -- keeping history deletes only the bag, never a roast", async ({ page }) => {
  await seedBeanHistory(page, { beans: [bagA, bagB], roasts: [roastA, roastB] });
  const deletes = recordCloudDeletes(page);

  await openBeanDetail(page, "Dup Bean");
  await page.getByText("DELETE BEAN").click();
  await page.getByText("KEEP HISTORY, DELETE BEAN ONLY").click();

  expect(await deletes.sentAfter(1)).toEqual([`beans?id=eq.${bagA.id}`]);
  expect((await storedIds(page, "roasts")).sort()).toEqual([roastA.id, roastB.id]);
  expect(await storedIds(page, "beans")).toEqual([bagB.id]);
});

test("bean detail: same-named bags -- lists only this bag's sessions, shows the older roast in its own kept list, and notes the other bag's", async ({ page }) => {
  await seedBeanHistory(page, { beans: [bagA, bagB], roasts: [roastA, roastB, roastOlder] });

  await openBeanDetail(page, "Dup Bean");
  // Bag A's own roast, matched by id: the only session. Bag B's roast is not A's, so
  // it is not listed -- but a line says so, instead of hiding it without a word.
  await expect(sessionsPill(page)).toHaveText("1 sessions");
  await expect(page.getByText(roastA.date)).toBeVisible();
  await expect(page.getByText(roastB.date)).toHaveCount(0);
  await expect(page.getByText('1 roast belongs to another bag named "Dup Bean" and is not listed here.')).toBeVisible();

  // The older roast could be either bag's: it is listed, but in its own muted list,
  // still outside the "N sessions" count and clearly marked as kept.
  const older = page.getByTestId("older-roasts");
  await expect(older.getByText("Older roasts with this name — kept if this bag is deleted")).toBeVisible();
  await expect(older.getByText("1 older roast with this name is not tied to one bag. It is listed below and kept if you delete this bag.")).toBeVisible();
  await expect(older.getByText(roastOlder.date)).toBeVisible();
  await expect(older.getByText(roastA.date)).toHaveCount(0);
  await expect(older.getByText(roastB.date)).toHaveCount(0);
  await expect(page.getByTestId("older-tastings")).toHaveCount(0);
});

test("bean detail: same-named bags -- the other bag's roasts and tastings are noted but never in this bag's delete counts", async ({ page }) => {
  // Dates differ so a row can be told from its twin on the other bag.
  const tastingBLater = { ...tastingB, date: "2026-08-20" };
  await seedBeanHistory(page, { beans: [bagA, bagB], roasts: [roastA, roastB], tastings: [tastingA, tastingBLater] });
  const deletes = recordCloudDeletes(page);

  await openBeanDetail(page, "Dup Bean");
  await expect(sessionsPill(page)).toHaveText("1 sessions");
  await expect(page.getByText(/^1 notes$/)).toBeVisible();
  await expect(page.getByText(roastB.date)).toHaveCount(0);
  await expect(page.getByText(tastingBLater.date)).toHaveCount(0);
  await expect(page.getByText('1 roast and 1 tasting note belong to another bag named "Dup Bean" and are not listed here.')).toBeVisible();

  await page.getByText("DELETE BEAN").click();
  const modal = deleteModal(page);
  // The modal counts this bag's own history and says nothing about the other bag's.
  await expect(modal).toContainText("This bean has 1 roast + 1 tasting.");
  await expect(modal).not.toContainText(/another bag/i);
  await modal.getByRole("button", { name: "DELETE BEAN + 1 ROAST + 1 TASTING", exact: true }).click();

  // Nothing of bag B's is touched, locally or in the cloud.
  expect(await deletes.sentAfter(3)).toEqual([
    `beans?id=eq.${bagA.id}`,
    `roasts?id=eq.${roastA.id}`,
    `tasting_notes?id=eq.${tastingA.id}`,
  ]);
  expect(await storedIds(page, "roasts")).toEqual([roastB.id]);
  expect(await storedIds(page, "tastingNotes")).toEqual([tastingB.id]);
  expect(await storedIds(page, "beans")).toEqual([bagB.id]);
});

// What KEEP HISTORY, DELETE BEAN ONLY leaves behind: roasts that carry a bag id which no
// longer exists. Once a bag of that name is back (a fresh id), those roasts and tastings
// are "unlinked" -- not provably this bag's, so a cascade keeps them. They used to
// vanish from Bean Detail behind a bare count; now they are listed, apart from the sessions.
test("bean detail: older roasts and tastings kept after KEEP HISTORY stay visible in their own list, outside the counts", async ({ page }) => {
  const bag = { ...fixtureBean, id: 1750000000106, name: "Reborn Bean" };
  const ownRoast = { ...fixtureRoast, id: 1750000000601, date: "2026-08-01", beanName: "Reborn Bean", beanId: bag.id };
  const deadRoast = { ...fixtureRoast, id: 1750000000602, date: "2026-06-10", beanName: "Reborn Bean", beanId: 999 };
  const deadTasting = { ...fixtureTasting, id: 1750000000603, date: "2026-06-12", roastId: String(deadRoast.id), beanName: "Reborn Bean" };
  await seedBeanHistory(page, { beans: [bag], roasts: [ownRoast, deadRoast], tastings: [deadTasting] });
  const deletes = recordCloudDeletes(page);

  await openBeanDetail(page, "Reborn Bean");
  // Counted: this bag's one session, no notes. The older records are not in either pill...
  await expect(sessionsPill(page)).toHaveText("1 sessions");
  await expect(page.getByText(/^0 notes$/)).toBeVisible();
  // ...and not in the comparison: one session of its own means no Compare, even though
  // an older roast shares the name.
  await expect(page.getByRole("button", { name: /^Compare/ })).toHaveCount(0);

  const olderRoasts = page.getByTestId("older-roasts");
  await expect(olderRoasts.getByText("Older roasts with this name — kept if this bag is deleted")).toBeVisible();
  // Not shared by a second bag, so the note must NOT claim "one bag" is the problem.
  await expect(olderRoasts.getByText("1 older roast with this name is not tied to this bag. It is listed below and kept if you delete it.")).toBeVisible();
  await expect(olderRoasts.getByText(deadRoast.date)).toBeVisible();
  await expect(olderRoasts.getByText(ownRoast.date)).toHaveCount(0);

  const olderTastings = page.getByTestId("older-tastings");
  await expect(olderTastings.getByText("Older tasting notes with this name — kept if this bag is deleted")).toBeVisible();
  await expect(olderTastings.getByText("1 older tasting note with this name is not tied to this bag. It is listed below and kept if you delete it.")).toBeVisible();
  await expect(olderTastings.getByText(deadTasting.date)).toBeVisible();
  await expect(page.getByText(/not tied to one bag/i)).toHaveCount(0);

  // Same rows as the sessions: tapping one opens the roast.
  await olderRoasts.getByText(deadRoast.date).click();
  await expect(page.getByText("BACK TO REBORN BEAN")).toBeVisible();
  await page.getByText("BACK TO REBORN BEAN").click();

  // And "kept if this bag is deleted" is true: the cascade takes the session, not these.
  await page.getByText("DELETE BEAN").click();
  const modal = deleteModal(page);
  await expect(modal).toContainText("This bean has 1 roast + 0 tastings.");
  await modal.getByRole("button", { name: "DELETE BEAN + 1 ROAST + 0 TASTINGS", exact: true }).click();
  expect(await deletes.sentAfter(2)).toEqual([`beans?id=eq.${bag.id}`, `roasts?id=eq.${ownRoast.id}`]);
  expect(await storedIds(page, "roasts")).toEqual([deadRoast.id]);
  expect(await storedIds(page, "tastingNotes")).toEqual([deadTasting.id]);
});

test("bean detail: KEEP HISTORY then adding the bag back does not make its roasts disappear", async ({ page }) => {
  // The real path, end to end. A roast logged from Setup carries its bag's id; deleting
  // the bag but keeping history leaves that id dead; adding "Reborn Bean" again gives a
  // fresh id. Bean Detail used to say "0 sessions" and "1 older roast ... not listed here".
  const bag = { ...fixtureBean, id: 1750000000107, name: "Reborn Bean" };
  const roast = { ...fixtureRoast, id: 1750000000604, date: "2026-08-03", beanName: "Reborn Bean", beanId: bag.id };
  await seedBeanHistory(page, { beans: [bag], roasts: [roast] });

  await openBeanDetail(page, "Reborn Bean");
  await page.getByText("DELETE BEAN").click();
  await page.getByText("KEEP HISTORY, DELETE BEAN ONLY").click();
  expect(await storedIds(page, "beans")).toEqual([]);

  await page.getByText("ADD BEAN").click();
  await page.getByPlaceholder("e.g., Ethiopia Yirgacheffe").fill("Reborn Bean");
  await page.getByText("SAVE BEAN").click();
  await page.getByText("Reborn Bean").first().click();

  await expect(sessionsPill(page)).toHaveText("0 sessions");
  const older = page.getByTestId("older-roasts");
  await expect(older.getByText(roast.date)).toBeVisible();
  await expect(older.getByText("1 older roast with this name is not tied to this bag. It is listed below and kept if you delete it.")).toBeVisible();
});

test("bean detail: a roast logged before v3.9.0 (no beanId) still lists under a bag that owns its name", async ({ page }) => {
  const solo = { ...fixtureBean, id: 1750000000103, name: "Solo Bean" };
  const legacy = { ...fixtureRoast, id: 1750000000304, date: "2026-05-01", beanName: "Solo Bean", beanId: null };
  const linked = { ...fixtureRoast, id: 1750000000305, date: "2026-08-01", beanName: "Solo Bean", beanId: solo.id };
  await seedBeanHistory(page, { beans: [solo], roasts: [legacy, linked] });

  await openBeanDetail(page, "Solo Bean");
  await expect(sessionsPill(page)).toHaveText("2 sessions");
  await expect(page.getByText(legacy.date)).toBeVisible();
  await expect(page.getByText(linked.date)).toBeVisible();
  // One bag owns the name, so nothing is "not tied to one bag", nothing belongs to
  // another bag, and neither extra list appears.
  await expect(page.getByText(/not tied to one bag/i)).toHaveCount(0);
  await expect(page.getByText(/another bag/i)).toHaveCount(0);
  await expect(page.getByTestId("older-roasts")).toHaveCount(0);
  await expect(page.getByTestId("older-tastings")).toHaveCount(0);
});

test("bean detail: a bean with no saved record still lists a roast whose beanId points at no bag", async ({ page }) => {
  // What KEEP HISTORY, DELETE BEAN ONLY leaves behind: roasts naming a bag that
  // no longer exists. beanId 999 matches nothing in the inventory.
  const orphan = { ...fixtureRoast, id: 1750000000306, date: "2026-07-20", beanName: "Orphan Bean", beanId: 999 };
  await seedBeanHistory(page, { beans: [], roasts: [orphan] });

  await openBeanDetail(page, "Orphan Bean");
  await expect(sessionsPill(page)).toHaveText("1 sessions");
  await expect(page.getByText(orphan.date)).toBeVisible();
});

test("beans: deleting a bean with no saved record removes its orphaned roasts but not a roast that belongs to another bag", async ({ page }) => {
  // A bag renamed after a roast was logged: the roast keeps the OLD name but
  // carries the renamed bag's id. The name-keyed Beans list still shows the old
  // name as an id-less row; deleting that row must not take the renamed bag's
  // roast with it.
  const renamedBag = { ...fixtureBean, id: 1750000000104, name: "Renamed Bag" };
  const orphan = { ...fixtureRoast, id: 1750000000307, date: "2026-07-20", beanName: "Orphan Bean", beanId: 999 };
  const belongsElsewhere = { ...fixtureRoast, id: 1750000000308, date: "2026-07-25", beanName: "Orphan Bean", beanId: renamedBag.id };
  await seedBeanHistory(page, { beans: [renamedBag], roasts: [orphan, belongsElsewhere] });
  const deletes = recordCloudDeletes(page);

  await openBeanDetail(page, "Orphan Bean");
  await page.getByText("DELETE BEAN").click();
  const modal = deleteModal(page);
  await expect(modal).toContainText("This will delete 1 roast + 0 tastings for this bean.");
  const cascade = modal.getByRole("button", { name: "DELETE 1 ROAST + 0 TASTINGS", exact: true });
  await expect(cascade).toBeVisible();
  await cascade.click();

  // No bean row exists to delete, so the roast is the only cloud call.
  expect(await deletes.sentAfter(1)).toEqual([`roasts?id=eq.${orphan.id}`]);
  expect(await storedIds(page, "roasts")).toEqual([belongsElsewhere.id]);
  expect(await storedIds(page, "beans")).toEqual([renamedBag.id]);
});

// The local cascade removes the records beanHistory matched BY IDENTITY, not by id.
// An id filter removes more than the modal counted whenever ids collide or are
// missing -- and a local delete is the one nothing can bring back.
test("beans: same-named bags -- two roasts sharing an id: deleting one bag's keeps the other bag's roast", async ({ page }) => {
  const SHARED_ID = 1750000000501;
  const sharedA = { ...fixtureRoast, id: SHARED_ID, date: "2026-08-01", beanName: "Dup Bean", beanId: bagA.id };
  const sharedB = { ...fixtureRoast, id: SHARED_ID, date: "2026-08-15", beanName: "Dup Bean", beanId: bagB.id };
  await seedBeanHistory(page, { beans: [bagA, bagB], roasts: [sharedA, sharedB] });
  const deletes = recordCloudDeletes(page);

  await openBeanDetail(page, "Dup Bean");
  await page.getByText("DELETE BEAN").click();
  const modal = deleteModal(page);
  await expect(modal).toContainText("This bean has 1 roast + 0 tastings.");
  await modal.getByRole("button", { name: "DELETE BEAN + 1 ROAST + 0 TASTINGS", exact: true }).click();

  // The cloud list is still the matched set's ids, unchanged: bag A and its one roast.
  expect(await deletes.sentAfter(2)).toEqual([`beans?id=eq.${bagA.id}`, `roasts?id=eq.${SHARED_ID}`]);
  // Both roasts have the same id, so tell them apart by bag.
  const left = await page.evaluate(() => JSON.parse(window.localStorage.getItem("roasts") || "[]").map((r) => r.beanId));
  expect(left).toEqual([bagB.id]);
  expect(await storedIds(page, "beans")).toEqual([bagB.id]);
});

test("beans: an id-less roast and tasting of this bag are removed locally without taking an unrelated id-less one", async ({ page }) => {
  const solo = { ...fixtureBean, id: 1750000000105, name: "Idless Bean" };
  // JSON drops `id: undefined`, so these are stored with no id at all.
  const ownRoast = { ...fixtureRoast, id: undefined, date: "2026-08-01", beanName: "Idless Bean", beanId: solo.id };
  const otherRoast = { ...fixtureRoast, id: undefined, date: "2026-08-02", beanName: "Other Bean" };
  const ownBrew = { ...fixtureTasting, id: undefined, roastId: "", beanName: "Idless Bean" };
  const otherBrew = { ...fixtureTasting, id: undefined, roastId: "", beanName: "Other Bean" };
  await seedBeanHistory(page, { beans: [solo], roasts: [ownRoast, otherRoast], tastings: [ownBrew, otherBrew] });
  const deletes = recordCloudDeletes(page);

  await openBeanDetail(page, "Idless Bean");
  await page.getByText("DELETE BEAN").click();
  const modal = deleteModal(page);
  await expect(modal).toContainText("This bean has 1 roast + 1 tasting.");
  await modal.getByRole("button", { name: "DELETE BEAN + 1 ROAST + 1 TASTING", exact: true }).click();

  // Positive control: the cascade ran (the bag's own delete was sent) before we
  // judge what stayed.
  expect(await deletes.sentAfter(1)).toContain(`beans?id=eq.${solo.id}`);
  const stored = (key) => page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) || "[]").map((x) => x.beanName), key);
  expect(await stored("roasts")).toEqual(["Other Bean"]);
  expect(await stored("tastingNotes")).toEqual(["Other Bean"]);
  expect(await storedIds(page, "beans")).toEqual([]);
});

// The modal is drawn from storage at one moment and the cascade reads storage again at the
// tap. The launch sync can write between the two, so the tap could delete one more record
// than the button promised. The rule: if the bag's own sets changed, delete NOTHING, redraw
// the modal with the fresh counts, and let the user decide again.
test("beans: a record that appeared after the modal was drawn is NOT swept up by the tap -- the modal redraws and asks again", async ({ page }) => {
  await seedBeanHistory(page, { beans: [bagA, bagB], roasts: [roastA, roastB], tastings: [] });
  const deletes = recordCloudDeletes(page);

  await openBeanDetail(page, "Dup Bean");
  await page.getByText("DELETE BEAN").click();
  const modal = deleteModal(page);
  await expect(modal).toContainText("This bean has 1 roast + 0 tastings.");
  const stale = modal.getByRole("button", { name: "DELETE BEAN + 1 ROAST + 0 TASTINGS", exact: true });
  await expect(stale).toBeVisible();

  // The sync lands and the user taps in the SAME task: React has had no chance to redraw
  // the button, exactly as on a phone whose last render is a moment old. The new tasting
  // belongs to bag A's roast, so a delete would take it.
  await stale.evaluate((button, tasting) => {
    const stored = JSON.parse(window.localStorage.getItem("tastingNotes") || "[]");
    window.localStorage.setItem("tastingNotes", JSON.stringify([...stored, tasting]));
    button.click();
  }, tastingA);

  // The modal redrew with the true counts, and says why nothing happened.
  const fresh = modal.getByRole("button", { name: "DELETE BEAN + 1 ROAST + 1 TASTING", exact: true });
  await expect(fresh).toBeVisible();
  await expect(modal).toContainText("This bean has 1 roast + 1 tasting.");
  await expect(page.getByText(/history changed/i)).toBeVisible();
  // Nothing was deleted: not in the cloud, not locally -- including the tasting the
  // user was never shown.
  expect(deletes.snapshot()).toEqual([]);
  expect(await storedIds(page, "beans")).toEqual([bagA.id, bagB.id]);
  expect(await storedIds(page, "roasts")).toEqual([roastA.id, roastB.id]);
  expect(await storedIds(page, "tastingNotes")).toEqual([tastingA.id]);

  // Tapping again, now on what is on screen, goes through -- and takes exactly that.
  await fresh.click();
  expect(await deletes.sentAfter(3)).toEqual([
    `beans?id=eq.${bagA.id}`,
    `roasts?id=eq.${roastA.id}`,
    `tasting_notes?id=eq.${tastingA.id}`,
  ]);
  expect(await storedIds(page, "roasts")).toEqual([roastB.id]);
  expect(await storedIds(page, "tastingNotes")).toEqual([]);
  expect(await storedIds(page, "beans")).toEqual([bagB.id]);
});

test("beans: a record the modal did show may still disappear from storage -- the tap then deletes nothing and redraws", async ({ page }) => {
  // The other direction: the modal promised 1 roast + 1 tasting, then the tasting was
  // removed. Deleting a different set than the one confirmed is wrong either way.
  await seedBeanHistory(page, { beans: [bagA, bagB], roasts: [roastA, roastB], tastings: [tastingA] });
  const deletes = recordCloudDeletes(page);

  await openBeanDetail(page, "Dup Bean");
  await page.getByText("DELETE BEAN").click();
  const modal = deleteModal(page);
  const stale = modal.getByRole("button", { name: "DELETE BEAN + 1 ROAST + 1 TASTING", exact: true });
  await expect(stale).toBeVisible();

  await stale.evaluate((button) => {
    window.localStorage.setItem("tastingNotes", "[]");
    button.click();
  });

  await expect(modal.getByRole("button", { name: "DELETE BEAN + 1 ROAST + 0 TASTINGS", exact: true })).toBeVisible();
  expect(deletes.snapshot()).toEqual([]);
  expect(await storedIds(page, "roasts")).toEqual([roastA.id, roastB.id]);
  expect(await storedIds(page, "beans")).toEqual([bagA.id, bagB.id]);
});

test("beans: profile notes save, display, and are editable", async ({ page }) => {
  await page.getByRole("button", { name: "Beans" }).click();
  await page.getByText("E2E Ethiopia Test").first().click();
  await page.getByText("+ NEW PROFILE").click();

  await page.getByPlaceholder("Profile Name (e.g. Light Roast)").fill("E2E Test Profile");
  await page.getByPlaceholder("Notes (optional) — tasting result, what you'd change next time...").fill("First note");
  await page.getByText("SAVE PROFILE").click();

  await expect(page.getByText("First note")).toBeVisible();

  await page.getByText("NOTES", { exact: true }).click();
  await page.getByPlaceholder("Notes — tasting result, what you'd change next time...").fill("Updated note");
  await page.getByText("SAVE", { exact: true }).click();

  await expect(page.getByText("Updated note")).toBeVisible();
});

test("history tastings: half-star rating renders in list", async ({ page }) => {
  await page.getByRole("button", { name: "History" }).click();
  await page.getByText("TASTINGS").click();

  await expect(page.getByText("E2E Ethiopia Test").first()).toBeVisible();
  await expect(page.getByText("Dark Chocolate").first()).toBeVisible();

  await fullPageShot(page, "tastings-list.png");
});

test("history: roast detail renders the split roast-story chart", async ({ page }) => {
  await page.getByRole("button", { name: "History" }).click();
  await page.getByText("E2E Ethiopia Test").first().click();

  // Both ComposedCharts (development curve + control map) must render.
  await expect(page.locator(".recharts-surface").nth(1)).toBeVisible();
  // The chart must still NAME its phases. The mechanism changed in v3.5.x --
  // in-plot divider pills ("FC") sat where the y-axis ticks are and were
  // replaced by the phase ribbon above the plot, shared with the live chart --
  // so this asserts the ribbon rather than the retired label. The fixture roast
  // has YELLOWING/FIRST CRACK/COOLING START and no MAILLARD entry, which
  // exercises the Yellowing fallback: DRY / MAI / DEV.
  await expect(page.getByTitle(/^DEV /).first()).toBeVisible();
  await expect(page.getByTitle(/^DRY /).first()).toBeVisible();
  // Metric tiles present.
  await expect(page.getByText("Avg RoR")).toBeVisible();
  await expect(page.getByText("DTR")).toBeVisible();

  await fullPageShot(page, "history-chart.png");
});

test.describe("light mode", () => {
  test.beforeEach(async ({ page }) => {
    // Base beforeEach already seeded roasts/tastingNotes and loaded dark mode;
    // flip the theme and reload so App.js's data-theme effect applies before
    // any of these tests interact with the page.
    await page.evaluate(() => window.localStorage.setItem("roastlogs_theme", "light"));
    await page.reload();
    await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });
  });

  test("roast tab renders in light mode", async ({ page }) => {
    await fullPageShot(page, "roast-tab-light.png");
  });

  test("brew: bag-label summary renders in light mode", async ({ page }) => {
    await page.getByRole("button", { name: "Brew" }).click();
    await page.getByPlaceholder("e.g., Ethiopia Yirgacheffe").fill("E2E Brew Bean");
    await page.getByText("START TASTING").click();
    await page.getByText("NEXT").click();
    await page.getByText("Chocolatey").click();
    await page.getByText("NEXT").click();
    await page.getByText("Dark Chocolate", { exact: true }).click();
    await page.getByText("NEXT").click();

    await expect(page.getByText("SINGLE ORIGIN ROAST")).toBeVisible();
    await page.getByLabel("3.5 stars").click();

    await fullPageShot(page, "brew-summary-light.png");
  });

  test("history tastings: list renders in light mode", async ({ page }) => {
    await page.getByRole("button", { name: "History" }).click();
    await page.getByText("TASTINGS").click();

    await expect(page.getByText("E2E Ethiopia Test").first()).toBeVisible();
    await expect(page.getByText("Dark Chocolate").first()).toBeVisible();

    await fullPageShot(page, "tastings-list-light.png");
  });

  test("history: roast detail chart renders in light mode", async ({ page }) => {
    await page.getByRole("button", { name: "History" }).click();
    await page.getByText("E2E Ethiopia Test").first().click();

    await expect(page.locator(".recharts-surface").nth(1)).toBeVisible();
    // Ribbon rather than the retired in-plot "FC" pill -- see the dark-mode
    // test above. Also proves the phase tints resolve in light mode: they are
    // semantic tokens now, where they used to be three hardcoded hexes that
    // ignored the theme entirely.
    await expect(page.getByTitle(/^DEV /).first()).toBeVisible();

    await fullPageShot(page, "history-chart-light.png");
  });
});


// ---------------------------------------------------------------------------
// Roast Setup (v3.9.0): the Roast tab's front door. Functional assertions only
// -- the screenshot baseline for this screen is generated on Casey's Mac.
// ---------------------------------------------------------------------------

// `bean` is the one inventory bean the device holds. The shared fixture by default; a test
// that needs another name (a long one) passes its own, so e2e/fixtures.js stays as it is.
async function seedSetup(page, { setup = "sr540", profiles = [fixtureProfile], bean = fixtureBean } = {}) {
  await page.addInitScript(({ bean, profs, equipment }) => {
    window.localStorage.setItem("beans", JSON.stringify([bean]));
    window.localStorage.setItem("global_profiles", JSON.stringify(profs));
    window.localStorage.setItem("roastlogs_equipment", equipment);
  }, { bean, profs: profiles, equipment: setup });
  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });
}

test("setup: the Roast tab lands on Setup, and START waits for an explicit profile choice", async ({ page }) => {
  await seedSetup(page);
  await expect(page.getByTestId("roast-setup")).toBeVisible();
  // Setup is the takeover: no live hero, no START button behind it.
  await expect(page.getByRole("button", { name: "START", exact: true })).toHaveCount(0);

  const go = page.getByRole("button", { name: "Start roast" });
  await expect(go).toBeDisabled();
  await page.getByRole("button", { name: /Manual roast/ }).click();
  await expect(go).toBeEnabled();
});

test("setup: a probe-less setup skips preheat and goes straight to the roast", async ({ page }) => {
  await seedSetup(page, { setup: "oem-tube" });
  await page.getByRole("button", { name: /Manual roast/ }).click();
  await page.getByRole("button", { name: "Start roast" }).click();
  await expect(page.getByTestId("roast-setup")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "PAUSE" })).toBeVisible();
});

test("setup: a probe setup reads 'Continue' with no bridge, and offers the preheat target", async ({ page }) => {
  await seedSetup(page, { setup: "razzo-v5t" });
  await expect(page.getByLabel(/Preheat target/)).toHaveValue("315");
  await page.getByRole("button", { name: /Manual roast/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  // No live reading in the test browser, so this is the ordinary hero with START.
  await expect(page.getByRole("button", { name: "START", exact: true })).toBeVisible();
  // ...and the summary bar takes you back to Setup before the roast begins.
  await page.getByRole("button", { name: /Roast setup|E2E/ }).first().click();
  await expect(page.getByTestId("roast-setup")).toBeVisible();
});

test("setup: choosing a profile fills starting Fan then Heat from its 0:00 step", async ({ page }) => {
  await seedSetup(page);
  await page.getByRole("button", { name: /E2E Profile/ }).click();
  const tiles = page.locator("div.grid.grid-cols-3 input");
  await expect(tiles.nth(0)).toHaveValue("4"); // Fan
  await expect(tiles.nth(1)).toHaveValue("7"); // Heat
});

test("setup -> save: the roast records beanId, stock deducts, and the setup carries forward", async ({ page }) => {
  await seedSetup(page);
  await page.getByRole("button", { name: /E2E Setup Bean/ }).click();
  await expect(page.getByText("1000", { exact: false }).first()).toBeVisible();
  await page.getByLabel("Green weight in grams").fill("250");
  await expect(page.getByText("750g")).toBeVisible(); // left after this roast
  await page.getByRole("button", { name: /Manual roast/ }).click();
  await page.getByRole("button", { name: "Start roast" }).click();

  for (const label of ["Yellowing", "First crack", "Cooling start"]) {
    await page.getByRole("button", { name: `Mark ${label}` }).click();
  }
  await page.getByRole("button", { name: "SAVE ROAST" }).click();
  await skipDropWeight(page); // the roasted-weight prompt covers the nav until it is answered

  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem("roasts"))[0]);
  expect(saved.beanId).toBe(fixtureBean.id);
  expect(saved.beanName).toBe(fixtureBean.name);
  expect(saved.greenWeight).toBe(250);

  // Back on Setup once the save settles, with bean and weight carried forward
  // -- but the profile choice is NOT (chosen on purpose, every roast).
  await expect(page.getByTestId("roast-setup")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel("Green weight in grams")).toHaveValue("250");
  await expect(page.getByText(/last setup carried forward/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start roast" })).toBeDisabled();

  // Stock: 1000 - 250 on the bean's own detail page.
  await page.getByRole("button", { name: "Beans" }).click();
  await page.getByText(fixtureBean.name).first().click();
  await expect(page.getByText("750g / 1000g")).toBeVisible();
});

// The Setup screen carries the last roast's bag forward by id (live_beanId), and a
// delete can come along mid-carry: the last roast used bag A, the user deletes bag A
// while a same-named restock B exists. Setup's relink-by-name only runs when it holds
// NO id, so a stale A (matching no bag) used to stay put and the next roast saved
// beanId: A -- a bag that is gone. beanHistory then filed that brand-new roast as
// "unlinked" under B, and B's stock never deducted it.
test("setup: deleting the carried-forward bag relinks the next roast to the same-named restock", async ({ page }) => {
  await page.addInitScript(({ beans, roasts, live }) => {
    window.localStorage.setItem("beans", JSON.stringify(beans));
    window.localStorage.setItem("roasts", JSON.stringify(roasts));
    window.localStorage.setItem("roastlogs_equipment", "sr540");
    // What a SAVE with bag A leaves behind (keepSetup): bean, id and weight carried forward.
    window.localStorage.setItem("live_beanName", live.name);
    window.localStorage.setItem("live_beanId", String(live.id));
    window.localStorage.setItem("live_greenWeightGrams", "250");
  }, { beans: [bagA, bagB], roasts: [roastA], live: { name: bagA.name, id: bagA.id } });
  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });
  // Pre-condition: Setup really is carrying bag A.
  await expect(page.getByTestId("roast-setup")).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("live_beanId"))).toBe(String(bagA.id));

  // Delete bag A (the first "Dup Bean"), keeping its history.
  await openBeanDetail(page, "Dup Bean");
  await page.getByText("DELETE BEAN").click();
  await page.getByText("KEEP HISTORY, DELETE BEAN ONLY").click();
  await expect.poll(() => storedIds(page, "beans")).toEqual([bagB.id]);

  // Back to the Roast tab: the stale id must not survive. Setup has relinked the one
  // bag left with that name, so it is B -- never A, never "no bag".
  await page.getByRole("button", { name: "Roast", exact: true }).click();
  await expect(page.getByTestId("roast-setup")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("live_beanId"))).toBe(String(bagB.id));

  await page.getByRole("button", { name: /Manual roast/ }).click();
  await page.getByRole("button", { name: "Start roast" }).click();
  for (const label of ["Yellowing", "First crack", "Cooling start"]) {
    await page.getByRole("button", { name: `Mark ${label}` }).click();
  }
  await page.getByRole("button", { name: "SAVE ROAST" }).click();
  await skipDropWeight(page); // the roasted-weight prompt covers the nav until it is answered

  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem("roasts"))[0]);
  expect(saved.id).not.toBe(roastA.id);
  expect(saved.beanName).toBe("Dup Bean");
  expect(saved.beanId).toBe(bagB.id);

  // B's own detail: the new roast is B's session -- counted, deducted -- not an "older
  // roast with this name". Only roastA (bag A's, history kept) sits in the older list.
  await page.getByRole("button", { name: "Beans" }).click();
  await page.getByText("Dup Bean").first().click();
  await expect(sessionsPill(page)).toHaveText("1 sessions");
  await expect(page.getByText("750g / 1000g")).toBeVisible();
  const older = page.getByTestId("older-roasts");
  await expect(older.getByText(roastA.date)).toBeVisible();
  await expect(older.getByText(saved.date)).toHaveCount(0);
});

test("setup: 'Use in Roast' on Bean Detail lands on Setup with bean and profile chosen", async ({ page }) => {
  await seedSetup(page, { profiles: [{ ...fixtureProfile, beanName: fixtureBean.name }] });
  await page.getByRole("button", { name: "Beans" }).click();
  await page.getByText(fixtureBean.name).first().click();
  await page.getByRole("button", { name: "Use in Roast" }).first().click();
  await expect(page.getByTestId("roast-setup")).toBeVisible();
  await expect(page.getByRole("button", { name: /E2E Profile/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Start roast" })).toBeEnabled();
});

// ---------------------------------------------------------------------------
// RL-029: the preheat target can never be stored outside 200-500 F. Setup's
// field used to write `Number(value) || 0` on every keystroke, so clearing it
// stored 0 and stopping after a "3" stored 3 -- and both survive a reload. The
// preheat screen then reads "Ready to charge" against a cold roaster and the
// rising-crossing chime can never fire, so beans go in early.
//
// Typed entry follows ONE rule: an in-range whole number is stored as it is
// typed; ANYTHING else (empty, "3", "33", "-10", "150", "501", "99999", "1e9")
// changes nothing. An out-of-range draft stays in the field while editing, is
// never stored, and the field snaps back to the last valid target when it is
// left. It never clamps -- a half-typed "3" (the start of 330) must not become a
// near-cold 200 F target. Only the preheat screen's -5 / +5 clamps.
// ---------------------------------------------------------------------------

const PREHEAT_KEY = "roastlogs_preheat_target";
const preheatField = (page) => page.getByLabel(/Preheat target/);
const storedPreheat = (page) => page.evaluate((k) => window.localStorage.getItem(k), PREHEAT_KEY);

// Types a valid target and leaves the field, so the next step starts from a known one.
async function settlePreheatTarget(page, value) {
  const field = preheatField(page);
  await field.fill(value);
  await field.blur();
  await expect(field).toHaveValue(value);
  expect(await storedPreheat(page)).toBe(value);
}

test("preheat target: an in-range value is stored as it is typed, before the field is left", async ({ page }) => {
  await seedSetup(page, { setup: "razzo-v5t" });
  const field = preheatField(page);
  await field.click();
  await field.fill("330");
  await expect(field).toHaveValue("330");
  expect(await storedPreheat(page)).toBe("330"); // no blur yet
});

test("preheat target: clearing the field leaves it empty while editing, and stores nothing", async ({ page }) => {
  await seedSetup(page, { setup: "razzo-v5t" });
  const field = preheatField(page);
  await field.click();
  await field.fill("");
  // The draft is the field's own: it is not snapped back to a number mid-edit.
  await expect(field).toHaveValue("");
  expect(await storedPreheat(page)).toBe("315"); // the default; never 0
});

test("preheat target: a typed value is kept when the field is left, and survives a reload", async ({ page }) => {
  await seedSetup(page, { setup: "razzo-v5t" });
  await settlePreheatTarget(page, "330");

  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });
  await expect(preheatField(page)).toHaveValue("330");
  expect(await storedPreheat(page)).toBe("330");
});

test("preheat target: leaving the field empty keeps the previous target, never 0", async ({ page }) => {
  await seedSetup(page, { setup: "razzo-v5t" });
  await settlePreheatTarget(page, "330");
  const field = preheatField(page);
  await field.fill("");
  expect(await storedPreheat(page)).toBe("330"); // still the previous one while empty
  await field.blur();
  await expect(field).toHaveValue("330");
  expect(await storedPreheat(page)).toBe("330");
});

// The same keep-previous rule for every kind of out-of-range draft. None of them
// is clamped: "3" and "33" are what a half-typed 330 looks like on the way, and a
// near-cold 200 F target is the bug this exists to prevent.
for (const bad of ["3", "33", "-10", "150", "199", "501", "99999", "1e9"]) {
  test(`preheat target: ${JSON.stringify(bad)} is never stored, and leaving the field keeps the previous 330`, async ({ page }) => {
    await seedSetup(page, { setup: "razzo-v5t" });
    await settlePreheatTarget(page, "330");
    const field = preheatField(page);
    await field.fill(bad);
    await expect(field).toHaveValue(bad); // the draft stays in the field while editing...
    expect(await storedPreheat(page)).toBe("330"); // ...but is never stored
    await field.blur();
    await expect(field).toHaveValue("330");
    expect(await storedPreheat(page)).toBe("330");
  });
}

test("preheat target: with nothing chosen yet, a half-typed 3 left behind leaves the 315 default", async ({ page }) => {
  await seedSetup(page, { setup: "razzo-v5t" });
  const field = preheatField(page);
  await field.fill("3");
  await field.blur();
  await expect(field).toHaveValue("315");
  expect(await storedPreheat(page)).toBe("315");
});

test("preheat target: the edges, 200 and 500, are accepted as typed", async ({ page }) => {
  await seedSetup(page, { setup: "razzo-v5t" });
  for (const edge of ["200", "500"]) await settlePreheatTarget(page, edge);
});

// A target stored by an earlier build (or hand-edited) must come back usable --
// as the 315 default, not clamped to an edge. Each loads on a fresh page load,
// which is the only place the stored value is read.
for (const raw of ["0", "3", "-10", "9999", "abc"]) {
  test(`preheat target: a stored ${JSON.stringify(raw)} loads as the 315 default, never as itself`, async ({ page }) => {
    await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [PREHEAT_KEY, raw]);
    await seedSetup(page, { setup: "razzo-v5t" });
    await expect(preheatField(page)).toHaveValue("315");
    expect(await storedPreheat(page)).toBe("315");
  });
}

for (const raw of ["200", "500"]) {
  test(`preheat target: a stored ${JSON.stringify(raw)} is already valid, so it loads unchanged`, async ({ page }) => {
    await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [PREHEAT_KEY, raw]);
    await seedSetup(page, { setup: "razzo-v5t" });
    await expect(preheatField(page)).toHaveValue(raw);
    expect(await storedPreheat(page)).toBe(raw);
  });
}

// The preheat screen is the other editor of the same number, so it has to
// agree with Setup about the range. Its -5 has always floored at 200; its +5
// had no ceiling. It is only on screen with a live bridge (a probe setup, a
// real reading, no roast under way), so these run on the mocked bridge feed.
async function openPreheatScreen(page, target) {
  await mockRoastLinkFeed(page);
  await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [PREHEAT_KEY, String(target)]);
  await seedSetup(page, { setup: "razzo-v5t" });
  await page.getByRole("button", { name: /Manual roast/ }).click();
  await page.getByRole("button", { name: "Begin preheat" }).click({ timeout: 15_000 });
  const targetButton = page.getByRole("button", { name: /^Target \d+/ });
  await expect(targetButton).toHaveText(`Target ${target}°F`);
  await targetButton.click(); // opens the -5 / +5 editor
  return targetButton;
}

test("preheat target: the preheat screen's +5 stops at 500", async ({ page }) => {
  const targetButton = await openPreheatScreen(page, 495);
  const plus = page.getByRole("button", { name: "+5", exact: true });
  // Three taps from 495: the first lands on 500, the next two must not pass it.
  for (let i = 0; i < 3; i++) await plus.click();
  await expect(targetButton).toHaveText("Target 500°F");
  expect(await storedPreheat(page)).toBe("500");
});

test("preheat target: the preheat screen's -5 stops at 200", async ({ page }) => {
  // Already true today -- here so the two ends of the range are asserted together.
  const targetButton = await openPreheatScreen(page, 205);
  const minus = page.getByRole("button", { name: "−5", exact: true });
  for (let i = 0; i < 3; i++) await minus.click();
  await expect(targetButton).toHaveText("Target 200°F");
  expect(await storedPreheat(page)).toBe("200");
});

test("preheat target: the value typed on Setup is the one the preheat screen shows", async ({ page }) => {
  await mockRoastLinkFeed(page);
  await seedSetup(page, { setup: "razzo-v5t" });
  await page.getByRole("button", { name: /Manual roast/ }).click();
  await preheatField(page).fill("340");
  // No explicit blur: pressing the primary button is what leaves the field.
  await page.getByRole("button", { name: "Begin preheat" }).click({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^Target \d+/ })).toHaveText("Target 340°F");
  expect(await storedPreheat(page)).toBe("340");
});

// iOS Safari does not move focus on a tap, so the field is never blurred: a
// Playwright .click() (mousedown, focus change, mouseup, click) would hide that.
// dispatchEvent("click") is ONLY the click event. The typed target has to reach
// the preheat screen and storage without any blur to carry it.
test("preheat target: a tap on Begin preheat that never blurs the field still carries the typed target", async ({ page }) => {
  await mockRoastLinkFeed(page);
  await seedSetup(page, { setup: "razzo-v5t" });
  await page.getByRole("button", { name: /Manual roast/ }).click();
  await preheatField(page).fill("340");
  const begin = page.getByRole("button", { name: /Begin preheat/ });
  await expect(begin).toBeVisible({ timeout: 15_000 }); // the label waits on the first live reading
  await begin.dispatchEvent("click");
  await expect(page.getByRole("button", { name: /^Target \d+/ })).toHaveText("Target 340°F");
  expect(await storedPreheat(page)).toBe("340");
});

test("preheat target: a target typed and left by switching tabs is kept when you come back", async ({ page }) => {
  await seedSetup(page, { setup: "razzo-v5t" });
  await preheatField(page).fill("340");
  // Only the click again, so the field is never blurred on the way out.
  await page.getByRole("button", { name: "History", exact: true }).dispatchEvent("click");
  await expect(page.getByTestId("roast-setup")).toHaveCount(0);
  await page.getByRole("button", { name: "Roast", exact: true }).dispatchEvent("click");
  await expect(page.getByTestId("roast-setup")).toBeVisible();
  await expect(preheatField(page)).toHaveValue("340");
  expect(await storedPreheat(page)).toBe("340");
});

// ---------------------------------------------------------------------------
// RL-037: the followed profile survives a mid-roast reload. iOS reclaims a
// backgrounded PWA (app switch, lock, the phone flashlight), so the page
// reloads with the roast's live_* keys in storage and nothing in memory. The
// clock, log and curve always came back; the profile did not -- App.js started
// profileFollowing at null and its persist effect then wrote that null over
// live_profileFollowing -- so the ghost, the badge and the step guidance all
// vanished and the roast saved with profile: null.
//
// The tests in this section assert the restored PLAN (badge, step strip, step
// index). The ghost LINE that plan feeds is covered further down, where a
// mocked bridge (mockRoastLinkFeed in e2e/helpers.js) puts a real chart on
// screen: "ghost: a source roast that syncs down AFTER the app mounts ..."
// (RL-038), the "ghost caption: ..." tests (RL-039), and "ghost: followed from
// Setup, drawn live, and still drawn after a mid-roast reload" -- the RL-036
// symptom itself, drawn before the reload and checked again after it.
// The ghost's model is unit-tested in LiveRoastChart.plan.test.js.
// ---------------------------------------------------------------------------

const stored = (page, key) => page.evaluate((k) => window.localStorage.getItem(k), key);

// What a mid-roast reload sees: the roast's live_* keys in storage, nothing in
// memory. Written once with page.evaluate -- NOT an init script, which would
// re-run on every reload (as the beforeEach/seedSetup ones do) and overwrite the
// very keys the app rewrites as it runs and that these tests read back.
// `profileRaw` seeds an exact string instead, for corrupt-data cases.
async function reloadMidRoast(page, { profile = fixtureProfile, profileRaw, stepIdx = -1, live = fixtureLiveRoast } = {}) {
  await page.evaluate(({ profile, profileRaw, stepIdx, live }) => {
    const ls = window.localStorage;
    ls.setItem("live_elapsedSeconds", String(live.elapsedSeconds));
    ls.setItem("live_roastLog", JSON.stringify(live.roastLog));
    ls.setItem("live_profileFollowing", profileRaw !== undefined ? profileRaw : JSON.stringify(profile));
    // `stepIdx: null` leaves the key absent, as it would be if it was never written.
    if (stepIdx === null) ls.removeItem("live_currentProfileStepIdx");
    else ls.setItem("live_currentProfileStepIdx", String(stepIdx));
  }, { profile, profileRaw, stepIdx, live });
  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });
}

// The bean-temp readout is also the button that opens the live chart -- and a
// tap TOGGLES it. On a probe roast the app opens the chart by itself (at START,
// and when the page reloads into a roast under way), so a bare tap would now
// close it. This taps only if the chart is not already open. It gives the
// auto-open a moment to land first: the readout can render a beat before the
// state that opens the chart settles, and a tap in that gap would close it.
const beanTempReadout = (page) => page.locator("button[aria-expanded]").filter({ hasText: /Bean temp/ });

async function ensureLiveChartOpen(page) {
  const readout = beanTempReadout(page);
  await expect(readout).toBeVisible({ timeout: 15_000 });
  try {
    await expect(readout).toHaveAttribute("aria-expanded", "true", { timeout: 1_500 });
  } catch (e) {
    await readout.click({ timeout: 15_000 });
  }
}

const profileBadge = (page) => page.getByText("Active Profile: E2E Profile");

test("profile survives a mid-roast reload: badge and plan return, and the saved roast keeps the profile", async ({ page }) => {
  await seedSetup(page);
  await reloadMidRoast(page);

  // The SAME roast came back: paused at its clock, no Setup takeover.
  await expect(page.getByTestId("roast-setup")).toHaveCount(0);
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await expect(page.getByText("02:10", { exact: true })).toBeVisible(); // 130s

  // ...and so did the plan. Before the fix none of this rendered.
  await expect(profileBadge(page)).toBeVisible();
  await expect(page.getByText("F4 H7", { exact: true })).toBeVisible(); // 0:00 step, Fan before Heat
  await expect(page.getByText("F6 H6", { exact: true })).toBeVisible(); // 4:00 step
  // The persist effect must not have clobbered the stored copy on mount.
  await expect
    .poll(async () => JSON.parse(await stored(page, "live_profileFollowing")))
    .toEqual(fixtureProfile);

  // Controls still render Fan -> Heat -> Temp, carrying the restored log's values.
  const dials = page.locator("div.grid.grid-cols-3.divide-x > button");
  // (innerText carries the CSS uppercase, so compare case-insensitively.)
  const dialLabels = await dials.locator("div:first-child").allInnerTexts();
  expect(dialLabels.map((l) => l.toLowerCase())).toEqual(["fan", "heat", "temp"]);
  await expect(dials.nth(0).locator("div").nth(1)).toHaveText("4"); // Fan
  await expect(dials.nth(1).locator("div").nth(1)).toHaveText("7"); // Heat

  // Finish the roast and save it. The profile the roaster chose must be on it.
  await page.getByRole("button", { name: "RESUME", exact: true }).click();
  for (const label of ["Yellowing", "First crack", "Cooling start"]) {
    await page.getByRole("button", { name: `Mark ${label}` }).click();
  }
  await page.getByRole("button", { name: "SAVE ROAST" }).click();

  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem("roasts"))[0]);
  expect(saved.totalSeconds).toBeGreaterThanOrEqual(130); // continued the restored clock
  expect(saved.profile).not.toBeNull();
  expect(saved.profile.id).toBe(fixtureProfile.id);
  expect(saved.profile).toEqual(fixtureProfile);
});

test("profile survives a mid-roast reload: chosen on Setup, started, paused -- the real sequence, not a seeded one", async ({ page }) => {
  // The seeded test above hand-builds the live_* keys; this one lets the app
  // write them, so it also catches the stored shape drifting away from the
  // shape the restore reads.
  await seedSetup(page);
  await page.getByRole("button", { name: /E2E Profile/ }).click();
  await page.getByRole("button", { name: "Start roast" }).click();
  await expect(profileBadge(page)).toBeVisible();
  // Let the clock get past 0:00. At exactly 0 a lost step index heals itself --
  // the 0:00 step is "reached" again on the first tick -- which would hide the
  // very thing this test is for.
  await expect(page.getByText("00:02", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "PAUSE" }).click();

  // Step 0 (the 0:00 step) is reached the instant the roast starts; wait for the
  // app to have persisted both that and the log, as a real backgrounding would.
  await expect.poll(() => stored(page, "live_currentProfileStepIdx")).toBe("0");
  await expect.poll(async () => (await stored(page, "live_roastLog")) || "").toContain("start_settings");

  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });

  await expect(page.getByTestId("roast-setup")).toHaveCount(0);
  await expect(profileBadge(page)).toBeVisible();
  const profile = JSON.parse(await stored(page, "live_profileFollowing"));
  expect(profile.id).toBe(fixtureProfile.id);

  // Step guidance resumes where it was: the NEXT step is the 4:00 one. With the
  // step index lost it would point back at 0:00 and never advance.
  await page.getByRole("button", { name: "RESUME", exact: true }).click();
  await expect(page.getByText("04:00 · F6 · H6")).toBeVisible();
  await expect(page.getByText("00:00 · F4 · H7")).toHaveCount(0);
});

test("profile survives a mid-roast reload: step guidance resumes at the right step, flashes, and still auto-logs the next", async ({ page }) => {
  // 5s before the 4:00 step, with step 0 already reached.
  await seedSetup(page);
  await reloadMidRoast(page, { stepIdx: 0, live: { ...fixtureLiveRoast, elapsedSeconds: 235 } });
  await expect(profileBadge(page)).toBeVisible();
  expect(await stored(page, "live_currentProfileStepIdx")).toBe("0");

  await page.getByRole("button", { name: "RESUME", exact: true }).click();
  // Upcoming = steps[restored index + 1]; inside the last 5s it flashes.
  const strip = page.locator("div.animate-pulse", { hasText: "Next step" });
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("04:00 · F6 · H6");

  // Then the 4:00 step lands on its own: logged under Profile, Fan then Heat.
  await expect
    .poll(
      async () => JSON.parse(await stored(page, "live_roastLog")).find((e) => e.label === "Profile"),
      { timeout: 15_000 }
    )
    .toMatchObject({ type: "adjustment", t: 240, fan: "6", heat: "6" });
  await expect.poll(() => stored(page, "live_currentProfileStepIdx")).toBe("1");
});

test("profile restore: a stale followed profile with NO roast in progress is not restored", async ({ page }) => {
  // Leftover keys from a roast that was never cleared. The profile is chosen on
  // purpose on Setup every roast, so none of it may arm a new one.
  await seedSetup(page);
  await page.evaluate((profile) => {
    const ls = window.localStorage;
    ls.setItem("live_elapsedSeconds", "0");
    ls.setItem("live_roastLog", "[]");
    ls.setItem("live_profileFollowing", JSON.stringify(profile));
    ls.setItem("live_currentProfileStepIdx", "1");
  }, fixtureProfile);
  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });

  await expect(page.getByTestId("roast-setup")).toBeVisible();
  await expect(page.getByText(/Active Profile/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /E2E Profile/ })).toHaveAttribute("aria-pressed", "false");
  // START still waits for an explicit choice.
  await expect(page.getByRole("button", { name: "Start roast" })).toBeDisabled();

  // The stale copy is dropped from storage too, not merely ignored.
  await expect.poll(() => stored(page, "live_profileFollowing")).toBe("null");
  await expect.poll(() => stored(page, "live_currentProfileStepIdx")).toBe("-1");
});

test("profile restore: once the roast is saved, a reload does not bring the profile back", async ({ page }) => {
  await seedSetup(page);
  await reloadMidRoast(page);
  await page.getByRole("button", { name: "RESUME", exact: true }).click();
  for (const label of ["Yellowing", "First crack", "Cooling start"]) {
    await page.getByRole("button", { name: `Mark ${label}` }).click();
  }
  await page.getByRole("button", { name: "SAVE ROAST" }).click();
  // The live session is cleared two seconds after the save, landing on Setup.
  await expect(page.getByTestId("roast-setup")).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("roast-setup")).toBeVisible();
  await expect(page.getByText(/Active Profile/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /E2E Profile/ })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Start roast" })).toBeDisabled();
});

test("profile restore: a corrupt stored profile is ignored, never trusted or crashed on", async ({ page }) => {
  await seedSetup(page);

  // Unusable profiles: the roast itself still comes back, just without a plan.
  // The first three are rejected by any shallow check. The rest PASS a shallow
  // "object with a steps array of objects" check and then threw while the Roast
  // tab drew them -- before the persist effect could overwrite the bad value, so
  // the app blanked on every relaunch ("no step time" and "name as an object"
  // were reproduced as exactly that). There is no error boundary: a profile the
  // Roast tab cannot draw has to be refused at the door, not survived.
  const unusable = [
    '{"name":"No Steps"}',
    "{not json",
    '{"name":"Bad Steps","steps":[null]}',
    '{"id":1,"name":"X","steps":[{"heat":"5","fan":"4"}]}', // step with no time and no totalSeconds
    '{"id":1,"name":{"a":1},"steps":[]}', // name is an object (rendered as a React child)
    '{"id":1,"name":"X","steps":[{}]}',
    '{"id":1,"name":"X","steps":[{"time":4,"heat":"5","fan":"4"}]}', // time is a number, not "MM:SS"
    '{"id":1,"name":"X","steps":[{"time":"00:00","totalSeconds":0,"fan":{"a":1},"heat":"5"}]}', // dial is an object
    '{"id":1,"name":"X","steps":[{"time":"00:00","totalSeconds":0,"fan":"4","heat":["5"]}]}', // dial is an array
    '{"id":1,"name":"X","steps":[{"time":"00:00","totalSeconds":null,"fan":"4","heat":"5"}]}', // totalSeconds is null
    '{"id":1,"name":"X","steps":[[]]}', // step is an array
    '{"id":1,"name":"X","steps":{"0":{"time":"00:00","totalSeconds":0}}}', // steps is an object
    '{"id":1,"name":["X"],"steps":[]}', // name is an array
    '{"id":1,"name":"X","steps":[],"milestones":[null]}', // chart reads m.label
    '{"id":1,"name":"X","steps":[],"milestones":"FIRST CRACK"}', // milestones is not an array
    '{"id":1,"name":"X","steps":[],"milestones":[{"t":480}]}', // milestone with no label
    '{"id":1,"name":"X","steps":[],"milestones":[{"label":"FIRST CRACK","t":"soon"}]}', // t is not a number
    '{"id":1,"name":"X","steps":[],"milestones":[{"label":"FIRST CRACK","t":2000000000}]}', // the live chart would build a row per second
    '{"id":{"toString":1},"steps":[]}', // id is String()-ed in render and in handleStop
    '{"id":1,"sourceRoastId":{"toString":1},"steps":[]}', // sourceRoastId is String()-ed to find the source roast
    '{"id":1,"beanName":{"a":1},"steps":[]}', // beanName is compared as text
    JSON.stringify({ id: 1, name: "X", steps: Array.from({ length: 501 }, () => ({ time: "00:00", totalSeconds: 0, fan: "4", heat: "5" })) }), // a step count no roaster built
    "[]",
    "42",
    '"just a string"',
  ];
  for (const profileRaw of unusable) {
    await reloadMidRoast(page, { profileRaw });
    await expect(page.getByText("Paused", { exact: true }), `profile ${profileRaw}`).toBeVisible();
    await expect(page.getByText(/Active Profile/), `profile ${profileRaw}`).toHaveCount(0);
  }
});

test("profile restore: a damaged roast in the cache costs the ghost, never the app", async ({ page }) => {
  await seedSetup(page);
  // A cached roast whose id is not text or a number would have thrown out of
  // String() while the plan was looked up in render, with no error boundary to
  // catch it -- a blank app on every relaunch. The profile still comes back.
  await page.evaluate(() => window.localStorage.setItem("roasts", JSON.stringify([{ id: { toString: 1 } }])));
  await reloadMidRoast(page, { profile: { ...fixtureProfile, sourceRoastId: 42 } });
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await expect(profileBadge(page)).toBeVisible();

  // Same for a profile pointing at a source roast whose phase label is not text.
  await page.evaluate(() => window.localStorage.setItem("roasts", JSON.stringify([{ id: 42, curve: [], roastLog: [{ type: "phase", label: { toString: 1 }, time: 100 }] }])));
  await reloadMidRoast(page, { profile: { ...fixtureProfile, sourceRoastId: 42 } });
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await expect(profileBadge(page)).toBeVisible();
});

test("profile restore: a lost or out-of-range step index is worked out from the clock, not reset to -1", async ({ page }) => {
  await seedSetup(page);

  // A good profile with a step index past its last step: profile restored, and the
  // index worked out from the stored clock instead of trusted. fixtureProfile has
  // steps at 0:00 and 4:00 and the roast is paused at 2:10, so only step 0 has been
  // passed. (-1 here was the old answer: "no step reached", which on resume waits
  // on a 0:00 step the clock is long past, so the 4:00 step never fires.)
  await reloadMidRoast(page, { stepIdx: 99 });
  await expect(profileBadge(page)).toBeVisible();
  await expect.poll(() => stored(page, "live_currentProfileStepIdx")).toBe("0");

  // A missing or unreadable index is the same case.
  for (const stepIdx of [null, "abc", -2, 2]) {
    await reloadMidRoast(page, { stepIdx });
    await expect(profileBadge(page), `index ${stepIdx}`).toBeVisible();
    await expect.poll(() => stored(page, "live_currentProfileStepIdx"), `index ${stepIdx}`).toBe("0");
  }

  // ...and the repaired index is what resume uses: the NEXT step shown is 4:00.
  await page.getByRole("button", { name: "RESUME", exact: true }).click();
  await expect(page.getByText("04:00 · F6 · H6")).toBeVisible();
  await expect(page.getByText("00:00 · F4 · H7")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// RL-038: the live ghost is recomputed when roasts arrive from the cloud. A
// profile saved from a roast carries only that roast's id; the ghost is drawn
// from the roast's own curve, looked up in storage. When the roast was recorded
// on another device it is not in storage yet at launch -- the launch sync brings
// it in a moment later -- and the memo that builds the ghost used to read
// storage once, so the ghost never appeared for the rest of that roast.
//
// This test drives the real chart, via two in-browser doubles
// (e2e/helpers.js): a bridge feeding the realtime channel, and a cloud that
// holds back its roasts until released. The unit tests cover planForProfile's
// logic; this one covers the wiring the unit tests cannot -- that the roast's
// arrival actually reaches the memo.
// ---------------------------------------------------------------------------

// Recharts draws the source curve as a <path> with a "4 3" dash in the Temp
// colour (the plan's Fan/Heat lines are "3 3"; the ReferenceLines are <line>
// elements). The stroke is part of the selector because a second dashed "4 3"
// line, in another colour, can sit beside it: matching on the dash alone would
// quietly measure whichever comes first in the DOM. It renders an empty path
// while the curve has no points, so the length of `d` is what separates "no
// ghost yet" from "ghost drawn" -- and a missing path counts as no ghost too,
// so this survives a chart library that omits an empty line.
const GHOST_PATH = 'path.recharts-line-curve[stroke="rgb(var(--chart-temp))"][stroke-dasharray="4 3"]';
const ghostPathD = (page) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? el.getAttribute("d") || "" : "";
  }, GHOST_PATH);
const ghostLength = async (page) => (await ghostPathD(page)).length;
const syncDotTitle = (page) => page.locator('[title^="Sync status"]').first().getAttribute("title");

test("ghost: a source roast that syncs down AFTER the app mounts draws the dashed plan line", async ({ page }) => {
  await mockRoastLinkFeed(page);
  const cloud = await holdCloudRoasts(page, [fixtureGhostSourceRow]);
  try {
    // The Razzo, mid-roast, following a profile saved from a roast this device
    // has never seen. (beforeEach seeds `roasts` with the one fixture roast only.)
    await page.evaluate(() => window.localStorage.setItem("roastlogs_equipment", "razzo-v5t"));
    await reloadMidRoast(page, { profile: fixtureGhostProfile });
    await expect(profileBadge(page)).toBeVisible();
    expect(
      (await stored(page, "roasts")).includes(String(fixtureGhostSourceRow.id)),
      "the source roast must not be on this device yet"
    ).toBe(false);

    // Controls still render Fan -> Heat -> Temp.
    const dials = page.locator("div.grid.grid-cols-3.divide-x > button");
    const dialLabels = await dials.locator("div:first-child").allInnerTexts();
    expect(dialLabels.map((l) => l.toLowerCase())).toEqual(["fan", "heat", "temp"]);

    // The bridge is on the channel: open the live chart from the bean-temp readout.
    await ensureLiveChartOpen(page);
    await expect(page.locator(".recharts-surface").first()).toBeVisible();

    // The sync is still waiting on the cloud, so the chart has no curve to ghost.
    await expect(page.locator('[title^="Sync status"]').first()).toHaveAttribute("title", "Sync status: syncing");
    expect(await ghostLength(page)).toBe(0);

    // The roast arrives. The launch sync writes it to storage, THEN bumps
    // roastsRev -- and that is what makes the memo read storage again.
    cloud.release();
    await expect
      .poll(async () => (await stored(page, "roasts")).includes(String(fixtureGhostSourceRow.id)), { timeout: 15_000 })
      .toBe(true);
    await expect.poll(() => syncDotTitle(page), { timeout: 15_000 }).not.toBe("Sync status: syncing");
    await expect.poll(() => ghostLength(page), { timeout: 15_000 }).toBeGreaterThan(100);
  } finally {
    cloud.release(); // never leave a held request behind if an assertion threw
  }
});

// ---------------------------------------------------------------------------
// RL-039: say why the live chart has no ghost. A followed profile that cannot
// draw one gets a single muted caption under the "Live curve" header; a profile
// that can, and a roast following no profile, get nothing (an absence is only
// explained where a ghost was promised). The reason logic is unit-tested in
// LiveRoastChart.plan.test.js -- this covers the wiring from the stored profile
// and roasts to the screen, and the layout at the phone's width.
// ---------------------------------------------------------------------------

const ghostCaption = (page) => page.getByTestId("ghost-caption");

// The Razzo, mid-roast, with the live chart open. `roasts` is what this device
// holds; it is written with an init script because beforeEach's own seed (the one
// fixture roast) re-runs on every load and would overwrite a plain evaluate().
// `live` is the roast's stored clock and log (reloadMidRoast's default when omitted).
// `bt` is what the bridge publishes (a number, or a function of the sample count: see
// mockRoastLinkFeed); `liveCurve` is the roast's recorded bean-temp curve so far, which
// is what a reload mid-roast reads back from storage.
async function openLiveChart(page, { profile = undefined, profileRaw = undefined, roasts = [fixtureRoast], live = undefined, bt = undefined, liveCurve = undefined } = {}) {
  await mockRoastLinkFeed(page, { bt });
  await page.addInitScript((r) => window.localStorage.setItem("roasts", JSON.stringify(r)), roasts);
  await page.evaluate(() => window.localStorage.setItem("roastlogs_equipment", "razzo-v5t"));
  if (liveCurve) await page.evaluate((c) => window.localStorage.setItem("live_curve", JSON.stringify(c)), liveCurve);
  await reloadMidRoast(page, { profile, profileRaw, live });
  await ensureLiveChartOpen(page);
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
}

// A source roast that IS on this device and has a full curve (the shape the app
// holds: camelCase, curve array).
const sourceWithCurve = { ...fixtureRoast, id: fixtureGhostSourceRow.id, curve: fixtureGhostSourceRow.curve };

test("ghost caption: a profile with no source roast says so", async ({ page }) => {
  await openLiveChart(page, { profile: fixtureProfile }); // hand-built: no sourceRoastId
  await expect(ghostCaption(page)).toHaveText("No ghost · no source roast");
  expect(await ghostLength(page)).toBe(0);

  // The caption must not disturb the controls under it: still Fan -> Heat -> Temp.
  const dials = page.locator("div.grid.grid-cols-3.divide-x > button");
  const dialLabels = await dials.locator("div:first-child").allInnerTexts();
  expect(dialLabels.map((l) => l.toLowerCase())).toEqual(["fan", "heat", "temp"]);
});

test("ghost caption: a source roast with no curve says so, and a source roast with a curve does not", async ({ page }) => {
  // fixtureRoast is on this device but was never probed: no curve.
  await openLiveChart(page, { profile: { ...fixtureGhostProfile, sourceRoastId: fixtureRoast.id } });
  await expect(ghostCaption(page)).toHaveText("No ghost · source roast has no curve");
  expect(await ghostLength(page)).toBe(0);

  // Same profile shape, but its source roast carries a curve: the ghost draws
  // and there is nothing to explain.
  await page.addInitScript((r) => window.localStorage.setItem("roasts", JSON.stringify(r)), [fixtureRoast, sourceWithCurve]);
  await reloadMidRoast(page, { profile: fixtureGhostProfile });
  await ensureLiveChartOpen(page);
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  await expect.poll(() => ghostLength(page), { timeout: 15_000 }).toBeGreaterThan(100);
  await expect(ghostCaption(page)).toHaveCount(0);
});

test("ghost caption: a source roast that is not on this device says so", async ({ page }) => {
  await openLiveChart(page, { profile: fixtureGhostProfile, roasts: [fixtureRoast] });
  await expect(ghostCaption(page)).toHaveText("No ghost · source roast not on this device");
  // The profile's milestones still ride along as markers; only the curve is absent.
  expect(await ghostLength(page)).toBe(0);
});

test("ghost caption: a roast following no profile gets no caption", async ({ page }) => {
  await openLiveChart(page, { profileRaw: "null" });
  await expect(page.getByText("Live curve", { exact: true })).toBeVisible();
  await expect(ghostCaption(page)).toHaveCount(0);
});

test("ghost caption: at 390px the header controls stay on one row with the caption and the Live button showing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // The longest wording, so this is the worst case for fit.
  await openLiveChart(page, { profile: fixtureGhostProfile, roasts: [fixtureRoast] });
  const caption = ghostCaption(page);
  await expect(caption).toHaveText("No ghost · source roast not on this device");

  // Scroll back so the accent "Live" button joins the controls: the widest the
  // right-hand group ever gets.
  await page.getByRole("button", { name: "Scroll back 30 seconds" }).click();
  await expect(page.getByRole("button", { name: "Live", exact: true })).toBeVisible();

  const label = await page.getByText("Live curve", { exact: true }).boundingBox();
  const threeMin = await page.getByRole("button", { name: "3 min" }).boundingBox();
  const live = await page.getByRole("button", { name: "Live", exact: true }).boundingBox();
  const cap = await caption.boundingBox();

  // One row: the label and both buttons share a vertical centre (a wrap would
  // push the buttons a whole line down).
  const mid = (b) => b.y + b.height / 2;
  expect(Math.abs(mid(label) - mid(threeMin))).toBeLessThan(3);
  expect(Math.abs(mid(label) - mid(live))).toBeLessThan(3);
  // The caption is its own row below the header, left-aligned with the label...
  expect(cap.y).toBeGreaterThanOrEqual(Math.max(label.y + label.height, threeMin.y + threeMin.height) - 1);
  expect(Math.abs(cap.x - label.x)).toBeLessThan(1.5);
  // ...and fits on one line without being clipped.
  expect(await caption.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

// What an element's text is painted in, and how legible that is where it sits. Contrast is
// the WCAG ratio against the real stack of translucent layers under the text (hero card at
// 30% over the app shell), composited the way the browser paints it -- so it needs no
// screenshot. `size` is the font size in px, for the caller to pick the bar (4.5:1 for
// small text, 3:1 for large). Also returns the theme's own tokens so a caller can assert
// "this is the muted ink" by value, whichever theme is on. Used by the ghost caption and
// the held live readout.
const paintedInk = (locator) =>
  locator.evaluate((el) => {
    const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    // Paint the ancestors' backgrounds from the page canvas (white) down to the text.
    const chain = [];
    for (let n = el; n; n = n.parentElement) chain.unshift(rgb(getComputedStyle(n).backgroundColor));
    let bg = [255, 255, 255];
    for (const [r, g, b, a = 1] of chain) bg = [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)];
    const fg = rgb(getComputedStyle(el).color).slice(0, 3);
    const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    const root = getComputedStyle(document.documentElement);
    return {
      dataTheme: document.documentElement.getAttribute("data-theme"),
      fg,
      size: parseFloat(getComputedStyle(el).fontSize),
      muted: rgb(root.getPropertyValue("--text-muted")),
      error: rgb(root.getPropertyValue("--error-text")),
      primary: rgb(root.getPropertyValue("--text-primary")),
      ratio: (hi + 0.05) / (lo + 0.05),
    };
  });

// The caption is muted text, not an error and not a raw colour: it must resolve
// to the theme's own --text-muted token (so the Settings toggle re-colours it),
// and it must stay readable on the surface it sits on in BOTH themes. Contrast is
// paintedInk's WCAG ratio.
// This is the functional stand-in for eyeballing the light theme, which visual
// regression would otherwise cover; it checks legibility, not appearance.
for (const theme of ["dark", "light"]) {
  test(`ghost caption: ${theme} theme uses the muted text token and clears WCAG AA contrast`, async ({ page }) => {
    await page.evaluate((t) => window.localStorage.setItem("roastlogs_theme", t), theme);
    await openLiveChart(page, { profile: fixtureProfile });
    await expect(ghostCaption(page)).toBeVisible();

    const m = await paintedInk(ghostCaption(page));

    expect(m.dataTheme, "the theme under test is actually applied").toBe(theme);
    expect(m.fg, "caption resolves to --text-muted").toEqual(m.muted);
    expect(m.fg, "muted, not the error colour").not.toEqual(m.error);
    expect(m.fg, "muted, not full-strength body text").not.toEqual(m.primary);
    expect(m.ratio, `contrast ${m.ratio.toFixed(2)}:1 on the card`).toBeGreaterThanOrEqual(4.5);
  });
}

// The caption describes the plan, not the moment, so it must not vanish when DROP
// is logged (that would shove the controls below it up under a thumb mid-cooldown).
test("ghost caption: still there after DROP is logged", async ({ page }) => {
  await openLiveChart(page, { profile: fixtureProfile });
  await expect(ghostCaption(page)).toHaveText("No ghost \u00b7 no source roast");

  await page.getByRole("button", { name: "RESUME", exact: true }).click();
  for (const label of ["Yellowing", "First crack", "Cooling start"]) {
    await page.getByRole("button", { name: `Mark ${label}` }).click();
  }
  // DROP is in the stored log...
  await expect
    .poll(async () => (await stored(page, "live_roastLog")) || "", { timeout: 10_000 })
    .toContain("COOLING START");
  // ...and the chart is still showing, with its caption.
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  await expect(ghostCaption(page)).toHaveText("No ghost \u00b7 no source roast");
});

test("ghost caption: stays in both window modes, the same distance above the plot", async ({ page }) => {
  await openLiveChart(page, { profile: fixtureProfile });
  // Measured against the plot, not the page: the header row is ~1.5px taller in
  // "3 min" mode (the arrow glyph buttons are taller than the text one), which
  // shifts the whole chart equally and has nothing to do with the caption.
  const gapAbovePlot = async () => {
    const cap = await ghostCaption(page).boundingBox();
    const plot = await page.locator(".recharts-surface").first().boundingBox();
    return plot.y - cap.y;
  };
  await expect(ghostCaption(page)).toBeVisible();
  const before = await gapAbovePlot();
  await page.getByRole("button", { name: "3 min" }).click();
  await expect(page.getByRole("button", { name: "Full" })).toBeVisible();
  await expect(ghostCaption(page)).toHaveText("No ghost \u00b7 no source roast");
  expect(Math.abs((await gapAbovePlot()) - before)).toBeLessThan(1);
});

// ---------------------------------------------------------------------------
// The regression Case hit, end to end: he left the app mid-roast (phone
// flashlight), iOS reloaded the PWA, and the live curve and clock came back but
// the followed profile did not -- so no ghost (RL-037). The tests above seed a
// roast already under way; this one starts it the way a roaster does -- Setup,
// choose a profile, START -- draws the ghost, reloads, and checks it is drawn
// again. The bridge is faked at the websocket by mockRoastLinkFeed, so the real
// useLiveRoast runs unmodified: nothing in the app is there for the test's sake.
// ---------------------------------------------------------------------------

test("ghost: followed from Setup, drawn live, and still drawn after a mid-roast reload", async ({ page }) => {
  await mockRoastLinkFeed(page);
  // After beforeEach's seed and before seedSetup's reload, so it wins on load.
  // The source roast is on this device and has a full curve, so a ghost is possible.
  await page.addInitScript((r) => window.localStorage.setItem("roasts", JSON.stringify(r)), [fixtureRoast, sourceWithCurve]);
  await seedSetup(page, { setup: "razzo-v5t", profiles: [fixtureGhostProfile] });

  // Setup -> preheat (the bridge is live, so the primary button says so) -> START.
  await page.getByRole("button", { name: /E2E Profile/ }).click();
  await page.getByRole("button", { name: "Begin preheat" }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "START", exact: true }).click();
  await expect(profileBadge(page)).toBeVisible();
  // Past 0:00, so this is genuinely mid-roast and not a roast that just began.
  await expect(page.getByText("00:02", { exact: true })).toBeVisible();

  // BEFORE the reload: the live chart is open and the ghost is on it.
  await ensureLiveChartOpen(page);
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  await expect(ghostCaption(page)).toHaveCount(0); // a ghost is promised and drawn
  await expect.poll(() => ghostLength(page), { timeout: 15_000 }).toBeGreaterThan(100);

  // What a backgrounded PWA leaves behind: the roast's live_* keys, profile and all.
  await expect.poll(async () => (await stored(page, "live_roastLog")) || "").toContain("start_settings");
  await expect
    .poll(async () => JSON.parse((await stored(page, "live_profileFollowing")) || "null")?.sourceRoastId)
    .toBe(fixtureGhostProfile.sourceRoastId);

  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });

  // The same roast came back: no Setup takeover, paused at its clock, plan intact.
  await expect(page.getByTestId("roast-setup")).toHaveCount(0);
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await expect(profileBadge(page)).toBeVisible();

  // AFTER the reload: the bridge is still publishing, so the feed returns by
  // itself; the chart is not persisted, so make sure it is open again.
  await ensureLiveChartOpen(page);
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  await expect(ghostCaption(page)).toHaveCount(0);
  await expect.poll(() => ghostLength(page), { timeout: 15_000 }).toBeGreaterThan(100);
});

// ---------------------------------------------------------------------------
// RL-027: the ghost must not invent a stretch the source roast never measured.
// Where the source roast lost its probe for longer than LIVE_GAP_S (6 s) the
// dashed line has to BREAK, not join across the hole. The model already emits
// null inside such a hole, so a model-only test passes whether or not the line
// bridges it (that guard is in LiveRoastChart.plan.test.js); whether the hole
// is drawn is only decided in the rendered path. A line that bridges nulls is
// ONE subpath ("M ... C ..."); a broken one starts a fresh "M" for each
// measured stretch. So these read the path's `d`.
// ---------------------------------------------------------------------------

const ghostSubpaths = async (page) => ((await ghostPathD(page)).match(/M/g) || []).length;

// The Razzo, mid-roast, following a profile saved from a source roast whose
// probe never recorded seconds `from`..`to` (inclusive). The hole is at 3:20, past
// the 3-minute window the chart opens in, so switch to the whole-roast view: the
// gap is then on screen, not just in the data.
async function openGhostWithHole(page, from, to) {
  const source = { ...sourceWithCurve, curve: fixtureGhostSourceRow.curve.filter((p) => p.t < from || p.t > to) };
  await openLiveChart(page, { profile: fixtureGhostProfile, roasts: [fixtureRoast, source] });
  await page.getByRole("button", { name: "3 min" }).click();
  await expect(page.getByRole("button", { name: "Full" })).toBeVisible();
  await expect.poll(() => ghostLength(page), { timeout: 15_000 }).toBeGreaterThan(100);
}

test("ghost breaks across a probe gap: a 20 s hole in the source roast stays a gap in the dashed line", async ({ page }) => {
  await openGhostWithHole(page, 200, 219);
  // Two measured stretches (0:00-3:19 and 3:40 on) = two subpaths. One means the
  // line was drawn straight across seconds the probe never read.
  expect(await ghostSubpaths(page)).toBeGreaterThanOrEqual(2);
});

test("ghost breaks across a probe gap: a 5 s hole is still bridged, so the line stays whole", async ({ page }) => {
  await openGhostWithHole(page, 200, 204);
  // Within LIVE_GAP_S the model fills the hole with a short straight run: one stretch.
  expect(await ghostSubpaths(page)).toBe(1);
});

// ---------------------------------------------------------------------------
// RL-056 / RL-057: the RoR ghost. The source roast's rate of rise is drawn on the live
// chart as the BT ghost's twin: same "4 3" dash and 0.5 opacity, the RoR colour, 1.2 wide,
// on the RoR axis. It exists exactly when the BT ghost does -- never without it, never
// after DROP -- and adds no caption, legend or toggle. The series itself (same recipe as
// the live RoR, null around a probe gap) is unit-tested in LiveRoastChart.plan.test.js;
// these read what reaches the SVG.
//
// GHOST_PATH above is scoped by the Temp colour, so the second dashed "4 3" line this adds
// cannot be mistaken for the BT ghost by any of the specs that measure it.
// ---------------------------------------------------------------------------

const ROR_PLAN_PATH = 'path.recharts-line-curve[stroke="rgb(var(--chart-ror))"][stroke-dasharray="4 3"]';
const rorPlanD = (page) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? el.getAttribute("d") || "" : "";
  }, ROR_PLAN_PATH);
const rorPlanLength = async (page) => (await rorPlanD(page)).length;
const rorPlanSubpaths = async (page) => ((await rorPlanD(page)).match(/M/g) || []).length;

// Every line drawn on the live chart (its first recharts surface; the second is the Fan/Heat
// control map), in DOM order -- which is paint order, last on top. Named by what it is: the
// RoR or the Temp colour, and "(plan)" for the dashed ones. A line with no points renders an
// empty path (the BT ghost does, for a plan that only has milestones), and that is not drawn.
const liveChartLines = (page) =>
  page.evaluate(() => {
    const surface = document.querySelector(".recharts-surface");
    if (!surface) return [];
    return [...surface.querySelectorAll("path.recharts-line-curve")].filter((p) => (p.getAttribute("d") || "").length > 0).map((p) => {
      const name = p.getAttribute("stroke").includes("--chart-ror") ? "RoR" : "Temp";
      return p.getAttribute("stroke-dasharray") ? `${name} (plan)` : name;
    });
  });

// The numbers printed on the live chart's right-hand (RoR) axis. Recharts renders each tick
// label as a <text>; the RoR axis is the one on the right, so it is picked by position.
const rorAxisTicks = (page) =>
  page.evaluate(() => {
    const surface = document.querySelector(".recharts-surface");
    const half = surface.getBoundingClientRect().width / 2;
    return [...surface.querySelectorAll("text.recharts-cartesian-axis-tick-value")]
      .filter((t) => Number(t.getAttribute("x")) > half)
      .map((t) => Number(t.textContent));
  });

// A synthetic source (or live) roast with a hard charge dip, so the RoR axis has something
// to be squeezed by. The pace is a piecewise-linear RoR in F/min -- -100 F/min for the first
// 15 s (the charge dip), the turnaround, a recovery peaking at 45 F/min, then the long
// decline through the caramelization stretch (about 25 F/min at 5:00-6:00) -- integrated
// into a 1 Hz bean-temp curve rounded to 0.1 F, the way the app stores one. Charged at 230 F.
const DIP_PACE = [[0, -100], [15, -100], [30, -30], [60, 40], [120, 45], [240, 32], [360, 22], [480, 15], [600, 10]];
function dipCurve(length) {
  const paceAt = (t) => {
    for (let i = 1; i < DIP_PACE.length; i++) {
      const [t1, p1] = DIP_PACE[i];
      if (t <= t1) {
        const [t0, p0] = DIP_PACE[i - 1];
        return p0 + ((p1 - p0) * (t - t0)) / (t1 - t0);
      }
    }
    return DIP_PACE[DIP_PACE.length - 1][1];
  };
  const curve = [];
  let bt = 230;
  for (let t = 0; t < length; t++) {
    curve.push({ t, bt: Math.round(bt * 10) / 10 });
    bt += paceAt(t) / 60;
  }
  return curve;
}
const sourceWithDip = { ...sourceWithCurve, curve: dipCurve(661) };

// A roast `seconds` in whose own charge dipped: the curve it has recorded so far (what a
// reload mid-roast reads back), the clock to match, and a bridge that keeps publishing the
// newest reading so the feed stays "live" and the chart stays mounted.
function dippedLiveRoast(seconds) {
  const liveCurve = dipCurve(seconds + 1);
  return {
    liveCurve,
    live: { ...fixtureLiveRoast, elapsedSeconds: seconds },
    bt: () => liveCurve[liveCurve.length - 1].bt,
  };
}

const GHOST_STATES = [
  { name: "a source roast with a curve", profile: fixtureGhostProfile, roasts: [fixtureRoast, sourceWithCurve], caption: null },
  { name: "a profile with no source roast", profile: fixtureProfile, roasts: [fixtureRoast], caption: "No ghost · no source roast" },
  { name: "a source roast that is not on this device", profile: fixtureGhostProfile, roasts: [fixtureRoast], caption: "No ghost · source roast not on this device" },
  { name: "a source roast with no curve", profile: { ...fixtureGhostProfile, sourceRoastId: fixtureRoast.id }, roasts: [fixtureRoast], caption: "No ghost · source roast has no curve" },
];

for (const state of GHOST_STATES) {
  test(`ghost: RoR plan line is drawn exactly when the BT ghost is (${state.name})`, async ({ page }) => {
    // A live curve with a pace of its own, so the live RoR and Temp lines are really drawn
    // and the lines asserted below are the whole stack, not whatever happened to render.
    await openLiveChart(page, { profile: state.profile, roasts: state.roasts, ...dippedLiveRoast(130) });
    const drawn = state.caption === null;

    // The caption is the proof the plan has settled into this state: an absence asserted
    // before the chart has caught up with it would pass for the wrong reason.
    if (drawn) {
      await expect(ghostCaption(page)).toHaveCount(0);
      await expect.poll(() => ghostLength(page), { timeout: 15_000 }).toBeGreaterThan(100);
    } else {
      await expect(ghostCaption(page)).toHaveText(state.caption);
    }

    if (drawn) {
      // The RoR twin: a real path (not just an element) in the RoR colour, with the
      // BT ghost's dash and opacity and a hair thinner than the 1.4 BT ghost.
      await expect.poll(() => rorPlanLength(page), { timeout: 15_000 }).toBeGreaterThan(100);
      const style = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return { width: el.getAttribute("stroke-width"), opacity: el.getAttribute("stroke-opacity") };
      }, ROR_PLAN_PATH);
      expect(style).toEqual({ width: "1.2", opacity: "0.5" });
      // The ghost stack mirrors the live stack, every ghost under every live line.
      expect(await liveChartLines(page)).toEqual(["RoR (plan)", "Temp (plan)", "RoR", "Temp"]);
      // One dash means "the source roast", and no new legend or caption explains it.
      await expect(page.locator(".recharts-legend-wrapper")).toHaveCount(0);

      // The controls under the chart still read Fan -> Heat -> Temp.
      const dials = page.locator("div.grid.grid-cols-3.divide-x > button");
      const dialLabels = await dials.locator("div:first-child").allInnerTexts();
      expect(dialLabels.map((l) => l.toLowerCase())).toEqual(["fan", "heat", "temp"]);
    } else {
      expect(await ghostLength(page)).toBe(0);
      expect(await rorPlanLength(page)).toBe(0);
      expect(await liveChartLines(page)).toEqual(["RoR", "Temp"]);
    }
    // Present exactly when the BT ghost is.
    expect((await rorPlanLength(page)) > 0).toBe((await ghostLength(page)) > 0);
  });
}

test("ghost: RoR plan line is drawn exactly when the BT ghost is (gone with it at DROP)", async ({ page }) => {
  await openLiveChart(page, { profile: fixtureGhostProfile, roasts: [fixtureRoast, sourceWithCurve], ...dippedLiveRoast(130) });
  await expect.poll(() => ghostLength(page), { timeout: 15_000 }).toBeGreaterThan(100);
  await expect.poll(() => rorPlanLength(page), { timeout: 15_000 }).toBeGreaterThan(100);

  await page.getByRole("button", { name: "RESUME", exact: true }).click();
  for (const label of ["Yellowing", "First crack", "Cooling start"]) {
    await page.getByRole("button", { name: `Mark ${label}` }).click();
  }
  await expect
    .poll(async () => (await stored(page, "live_roastLog")) || "", { timeout: 10_000 })
    .toContain("COOLING START");
  // The chart is still on screen, and neither dashed line is: after DROP there is nothing
  // left to steer by.
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  await expect.poll(() => ghostLength(page), { timeout: 10_000 }).toBe(0);
  await expect.poll(() => rorPlanLength(page), { timeout: 10_000 }).toBe(0);
  expect(await liveChartLines(page)).toEqual(["RoR", "Temp"]);
});

// RL-027's rule, for the RoR twin: no connectNulls. A source-roast hole longer than
// LIVE_GAP_S leaves a RoR gap about +/-15 s wide (the slope needs an unbroken window), which is
// honest; a short hole is bridged before the slope is taken, so the line stays whole.
test("ghost breaks across a probe gap: the RoR plan line breaks too, in two pieces", async ({ page }) => {
  await openGhostWithHole(page, 200, 219);
  await expect.poll(() => rorPlanLength(page), { timeout: 15_000 }).toBeGreaterThan(100);
  expect(await rorPlanSubpaths(page)).toBe(2);
});

test("ghost breaks across a probe gap: a 5 s hole is bridged for the RoR plan line as well", async ({ page }) => {
  await openGhostWithHole(page, 200, 204);
  await expect.poll(() => rorPlanLength(page), { timeout: 15_000 }).toBeGreaterThan(100);
  expect(await rorPlanSubpaths(page)).toBe(1);
});

// The tooltip reads each live value with its plan underneath: Temp, Temp (plan), RoR, RoR (plan).
// Recharts' default sorts by name, which would read RoR first. Hover needs a pointer, so
// desktop only. The live curve is seeded so there is a live Temp and RoR at the hovered second.
test("ghost: hovering a second reads Temp, Temp (plan), RoR, RoR (plan)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "hover needs a mouse pointer; the iphone project is touch only");
  await openLiveChart(page, { profile: fixtureGhostProfile, roasts: [fixtureRoast, sourceWithDip], ...dippedLiveRoast(300) });
  await expect.poll(() => ghostLength(page), { timeout: 15_000 }).toBeGreaterThan(100);

  // The window is the last three minutes (2:30-5:30 at 5:00), so the middle of the plot is
  // 4:00: inside the recorded curve and inside the plan. 42 and 44 are the axis insets.
  const box = await page.locator(".recharts-surface").first().boundingBox();
  await page.mouse.move(box.x + 42 + (box.width - 42 - 44) / 2, box.y + 50);
  const names = page.locator(".recharts-tooltip-item-name");
  await expect(names.first()).toBeVisible();
  expect(await names.allInnerTexts()).toEqual(["Temp", "Temp (plan)", "RoR", "RoR (plan)"]);
});

// The plan's pace joins the RoR axis from second 0, so the axis it opens with is the one it
// keeps, and the source roast's charge dip (-100 F/min over the first 15 s) must not blow the
// ceiling or the floor out and squeeze the stretch that matters (caramelization, about
// 25 F/min). Read as the numbers printed on the axis, at the phone's width. The synthetic
// roast peaks at 45 F/min, so the axis tops out at 60 (the model rounds 1.2x the peak up to
// a whole 10); the floor is whatever the dip draws and is bounded by the dip itself.
//
// Measured on the code before the ghost RoR: a dipping LIVE curve alone already prints a
// negative floor (the axis domain is [0, fn] with no allowDataOverflow, so Recharts widens it
// to the most negative RoR: about -99 here). This pins "no worse than the dip", not "pinned at 0".
const ROR_AXIS_CEILING = 60;
const ROR_AXIS_FLOOR = -100;

test("ghost: the RoR axis opens at the plan's pace, on a calm live feed (390px)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // The default feed: 250..254 F, so the LIVE line has no pace of its own to set the axis.
  await openLiveChart(page, { profile: fixtureGhostProfile, roasts: [fixtureRoast, sourceWithDip] });
  await expect.poll(() => ghostLength(page), { timeout: 15_000 }).toBeGreaterThan(100);
  const ticks = await rorAxisTicks(page);
  expect(ticks.length, `RoR axis ticks: ${ticks}`).toBeGreaterThan(1);
  // Without the plan's pace the axis would stop at 10: the plan reaches 45 F/min.
  expect(Math.max(...ticks), `RoR axis ticks: ${ticks}`).toBeGreaterThanOrEqual(50);
  expect(Math.max(...ticks), `RoR axis ticks: ${ticks}`).toBeLessThanOrEqual(ROR_AXIS_CEILING);
  expect(Math.min(...ticks), `RoR axis ticks: ${ticks}`).toBeGreaterThanOrEqual(ROR_AXIS_FLOOR);
});

test("ghost: a dipping live feed under a dipping plan keeps the RoR axis within its floor and ceiling (390px)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Five minutes into a roast whose own charge dipped, the bridge still publishing.
  await openLiveChart(page, { profile: fixtureGhostProfile, roasts: [fixtureRoast, sourceWithDip], ...dippedLiveRoast(300) });
  // Measured with the plan's pace on screen, not before it has drawn.
  await expect.poll(() => ghostLength(page), { timeout: 15_000 }).toBeGreaterThan(100);
  await expect.poll(() => rorPlanLength(page), { timeout: 15_000 }).toBeGreaterThan(100);
  const ticks = await rorAxisTicks(page);
  expect(ticks.length, `RoR axis ticks: ${ticks}`).toBeGreaterThan(1);
  expect(Math.max(...ticks), `RoR axis ticks: ${ticks}`).toBeGreaterThanOrEqual(50);
  expect(Math.max(...ticks), `RoR axis ticks: ${ticks}`).toBeLessThanOrEqual(ROR_AXIS_CEILING);
  expect(Math.min(...ticks), `RoR axis ticks: ${ticks}`).toBeGreaterThanOrEqual(ROR_AXIS_FLOOR);
});

// ---------------------------------------------------------------------------
// RL-030: no time value read from storage may size the live chart's rows. The
// model builds one row per second up to the largest `t` it is handed, so a
// damaged or hand-edited value of 2e9 froze the Roast tab and one past 2^32
// threw a RangeError out of render -- and with no error boundary above the tab
// that blanks the whole app on every relaunch. Each test puts the huge value
// where the chart would read it from (a cached source roast, the stored clock)
// and asserts the chart is on screen within the default 5 s and the app still
// answers a tap. A huge LIVE-curve point has no test here: seeded in storage it
// did not reproduce (the app appends the bridge's next sample after it, and the
// model reads the last point), so the unit tests carry it. The bound itself
// (src/lib/limits.js) and the row arithmetic are unit-tested in
// LiveRoastChart.plan.test.js, with 1e6 -- the 1e9 used here would hang that
// suite rather than fail it.
// ---------------------------------------------------------------------------

// A frozen or crashed page never leaves the Roast tab: History is a nav tap away.
async function expectAppResponds(page) {
  await page.getByRole("button", { name: "History", exact: true }).click({ timeout: 5_000 });
  await expect(page.getByText("E2E Ethiopia Test").first()).toBeVisible();
}

test("huge time value: a source roast curve point at t=2000000000 does not freeze the live chart", async ({ page }) => {
  test.setTimeout(30_000);
  const source = { ...sourceWithCurve, curve: [...fixtureGhostSourceRow.curve, { t: 2000000000, bt: 400 }] };
  await openLiveChart(page, { profile: fixtureGhostProfile, roasts: [fixtureRoast, source] });
  // The point is ignored, not allowed to take the real 0-660 s ghost down with it.
  await expect.poll(() => ghostLength(page), { timeout: 5_000 }).toBeGreaterThan(100);
  await expectAppResponds(page);
});

test("huge time value: a source roast curve point past 2^32 does not blank the app", async ({ page }) => {
  test.setTimeout(30_000);
  // Array.from({ length: t + 1 }) throws RangeError from t = 2^32 up.
  const source = { ...sourceWithCurve, curve: [...fixtureGhostSourceRow.curve, { t: 2 ** 32 + 5, bt: 400 }] };
  await openLiveChart(page, { profile: fixtureGhostProfile, roasts: [fixtureRoast, source] });
  await expect.poll(() => ghostLength(page), { timeout: 5_000 }).toBeGreaterThan(100);
  await expectAppResponds(page);
});

test("huge time value: a milestone at t=2000000000 in the source roast's log does not freeze the live chart", async ({ page }) => {
  test.setTimeout(30_000);
  // No `milestones` on the profile, so they are read from the source roast's own
  // roastLog -- the path no profile validation covers. CARAMELIZATION is a label
  // the fixture log does not already carry, so this entry is the one that counts.
  const profile = { ...fixtureProfile, sourceRoastId: fixtureGhostSourceRow.id };
  const source = { ...sourceWithCurve, roastLog: [...fixtureRoast.roastLog, { type: "phase", t: 2000000000, label: "CARAMELIZATION", temp: "" }] };
  await openLiveChart(page, { profile, roasts: [fixtureRoast, source] });
  await expect.poll(() => ghostLength(page), { timeout: 5_000 }).toBeGreaterThan(100);
  await expectAppResponds(page);
});

test("huge time value: a stored clock of 1e9 seconds still opens the live chart", async ({ page }) => {
  test.setTimeout(30_000);
  await openLiveChart(page, { live: { ...fixtureLiveRoast, elapsedSeconds: 1e9 } });
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  await expectAppResponds(page);
});

// ---------------------------------------------------------------------------
// RL-045: the History chart loops once per second of roast.totalSeconds, and
// took it as Number(x) || 0 with no upper bound. A damaged or hand-edited value
// -- "1e999" parses to Infinity, 1e9 is merely absurd -- never finished the
// loop, so the roast's detail view hung the page every time it was opened and
// only clearing site data got the app back. The detail must open, the tab bar
// must answer, and a normal roast must still chart.
// ---------------------------------------------------------------------------

for (const [label, totalSeconds] of [["\"1e999\" (parses to Infinity)", "1e999"], ["1e9", 1e9]]) {
  test(`history: huge totalSeconds ${label} does not hang the roast detail`, async ({ page }) => {
    test.setTimeout(30_000);
    const huge = { ...fixtureRoast, id: 1750000000500, beanName: "E2E Huge Total", totalSeconds };
    await page.addInitScript((r) => window.localStorage.setItem("roasts", JSON.stringify(r)), [huge, fixtureRoast]);
    await page.reload();
    await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "History" }).click();
    // The detail renders inside this tap's own event, so a page that hangs on it
    // never finishes the click -- hence the short timeout, not a long wait.
    await page.getByText("E2E Huge Total").first().click({ timeout: 10_000 });
    // The detail header is up within the default 5 s.
    await expect(page.getByRole("button", { name: "EDIT ROAST" })).toBeVisible();
    await expect(page.getByText("E2E Huge Total").first()).toBeVisible();

    // The tab bar still answers: away to Roast and back, the detail is still there.
    await page.getByRole("button", { name: "Roast", exact: true }).click({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "BACK TO HISTORY" })).toHaveCount(0);
    await page.getByRole("button", { name: "History", exact: true }).click({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "BACK TO HISTORY" })).toBeVisible();

    // Control: a normal roast still gets its chart (both ComposedCharts render).
    await page.getByRole("button", { name: "BACK TO HISTORY" }).click();
    await page.getByText("E2E Ethiopia Test").first().click();
    await expect(page.locator(".recharts-surface").nth(1)).toBeVisible();
  });
}

// ---------------------------------------------------------------------------
// Save a roast as a profile (v3.9.0). The prompt comes AFTER the roast is
// written, so every test also asserts the roast is already in storage.
// ---------------------------------------------------------------------------

// The roasted-weight prompt (RL-025) that every SAVE ROAST now opens over the screen.
// It stays up until it is answered -- the 2 s tab flip does not close it -- so a test
// that goes on to touch the page behind it has to answer it first.
const dropWeightPrompt = (page) => page.getByTestId("drop-weight");
const skipDropWeight = (page) => dropWeightPrompt(page).getByRole("button", { name: "SKIP" }).click({ timeout: 10_000 });

// `save: false` stops at COOLING START with SAVE ROAST showing, for the tests that
// need to decide how (and how many times) it is tapped. `clockPast` lets the roast
// clock get past 0:0N before the marks, so they carry real times: a mark at 0:00 is
// stored as 0, which a reload reads back as "never marked" (no SAVE ROAST).
// `dropWeight: "skip"` (the default) answers the roasted-weight prompt with SKIP, so
// the callers that care about what comes AFTER a save -- the profile sheet, the next
// roast -- see the screen they always did. `"leave"` hands the open prompt back to
// the test, for the ones that are about the prompt itself. No-op when `save: false`.
// `viaPreheat: true` is the probe path (a Razzo with the bridge live): Setup's button
// reads "Begin preheat" there and START sits on the preheat screen, which has no
// starting dials to fill -- so `fan` and `heat` are not used.
// `beforeMarks(page)` runs once the clock has passed `clockPast` and before the first
// mark, for a test that has to look at the roast WHILE it runs (RL-054 reads the live
// chart there). Omitted, nothing changes for any other caller.
async function runQuickRoast(page, { fan = "5", heat = "6", save = true, clockPast = 0, dropWeight = "skip", viaPreheat = false, beforeMarks = null } = {}) {
  if (viaPreheat) {
    await page.getByRole("button", { name: "Begin preheat" }).click({ timeout: 15_000 });
    await page.getByRole("button", { name: "START", exact: true }).click();
  } else {
    const dials = page.locator("div.grid.grid-cols-3 input");
    await dials.nth(0).fill(fan);
    await dials.nth(1).fill(heat);
    await page.getByRole("button", { name: "Start roast" }).click();
  }
  if (clockPast > 0) {
    await expect(page.getByText(`00:${String(clockPast).padStart(2, "0")}`, { exact: true }))
      .toBeVisible({ timeout: clockPast * 1000 + 5_000 });
  }
  if (beforeMarks) await beforeMarks(page);
  for (const label of ["Yellowing", "First crack", "Cooling start"]) {
    await page.getByRole("button", { name: `Mark ${label}` }).click();
  }
  if (save) await page.getByRole("button", { name: "SAVE ROAST" }).click();
  if (save && dropWeight === "skip") await skipDropWeight(page);
}

test("save as profile: a manual roast offers a new profile with its steps, milestones and source roast", async ({ page }) => {
  await seedSetup(page);
  await page.getByRole("button", { name: /Manual roast/ }).click();
  await runQuickRoast(page);

  const sheet = page.getByTestId("profile-from-roast");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Keep this as a profile?")).toBeVisible();
  // The roast is already saved -- the sheet only ever adds.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("roasts")).length)).toBe(2);

  await sheet.getByLabel("Profile name").fill("Saved From Roast");
  await sheet.getByRole("button", { name: "Save profile" }).click();
  await expect(sheet).toHaveCount(0);

  const { profile, roastId } = await page.evaluate(() => ({
    profile: JSON.parse(localStorage.getItem("global_profiles")).find((p) => p.name === "Saved From Roast"),
    roastId: JSON.parse(localStorage.getItem("roasts"))[0].id,
  }));
  expect(profile.sourceRoastId).toBe(roastId);
  expect(profile.steps).toEqual([{ time: "00:00", totalSeconds: 0, heat: "6", fan: "5" }]);
  expect(profile.milestones.map((m) => m.label)).toEqual(["YELLOWING", "FIRST CRACK", "COOLING START"]);
});

test("save as profile: 'No thanks' leaves the roast saved and creates nothing", async ({ page }) => {
  await seedSetup(page);
  await page.getByRole("button", { name: /Manual roast/ }).click();
  await runQuickRoast(page);
  await page.getByTestId("profile-from-roast").getByRole("button", { name: "No thanks" }).click();
  await expect(page.getByTestId("profile-from-roast")).toHaveCount(0);
  const counts = await page.evaluate(() => ({
    roasts: JSON.parse(localStorage.getItem("roasts")).length,
    profiles: JSON.parse(localStorage.getItem("global_profiles")).length,
  }));
  expect(counts).toEqual({ roasts: 2, profiles: 1 }); // fixture roast + new one; the one seeded profile
});

test("save as profile: following a profile without changing it does not nag", async ({ page }) => {
  const single = { ...fixtureProfile, steps: [{ time: "00:00", totalSeconds: 0, fan: "5", heat: "6" }] };
  await seedSetup(page, { profiles: [single] });
  await page.getByRole("button", { name: /E2E Profile/ }).click();
  await runQuickRoast(page, { fan: "5", heat: "6" });
  // Give the sheet a moment to (wrongly) appear before asserting it never does.
  await page.waitForTimeout(800);
  await expect(page.getByTestId("profile-from-roast")).toHaveCount(0);
});

test("save as profile: following a profile that repeats a step does not nag (RL-028)", async ({ page }) => {
  // A hand-built profile can say "Fan 5, Heat 6" at 0:00 and again at 1:00. The
  // roast's log merges the repeat (nothing changed), so comparing the raw
  // profile steps called an exact follow a deviation and offered to overwrite it.
  const repeated = {
    ...fixtureProfile,
    steps: [
      { time: "00:00", totalSeconds: 0, fan: "5", heat: "6" },
      { time: "01:00", totalSeconds: 60, fan: "5", heat: "6" },
    ],
  };
  await seedSetup(page, { profiles: [repeated] });
  await page.getByRole("button", { name: /E2E Profile/ }).click();
  await runQuickRoast(page, { fan: "5", heat: "6" });
  // The roast is saved before the prompt is decided, so wait on that rather than
  // on the clock, then give the sheet a moment to (wrongly) appear.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("roasts")).length)).toBe(2);
  await page.waitForTimeout(800);
  await expect(page.getByTestId("profile-from-roast")).toHaveCount(0);
});

test("save as profile: a roast that departed from its profile offers Update / Save as new, and Update rewrites the plan", async ({ page }) => {
  await seedSetup(page); // two-step profile; the quick roast only logs one step
  await page.getByRole("button", { name: /E2E Profile/ }).click();
  await runQuickRoast(page, { fan: "3", heat: "8" });

  const sheet = page.getByTestId("profile-from-roast");
  await expect(sheet.getByRole("button", { name: "Update E2E Profile" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Save as new profile" })).toBeVisible();
  await sheet.getByRole("button", { name: "Update E2E Profile" }).click();

  const { profiles, roastId } = await page.evaluate(() => ({
    profiles: JSON.parse(localStorage.getItem("global_profiles")),
    roastId: JSON.parse(localStorage.getItem("roasts"))[0].id,
  }));
  expect(profiles).toHaveLength(1); // updated in place, not duplicated
  expect(profiles[0].name).toBe("E2E Profile");
  expect(profiles[0].steps).toEqual([{ time: "00:00", totalSeconds: 0, heat: "8", fan: "3" }]);
  expect(profiles[0].sourceRoastId).toBe(roastId);
});

test("history: editing a roast a profile was saved from offers to update the profile, and never does it silently", async ({ page }) => {
  const linked = { ...fixtureProfile, id: 1750000000300, name: "From Fixture", steps: [], milestones: [], sourceRoastId: fixtureRoast.id };
  await seedSetup(page, { profiles: [linked] });
  await page.getByRole("button", { name: "History" }).click();
  await page.getByText("E2E Ethiopia Test").first().click();
  await page.getByRole("button", { name: "EDIT ROAST" }).click();
  // Change the start fan 9 -> 8: an edit to the PLAN, which is what earns the prompt.
  await page.locator('input.w-6[value="9"]').first().fill("8");
  await page.getByRole("button", { name: "SAVE CHANGES" }).click();

  const sheet = page.getByTestId("profile-from-roast");
  await expect(sheet.getByText("Update the profile too?")).toBeVisible();
  // Nothing has changed yet: the profile is only touched on a yes.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("global_profiles"))[0].steps)).toEqual([]);

  await sheet.getByRole("button", { name: "Update profile" }).click();
  const updated = await page.evaluate(() => JSON.parse(localStorage.getItem("global_profiles"))[0]);
  expect(updated.steps.length).toBeGreaterThan(0);
  expect(updated.steps[0]).toMatchObject({ totalSeconds: 0, fan: "8", heat: "7" }); // the edited start settings
  expect(updated.milestones.map((m) => m.label)).toContain("FIRST CRACK");
});

test("history: 'Not now' leaves the linked profile exactly as it was", async ({ page }) => {
  const linked = { ...fixtureProfile, id: 1750000000300, name: "From Fixture", steps: [], milestones: [], sourceRoastId: fixtureRoast.id };
  await seedSetup(page, { profiles: [linked] });
  await page.getByRole("button", { name: "History" }).click();
  await page.getByText("E2E Ethiopia Test").first().click();
  await page.getByRole("button", { name: "EDIT ROAST" }).click();
  await page.locator('input.w-6[value="9"]').first().fill("8");
  await page.getByRole("button", { name: "SAVE CHANGES" }).click();
  await page.getByTestId("profile-from-roast").getByRole("button", { name: "Not now" }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("global_profiles"))[0].steps)).toEqual([]);
});

test("history: a weight-only edit never offers to overwrite a profile, even one that differs from the roast", async ({ page }) => {
  // The profile was hand-tuned since (its steps differ from the roast's log). An
  // edit that doesn't touch the roast's plan must leave it completely alone.
  const linked = { ...fixtureProfile, id: 1750000000300, name: "Hand Tuned", steps: [], milestones: [], sourceRoastId: fixtureRoast.id };
  await seedSetup(page, { profiles: [linked] });
  await page.getByRole("button", { name: "History" }).click();
  await page.getByText("E2E Ethiopia Test").first().click();
  await page.getByRole("button", { name: "EDIT ROAST" }).click();
  await page.getByPlaceholder("0").first().fill("191");
  await page.getByRole("button", { name: "SAVE CHANGES" }).click();
  await page.waitForTimeout(600);
  await expect(page.getByTestId("profile-from-roast")).toHaveCount(0);
});

test("history: renaming a roast's bean relinks its stock to the bag the name says", async ({ page }) => {
  const linkedRoast = { ...fixtureRoast, id: 1750000000400, beanId: fixtureBean.id, beanName: fixtureBean.name };
  await page.addInitScript((r) => window.localStorage.setItem("roasts", JSON.stringify([r])), linkedRoast);
  await seedSetup(page, { profiles: [] });
  await page.getByRole("button", { name: "History" }).click();
  await page.getByText(fixtureBean.name).first().click();
  await page.getByRole("button", { name: "EDIT ROAST" }).click();

  const nameInput = page.locator(`input[value="${fixtureBean.name}"]`).first();
  await nameInput.fill("Some Other Bean");
  await page.getByRole("button", { name: "SAVE CHANGES" }).click();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("roasts"))[0].beanId))).toBeNull();

  await page.locator('input[value="Some Other Bean"]').first().fill(fixtureBean.name);
  await page.getByRole("button", { name: "SAVE CHANGES" }).click();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("roasts"))[0].beanId))).toBe(fixtureBean.id);
});

// ---------------------------------------------------------------------------
// SAVE ROAST saves exactly once (RL-043). handleStop gives every call a fresh id
// and clears the live session only 2 s later, so a double-tap -- or a reload
// inside that window, which brings the already-saved roast back as a paused roast
// with SAVE ROAST showing -- put the same roast in History twice (and charged the
// bag's stock twice).
//
// The cure is an idempotency marker: a note, kept with the live session, that says
// "this session's roast is already saved". A marker that is read carelessly is a
// worse bug than the one it cures -- it would silently DROP the next real roast, or
// wipe one that is under way. So the tests here come in two kinds:
//  - the double-tap and the reload: these fail until a marker exists;
//  - the stale-marker ones (next roast, a roast deleted from History, an earlier
//    roast's leftover): guards that a blind "marker set, so skip" would break.
// The marker is found as the live_* key(s) SAVE ROAST adds, not by name, so these
// test the behaviour and survive a rename. Each stale-marker test asserts that a
// marker was written first: without one it would pass having covered nothing.
// ---------------------------------------------------------------------------

// Follows a one-step profile the quick roast then matches exactly, so the
// save-as-profile sheet never opens over SAVE ROAST between two taps (see the
// "does not nag" test above).
const singleStepProfile = { ...fixtureProfile, steps: [{ time: "00:00", totalSeconds: 0, fan: "5", heat: "6" }] };

const saveRoastButton = (page) => page.getByRole("button", { name: "SAVE ROAST" });
const storedRoasts = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("roasts") || "[]"));
const roastCount = async (page) => (await storedRoasts(page)).length;
const liveKeys = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage).filter((k) => k.startsWith("live_")).map((k) => [k, localStorage.getItem(k)])
    )
  );

async function roastToCooling(page) {
  await seedSetup(page, { profiles: [singleStepProfile] });
  await page.getByRole("button", { name: /E2E Profile/ }).click();
  await runQuickRoast(page, { fan: "5", heat: "6", save: false, clockPast: 2 });
  await expect(saveRoastButton(page)).toBeVisible();
}

// A reload inside handleStop's 2 s window, without racing a clock: hold the 2 s
// clear open in THIS document only. The patch dies with the page on reload, so
// the next document runs the real 2 s.
const holdSaveWindowOpen = (page) =>
  page.evaluate(() => {
    const realSetTimeout = window.setTimeout;
    window.__heldClear = false;
    window.setTimeout = (fn, ms, ...args) => {
      if (ms === 2000) window.__heldClear = true;
      return realSetTimeout(fn, ms === 2000 ? 600000 : ms, ...args);
    };
  });

// Proof, right before a reload, that the 2 s window really is still open: the
// patched timer caught handleStop's 2000 ms clear, and the finished roast's live
// session is still on the device. Without this a later change to that delay would
// let the clear run first and the reload tests would pass for the wrong reason.
async function expectSaveWindowStillOpen(page) {
  expect(await page.evaluate(() => window.__heldClear), "handleStop's 2 s clear must have been held").toBe(true);
  expect(JSON.parse(await stored(page, "live_roastLog")).length, "the live session must still be on the device").toBeGreaterThan(0);
}

// beforeEach's init script re-seeds `roasts` with the one fixture roast on EVERY
// load, so a reload would wipe the roast just saved -- which a real device keeps.
// Stack a seed of what is stored now (stacked scripts run in order, last wins).
async function keepRoastsAcrossReload(page) {
  const raw = await page.evaluate(() => localStorage.getItem("roasts"));
  await page.addInitScript((r) => window.localStorage.setItem("roasts", r), raw);
}

// Tap SAVE ROAST with the 2 s clear held open; return the live_* keys that tap
// added -- the marker, whatever it is called and however it is shaped.
async function saveAndFindMarker(page) {
  const before = await liveKeys(page);
  await holdSaveWindowOpen(page);
  await saveRoastButton(page).click();
  await expect(page.getByText("Roast saved to history!")).toBeVisible();
  const added = Object.entries(await liveKeys(page)).filter(([k]) => !(k in before));
  expect(
    added.map(([k]) => k),
    "SAVE ROAST must leave a live_* marker saying this session's roast is already saved"
  ).not.toHaveLength(0);
  test.info().annotations.push({ type: "marker", description: added.map(([k]) => k).join(", ") });
  return Object.fromEntries(added);
}

// Take the roast just saved back out of storage, as History's trash button does.
const deleteSavedRoast = (page, id) =>
  page.evaluate((id) => {
    const rest = JSON.parse(localStorage.getItem("roasts")).filter((r) => r.id !== id);
    localStorage.setItem("roasts", JSON.stringify(rest));
  }, id);

test("save roast: a double-tap SAVE ROAST saves the roast once (RL-043)", async ({ page }) => {
  await roastToCooling(page);
  expect(await roastCount(page)).toBe(1); // the fixture roast only

  // Two taps on the button, one task apart, so the first has been rendered before
  // the second lands. Not Playwright's dblclick: the first save inserts the "Roast
  // saved" banner ABOVE the buttons and shifts them down ~32px, so a second click
  // at the same spot misses the button and the old code would pass.
  await saveRoastButton(page).evaluate(async (button) => {
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    button.click();
  });
  await expect(page.getByText("Roast saved to history!")).toBeVisible();

  // Both taps have landed by now, so a second save would already be in storage --
  // no clock to wait on.
  const ids = (await storedRoasts(page)).map((r) => r.id);
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(2);
});

test("save roast: a reload right after save does not bring the roast back or let it be saved twice (RL-043)", async ({ page }) => {
  await roastToCooling(page);
  await holdSaveWindowOpen(page);
  await saveRoastButton(page).click();
  expect(await roastCount(page)).toBe(2); // the fixture roast + the one just saved

  await expectSaveWindowStillOpen(page);
  await keepRoastsAcrossReload(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });

  // The roast is finished, not restored: no paused roast, no SAVE ROAST, nothing
  // left of its log (absent or empty is the same thing).
  await expect.soft(page.getByTestId("roast-setup"), "the finished roast must not be restored").toBeVisible();
  await expect.soft(saveRoastButton(page), "the saved roast must not be offered for saving again").toHaveCount(0);
  const log = await stored(page, "live_roastLog");
  expect.soft(log === null || log === "[]", `live_roastLog should be gone, was ${log}`).toBe(true);

  // ...and whatever the app still offers, tapping it must not put a second copy in History.
  const again = saveRoastButton(page);
  if ((await again.count()) > 0 && (await again.isEnabled())) await again.click();
  expect(await roastCount(page)).toBe(2);
});

test("save roast: the NEXT roast after a normal save still saves (RL-043)", async ({ page }) => {
  await roastToCooling(page);
  await saveRoastButton(page).click();
  await skipDropWeight(page); // otherwise the prompt sits over Setup and blocks the next roast
  // +2 s: the live session clears and the tab flips back to Setup.
  await expect(page.getByTestId("roast-setup")).toBeVisible({ timeout: 10_000 });
  expect(await roastCount(page)).toBe(2);

  await page.getByRole("button", { name: /E2E Profile/ }).click();
  await runQuickRoast(page, { fan: "5", heat: "6" });

  await expect.poll(() => roastCount(page)).toBe(3);
  const ids = (await storedRoasts(page)).map((r) => r.id);
  expect(new Set(ids).size).toBe(3);
});

test("save roast: the NEXT roast after a reload right after save still saves (RL-043)", async ({ page }) => {
  await roastToCooling(page);
  await holdSaveWindowOpen(page);
  await saveRoastButton(page).click();

  await expectSaveWindowStillOpen(page);
  await keepRoastsAcrossReload(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });
  // Whatever the reload cleaned up, it must not have left the next roast blocked.
  await expect(page.getByTestId("roast-setup")).toBeVisible();
  expect(await roastCount(page)).toBe(2);

  await page.getByRole("button", { name: /E2E Profile/ }).click();
  await runQuickRoast(page, { fan: "5", heat: "6" });

  await expect.poll(() => roastCount(page)).toBe(3);
});

test("save roast: a marker whose roast is gone from History does not hide SAVE ROAST or block it (RL-043)", async ({ page }) => {
  await roastToCooling(page);
  await saveAndFindMarker(page);
  const [saved] = await storedRoasts(page);

  // Deleted from History, then the app reloads with the session still live. The
  // marker now points at a roast that is not there, so it proves nothing.
  await deleteSavedRoast(page, saved.id);
  expect(await roastCount(page)).toBe(1);
  await keepRoastsAcrossReload(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });

  // So the session comes back as it always did: a roast waiting to be saved.
  await expect(page.getByTestId("roast-setup")).toHaveCount(0);
  await expect(saveRoastButton(page)).toBeVisible();
  await saveRoastButton(page).click();

  await expect.poll(() => roastCount(page)).toBe(2); // the fixture roast + this save
  expect((await storedRoasts(page))[0].id).not.toBe(saved.id);
});

test("save roast: a marker left by an earlier roast neither wipes nor blocks the roast now under way (RL-043)", async ({ page }) => {
  await roastToCooling(page);
  const marker = await saveAndFindMarker(page);
  const [earlier] = await storedRoasts(page);

  // The earlier roast's session is over but its marker lingers, pointing at a roast
  // that IS in History. Put a different roast under way beside it: the live session
  // is replaced wholesale (every live_* key but the marker), and reloaded mid-roast.
  await page.evaluate((keep) => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("live_") && !(k in keep)) localStorage.removeItem(k);
    }
  }, marker);
  await keepRoastsAcrossReload(page);
  await reloadMidRoast(page, { profileRaw: "null" });

  // The roast under way comes back as itself -- not mistaken for the finished one.
  await expect(page.getByTestId("roast-setup")).toHaveCount(0);
  await expect(page.getByText("02:10", { exact: true })).toBeVisible(); // 130s
  expect(JSON.parse(await stored(page, "live_roastLog"))).toHaveLength(1);

  // ...and it saves.
  await page.getByRole("button", { name: "RESUME", exact: true }).click();
  for (const label of ["Yellowing", "First crack", "Cooling start"]) {
    await page.getByRole("button", { name: `Mark ${label}` }).click();
  }
  await saveRoastButton(page).click();

  await expect.poll(() => roastCount(page)).toBe(3); // fixture + the earlier roast + this one
  const newest = (await storedRoasts(page))[0];
  expect(newest.id).not.toBe(earlier.id);
  expect(newest.totalSeconds).toBeGreaterThanOrEqual(130); // continued the restored clock
});

// ---------------------------------------------------------------------------
// Roasted weight after SAVE ROAST (RL-025). Before this, handleStop wrote
// roastedWeight: 0 and the weight-loss % stayed blank until the roast was edited
// in History -- if Case remembered. Now SAVE ROAST opens a prompt for it.
//
// The contract these tests hold the build to:
//  - the roast is ALREADY in storage when the prompt opens, so no answer, SKIP
//    included, can lose a roast;
//  - the prompt is `[data-testid="drop-weight"]`, one grams field labelled
//    "Roasted weight in grams" (the Setup screen's "Green weight in grams" is the
//    model), a live weight-loss %, and SAVE WEIGHT / SKIP buttons;
//  - it is React state at the root, so the 2 s live-session clear and tab flip
//    leave it open;
//  - SAVE WEIGHT patches THAT roast by id and syncs it through the existing
//    syncRoastToSupabase; SKIP changes nothing and sends nothing;
//  - the % is the History "Wt Loss" tile's own: green and roasted both > 0 and
//    roasted < green, ((g - r) / g) * 100 to one decimal;
//  - the weight prompt comes first; the profile sheet, when it applies, after it.
// Screenshots: only `fullPageShot`, never baselined from this machine -- the
// prompt's baseline is pending Case's Mac.
// ---------------------------------------------------------------------------

const dropWeightInput = (page) => dropWeightPrompt(page).getByLabel("Roasted weight in grams");
const saveDropWeightButton = (page) => dropWeightPrompt(page).getByRole("button", { name: "SAVE WEIGHT" });
const profileSheet = (page) => page.getByTestId("profile-from-roast");

// A weight-loss figure anywhere in the prompt: "16.3%", never "—" or a bare label.
const LOSS_PERCENT = /\d+(\.\d+)?\s*%/;
// The History "Wt Loss" tile of the roast open in the detail view, e.g. "16.3%".
const historyLossTile = (page) => page.getByText("Wt Loss", { exact: true }).locator("..");

// Every write the app aims at the cloud's roasts table, body parsed, in the order
// it was sent. The context route aborts them, but the 'request' event still fires
// (the same trick as recordCloudDeletes), so each attempt is visible. A negative
// assertion on this list is only honest after the roast's first write was seen.
function recordCloudRoastWrites(page) {
  const sent = [];
  page.on("request", (req) => {
    if (!["POST", "PATCH", "PUT"].includes(req.method())) return;
    if (!/\/rest\/v1\/roasts(\?|$)/.test(req.url())) return;
    let body = null;
    try { body = JSON.parse(req.postData() || "null"); } catch (e) { /* not JSON: ignored below */ }
    for (const row of [].concat(body || [])) sent.push(row);
  });
  return {
    forRoast: (id) => sent.filter((row) => Number(row.id) === Number(id)),
    all: () => [...sent],
  };
}

// Holds the roast's own first cloud write (the one SAVE ROAST sends) in flight until
// release(), then lets it on to the context route, which aborts it like any other.
// While it is held, the weight's write (queued behind it) cannot have been sent --
// which is the window in which the user can still delete or edit the roast. Call it
// BEFORE the roast is saved. `release` is idempotent; tests call it in a finally.
async function holdFirstRoastWrite(page) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let held = false;
  await page.route(/\/rest\/v1\/roasts(\?|$)/, async (route) => {
    if (route.request().method() !== "POST" || held) return route.fallback();
    held = true;
    await gate;
    await route.fallback();
  });
  return { release };
}

// 227 g green on a manual roast of Fan 5 / Heat 6, saved, and the prompt left open.
// With `followed` the roast follows a one-step profile it then matches exactly, so
// the profile sheet has no reason to open and these tests see the weight prompt alone
// ("does not nag", above). Without it the roast is a manual one, which DOES earn the
// "Keep this as a profile?" sheet.
async function roastToDropWeight(page, { green = "227", followed = true, fan = "5", heat = "6" } = {}) {
  await seedSetup(page, { profiles: [singleStepProfile] });
  if (followed) await page.getByRole("button", { name: /E2E Profile/ }).click();
  else await page.getByRole("button", { name: /Manual roast/ }).click();
  if (green) await page.getByLabel("Green weight in grams").fill(green);
  await runQuickRoast(page, { fan, heat, clockPast: 2, dropWeight: "leave" });
  await expect(dropWeightPrompt(page)).toBeVisible();
}

test("drop weight: SAVE ROAST opens the prompt with the roast already saved, and the 2 s tab flip does not close it (RL-025)", async ({ page }) => {
  await roastToDropWeight(page);

  // Already saved: in storage, once, with the weight still unset.
  const roasts = await storedRoasts(page);
  expect(roasts).toHaveLength(2); // the fixture roast + this one
  expect(roasts[0].greenWeight).toBe(227);
  expect(roasts[0].roastedWeight).toBe(0);
  // A followed, unchanged roast has no profile to offer: the prompt is the only one.
  await expect(profileSheet(page)).toHaveCount(0);
  // Both answers are reachable on a phone, with nothing scrolled.
  await expect(saveDropWeightButton(page)).toBeInViewport();
  await expect(dropWeightPrompt(page).getByRole("button", { name: "SKIP" })).toBeInViewport();

  // Type inside the first 2 s, then let the live session clear and the tab flip to
  // Setup: the prompt, and what was typed into it, must still be there.
  await dropWeightInput(page).fill("190");
  await expect(page.getByTestId("roast-setup")).toBeVisible({ timeout: 10_000 });
  await expect(dropWeightPrompt(page)).toBeVisible();
  await expect(dropWeightInput(page)).toHaveValue("190");
  await expect(dropWeightPrompt(page)).toContainText("16.3%");
  expect(await roastCount(page)).toBe(2);
});

test("drop weight: the weight loss shows as it is typed, and is the History tile's own number (RL-025)", async ({ page }) => {
  await roastToDropWeight(page); // 227 g green
  const prompt = dropWeightPrompt(page);
  const input = dropWeightInput(page);
  // Nothing typed yet, nothing to compute.
  await expect(prompt).not.toContainText(LOSS_PERCENT);

  // Key by key, no blur in between: every stroke moves the figure.
  await input.click();
  await page.keyboard.type("1");
  await expect(prompt).toContainText("99.6%");
  await page.keyboard.type("9");
  await expect(prompt).toContainText("91.6%");
  await page.keyboard.type("0");
  await expect(prompt).toContainText("16.3%");

  // The History tile's rounding (one decimal), including a decimal weight.
  await input.fill("190.5");
  await expect(prompt).toContainText("16.1%");
  await input.fill("226");
  await expect(prompt).toContainText("0.4%");

  // The tile's own rule: no figure unless 0 < roasted < green. Roasted at or above
  // green is not a weight loss, and the tile would read "—" for it.
  for (const heavy of ["227", "230"]) {
    await input.fill(heavy);
    await expect(prompt, `${heavy} g against 227 g green`).not.toContainText(LOSS_PERCENT);
  }

  // And once saved, History shows exactly the figure the prompt showed.
  await input.fill("190");
  await expect(prompt).toContainText("16.3%");
  await saveDropWeightButton(page).click();
  await page.getByRole("button", { name: "History" }).click();
  await page.getByText("Unnamed Bean").first().click();
  await expect(historyLossTile(page)).toContainText("16.3%");
});

test("drop weight: a weight at or above the green weight gets a check-the-scale hint, and it never blocks SAVE WEIGHT (RL-025)", async ({ page }) => {
  await roastToDropWeight(page); // 227 g green
  const prompt = dropWeightPrompt(page);
  const input = dropWeightInput(page);
  const hint = prompt.getByText("Heavier than the 227 g green weight: check the scale.");

  // Nothing typed, and a normal weight: no hint.
  await expect(hint).toHaveCount(0);
  await input.fill("190");
  await expect(prompt).toContainText("16.3%");
  await expect(hint).toHaveCount(0);

  // 230 and exactly 227 are both "not a weight loss": the hint names the roast's own green weight.
  for (const heavy of ["230", "227"]) {
    await input.fill(heavy);
    await expect(hint, `${heavy} g against 227 g green`).toHaveCount(1);
    await expect(prompt).not.toContainText(LOSS_PERCENT);
  }

  // One notch under green is a (tiny) loss again, so the hint goes.
  await input.fill("226");
  await expect(hint).toHaveCount(0);
  await input.fill("190");
  await expect(hint).toHaveCount(0);

  // It warns and never blocks: the green weight itself may be the typo, so a heavy
  // weight still saves, exactly as typed.
  await input.fill("230");
  await expect(hint).toHaveCount(1);
  await expect(saveDropWeightButton(page)).toBeEnabled();
  await saveDropWeightButton(page).click();
  await expect(dropWeightPrompt(page)).toHaveCount(0);
  expect((await storedRoasts(page))[0].roastedWeight).toBe(230);
});

// WCAG AA wants 4.5:1 for 16 px text. SAVE WEIGHT is white-on-ember if its label
// takes the page's BACKGROUND colour (what `text-primary` is): in the light theme
// that is off-white on ember, about 3.7:1. The label has its own token instead.
test("drop weight: the SAVE WEIGHT label clears 4.5:1 against its ember button in both themes (RL-025)", async ({ page }) => {
  await roastToDropWeight(page);
  await dropWeightInput(page).fill("190"); // enabled: a disabled button is drawn at 40% opacity
  // Measure the settled colours, not a frame of the 150 ms ease between themes: the first
  // sample after a flip would otherwise still read the OLD theme's near-black label.
  await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; }" });
  const contrast = () =>
    page.evaluate(() => {
      const btn = document.querySelector('[data-testid="drop-weight"] button[type="submit"]');
      const cs = getComputedStyle(btn);
      const channels = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
      const luminance = (c) => {
        const [r, g, b] = channels(c).map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const [hi, lo] = [luminance(cs.color), luminance(cs.backgroundColor)].sort((a, b) => b - a);
      return (hi + 0.05) / (lo + 0.05);
    });

  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    expect(await contrast(), `${theme} theme: SAVE WEIGHT label against its button`).toBeGreaterThanOrEqual(4.5);
  }
});

test("drop weight: SAVE WEIGHT writes the weight onto that roast and sends it to the cloud (RL-025)", async ({ page }) => {
  const cloud = recordCloudRoastWrites(page);
  await roastToDropWeight(page);
  const before = await storedRoasts(page);
  const saved = before[0];
  // The roast's own first write is out already (it carries the unset weight).
  await expect.poll(() => cloud.forRoast(saved.id).length, { message: "cloud writes for the roast at SAVE ROAST" }).toBe(1);
  expect(cloud.forRoast(saved.id)[0].roasted_weight).toBe(0);

  await dropWeightInput(page).fill("190");
  await saveDropWeightButton(page).click();
  await expect(dropWeightPrompt(page)).toHaveCount(0);

  // Same roast, same place, one field different -- and nothing else touched.
  const after = await storedRoasts(page);
  expect(after).toHaveLength(2);
  expect(after[0]).toEqual({ ...saved, roastedWeight: 190 });
  expect(after[1]).toEqual(before[1]);

  // The cloud got the weight through the roast's normal upsert: the same id, the
  // whole row (an upsert that dropped columns would blank them), and it came LAST.
  await expect.poll(() => cloud.forRoast(saved.id).length, { message: "cloud writes for the roast after SAVE WEIGHT" }).toBe(2);
  const writes = cloud.forRoast(saved.id);
  const last = writes[writes.length - 1];
  expect(last.roasted_weight).toBe(190);
  expect(last.green_weight).toBe(227);
  expect(last.bean_name).toBe(saved.beanName);
  expect(last.roast_log).toHaveLength(saved.roastLog.length);
  expect(cloud.all().filter((row) => Number(row.id) !== Number(saved.id))).toHaveLength(0); // no other roast was written

  // History shows it too.
  await page.getByRole("button", { name: "History" }).click();
  await page.getByText("Unnamed Bean").first().click();
  await expect(page.getByText("Roasted Weight")).toBeVisible();
  await expect(historyLossTile(page)).toContainText("16.3%");
});

test("drop weight: a slow first cloud write cannot land after the weight's write and reset it to 0 (RL-025)", async ({ page }) => {
  const cloud = recordCloudRoastWrites(page);
  // Hold the roast's own first write (the one SAVE ROAST sends) in flight. Two
  // upserts of one row racing on a bad connection can land in either order; the one
  // that lands last wins, so the weight's write must wait for the first to settle.
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let held = false;
  await page.route(/\/rest\/v1\/roasts(\?|$)/, async (route) => {
    if (route.request().method() !== "POST" || held) return route.fallback();
    held = true;
    await gate;
    await route.fallback(); // on to the context route, which aborts it like any other
  });

  await roastToDropWeight(page);
  const [saved] = await storedRoasts(page);
  await expect.poll(() => cloud.forRoast(saved.id).length, { message: "the first write, held in flight" }).toBe(1);

  await dropWeightInput(page).fill("190");
  await saveDropWeightButton(page).click();
  // The device has it at once -- local storage never waits on the network...
  expect((await storedRoasts(page))[0].roastedWeight).toBe(190);
  // ...but the cloud write queues behind the first, which has not settled yet.
  await page.waitForTimeout(600);
  expect(
    cloud.forRoast(saved.id).map((row) => row.roasted_weight),
    "the weight's write must wait for the held first write"
  ).toEqual([0]);

  release();
  await expect.poll(() => cloud.forRoast(saved.id).length, { message: "the weight's write after the first settled" }).toBe(2);
  expect(cloud.forRoast(saved.id).map((row) => row.roasted_weight)).toEqual([0, 190]);
});

// The weight's cloud write waits behind the roast's first one, so it can be sent
// well after SAVE WEIGHT was tapped. It must carry the roast as storage holds it
// WHEN IT IS SENT, not the copy taken at the tap: a stale copy would undo an edit
// made in between, or bring a deleted roast back from the dead.
test("drop weight: a roast deleted while its weight write waits is not re-created in the cloud (RL-025)", async ({ page }) => {
  const cloud = recordCloudRoastWrites(page);
  const deletes = recordCloudDeletes(page);
  const first = await holdFirstRoastWrite(page);
  try {
    await roastToDropWeight(page);
    const [saved] = await storedRoasts(page);
    await expect.poll(() => cloud.forRoast(saved.id).length, { message: "the first write, held in flight" }).toBe(1);

    await dropWeightInput(page).fill("190");
    await saveDropWeightButton(page).click();
    await expect(dropWeightPrompt(page)).toHaveCount(0);
    expect((await storedRoasts(page))[0].roastedWeight).toBe(190);

    // Delete it from History while the first write is still in flight.
    await page.getByRole("button", { name: "History" }).click();
    await page.getByText("Unnamed Bean").first().click();
    await page.getByRole("button", { name: "DELETE ROAST" }).click();
    await page.getByRole("button", { name: "DELETE", exact: true }).click();
    expect((await storedRoasts(page)).some((r) => r.id === saved.id), "the roast is gone from this device").toBe(false);
    // The cloud delete WAS sent: a client that sent nothing at all would pass the
    // negative below just as happily.
    expect(await deletes.sentAfter(1)).toEqual([`roasts?id=eq.${saved.id}`]);

    first.release();
    await page.waitForTimeout(800); // long enough for a queued write to have been sent
    expect(
      cloud.forRoast(saved.id).map((row) => row.roasted_weight),
      "only the roast's own first write: the weight's write must not re-create a deleted roast"
    ).toEqual([0]);
    await expect(page.getByText("Couldn't store the roasted weight")).toHaveCount(0); // not an error, just moot
    expect((await storedRoasts(page)).some((r) => r.id === saved.id)).toBe(false); // and not back on the device
  } finally {
    first.release();
  }
});

test("drop weight: a roast edited while its weight write waits is sent as edited, with the weight -- never the stale copy (RL-025)", async ({ page }) => {
  const cloud = recordCloudRoastWrites(page);
  const first = await holdFirstRoastWrite(page);
  try {
    await roastToDropWeight(page);
    const [saved] = await storedRoasts(page);
    await expect.poll(() => cloud.forRoast(saved.id).length, { message: "the first write, held in flight" }).toBe(1);

    await dropWeightInput(page).fill("190");
    await saveDropWeightButton(page).click();
    await expect(dropWeightPrompt(page)).toHaveCount(0);

    // Edit it in History while the first write is still in flight.
    await page.getByRole("button", { name: "History" }).click();
    await page.getByText("Unnamed Bean").first().click();
    await page.getByRole("button", { name: "EDIT ROAST" }).click();
    await page.getByLabel("Bean Name").fill("Edited While Waiting");
    await page.getByRole("button", { name: "SAVE CHANGES" }).click();
    const edited = (await storedRoasts(page))[0];
    expect(edited.id).toBe(saved.id);
    expect(edited.beanName).toBe("Edited While Waiting");
    expect(edited.roastedWeight).toBe(190);
    // The edit's own upsert goes straight out (it is not queued behind the first).
    await expect.poll(() => cloud.forRoast(saved.id).length, { message: "the edit's own write" }).toBe(2);

    first.release();
    await expect.poll(() => cloud.forRoast(saved.id).length, { message: "the weight's write, after the first settled" }).toBe(3);
    const writes = cloud.forRoast(saved.id);
    expect(writes[0].bean_name).toBe("Unnamed Bean"); // the first write predates the edit and the weight
    expect(writes[0].roasted_weight).toBe(0);
    // Everything sent after the edit -- the weight's write included -- is the edited roast.
    for (const row of writes.slice(1)) {
      expect(row.bean_name).toBe("Edited While Waiting");
      expect(row.roasted_weight).toBe(190);
    }
    expect((await storedRoasts(page))[0]).toEqual(edited); // and the device was never rewritten by it
  } finally {
    first.release();
  }
});

test("drop weight: SKIP leaves the roast exactly as saved, discards what was typed, and sends nothing more (RL-025)", async ({ page }) => {
  const cloud = recordCloudRoastWrites(page);
  await roastToDropWeight(page);
  const before = await storedRoasts(page);
  await expect.poll(() => cloud.forRoast(before[0].id).length).toBe(1);

  await dropWeightInput(page).fill("190"); // typed, then walked away from
  await skipDropWeight(page);
  await expect(dropWeightPrompt(page)).toHaveCount(0);

  // Byte for byte what handleStop wrote: still saved, still once, weight still 0.
  expect(await storedRoasts(page)).toEqual(before);
  expect(before[0].roastedWeight).toBe(0);
  // SKIP is a no-op for the cloud too: the one write is the roast's own, from SAVE ROAST.
  await page.waitForTimeout(600);
  expect(cloud.forRoast(before[0].id).map((row) => row.roasted_weight)).toEqual([0]);

  // It stays dismissed once the live session clears and the tab flips to Setup.
  await expect(page.getByTestId("roast-setup")).toBeVisible({ timeout: 10_000 });
  await expect(dropWeightPrompt(page)).toHaveCount(0);
});

// What the field must never turn into a saved weight. None of these may write 0 or
// anything else: the roast stays as SAVE ROAST left it, and nothing is sent. (A
// number field refuses letters outright, a text field has to; either way no figure
// shows and nothing saves.)
for (const bad of ["", "abc", "-5", "0"]) {
  test(`drop weight: ${JSON.stringify(bad)} saves nothing and never writes 0 (RL-025)`, async ({ page }) => {
    const cloud = recordCloudRoastWrites(page);
    await roastToDropWeight(page);
    const before = await storedRoasts(page);
    await expect.poll(() => cloud.forRoast(before[0].id).length).toBe(1);

    const input = dropWeightInput(page);
    if (bad) {
      await input.click();
      await page.keyboard.type(bad); // keystrokes, so a number field's own filtering applies
    }
    await expect(dropWeightPrompt(page)).not.toContainText(LOSS_PERCENT);
    // force: a disabled SAVE WEIGHT is as good an answer as one that does nothing.
    await saveDropWeightButton(page).click({ force: true });

    expect(await storedRoasts(page)).toEqual(before);
    await page.waitForTimeout(600);
    expect(cloud.forRoast(before[0].id).map((row) => row.roasted_weight)).toEqual([0]);
  });
}

test("drop weight: a roast with no green weight still takes the weight, and shows no percentage (RL-025)", async ({ page }) => {
  await roastToDropWeight(page, { green: "" });
  expect((await storedRoasts(page))[0].greenWeight).toBe(0);

  await dropWeightInput(page).fill("190");
  // Nothing to take a loss from -- the History tile would read "—" too.
  await expect(dropWeightPrompt(page)).not.toContainText(LOSS_PERCENT);
  // ...and nothing to be heavier than, so no check-the-scale hint either.
  await expect(dropWeightPrompt(page)).not.toContainText("check the scale");
  await saveDropWeightButton(page).click();
  await expect(dropWeightPrompt(page)).toHaveCount(0);
  expect((await storedRoasts(page))[0].roastedWeight).toBe(190);
});

test("drop weight: the weight lands on its own roast -- the next roast gets its own prompt and the earlier one is left alone (RL-025)", async ({ page }) => {
  await roastToDropWeight(page);
  await skipDropWeight(page);
  const [first] = await storedRoasts(page);

  // Back on Setup once the save settles; the profile choice is made fresh every roast.
  await expect(page.getByTestId("roast-setup")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /E2E Profile/ }).click();
  await runQuickRoast(page, { fan: "5", heat: "6", clockPast: 2, dropWeight: "leave" });
  await expect(dropWeightPrompt(page)).toBeVisible();
  await dropWeightInput(page).fill("150"); // 227 g green carried forward
  await expect(dropWeightPrompt(page)).toContainText("33.9%");
  await saveDropWeightButton(page).click();
  await expect(dropWeightPrompt(page)).toHaveCount(0);

  const roasts = await storedRoasts(page);
  expect(roasts).toHaveLength(3);
  expect(new Set(roasts.map((r) => r.id)).size).toBe(3);
  expect(roasts[0].id).not.toBe(first.id);
  expect(roasts[0].roastedWeight).toBe(150);
  expect(roasts[1]).toEqual(first); // the earlier roast, weight still unset
  expect(roasts[2].roastedWeight).toBe(fixtureRoast.roastedWeight); // the seeded one, untouched
});

test("drop weight: a roast that reaches storage while the prompt is open is kept, and the weight still lands on its own roast (RL-025)", async ({ page }) => {
  await roastToDropWeight(page);
  const [saved] = await storedRoasts(page);
  // The launch sync merges cloud roasts into storage whenever its read finishes --
  // possibly while the prompt is up -- and sorts them newest-first. A roast from
  // another device with a LATER id lands ahead of this one, so "the first roast" is
  // no longer this roast. Saving the weight must patch the roast with this roast's
  // id as it finds storage now, not the first one and not the copy it was opened with.
  const arrived = { ...fixtureRoast, id: saved.id + 5000, date: "2026-10-14", beanName: "Merged In From Cloud" };
  await page.evaluate((roast) => {
    const all = JSON.parse(localStorage.getItem("roasts"));
    localStorage.setItem("roasts", JSON.stringify([roast, ...all]));
  }, arrived);

  await dropWeightInput(page).fill("190");
  await saveDropWeightButton(page).click();
  await expect(dropWeightPrompt(page)).toHaveCount(0);

  const roasts = await storedRoasts(page);
  expect(roasts).toHaveLength(3);
  expect(roasts.find((r) => r.id === arrived.id)).toEqual(arrived); // kept, and not given a weight
  expect(roasts.find((r) => r.id === saved.id)).toEqual({ ...saved, roastedWeight: 190 });
});

test("drop weight: a reload with the prompt open leaves the roast in History exactly once (RL-025)", async ({ page }) => {
  await roastToDropWeight(page);
  const [saved] = await storedRoasts(page);
  // Past the 2 s clear, so this is the prompt-open-on-Setup state, not the save window.
  await expect(page.getByTestId("roast-setup")).toBeVisible({ timeout: 10_000 });
  await expect(dropWeightPrompt(page)).toBeVisible();

  await keepRoastsAcrossReload(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });

  // The prompt was only ever a question; the roast does not depend on it.
  const roasts = await storedRoasts(page);
  expect(roasts).toHaveLength(2);
  expect(roasts.filter((r) => r.id === saved.id)).toHaveLength(1);
  expect(roasts[0].roastedWeight).toBe(0);
  await expect(saveRoastButton(page)).toHaveCount(0);
});

test("drop weight: with the profile sheet also due, the weight is asked first, once, and the sheet still works after SAVE WEIGHT (RL-025)", async ({ page }) => {
  await roastToDropWeight(page, { followed: false }); // a manual roast earns "Keep this as a profile?"
  // One question at a time: the sheet waits behind the weight prompt.
  await expect(profileSheet(page)).toHaveCount(0);

  await dropWeightInput(page).fill("190");
  await saveDropWeightButton(page).click();
  await expect(dropWeightPrompt(page)).toHaveCount(0);

  const sheet = profileSheet(page);
  await expect(sheet.getByText("Keep this as a profile?")).toBeVisible();
  await sheet.getByLabel("Profile name").fill("Weighed Roast");
  await sheet.getByRole("button", { name: "Save profile" }).click();
  await expect(sheet).toHaveCount(0);

  // Neither question undid the other, and the weight prompt did not come back.
  await expect(dropWeightPrompt(page)).toHaveCount(0);
  const { roasts, profile } = await page.evaluate(() => ({
    roasts: JSON.parse(localStorage.getItem("roasts")),
    profile: JSON.parse(localStorage.getItem("global_profiles")).find((p) => p.name === "Weighed Roast"),
  }));
  expect(roasts).toHaveLength(2);
  expect(roasts[0].roastedWeight).toBe(190);
  expect(profile.sourceRoastId).toBe(roasts[0].id);
});

test("drop weight: SKIP with the profile sheet also due leaves the roast alone, and 'No thanks' does not bring the weight prompt back (RL-025)", async ({ page }) => {
  await roastToDropWeight(page, { followed: false });
  const before = await storedRoasts(page);
  await expect(profileSheet(page)).toHaveCount(0);

  await skipDropWeight(page);
  await expect(dropWeightPrompt(page)).toHaveCount(0);
  await expect(profileSheet(page).getByText("Keep this as a profile?")).toBeVisible();
  await profileSheet(page).getByRole("button", { name: "No thanks" }).click();

  await expect(profileSheet(page)).toHaveCount(0);
  await expect(dropWeightPrompt(page)).toHaveCount(0);
  expect(await storedRoasts(page)).toEqual(before);
});

test("drop weight: the prompt renders (visual; baseline pending Case's Mac) (RL-025)", async ({ page }) => {
  await roastToDropWeight(page);
  await dropWeightInput(page).fill("190");
  await expect(dropWeightPrompt(page)).toContainText("16.3%");
  // Let the page behind settle: the tab flips to Setup at 2 s and its "saved --
  // setup carried forward" note leaves at 6 s. A shot taken earlier is a race.
  await expect(page.getByTestId("roast-setup")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/last setup carried forward/)).toHaveCount(0, { timeout: 10_000 });
  await fullPageShot(page, "drop-weight.png");
});

// ---------------------------------------------------------------------------
// RL-050: the CSV export must not hand a spreadsheet a formula. Excel, Numbers and
// Sheets run a TEXT cell that opens with = + - @ (or a TAB or CR) as a formula, and
// the export writes free text -- Bean Name, Origin, Visual Color, Brew Again, Session
// Notes -- straight into cells. "+15s dev" or "-1 heat at FC" in a note becomes
// #NAME? or a sum; a bean named =cmd|'/c calc'!A1 becomes a command to run. The
// defence is a leading ' on those text cells (the OWASP-recommended one).
//
// A number is NOT text: a roast that gained weight has a real Weight Loss % of -5.0,
// and that has to stay -5.0, not become '-5.0. The second assertion is the guard
// against a fix that prefixes by looking at the characters instead of at what the
// exporter holds.
//
// The file is read the way a spreadsheet reads it (parseCSV), so the assertions are
// about a cell's VALUE and not about whether the writer chose to quote it.
// ---------------------------------------------------------------------------

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Settings -> Export Data -> the CSV button; returns the downloaded file as rows.
// The export refuses to run on a partial cloud read, so the four reads are answered
// -- with nothing, which leaves the file as this device's data. Answered AFTER the
// reload so the launch sync still meets the beforeEach abort, as in every other test.
async function exportRoastLogRows(page, { roasts, tastings, beans = [] }) {
  await page.addInitScript(({ r, t, b }) => {
    window.localStorage.setItem("roasts", JSON.stringify(r));
    window.localStorage.setItem("tastingNotes", JSON.stringify(t));
    window.localStorage.setItem("beans", JSON.stringify(b));
  }, { r: roasts, t: tastings, b: beans });
  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });
  const cloud = await holdCloudRoasts(page, []);
  cloud.release();

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Export Data" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export Roast Log (CSV)" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^roastlogs-export-\d{4}-\d{2}-\d{2}\.csv$/);
  return parseCSV(await readFile(await download.path(), "utf8"));
}

test("csv export: text cells that open with = + - @ are written with a leading ', and a real negative number stays a number (RL-050)", async ({ page }) => {
  const payload = "=cmd|'/c calc'!A1";
  // Every column the exporter fills from something a person typed carries a formula
  // payload in some roast: Bean Name, Origin (read from the bean row of that name, so
  // there is one), Target Roast Level, Visual Color, Brew Again and Session Notes.
  // A: the crafted bean name and origin, a level that opens with =, a note with +.
  // B: a roast that GAINED weight (loss -5.0, a number), a colour that opens with a TAB,
  //    a level with -, a Brew Again with a quoted formula, and a note that opens with -.
  // C: a roasted weight no scale could report -- it parses to Infinity, and the loss
  //    must be an empty cell, not the text "-Infinity".
  const roastA = { ...fixtureRoast, id: 1750000000501, date: "2026-08-01", beanName: payload, greenWeight: "100", roastedWeight: "85", targetLevel: "=1+1", visualColor: "+Dark" };
  const roastB = { ...fixtureRoast, id: 1750000000502, date: "2026-08-02", beanName: "Plain Bean", greenWeight: "100", roastedWeight: "105", targetLevel: "-Full City", visualColor: "\t=1+1" };
  const roastC = { ...fixtureRoast, id: 1750000000503, date: "2026-08-03", beanName: "Huge Bean", greenWeight: "100", roastedWeight: "1e999", targetLevel: "City", visualColor: "Even" };
  const noteA = { ...fixtureTasting, id: 1750000000511, roastId: String(roastA.id), beanName: payload, notes: "+15s dev", brewAgain: "@Yes" };
  const noteB = { ...fixtureTasting, id: 1750000000512, roastId: String(roastB.id), beanName: "Plain Bean", notes: "-1 heat at FC", brewAgain: '=HYPERLINK("http://x","y")' };
  const beanA = { ...fixtureBean, id: 1750000000521, name: payload, origin: "@SUM(1+1)" };
  const beanB = { ...fixtureBean, id: 1750000000522, name: "Plain Bean", origin: "Ethiopia" };

  const rows = await exportRoastLogRows(page, { roasts: [roastA, roastB, roastC], tastings: [noteA, noteB], beans: [beanA, beanB] });
  const [header, ...data] = rows;
  const col = (name) => header.indexOf(name);
  const rowFor = (date) => data.find((r) => r[col("Date")] === date);
  expect(header.slice(0, 3)).toEqual(["Date", "Bean Name", "Origin"]);
  expect(data).toHaveLength(3);

  const a = rowFor("2026-08-01");
  const b = rowFor("2026-08-02");
  const c = rowFor("2026-08-03");
  // Text cells, one per free-text column: neutralised with one leading '.
  expect(a[col("Bean Name")]).toBe("'" + payload);
  expect(a[col("Origin")]).toBe("'@SUM(1+1)");
  expect(a[col("Target Roast Level")]).toBe("'=1+1");
  expect(a[col("Visual Color")]).toBe("'+Dark");
  expect(a[col("Brew Again (Yes/No/Maybe)")]).toBe("'@Yes");
  expect(a[col("Session Notes")]).toBe("'+15s dev");
  expect(b[col("Target Roast Level")]).toBe("'-Full City");
  expect(b[col("Visual Color")]).toBe("'\t=1+1");
  expect(b[col("Brew Again (Yes/No/Maybe)")]).toBe("'=HYPERLINK(\"http://x\",\"y\")");
  expect(b[col("Session Notes")]).toBe("'-1 heat at FC");
  // Numbers and ordinary text: untouched. Rating is a number from the note; Weight Loss %
  // is the one cell the exporter computes (a toFixed string such as "-5.0").
  expect(a[col("Weight Loss %")]).toBe("15.0");
  expect(b[col("Weight Loss %")]).toBe("-5.0");
  expect(a[col("Green Weight (g)")]).toBe("100");
  expect(a[col("Rating (0.5-5)")]).toBe("3.5");
  expect(b[col("Bean Name")]).toBe("Plain Bean");
  expect(b[col("Origin")]).toBe("Ethiopia");
  // A roasted weight that parses to Infinity gives an empty loss cell, never "-Infinity".
  expect(c[col("Weight Loss %")]).toBe("");
  expect(c[col("Target Roast Level")]).toBe("City");
  // Whatever else is written, no cell may open with a formula character unless it is
  // the one genuine number above. This is the net for a column added later that skips
  // csvEscape: a payload in it would land here.
  for (const row of data) {
    for (const value of row) {
      expect(value, "no cell may be a non-finite number written as text").not.toMatch(/^-?(Infinity|NaN)$/);
      if (/^[=+\-@\t\r]/.test(value)) expect(value, "a cell a spreadsheet would run as a formula").toBe("-5.0");
    }
  }
});

// ---------------------------------------------------------------------------
// RL-054: a probe roast saves a continuous curve, and History's tiles read numbers.
// v3.8.2 changed how the curve is recorded and shipped without a localhost review.
// The mockRoastLinkFeed tests above stop at the live chart (ghost, caption, badge);
// nothing drove a whole probe roast through SAVE ROAST and into History. This one
// does, on a healthy feed: the bridge is on the channel for the whole roast, so the
// saved curve must have no hole in it. Avg RoR and FC Temp are READ from that saved
// curve, so they must be numbers; DTR is phase math from the marks (drop minus first
// crack, over the total), so it checks that the marks saved, not the curve. A GUARD on
// existing behaviour -- it passes today and fails if recording starts leaving holes in
// a healthy feed, or Avg RoR / FC Temp stop reading the saved curve.
//
// The roast runs 20 s of real time (the mock publishes at 2 Hz, the roast clock is
// real): Avg RoR is a +/-15 s least-squares slope and stays "—" until 16 contiguous
// seconds exist, so a shorter roast would pass for the wrong reason or fail for it.
//
// The v3.8.2 worry was the LIVE chart, not only the saved curve: that the Temp line
// fragments mid-roast. So the test also opens the live chart while the roast runs and
// reads the solid Temp path off the page. A line that is whole is ONE subpath (a
// single "M"); every hole in the data starts a fresh "M" (connectNulls is off on this
// line, see LiveRoastChart.jsx) -- the same count the ghost tests above use.
// ---------------------------------------------------------------------------

const historyTile = (page, label) => page.getByText(label, { exact: true }).locator("xpath=following-sibling::div");

// The SOLID Temp line of the live chart: the Temp colour with no dash. (The ghost is the
// same colour with a "4 3" dash and is not on this chart without a followed profile.)
// Scoped to the first recharts surface, which is the live chart; the second is the
// Fan/Heat control map. One entry per matching path, each the number of its "M"s -- so
// `[1]` is "one line, in one piece", and `[]` (no line drawn) is not mistaken for it.
const LIVE_TEMP_PATH = 'path.recharts-line-curve[stroke="rgb(var(--chart-temp))"]:not([stroke-dasharray])';
const liveTempSubpaths = (page) =>
  page.evaluate((sel) => {
    const surface = document.querySelector(".recharts-surface");
    if (!surface) return [];
    return [...surface.querySelectorAll(sel)].map((p) => ((p.getAttribute("d") || "").match(/M/g) || []).length);
  }, LIVE_TEMP_PATH);

test("mock-bridge roast: a steady probe saves a continuous curve, and History's Avg RoR, FC Temp and DTR tiles show numbers (RL-054)", async ({ page }) => {
  test.setTimeout(90_000);
  await mockRoastLinkFeed(page); // bt 250..254, every 500 ms
  await seedSetup(page, { setup: "razzo-v5t" });
  await page.getByRole("button", { name: /E2E Setup Bean/ }).click();
  await page.getByLabel("Green weight in grams").fill("250");
  await page.getByRole("button", { name: /Manual roast/ }).click();

  await runQuickRoast(page, {
    viaPreheat: true,
    clockPast: 20,
    // 20 s in, marks not yet logged: make sure the live chart is open (the Bean temp
    // readout is its button) and look at the Temp line. Sampled for a few seconds, not
    // once, because a fragment can come and go as the feed's 2 Hz and the roast's 1 Hz
    // clock drift.
    beforeMarks: async (p) => {
      await ensureLiveChartOpen(p);
      await expect(p.locator(".recharts-surface").first()).toBeVisible();
      await expect.poll(async () => (await liveTempSubpaths(p)).length, { timeout: 10_000, message: "the live Temp line is drawn" }).toBe(1);
      for (let i = 0; i < 6; i++) {
        expect(await liveTempSubpaths(p), `live Temp line, sample ${i}: one solid path, one subpath`).toEqual([1]);
        await p.waitForTimeout(500);
      }
    },
  });

  // The controls on a probe roast still read Fan -> Heat -> Temp.
  const dials = page.locator("div.grid.grid-cols-3.divide-x > button");
  expect((await dials.locator("div:first-child").allInnerTexts()).map((l) => l.toLowerCase())).toEqual(["fan", "heat", "temp"]);

  // The roast is already in storage (runQuickRoast answered the weight prompt with SKIP).
  const [saved] = await storedRoasts(page);
  expect(saved.beanName).toBe(fixtureBean.name);
  expect(saved.equipment).toMatchObject({ setup: "razzo-v5t" });
  const curve = saved.curve;
  expect(Array.isArray(curve) && curve.length > 0, "a probe roast saves its bean-temp curve").toBe(true);
  // Every point is a real reading from the feed: no null, no zero fill, no NaN.
  for (const p of curve) {
    expect(Number.isFinite(p.t) && Number.isFinite(p.bt), `point ${JSON.stringify(p)}`).toBe(true);
    expect(p.bt).toBeGreaterThanOrEqual(250);
    expect(p.bt).toBeLessThanOrEqual(254);
  }
  // Continuous: it starts with the roast, ends with it, and no step between two
  // points is wider than LIVE_GAP_S (6 s, src/lib/liveSample.js) -- the width at
  // which History treats the spacing as a signal dropout and breaks the line.
  expect(curve[0].t).toBeLessThanOrEqual(2);
  expect(curve[curve.length - 1].t).toBeGreaterThanOrEqual(saved.totalSeconds - 2);
  for (let i = 1; i < curve.length; i++) {
    expect(curve[i].t, `point ${i} follows point ${i - 1} in time`).toBeGreaterThan(curve[i - 1].t);
    expect(curve[i].t - curve[i - 1].t, `gap before point ${i}`).toBeLessThanOrEqual(6);
  }
  expect(curve.length).toBeGreaterThanOrEqual(18); // ~1 point a second for 20 s

  // History: Avg RoR and FC Temp read that curve; DTR is phase math from the marks.
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByText(fixtureBean.name).first().click();
  await expect(page.locator(".recharts-surface").nth(1)).toBeVisible();
  await expect(historyTile(page, "Avg RoR")).toHaveText(/^-?\d+(\.\d)?°\/m$/);
  await expect(historyTile(page, "FC Temp")).toHaveText(/^\d+°$/);
  await expect(historyTile(page, "DTR")).toHaveText(/^\d+(\.\d)?%$/);
  // FC Temp is read off the curve, so it lands inside the feed's 250..254 band.
  const fc = parseInt(await historyTile(page, "FC Temp").innerText(), 10);
  expect(fc).toBeGreaterThanOrEqual(249);
  expect(fc).toBeLessThanOrEqual(255);
  // Control: the one tile with no data behind it (the roasted weight was skipped) is
  // still a dash, so the three above are numbers because of the data behind them and
  // not because every tile stopped printing dashes.
  await expect(historyTile(page, "Wt Loss")).toHaveText("—");
});

// ---------------------------------------------------------------------------
// RL-063: the live chart opens itself on a probe roast. It used to start closed
// (liveChartOpen is React state, not persisted), so the chart stayed hidden until
// the roaster tapped the Bean temp readout -- after every START and, worse, after
// every mid-roast reload, which iOS does to a backgrounded PWA (RL-036). Now:
//   - a probe roast (only the Razzo has a probe) opens it at START and when the
//     page loads into a roast under way. It is PER ROAST: a tap on the readout
//     closes it for the rest of THAT roast, and the next roast opens it again;
//   - it opens only when it can be drawn now and near START or the page load. A
//     bridge that joins mid-roast does NOT make the chart drop in under the thumb
//     (the readout shows, collapsed, and the roaster taps it), and a reload after
//     COOLING START does not open it above SAVE ROAST;
//   - from START until SAVE ROAST / DISCARD (not until COOLING START: a hold may only
//     end at a stage change, never at a tap) the chart stays MOUNTED when the feed
//     drops, with the curve it has, and the readout stays too -- muted, "Feed lost" or
//     "Connecting", never blank -- so there is a cue that the feed is gone and a toggle
//     to close the chart by hand. "Connecting" has a ceiling: about 15 s after the page
//     loaded it reads "Feed lost" too, with nothing else changing;
//   - a chart the FEED took away (a roast with no curve whose feed dies) is not
//     brought back by the feed when it returns: the readout comes back collapsed;
//   - the controls never move for any of it: the chart is up from START (the same
//     layout for the whole roast) and a feed change does not change a row height;
//   - a probe-less setup (oem-tube, sr540) still gets no chart and no readout.
// The bridge is faked at the websocket (mockRoastLinkFeed), so the real
// useLiveRoast runs unmodified; the controller's dropBridge()/restoreBridge() are
// the bridge app quitting and coming back. Functional assertions only -- the
// roast-tab baseline with the chart open by default is a Mac job (visual pending).
// ---------------------------------------------------------------------------

const liveChartSurface = (page) => page.locator(".recharts-surface");
// The cluster readout in EVERY state (data-state: live | no-signal | feed-lost |
// connecting). beanTempReadout above matches only the two states that print "Bean temp".
const liveReadout = (page) => page.getByTestId("live-readout");

// A Razzo roast started the way a roaster starts it: Setup -> Begin preheat -> START,
// on the mocked bridge. Taps NOTHING that opens the chart. `profile` follows that
// profile from Setup instead of a manual roast; `roasts` is what this device holds
// (an init script, since beforeEach's seed re-runs on every load); `bean` picks the
// inventory bean in Setup the way Case does (it adds the bean name to the summary bar
// above the hero); `bean` may be an inventory bean of its own instead of `true`, to
// roast with a name the fixture does not have. `feedDown` starts the roast with the
// bridge already gone: Setup then reads "Continue" (nothing live to preheat against)
// and START is on the ready hero. `silent` is the other way to read "Continue": a
// bridge that IS on the channel (so the hook reads bridge-only) whose device sends no
// usable bean temp -- pair it with `feedOptions: { bt: () => NaN }`.
// Returns the feed controller.
async function startProbeRoast(page, { feedOptions, profile = null, roasts = null, bean = false, feedDown = false, silent = false } = {}) {
  const feed = await mockRoastLinkFeed(page, feedOptions);
  if (feedDown) feed.dropBridge(); // before the load below: the new socket sees nobody on the channel
  if (roasts) await page.addInitScript((r) => window.localStorage.setItem("roasts", JSON.stringify(r)), roasts);
  const pickedBean = bean && typeof bean === "object" ? bean : fixtureBean;
  await seedSetup(page, { setup: "razzo-v5t", profiles: profile ? [profile] : undefined, bean: pickedBean });
  if (bean) await page.getByRole("button", { name: pickedBean.name }).click();
  await page.getByRole("button", { name: profile ? /E2E Profile/ : /Manual roast/ }).click();
  await page.getByRole("button", { name: feedDown || silent ? "Continue" : "Begin preheat" }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "START", exact: true }).click();
  return feed;
}

const dialLabelsOf = async (page) =>
  (await page.locator("div.grid.grid-cols-3.divide-x > button").locator("div:first-child").allInnerTexts())
    .map((l) => l.toLowerCase());

// <main> scrolls inside the fixed shell, and a click on a button that is partly under
// the nav makes Playwright scroll it. Every reading of where a control sits is taken
// at scrollTop 0, so two readings are comparable.
const mainToTop = (page) => page.locator("main").evaluate((el) => el.scrollTo(0, 0));
async function boxAtTop(page, name) {
  await mainToTop(page);
  return page.getByRole("button", { name }).boundingBox();
}

// The live instrument hero: the one overflow-hidden rounded section on the Roast tab.
const heroSection = (page) => page.locator("section.overflow-hidden.rounded-3xl");

// Where the run button (`runName`: PAUSE, or RESUME when paused) and the hero sit, both
// read at scrollTop 0. "Nothing under the thumb moved" is these two staying put: the run
// button is the thing the thumb is on, the hero's bottom edge is where everything below
// it (the timeline, SAVE ROAST) starts.
async function heroReading(page, runName) {
  const run = await boxAtTop(page, runName);
  const hero = await heroSection(page).boundingBox();
  return { run, hero, heroBottom: hero.y + hero.height };
}

// Every text node in a locator with the colour it is painted in -- so "muted" can be
// asserted as "the same ink as the label", without naming a class or a token.
const inkOf = (locator) =>
  locator.evaluate((root) => {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent.trim();
      if (text) out.push({ text, color: getComputedStyle(n.parentElement).color });
    }
    return out;
  });

test("live chart opens itself at START on a Razzo roast", async ({ page }) => {
  await startProbeRoast(page);
  // No tap on the Bean temp readout: the chart is simply there.
  await expect(liveChartSurface(page).first()).toBeVisible({ timeout: 5_000 });
  await expect(beanTempReadout(page)).toHaveAttribute("aria-expanded", "true");
  // The controls the taller hero pushes down still read Fan -> Heat -> Temp.
  expect(await dialLabelsOf(page)).toEqual(["fan", "heat", "temp"]);
});

test("live chart opens itself: a tap closes it and it stays closed", async ({ page }) => {
  test.setTimeout(90_000);
  await startProbeRoast(page);
  const readout = beanTempReadout(page);
  // It opened by itself (no tap yet) -- so the close below is the roaster's doing.
  await expect(readout).toHaveAttribute("aria-expanded", "true", { timeout: 5_000 });
  await expect(liveChartSurface(page).first()).toBeVisible();

  await readout.click();
  await expect(readout).toHaveAttribute("aria-expanded", "false");
  await expect(liveChartSurface(page)).toHaveCount(0);

  // Ten seconds of a roast that keeps running: nothing may re-open it. Sampled each
  // second rather than once, so an effect that re-fires on the clock tick is caught.
  const clock = async () => Number(await stored(page, "live_elapsedSeconds"));
  const before = await clock();
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    await expect(readout, `second ${i + 1} after the tap`).toHaveAttribute("aria-expanded", "false");
    await expect(liveChartSurface(page)).toHaveCount(0);
  }
  expect(await clock(), "the roast clock kept running").toBeGreaterThanOrEqual(before + 8);
});

test("live chart opens itself: a reload into a running Razzo roast re-opens it", async ({ page }) => {
  test.setTimeout(90_000);
  await startProbeRoast(page);
  await expect(page.getByText("00:03", { exact: true })).toBeVisible({ timeout: 10_000 });
  // Close it by hand first, so what comes back after the reload is the app's doing and
  // not a leftover: the choice not to look at the chart is for THIS page session only.
  await ensureLiveChartOpen(page);
  await beanTempReadout(page).click();
  await expect(beanTempReadout(page)).toHaveAttribute("aria-expanded", "false");
  await expect.poll(async () => (await stored(page, "live_roastLog")) || "").toContain("start_settings");

  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });
  // The same roast came back (paused at its clock, no Setup takeover)...
  await expect(page.getByTestId("roast-setup")).toHaveCount(0);
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  // ...and so did the chart, with no tap. The feed returns by itself.
  await expect(beanTempReadout(page)).toHaveAttribute("aria-expanded", "true", { timeout: 15_000 });
  await expect(liveChartSurface(page).first()).toBeVisible();
});

// The chart opens only when it can be drawn NOW and near START or the page load.
// Case's Razzo roast is sometimes started before the bridge app is up. The roast runs
// with the feed down; when the bridge joins, say 20 s in, the readout appears -- and
// the chart must NOT drop in, 260 px tall, on top of the Mark button under his thumb.
test("live chart opens itself: a bridge that joins late does not pop the chart in under the thumb", async ({ page }) => {
  test.setTimeout(90_000);
  const feed = await startProbeRoast(page, { feedDown: true });
  await expect(page.getByRole("button", { name: "PAUSE" })).toBeVisible();

  // The feed is down from START: the readout holds its slot as the muted "Feed lost" cue,
  // with nothing to draw and so nothing to toggle.
  const held = liveReadout(page);
  await expect.soft(held, "feed down from START: the readout holds its slot").toHaveAttribute("data-state", "feed-lost");
  await expect.soft(held, "nothing to draw yet, so nothing to toggle").toBeDisabled();
  await expect.soft(held).toHaveAttribute("aria-expanded", "false");

  // About 20 s in. This is the "before": where the thumb is resting.
  await expect(page.getByText("00:20", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(liveChartSurface(page)).toHaveCount(0);
  const before = await boxAtTop(page, "Mark Yellowing");

  feed.restoreBridge();
  // The bean temp arrives: the readout reads Bean temp (live), collapsed.
  const readout = beanTempReadout(page);
  await expect(readout).toBeVisible({ timeout: 15_000 });
  await expect(readout).toHaveAttribute("aria-expanded", "false");
  // ...and keeps its hands off: still collapsed a few seconds later (an effect that
  // opens it once the feed settles would land after the first look).
  for (let i = 0; i < 6; i++) {
    await expect(readout, `sample ${i} after the bridge joined`).toHaveAttribute("aria-expanded", "false");
    await expect(liveChartSurface(page), `chart, sample ${i} after the bridge joined`).toHaveCount(0);
    await page.waitForTimeout(500);
  }
  await expect.soft(liveReadout(page)).toHaveAttribute("data-state", "live");

  // Nothing under the thumb moved: the Mark button is where it was before the join.
  const after = await boxAtTop(page, "Mark Yellowing");
  expect(
    Math.abs(after.y - before.y),
    `Mark Yellowing top edge: ${before.y} before the bridge joined, ${after.y} after`
  ).toBeLessThanOrEqual(0.5);
});

// A reload after COOLING START. The roast is over bar SAVE ROAST; nothing about a
// finished roast wants a chart, and one dropping in when the feed returns a second later
// would push SAVE ROAST ~260 px down.
test("live chart opens itself: a reload after COOLING START does not open the chart", async ({ page }) => {
  test.setTimeout(90_000);
  await startProbeRoast(page);
  await expect(page.getByText("00:02", { exact: true })).toBeVisible({ timeout: 10_000 });
  for (const label of ["Yellowing", "First crack", "Cooling start"]) {
    await page.getByRole("button", { name: `Mark ${label}` }).click();
  }
  await expect(saveRoastButton(page)).toBeVisible();
  await expect.poll(async () => (await stored(page, "live_roastLog")) || "").toContain("COOLING START");

  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });
  // The finished roast came back, waiting to be saved...
  await expect(saveRoastButton(page)).toBeVisible();
  // ...and the feed returns by itself (Bean temp = the hook is live again).
  const readout = beanTempReadout(page);
  await expect(readout).toBeVisible({ timeout: 15_000 });
  // The chart did not open, and does not open a moment later either.
  for (let i = 0; i < 6; i++) {
    await expect(readout, `sample ${i} after the feed returned`).toHaveAttribute("aria-expanded", "false");
    await expect(liveChartSurface(page), `chart, sample ${i} after the feed returned`).toHaveCount(0);
    await page.waitForTimeout(500);
  }
});

// The auto-open is per ROAST. A close sticks for the rest of THAT roast (through its
// marks and the drop), and the next roast, in the same page session, opens it again. The
// roaster who closes the chart on roast 1 must not have to tap on every roast after it.
test("live chart opens itself: it opens again for the next roast after a close on the last one", async ({ page }) => {
  test.setTimeout(120_000);
  await startProbeRoast(page, { profile: singleStepProfile });
  const readout = beanTempReadout(page);
  // Roast 1 opens itself (the precondition: the close below is the roaster's).
  await expect(readout).toHaveAttribute("aria-expanded", "true", { timeout: 5_000 });
  await expect(page.getByText("00:02", { exact: true })).toBeVisible({ timeout: 10_000 });
  await readout.click();
  await expect(readout).toHaveAttribute("aria-expanded", "false");

  // It stays closed for the rest of roast 1: after each mark, through the drop.
  for (const label of ["Yellowing", "First crack", "Cooling start"]) {
    await page.getByRole("button", { name: `Mark ${label}` }).click();
    await page.waitForTimeout(700);
    await expect(readout, `after Mark ${label}`).toHaveAttribute("aria-expanded", "false");
    await expect(liveChartSurface(page), `chart after Mark ${label}`).toHaveCount(0);
  }
  await saveRoastButton(page).click();
  await skipDropWeight(page);
  await expect(page.getByTestId("roast-setup")).toBeVisible({ timeout: 10_000 });
  expect(await roastCount(page)).toBe(2); // the fixture roast and roast 1

  // Roast 2, same page session: no reload in between.
  await page.getByRole("button", { name: /E2E Profile/ }).click();
  await page.getByRole("button", { name: "Begin preheat" }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "START", exact: true }).click();
  await expect(page.getByRole("button", { name: "PAUSE" })).toBeVisible();
  await expect(readout).toHaveAttribute("aria-expanded", "true", { timeout: 5_000 });
  await expect(liveChartSurface(page).first()).toBeVisible();
});

for (const setup of ["oem-tube", "sr540"]) {
  test(`live chart opens itself: ${setup} roast has no chart and no Bean temp readout`, async ({ page }) => {
    // A bridge IS on the channel and publishing -- the probe-less setup must ignore it.
    await mockRoastLinkFeed(page);
    await seedSetup(page, { setup });
    // A bridge on the channel makes the app GUESS the Razzo, unless the setup was picked
    // by hand ("the app may guess; it does not argue"). Pick it, as a roaster who knows
    // their roaster has no probe would, so the roast really is on a probe-less setup.
    await page.getByLabel("Roaster Setup").selectOption(setup);
    await expect(page.getByLabel("Roaster Setup")).toHaveValue(setup);
    await page.getByRole("button", { name: /Manual roast/ }).click();
    await page.getByRole("button", { name: "Start roast" }).click();
    await expect(page.getByRole("button", { name: "PAUSE" })).toBeVisible();
    // Past a few samples (the mock publishes every 500 ms), so "no chart" is not just "too early".
    await expect(page.getByText("00:04", { exact: true })).toBeVisible({ timeout: 10_000 });

    await expect(liveChartSurface(page)).toHaveCount(0);
    await expect(page.getByText("Live curve", { exact: true })).toHaveCount(0);
    await expect(beanTempReadout(page)).toHaveCount(0);
    await expect(liveReadout(page)).toHaveCount(0);

    // Control: the absence above is the setup's doing, not a feed that never connected.
    // Settings' bridge card reads the ungated signal, and it says Live.
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByText("Receiving bean temp from the RoastLink.")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Roast", exact: true }).click();
    await expect(page.getByRole("button", { name: "PAUSE" })).toBeVisible();
    await expect(liveChartSurface(page)).toHaveCount(0);
    await expect(beanTempReadout(page)).toHaveCount(0);
    await expect(liveReadout(page)).toHaveCount(0);
  });
}

// The feed dies mid-roast (the bridge app quits). The chart stays mounted with the
// curve it has, and the readout does NOT vanish: its slot is the probe's from START to
// SAVE ROAST, and it says what the feed is doing. "Feed lost" is muted (no number
// outlives its data, no error red: the roast is fine, only the feed is not), and it is
// the same height as the live readout, so no control under the thumb moves.
test("live chart opens itself: the chart stays mounted when the feed drops mid-roast, and the readout says Feed lost", async ({ page }) => {
  test.setTimeout(90_000);
  const feed = await startProbeRoast(page);
  await expect(page.getByText("00:05", { exact: true })).toBeVisible({ timeout: 10_000 });
  // Open it however it opens (by itself, or by a tap on a build that does not yet),
  // so this test is about what happens when the feed goes, not about getting it open.
  await ensureLiveChartOpen(page);
  await expect(liveChartSurface(page).first()).toBeVisible();
  expect((await liveTempSubpaths(page)).length, "a Temp line is drawn before the drop").toBeGreaterThan(0);

  // The live look, for comparison: the label and the value are not the same ink.
  const liveInk = await inkOf(beanTempReadout(page));
  const liveLabel = liveInk.find((t) => t.text === "Bean temp");
  const liveValue = liveInk.find((t) => /^\d+$/.test(t.text));
  expect(liveLabel && liveValue, `live readout texts: ${JSON.stringify(liveInk)}`).toBeTruthy();
  expect(liveValue.color, "live: the value is not painted in the muted ink").not.toBe(liveLabel.color);
  const liveHeight = (await beanTempReadout(page).boundingBox()).height;
  const before = await boxAtTop(page, "Mark Yellowing");

  // The bridge app quits. The hook reads "no-bridge" once the last sample is STALE_MS old.
  feed.dropBridge();
  const readout = liveReadout(page);
  await expect(readout).toHaveAttribute("data-state", "feed-lost", { timeout: 15_000 });
  await expect(readout).toContainText("Feed lost");
  await expect(readout).not.toContainText("Bean temp");
  await expect(readout, "the chart is still up, so the readout reports it open").toHaveAttribute("aria-expanded", "true");

  // Muted: no number, and every dash is painted in the label's own ink (not the Temp
  // colour, not the RoR colour, not error red).
  const ink = await inkOf(readout);
  const label = ink.find((t) => t.text === "Feed lost");
  const dashes = ink.filter((t) => t.text === "--");
  expect(dashes.length, `a dash for the value and one for the RoR; texts: ${JSON.stringify(ink)}`).toBe(2);
  expect(ink.some((t) => /^[+-]?\d/.test(t.text)), `no frozen reading survives; texts: ${JSON.stringify(ink)}`).toBe(false);
  for (const d of dashes) expect(d.color, "a stopped measurement is painted in the label's muted ink").toBe(label.color);

  // Nothing under the thumb moved: same readout height, same Mark Yellowing top edge.
  expect(Math.abs((await readout.boundingBox()).height - liveHeight), "readout height, live vs feed lost").toBeLessThanOrEqual(0.5);
  const after = await boxAtTop(page, "Mark Yellowing");
  expect(
    Math.abs(after.y - before.y),
    `Mark Yellowing top edge: ${before.y} while the feed was live, ${after.y} with the feed lost`
  ).toBeLessThanOrEqual(0.5);

  // The roast is still under way and the curve is still the roaster's: the chart
  // stays, and keeps its Temp line, rather than blinking out for a feed that may
  // be back in a moment.
  for (let i = 0; i < 6; i++) {
    await expect(liveChartSurface(page).first(), `chart, sample ${i} after the feed dropped`).toBeVisible();
    expect((await liveTempSubpaths(page)).length, `Temp line, sample ${i}`).toBeGreaterThan(0);
    await page.waitForTimeout(500);
  }
});

// With the feed lost the chart is held open, so the roaster needs a way to close it by
// hand (to bring Mark First crack out from under the nav, say) and to bring it back.
test("live chart opens itself: with the feed lost, a tap on the readout closes the chart and a second tap brings it back", async ({ page }) => {
  test.setTimeout(90_000);
  const feed = await startProbeRoast(page);
  await expect(page.getByText("00:05", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(beanTempReadout(page)).toHaveAttribute("aria-expanded", "true", { timeout: 5_000 });
  await expect(liveChartSurface(page).first()).toBeVisible();

  feed.dropBridge();
  const readout = liveReadout(page);
  await expect(readout).toHaveAttribute("data-state", "feed-lost", { timeout: 15_000 });
  await expect(readout).toBeEnabled(); // there is a curve to draw, so there is something to toggle

  await readout.click();
  await expect(readout).toHaveAttribute("aria-expanded", "false");
  await expect(liveChartSurface(page)).toHaveCount(0);
  // The cue is still there with the chart closed, and a second look a moment later agrees.
  await page.waitForTimeout(1500);
  await expect(readout).toHaveAttribute("data-state", "feed-lost");
  await expect(readout).toHaveAttribute("aria-expanded", "false");
  await expect(liveChartSurface(page)).toHaveCount(0);

  await readout.click();
  await expect(readout).toHaveAttribute("aria-expanded", "true");
  await expect(liveChartSurface(page).first()).toBeVisible();
  expect((await liveTempSubpaths(page)).length, "the curve the roast already has comes back with it").toBeGreaterThan(0);
});

// A reload leaves the hook in "connecting" for a few seconds (the page has not heard
// from the channel yet). The feed here never answers at all -- no presence and, with the
// bridge dropped before the load, no sample either -- so the hook cannot leave
// "connecting" however long the test looks. (announce:false alone is not enough: any
// sample flips the hook to "live" without presence.) The roast is mid-way, with a curve.
// "Connecting" has a CEILING, though: a feed that has not answered for about 15 s (the same
// AUTO_OPEN_WINDOW_MS that bounds the auto-open; one rule, not a setting) is not coming
// for a moment, and a label that keeps promising it would be a lie -- offline reload, or a
// Realtime that refused the subscribe, and the hook has no error state. Past it the readout
// takes the feed-lost look and NOTHING ELSE changes: the chart stays, the toggle's state
// stays, no row moves.
test("live chart opens itself: a reload keeps the chart up while the feed is still connecting", async ({ page }) => {
  test.setTimeout(90_000);
  const feed = await mockRoastLinkFeed(page, { announce: false });
  feed.dropBridge(); // no samples, for the reload below and every socket after it
  await page.evaluate(() => {
    window.localStorage.setItem("roastlogs_equipment", "razzo-v5t");
    window.localStorage.setItem("live_curve", JSON.stringify(Array.from({ length: 130 }, (_, t) => ({ t, bt: 200 + t }))));
  });
  await reloadMidRoast(page);
  const loadedAt = Date.now(); // the app mounted a moment (1-3 s) before this, so the page is a little older than this clock says
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();

  // The roast has a curve and it is on screen -- in "connecting", where only the
  // under-way rule keeps it mounted (the plain live/bridge-only rule would not).
  await expect(liveChartSurface(page).first()).toBeVisible({ timeout: 5_000 });
  expect((await liveTempSubpaths(page)).length, "the stored curve is drawn").toBeGreaterThan(0);

  // The hook is still connecting, at the moment the chart is seen and for the next ~3 s
  // (past the point where a sample, 500 ms apart, would have flipped it): not live and
  // not bridge-only, so no "Bean temp" and no "No signal" -- and the chart stays up.
  for (let i = 0; i < 6; i++) {
    await expect(beanTempReadout(page), `Bean temp readout, check ${i}`).toHaveCount(0);
    await expect(page.getByText("No signal", { exact: true }), `No signal, check ${i}`).toHaveCount(0);
    await expect(liveChartSurface(page).first(), `chart, check ${i}`).toBeVisible();
    await page.waitForTimeout(500);
  }
  // The readout does not vanish while it waits: it says Connecting, muted, in its own slot.
  const readout = liveReadout(page);
  await expect(readout).toHaveAttribute("data-state", "connecting");
  await expect(readout).toContainText("Connecting");
  await expect(readout, "the chart is up, so the readout reports it open").toHaveAttribute("aria-expanded", "true");

  // ...and the ceiling. Where everything stands while it is still Connecting: the readout's
  // height, the run button (RESUME: a reload comes back paused) and the hero's edges.
  const connecting = {
    readoutHeight: (await readout.boundingBox()).height,
    ...(await heroReading(page, "RESUME")),
  };

  // Not at once: ten seconds in it is still Connecting (a cold iOS reload takes a few seconds
  // to resubscribe, and a ceiling that short would flash a false alarm on every reload).
  await page.waitForTimeout(Math.max(0, loadedAt + 10_000 - Date.now()));
  await expect(readout, "10 s after the load it is still Connecting").toHaveAttribute("data-state", "connecting");

  // Then, with the feed still not heard from, the feed-lost look: about 15 s after the load.
  await expect(readout, "about 15 s after the load, with no answer, Connecting becomes Feed lost")
    .toHaveAttribute("data-state", "feed-lost", { timeout: 20_000 });
  const flippedAfter = Date.now() - loadedAt;
  expect(flippedAfter, "the ceiling is about 15 s, not sooner").toBeGreaterThanOrEqual(12_000);
  await expect(readout).toContainText("Feed lost");
  await expect(readout).not.toContainText("Connecting");
  await expect(readout, "the chart is still up, so the readout still reports it open").toHaveAttribute("aria-expanded", "true");
  await expect(liveChartSurface(page).first(), "the chart stayed").toBeVisible();
  expect((await liveTempSubpaths(page)).length, "the stored curve is still drawn").toBeGreaterThan(0);

  // No layout change: same readout height, same run button, same hero.
  const lost = await heroReading(page, "RESUME");
  expect.soft(Math.abs((await readout.boundingBox()).height - connecting.readoutHeight), "readout height, Connecting vs Feed lost").toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(lost.run.y - connecting.run.y), `RESUME top edge: ${connecting.run.y} while Connecting, ${lost.run.y} as Feed lost`).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(lost.hero.y - connecting.hero.y), "hero top edge").toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(lost.hero.height - connecting.hero.height), `hero height: ${connecting.hero.height} while Connecting, ${lost.hero.height} as Feed lost`).toBeLessThanOrEqual(0.5);
});

// Phone geometry. The open chart makes the hero taller for the WHOLE roast, so the
// buttons a thumb needs -- Mark Yellowing, then Mark First crack, and PAUSE beside them --
// must still be reachable. "Reachable" is: fully on screen without scrolling, i.e. inside
// <main>'s own window, which ends where the bottom nav begins. The only sticky thing in
// the thumb zone is the round Adjustment Log button, and it opens the dial editor: it
// cannot mark a phase, so it is no way round a button that is off screen.
//
// The layout is decided at design time and is the same for the whole roast (RL-039): what
// comes and goes (the Next step strip) sits BELOW the run controls, and the bean's name is
// shown once (the setup bar above the hero), so the controls do not depend on either.
//
// Every reading is taken at scrollTop 0, and the soft expectations list EVERY button that
// is out of the window in one run: a click on a button that is partly under the nav makes
// Playwright scroll <main>, which would otherwise move the next button's reading.
async function expectOnScreen(page, name) {
  await mainToTop(page);
  const button = page.getByRole("button", { name });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  const area = await page.locator("main").boundingBox();
  const navTop = (await page.locator("nav").last().boundingBox()).y;
  const top = area.y;
  const bottom = Math.min(area.y + area.height, navTop);
  expect.soft(box.y, `${name}: top edge ${box.y} inside the window that starts at ${top}`).toBeGreaterThanOrEqual(top - 1);
  expect.soft(box.y + box.height, `${name}: bottom edge ${box.y + box.height} above where the window ends (${bottom})`).toBeLessThanOrEqual(bottom + 1);
  // Reachable by moving the layout, not by shrinking the target: the buttons are 52.5 px
  // tall, and a fit bought by making them smaller is not a fix.
  expect.soft(box.height, `${name}: tap target is ${box.height} px tall`).toBeGreaterThanOrEqual(52);
}

async function markYellowingThenFirstCrackOnScreen(page) {
  await ensureLiveChartOpen(page);
  await expect(liveChartSurface(page).first()).toBeVisible();
  await expect(page.getByText("00:02", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expectOnScreen(page, "Mark Yellowing");
  await expectOnScreen(page, "PAUSE");
  await page.getByRole("button", { name: "Mark Yellowing" }).click();
  // The button FIRST crack is marked with, the one a thumb must not have to hunt for.
  await expectOnScreen(page, "Mark First crack");
  await expectOnScreen(page, "PAUSE");
}

test("live chart opens itself: at 390x844 the next-phase button is still reachable with the chart open", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone", "phone geometry: only the iphone project is 390x844 with touch");
  test.setTimeout(90_000);
  await startProbeRoast(page);
  await markYellowingThenFirstCrackOnScreen(page);
  expect(await dialLabelsOf(page)).toEqual(["fan", "heat", "temp"]);
});

// Following a profile adds the "Next step" strip (and, when the ghost cannot draw, a
// caption row in the chart header), and that is what Case roasts with, with a bean picked
// in Setup. Measured on the layout before the strip moved below the run controls (chart
// open, bean picked, main at scrollTop 0, window ends at 762): ghost drawn, Mark Yellowing
// and PAUSE bottom 795.75 (34 px under the nav); ghost caption showing, 812.75. Both
// variants run, because the caption is 17 px taller.
const profileRoastVariants = [
  { name: "ghost drawn", roasts: [fixtureRoast, sourceWithCurve], caption: false },
  { name: "ghost caption", roasts: [fixtureRoast], caption: true },
];

// `bean` is what startProbeRoast takes: `true` for the fixture bean, or an inventory bean of
// its own (a name that wraps, say).
async function startProfileRoast(page, variant, bean = true) {
  await startProbeRoast(page, { profile: fixtureGhostProfile, roasts: variant.roasts, bean });
  await ensureLiveChartOpen(page);
  await expect(liveChartSurface(page).first()).toBeVisible();
  if (variant.caption) {
    await expect(ghostCaption(page)).toBeVisible();
  } else {
    await expect.poll(() => ghostLength(page), { timeout: 15_000 }).toBeGreaterThan(100);
    await expect(ghostCaption(page)).toHaveCount(0);
  }
}

for (const variant of profileRoastVariants) {
  test(`live chart opens itself: at 390x844 the next-phase button is still reachable with the chart open, following a profile (${variant.name})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone", "phone geometry: only the iphone project is 390x844 with touch");
    test.setTimeout(90_000);
    await startProfileRoast(page, variant);
    await markYellowingThenFirstCrackOnScreen(page);
    expect(await dialLabelsOf(page)).toEqual(["fan", "heat", "temp"]);
  });

  // The strip is reference, so it sits BELOW the run controls: nothing that comes and goes
  // (it leaves on PAUSE and when the last planned step passes) may sit above a control.
  test(`live chart opens itself: the Next step strip sits below the run controls (${variant.name})`, async ({ page }) => {
    test.setTimeout(90_000);
    await startProfileRoast(page, variant);
    await expect(page.getByText("00:02", { exact: true })).toBeVisible({ timeout: 10_000 });
    const strip = page.getByText("Next step", { exact: true }).locator("xpath=..");
    await expect(strip).toBeVisible();
    await mainToTop(page);
    const mark = await page.getByRole("button", { name: "Mark Yellowing" }).boundingBox();
    const pause = await page.getByRole("button", { name: "PAUSE" }).boundingBox();
    const s = await strip.boundingBox();
    const controlsBottom = Math.max(mark.y + mark.height, pause.y + pause.height);
    expect(s.y, `Next step strip top edge ${s.y} below the run controls' bottom edge ${controlsBottom}`).toBeGreaterThanOrEqual(controlsBottom - 0.5);
  });
}

// RL-039: PAUSE swaps itself for RESUME in the same spot, and the thumb that tapped it is
// still on it. With the Next step strip above the controls, PAUSE unmounted the strip and
// RESUME jumped 56 px up under the thumb (measured 743.25 -> 687.25). Below the controls
// it cannot.
test("live chart opens itself: PAUSE then RESUME keeps the run button where the thumb was", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone", "phone geometry: only the iphone project is 390x844 with touch");
  test.setTimeout(90_000);
  await startProfileRoast(page, profileRoastVariants[0]);
  await expect(page.getByText("00:02", { exact: true })).toBeVisible({ timeout: 10_000 });
  const running = await boxAtTop(page, "PAUSE");
  await page.getByRole("button", { name: "PAUSE" }).click();
  await expect(page.getByRole("button", { name: "RESUME" })).toBeVisible();
  const paused = await boxAtTop(page, "RESUME");
  expect(
    Math.abs(paused.y - running.y),
    `the run button's top edge: ${running.y} as PAUSE, ${paused.y} as RESUME`
  ).toBeLessThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// RL-063, last fix round. Six more things the chart's auto-open has to get right, each
// with a failing-first test. The thread through all of them is RL-039: whatever is under
// the thumb at the moment a thing happens must not move.
//
//   D6  a hold may only end at a stage change, never at a tap. The readout's slot and
//       the chart stay from START until SAVE ROAST / DISCARD -- not until COOLING START --
//       so the tap on "Mark Cooling start" does not collapse ~170 px of hero when the
//       feed is already down. COOLING START keeps meaning "stop" only for recording and
//       for the auto-open.
//   D7  a chart the FEED took away is not brought back by the feed: the readout returns
//       collapsed, and the roaster taps it when ready.
//   D9  the held readout is legible in both themes.
//   D10 the bean's name is shown ONCE (the setup bar above the hero), so the controls
//       below do not depend on how long the name is.
//   D11 the next roast starts with no chart even when the last one ended with it open.
// ---------------------------------------------------------------------------

// D6. The feed is already down when the roaster marks Yellowing, First crack and Cooling
// start. Each tap is made with the thumb on the Mark button; the last one used to unmount
// the chart and the readout (the hold ended at COOLING START), which pulled the run row and
// SAVE ROAST ~170 px up as the thumb lifted. Now the hero is the same size before and
// after the tap, and the chart and the readout are still there.
test("live chart opens itself: with the feed lost, marking through COOLING START keeps the chart and the readout, and the run row does not move", async ({ page }) => {
  test.setTimeout(90_000);
  const feed = await startProbeRoast(page);
  await expect(page.getByText("00:05", { exact: true })).toBeVisible({ timeout: 10_000 });
  await ensureLiveChartOpen(page);
  await expect(liveChartSurface(page).first()).toBeVisible();

  feed.dropBridge();
  const readout = liveReadout(page);
  await expect(readout).toHaveAttribute("data-state", "feed-lost", { timeout: 15_000 });
  await expect(readout, "the chart is up, so the readout reports it open").toHaveAttribute("aria-expanded", "true");

  // Where the run button sits with the feed lost, before any mark.
  const start = await heroReading(page, "PAUSE");

  // The first two marks: the run button stays, the chart and the cue stay.
  for (const label of ["Yellowing", "First crack"]) {
    await page.getByRole("button", { name: `Mark ${label}` }).click();
    await expect.soft(liveChartSurface(page).first(), `chart after Mark ${label}`).toBeVisible();
    await expect.soft(readout, `readout after Mark ${label}`).toHaveAttribute("data-state", "feed-lost");
    const now = await heroReading(page, "PAUSE");
    expect.soft(Math.abs(now.run.y - start.run.y), `PAUSE top edge after Mark ${label}: ${start.run.y} -> ${now.run.y}`).toBeLessThanOrEqual(0.5);
  }

  // The controls still read Fan -> Heat -> Temp, with the feed gone and the chart up.
  expect(await dialLabelsOf(page)).toEqual(["fan", "heat", "temp"]);

  // The tap that matters. PAUSE is about to become RESUME in the same place.
  const before = await heroReading(page, "PAUSE");
  await page.getByRole("button", { name: "Mark Cooling start" }).click();
  await expect(page.getByRole("button", { name: "RESUME" })).toBeVisible();
  await expect(saveRoastButton(page)).toBeVisible();
  const after = await heroReading(page, "RESUME");

  // Still mounted: the chart (with the curve it has) and the readout, still saying Feed lost.
  // (Soft, so a failure here still reports how far everything moved, below.)
  await expect.soft(liveChartSurface(page).first(), "the chart is still up after Mark Cooling start").toBeVisible();
  expect.soft((await liveTempSubpaths(page)).length, "the curve is still drawn").toBeGreaterThan(0);
  await expect.soft(readout, "the readout is still in its slot after Mark Cooling start").toHaveCount(1);
  await expect.soft(readout).toHaveAttribute("data-state", "feed-lost");
  await expect.soft(readout, "and still reports the chart open").toHaveAttribute("aria-expanded", "true");

  // Nothing under the thumb moved: the run button is where PAUSE was, and the hero ends
  // where it did, so everything below it (the timeline, SAVE ROAST) is where it was.
  // The run button's top edge is exact. The hero's bottom edge is exact to 2 px, not to
  // 0.5: PAUSE has a 1 px border and the ember RESUME that replaces it does not, so the
  // row is 2 px shorter by itself (measured 52.5 -> 50.5, with or without a chart). That is
  // not this item's; the collapse it is here to catch is ~170 px.
  const RESUME_HAS_NO_BORDER = 2;
  expect.soft(Math.abs(after.run.y - before.run.y), `run button top edge: ${before.run.y} as PAUSE, ${after.run.y} as RESUME`).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(after.heroBottom - before.heroBottom), `hero bottom edge: ${before.heroBottom} before the tap, ${after.heroBottom} after`).toBeLessThanOrEqual(RESUME_HAS_NO_BORDER + 0.5);
  expect.soft(Math.abs(after.hero.height - before.hero.height), `hero height: ${before.hero.height} before, ${after.hero.height} after`).toBeLessThanOrEqual(RESUME_HAS_NO_BORDER + 0.5);

  // And it stays put: neither the chart nor SAVE ROAST drifts while the feed is still down.
  // (One line per KIND of problem, the first time it is seen, not one per check.)
  await mainToTop(page);
  const save0 = await saveRoastButton(page).boundingBox();
  const drifted = {};
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    if ((await liveChartSurface(page).count()) === 0) drifted.chart ??= `check ${i} after the tap: the chart is gone`;
    await mainToTop(page);
    const save = await saveRoastButton(page).boundingBox();
    if (Math.abs(save.y - save0.y) > 0.5) drifted.save ??= `check ${i}: SAVE ROAST top edge ${save0.y} -> ${save.y}`;
  }
  expect.soft(Object.values(drifted), "nothing drifted in the 3 s after the tap").toEqual([]);
});

// D6, the reload half. A reload after COOLING START with the feed not yet back: the chart
// is not auto-opened (nothing about a finished roast wants it), but the readout's slot is
// still the probe's, so when the feed answers a moment later the chrono does not change
// size and SAVE ROAST does not move. (Before: the slot was released at COOLING START, the
// chrono was 60 px while the feed was away and 46 px when it answered -- SAVE ROAST
// jumped ~14 px up about a second after the reload.)
test("live chart opens itself: a reload after COOLING START, then the feed answering, does not move SAVE ROAST", async ({ page }) => {
  test.setTimeout(90_000);
  const feed = await startProbeRoast(page);
  await expect(page.getByText("00:02", { exact: true })).toBeVisible({ timeout: 10_000 });
  for (const label of ["Yellowing", "First crack", "Cooling start"]) {
    await page.getByRole("button", { name: `Mark ${label}` }).click();
  }
  await expect(saveRoastButton(page)).toBeVisible();
  await expect.poll(async () => (await stored(page, "live_roastLog")) || "").toContain("COOLING START");

  // The bridge app is away for the reload (a new socket sees nobody on the channel).
  feed.dropBridge();
  await page.reload();
  await expect(page.getByRole("button", { name: "History" })).toBeVisible({ timeout: 15_000 });
  await expect(saveRoastButton(page)).toBeVisible();
  await expect(liveChartSurface(page)).toHaveCount(0);
  // Wait for the hook to settle into "no bridge" so the "before" reading is the lost look.
  await page.waitForTimeout(2500);
  await mainToTop(page);
  const lost = await saveRoastButton(page).boundingBox();
  const lostHero = await heroSection(page).boundingBox();

  feed.restoreBridge();
  await expect(beanTempReadout(page)).toBeVisible({ timeout: 15_000 });
  await mainToTop(page);
  const live = await saveRoastButton(page).boundingBox();
  const liveHero = await heroSection(page).boundingBox();

  expect.soft(Math.abs(live.y - lost.y), `SAVE ROAST top edge: ${lost.y} with the feed away, ${live.y} once it answered`).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(liveHero.height - lostHero.height), `hero height: ${lostHero.height} with the feed away, ${liveHero.height} once it answered`).toBeLessThanOrEqual(0.5);
  // The chart still did not open, and does not a moment later either.
  for (let i = 0; i < 4; i++) {
    await expect(liveChartSurface(page), `chart, check ${i} after the feed answered`).toHaveCount(0);
    await page.waitForTimeout(500);
  }
});

// D7, path A. The feed is lost, the roaster marks through COOLING START, and THEN the
// bridge app comes back (it was restarted for the next roast, say). Nothing may appear or
// move for it: the chart that was held stays as it was, and a chart that was not there
// does not drop in over SAVE ROAST. Whichever the build does with the chart at COOLING
// START, the feed's return changes nothing on screen.
test("live chart opens itself: a feed that comes back after COOLING START moves nothing", async ({ page }) => {
  test.setTimeout(90_000);
  const feed = await startProbeRoast(page);
  await expect(page.getByText("00:05", { exact: true })).toBeVisible({ timeout: 10_000 });
  await ensureLiveChartOpen(page);
  await expect(liveChartSurface(page).first()).toBeVisible();
  feed.dropBridge();
  await expect(liveReadout(page)).toHaveAttribute("data-state", "feed-lost", { timeout: 15_000 });
  for (const label of ["Yellowing", "First crack", "Cooling start"]) {
    await page.getByRole("button", { name: `Mark ${label}` }).click();
  }
  await expect(saveRoastButton(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "RESUME" })).toBeVisible();

  const before = await heroReading(page, "RESUME");
  const chartsBefore = await liveChartSurface(page).count();
  await mainToTop(page);
  const saveBefore = await saveRoastButton(page).boundingBox();

  feed.restoreBridge();
  // ~4 s of a returned feed (a sample every 500 ms): the first look and the later ones.
  // One line per KIND of problem, the first time it is seen, not one per check.
  const moved = {};
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    const charts = await liveChartSurface(page).count();
    if (charts !== chartsBefore) moved.chart ??= `check ${i} after the bridge came back: ${charts} chart surfaces (${chartsBefore} before)`;
    const now = await heroReading(page, "RESUME");
    if (Math.abs(now.run.y - before.run.y) > 0.5) moved.run ??= `check ${i}: RESUME top edge ${before.run.y} -> ${now.run.y}`;
    if (Math.abs(now.heroBottom - before.heroBottom) > 0.5) moved.hero ??= `check ${i}: hero bottom edge ${before.heroBottom} -> ${now.heroBottom}`;
    await mainToTop(page);
    const save = await saveRoastButton(page).boundingBox();
    if (Math.abs(save.y - saveBefore.y) > 0.5) moved.save ??= `check ${i}: SAVE ROAST top edge ${saveBefore.y} -> ${save.y}`;
  }
  expect(Object.values(moved), "the feed coming back moved nothing").toEqual([]);
});

// D7, path B. START while the bridge is up but the device is silent (it publishes no
// usable bean temp: the hook reads bridge-only, "No signal"). The chart can be drawn, so it
// opens at START -- empty. Then the bridge app quits before a single sample lands: the roast
// has no curve and no signal, so the FEED takes the chart away. When the bridge comes back,
// say 20 s in, the feed must not bring the chart back with it: the readout returns collapsed
// ("Bean temp"), Mark Yellowing does not move, and the roaster taps the readout when ready.
test("live chart opens itself: a chart the feed took away is not brought back by the feed", async ({ page }) => {
  test.setTimeout(90_000);
  const feed = await startProbeRoast(page, { silent: true, feedOptions: { bt: () => NaN } });
  const readout = liveReadout(page);

  // The setup: a bridge with no usable sample -- bridge-only, and the chart opened at START.
  await expect(readout).toHaveAttribute("data-state", "no-signal", { timeout: 10_000 });
  await expect(readout, "the chart opened by itself at START (it can be drawn: bridge-only)").toHaveAttribute("aria-expanded", "true", { timeout: 5_000 });
  await expect(liveChartSurface(page).first()).toBeVisible();

  // The bridge app quits before a sample: no signal and no curve. The feed takes the chart.
  feed.dropBridge();
  await expect(readout).toHaveAttribute("data-state", "feed-lost", { timeout: 15_000 });
  await expect(liveChartSurface(page), "nothing to draw and no signal: the chart is gone").toHaveCount(0);
  await expect(readout).toHaveAttribute("aria-expanded", "false");
  await expect(readout, "nothing to draw, so nothing to toggle").toBeDisabled();

  // About 20 s in. This is the "before": where the thumb is resting.
  await expect(page.getByText("00:20", { exact: true })).toBeVisible({ timeout: 30_000 });
  const before = await heroReading(page, "PAUSE");

  // The bridge app comes back, with a device that now reads.
  feed.set(250);
  feed.restoreBridge();
  await expect(readout).toHaveAttribute("data-state", "live", { timeout: 15_000 });
  for (let i = 0; i < 8; i++) {
    await expect(readout, `readout, check ${i} after the feed came back`).toHaveAttribute("aria-expanded", "false");
    await expect(liveChartSurface(page), `chart, check ${i} after the feed came back`).toHaveCount(0);
    await page.waitForTimeout(500);
  }
  const after = await heroReading(page, "PAUSE");
  expect.soft(Math.abs(after.run.y - before.run.y), `PAUSE top edge: ${before.run.y} before the feed came back, ${after.run.y} after`).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(after.heroBottom - before.heroBottom), `hero bottom edge: ${before.heroBottom} before, ${after.heroBottom} after`).toBeLessThanOrEqual(0.5);

  // The roaster can still open it when ready, and it has the readings that arrived.
  await readout.click();
  await expect(readout).toHaveAttribute("aria-expanded", "true");
  await expect(liveChartSurface(page).first()).toBeVisible();
});

// D9. The held look is quiet by design: no error red, no number, the label and the dashes
// all in the muted ink. Quiet must not mean illegible. WCAG, on the real stack of layers
// under the text (paintedInk): the 9 px label and the 12 px RoR dash need 4.5:1, the 34 px
// dash is large text and needs 3:1. Light is the thin one (the muted ink clears 4.5:1 there
// by well under 0.5), so one edit to the light --text-muted would fail silently without
// this. The held-vs-live cue does NOT lean on colour (muted vs ember is ~1.2:1): it is the
// dashes and the still dot, which is asserted elsewhere.
for (const theme of ["dark", "light"]) {
  test(`live chart opens itself: ${theme} theme held readout contrast`, async ({ page }) => {
    test.setTimeout(90_000);
    // An init script, so the theme is in place for every load startProbeRoast makes.
    await page.addInitScript((t) => window.localStorage.setItem("roastlogs_theme", t), theme);
    const feed = await startProbeRoast(page);
    await expect(page.getByText("00:03", { exact: true })).toBeVisible({ timeout: 10_000 });
    feed.dropBridge();
    const readout = liveReadout(page);
    await expect(readout).toHaveAttribute("data-state", "feed-lost", { timeout: 15_000 });

    const label = await paintedInk(readout.getByText("Feed lost", { exact: true }));
    const value = await paintedInk(readout.getByText(/^--\s*°F$/));
    const ror = await paintedInk(readout.getByText(/^--\s*°\/min$/));

    expect(label.dataTheme, "the theme under test is actually applied").toBe(theme);
    for (const [name, ink] of [["label", label], ["value dash", value], ["RoR dash", ror]]) {
      expect(ink.fg, `${name} resolves to --text-muted`).toEqual(ink.muted);
      expect(ink.fg, `${name} is muted, not the error colour`).not.toEqual(ink.error);
    }
    // The bars. The value dash is large text only because it really is large.
    expect(value.size, "the value dash is large text (34 px), which is what makes 3:1 the bar").toBeGreaterThanOrEqual(24);
    expect(label.ratio, `Feed lost label ${label.size}px: contrast ${label.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    expect(ror.ratio, `RoR dash ${ror.size}px: contrast ${ror.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    expect(value.ratio, `value dash ${value.size}px: contrast ${value.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });
}

// D10. E2: the bean's name is shown ONCE, in the setup summary bar right above the hero.
// A second copy in the hero's chrono cluster (two or three lines when the name wraps) made
// the controls below it depend on the bean: a two-line name put Mark Yellowing under the
// nav. Pin it directly, since the geometry tests only fail when the name is long.
test("live chart opens itself: the bean's name is shown once, above the hero, not in it", async ({ page }) => {
  test.setTimeout(90_000);
  await startProbeRoast(page, { bean: true });
  await ensureLiveChartOpen(page);
  await expect(liveChartSurface(page).first()).toBeVisible();
  await expect(page.getByText("00:02", { exact: true })).toBeVisible({ timeout: 10_000 });

  const hero = heroSection(page);
  await expect(hero).toBeVisible();
  await expect(hero, "the live hero does not repeat the bean's name").not.toContainText(fixtureBean.name);
  // Control: the name is on the Roast tab exactly once -- in the setup bar, above the hero.
  const name = page.getByText(fixtureBean.name, { exact: true });
  await expect(name, "the name is shown, once").toHaveCount(1);
  await mainToTop(page);
  const n = await name.boundingBox();
  const h = await hero.boundingBox();
  expect(n.y + n.height, `the name (bottom ${n.y + n.height}) sits above the hero (top ${h.y})`).toBeLessThanOrEqual(h.y + 0.5);
  expect(await dialLabelsOf(page)).toEqual(["fan", "heat", "temp"]);
});

// D10, the geometry variant: a bean whose name wraps at 390 px. Seeded through
// startProbeRoast's init script, so e2e/fixtures.js stays as it is. The controls must stay
// above the nav however long the name is -- with the ghost drawn and with the caption
// (17 px taller), the two layouts Case roasts with.
const wrappingBean = { ...fixtureBean, name: "Ethiopia Yirgacheffe Konga Natural G1 Heirloom Reserve Lot 7" };
for (const variant of profileRoastVariants) {
  test(`live chart opens itself: a bean whose name wraps at 390px does not push the controls under the nav (${variant.name})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone", "phone geometry: only the iphone project is 390x844 with touch");
    test.setTimeout(90_000);
    await startProfileRoast(page, variant, wrappingBean);
    // The name is long enough to need two lines or more at this width: the setup bar
    // above the hero truncates it to one, so it can only wrap if it is repeated in the hero.
    // (Soft and instant: the geometry below must be judged on its own too, and a wait here
    // would let the roast clock run past the 0:02 it expects.)
    expect.soft(await heroSection(page).innerText(), "the live hero does not repeat the bean's name").not.toContain(wrappingBean.name);
    await markYellowingThenFirstCrackOnScreen(page);
    expect(await dialLabelsOf(page)).toEqual(["fan", "heat", "temp"]);
  });
}

// D11. The re-arm is per roast, and it has two halves: the once-flag, and the chart
// itself closing. The next-roast test above closes the chart on roast 1, so it can only
// see the flag. Here roast 1 ends with the chart OPEN. On to roast 2: the chart must not
// still be open under the preheat screen (an empty chart above the giant BT), and a roast 2
// that starts with the feed down must not get roast 1's open chart when the bridge returns.
test("live chart opens itself: the next roast starts with no chart, though the last one ended with it open", async ({ page }) => {
  test.setTimeout(120_000);
  const feed = await startProbeRoast(page);
  const readout = beanTempReadout(page);
  // Roast 1 opens itself and is LEFT open (the precondition).
  await expect(readout).toHaveAttribute("aria-expanded", "true", { timeout: 5_000 });
  await expect(page.getByText("00:02", { exact: true })).toBeVisible({ timeout: 10_000 });
  for (const label of ["Yellowing", "First crack", "Cooling start"]) {
    await page.getByRole("button", { name: `Mark ${label}` }).click();
  }
  await expect(liveChartSurface(page).first(), "roast 1 ends with the chart open").toBeVisible();
  await saveRoastButton(page).click();
  await skipDropWeight(page);
  await expect(page.getByTestId("roast-setup")).toBeVisible({ timeout: 10_000 });
  expect(await roastCount(page)).toBe(2); // the fixture roast and roast 1

  // Roast 2, same page session: Setup -> Begin preheat. The preheat screen is up (its
  // Target button), and there is no chart under it, now or a moment later.
  await page.getByRole("button", { name: /Manual roast/ }).click();
  await page.getByRole("button", { name: "Begin preheat" }).click({ timeout: 15_000 });
  const target = page.getByRole("button", { name: /^Target \d+/ });
  await expect(target, "the preheat screen is showing").toBeVisible();
  for (let i = 0; i < 6; i++) {
    await expect(liveChartSurface(page), `chart under the preheat screen, check ${i}`).toHaveCount(0);
    await page.waitForTimeout(500);
  }

  // Roast 2 started with the bridge away. The preheat takeover ends the instant the reading
  // does ("an instrument can't read a number it doesn't have"), then START.
  feed.dropBridge();
  await expect(target).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole("button", { name: "START", exact: true }).click();
  await expect(page.getByRole("button", { name: "PAUSE" })).toBeVisible();
  await expect(liveReadout(page)).toHaveAttribute("data-state", "feed-lost");
  await expect(page.getByText("00:20", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(liveChartSurface(page)).toHaveCount(0);

  // The bridge comes back at 0:20: the readout appears live and collapsed, the chart does not.
  const before = await heroReading(page, "PAUSE");
  feed.restoreBridge();
  await expect(liveReadout(page)).toHaveAttribute("data-state", "live", { timeout: 15_000 });
  for (let i = 0; i < 6; i++) {
    await expect(liveReadout(page), `readout, check ${i} after the bridge came back`).toHaveAttribute("aria-expanded", "false");
    await expect(liveChartSurface(page), `chart, check ${i} after the bridge came back`).toHaveCount(0);
    await page.waitForTimeout(500);
  }
  const after = await heroReading(page, "PAUSE");
  expect.soft(Math.abs(after.run.y - before.run.y), `PAUSE top edge: ${before.run.y} -> ${after.run.y}`).toBeLessThanOrEqual(0.5);
});
