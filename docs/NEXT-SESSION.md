# Open actions — read at session start

> Kept deliberately short: the `SessionStart` hook reads this file into context
> every session, so length here is a recurring token cost. Forward-looking only.
> History lives in `docs/2026-09-03-session-log.md` and in the commit messages.
> **Delete this file once the list is empty.**

## Pick up here

Session 2026-09-11/12 triaged an external security review and shipped its
Tier A. **Live is v3.8.2, deployed and verified 2026-09-12** (bundle
`main.407ee0af.js`, byte-for-byte identical to the local build; zero dummy
config, zero disabled legacy JWT, zero `roastlogs_e2e` marker). PR #16 merged
to `main` as `eb2c26db`. No database, policy, grant, or schema change.

What shipped (detail in the commit messages and
`docs/2026-09-09-security-review-triage.md`):

1. **Curve no longer records stale temps.** Recording requires a live feed AND
   a new sample; gaps stay gaps. Milestones re-seed after a dropout instead of
   interpolating a crossing across the dead window.
2. **Device/broadcast frame validation.** Non-objects, NaN/Infinity, the -9999
   open-thermocouple sentinel and oversized frames are rejected, never clamped;
   nothing escapes the WebSocket callback. Shared browser half in
   `src/lib/liveSample.js`.
3. **Backup now fetches cloud roast profiles** (was localStorage-only).
4. **MFA fails closed** on a *returned* `{data:null,error}`, not just a throw.

> **The review is NOT fully closed — Tier B and C remain.** Highest is item #5
> below. Full tiering and the four corrections to the review are in the triage
> doc; the live-infrastructure verification table there was confirmed against
> the real project and is current as of 2026-09-11.

**Two process debts from this session, both deliberate, both Case's call:**
- **v3.8.2 went out WITHOUT localhost review.** Case directed the deploy before
  seeing it run locally, overriding the standing gate. Still unverified by eye:
  a full roast against the mock bridge confirming **the live Temp line does not
  fragment** (the one failure the security-auditor caught pre-ship), his own
  probe + manual-temp roasts rendering unchanged, and metric tiles showing
  numbers rather than em-dashes. Worth doing on the next roast regardless.
- **Playwright screenshot baselines are stale on Linux** independently of this
  work — identical diff on a clean tree (390x1893 vs 390x1966), caused by the
  `EQUIPMENT` row postdating them. Only Case's Mac can regenerate the real set.
  Also: the `@smoke` specs **cannot run from a container** — Chromium's tunnels
  are closed mid-exchange by the agent proxy (it fails on google.com too), so
  the smoke assertions were verified with `curl` instead. `curl` is unaffected.

