-- Migration: least-privilege grants for the `authenticated` role
-- Date: 2026-07-27   (migration name for apply_migration: least_privilege_authenticated_grants)
-- Applied + verified live 2026-07-27.
--
-- WHY: Supabase's default table grants give `authenticated` the full DML set,
-- including TRUNCATE, TRIGGER, and REFERENCES. The app (via PostgREST) only ever
-- issues SELECT/INSERT/UPDATE/DELETE, and all four are gated by the admin-only +
-- aal2 RLS policies. TRUNCATE is the notable risk: it is NOT subject to RLS, so a
-- grant of it is a privilege that bypasses the row-level protections. TRIGGER and
-- REFERENCES are likewise unused. Removing the three unused privileges is pure
-- attack-surface reduction with zero effect on app behaviour.
--
-- VERIFIED after apply: `authenticated` holds exactly DELETE,INSERT,SELECT,UPDATE
-- on all four data tables.

revoke truncate, trigger, references
  on public.roasts, public.tasting_notes, public.beans, public.roast_profiles
  from authenticated;

-- ROLLBACK (restores the Supabase default grant set):
--   grant truncate, trigger, references
--     on public.roasts, public.tasting_notes, public.beans, public.roast_profiles
--     to authenticated;
