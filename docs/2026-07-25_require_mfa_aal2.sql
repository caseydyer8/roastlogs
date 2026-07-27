-- Migration: require MFA (aal2) on all data access — the final 2FA hardening
-- Date: 2026-07-25   (migration name for apply_migration: require_mfa_aal2)
--
-- WHY: two-factor is currently enforced only by the client (the app routes to a
-- code prompt after login). This adds SERVER-SIDE enforcement: every policy now
-- also requires the session to be at assurance level aal2 — i.e. the second
-- factor was actually completed. A stolen/leaked password alone yields an aal1
-- session, which after this migration can read/write NOTHING, even if the
-- attacker bypasses our app and hits the Supabase REST API directly.
--
-- `auth.jwt() ->> 'aal'` reads the assurance-level claim Supabase stamps into the
-- session JWT: 'aal1' = one factor (password), 'aal2' = password + TOTP code.
--
-- PRECONDITION (verified before applying): BOTH admin accounts have a VERIFIED
-- TOTP factor, so both can always step up to aal2 at login. Applying this while
-- an account had no factor would lock that account out of its own data. Do NOT
-- apply until `select ... from auth.mfa_factors` shows a verified factor for
-- every account that needs access.
--
-- ROLLBACK (if a login somehow can't reach aal2): re-run
-- docs/2026-07-25_lock_to_admins_only.sql — it restores the admin-only policies
-- WITHOUT the aal2 clause, immediately giving password-level (aal1) sessions
-- their access back.

-- Drop the current admin-only policies (name-agnostic) and recreate them with
-- the added aal2 requirement.
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

-- admin AND MFA-completed. Applied to every table + command.
do $$
declare t text;
begin
  foreach t in array array['roasts', 'tasting_notes', 'beans', 'roast_profiles']
  loop
    execute format($f$
      create policy "admin+mfa read %1$s" on public.%1$s for select to authenticated
        using ( (select public.is_admin((select auth.uid())))
                and (select auth.jwt() ->> 'aal') = 'aal2' );
    $f$, t);
    execute format($f$
      create policy "admin+mfa insert %1$s" on public.%1$s for insert to authenticated
        with check ( (select public.is_admin((select auth.uid())))
                     and (select auth.jwt() ->> 'aal') = 'aal2' );
    $f$, t);
    execute format($f$
      create policy "admin+mfa update %1$s" on public.%1$s for update to authenticated
        using ( (select public.is_admin((select auth.uid())))
                and (select auth.jwt() ->> 'aal') = 'aal2' )
        with check ( (select public.is_admin((select auth.uid())))
                     and (select auth.jwt() ->> 'aal') = 'aal2' );
    $f$, t);
    execute format($f$
      create policy "admin+mfa delete %1$s" on public.%1$s for delete to authenticated
        using ( (select public.is_admin((select auth.uid())))
                and (select auth.jwt() ->> 'aal') = 'aal2' );
    $f$, t);
  end loop;
end $$;

revoke select, insert, update, delete
  on public.roasts, public.tasting_notes, public.beans, public.roast_profiles
  from anon;