| # | What | Blocked on |
|---|---|---|
| 1 | **App logo** — `public/favicon.ico` does not exist though `manifest.json` references it, `index.html` has no icon links at all, and `theme_color` is still the retired amber `#f59e0b` | **Case's source art. Do not invent a logo.** |
| 2 | **Bridge `ENOTFOUND` — RESOLVED 2026-09-10, but root cause NOT proven.** Working and verified: v0.2.0 holds an ESTABLISHED socket to the roaster (`192.168.1.120:81`) and to Supabase, and the bridge account's `last_sign_in_at` confirms the cloud leg server-side. **Caveat: no macOS Local Network prompt ever appeared**, so the permission was already granted and the `NSLocalNetworkUsageDescription` added in v0.2.0 is probably NOT what fixed it. Two things changed at once (purpose string + a rebuild onto current code, replacing an Aug 27 asar) and the stale long-running instance was killed — most likely a fresh launch cleared a wedged resolver state in the old process. Keep the purpose string regardless: it is correct hygiene and prevents a *silent* denial if the grant is ever reset. **If it recurs:** quit the app fully and relaunch first (cheapest fix); if still dead, check System Settings → Privacy & Security → Local Network; and remember plain `node bridge/test/...` is the clean way to prove whether the fault is the device/network or the Electron app. Cleanup done 2026-09-10: the three stale copies and two alias files were moved to Trash, v0.2.0 installed to `/Applications/RoastLogs Bridge.app` (the path the Dock pins, so the pin needed no change). | Nothing — closed, watch for recurrence |
| 3 | **Bridge code signing (root cause, optional)** — the app is ad-hoc signed with `Identifier=Electron`, `TeamIdentifier=not set`; electron-builder reports `0 valid identities` (the "Casey Dyer" cert is self-signed, `CSSMERR_TP_NOT_TRUSTED`). An ad-hoc identity changes on **every rebuild**, so macOS treats each build as a new app and any Local Network grant stops applying. A real Developer ID cert is the durable fix; without one, expect to re-approve the prompt after each rebuild. | Apple Developer account ($99/yr) — Case's call |
| 4 | **Future tables in `public` ship wide open at the grant layer** — `pg_default_acl` still auto-grants full CRUD to BOTH `anon` and `authenticated` for any *newly created* table in `public` (standard Supabase default). Harmless today: all five existing tables were explicitly locked down by `least_privilege_authenticated_grants`, and none carries a stray `anon` grant. But the NEXT table created needs that same treatment manually or it lands open. One-time fix so it stops depending on memory:<br>`alter default privileges in schema public revoke all on tables from anon;`<br>`alter default privileges in schema public revoke all on tables from authenticated;`<br>(Schema `private` already has no such default ACL.) Found by the security-auditor pass 2026-09-10; pre-existing, NOT from that day's change. | Case's go-ahead — changes behaviour for future tables, so it was left unapplied |
| 5 | **Security review Tier B — highest is `#1` Electron 32.3.3 is END-OF-LIFE** (no security patches; bridge audit 13 high + 1 critical `tar`). Must be its OWN isolated change with the bridge verified before and after; its ad-hoc signing identity changes on every rebuild, so expect a macOS Local Network prompt (see item #3). Also in Tier B: bridge password to Keychain/`safeStorage` and the `service_role`-JWT paste filter (the regex cannot see inside a base64 JWT); renderer CSP + IPC sender validation; CSV formula-prefix escaping. | Case's go-ahead |
| 6 | **Probe-fault health propagation** — the bridge receives `sensorHealth` and never publishes it, so a continuously faulting probe is indistinguishable from an unreachable device. Deferred from review finding `#3` because it changes the publish payload and needs a bridge rebuild — pair it with item #5. | Bundled with #5 |
| 7 | **Lockfile version drift** — `package.json` is 3.8.2, `package-lock.json` still says 3.7.0. Past releases bumped the three places but never the lockfile. `npm install` corrects it as a side effect. Fold into the next `/release`, not a standalone change. | Nothing — do it next release |

## Standing constraints

- **Deploys run on Case's machine only.** A build without his gitignored `.env`
  publishes a keyless bundle that locks both accounts out of the live site.
  Guard: confirm the deploy log reads `roastlogs@<expected> deploy`.
- **Playwright baselines regenerate on his Mac specifically, never a container
  and never a different OS.** Snapshot filenames carry the platform
  (`-darwin.png` vs. `-win32.png`), so running `--update-snapshots` on Windows
  can't validate against the real, approved baselines at all — it can only
  create a separate Windows-only set from scratch. Functional/DOM assertions
  (not screenshots) are the only thing cross-platform runs can actually prove.
- **Post-deploy smoke tests exist now:**
  `SMOKE_URL=https://caseydyer8.github.io/roastlogs/ npx playwright test -g @smoke`
- **Do not re-propose purging the device cache on sign-out.** Declined
  2026-09-03 with reasons; recorded in `CLAUDE.md`.
- **Do not re-propose the empty-cloud-tables backup guard.** The security-auditor
  proposed treating four empty tables in `gatherExportData` as an RLS denial
  (RLS filters rows rather than erroring, so a denial arrives as `[]` with no
  error). Sound reasoning, but the check false-alarms on a legitimately empty
  cloud with local-only roasts, and it is pre-existing. Declined 2026-09-12.
- **The anon/publishable key is PUBLIC by design** and already sits in the
  deployed bundle, so a container CAN build a valid bundle by fetching it from
  the Supabase API — the keyless-bundle risk is avoidable, not inherent. Note the
  **legacy JWT anon key is `disabled: true`** on the project; only
  `sb_publishable_…` works. A stale `.env` carrying the old JWT breaks auth outright.
- **`connectNulls` and interpolation must agree.** Before touching a
  null-rendering flag, check whether the series is dense-by-construction or
  sparse-by-construction. `RoastCurveChart` interpolates then carves out gaps, so
  the flag is correctly OFF. `LiveRoastChart` never interpolates, so OFF there
  made every 1s clock-drift hole look like a dropout. The device is a FIXED 1Hz —
  `eventsPerSecond: 5` in `bridge/lib/publisher.js` is a Realtime rate LIMIT, not
  a sample rate.

## Incident 2026-09-07 — the `is_admin` revoke took the whole app down

`REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM authenticated`
(`20260904232208`, committed as `docs/2026-09-04_revoke_is_admin_execute.sql`)
was believed safe because "policies call it as definer and keep working."
**That is false.** An RLS policy expression is evaluated with the privileges of
the role running the query, so the seven policies that call `is_admin()` did not
return false — they raised `permission denied for function is_admin`, failing
every authenticated statement.

Case hit it mid-roast: the Bridge showed `cloud error: realtime CHANNEL_ERROR`
(realtime's reason: *"Unauthorized: You do not have permissions to read from this
Channel topic: roastlink-live"*), and all four data tables were unreadable for
any signed-in user.

Reverted by `docs/2026-09-07_restore_is_admin_execute.sql`. Verified as the
`authenticated` role afterwards: is_admin callable, all four tables readable,
bridge READ + BROADCAST true, non-admin viewer READ still false.

**Process lessons:**
1. The 2026-09-04 pass verified the grant was gone and that advisors were clean,
   but never ran a query **as** `authenticated`. Anything touching `is_admin` or
   a policy needs `set local role authenticated` + a select from each RLS table
   before it is called done.
2. A deploy was cut from a **stale local clone** that day and briefly regressed
   Phase 2 on the live site. Always `git fetch && git status` against
   `origin/main` before `npm run build` — the Desktop Mac clone and the Windows
   clone drift.

**Still open, deferred by Case (he was mid-roast):** the Bridge also logs
`device error: getaddrinfo ENOTFOUND roastlink.local` while plain `node` on the
same Mac resolves that host and streams samples fine — so it is specific to the
Electron app, most likely macOS Local Network permission for
`/Users/casey/Desktop/RoastLogs Bridge.app` (denied/never-prompted grant, or a
TCC identity change from rebuilding and copying the .app). `codesign -d
--entitlements -` on that bundle is the next step. Note that running app is a
**Desktop copy** whose `app.asar` dates to Aug 27, older than `bridge/` here.
