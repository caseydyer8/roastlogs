# Open actions — read at session start

> Kept deliberately short: the `SessionStart` hook reads this file into context
> every session, so length here is a recurring token cost. Forward-looking only.
> History lives in `docs/2026-09-03-session-log.md` and in the commit messages.
> **Delete this file once the list is empty.**

## Pick up here

Session 2026-09-10 closed three items. Live app untouched (**v3.8.1**, no
app-code change); all work was database + docs + the Bridge desktop app.

1. **`is_admin` REST oracle closed properly** — helper moved to the `private`
   schema (`docs/2026-09-10_move_is_admin_to_private.sql`). Advisor 0029 cleared,
   `POST /rest/v1/rpc/is_admin` now returns HTTP 404. Verified AS the
   authenticated role across all four CRUD paths, and the bridge re-joins the
   live channel (`SUBSCRIBED`).
2. **Superseded-migration guards hardened against `psql`** — all five now wrap
   everything after the guard in `/* … */`, so `ON_ERROR_STOP=0` has nothing
   left to run.
3. **Bridge rebuilt as v0.2.0** with the macOS Local Network purpose string.
   **Not yet confirmed fixed — see item #2 below.**

The **security-auditor** pass ran clean on the RLS change: all 18 policy
expressions unchanged except the schema prefix, zero permissive policies,
`private.is_admin` not executable by `anon`/`PUBLIC`, secrets history clean
(no `service_role` token ever committed). Verdict: safe to ship. Its one
actionable finding is item #5.

| # | What | Blocked on |
|---|---|---|
| 1 | **App logo** — `public/favicon.ico` does not exist though `manifest.json` references it, `index.html` has no icon links at all, and `theme_color` is still the retired amber `#f59e0b` | **Case's source art. Do not invent a logo.** |
| 2 | **Finish the Bridge `ENOTFOUND` fix** — install `bridge/dist/RoastLogs Bridge-0.2.0-arm64.dmg`, power the roaster ON, launch, and approve the macOS **Local Network** prompt. Then confirm the device lamp goes green. If it does not: System Settings → Privacy & Security → Local Network → toggle *RoastLogs Bridge* off and back on. **Baseline re-proven 2026-09-10 with the roaster ON:** `roastlink.local` resolves (192.168.1.120), port 81 open, and plain `node` ran the full bridge — `device OPEN`, live BT 75.6°F, **and `cloud status: joined`**. So the device, the network and the whole Supabase path are all proven good; the ONLY unproven leg is the Electron app itself. v0.2.0 was launched but the app has no auto-connect (`renderer/renderer.js:117` connects on a button click), so it needs a human to press **Connect**. | Case pressing Connect + approving the Local Network prompt |
| 3 | **Delete the duplicate Bridge app** — `/Applications/RoastLogs Bridge.app` AND `/Users/casey/Desktop/RoastLogs Bridge.app` both exist with the same ad-hoc identity, which muddles the Local Network permission entry. Keep ONE (the `/Applications` copy). Also `/Applications/RoastLogs Bridge 0.1.0-arm64` is stray. | Case's call — deleting apps wasn't mine to do |
| 4 | **Bridge code signing (root cause, optional)** — the app is ad-hoc signed with `Identifier=Electron`, `TeamIdentifier=not set`; electron-builder reports `0 valid identities` (the "Casey Dyer" cert is self-signed, `CSSMERR_TP_NOT_TRUSTED`). An ad-hoc identity changes on **every rebuild**, so macOS treats each build as a new app and any Local Network grant stops applying. A real Developer ID cert is the durable fix; without one, expect to re-approve the prompt after each rebuild. | Apple Developer account ($99/yr) — Case's call |

| 5 | **Future tables in `public` ship wide open at the grant layer** — `pg_default_acl` still auto-grants full CRUD to BOTH `anon` and `authenticated` for any *newly created* table in `public` (standard Supabase default). Harmless today: all five existing tables were explicitly locked down by `least_privilege_authenticated_grants`, and none carries a stray `anon` grant. But the NEXT table created needs that same treatment manually or it lands open. One-time fix so it stops depending on memory:<br>`alter default privileges in schema public revoke all on tables from anon;`<br>`alter default privileges in schema public revoke all on tables from authenticated;`<br>(Schema `private` already has no such default ACL.) Found by the security-auditor pass 2026-09-10; pre-existing, NOT from that day's change. | Case's go-ahead — changes behaviour for future tables, so it was left unapplied |

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
