const { test, expect } = require("@playwright/test");
const { fixtureRoast } = require("./fixtures");

test.beforeEach(async ({ context, page }) => {
  // Hard guarantee: zero Supabase traffic leaves the test browser.
  await context.route(/supabase\.co/, (route) => route.abort());
  // Enable the dev-only auth bypass and seed one deterministic roast.
  await page.addInitScript((roast) => {
    window.localStorage.setItem("roastlogs_e2e", "1");
    window.localStorage.setItem("roasts", JSON.stringify([roast]));
  }, fixtureRoast);
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

test("profile builder: drum picker fully visible in viewport", async ({ page }) => {
  await page.getByText("Build Profile").click();
  await page.getByText("+ ADD STEP").click();

  // Step row pickers are MM, SS, Fan, Heat — Fan is the 3rd trigger.
  await page.locator("button.font-mono.font-bold").nth(2).click();
  await expect(page.getByText("FAN", { exact: true })).toBeVisible();

  // The regression this guards: the old bottom-sheet placement pushed the
  // lower numbers off-screen. The whole picker card must fit the viewport.
  const card = page
    .locator("div.max-w-sm", { has: page.getByText("FAN", { exact: true }) })
    .last();
  const box = await card.boundingBox();
  const viewport = page.viewportSize();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

  await expect(page).toHaveScreenshot("drum-picker.png", { fullPage: true });
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
