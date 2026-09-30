-- Migration: add public.roasts.bean_id (v3.9.0 — Roast Setup screen)
-- Date: 2026-09-30   (migration name for apply_migration: add_bean_id_to_roasts)
--
-- WHY: a roast was linked to its bag of beans only by the free-text bean name
-- typed on the Roast tab. Stock on Bean Detail is derived by matching that
-- string, so one character of drift ("Ethiopia Guji" vs "Ethiopia  Guji")
-- stopped a roast counting against its bag, permanently and silently. The
-- Roast Setup screen now picks the bean from inventory and records its id.
-- See docs/roast-setup-screen-plan.md §4.3 / §4.5.
--
-- Shape: the bean's app id, which is Date.now() at creation — a JS number, so
-- bigint. Null for a free-text roast (bean not in inventory) and for every
-- roast logged before v3.9.0.
--
-- No foreign key, deliberately: beans can be deleted without cascading, and a
-- dangling id then simply matches nothing — the same outcome a stale name has
-- today. An FK would turn that into a sync failure.
--
-- SAFE + ADDITIVE: one nullable column. No existing row is read, rewritten or
-- deleted; legacy roasts keep matching their bean by name (decision 7, no
-- backfill). No RLS change — the admin + aal2 policies on roasts are untouched,
-- and a new column inherits them automatically. Same shape as the `equipment`
-- column added in v3.7.0.
--
-- ORDER MATTERS: apply this BEFORE deploying v3.9.0. The client upsert names
-- bean_id explicitly, and PostgREST rejects an unknown column (PGRST204), so a
-- v3.9.0 client against an unmigrated table fails EVERY roast sync. The roast
-- still saves to localStorage and the sync indicator shows the error, so this
-- is recoverable — but it is avoidable.
--
-- Rollback: alter table public.roasts drop column bean_id;

alter table public.roasts
  add column if not exists bean_id bigint;

comment on column public.roasts.bean_id is
  'App id of the inventory bean this roast drew from. Null for free-text roasts and for roasts logged before v3.9.0.';
