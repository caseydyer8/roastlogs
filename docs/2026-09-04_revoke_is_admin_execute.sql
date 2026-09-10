-- ============================================================================
-- SUPERSEDED 2026-09-07 -- DO NOT RUN. This migration took the whole app down.
--
-- The reasoning below ("unaffected by revoking the direct EXECUTE grant") is
-- WRONG. An RLS policy expression is evaluated with the privileges of the role
-- running the query, not the definer of the function it calls. With EXECUTE
-- revoked from `authenticated`, the seven policies that call is_admin() did not
-- evaluate to false -- they raised `permission denied for function is_admin`,
-- so every authenticated statement failed outright.
--
-- The 2026-09-04 verification missed it because it checked the grant and the
-- Supabase advisors, but never ran a query AS the authenticated role. Measured
-- on 2026-09-07, with the grant removed:
--     beans / roasts / roast_profiles / tasting_notes
--         -> ERROR: permission denied for function is_admin
--     realtime join on roastlink-live
--         -> "Unauthorized: You do not have permissions to read from this
--             Channel topic: roastlink-live"   (bridge showed CHANNEL_ERROR)
--
-- Reverted by docs/2026-09-07_restore_is_admin_execute.sql.
--
-- The underlying REST-oracle concern is still valid and still open. The correct
-- fix is to move the helper to a schema PostgREST does not expose
-- (private.is_admin) and repoint all seven policies at it -- NOT to revoke
-- EXECUTE from authenticated.
--
-- The guard block below is what stops a paste-and-run accident.
-- ============================================================================
do $guard$
begin
  raise exception 'SUPERSEDED MIGRATION -- refusing to run. See the banner '
    'at the top of docs/2026-09-04_revoke_is_admin_execute.sql.';
end
$guard$;

-- ---------------------------------------------------------------------------
-- psql hardening: the raise-exception guard above stops the Supabase SQL editor
-- and anything running with ON_ERROR_STOP=on, but `psql -f` defaults to
-- ON_ERROR_STOP=0 -- it would report the error and then cheerfully run every
-- statement below it. Wrapping the remainder in a block comment makes the rest
-- of this file inert to ANY client: psql never even sends it. To actually
-- re-run this migration you must delete the guard block AND this comment
-- wrapper, which is exactly the deliberate act the guard is meant to require.
-- ---------------------------------------------------------------------------
/*

-- Close the is_admin(uuid) REST oracle.
--
-- Before this, `authenticated` (any logged-in account) could call
-- is_admin(some-uuid) directly via the REST/GraphQL API and get a true/false
-- answer -- a minor information-disclosure oracle (confirms whether a given
-- UUID is one of the two admin accounts), not an access hole: it grants no
-- row access on its own.
--
-- Safe because every RLS policy that calls is_admin() does so as part of
-- policy evaluation, which is unaffected by revoking the direct EXECUTE grant
-- from `authenticated`. Verified live 2026-09-04: grant removed
-- (information_schema.routine_privileges no longer lists `authenticated` for
-- is_admin), Supabase security advisors show no new findings, and no
-- previously-passing check regressed.
--
-- Applied via Supabase MCP apply_migration
-- (revoke_is_admin_execute_from_authenticated) directly against the project;
-- this file is the durable record alongside the other dated migrations here.

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM authenticated;
*/
-- end psql-hardening wrapper
