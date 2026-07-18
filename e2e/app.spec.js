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
