# Open actions — read at session start

> Surfaced automatically by the `SessionStart` hook in `.claude/settings.json`.
> **Delete this file once the sequence below is done** — a stale open-action
> file is worse than none.

## Where PR #13 stands (updated 2026-09-03)

Case answered the (a)/(b) question: **(b) — build the History work onto this
branch first**, so PR #13 is a real change rather than a docs pin. That is done.
It now carries:

1. The v3.5.0 session pin and the History plan (docs).
2. Three defects Case found across two live roasts on 2026-09-02: the drifting
   dev timer, the duplicate `00:00` row, and missing temperatures on markers,
   moments and profile rows.
3. The shared phase vocabulary extracted to `src/lib/roastPhases.js`.
4. The History roast-detail chart mirroring the live instrument.

## What is left, in order

1. **Case reviews on localhost.** Not yet done. `git pull` the branch, then
   `npm start`; the bridge mock is `bridge/ npm run mock` with the bridge app
   pointed at `127.0.0.1:8081`.
2. **Run the `security-auditor` agent** — Case asked for this pass explicitly.
   Note honestly what it did and did not cover: this branch touches charts,
   timers and timeline rendering, not auth, sync, RLS or Supabase, so treat it
   as a periodic audit rather than a gate on this diff.
3. **Regenerate the Playwright baselines on Case's machine**:
   `npx playwright test --update-snapshots`. The History chart and roast tab
   genuinely look different now. Never regenerate from a cloud container.
4. **Merge, then `/release`, then deploy.** The deploy runs on Case's machine
   only: his gitignored `.env` holds the Supabase keys, and a build without them
   publishes a keyless bundle that locks both accounts out of the live site.
   Guard before deploying: `node -p "require('./package.json').version"` and
   confirm the deploy log reads `roastlogs@<expected> deploy`.

## Things Case should be told, not left to discover

- **Dev time now freezes on a pause** rather than counting on. That is what
  makes the Roast tab and History agree, but beans keep roasting through a
  pause.
- **Two e2e assertions were changed, not dropped.** Both asserted the in-plot
  "FC" divider pill that the ribbon retires; they now assert the ribbon, so the
  intent — the chart NAMES its phases — is preserved.
- The duplicate `00:00` fix is **forward-only** by Case's decision. The two
  roasts from 2026-09-02 keep their duplicate row.

## Still unbuilt after this

The equipment field (SR540 bare / OEM extension tube / V5T Razzo), specified in
`docs/roastlink-live-data-plan.md`.
