---
name: ui-loop
description: Test-driven UI refinement loop — runs Playwright visual tests at phone + desktop viewports, shows screenshot diffs, and iterates on UI code until all snapshots pass. Use when changing any UI, or when the user says "run the UI loop" / "check the screens".
---

# UI Refinement Loop

Playwright harness: `playwright.config.js` + `e2e/`. Runs against the CRA dev
server with the dev-only auth bypass (`src/index.js`) and ALL Supabase traffic
blocked — tests can never touch real data. Baselines live in
`e2e/*-snapshots/`.

## The loop

1. **Run**: `npx playwright test 2>&1 | tail -30`
   (First run of a session starts the dev server — allow ~60s.)

2. **On visual diffs**: the report saves `*-actual.png`, `*-expected.png`,
   and `*-diff.png` under `test-results/`. **Read the diff images** to see
   what changed — never guess from pixel counts.

3. **Decide, per diff**:
   - Unintended change → fix the UI code, re-run, repeat until green.
   - Intended change (user asked for this new look) → show the user the
     actual screenshot, get confirmation, then
     `npx playwright test --update-snapshots` to accept the new baseline.
     Commit updated baselines together with the code change.

4. **On assertion failures** (not visual): these are behavior regressions —
   Fan/Heat/Temp order, picker fitting the viewport, chart elements missing.
   Fix the code; never weaken the assertion to make it pass.

5. **When adding UI**: add a matching test + screenshot to `e2e/app.spec.js`
   in the same session. Seed data through `e2e/fixtures.js` (roastLog is
   newest-first, string dial values).

## Hard rules

- Never remove the `context.route(/supabase\.co/...)` block or the
  `NODE_ENV === "development"` guard on the bypass — they are the two safety
  layers that keep tests away from real data and production builds.
- Screenshots at both viewports must pass — a fix that only works on desktop
  isn't a fix (Casey phone-tests on a real SR540).
- If a test is flaky due to dynamic content (dates, timers), mask the element
  in the screenshot call rather than deleting the test.
