---
name: rls-audit
description: Audit Supabase Row Level Security for RoastLogs — verify the live admin-only + MFA policy set against the database itself, walk each table's policies through read/write scenarios, and flag any permissive or aal2-less policy. Use before shipping auth/data changes or when the user asks about RLS.
---

# RLS Audit

**Audit the database, not the migration files.** RLS is long since enabled and
locked down; the risk now is drift and accidental re-permissioning, not a
pending migration.

## The live model (verified 2026-09-03 — confirm, don't assume)

All 16 policies (`roasts`, `tasting_notes`, `beans`, `roast_profiles` x
select/insert/update/delete) are granted to `authenticated` and require:

```
is_admin(auth.uid()) AND auth.jwt()->>'aal' = 'aal2'
```

So a password-only session reaches nothing — MFA is part of the authorization
rule, not just the login flow. Current source of truth:

- `docs/2026-07-25_lock_to_admins_only.sql`
- `docs/2026-07-25_require_mfa_aal2.sql`
- `docs/2026-07-27_least_privilege_grants.sql`

**Superseded — do not read these as current.** `docs/enable_rls.sql`,
`docs/2026-07-18_beans_table.sql`, `docs/2026-07-21_multiuser_rls.sql` and
`docs/2026-07-21_roast_profiles_table.sql` describe retired models (permissive
and owner-or-admin). Each carries a `raise exception` guard so it cannot be
pasted and run by accident. A missing guard is itself a finding.

## Steps

1. **The permissive check — run this first.** Postgres ORs permissive policies
   together, so one wide-open policy does not replace the lockdown, it adds a
   path around it:
   ```sql
   SELECT tablename, policyname FROM pg_policies
   WHERE schemaname='public' AND (qual = 'true' OR with_check = 'true');
   ```
   **Expect zero rows. Any row is CRITICAL.**

2. **Enumerate live state** — via Supabase MCP (`execute_sql`):
   ```sql
   SELECT relname, relrowsecurity FROM pg_class
   WHERE relnamespace = 'public'::regnamespace AND relkind = 'r';
   SELECT tablename, policyname, cmd, permissive, roles, qual, with_check
   FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, cmd;
   ```
   Confirm every policy carries BOTH the `is_admin` check and the `aal2`
   check. A policy with `is_admin` but no `aal2` is an MFA bypass — HIGH.
   Also run `get_advisors`. If MCP isn't connected, say so explicitly and mark
   live state UNVERIFIED rather than inferring it from the .sql files.

3. **Walk the scenarios** — for each table:
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
