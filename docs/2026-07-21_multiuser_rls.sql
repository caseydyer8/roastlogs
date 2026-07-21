-- Migration: multi-user RLS — per-user ownership + admin co-ownership
-- Date: 2026-07-21   (migration name for apply_migration: multiuser_rls)
--
-- WHY: RoastLogs is expanding beyond a single user. Until now every table used
-- the single-user "USING (true)" policy block (see docs/enable_rls.sql and
-- docs/2026-07-18_beans_table.sql), so ANY authenticated account could read and
-- write EVERY row. This migration introduces real per-user ownership:
--
--   * Every synced row gains a `user_id` (its true creator).
--   * Regular users can only see/edit/delete their OWN rows.
--   * Casey's own accounts are "admins" that co-own each other's rows AND the
--     pre-existing (legacy) data — but admins get NO access to a regular user's
--     private rows. This is the "co-own existing/admin data" model.
--
-- SAFETY: this whole file is designed to run as ONE atomic migration. It adds
-- ownership, backfills, seeds admins, and swaps the policies together, so there
-- is never a moment where a logged-in admin is locked out of the live app. If
-- any statement fails, the entire migration rolls back and the app is untouched.
--
-- BEFORE APPLYING:
--   1. Confirm the account list is exactly the two intended admin accounts:
--        select id, email, created_at from auth.users order by created_at;
--   2. Confirm public signup is DISABLED in the Supabase Auth dashboard.
--   3. Fill in the second admin email in section 1 (the seed is an explicit
--      allowlist — it does NOT blanket-promote every account, on purpose).

-- ============================================================================
-- 0. Admin registry + helper function
-- ============================================================================

create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Lock the table down completely: RLS on with NO policies = default-deny for
-- anon & authenticated, and the grants are revoked so it is not exposed through
-- the API at all. It is only ever read via is_admin() below.
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- is_admin(uid): true iff uid is a registered admin. SECURITY DEFINER so it can
-- read public.admins despite that table's default-deny RLS. Empty search_path
-- hardens the SECURITY DEFINER function against search-path hijacking.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = uid);
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

-- ============================================================================
-- 1. Seed admins = an EXPLICIT allowlist of Casey's two accounts.
--    Do NOT seed "all of auth.users": if any unexpected account ever exists
--    (e.g. someone hit the /auth/v1/signup endpoint, which is independent of the
--    client having no signup UI), a blanket seed would silently make them an
--    all-data admin. Allowlisting by email is immune to that and is re-run-safe.
-- ============================================================================

insert into public.admins (user_id)
select id from auth.users
where email in (
  'osu.cdyer91@gmail.com'            -- Casey (primary)
  -- , 'SECOND_ADMIN_EMAIL_HERE'     -- Casey (second account) — FILL IN before applying
)
on conflict (user_id) do nothing;

-- ============================================================================
-- 2. Add `user_id` to each synced table, backfill legacy rows, lock down.
--    Legacy owner = the earliest-created account (an admin). The other admin
--    still sees this data via the co-ownership branch of the policies below.
--    CAUTION: user_id FK is `on delete cascade`, and ALL legacy rows are owned
--    (single column) by this one account. Deleting that account from auth.users
--    would cascade-delete every legacy roast/tasting/bean — the co-ownership
--    policy does NOT protect against the FK cascade. Before ever retiring an
--    admin account, reassign its rows first:
--        update public.roasts        set user_id = '<keeper>' where user_id = '<leaving>';
--        update public.tasting_notes set user_id = '<keeper>' where user_id = '<leaving>';
--        update public.beans         set user_id = '<keeper>' where user_id = '<leaving>';
-- ============================================================================

-- roasts
alter table public.roasts
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
update public.roasts
  set user_id = (select id from auth.users order by created_at asc limit 1)
  where user_id is null;
alter table public.roasts alter column user_id set not null;
alter table public.roasts alter column user_id set default auth.uid();
create index if not exists roasts_user_id_idx on public.roasts(user_id);

-- tasting_notes
alter table public.tasting_notes
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
update public.tasting_notes
  set user_id = (select id from auth.users order by created_at asc limit 1)
  where user_id is null;
alter table public.tasting_notes alter column user_id set not null;
alter table public.tasting_notes alter column user_id set default auth.uid();
create index if not exists tasting_notes_user_id_idx on public.tasting_notes(user_id);

-- beans
alter table public.beans
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
update public.beans
  set user_id = (select id from auth.users order by created_at asc limit 1)
  where user_id is null;
