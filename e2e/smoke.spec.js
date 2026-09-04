const { test, expect } = require("@playwright/test");

// Post-deploy smoke tests. These are the ONLY tests that may run against the
// live site, and they are deliberately unauthenticated.
//
// Why they cannot simply reuse the main suite: every other test relies on the
// E2E auth bypass in src/index.js, which is gated on NODE_ENV === "development"
// and therefore does not exist in a production build. Pointed at the live site
// those tests would land on the login screen and fail for the wrong reason.
//
// What this DOES prove, which curling for HTTP 200 does not: the shipped bundle
// actually parses, React mounts, and the app reaches its first real screen. A
// keyless build (one made without the gitignored .env) or a bundle broken at
// runtime still returns 200 for the HTML while failing every check below.
//
// Run against the deployed site:
//   SMOKE_URL=https://caseydyer8.github.io/roastlogs/ npx playwright test -g @smoke
// With no SMOKE_URL it runs against localhost, so it stays part of the normal
// suite and cannot silently rot.

const expectedVersion = require("../package.json").version;

test("@smoke app boots and reaches the login gate", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // "./" not "/": the live site is served from a SUBPATH
  // (caseydyer8.github.io/roastlogs/), and a leading slash resolves against the
  // domain root instead, silently testing the wrong page.
  await page.goto("./");

  // The auth gate is the first real screen for an unauthenticated visitor.
  // Reaching it means the bundle executed and React mounted.
  await expect(
    page.locator("input[type=email], input[type=password]").first()
  ).toBeVisible({ timeout: 20_000 });

  expect(errors, `uncaught page errors: ${errors.join(" | ")}`).toHaveLength(0);
});

test("@smoke served bundle carries the expected version and Supabase config", async ({
  page,
  request,
}) => {
  // Only meaningful against a real build. The CRA dev server serves one
  // unminified bundle under a different name, so the minified `appVersion:"x"`
  // form never appears and this would fail for a reason that says nothing about
  // the deploy. The boot test above still runs locally and catches real breaks.
  test.skip(!process.env.SMOKE_URL, "needs a deployed build — set SMOKE_URL");

  await page.goto("./");

  const src = await page
    .locator('script[src*="/static/js/main."]')
    .first()
    .getAttribute("src");
  expect(src, "no main bundle script tag on the page").toBeTruthy();

  const res = await request.get(new URL(src, page.url()).toString());
  expect(res.status()).toBe(200);
  const bundle = await res.text();

  // Guards a stale CDN copy: HTTP 200 alone does not prove the NEW build.
  expect(
    bundle.includes(`appVersion:"${expectedVersion}"`),
    `live bundle does not carry appVersion "${expectedVersion}"`
  ).toBe(true);

  // A build made without the gitignored .env publishes a keyless bundle that
  // locks both accounts out of the live site. It looks completely healthy.
  expect(
    bundle.includes("supabase.co"),
    "live bundle has no Supabase URL — keyless build, accounts would be locked out"
  ).toBe(true);
  expect(
    bundle.includes("sb_publishable_"),
    "live bundle has no publishable key — keyless build"
  ).toBe(true);
});
