# Roast Setup Screen — implementation plan

> **Status: CONFIRMED 2026-09-30 — building steps 1–4.** Step 5 (drop-weight prompt) deferred to a second pass by Case's call on 3.3.
> Target version **v3.9.0** (feature; current live is v3.8.2).
> Answers captured 2026-09-19. Diagnosis in the same session.

---

## 1. Why — the two defects and their shared cause

Profile selection is not missing. It is **unreachable**, for two reasons that
share one root cause.

**Defect A — the preheat screen evicts the controls that arm a roast.**
`preheatActive` (`src/App.js:1725`) goes true whenever a probe is selected, a
live reading is on screen, and no roast is running. Three things hide at once:

| What hides | Where | Consequence |
|---|---|---|
| Session card → thin summary bar | `src/App.js:2338` | Bean, green weight, target level, starting Fan → Heat all behind one tap |
| "Build Profile" card | `src/App.js:2466` | Gone entirely |
| Hero readout → `PreheatScreen` | `src/App.js:2492` | Intended |

`START` survives (outside that ternary, `src/App.js:2692`), so a roast *can*
still begin — which is precisely why the missing profile step feels silent
rather than blocked.

**Defect B — the profile dialog only opens on a string match.**
`handleStart` (`src/App.js:1576-1581`) shows `RoastModeDialog` only when a
profile's `beanName` equals the typed bean name, or a profile carries no bean
at all. With the Session card collapsed behind the preheat screen, `beanName`
is routinely blank or stale, the condition fails, and the app drops into a
manual roast with **no dialog and no error**.

**Defect C — inventory never deducts.**
Stock (`src/App.js:4704-4711`) is *derived*, not stored:

```
remaining = purchaseWeight − Σ(roasts where r.beanName === bean.name).greenWeight + adjustments
```

`handleStop` saves `beanName` as a hand-typed string (`src/App.js:1622`) and
never stores a bean id. One character of drift and that roast stops counting
against the bag permanently.

> **Root cause, all three:** the Roast tab has **no structured link to a bean
> record**. Bean, profile and inventory are joined by free text a human types.
> Fix the link and all three close.

---

## 2. Decisions taken (Case, 2026-09-19)

| # | Decision |
|---|---|
| 1 | Roast tab **always lands on Setup** when no live roast is running |
| 2 | Back-to-back roasts: **carry the last setup forward**, click through to confirm |
| 3 | Setup is a **full-screen takeover** — less noise |
| 4 | Once roasting, Setup **collapses** and stays reachable (has saved him before) |
| 5 | Bean picker from inventory **with a free-text fallback** — beans aren't always catalogued |
| 6 | Green weight over remaining stock → **just zero the stock**. No warning, no block |
| 7 | **Legacy roasts stay as they are.** No backfill; few enough that messy is fine |
| 8 | Selecting a profile **autofills starting Fan → Heat** from its `0:00` step |
| 9 | Preheat target is **global**, not per bean or per profile |
| 10 | Profile is **chosen explicitly every roast**; the bean's default is *shown and badged*, never pre-selected |
| 11 | No probe (`oem-tube` / `sr540`) → **skip preheat entirely**, Setup goes straight to START |
| 12 | Preheat target **editable in both** Setup and the preheat screen |
| 13 | End of roast **prompts for roasted weight** instead of editing later in History |

---

## 3. The three gate calls — answered (Case, 2026-09-30)

| # | Call | Case's answer | What it means for the build |
|---|---|---|---|
| 3.1 | Full-screen setup mid-roast | **Inline card mid-roast** (the recommendation) | Takeover **pre-roast only**. Once roasting, the summary bar expands to today's inline card, so the live chart and `Mark Yellowing / First crack / Cooling start` never leave the screen |
| 3.2 | Stock overdraft | **Forgive on restock** — a bag 100g overdrawn that gets +500g shows **500g** (NOT the recommendation) | A render-edge `Math.max(0, …)` cannot produce 500g. Stock becomes a **chronological fold**: roasts and weight adjustments sorted by time, running balance clamped at 0 **at each step**. An overdraft is absorbed the moment it happens, so a later restock starts from zero |
| 3.3 | Save-path restructure | **Build it, but hold the modal for last** | The drop-weight prompt (§4.4, build step 5) is **deferred to a second pass**. This pass ships steps 1–4 + tests; Case phone-tests a real SR540 roast first. `handleStop` is untouched apart from recording `beanId` |

### 3.2 in detail — why a fold, not a clamp

Both adjustments and roasts carry a time: adjustments a `date` (`YYYY-MM-DD`,
`src/App.js:4777`), roasts an `id` that is `Date.now()` at save. Sorting on those
and clamping each step is the only honest way to reach 500g — the total isn't
lied about, the history is replayed with a floor. Same-day ties resolve
naturally: an adjustment dated today parses to midnight, so a same-day restock
lands before that afternoon's roast.

