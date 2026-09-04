# RoastLogs

React CRA PWA for logging Fresh Roast SR540 coffee roasts. Deployed to GitHub
Pages at https://caseydyer8.github.io/roastlogs/.

## Working With Case (read first)

Case's working standards live in `.claude/working-agreement.md` — his build loop,
session rituals, design standards, tiered definition of "done," and how he runs
his agent bundle. **Load it at the start of every session and work from it — do
not start cold.** Address him as **"Case"** in every response. It is imported
below so it is always in context:

@.claude/working-agreement.md

Keep it current: when working standards or agent definitions change materially,
update that file — it is the human-readable backup of preferences otherwise
trapped in agent config.

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
- **Equipment** (`roast.equipment`, v3.7.0) records the hardware a roast used:
  `{ setup: "razzo-v5t" | "oem-tube" | "sr540", probe: "k-type" | null }`, in a
  nullable `equipment jsonb` column. Roasts logged before v3.7.0 are null and
  render "Not recorded" — never inferred. The selection persists between roasts
  under `localStorage.roastlogs_equipment` (a DEVICE preference like theme, NOT
  a `live_` key, so `clearLiveSession` and the sign-in purge leave it alone).
  A bridge on the channel auto-selects the Razzo, since only it has a probe —
  but never over an explicit pick and never once a roast is under way.
  **Phase 2 shipped, verified on localhost 2026-09-04** (gate, preheat, and
  comparison flag all confirmed against a real bridge + mock device; code
  review and security review both clean): the shared vocabulary
  (`EQUIPMENT_OPTIONS`/`equipmentLabel`/`equipmentHasProbe`) now lives in
  `src/lib/equipment.js`, imported by `App.js` and `RoastCompareChart.jsx` —
  don't redefine it inline again. `App.js` derives one `gatedLiveRoast` (a
  view of `liveRoast` forced to `status: "no-bridge"` when the selected setup
  has no probe) and every Roast-tab display/recording path reads that instead
  of `liveRoast` directly — the bridge auto-select effect and the Settings
  "RoastLink Bridge" diagnostic are the two deliberate exceptions, since they
  need the real signal. `PreheatScreen.jsx` takes over the Roast-tab hero
  (giant BT vs. a target, default 315°F, editable, `localStorage.
  roastlogs_preheat_target`) whenever a probe is selected, no roast is
  running, and a real live reading is on screen — on *every* roast, not just
  back-to-back ones. On a rising crossing it chimes, speaks, and shows the
  same phrase (`"Roaster's warmed up!"`, one constant in that file) at once —
  audio only; `navigator.vibrate()` doesn't exist in iOS Safari/PWA, so haptics
  were dropped from scope rather than shipped broken. `RoastCompareChart.jsx`
  flags two or more compared roasts with *different, known* `equipment.setup`
  values — roasts missing the field entirely are never treated as a mismatch.
  See `docs/equipment-field-plan.md` and `docs/roastlink-live-data-plan.md`.
- `roast.roastLog` is a mixed-type array stored **newest-first**; phase entries
  use labels `START` / `YELLOWING` / `FIRST CRACK` / `COOLING START`; temp
  values may be empty strings.
- Almost everything lives in `src/App.js` (~4300 lines). Extracted components
  go in `src/components/` (e.g. `src/components/charts/RoastCurveChart.jsx`).

## Deployment / Release

- **Preview on localhost BEFORE deploying** — always. Run `npm start` and review
  at `localhost:3000` first; `npm run deploy` publishes straight to the live site
  with no staging step, so localhost IS the review gate. Never deploy a change Case
  hasn't seen running locally.
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
- **PRIVATE 2-ACCOUNT APP as of 2026-07-25** (briefly multi-user 07-21→07-25;
  reverted after Casey + Becca decided NOT to open it to others — a home-network
  concern). The app is locked to Casey's **two accounts ONLY** — the addresses are
  deliberately not committed (this repo is public; publishing them would hand out the
  full list of valid usernames for an app with signup disabled). Source of truth:
  Supabase Dashboard → Authentication → Users. Every synced table (`roasts`, `tasting_notes`,
  `beans`, `roast_profiles`) still carries `user_id` (`NOT NULL`, `DEFAULT
  auth.uid()`, FK to `auth.users` ON DELETE CASCADE), but the RLS is now
  **admin-only** — no per-user/owner branch remains, **no `USING (true)` remains**.
  All 16 policies (4 tables × select/insert/update/delete) require BOTH:
  - `(select public.is_admin((select auth.uid())))` — caller is one of the two admins
  - `(select auth.jwt() ->> 'aal') = 'aal2'` — session completed MFA (2nd factor)
