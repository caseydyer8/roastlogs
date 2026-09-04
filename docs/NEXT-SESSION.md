# Open actions — read at session start

> Kept deliberately short: the `SessionStart` hook reads this file into context
> every session, so length here is a recurring token cost. Forward-looking only.
> History lives in `docs/2026-09-03-session-log.md` and in the commit messages.
> **Delete this file once the list is empty.**

## Pick up here

Equipment Phase 2 shipped and verified 2026-09-04 (gate, preheat screen,
comparison flag — real bridge + mock device, on Case's Windows machine, not
his usual Mac; see the standing constraint below). The `is_admin` REST oracle
closed the same day (`docs/2026-09-04_revoke_is_admin_execute.sql`). Nothing
else is half-finished.

| # | What | Blocked on |
|---|---|---|
| 1 | **App logo** — `public/favicon.ico` does not exist though `manifest.json` references it, `index.html` has no icon links at all, and `theme_color` is still the retired amber `#f59e0b` | **Case's source art. Do not invent a logo.** |
| 2 | **Harden the superseded-migration guards against `psql`** — they stop the Supabase SQL editor but `psql -f` defaults to `ON_ERROR_STOP=0`. Fix is `/*` after each `$guard$;` and `*/` at EOF | Case's call; optional |

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
