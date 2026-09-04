# Open actions — read at session start

> Surfaced automatically by the `SessionStart` hook in `.claude/settings.json`.
> **Delete this file once these are done.**

## Where things stand

**v3.6.0 is shipped and verified live** (2026-09-04): bundle
`main.929346fc.js` -> `main.b52fce7d.js`, `3.6.0` in the shipped JS, `3.5.0`
gone, gh-pages `e414a14`, edge byte-identical to gh-pages. PR #13 merged.
Playwright 38/38 green on Case's machine. Nothing is half-finished.

That release carried: the History chart mirroring the live instrument, the
shared phase vocabulary in `src/lib/roastPhases.js`, dev time derived from the
two marks instead of a drifting interval, no duplicate `00:00` row, time and
temperature on every timeline row, ladder crossings marked AT their threshold,
and Discard clearing the curve it used to leave behind.

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

## 2. Two security findings from the pre-merge audit, deliberately not shipped

**Superseded migrations are still runnable — this is the one with teeth.**
`docs/enable_rls.sql` (6 x `USING (true)`), `docs/2026-07-18_beans_table.sql`
(4), and `docs/2026-07-21_multiuser_rls.sql` (2) carry no "do not run" marker.
Postgres ORs permissive policies, so re-running any of them does not replace the
admin+`aal2` policies — it adds a parallel path around them, granting every
authenticated session full CRUD at `aal1`, including the bridge machine
identity whose password sits in plaintext in `~/.roastlogs-bridge.json`. One
"let me just re-apply the schema" moment silently undoes the 2026-07-25
lockdown. Fix is a `SUPERSEDED - DO NOT RUN` banner at the top of each file, or
moving all three to `docs/archive/`.

**Sign-out does not clear the device cache.** `AuthContext.signOut` drops the
session but leaves `roasts`, `beans`, `global_profiles` and every `live_*` key
in localStorage, so anyone with the unlocked Mac afterwards reads all roast data
with no credential. `enforceLocalDataOwner` only fires when a DIFFERENT account
signs in. The fix is to call `purgeCachedUserData(USER_DATA_KEYS, { includeLive:
true })` in `signOut` — but that discards an IN-PROGRESS ROAST on sign-out, so
Case has to decide whether that trade is right before it goes in.

Lower priority from the same audit: a legacy anon JWT sits in git history (blob
`5da1ce70`, `.env.save`, unreachable from HEAD, valid to 2036) — public by
design and there are zero `anon` grants, so the action is simply to disable
legacy JWT keys in the Supabase dashboard, no history rewrite. And
`bridge/main.js` writes `~/.roastlogs-bridge.json` at 0644 with the bridge
password in plaintext; add `{ mode: 0o600 }` and `chmod 600` the existing file.

**One thing Case still needs to run himself** — the audit could not reach the
database. In the Supabase SQL editor:

```sql
SELECT tablename, policyname FROM pg_policies
WHERE schemaname='public' AND (qual = 'true' OR with_check = 'true');
```

Expect **zero rows**. Anything returned means a permissive policy is live.

## 3. Equipment field — still unbuilt

A roaster/tube selector in session setup: SR540 bare, OEM extension tube, V5T
Razzo. Specified in `docs/roastlink-live-data-plan.md`. It drives the 315F
preheat warning and records which tube a roast used, without which History
comparisons mislead. Deliberately NOT wired to rail-versus-curve visibility.

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
