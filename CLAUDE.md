# RoastLogs

React CRA PWA for logging Fresh Roast SR540 coffee roasts. Deployed to GitHub
Pages at https://caseydyer8.github.io/roastlogs/.

## Project Conventions

- **Control order is Fan → Heat → Temp** everywhere controls are shown or
  entered (inputs, timelines, tooltips). History timeline rows abbreviate as
  `F: · H: · T:`.
- **Heat and Fan are discrete 1–9 dials** — chart lines for them MUST use
  `type="stepAfter"`, never smoothed. Temp uses `type="monotone"`.
- UI is **dark-only** (zinc-950 background, amber-500 accent). No light mode.
- `roast.roastLog` is a mixed-type array stored **newest-first**; phase entries
  use labels `START` / `YELLOWING` / `FIRST CRACK` / `COOLING START`; temp
  values may be empty strings.
- Almost everything lives in `src/App.js` (~4300 lines). Extracted components
  go in `src/components/` (e.g. `src/components/charts/RoastCurveChart.jsx`).

## Deployment / Release

- Build: `CI=false npm run build` (CI=false so warnings don't fail the build).
- Deploy: `npm run deploy` (gh-pages publishes `build/` to the `gh-pages`
  branch). Pushing `main` does NOT update the live site — deploy is separate.
- **Version lives in THREE places** — bump all of them together:
  1. `package.json` `version`
  2. The About modal badge in `src/App.js` (search `v1.` near "About modal")
  3. The backup export `appVersion` field in `src/App.js`
- After deploying, verify: `curl` the live URL for 200, and remind that the
  Pages CDN takes 1–2 min (hard refresh / private window to confirm).
- Never commit `build/` — it's a deploy artifact published via gh-pages only.

## Security

- Auth is Supabase (`@supabase/supabase-js`); login gate + RLS policies.
- **RLS migration is still pending**: `docs/enable_rls.sql` must be run
  manually against Supabase — RLS is OFF until then. Flag this whenever auth
  or data-access code changes.
- Keep secrets/env files out of git (`.gitignore` is hardened — keep it so).

## Workflow

- Commit only when asked; the user phone-tests on a real SR540 roast before
  shipping. Don't push or deploy without explicit go-ahead.
- Display-order changes must never require data migration — always read log
  entries by field name (`entry.fan` / `entry.heat` / `entry.temp`).

## Use the tooling proactively

This repo has purpose-built skills and agents. **Suggest them by name at the
right moment — don't wait to be asked.** Casey wants these prompts.

| When this happens | Reach for |
|---|---|
| User asks to ship / bump a version | `/release` (handles the 3-place version bump) |
| Any `npm run deploy` finishes | Spawn the **deploy-verifier** agent — never call a deploy done on `Published` alone |
| Auth, sync, RLS, or Supabase code is touched | Spawn the **security-auditor** agent before commit; suggest `/rls-audit` |
| Any UI change (charts, pickers, layout, ordering) | `/ui-loop` after the edit — visual baselines exist for login, roast tab, picker, history chart |
| A new screen/component is added | Add a matching e2e test + baseline in the same session |
| Before any deploy of nontrivial changes | Suggest `/code-review` on the diff |
| Session touches roast data shapes | Remember `e2e/fixtures.js` must stay in sync with the real contract |

Standing reminders to surface when relevant (not every session):
- The RLS migration (`docs/enable_rls.sql`) is still pending — flag it
  whenever Supabase work comes up, until it's confirmed applied.
- Beans, profiles, and photos do NOT sync to Supabase (roasts and tasting
  notes do) — flag durability when those features are touched.
