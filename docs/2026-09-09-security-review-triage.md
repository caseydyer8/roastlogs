# Security review triage — 2026-09-09 (revised 2026-09-11)

Source: `roastlogs-security-review.md` (Google Drive, reviewed 9 Sep 2026 against
`main` @ `9ee61f1`, v3.8.1). This file is the **triage + plan**, not the review.

> **Revision note:** the review's baseline is `9ee61f1`. Case's MacBook session on
> **2026-09-10** (`c16fb35`, `3e30cb26`) has since closed finding **#11** and
> shipped Bridge v0.2.0. Re-verified against live infrastructure on 2026-09-11.

> **Headline:** all 12 findings were technically accurate at the code level. None
> is a remote takeover. The most valuable one (#2) is not really a security bug —
> it is a data-integrity bug that corrupts Case's roast history on every Wi-Fi
> blip, with no attacker involved.

## Independent verification (live, 2026-09-11)

The review explicitly could **not** check the live database and said so honestly
("Repository comments saying 'verified live' are historical statements"). That
gap is now closed — read-only queries against the live project:

| Check | Result |
|---|---|
| Total policies (`public` + `realtime`) | **19** |
| Bound to `private.is_admin` | **18** |
| Require `aal = aal2` | **18** |
| Permissive `USING (true)` | **0** |
| 19th policy | `roastlink_live_broadcast_write` — bridge UUID only, correct by design |
| `public.is_admin` still exists? | **No — gone.** Only `private.is_admin` remains |
| `private.is_admin` | SECURITY DEFINER, `search_path=""`, EXECUTE to `authenticated` only (not `anon`, not `PUBLIC`) |
| `anon` grants on the four data tables | **Zero** |
| `admins` table grants | **Zero** to `anon` and `authenticated` |
| Live bundle | v3.8.1, **0** occurrences of the `roastlogs_e2e` bypass marker |
| Live headers | HSTS **present** (`max-age=31556952`); no `X-Frame-Options` |
| Row counts | roasts 30, tasting_notes 8, beans 10, roast_profiles 5 |

**The security model is deployed exactly as `CLAUDE.md` claims it is.** That is
the most important line in this document.

## Where the review is wrong or overstated

1. **Finding 7 (backups) is two issues, not one, with very different urgency.**
   Cloud profiles genuinely are not fetched during backup — real, present bug.
   The unpaginated `select('*')` is real but **cannot bite at 30 rows**; the
   PostgREST cap is orders of magnitude away. Fix the first now, defer the second.
2. **Finding 7 misses an existing strength.** `gatherExportData` already throws
   rather than writing a partial file when a table is unreachable. The review
   read the fetch helpers but not that guard.
3. **Finding 2 overstates one mechanism and misses another.** Stale readings are
   *constant*, and the ladder fires only on a **rising** crossing
   (`prev.bt < step.f && bt >= step.f`), so flat stale data cannot fabricate a
   milestone. But when signal **returns** after a gap, `prev` is the pre-gap value
   and the interpolation spans the whole dead window — placing a real milestone at
   a **wrong time inside the gap**. Different mechanism, same fix.
4. **Finding 9 (sign-out purge) was already considered and declined** on
   2026-09-03 with reasons recorded in `CLAUDE.md`. Not reopening it.
5. **The HSTS note is a fair catch against us.** `public/index.html` says HSTS is
   unavailable on GitHub Pages. It is being sent. Our comment is stale.

## Tiers

### Tier A — do now. Real harm, small blast radius.

| # | Finding | Who is harmed, how | Fix | Breakage risk |
|---|---|---|---|---|
| 2 | Curve records stale temps | **Case, every roast, no attacker.** A dropped sample paints a flat fake segment into saved history, and a gap misplaces milestones | Gate recording on a fresh sample; record gaps as gaps | **Medium — must confirm `RoastCurveChart` renders gaps** before merging |
| 3 | No device message validation | **A faulty thermocouple**, not a hacker, is the realistic trigger. `null` frame throws; `bt:1e309` -> `Infinity`; `bt:-9999` accepted | Validate shape + finite + probe bounds, reject without throwing | Low — reject-path only |
| 7a | Backup omits cloud profiles | **Case, on restore to a fresh device.** Profiles sync up but are not pulled back down into the backup file | Add the profiles fetch to `gatherExportData` | Low — additive |
| 8 | MFA fail-open on returned error | **Case's local cache.** `!!data && ...` means a returned (not thrown) error yields `needMfa=false` and shows the app shell | Treat returned error/missing data same as the catch block | Low — 4 lines, fails closed |

Note on #8: the RLS gate is server-side and unaffected. This is UI honesty, not
an MFA bypass. Cheap enough to just fix.

### Tier B — worth doing, needs more care.

- **#1 Electron 32.3.3 is end-of-life** (no security patches). `bridge/package.json`
  still pins `^32.0.0` — the 09-10 session bumped the Bridge app to v0.2.0 and
  added `NSLocalNetworkUsageDescription`, but **did not change the Electron major**.
  Bridge audit: 14 vulns, 13 high + 1 critical (`tar`) — re-run confirms the
  review's numbers exactly.
  **Risk calculus changed for the better:** the bridge now holds verified live
  sockets to both the roaster and Supabase, so there is a known-good baseline to
  regress against — which there was not on 09-09. Still do it as its own isolated
  change, never bundled. Caveat from `NEXT-SESSION.md`: the ENOTFOUND root cause
  was never proven, and an ad-hoc signing identity changes on **every rebuild**,
  so a rebuild may re-trigger the macOS Local Network prompt.
- **#5 Credentials + key filter.** The regex `/^sb_secret_|service_role/i` cannot
  see inside a base64 JWT, so a legacy `service_role` JWT passes. Real, but it
  only fires if Case pastes the wrong key. Keychain/`safeStorage` is the larger
  half.
- **#6 Electron containment** — renderer CSP, sandbox, navigation/permission
  denial, IPC sender validation. Pure defense-in-depth; no known entry point.
- **#10 CSV formula prefixes.** ~3 lines. Threat is close to zero (no
  unauthenticated write path; Case is the only author of his own notes), but it
  is cheap.

