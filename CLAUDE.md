# RoastLogs

React CRA PWA for logging Fresh Roast SR540 coffee roasts. Deployed to GitHub
Pages at https://caseydyer8.github.io/roastlogs/.

## Working With Case (developer profile — read first)

Case maintains a developer profile in `.claude/case-profile/` — how he thinks,
how he builds, his design taste, his tiered definition of "done," how he runs
his agent bundle, and where the work is headed. **Load it at the start of every
session and work from it — do not start cold.** `00-working-with-case.md` is the
entry point; the numbered files specialize it. Address him as **"Case"** in
every response. The files below are imported so they're always in context:

@.claude/case-profile/00-working-with-case.md
@.claude/case-profile/01-workflow-and-sessions.md
@.claude/case-profile/02-design-and-done.md
@.claude/case-profile/03-agents-and-process.md
@.claude/case-profile/04-growth-and-direction.md

Keep this folder current: when working standards or agent definitions change
materially, update the matching file here — it's the human-readable backup of
preferences otherwise trapped in agent config.

## Project Conventions

- **Control order is Fan → Heat → Temp** everywhere controls are shown or
  entered (inputs, timelines, tooltips). History timeline rows abbreviate as
  `F: · H: · T:`.
- **Heat and Fan are discrete 1–9 dials** — chart lines for them MUST use
  `type="stepAfter"`, never smoothed. Temp uses `type="monotone"`.
- UI supports **dark (default) and light themes** via a semantic color-token
  system: CSS custom properties in `src/theme.css` (dark in `:root`, light
  under `[data-theme="light"]`), mapped to Tailwind classes in
  `tailwind.config.js` (`bg-primary`, `bg-surface`, `bg-card`, `text-ink`,
  `text-ink-muted`, `border-border`, `bg-accent`/`text-accent-text`,
  `bg-error`/`text-error-text`, `bg-success`/`text-success-text`,
  `chart-ror`/`chart-heat`/`chart-fan`/`chart-temp`). New UI should use these
  semantic classes, not raw `zinc-*`/`amber-*` Tailwind colors — raw color
  classes don't respond to the theme toggle. `RoastCurveChart.jsx` and the
  `Star`/nav-icon SVGs pass colors as `rgb(var(--token))` strings (SVG
  presentation attributes don't resolve bare `var()`, but do resolve a
  properly-wrapped `rgb()` function). The theme toggle lives in Settings and
  persists to `localStorage.roastlogs_theme`.
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
- **MULTI-USER as of 2026-07-21** (was single-user; migrated live). Every synced
  table (`roasts`, `tasting_notes`, `beans`, `roast_profiles`) has a `user_id`
  (`NOT NULL`, `DEFAULT auth.uid()`, FK to `auth.users` ON DELETE CASCADE), and
  all 16 policies are owner-scoped — **no `USING (true)` remains**:
  - read/update/delete: `user_id = auth.uid() OR (is_admin(auth.uid()) AND is_admin(user_id))`
  - insert/update-check: `user_id = auth.uid()` (no owner spoofing)
- **Admin co-ownership model:** `public.admins` (RLS-on, no policies, grants
  revoked → default-deny) + `public.is_admin(uuid)` SECURITY DEFINER
  (`search_path=''`). Casey's two accounts are admins: they co-own each other's
  rows + the legacy data, but get **NO access to a regular user's private rows**.
  Admins are seeded by an explicit EMAIL ALLOWLIST — never blanket-promote
  `auth.users`.
- **Verified live 2026-07-23:** simulated non-admin sees 0 rows across all four
  tables; ownership-spoof insert blocked (0 rows written); `anon` cannot SELECT
  the tables and cannot EXECUTE `rls_auto_enable()`.
- **Public signups: DISABLED** — invite-only; Casey provisions accounts in the
  Supabase dashboard. There is no signup UI by design.
- **Leaked-password protection is PLAN-GATED, not enabled** — it's a Pro-plan
  feature and the org is on FREE (staying free for now; not paying to host other
  people's data). The security advisor will keep flagging it — annotate as
  plan-gated, not an open finding. Compensating control: Email-provider password
  policy (min length ≥8 + require digit/lower/upper/symbol).
- **No PITR/managed snapshots on free.** Backups are logical JSON exports (see
  the `docs/` migrations for schema). **Gate any destructive/PK migration —
  e.g. the deferred Phase 3 composite-key work — on having a backup story.**
- Device-cache isolation lives in `AuthContext.enforceLocalDataOwner()`: purges
  cached localStorage data when a *different* account signs in (RLS can't do this).
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
- Profiles and photos do NOT sync to Supabase (roasts, tasting notes, and
  beans do, as of 2026-07-20) — flag durability when profiles/photos are
  touched.
