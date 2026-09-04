# Open actions — read at session start

> Surfaced automatically by the `SessionStart` hook in `.claude/settings.json`.
> **Delete this file once the Pick up here list is empty.**

## Pick up here

Nothing is half-finished. Working tree clean, `main` pushed, live site verified.
These are the next things to start, in the order I'd take them.

| # | What | Blocked on | Detail |
|---|---|---|---|
| 1 | **Equipment Phase 2** — capability gate, 315°F preheat screen, cross-equipment comparison flags | Nothing | § 3 |
| 2 | **App logo** — favicon + apple-touch icons, wire `index.html` and `manifest.json`, fix `theme_color` | **Your source art.** Do not invent a logo | § 1 |
| 3 | **Close the `is_admin` REST oracle** — one `REVOKE`, near-zero impact | Your go-ahead | § 2 |
| 4 | **Harden the migration guards against `psql`** — optional | Your call | § 2 |

**Biggest-value next step: #1.** It is unblocked, and the equipment values it
depends on start accumulating with the very next roast.

**Fastest win: #3.** A single SQL statement in the Supabase dashboard.

## Where things stand

**v3.7.0 is shipped and deploy-verified live** (2026-09-03): commit `b56afed3`,
bundle `main.09fd5605.js`, gh-pages `475d1bcc`, `appVersion:"3.7.0"` confirmed
in the served bundle, Supabase keys present (not a keyless build). The CDN
served a stale bundle on the first verification pass and matched after one
60-second retry — which is exactly why the bundle-hash check exists.

Since then, `45c607d3` added the post-deploy smoke tests (§ 2b). Not deployed —
tests do not ship to the site.

**Three releases on 2026-09-03:**

1. **v3.6.1** — security cleanup: `raise exception` guards on four superseded
   migrations, rewritten `rls-audit` skill and `security-auditor` /
   `deploy-verifier` agents (all three had drifted into being actively wrong),
   bridge settings file locked to `0600`. Detail in § 2.
2. **v3.7.0** — equipment field Phase 1: which roaster setup each roast used.
   Detail in § 3.
3. Plus the smoke tests in § 2b, and the bridge account password rotated (old
   password verified rejected). Legacy Supabase JWT API keys were already
   disabled back on 2026-08-08 — confirmed live, nothing to do.

**Verified live 2026-09-03:** zero permissive RLS policies; all 16 require
`is_admin(auth.uid()) AND aal = 'aal2'`. Supabase sessions carry no timeout, so
one MFA challenge lasts weeks — a session created 2026-08-08 was still
refreshing on 2026-09-04.

**Prior release, v3.6.0**, carried: the History chart mirroring the live
instrument, the shared phase vocabulary in `src/lib/roastPhases.js`, dev time
derived from the two marks instead of a drifting interval, no duplicate `00:00`
row, time and temperature on every timeline row, ladder crossings marked AT
their threshold, and Discard clearing the curve it used to leave behind.

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

### Two low-priority items from the audit, not done

Neither is urgent; both were surfaced 2026-09-03 and consciously left.

- **`is_admin` is callable over REST.** `public.is_admin(uuid)` is
  `SECURITY DEFINER` and `EXECUTE`-able by `authenticated`, so any authenticated
  caller can ask `/rest/v1/rpc/is_admin` whether a UUID they already hold is an
  admin. Near-zero impact with two accounts, both admins. To close it:
  `REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM authenticated;` — the
  RLS policies call it as the definer and keep working.
- **The superseded-migration guards assume the Supabase SQL editor**, which runs
  a file as one transaction so `raise exception` aborts everything. `psql -f`
  defaults to `ON_ERROR_STOP=0` and would print the error then run the rest of
  the file anyway. To close it, add `/*` right after each `$guard$;` and `*/` at
  EOF — checked, none of the four files contains a `*/` that would end the
  comment early. Not applied: it makes each file read as entirely commented-out,
  and the SQL editor is the documented path.

## 2b. Post-deploy smoke tests — BUILT 2026-09-03

`deploy-verifier` step 6 had silently skipped after every deploy because no test
carried the `@smoke` tag. Two now do, in `e2e/smoke.spec.js`, and they run
against the LIVE site:

```
SMOKE_URL=https://caseydyer8.github.io/roastlogs/ npx playwright test -g @smoke
```

`playwright.config.js` drops its `webServer` when `SMOKE_URL` is set — starting a
local dev server would prove nothing about a deploy. With no `SMOKE_URL` they run
against localhost as part of the normal suite, so they cannot silently rot.

**What they prove that `HTTP 200` does not:** the shipped bundle parses, React
mounts, and the app reaches the login gate; the served bundle carries the
expected `appVersion`; and the Supabase URL and publishable key are present. A
keyless build — one made without the gitignored `.env` — returns 200 for the HTML
while locking both accounts out, and would fail here.

They are unauthenticated by design. Every other test relies on the E2E auth
bypass in `src/index.js`, which is gated on `NODE_ENV === "development"` and does
not exist in a production build.

Ran green against v3.7.0 live on 2026-09-03. **Gotcha worth remembering:** the
live site is served from a subpath (`/roastlogs/`), so tests must use
`page.goto("./")` — a leading `/` resolves against the domain root and silently
tests the wrong page. That bug was caught on the first run.

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
