# Open actions — read at session start

> Kept deliberately short: the `SessionStart` hook reads this file into context
> every session, so length here is a recurring token cost. Forward-looking only.
> History lives in `docs/2026-09-03-session-log.md` and in the commit messages.
> **Delete this file once the list is empty.**

## Pick up here

Nothing is half-finished. Working tree clean, `main` pushed, live site verified
at **v3.7.0**.

| # | What | Blocked on |
|---|---|---|
| 1 | **Equipment Phase 2** — capability gate (hide live mode when the setup has no probe), 315°F preheat screen, cross-equipment comparison flags. Spec: `docs/roastlink-live-data-plan.md`; Phase 1 context: `docs/equipment-field-plan.md` | Nothing |
| 2 | **App logo** — `public/favicon.ico` does not exist though `manifest.json` references it, `index.html` has no icon links at all, and `theme_color` is still the retired amber `#f59e0b` | **Case's source art. Do not invent a logo.** |
| 3 | **Close the `is_admin` REST oracle** — `REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM authenticated;` Policies call it as definer and keep working | Case's go-ahead |
| 4 | **Harden the superseded-migration guards against `psql`** — they stop the Supabase SQL editor but `psql -f` defaults to `ON_ERROR_STOP=0`. Fix is `/*` after each `$guard$;` and `*/` at EOF | Case's call; optional |

**Biggest value: #1** — unblocked, and equipment values start accumulating with
the next roast. **Fastest win: #3** — one statement in the SQL editor.

## Standing constraints

- **Deploys run on Case's machine only.** A build without his gitignored `.env`
  publishes a keyless bundle that locks both accounts out of the live site.
  Guard: confirm the deploy log reads `roastlogs@<expected> deploy`.
- **Playwright baselines regenerate on his machine, never in a cloud container**
  — container fonts differ by ~2px and Playwright rejects on size before
  `maxDiffPixelRatio` applies.
- **Post-deploy smoke tests exist now:**
  `SMOKE_URL=https://caseydyer8.github.io/roastlogs/ npx playwright test -g @smoke`
- **Do not re-propose purging the device cache on sign-out.** Declined
  2026-09-03 with reasons; recorded in `CLAUDE.md`.
