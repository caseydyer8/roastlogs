const { defineConfig } = require("@playwright/test");

// UI refinement loop for RoastLogs. Tests run against the CRA dev server
// with the E2E auth bypass (src/index.js) + all Supabase traffic blocked
// (see e2e/*.spec.js beforeEach) — real data can never be touched.
module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    },
  },
  webServer: {
    command: "BROWSER=none npm start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [
    {
      // Matches Casey's phone-testing reality: small viewport, touch.
      name: "iphone",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
});
