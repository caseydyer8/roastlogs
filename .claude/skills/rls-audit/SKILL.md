---
name: rls-audit
description: Audit Supabase Row Level Security for RoastLogs — review docs/enable_rls.sql, check whether RLS is actually enabled on the live project, and walk each table's policies against read/write scenarios. Use before shipping auth/data changes or when the user asks about RLS.
---

# RLS Audit

The RLS migration (`docs/enable_rls.sql`) was written but must be run manually
against Supabase — **assume RLS is OFF until proven otherwise**. This audit
verifies the actual state, not the intended one.

## Steps

1. **Read the migration** — `docs/enable_rls.sql`. List every table it
   touches and every policy it creates (operation, role, USING/WITH CHECK).

2. **Check live state** — if Supabase MCP tools are available, use
   `list_tables` / `execute_sql` to query actual state:
   ```sql
   SELECT relname, relrowsecurity FROM pg_class
   WHERE relnamespace = 'public'::regnamespace AND relkind = 'r';
   SELECT * FROM pg_policies WHERE schemaname = 'public';
   ```
   Also run `get_advisors` for security findings. If MCP isn't connected,
   say so explicitly and mark live state UNVERIFIED.

3. **Walk the scenarios** — for each table, reason through:
   - anonymous read / write → should be blocked
   - authenticated user reading/writing **their own** rows → allowed
   - authenticated user reading/writing **another user's** rows → blocked
   Flag any policy that is over-permissive (e.g. `USING (true)`), any table
   with RLS enabled but no policies (silently blocks everything), and any
   table missing from the migration entirely.

4. **Client check** — confirm the app only uses the publishable/anon key
   (never service_role) and that queries don't assume rows RLS will hide.

5. **Report** — table-by-table verdict (RLS on? policies correct?), gaps with
   ready-to-apply SQL fixes, and a clear headline: is the app safe to ship
   right now, or is the manual migration still pending?
