# Open actions — read at session start

> Kept deliberately short: the `SessionStart` hook reads this file into context
> every session, so length here is a recurring token cost. Forward-looking only.
> History lives in `docs/2026-09-03-session-log.md` and in the commit messages.
> **Delete this file once the list is empty.**

## Pick up here

Equipment Phase 2 shipped and verified 2026-09-04 (gate, preheat screen,
comparison flag — real bridge + mock device, on Case's Windows machine, not
his usual Mac; see the standing constraint below).

**The `is_admin` REST-oracle revoke from 2026-09-04 was reverted on 2026-09-07 —
it had taken the entire app down. See the incident note at the bottom. That
migration file is now guarded as superseded; the concern behind it is still open
as item #2.** Live is at **v3.8.1** (the revert + docs, no app-code change).

| # | What | Blocked on |
|---|---|---|
| 1 | **App logo** — `public/favicon.ico` does not exist though `manifest.json` references it, `index.html` has no icon links at all, and `theme_color` is still the retired amber `#f59e0b` | **Case's source art. Do not invent a logo.** |
| 2 | **Close the `is_admin` REST oracle properly** — move the helper to `private.is_admin` (a schema PostgREST does not expose) and repoint all seven policies, granting EXECUTE on the new one to `authenticated`. **Do NOT just revoke EXECUTE from `authenticated` — that was tried on 2026-09-04 and broke every policy.** | Case's go-ahead |
| 3 | **Harden the superseded-migration guards against `psql`** — they stop the Supabase SQL editor but `psql -f` defaults to `ON_ERROR_STOP=0`. Fix is `/*` after each `$guard$;` and `*/` at EOF | Case's call; optional |

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
