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
