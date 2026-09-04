# Open actions — read at session start

> Surfaced automatically by the `SessionStart` hook in `.claude/settings.json`.
> **Delete this file once these are done.**

## Where things stand

**v3.6.1 is shipped and verified live** (2026-09-03): bundle
`main.a97b8934.js`, gh-pages `ebac1760`, Supabase keys confirmed present in the
live bundle. It carried the security cleanup below. Prior release:

`main.929346fc.js` -> `main.b52fce7d.js`, `3.6.0` in the shipped JS, `3.5.0`
gone, gh-pages `e414a14`, edge byte-identical to gh-pages. PR #13 merged.
Playwright 38/38 green on Case's machine. Nothing is half-finished.

That release carried: the History chart mirroring the live instrument, the
shared phase vocabulary in `src/lib/roastPhases.js`, dev time derived from the
two marks instead of a drifting interval, no duplicate `00:00` row, time and
temperature on every timeline row, ladder crossings marked AT their threshold,
and Discard clearing the curve it used to leave behind.

**Security cleanup shipped 2026-09-03** (section 2). Four superseded migrations
can no longer be run by accident, the audit tooling was rewritten to match the
live model, and the bridge password file is owner-only. Build clean, Playwright
38/38.

## 1. App logo — phone and desktop (Case's request, 2026-09-04)

He wants a new app logo for both. This is bigger than swapping a PNG, because
the icon wiring is currently incomplete:

- `public/favicon.ico` **does not exist**, yet `public/manifest.json` lists it
  as an icon source. Broken reference.
- `public/index.html` contains **no icon links at all** — no `favicon`, no
  `apple-touch-icon`. So iOS "Add to Home Screen" has nothing to use, and
  desktop browsers fall back to a default.
- Only `public/logo192.png` and `public/logo512.png` exist (512 is marked
  `any maskable`).
- `manifest.json` still sets `theme_color: "#f59e0b"` — the old amber, one of
  the hardcoded hexes retired from the charts in v3.6.0. It no longer matches
  the ember accent (`#d97d3d` dark / `#c2601f` light).
- The bridge Electron app has its own icon: `bridge/assets/icon.icns`.

So the work is: get the artwork from Case, then generate the full set
(favicon.ico, 192, 512 maskable, apple-touch-icon 180), wire them properly in
`index.html` and `manifest.json`, fix the theme_color, and decide whether the
bridge `.icns` changes too. `sharp` is already a devDependency, so resizing can
be scripted rather than done by hand.

Ask Case for the source art first, and what he wants it to be — do not invent a
logo for him.

## 2. Security findings from the pre-merge audit — CLOSED 2026-09-03

**Superseded migrations can no longer be run by accident.** Four files, not the
three originally listed — `docs/2026-07-21_roast_profiles_table.sql` has the
same defect (4 owner-or-admin policies, no `aal2`) and had been missed. Each now
opens with a `SUPERSEDED — DO NOT RUN` banner *and* a `do $guard$ ... raise
exception` block placed ahead of every executable statement, so pasting the file
into the SQL editor aborts the whole transaction instead of quietly adding a
parallel policy path. Re-applying one on purpose now means deleting the guard
first, which is the intended friction. The guard was executed against the live
database to confirm it actually raises.

Correction to the previous note: `docs/2026-07-21_multiuser_rls.sql` does not
contain 2 `USING (true)` policies — those two hits are comments describing the
older files. Its real hazard is the missing `aal2` clause (an MFA bypass), not a
wide-open grant. The genuinely permissive files are `docs/enable_rls.sql`
(8 clauses) and `docs/2026-07-18_beans_table.sql` (4).

**The audit tooling itself was stale enough to invert its own findings** and has
been rewritten. `.claude/skills/rls-audit/SKILL.md` had been telling the auditor
to read `enable_rls.sql` as the current policy set, assume RLS was probably off,
and treat "owner reads their own rows → allowed" as correct — under admin-only +
`aal2` that would pass a permissive policy and flag the correct ones as broken.
`.claude/agents/security-auditor.md` called advisor warnings on `USING(true)`
"expected" and pointed at `/Users/casey/Documents/roastlogs`, a stale clone.
Both now describe the live model, and the permissive-policy check is step 1.

**Bridge settings file is no longer world-readable.** `bridge/main.js` writes
with `{ mode: 0o600 }` *and* an explicit `fs.chmodSync` — `mode` alone would
have been a no-op, since it only applies when `writeFileSync` creates the file
and the existing one was already at 0644. The live `~/.roastlogs-bridge.json`
was chmod'd to `600`.

