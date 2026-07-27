-- Migration: lock RoastLogs to the two admin accounts ONLY (private personal app)
-- Date: 2026-07-25   (migration name for apply_migration: lock_to_admins_only)
--
-- WHY: Plans changed — RoastLogs is NOT being opened to other users. It is a
-- private app for Casey's two accounts. This replaces the multi-user
-- "owner-or-admin" policies with a strict "admin-only" rule: only the two
-- accounts registered in public.admins can read or write ANYTHING. Every other
-- account — including any that might somehow be created despite signups being
-- disabled — is denied by default (RLS is deny-by-default; no matching policy =
-- no access).
--
-- This is DEFENSE IN DEPTH: disabled signups is gate 1 (nobody can make an
-- account); this admin-only rule is gate 2 (even if an account existed, it can
-- touch nothing). The security no longer depends on a single setting.
--
-- SAFE + REVERSIBLE: touches only POLICIES, not rows or columns. No data can be
-- lost. The user_id column is kept for provenance (which of the two accounts
-- created a row). To revert, restore the owner-or-admin block from
-- docs/2026-07-21_multiuser_rls.sql.
--
-- NOTE: these policies do NOT include the aal2 (MFA) requirement. That was
-- intentional at the time (adding it before the client supported the MFA
-- challenge, or before both accounts had a verified factor, would have locked
-- both accounts out). As of 2026-07-27 the follow-up migration
-- docs/2026-07-25_require_mfa_aal2.sql IS applied live and DOES require aal2, so
-- this file now serves as the ROLLBACK: re-running it restores admin-only access
-- at password-level (aal1) if a login ever can't reach the second factor.

-- 1. Drop every existing policy on the four synced tables (name-agnostic).
do $$
declare pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('roasts', 'tasting_notes', 'beans', 'roast_profiles')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- 2. Recreate as admin-only. `(select public.is_admin((select auth.uid())))` is
--    wrapped in a scalar subquery per Supabase's RLS performance guidance
--    (evaluated once per statement, not once per row).

-- ---- roasts ----------------------------------------------------------------
create policy "admins only read roasts"   on public.roasts for select to authenticated
  using      ( (select public.is_admin((select auth.uid()))) );
create policy "admins only insert roasts" on public.roasts for insert to authenticated
  with check ( (select public.is_admin((select auth.uid()))) );
create policy "admins only update roasts" on public.roasts for update to authenticated
  using      ( (select public.is_admin((select auth.uid()))) )
  with check ( (select public.is_admin((select auth.uid()))) );
create policy "admins only delete roasts" on public.roasts for delete to authenticated
  using      ( (select public.is_admin((select auth.uid()))) );

-- ---- tasting_notes ---------------------------------------------------------
create policy "admins only read tasting_notes"   on public.tasting_notes for select to authenticated
  using      ( (select public.is_admin((select auth.uid()))) );
create policy "admins only insert tasting_notes" on public.tasting_notes for insert to authenticated
  with check ( (select public.is_admin((select auth.uid()))) );
create policy "admins only update tasting_notes" on public.tasting_notes for update to authenticated
  using      ( (select public.is_admin((select auth.uid()))) )
  with check ( (select public.is_admin((select auth.uid()))) );
create policy "admins only delete tasting_notes" on public.tasting_notes for delete to authenticated
  using      ( (select public.is_admin((select auth.uid()))) );

-- ---- beans -----------------------------------------------------------------
create policy "admins only read beans"   on public.beans for select to authenticated
  using      ( (select public.is_admin((select auth.uid()))) );
create policy "admins only insert beans" on public.beans for insert to authenticated
  with check ( (select public.is_admin((select auth.uid()))) );
create policy "admins only update beans" on public.beans for update to authenticated
  using      ( (select public.is_admin((select auth.uid()))) )
  with check ( (select public.is_admin((select auth.uid()))) );
create policy "admins only delete beans" on public.beans for delete to authenticated
  using      ( (select public.is_admin((select auth.uid()))) );

-- ---- roast_profiles --------------------------------------------------------
create policy "admins only read roast_profiles"   on public.roast_profiles for select to authenticated
  using      ( (select public.is_admin((select auth.uid()))) );
create policy "admins only insert roast_profiles" on public.roast_profiles for insert to authenticated
  with check ( (select public.is_admin((select auth.uid()))) );
create policy "admins only update roast_profiles" on public.roast_profiles for update to authenticated
  using      ( (select public.is_admin((select auth.uid()))) )
  with check ( (select public.is_admin((select auth.uid()))) );
create policy "admins only delete roast_profiles" on public.roast_profiles for delete to authenticated
  using      ( (select public.is_admin((select auth.uid()))) );

-- anon grants were already revoked in the multi-user migration; re-assert for safety.
revoke select, insert, update, delete
  on public.roasts, public.tasting_notes, public.beans, public.roast_profiles
  from anon;
