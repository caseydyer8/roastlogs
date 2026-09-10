-- Migration: close the is_admin REST oracle by moving the helper out of the
--            PostgREST-exposed schema
-- Date: 2026-09-10   (migration name for apply_migration: move_is_admin_to_private_schema)
--
-- WHY: Supabase advisor 0029 flagged that public.is_admin was callable by any
-- signed-in account at /rest/v1/rpc/is_admin -- a small information-disclosure
-- oracle (it confirms whether a given uuid is an admin). It grants no row access
-- on its own, but there is no reason to expose it.
--
-- WHY NOT JUST REVOKE EXECUTE: that was tried on 2026-09-04
-- (docs/2026-09-04_revoke_is_admin_execute.sql, now guarded as superseded) and
-- took the entire app down. An RLS policy expression is evaluated with the
-- privileges of the role running the query, so all 18 policies that call
-- is_admin() raised "permission denied for function is_admin" instead of
-- returning false. `authenticated` MUST keep EXECUTE for RLS to work.
--
-- THE ACTUAL FIX is the third remediation the advisor itself lists: move the
-- function out of the exposed API schema. PostgREST only routes to its exposed
-- schemas (public, graphql_public), so a function in `private` has no REST
-- endpoint at all -- while RLS, which calls it inside the database, is
-- unaffected. Security posture is unchanged: still admin + aal2 for data,
-- bridge-only for broadcast.
--
-- 18 policies call is_admin: 16 on the data tables (beans, roasts,
-- roast_profiles, tasting_notes x select/insert/update/delete) and 2 on
-- realtime.messages (roastlink_live_read, roastlink_live_presence_write).
-- roastlink_live_broadcast_write checks only the bridge uid and is untouched.

-- 1. A schema PostgREST does not expose.
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
-- USAGE lets the authenticated role resolve the function during policy
-- evaluation. It does NOT make the schema reachable over REST.
grant usage on schema private to authenticated;

-- 2. The helper, behaviourally identical to the old public.is_admin.
create or replace function private.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (select 1 from public.admins a where a.user_id = uid);
$function$;

revoke all on function private.is_admin(uuid) from public;
revoke all on function private.is_admin(uuid) from anon;
grant execute on function private.is_admin(uuid) to authenticated;

-- 3. Repoint the 16 table policies. ALTER POLICY swaps the expression in place,
--    so there is never a moment where a table sits unprotected -- which a
--    drop-and-recreate would create.
do $$
declare
  t text;
  expr constant text :=
    '((select private.is_admin((select auth.uid()))) and (select auth.jwt() ->> ''aal'') = ''aal2'')';
begin
  foreach t in array array['beans','roasts','roast_profiles','tasting_notes'] loop
    execute format('alter policy %I on public.%I using (%s)',      'admin+mfa read '   || t, t, expr);
    execute format('alter policy %I on public.%I with check (%s)', 'admin+mfa insert ' || t, t, expr);
    execute format('alter policy %I on public.%I using (%s) with check (%s)',
                                                                   'admin+mfa update ' || t, t, expr, expr);
    execute format('alter policy %I on public.%I using (%s)',      'admin+mfa delete ' || t, t, expr);
  end loop;
end $$;

-- 4. Repoint the two realtime.messages policies that call is_admin.
alter policy "roastlink_live_read" on realtime.messages
using (
  realtime.topic() = 'roastlink-live'
  and (
    ((select private.is_admin((select auth.uid()))) and (select auth.jwt() ->> 'aal') = 'aal2')
    or (select auth.uid()) = 'fed19cb2-d312-41f6-8f7d-59e8e65c9d18'::uuid
  )
);

alter policy "roastlink_live_presence_write" on realtime.messages
with check (
  realtime.topic() = 'roastlink-live'
  and extension = 'presence'
  and (
    ((select private.is_admin((select auth.uid()))) and (select auth.jwt() ->> 'aal') = 'aal2')
    or (select auth.uid()) = 'fed19cb2-d312-41f6-8f7d-59e8e65c9d18'::uuid
  )
);

-- 5. Remove the exposed copy. Plain DROP, deliberately NOT CASCADE: if any
--    policy still referenced it this fails loudly rather than silently dropping
--    that policy and opening a hole.
drop function public.is_admin(uuid);

-- ============================================================================
-- VERIFIED 2026-09-10, as the `authenticated` role -- the check the 2026-09-04
-- attempt skipped, which is why it shipped an outage:
--
--   admin + aal2:
--     private.is_admin callable ................... OK
--     SELECT beans/roasts/roast_profiles/tasting_notes  OK (10/30/5/8 rows)
--     INSERT / UPDATE / DELETE beans .............. OK (all three)
--   admin WITHOUT mfa (aal1):
--     SELECT roasts ............................... 0 rows (aal2 still enforced)
--   bridge identity:
--     SELECT roasts ............................... 0 rows (no data access)
--     INSERT beans ................................ denied by RLS
--     READ roastlink-live ......................... true
--   oracle:
--     public.is_admin ............................. gone
--     POST /rest/v1/rpc/is_admin .................. HTTP 404 PGRST202
--     advisor 0029 ................................ cleared
--
--   The decisive test (from the security-auditor pass) -- asking PostgREST for
--   the private schema BY NAME and being refused at the protocol level:
--     POST /rest/v1/rpc/is_admin
--       + Accept-Profile: private
--       + Content-Profile: private
--     -> HTTP 406 PGRST106
--        "Invalid schema: private -- Only the following schemas are exposed: public"
--
--   That is why this fix works while KEEPING execute rights on the function:
--   the schema is unreachable over REST no matter what the caller asks for, so
--   there is no need to revoke the grant that RLS depends on.
--
-- ROLLBACK (restores the pre-2026-09-10 shape; the oracle reopens):
--   create or replace function public.is_admin(uid uuid) returns boolean
--     language sql stable security definer set search_path = '' as
--     $f$ select exists (select 1 from public.admins a where a.user_id = uid); $f$;
--   grant execute on function public.is_admin(uuid) to authenticated;
--   -- then re-run steps 3 and 4 with public.is_admin in place of private.is_admin,
--   -- and: drop function private.is_admin(uuid); drop schema private;
-- ============================================================================
