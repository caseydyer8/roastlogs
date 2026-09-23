---
name: rls-audit
description: Audit Supabase Row Level Security for RoastLogs — verify the live admin-only + MFA policy set against the database itself, walk each table's policies through read/write scenarios, and flag any permissive or aal2-less policy. Use before shipping auth/data changes or when the user asks about RLS.
verified-against: 2026-09-23
---

# RLS Audit

**Audit the database, not the migration files.** RLS is long since enabled and
locked down; the risk now is drift and accidental re-permissioning, not a
pending migration.

## The live model (verified 2026-09-23 against the live database — confirm, don't assume)

**19 policies.** 16 on the four data tables (`roasts`, `tasting_notes`,
`beans`, `roast_profiles` x select/insert/update/delete), all granted to
`authenticated` and requiring:

```
(select private.is_admin((select auth.uid()))) AND (select auth.jwt() ->> 'aal') = 'aal2'
```

Plus 3 on `realtime.messages` for the `roastlink-live` channel: read and
presence-write require `private.is_admin` + `aal2`; broadcast-write is bound
to the bridge identity only (no `is_admin`, no `aal2` — by design). **18 of the
19 call `private.is_admin`.** No policy calls a bare `public.is_admin`, and no
`is_admin` exists outside `private`.

`private.is_admin(uuid)` is SECURITY DEFINER with `search_path=''`;
`authenticated` holds EXECUTE (REQUIRED — revoking it is the 2026-09-04
outage), `anon` does not. `anon` holds zero grants on the four data tables.

How 2026-09-23 was verified (read-only, each in a rolled-back transaction,
`set local role authenticated`): no JWT → 0 rows on all four tables, no error;
an admin `sub` at `aal1` → 0 rows; the same admin at `aal2` → real rows. Plus
`pg_policies`, `pg_proc`, and `information_schema.role_table_grants`.

Current source of truth:

- `docs/2026-07-25_lock_to_admins_only.sql`
- `docs/2026-07-25_require_mfa_aal2.sql`
- `docs/2026-07-27_least_privilege_grants.sql`
- `docs/2026-08-28_lock_roastlink_live_channel.sql`
- `docs/2026-09-10_move_is_admin_to_private.sql`

**Superseded — do not read these as current.** `docs/enable_rls.sql`,
`docs/2026-07-18_beans_table.sql`, `docs/2026-07-21_multiuser_rls.sql` and
`docs/2026-07-21_roast_profiles_table.sql` describe retired models (permissive
and owner-or-admin), and `docs/2026-09-04_revoke_is_admin_execute.sql` is the
outage. Each carries a `raise exception` guard AND wraps everything after it in
a `/* … */` block comment (`psql -f` would otherwise run past the guard). A
missing guard or wrapper is itself a finding.

## Steps

1. **The permissive check — run this first.** Postgres ORs permissive policies
   together, so one wide-open policy does not replace the lockdown, it adds a
   path around it:
   ```sql
   SELECT tablename, policyname FROM pg_policies
   WHERE schemaname IN ('public','realtime') AND (qual = 'true' OR with_check = 'true');
   ```
   **Expect zero rows. Any row is CRITICAL.**

2. **Enumerate live state** — via Supabase MCP (`execute_sql`):
   ```sql
   SELECT relname, relrowsecurity FROM pg_class
   WHERE relnamespace = 'public'::regnamespace AND relkind = 'r';
   SELECT tablename, policyname, cmd, permissive, roles, qual, with_check
   FROM pg_policies WHERE schemaname IN ('public','realtime') ORDER BY 1, 2, 3;
   ```
   Expect 19 rows. Confirm every data-table policy carries BOTH
   `private.is_admin` and the `aal2` check. A policy with `is_admin` but no
   `aal2` is an MFA bypass — HIGH. A bare (unqualified) `is_admin` means the
   2026-09-10 move regressed.
   Also run `get_advisors`. If MCP isn't connected, say so explicitly and mark
   live state UNVERIFIED rather than inferring it from the .sql files.

3. **Walk the scenarios AS THE ROLE** — `begin; set local role authenticated;`
   then SELECT counts, then `rollback;`. Simulate a session with
   `select set_config('request.jwt.claims', '{"sub":"…","role":"authenticated","aal":"aal2"}', true);`.
   Read-only: SELECT only. An ERROR (rather than 0 rows) is the outage
   signature. For each table:
   - anonymous read / write → blocked
   - authenticated NON-admin (or an account not in `public.admins`) → blocked
   - authenticated admin at **aal1** (password only, no MFA code) → blocked
   - authenticated admin at **aal2** → allowed
   Note the third case: "signed in as the owner" is NOT sufficient under the
   current model, so do not report an owner-scoped grant as correct.

4. **Client check** — confirm the app only uses the publishable/anon key
   (never service_role) and that queries don't assume rows RLS will hide.
   The bridge machine identity holds a real password; check what it can reach.

5. **Report** — table-by-table verdict, gaps with ready-to-apply SQL fixes,
   and a clear headline: is the lockdown intact right now, and if not, which
   policy opened it.