**One pre-existing app bug fixed along the way.** React StrictMode
double-invokes effects in development with refs preserved, so the profiles
reconcile hook at `src/App.js:1281` set `profilesDirtyRef` on mount with no user
edit, and the mount-sync merge then skipped re-hydrating `global_profiles`.
Latent today (the key is always present locally, so the merge has nothing to
add) but it would surface as apparent data loss the moment that key is ever
cleared. Guard is now `if (prev === null || prev === profiles) return;`.

### Deliberately NOT done: purging the device cache on sign-out

The audit proposed clearing cached roast data from localStorage on sign-out.
**Case declined it 2026-09-03, and the reasoning is worth keeping.**

It defends against one scenario only: someone reading the cache on a device that
is already unlocked, after a sign-out. Signing out requires opening Settings and
scrolling to the bottom — it is never a fat-finger action, so a roast is only
ever abandoned on purpose. Against that, the fix meant a behaviour change in auth
code, which is the highest-risk area in the app.

Worth noting the fix as originally specified would not have worked anyway:
`purgeCachedUserData` quarantines rather than deletes, copying each value to
`roasts__quarantine` and removing the original — just as readable to anyone
holding the device.

**Do not re-propose this without a genuinely new reason.**

**The database check the audit could not reach came back clean.** Run live
2026-09-03 via Supabase MCP:

```sql
SELECT tablename, policyname FROM pg_policies
WHERE schemaname='public' AND (qual = 'true' OR with_check = 'true');
```

**Zero rows.** All 16 policies are `admin+mfa`, each requiring
`is_admin(auth.uid()) AND auth.jwt()->>'aal' = 'aal2'`. The 2026-07-25 lockdown
is intact. Sessions carry no timeout (`not_after` is null) and survive for weeks
on one MFA challenge — verified: a session created 2026-08-08 was still
refreshing 2026-09-04.

## 2b. No test is tagged `@smoke` — post-deploy step 6 always skips

`deploy-verifier` has a step 6 that runs `@smoke`-tagged Playwright tests
against the LIVE site. No test carries the tag, so it has silently skipped
after every deploy. Case asked (2026-09-03) that it actually run next time.

**The catch that has to be designed around:** every existing test uses the E2E
auth bypass, which is compiled out of production builds (`NODE_ENV ===
"development"` in `src/index.js`). So the current tests CANNOT run against the
live URL — they would land on the login screen. A live smoke test can only
cover unauthenticated surface unless real credentials plus an MFA code get
involved, which is not worth automating.

Realistic scope: tag `e2e/login.spec.js` "login screen renders" as `@smoke`,
and add one shell check (app mounts, no console errors, correct version in the
About badge). That genuinely proves the deploy is alive without needing a login.

## 3. Equipment field — Phase 1 SHIPPED in v3.7.0 (2026-09-03)

A roaster setup selector on the Roast tab: `SR540 + Razzo V5T`, `SR540 + OEM
Extension Tube`, `Standard SR540`. Saved per roast, synced to Supabase in a new
nullable `equipment jsonb` column, shown in History detail. Roasts logged before
v3.7.0 read "Not recorded" — never inferred. The choice persists between roasts
under `roastlogs_equipment` (a device preference, not a `live_` key), and a
connected bridge auto-selects the Razzo since only it carries the K-type probe.

Plan and decisions: `docs/equipment-field-plan.md`.
Migration: `docs/2026-09-03_add_equipment_to_roasts.sql` (applied live).

**Phase 2, still unbuilt and deliberately deferred:**
- The **capability gate** — hide live mode when the selected setup has no probe.
  Deferred because it lets the dropdown switch live temps off; safer to build
  once real roasts carry equipment values.
- The **315°F preheat screen** (full-bleed state, live BT against target).
- **Cross-equipment flags** in the comparison tool.

## Standing notes

- Deploys run on Case's machine ONLY. His gitignored `.env` holds the Supabase
  keys; a build without them publishes a keyless bundle that locks both accounts
  out of the live site. Guard before deploying:
  `node -p "require('./package.json').version"` and confirm the deploy log reads
  `roastlogs@<expected> deploy`.
- Playwright baselines must be regenerated on Case's machine, never in a cloud
  container — container font rendering differs by ~2px and Playwright rejects on
  size mismatch before `maxDiffPixelRatio` applies.
- Case's preference, stated 2026-09-03: when a bug-prone area is found, tell him
  what happened, what the fix is, and show the diff. Be concise.
