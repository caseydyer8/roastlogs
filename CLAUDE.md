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