---

## 4. What changes

### 4.1 New state machine for the Roast tab

Setup and preheat are **sequential states**, not competing cards. Today they
fight over one screen, which is why one had to hide the other.

```
        ┌──────────┐  BEGIN PREHEAT   ┌──────────┐  CHARGE   ┌──────────┐  DROP   ┌──────────┐
        │  SETUP   │ ───────────────▶ │ PREHEAT  │ ────────▶ │ ROASTING │ ──────▶ │  SAVE    │
        └──────────┘                  └──────────┘           └──────────┘         └──────────┘
             │                                                     ▲                   │
             │            no probe → START (skips preheat)          │                   │
             └─────────────────────────────────────────────────────┘                   │
                                                                                        ▼
                                                              drop-weight prompt → SKIP or SAVE
```

One derived value drives it, replacing the ad-hoc `preheatActive` flag:

```js
// SETUP | PREHEAT | ROASTING
const roastStage = roastStarted || isTimerRunning ? "roasting"
  : (hasProbe && gatedLiveRoast.isLive && preheatConfirmed) ? "preheat"
  : "setup";
```

`preheatActive` (`src/App.js:1725`) is replaced by `roastStage === "preheat"`.
Every current consumer of `preheatActive` moves to the new value. **Decision 11
falls out for free:** `hasProbe` is false for `oem-tube` / `sr540`, so those
setups can never enter `preheat` and Setup's primary button reads `START`
instead of `BEGIN PREHEAT`.

### 4.2 New component — `src/components/RoastSetupScreen.jsx`

Full-screen pre-roast, inline mid-roast (pending §3.1). Sections, in order:

1. **Bean** — picker over `beans` from `localStorage`, each row showing
   remaining stock. A `+ Not in my inventory` row drops to today's free-text input
   (decision 5). Picking a bean sets both `beanId` and `beanName`.
2. **Green weight** — unchanged input, now showing `remaining after this roast`
   beneath it, clamped at 0 (decision 6).
3. **Target roast level** — unchanged.
4. **Profile** — the contents of `RoastModeDialog` (`src/App.js:703`) lifted
   in. The bean's default is floated to the top and badged `DEFAULT`, but
   **nothing is pre-selected** (decision 10). `MANUAL ROAST` stays an explicit
   choice. Selecting a profile autofills starting Fan → Heat from its `0:00`
   step (decision 8).
5. **Equipment** — unchanged selector, still persisted under
   `localStorage.roastlogs_equipment`, still auto-selecting the Razzo via the
   bridge bridge-effect.
6. **Preheat target** — shown only when `hasProbe`; writes the same
   `localStorage.roastlogs_preheat_target` the preheat screen uses, so both
   edit one value (decisions 9 and 12).

Controls follow **Fan → Heat → Temp** throughout. All colour via semantic
tokens (`bg-surface`, `text-ink`, `border-border`, `bg-accent`) — no raw
`zinc-*` / `amber-*`.

### 4.3 Bean link — new `beanId` field

`handleStop`'s roast object gains `beanId` (null for a free-text roast). The
stock calculation becomes:

```js
const usedWeight = roasts
  .filter(r => r.beanId ? r.beanId === bean.id : r.beanName === bean.name)
  .reduce((sum, r) => sum + (Number(r.greenWeight) || 0), 0);
```

The ternary is what keeps decision 7 safe: a roast with a `beanId` matches on
id **only**, a legacy roast matches on name **only**. No roast can be counted
twice, and nothing existing needs touching.

### 4.4 Drop-weight prompt

New modal on `handleStop`, reusing the existing discard-modal shell
(`src/App.js:2787`) for visual consistency. One numeric field, and a computed
weight-loss percentage shown live as he types. Two buttons: `SAVE ROAST` and
`SKIP` — both persist, per §3.3.

### 4.5 Migration — `roasts.bean_id`

`roasts` is a real column-per-field table (`src/syncService.js:41`), not a blob,
so the new field needs a column. Same shape as the `equipment jsonb` column from
v3.7.0:

```sql
alter table public.roasts add column if not exists bean_id bigint;
```

**Additive, nullable, no backfill, no primary-key change, no data rewrite.**
It is not the deferred Phase 3 composite-key work and does not need the backup
story that CLAUDE.md gates destructive migrations on. `syncService.js` gains
`bean_id: cleanRoast.beanId ?? null` to the upsert and the corresponding read
mapping.

### 4.6 Files touched

