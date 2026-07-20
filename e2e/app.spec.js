const { test, expect } = require("@playwright/test");
const { fixtureRoast, fixtureTasting } = require("./fixtures");

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
  await expect(page).toHaveScreenshot("roast-tab.png", { fullPage: true });
});

test("profile builder: steppers ordered Fan→Heat; time picker fits viewport", async ({ page }) => {
  await page.getByText("Build Profile").click();
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

  await expect(page).toHaveScreenshot("time-chip-picker.png", { fullPage: true });
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

  await expect(page).toHaveScreenshot("brew-summary.png", { fullPage: true });
});

test("beans: monogram rows with count pills and half-star average", async ({ page }) => {
  await page.getByRole("button", { name: "Beans" }).click();

  // Derived bean row: monogram avatar, count pills, 3.5 average from the fixture tasting.
  await expect(page.getByText("1 roasts")).toBeVisible();
  await expect(page.getByText("1 tastings")).toBeVisible();
  await expect(page.getByText("3.5", { exact: true })).toBeVisible();

  await expect(page).toHaveScreenshot("beans-list.png", { fullPage: true });
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

  await expect(page).toHaveScreenshot("tastings-list.png", { fullPage: true });
});

test("history: roast detail renders the split roast-story chart", async ({ page }) => {
  await page.getByRole("button", { name: "History" }).click();
  await page.getByText("E2E Ethiopia Test").first().click();

  // Both ComposedCharts (development curve + control map) must render.
  await expect(page.locator(".recharts-surface").nth(1)).toBeVisible();
  // Phase divider labels from the chart rework.
  await expect(page.getByText("FC", { exact: true }).first()).toBeVisible();
  // Metric tiles present.
  await expect(page.getByText("Avg RoR")).toBeVisible();
  await expect(page.getByText("DTR")).toBeVisible();

  await expect(page).toHaveScreenshot("history-chart.png", { fullPage: true });
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
    await expect(page).toHaveScreenshot("roast-tab-light.png", { fullPage: true });
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

    await expect(page).toHaveScreenshot("brew-summary-light.png", { fullPage: true });
  });

  test("history tastings: list renders in light mode", async ({ page }) => {
    await page.getByRole("button", { name: "History" }).click();
    await page.getByText("TASTINGS").click();

    await expect(page.getByText("E2E Ethiopia Test").first()).toBeVisible();
    await expect(page.getByText("Dark Chocolate").first()).toBeVisible();

    await expect(page).toHaveScreenshot("tastings-list-light.png", { fullPage: true });
  });

  test("history: roast detail chart renders in light mode", async ({ page }) => {
    await page.getByRole("button", { name: "History" }).click();
    await page.getByText("E2E Ethiopia Test").first().click();

    await expect(page.locator(".recharts-surface").nth(1)).toBeVisible();
    await expect(page.getByText("FC", { exact: true }).first()).toBeVisible();

    await expect(page).toHaveScreenshot("history-chart-light.png", { fullPage: true });
  });
});
