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