| File | Change |
|---|---|
| `src/components/RoastSetupScreen.jsx` | **New** |
| `src/components/RoastDropWeightModal.jsx` | **New** |
| `src/App.js` | `roastStage`, Setup mount, `handleStart` / `handleStop` rework, stock calc, retire `RoastModeDialog` |
| `src/syncService.js` | `bean_id` in upsert + read |
| `docs/2026-09-30_add_bean_id_to_roasts.sql` | **New** migration |
| `e2e/fixtures.js` | `beanId` on the fixture roast — **must move in lockstep** |
| `e2e/app.spec.js` | New Setup-screen test + baseline |
| `package.json`, About badge, backup `appVersion` | **v3.9.0 — all three** |

---

## 5. Blast radius

**What could break.**

1. **The save path** (§3.3) — the one genuinely risky change. Mitigated by
   `SKIP` saving identically to today.
2. **Every existing `preheatActive` consumer** must move to `roastStage`. Miss
   one and the preheat screen renders in the wrong state. Small, mechanical,
   easy to verify by grep.
3. **`RoastModeDialog` is retired**, not deleted-and-forgotten — its profile
   grouping and default-float logic move into Setup verbatim.
4. **The "Use in Roast" button** on Bean Detail (`src/App.js:4623-4634`) arms a
   profile and jumps to the Roast tab. With Setup now landing first, it must
   pre-select that profile *in Setup* rather than setting `profileFollowing`
   directly, or the Setup screen will silently override it.

**What cannot be undone.** Nothing. The migration is additive and nullable;
every other change is app code. No data is rewritten, deleted or re-keyed.

**What is explicitly out of scope.** Legacy roast backfill (decision 7),
per-profile preheat targets (decision 9), any change to authentication, row
level security, or the RoastLink bridge.

---

## 6. Verification checklist — intent and non-breakage

**Intent — did the thing asked for happen?**

- [ ] Roast tab opens on Setup with no roast running
- [ ] Bean picked from inventory; stock shown per bean
- [ ] A bean not in inventory can still be typed free-hand and roasted
- [ ] Profile chosen explicitly; bean's default visible and badged, not pre-selected
- [ ] Choosing a profile fills starting Fan → Heat from its `0:00` step
- [ ] Razzo selected → `BEGIN PREHEAT`; OEM tube / bare SR540 → `START`
- [ ] Preheat target edits from Setup and from the preheat screen hit one value
- [ ] Saving a roast deducts green weight from that bean's stock
- [ ] Stock floors at 0 and never renders negative
- [ ] End of roast prompts for roasted weight; the figure lands on the roast

**Non-breakage — did anything that worked stop?**

- [ ] Live temperature still streams from the bridge during a roast
- [ ] Preheat chime, speech and phrase still fire on the rising crossing
- [ ] Mid-roast reload still restores the session from the `live_*` keys
- [ ] Mark Yellowing / First crack / Cooling start still reachable while roasting
- [ ] `SKIP` on the drop-weight prompt saves a roast identical to today's
- [ ] Legacy roasts still count against their bean by name
- [ ] Roasts, beans, profiles and tasting notes all still sync
- [ ] Light and dark themes both correct on the new screens
- [ ] History timeline, comparison chart and backup export unchanged

---

## 7. Build sequence

Ordered so the riskiest change lands last, against a known-good base.

1. **Migration + `syncService.js`** — `bean_id` column, additive. Verify sync
   round-trips before any UI work.
2. **`roastStage`** — replace `preheatActive`, no visual change yet. Grep-verify
   every consumer moved.
3. **`RoastSetupScreen.jsx`** — build the screen, mount it, retire
   `RoastModeDialog`, rewire Bean Detail's "Use in Roast".
4. **Stock deduction** — `beanId` on save, ternary match, clamped chronological fold (§3.2).
5. **Drop-weight prompt** — **DEFERRED to a second pass** (§3.3). Case phone-tests steps 1–4 first.
6. **`e2e/fixtures.js` + a Setup test** in the same session as step 3.

**Agent bundle at each stage:** `/ui-loop` after steps 3 and 5 (new baselines
needed — Setup screen and drop-weight modal). `/code-review` on the full diff
before deploy. **deploy-verifier** after `npm run deploy`. `/release` handles
the three-place version bump.

**security-auditor is not the gate here** — no authentication, row level
security or policy code is touched. The migration is a plain additive column on
an already-locked table; its 4 policies are unchanged and continue to require
admin + `aal2`.

---

## 8. Constraints carried from CLAUDE.md

- **Preview on localhost before deploying.** Always. `npm run deploy` publishes
  straight to live with no staging step.
- **Deploys run on Case's machine only** — a build without his gitignored
  `.env` ships a keyless bundle that locks both accounts out.
- **Playwright baselines regenerate on his Mac only.** Snapshot filenames carry
  the platform (`-darwin.png`); a container run cannot validate against the
  approved set. Functional assertions are the only thing a container proves.
- **Version lives in three places** — `package.json`, the About modal badge,
  and the backup export `appVersion`.
- **Never commit `build/`.**
