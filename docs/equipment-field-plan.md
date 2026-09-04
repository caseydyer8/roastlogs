# Equipment field — build plan

**Status:** Phase 1 BUILT 2026-09-03, not yet shipped. Approved by Case with two
changes to the spec: the third option is labelled **"Standard SR540"** (not
"bare"), and a connected bridge auto-selects the Razzo.
**Target version:** v3.7.0
**Source spec:** `docs/roastlink-live-data-plan.md` (Equipment configurations,
Also additive, Field naming)

---

## The problem

Every roast is logged as if the hardware never changes. It does. You roast on
three setups:

| Setup | Temperature probe? |
|---|---|
| Standard SR540 (no extension tube) | No |
| SR540 + OEM extension tube | No |
| SR540 + Razzo V5T | Yes — K-type in the chamber |

The Razzo's glass is thicker and holds more heat, so the same fan and heat
settings produce a different curve. Comparing a Razzo roast against a bare-tube
roast today looks like you changed technique when you changed hardware. There is
no way to tell them apart after the fact.

**Your stated goal:** know what equipment each roast used, so roasts can be
recreated and duplicated reliably.

---

## Scope — deliberately split into two phases

The spec bundles the equipment field with a full preheat screen (a takeover UI
with giant numerals and live BT tracking against a 315°F target). That is a much
larger feature, and it is not what you asked for.

### Phase 1 — this build

1. **An Equipment selector in roast setup.** Its own small card directly under
   the existing Bean card — equipment is not a bean property, so it does not
   belong inside that card. One dropdown, three options.
2. **The choice is remembered between roasts.** It changes rarely; retyping it
   every time would be friction for no benefit. Stored under `roastlogs_equipment`
   — a DEVICE preference like theme, NOT a `live_` key, so `clearLiveSession`
   and the sign-in purge leave it alone.
3. **Saved with the roast**, locally and to Supabase.
4. **Shown in History**, on the roast detail screen with the other roast facts.
5. **Old roasts read "Not recorded."** 21+ existing roasts have no equipment and
   there is no honest way to guess. Nothing is backfilled or invented.

### Phase 2 — deferred, not in this build

- The capability gate (hiding live mode when the setup has no probe)
- The 315°F preheat screen
- Flagging cross-equipment comparisons in the comparison tool

**Why defer the gate:** it would let the equipment dropdown switch live
temperature readings off. If the default is ever wrong, you lose live temps
mid-roast and the cause is non-obvious. Phase 1 carries zero regression risk to
anything that works today. Once the field exists and is populated on real
roasts, the gate becomes a small, safe follow-up.

---

## What changes, file by file

| File | Change |
|---|---|
| `docs/2026-09-03_add_equipment_to_roasts.sql` | **New.** Adds one nullable `equipment jsonb` column to `roasts`. |
| `src/App.js` | New `equipment` state (restored from `roastlogs_equipment`), the setup dropdown, bridge auto-select, saved into the roast object on stop, shown in History detail. |
| `src/syncService.js` | `equipment` added to the roast upsert and to the fetch mapping — the same app ↔ database translation every other field already uses. |
| `e2e/app.spec.js` | A test that the selector renders, persists, and appears on the saved roast. |
| `CLAUDE.md` | Note the new column and the Phase 2 deferral. |

### Data shape

Per the spec:

```js
equipment: { setup: "razzo-v5t" | "oem-tube" | "sr540", probe: "k-type" | null }
```

`probe` is derivable from `setup` today, so it is technically redundant. Keeping
it matches the spec and means Phase 2's gate reads one field rather than
re-deriving the rule in a second place.

### Database migration

```sql
alter table public.roasts add column if not exists equipment jsonb;
```

Additive and nullable. No existing row changes, no RLS change, nothing to roll
back. This is the same shape as the `curve` column added in v3.4.0.

---

## Blast radius

**Nothing that works today changes behaviour.** No existing field, screen, sync
path, or policy is touched. The one new database column is nullable, so all 21+
existing roasts stay valid and untouched.

**Nothing is destructive or irreversible.** The riskiest item is the `ALTER
TABLE`, which only adds a nullable column.

**One thing to watch:** the roast object gains a field, so `e2e/fixtures.js`
must stay in sync with the real contract (standing rule in CLAUDE.md).

---

## Verification — how we prove it worked

**Intent**

- Pick each of the three setups, start and stop a roast, confirm the right one
  is saved and shown in History.
- Confirm the choice is still selected on the next roast.
- Confirm a roast logged before this build reads "Not recorded" rather than
  defaulting to something untrue.

**Non-breakage**

- Playwright 42/42 green (38 existing + 4 new), baselines regenerated on Case's
  machine after the Roast tab gained the Equipment card.
- An existing roast opens in History exactly as before.
- Sync round-trip: save a roast, confirm the cloud row carries `equipment`,
  clear local storage, sign back in, confirm it comes back.

---

## Decisions Case made (2026-09-03)

1. **Third option is "Standard SR540"**, not "bare".
2. **A connected bridge auto-selects the Razzo** — the bridge only publishes from
   the K-type probe, which only the Razzo has. Never over an explicit pick, and
   never once a roast is under way.
3. **Phase split approved** — record and display now; gate and preheat later.
