-- Migration: lock down the RoastLink live-temp Realtime channel
-- Date: 2026-08-28   (applied via Supabase apply_migration: lock_roastlink_live_channel)
--
-- WHY: `roastlink-live` was a PUBLIC broadcast channel. Anyone holding the
-- (deliberately public) publishable key could both watch live bean temps AND
-- inject fake samples into an active roast, which the app would record into
-- roasts.curve as real data. Marking the channel private routes it through RLS
-- on realtime.messages, which these policies then enforce.
--
-- TRUST MODEL (mirrors the four data tables):
--   * READ  (receive broadcast/presence): admin + aal2 (MFA)
--   * WRITE broadcast (publish samples):  the bridge identity ONLY
--   * WRITE presence  (viewer/bridge tracking): admins + the bridge
--
-- THE BRIDGE IDENTITY is a machine credential, NOT a third person. It is
-- deliberately absent from public.admins, so all 16 data policies still return
-- it zero rows on every table. Its only capability in this project is
-- publishing to this one topic. Its password lives only in the operator's local
-- bridge settings file (~/.roastlogs-bridge.json) -- never in this repo.
--
-- SAFETY: additive. Adds three policies to realtime.messages (which had RLS on
-- and zero policies, i.e. default-deny for private channels). Touches no data
-- table and no existing policy. Reversible by dropping the three policies.
--
-- NOTE: private and public channels are separate delivery paths -- verified
-- live. A public subscriber cannot read private broadcasts. Both the app and
-- the bridge must therefore use `private: true` or they will not see each other.

create policy "roastlink_live_read"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() = 'roastlink-live'
  and (
    (
      (select public.is_admin((select auth.uid())))
      and (select auth.jwt() ->> 'aal') = 'aal2'
    )
    or (select auth.uid()) = 'fed19cb2-d312-41f6-8f7d-59e8e65c9d18'::uuid
  )
);

-- This is the policy that closes the spoofing hole.
create policy "roastlink_live_broadcast_write"
on realtime.messages
for insert
to authenticated
with check (
  realtime.topic() = 'roastlink-live'
  and extension = 'broadcast'
  and (select auth.uid()) = 'fed19cb2-d312-41f6-8f7d-59e8e65c9d18'::uuid
);

create policy "roastlink_live_presence_write"
on realtime.messages
for insert
to authenticated
with check (
  realtime.topic() = 'roastlink-live'
  and extension = 'presence'
  and (
    (
      (select public.is_admin((select auth.uid())))
      and (select auth.jwt() ->> 'aal') = 'aal2'
    )
    or (select auth.uid()) = 'fed19cb2-d312-41f6-8f7d-59e8e65c9d18'::uuid
  )
);