alter table public.beans alter column user_id set not null;
alter table public.beans alter column user_id set default auth.uid();
create index if not exists beans_user_id_idx on public.beans(user_id);

-- ============================================================================
-- 2b. Assert RLS is ENABLED on every synced table (idempotent). Policies are
--     inert if RLS is off, so this migration — which IS the isolation boundary —
--     must not assume a precondition it can enforce itself.
-- ============================================================================

alter table public.roasts        enable row level security;
alter table public.tasting_notes enable row level security;
alter table public.beans         enable row level security;

-- ============================================================================
-- 3. Replace the permissive USING(true) policies with owner-or-admin policies.
--    Drop ALL existing policies on the three tables first (name-agnostic), so
--    this is robust regardless of the old policy names.
-- ============================================================================

do $$
declare pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('roasts', 'tasting_notes', 'beans')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- The owner-or-admin predicate (used for read / update-using / delete):
--   you own the row  OR  (you are an admin AND the row's owner is an admin)
-- The insert / update-check predicate:
--   the row's user_id must equal your own uid (prevents spoofing; admins still
--   create rows as themselves).
-- (select auth.uid()) / (select is_admin(...)) are wrapped in scalar subqueries
-- per Supabase's RLS performance guidance (evaluated once per statement).

-- ---- roasts ----------------------------------------------------------------
create policy "owner or admin can read roasts" on public.roasts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_admin((select auth.uid()))) and public.is_admin(user_id))
  );

create policy "owner can insert roasts" on public.roasts
  for insert to authenticated
  with check ( user_id = (select auth.uid()) );

create policy "owner or admin can update roasts" on public.roasts
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_admin((select auth.uid()))) and public.is_admin(user_id))
  )
  with check (
    user_id = (select auth.uid())
    or ((select public.is_admin((select auth.uid()))) and public.is_admin(user_id))
  );

create policy "owner or admin can delete roasts" on public.roasts
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_admin((select auth.uid()))) and public.is_admin(user_id))
  );

-- ---- tasting_notes ---------------------------------------------------------
create policy "owner or admin can read tasting_notes" on public.tasting_notes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_admin((select auth.uid()))) and public.is_admin(user_id))
  );

create policy "owner can insert tasting_notes" on public.tasting_notes
  for insert to authenticated
  with check ( user_id = (select auth.uid()) );

create policy "owner or admin can update tasting_notes" on public.tasting_notes
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_admin((select auth.uid()))) and public.is_admin(user_id))
  )
  with check (
    user_id = (select auth.uid())
    or ((select public.is_admin((select auth.uid()))) and public.is_admin(user_id))
  );

create policy "owner or admin can delete tasting_notes" on public.tasting_notes
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_admin((select auth.uid()))) and public.is_admin(user_id))
  );

-- ---- beans -----------------------------------------------------------------
create policy "owner or admin can read beans" on public.beans
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_admin((select auth.uid()))) and public.is_admin(user_id))
  );

create policy "owner can insert beans" on public.beans
  for insert to authenticated
  with check ( user_id = (select auth.uid()) );

create policy "owner or admin can update beans" on public.beans
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_admin((select auth.uid()))) and public.is_admin(user_id))
  )
  with check (
    user_id = (select auth.uid())
    or ((select public.is_admin((select auth.uid()))) and public.is_admin(user_id))
  );

create policy "owner or admin can delete beans" on public.beans
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_admin((select auth.uid()))) and public.is_admin(user_id))
  );

-- ============================================================================
-- 4. Hardening: remove pre-login schema discoverability. RLS already returns 0
--    rows to anon, but revoking the table grant removes these tables from the
--    anon PostgREST/GraphQL schema entirely.
-- ============================================================================

revoke select, insert, update, delete
  on public.roasts, public.tasting_notes, public.beans
  from anon;

-- ----------------------------------------------------------------------------
-- DONE SEPARATELY (not SQL in this file):
--   * Re-enable leaked-password protection (Supabase Auth settings).
--   * Review public.rls_auto_enable() — a SECURITY DEFINER function currently
--     callable by anon; revoke execute from anon, authenticated (or drop it).
--
-- ROLLBACK (only if needed, before the new client ships): drop the new policies
-- and restore docs/enable_rls.sql + docs/2026-07-18_beans_table.sql blocks, then
--   alter table public.roasts        drop column user_id;
--   alter table public.tasting_notes drop column user_id;
--   alter table public.beans         drop column user_id;
--   drop function public.is_admin(uuid); drop table public.admins;
-- ----------------------------------------------------------------------------
