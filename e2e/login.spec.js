const { test, expect } = require("@playwright/test");

// Login screen renders BEFORE auth, so no bypass flag here — this is the
// one screen we can test exactly as production users see it.
test.beforeEach(async ({ context }) => {
  // Hard guarantee: zero Supabase traffic leaves the test browser.
  await context.route(/supabase\.co/, (route) => route.abort());
});

test("login screen renders", async ({ page }) => {
  await page.goto("/");
  // The auth loading spinner resolves to the login screen once the
  // (blocked) session check settles.
  await expect(page.locator("input[type=email], input[type=password]").first()).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveScreenshot("login.png", { fullPage: true });
});