- **`aal2` = server-side MFA enforcement** (`docs/2026-07-25_require_mfa_aal2.sql`,
  applied + verified live 2026-07-27). A password-only (`aal1`) session — e.g. a
  stolen/leaked password used directly against the Supabase REST API, bypassing
  the app — can read/write **nothing**. The client also routes to a TOTP prompt
  after login (`MfaChallengeScreen`); the DB rule is the real gate. **Precondition
  for the `aal2` rule: every account MUST have a verified TOTP factor** or it locks
  that account out of its own data. Rollback = re-run
  `docs/2026-07-25_lock_to_admins_only.sql` (admin-only WITHOUT the `aal2` clause).
- **MFA (TOTP):** both accounts enrolled + verified. Enroll/manage UI in
  `MfaSettings` (Settings → Account); login challenge in `MfaChallengeScreen`;
  auth plumbing in `AuthContext` (`enrollMfa`/`confirmMfaEnrollment`/
  `submitMfaChallenge`/`listMfaFactors`/`unenrollMfa`/`refreshMfaStatus`,
  `mfaRequired`). Supabase MFA is enabled (TOTP) in the dashboard.
- **Admin infra:** `public.admins` (RLS-on, no policies, grants revoked →
  default-deny) + `public.is_admin(uuid)` SECURITY DEFINER (`search_path=''`).
  Both of Casey's accounts are seeded by an explicit EMAIL ALLOWLIST — never
  blanket-promote `auth.users`.
- **Verified live 2026-07-27:** 16/16 policies require `aal2`; `anon` has 0 grants
  on all four tables (cannot SELECT). Earlier (2026-07-23) admin-only pen-test:
  simulated non-admin saw 0 rows across all four tables; ownership-spoof insert
  blocked; `anon` cannot EXECUTE `rls_auto_enable()`.
- **Public signups: DISABLED** — Casey provisions the two accounts in the Supabase
  dashboard. There is no signup UI by design.
- **Leaked-password protection is PLAN-GATED** — a Pro-plan feature; the org is on
  FREE (staying free for now; not paying to host other people's data). The security
  advisor will keep flagging it — annotate as plan-gated, not an open finding.
  Compensating controls: server-side MFA (`aal2`) required by all 16 policies, so a
  password alone is worth nothing, plus the Email-provider password policy
  (min length ≥8 + require digit/lower/upper/symbol).
- **No PITR/managed snapshots on free.** Backups are logical JSON exports (see
  the `docs/` migrations for schema). **Gate any destructive/PK migration —
  e.g. the deferred Phase 3 composite-key work — on having a backup story.**
- **Live-channel lockdown (2026-08-28, `docs/2026-08-28_lock_roastlink_live_channel.sql`):**
  the RoastLink `roastlink-live` Realtime channel is **private**, enforced by three
  policies on `realtime.messages`. Read (live temps) requires **admin + `aal2`**, same
  bar as the data. Publishing samples is restricted to a **dedicated bridge identity**.
  - **The bridge identity is a machine credential, NOT a third person.** The app is
    still a 2-ACCOUNT app. That identity is deliberately **not** in `public.admins`,
    so all 16 data policies return it **zero rows on every table**; its only capability
    anywhere is publishing to that one topic. Its password lives solely in the
    operator's local `~/.roastlogs-bridge.json` — never in this repo.
  - **Both sides must set `private: true`** (`bridge/lib/publisher.js`,
    `src/hooks/useLiveRoast.js`). Private and public channels are separate delivery
    paths — verified live — so a mismatch silently yields no data.
  - Verified live: bridge publishes and a legitimate subscriber receives; an anonymous
    client is refused on subscribe (`CHANNEL_ERROR`) and its REST publish returns
    HTTP 202 but is **dropped by RLS and never delivered**.
- Device-cache isolation lives in `AuthContext.enforceLocalDataOwner()`: purges
  cached localStorage data when a *different* account signs in (RLS can't do this).
  **Purging on sign-out was considered and deliberately declined (2026-09-03):**
  it guards only against someone reading the cache on an already-unlocked device,
  and sign-out is buried at the bottom of Settings, so it is never accidental.
  Not worth a behaviour change in auth code. Don't re-propose it without a new
  reason.
- **Four migrations are SUPERSEDED and carry a `raise exception` guard** that
  aborts the transaction if pasted into the SQL editor: `docs/enable_rls.sql`,
  `docs/2026-07-18_beans_table.sql`, `docs/2026-07-21_multiuser_rls.sql`,
  `docs/2026-07-21_roast_profiles_table.sql`. They describe retired policy
  models. Postgres ORs permissive policies, so re-running one would not replace
  the lockdown — it would add a path around it. Re-applying one on purpose
  means deleting its guard first.
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
- Photos do NOT sync to Supabase — flag durability when photos are touched.
  Roasts, tasting notes, beans, AND roast profiles all sync (profiles via the
  `roast_profiles` table; verified 6 live rows on 2026-08-08). Note profiles are
  React state hydrated once by the launch sync, whereas beans are re-read from
  localStorage on demand — so a profile that synced up may not *appear* on a
  second device unless that session's cloud fetch succeeds (admin + `aal2`).