### Tier C — decline or defer, with reasons.

- **#4 `ws://` to RoastLink has no TLS.** Correct, and **not fixable in this
  repo** — the device firmware decides. The answer is network segmentation (IoT
  VLAN, no port forwarding), which is a router task, not a code change.
- **#9 Sign-out purge.** Already declined 2026-09-03. Standing.
- **#7b Pagination.** Not a risk at 30 rows. Revisit near ~500.
- **#12 Integration test environment.** Legitimate but large.

### CLOSED since the review was written

- **#11 `is_admin` information oracle — FIXED 2026-09-10, verified live 2026-09-11.**
  Helper moved to the `private` schema (`docs/2026-09-10_move_is_admin_to_private.sql`);
  `public.is_admin` no longer exists, so `POST /rest/v1/rpc/is_admin` returns 404.
  All 18 dependent policy expressions repointed, `aal2` intact, zero permissive
  policies. The review independently reached our own conclusion — *do not repeat
  the standalone EXECUTE revoke* — and the schema move is exactly the right fix.

## Adjacent item, independently confirmed today

`NEXT-SESSION.md` item **#4** (found by the security-auditor on 09-10, awaiting
Case's go-ahead) is **confirmed by direct query**: `pg_default_acl` for schema
`public`, object type `r` (tables), still grants `arwdDxtm` — full CRUD — to
**both `anon` and `authenticated`**.

Harmless today: all existing tables were explicitly locked down and none carries
a stray `anon` grant. But the **next** table created in `public` lands wide open
at the grant layer unless treated manually. Schema `private` has no such default
ACL. This is a Supabase default, not a RoastLogs regression.

## Open question for Case

The review notes `caseydyer8.github.io` is a **shared origin** — browser storage
is origin-scoped, not path-scoped. If any other project Pages site exists under
that hostname, a flaw in it could reach RoastLogs' stored session. **Are there
other Pages sites on that account?** If no, this is moot. If yes, it is the most
structurally significant item in the whole review.

## Docs to correct regardless

- `public/index.html`: the HSTS comment is wrong — it is being sent.
- `CLAUDE.md`: record the 2026-09-11 live verification above.
