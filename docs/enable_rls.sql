-- RoastLogs RLS Migration
-- Run this in Supabase SQL Editor AFTER:
--   1. The auth-enabled app is deployed to GitHub Pages
--   2. You have created your user account in Supabase Auth dashboard
--   3. You have logged in successfully on your iPhone
--
-- This script enables Row Level Security on all tables and creates
-- policies that restrict ALL operations to authenticated users only.
-- After running this, unauthenticated requests will be blocked.
--
-- Tables in scope (originally): the codebase was searched for every
-- supabase.from('...') call. At the time this file was written, the ONLY
-- tables referenced were `roasts` and `tasting_notes` (all calls live in
-- src/syncService.js). If you add tables later, duplicate the 4-policy
-- block for each new table.
--
-- Update 2026-07-18: a `beans` table was added with the same 4-policy
-- pattern — see docs/2026-07-18_beans_table.sql. Tables in scope are now
-- `roasts`, `tasting_notes`, and `beans`.

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.roasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasting_notes ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Policies: only authenticated users can perform CRUD.
-- Single-user app, so any authenticated session has full access (USING true).
-- ---------------------------------------------------------------------------

-- Roasts table policies
CREATE POLICY "Authenticated users can read roasts"
  ON public.roasts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert roasts"
  ON public.roasts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update roasts"
  ON public.roasts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete roasts"
  ON public.roasts FOR DELETE
  TO authenticated
  USING (true);

-- Tasting notes table policies
CREATE POLICY "Authenticated users can read tasting_notes"
  ON public.tasting_notes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert tasting_notes"
  ON public.tasting_notes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update tasting_notes"
  ON public.tasting_notes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete tasting_notes"
  ON public.tasting_notes FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- Verify: after running this, test from a browser console using ONLY the
-- anon key (no auth session). Requests should return empty results or a 401/403:
--
--   const r = await fetch(
--     'https://YOUR_PROJECT.supabase.co/rest/v1/roasts?select=*',
--     { headers: { apikey: 'YOUR_ANON_KEY' } }
--   );
--   console.log(r.status, await r.json()); // expect [] (RLS hides all rows)
--
-- A signed-in session (the app) should continue to read/write normally.
-- ---------------------------------------------------------------------------
