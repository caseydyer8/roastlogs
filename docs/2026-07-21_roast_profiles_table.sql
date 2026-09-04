-- ============================================================================
-- ⛔  SUPERSEDED — DO NOT RUN  ⛔
-- ----------------------------------------------------------------------------
-- Retired 2026-09-03. The live policy set is admin-only + MFA, defined by:
--     docs/2026-07-25_lock_to_admins_only.sql
--     docs/2026-07-25_require_mfa_aal2.sql
--     docs/2026-07-27_least_privilege_grants.sql
--
-- WHY RUNNING THIS IS DANGEROUS: the policies below are owner-or-admin and
-- carry NO aal2 requirement. Postgres ORs permissive policies together, so
-- they would not replace the live admin+aal2 policies -- they would sit
-- alongside them as a parallel path that skips MFA entirely.
-- That covers public.roast_profiles (4 policies). The CREATE TABLE here is
-- already applied live; only the policy block is the hazard.
-- Any session holding a valid password-only (aal1) token would be back in.
--
-- Kept for history only. To genuinely re-apply it you must first delete the
-- guard block below -- which is the point: that has to be a deliberate act,
-- not a paste-and-run accident.
-- ============================================================================
do $guard$
begin
  raise exception 'SUPERSEDED MIGRATION -- refusing to run. See the banner '
    'at the top of docs/2026-07-21_roast_profiles_table.sql.';
end
$guard$;

-- Migration: create public.roast_profiles table (Phase 2 — profile sync)
-- Date: 2026-07-21   (migration name for apply_migration: roast_profiles_table)
--
-- WHY: roast "profiles" (build-your-own target fan/heat curves) were the last
-- data type that lived ONLY in localStorage (key `global_profiles`) — unlike
-- roasts / tasting_notes / beans which already sync. This adds a table so
-- profiles survive device loss/reinstall and are owned per-user like everything
-- else. Named `roast_profiles` (not `profiles`) to avoid colliding with the
-- common Supabase convention of a `profiles` table for user-account data.
--
-- PREREQUISITE: run docs/2026-07-21_multiuser_rls.sql FIRST — this table reuses
-- the `public.admins` registry and `public.is_admin(uuid)` created there, and
-- the identical owner-or-admin RLS predicate.
--
-- Shape mirrors the app's profile object:
--   { id (Date.now bigint), name, beanName, steps:[{totalSeconds,heat,fan}],
--     isDefault, notes }  → snake_case columns below.
-- id stays a client-supplied bigint (same pattern as beans/roasts). The Phase 3
-- id-collision migration will apply to this table too.

create table if not exists public.roast_profiles (
  id          bigint primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  bean_name   text,
  steps       jsonb default '[]'::jsonb,
  is_default  boolean default false,
  notes       text,
  created_at  timestamptz default now()
);

create index if not exists roast_profiles_user_id_idx on public.roast_profiles(user_id);

alter table public.roast_profiles enable row level security;

-- Owner-or-admin policies — identical predicate to roasts/tasting_notes/beans.
create policy "owner or admin can read roast_profiles" on public.roast_profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_admin((select auth.uid()))) and public.is_admin(user_id))
  );

create policy "owner can insert roast_profiles" on public.roast_profiles
  for insert to authenticated
  with check ( user_id = (select auth.uid()) );

create policy "owner or admin can update roast_profiles" on public.roast_profiles
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_admin((select auth.uid()))) and public.is_admin(user_id))
  )
  with check (
    user_id = (select auth.uid())
    or ((select public.is_admin((select auth.uid()))) and public.is_admin(user_id))
  );

create policy "owner or admin can delete roast_profiles" on public.roast_profiles
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_admin((select auth.uid()))) and public.is_admin(user_id))
  );

-- Remove pre-login schema discoverability (RLS already returns 0 rows to anon).
revoke all on public.roast_profiles from anon;
