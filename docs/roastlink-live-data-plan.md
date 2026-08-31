# RoastLink TWO+ Live Data — Build Plan

**Status:** Draft for Case to read, correct, and approve. No code until approved.
**Target:** Live bean temperature from a RoastLink TWO+ visible simultaneously on
the MacBook and the iPhone, recorded into the roast at 1 sample/second.

---

## Read this first — blast radius

**What changes:**
- One new **nullable** column on `roasts` (`curve`), plus two small additive fields
  (`equipment`, `ambient`). Additive only.
- New UI on the Roast tab (live temp state, RoR readout, live sparkline, status lamp).
- A **new, separate desktop app** (the bridge) that does not live in the RoastLogs
  bundle and cannot affect the deployed site.

**What does NOT change:**
- **No migration.** All 21 existing roasts stay valid and untouched — they simply
  have no `curve`. Nothing is backfilled, rewritten, or deleted.
- **No RLS change.** All 16 policies and the `aal2` MFA requirement stay exactly as
  they are. The bridge never receives a database credential (see Security).
- **Manual entry stays.** Live data is a layer on top of a logger that already works.
- No change to `roast_log` semantics, phase labels, or Fan → Heat → Temp order.

**Nothing here is destructive or irreversible.** The riskiest item is the `ALTER TABLE`,
which only adds a nullable column.

---

## The problem being solved

Today a roast is logged by hand: Case types a temperature when he happens to look at
the roaster. That produces a handful of points per roast, which is enough to record
what happened but not enough to *steer* by. The metric roasters actually steer on —
**Rate of Rise (RoR)**, the slope of the bean-temp curve — cannot be eyeballed from
manual entries at all.

The RoastLink TWO+ produces a real bean-temp reading roughly once a second. The job is
to get that reading onto both screens during the roast, and into the roast record after.

---

## Confirmed decisions (from Case)

| Question | Decision |
|---|---|
| Units | **°F only.** Device WebSocket is always °F; no conversion layer. |
| Sample storage | **Every second, stored in full.** ~15KB/roast. Detail can be discarded later; it can never be recovered. |
| Curve during Pause | **Keeps recording continuously.** The probe is physical truth; the timer is human bookkeeping. Pause is marked, not gapped. |
| Equipment tracking | **Yes** — three configurations, and it gates live mode. |
| Back-to-back batches | **Yes**, with a preheat step between. Roast boundaries handled from day one. |
| WiFi at the roaster | Strong signal, extender already in place. Low risk. |
| Two-way event sync | **Not wanted.** RoastLogs never commands the device. |
| Recording window | **Gated by RoastLogs, phase 1.** Recording starts at `START`, stops at `COOLING START`. |
| Fan/Heat logging | **Stays manual — permanently.** Not a fallback; the only possible source. |
| Dev time / DTR | **Always anchored to First Crack**, every roast level. |
| Post-second-crack time | **Separate metric**, never folded into DTR. |
| Milestone sequence | **Derived from the target roast level** chosen at setup. |
| Dark roast levels | **Add French and Italian** beyond the existing Vienna ceiling. |
| Artisan / Modbus TCP | **Stays enabled.** Used as a separate session, never during a RoastLogs roast. |

### Why Fan/Heat can never be automatic

The TWO+ is a logger — it reads thermocouples and nothing else. The SR540's fan and
heat are set physically on the roaster, with no electrical path for the TWO+ to observe
them. (Only the CORE family drives fan/heater, and even then it is *issuing* commands,
not reading a human's dial positions.) So the manual Fan → Heat entries are not a
stopgap awaiting automation — they are the irreplaceable human half of the record, and
the existing flow stays untouched.

### Recording window (Case's explicit requirement)

**Displaying and recording are separate concerns**, and this distinction is what
makes the requirement work:

- The telemetry stream flows **continuously** whenever the bridge is connected, so a
  live bean temp is on screen **before** the roast — which is what makes the
  between-batch preheat to ≥315°F an instrument reading instead of a guess.
- **Nothing is written to the database** until `START` is pressed in RoastLogs.
- Recording **stops** at `COOLING START` (drop).
- `curve` therefore contains exactly `[START → COOLING START]`, nothing before or after.

The device has its own roast state machine (Begin Roast / Drop on the OLED and web
UI) and its own onboard CSV. **That state is ignored for our purposes** — RoastLogs is
the sole authority on the recording window. This is phase-1 scope, wired in from the
start, not retrofitted.

### Equipment configurations

| Config | Probe? | Live data? |
|---|---|---|
| SR540 bare (no extension tube) | No | No — small sample roasts for profiling |
| SR540 + OEM extension tube | No | No |
| **SR540 + Razzo V5T** | **Yes (K-type in chamber)** | **Yes** |

This is a **capability gate**, not just a label. When the selected config has no probe,
the app must not offer or hunt for live mode. It also keeps the v3 comparison tool
honest: the Razzo's thicker glass carries more thermal mass, so curves shift with
equipment. Comparing across configs without flagging it would read as a technique
change when it was a hardware change.

---

## Prerequisite: the device must be in STA mode

**This is a hard prerequisite, not a setup detail.** The RoastLink can run two ways:

| Mode | Address | Works for this build? |
|---|---|---|
| **AP** (device serves its own hotspot `RoastLink_TWO+`) | `192.168.4.1` | **No** |
| **STA** (device joins the home WiFi) | DHCP address + `roastlink.local` | **Yes** |

In AP mode, any machine talking to the device is joined to *the device's* network and
therefore **has no internet** — so the bridge cannot reach Supabase and nothing can
reach the phone. The entire two-screen design depends on STA mode.

Setup (manual pp. 4–7): join `RoastLink_TWO+` → captive portal → **Set up WiFi** →
select the home network → Save → device reboots, its hotspot disappears, and it becomes
reachable at **`http://roastlink.local`**.

**Verifying mode at a glance:**
- **Status LED** — amber *breathing* = AP; amber *single blink* = connected (STA).
- **OLED Screen C** (double-click to reach) — shows `STA`/`AP` and the live IP.

The bridge should target **`roastlink.local`** rather than a hard-coded IP, since a DHCP
lease can change; a manual IP entry stays as the fallback.

## Architecture

### Why a bridge is required (not a preference)

The device serves **`ws://<device-ip>:81/`** — an *unencrypted* WebSocket. RoastLogs is
served over **HTTPS**. Browsers block a secure page from opening an insecure connection
(*mixed content*), with no override. Separately, iOS Safari — and iOS Chrome, which uses
WebKit underneath — has no Web Bluetooth at all.

So no browser, on any platform, can talk to this device from the hosted app. A small
Node program has no browser sandbox and can. That program is the bridge.

```
[RoastLink TWO+] --ws:// (local, unencrypted)--> [ MacBook bridge app ]
                                                          |
                                                    wss:// (encrypted)
                                                          v
                                                [ Supabase Realtime ]
                                                          | fans out
                                        +-----------------+----------------+
                                        v                                  v
                                 [ Mac browser ]                    [ iPhone PWA ]

On Save: the APP (as Case, MFA/aal2) writes the curve to `roasts`.
The bridge never touches the database.
```

The bridge is a WebSocket **client** twice over: reading from the device, publishing to
Supabase Realtime (itself a WebSocket service). That is what keeps both screens in sync.

### Transport decision: WiFi, not BLE

The maker documents both. WiFi wins decisively:

- **WebSocket is push.** Send `hello_ui` once and the device streams continuously.
  The BLE `XREAD` API is **poll-only** — one command per sample, forever.
- **BLE from Node needs a native module** (`noble`) plus macOS Bluetooth entitlements —
  the single most fragile thing we could add.
- WiFi has better range; the Mac can sit well away from roasting chaff.

BLE stays documented as a fallback only.

---

## The device contract

Source: `getroastlink/roastlink-ui` @ `65facfb`, `API/WEBSOCKET-API.md`.

Endpoint `ws://<device-ip>:81/`, UTF-8 text frames, JSON. **All temperatures °F.**

**Telemetry stream** — send the plain text frame `hello_ui` once, then receive:

```json
{"et":425.2,"bt":401.7,"at":77.0,"ah":42,"t":1234}
```

**Sensor health** (TWO+ V2 / V3 only — variant TBC):

```json
{"type":"sensorHealth","btValid":true,"btState":"ok","btFault":0}
```

`btState` is `ok` | `fault` | `recovering`.

**Keepalive:** send `ping`, expect `pong`. This is the mechanism behind the status lamp —
a TCP connection can die silently, so missed pongs are how we *know* the device is gone.

**Events** the device emits and accepts (phase 2 for sending):

| Device event | RoastLogs phase |
|---|---|
| `charge` / `start` | `START` |
| `dryend` | `YELLOWING` |
| `fcstart` | `FIRST CRACK` |
| `drop` | `COOLING START` |

### Confirmed from the shipped manual + device in hand

| Fact | Value | Why it matters |
|---|---|---|
| Firmware | **v1.1.3** | Matches the latest in the maker's OTA repo. |
| Sample rate | **1 per second** | Exactly what the data model assumes. |
| Log units | **Always °F**, regardless of display setting | The device's °F/°C toggle is **display-only** — do not let it mislead. |
| Discovery | **`roastlink.local`** (mDNS) | Bridge connects by name, not a DHCP-dependent IP. |
| Device events | Charge → Dry End → First Crack Start → First Crack End → Second Crack → Drop | Maps cleanly onto RoastLogs phases if ever needed. |
| Log storage | ~100 files, oldest auto-deleted | Onboard CSV is a **short-lived** backup, not an archive. |

### Concurrency limit (operational rule)

The manual warns: *"Keep only one browser tab open at a time for best performance."*
That is an ESP32 signalling limited concurrent connections. Our bridge holds one
WebSocket, so **during a roast the bridge should be the only client** — device web UI
tabs on the phone and Mac should be closed. The bridge should surface this plainly if
the connection is refused or unstable, since the failure mode otherwise looks like a
flaky network.

### Two contract hazards

**1. `t` is device uptime, not roast time.** RoastLogs' `roast_log` entries use `t` for
seconds since the roast began. The device's `t` is seconds since *it powered on*. Same
field name, different meaning. The bridge captures the device's `t` at roast start and
subtracts it. Get this wrong and every curve is shifted by the warm-up time.

**2. `getData` can fabricate a reading.** The docs warn that with an invalid probe the
firmware "can temporarily mirror the other probe or retain its last valid value."
Case runs **one probe**, so the empty ET socket could return a mirrored BT. Defenses:

- Use the `hello_ui` stream + `sensorHealth`, never `getData`, as the source of truth.
- Send `{"command":"mirror_enabled","data":0}` on connect to disable substitution.
- Ignore `et` entirely while single-probe.

---

## Data model

### New column

```sql
ALTER TABLE public.roasts ADD COLUMN curve jsonb;
```

Nullable. Existing roasts are unaffected — no backfill, no rewrite.

### Shape

```js
curve: [ { t: 0, bt: 312.4 }, { t: 1, bt: 313.1 }, ... ]
```

- **Chronological (oldest-first)** — deliberately unlike `roast_log`, which is
  newest-first for display. Chart data wants time order. To be documented in
  `CLAUDE.md` so it never surprises anyone.
- `t` is **roast-elapsed seconds**, already offset-corrected by the bridge.
- Machine data and human data stay separate: `roast_log` remains Case's control
  changes and phase marks. The curve never pollutes it.

### Also additive

```js
equipment: { setup: "razzo-v5t" | "oem-tube" | "bare", probe: "k-type" | null }
ambient:   { at: 74.1, ah: 38 }   // captured at roast start from the SHT31
```

Ambient is free data from the onboard sensor, and green coffee genuinely behaves
differently at different humidity — useful signal for the comparison tool.

### Field naming across the three vocabularies

The existing `src/syncService.js` already translates app ↔ database. The bridge adds a
third vocabulary and one more adapter — the same pattern, not a new architecture.

| Device | App | Database |
|---|---|---|
| `bt` | `curve[].bt` | `curve` (jsonb) |
| `at` / `ah` | `ambient` | `ambient` (jsonb) |
| — | `equipment` | `equipment` (jsonb) |

---

## Security model

The bridge is a **new, less-trusted actor** — headless, and unable to complete MFA. The
current RLS requires both admin identity and `aal2`, so it cannot be handed database
access without dismantling that.

**So it gets none.** The bridge publishes to a **Supabase Realtime broadcast channel**,
which does not touch any table. RLS is not bypassed — it is simply not in the path.

**Resulting property:** if the bridge were fully compromised, an attacker could broadcast
fake bean temperatures at the screen. They could **not** read one roast, alter one record,
or learn anything about the data. All persistence still happens through the app,
authenticated as Case with MFA.

- The bridge holds **no** database credential and **no** secret key.
- Live samples are **ephemeral** — broadcast only, never written by the bridge.
- An abandoned roast leaves **zero** rows behind.
- `enforceLocalDataOwner()` and device-cache isolation are unaffected.

A `security-auditor` pass is required before this ships, per project convention.

---

## The bridge app

**Electron**, packaged as a normal macOS `.app`. Chosen because it reuses the existing
web stack — same React, Tailwind, and `theme.css` tokens — so it can carry the ember
palette and IBM Plex and look like a genuine piece of RoastLogs, not a generic utility.
Electron is also Chromium, matching Case's browser preference.

**Launch model:** opened per roasting session, not always-on.

**Status panel — three lamps, all backed by real signals:**

| Lamp | Green when |
|---|---|
| RoastLink | Connected, samples arriving, pongs returning |
| Cloud | Publishing to Supabase successfully |
| Viewers | *N* screens subscribed (via Realtime **presence** — genuinely counted, not faked) |

Plus a Connect button, with device discovery by hostname (`roastlink.local`) and a manual
IP fallback.

**Transport layer is swappable** — the WebSocket client sits behind a small interface so
BLE could be substituted without touching anything above it.

---

## App changes (Roast tab)

The v3 hero already has the right bones. The goal is to make it *live*, not to clutter it.

- **Temp dial goes live** — same segmented instrument, fed by the probe instead of typed,
  with a subtle live pulse. Fan → Heat → Temp order unchanged.
- **RoR readout** appears alongside it. This is the payoff metric.
- **Sparkline becomes real** — already in the v3 design; now it draws the live curve, and
  expands to the full chart on tap. Calm by default, detail on demand.
- **One status lamp** in the header, mirroring the bridge.
- **Preheat is solved implicitly** — because live BT is on screen *before* Start, the
  between-batch preheat to ≥315°F stops being guesswork. An explicit target + "READY TO
  CHARGE" indicator is phase 2 polish, not phase 1 scope.

### RoR must be smoothed

RoR is a derivative, and derivatives amplify noise brutally. Raw 1Hz thermocouple data
would produce a number twitching ±10°/min and looking broken. Computed over a rolling
window (~30s) with light smoothing. This is the difference between an instrument and a
jitter display, and it will be specified explicitly rather than left to taste.

### Roast boundaries

Back-to-back batches with a few minutes of cleanup and preheat between. The bridge and
app must cleanly end one roast and begin the next without the device's continuously
running clock bleeding across the boundary — hence offset capture at every Start, not
once per session.

---

## Degradation rules (non-negotiable)

A roast is time-critical and unrepeatable. The live feed is never a dependency.

| Failure | Behavior |
|---|---|
| Bridge not running / WiFi drops | Temp dial silently reverts to manual entry. Lamp red. Roast logging continues exactly as today. |
| `btState: "fault"` | Show "probe fault", hold last value greyed. **Never draw fabricated data.** |
| Missed `pong` | Mark disconnected, attempt reconnect with backoff, keep the roast running. |
| Equipment config has no probe | Live mode not offered at all. |

---

## Roast phases — reworked for dark roasts

The app was originally built to stop at medium; the five roast levels already exist
(`City` → `Vienna (Dark)`) but the **phase logic** stops at first crack. This is the
larger of the two UI efforts in this plan — bigger than the live-data wiring itself.

### Level list gains two entries

Case roasts dark for friends and family, so **French** and **Italian** are added beyond
Vienna. These are also what trigger the second-crack step below.

### Milestone sequence derives from the target roast level

The existing single contextual milestone button keeps its shape; its **sequence** is
computed from the roast level chosen at setup, so only relevant milestones ever appear.
No mode toggle, no settings panel — picking the target roast already tells the app what
to ask for.

| Target level | Button sequence |
|---|---|
| City · City+ · Full City | Yellowing → First Crack → **Drop** |
| Full City+ · Vienna | Yellowing → First Crack → **Drop** (SC available on demand) |
| French · Italian | Yellowing → First Crack → **Second Crack** → **Drop** |

### Naming and omissions

- **Dry End == Yellowing.** Same physical moment, different vocabulary (Pavel's vs.
  ours). Keep the existing `YELLOWING` label; no new phase.
- **First Crack End and Second Crack End are omitted.** In practice cracks trail off
  ambiguously and marking them precisely is guesswork. Deliberately not in the flow.

### Metrics stay honest

**Development time / DTR is measured from First Crack — on every roast, at every
level.** This was an explicit redirection: keying "dev" to second crack on dark roasts
would make DTR mean different things on different roasts, silently breaking
cross-roast comparison *and* orphaning the 21 existing roasts.

**Post-second-crack time is a separate, separately-named readout** for dark roasts,
where the window between Vienna and ruined is under a minute. Same information Case
wanted, without corrupting a standard metric.

## Preheat alert

Between back-to-back batches the Razzo chamber must be brought back to **≥315°F at the
bean probe** before charging. Live BT makes this an instrument reading rather than a
guess — and it is the clearest example of why recording is gated separately from
display (the stream must flow *before* the roast starts).

**Presented as a full-bleed state, not a modal.** With Razzo selected and no roast
running, the Roast tab *becomes* the preheat screen — giant mono numerals in the
established split-flap style, edge to edge, readable from across the garage. It clears
itself when Start is pressed; there is nothing to dismiss.

| State | Screen |
|---|---|
| **PREHEAT NEEDED** | Target called out large; chamber cold |
| **PREHEATING** | Live BT climbing, huge, against the 315°F target |
| **READY TO CHARGE** | Flash on crossing, then steady |

**Flash on the transition, then hold steady.** A permanently strobing screen is hard to
read and quickly irritating. The flash grabs attention at the moment of crossing; the
steady state is what gets read afterwards.

**Audible + haptic on crossing.** With the phone pocketed or face-down on a bench, no
visual alert reaches anyone. Sound/vibration is the alert that actually works; the
flash is the confirmation once he looks.

**Target lives on the equipment config** — Razzo defaults to 315°F, editable. Bare
SR540 and OEM tube have no probe, so no preheat state exists for them at all (the same
capability gate as the rest of live mode). Tying it to equipment rather than a global
setting means the target travels with the hardware instead of going stale.

This is a deliberate exception to the calm-and-generous aesthetic, and a justified one:
an instrument that cannot be read from six feet away has failed at being an instrument.

## Daylight-saving reminder

The device's timezone is a manual setting that **drifts silently** — CSV filenames and
roast timestamps go an hour off and nothing fails loudly.

Alaska runs AKDT (`-8.0`) in summer and AKST (`-9.0`) in winter. Next boundary:
**1 November 2026 → `-9.0`**.

**Computed, not hardcoded.** Derive US DST boundaries programmatically (second Sunday
in March, first Sunday in November) so it keeps working every year with no maintenance.
On crossing an unacknowledged boundary, show a dismissible banner on the Roast tab
naming the exact value to enter. Dismissal records *that* boundary as handled so it
does not nag.

Because the logic is computed rather than a scattered list of dates, removing it later
— if permanent DST ever arrives — is deleting one function.

*(Later refinement: if the device ever exposes its wall clock over the WebSocket, the
app could detect the drift itself instead of relying on the calendar. Not worth
chasing now.)*

## Device configuration (settled 2026-08-11)

Reviewed against the full Advanced Settings console. Board confirmed **TWO+ V3**,
firmware **v1.1.3** — V3 emits `sensorHealth`, closing the last open item.

| Setting | Value | Reason |
|---|---|---|
| **Probe mirroring** | **OFF** | Critical. Enabled, a disconnected ET shows a copy of BT — a fabricated curve that looks plausible. `0` is honest. |
| RDP (RoastMaster) | OFF | Unused; constant UDP broadcast on 5050. |
| Serial TC4 | OFF | USB ruled out (chaff near the laptop). |
| BLE (HiBean) | OFF | Unused; also saves battery. |
| **Modbus TCP (Artisan)** | **ON** | Kept for Artisan experimentation, as a separate session only. |
| Workflow | Roast | 1Hz is fixed in Roast mode. |
| Slew rate | 20 °F/s (default) | Spike filter. *Symptom to watch:* if charge looks over-smoothed or turning point is wrong, raise it. |
| Calibration | 1-point boiling, before logging roasts | Altitude 0 m → 212.0°F is valid for Anchorage. |
| SendGrid key | **Leave empty** | Would store a live credential on an unauthenticated device. |
| Machine Behavior | Untouched | CORE-only control settings; inert on a TWO+. |

Disabling unused outputs is not just hygiene — it returns RAM and sockets to a
constrained ESP32, which directly serves the single-connection stability constraint.

**Calibrate before accumulating roasts.** Recalibrating later shifts every reading and
makes roasts before and after non-comparable — the same hazard as changing equipment.

### Network

A static LAN address was set on the device, but **the risk is the router's DHCP pool**
— if the chosen address sits inside it, the router can lease it to another client.

**Resolution: a DHCP reservation on the Linksys router, device set back to Dynamic.**
One source of truth; the router owns the assignment and will never hand it out twice.
The bridge still targets `roastlink.local` (mDNS) with the IP as fallback.

### Security posture (device)

The RoastLink has **no authentication of any kind**. Anyone on the LAN can open its web
UI, change settings, start/stop roasts, and flash firmware via the Danger Zone. That is
the honest threat model for hobbyist ESP32 hardware.

A subnet mask is **not** a security control — it defines local addressing, not access.
What actually protects this setup, in order:

1. **Never port-forward it; never DMZ it.** LAN-only does most of the defending.
2. Reduce running services (the disabled outputs above).
3. Strong WPA2/WPA3 — the WiFi boundary *is* the security boundary here.
4. Optional: an IoT VLAN/guest network, with a rule permitting the Mac through.
5. No SendGrid credential on the device.

**None of this weakens RoastLogs.** The bridge holds no database credential, so a fully
compromised RoastLink can only broadcast false temperatures. Admin-only + `aal2` RLS is
untouched. The architecture already assumes the device is the weak link.

## Phasing

**Phase 1 — prove the pipe (the deliverable)**
1. Bridge connects to the device over WiFi, disables mirroring, subscribes via `hello_ui`.
2. Publishes offset-corrected samples to a Realtime channel.
3. RoastLogs shows live BT on **both** Mac and iPhone, with the status lamp.
4. `curve` saved with the roast on Save.
5. Manual entry and all existing behavior untouched.

**Phase 2 — make it an instrument**
- Live RoR with smoothing.
- The full preheat screen (states, flash-on-transition, audible/haptic).
- Turning-point auto-detection (first local minimum after charge).
- Ambient temp/humidity captured per roast.
- Comparison tool flags cross-equipment comparisons.

**Phase 3 — roast-phase rework** *(independent of live data; can run in parallel)*
- Add French and Italian roast levels.
- Milestone sequence derived from target roast level.
- Second-crack milestone + post-SC readout, DTR left anchored to first crack.
- DST reminder banner.

## Where this stands (updated 2026-08-20)

**Phase 1 is essentially working end to end.** Live bean temp flows from the real
device into RoastLogs, and the recording gate persists a curve on save. Verified
against both a mock and the real TWO+.

### Confirmed on the real device
- In **STA mode**, reachable at **`roastlink.local`** (mDNS resolves on the Mac).
- Board is **TWO+ V3**, firmware **v1.1.3** — emits `sensorHealth`.
- **Live `hello_ui` stream runs at ~5 Hz** (the manual's "1 Hz" is the CSV rate).
  Curve storage downsamples 5 Hz → ~1 Hz on save.
- **mirror_enabled:0 verified on hardware**: empty ET socket reads `0.0`, not a
  fake copy of BT. The data-integrity hazard is neutralized on the actual unit.
- Bean probe healthy (`btValid:true`, reads room temp with the roaster cold).

### Done and pushed (branch `claude/ui-redesign-gn7tf4`)
- **Bridge core** — `bridge/lib/{roastlink,publisher,bridge}.js` + `bridge/run.js`
  (headless runner). Device client (mirror-off, hello_ui, ping/pong, reconnect) →
  Supabase Realtime broadcast → viewer presence. Full pipe verified
  (mock → bridge → real Supabase → subscriber); lamps reach device:live,
  cloud:joined, viewers:1. `bridge/test/` has the mock + harness/roundtrip/e2e.
- **App live readout** — `src/hooks/useLiveRoast.js` (subscriber, presence),
  `src/lib/ror.js` (least-squares RoR, verified on a noisy ramp),
  `src/components/LiveRoastReadout.jsx` (status dot, live BT, RoR, REC badge).
  Wired at the top of the Roast tab, additive.
- **Recording gate** — captures the curve ONLY between START and COOLING START,
  downsampled ~1 Hz, saved on the roast; nothing persists before Save. Bridge only
  broadcasts, never writes.
- **DB** — `roasts.curve jsonb` added (additive/nullable; 21 existing rows
  untouched). Migration recorded in `docs/2026-08-20_add_curve_to_roasts.sql`.
  `syncService` reads/writes `curve` both directions.

### Next session starts here (in order)
1. **Verify the save path**: save one test roast with the bridge running, then
   confirm the stored `curve` in Supabase is exactly START..COOLING START.
2. **Feed BT into the Temp dial** in the hero (currently the dial shows "—"; live
   data only lands in the separate readout strip).
3. **Draw the saved curve** on `RoastCurveChart` (BT as `monotone`).
4. **Deploy** so the phone becomes the second screen. Preview on localhost first
   (house rule); the deploy machine needs a real `.env` (URL + publishable key).
5. Then: **Electron GUI shell** (double-click app + lamps — deferred, app-first),
   **preheat screen**, and **Phase-2 channel hardening** (private Realtime channel
   + RLS on `realtime.messages`, so only admins can read/publish the live channel —
   flagged because broadcast currently works with the public key + no auth).

Phase 3 (roast-phase rework: French/Italian, milestone sequence from roast level,
post-SC metric, DST reminder) is independent of hardware and can slot in anytime.

### Running it (Mac)
- Device on WiFi; `cd bridge && npm install --omit=dev` (skips Electron).
- `SUPABASE_URL=... SUPABASE_KEY=... node bridge/run.js roastlink.local`
- App on localhost needs a root `.env` with the real Supabase URL + publishable key.

### Fragile / don't forget
- The publishable key is intentionally public (powerless vs. the aal2 tables), but
  the live broadcast channel is not yet access-controlled — that's the Phase-2
  hardening above.
- `~/Desktop/roastlogs-old` still holds pre-rewrite history with the old emails —
  delete it once comfortable.

**Later**
- Second thermocouple (ET) if the roaster is modified.
- BLE fallback transport.

---

## Live graph — HOLD GATE (built + pushed, awaiting localhost review)

> **STATUS: built, tested, pushed — NOT deployed. Waiting on Case's localhost
> review before anything ships.** Commit `24d126e4` on
> `claude/ui-redesign-gn7tf4`. Do not deploy this without his sign-off; house
> rule is localhost review first, and he has not seen it running yet.
>
> **To review (needs the Mac — the chart only renders when a bridge is live):**
> ```
> cd ~/Desktop/roastlogs && git pull && npm start
> ```
> then start the bridge and open the Roast tab. No roaster required: run
> `cd bridge && npm run mock` and point the bridge host at `127.0.0.1` to watch
> the graph animate on fake climbing temps.
>
> **Open decision for Case to make from real use:** which windowing mode
> becomes the default — the trailing "3 min" pannable window, or "Full"
> auto-expand. Both are built; the in-chart toggle switches them.
>
> **Still deferred (unchanged):** first/second-crack time estimates, staged as
> a later phase per the reasoning at the end of this section.

### Original plan (as approved)

**Status: v3.3.0 (channel lockdown) is live and verified end to end on real
hardware — live BT, RoR, the desktop bridge app with lamps, phone-visible
connection status, and the curve saving correctly.** This section plans the
next visible piece: a real-time chart on the Roast tab, in the style of
Artisan, rather than just the compact BT/RoR readout strip that exists today.

### Blast radius

**What changes:** a new component on the Roast tab (expand-in-place from the
existing live readout strip); no changes to `RoastCurveChart.jsx` (the
finished-roast History chart) or any data table.

**What does NOT change:** the recording gate, `curve` storage, the bridge, the
channel lockdown, and every existing screen. This is purely a new rendering
surface over data that already exists and already saves correctly.

**Nothing here is destructive.** Worst case if a design choice is wrong: it's
a chart, not saved data — nothing to roll back beyond the code itself.

### Where it lives

**Expand-in-place, not a modal.** The existing compact readout (status dot,
live BT, RoR) becomes tappable. Tapping it expands a full chart panel inline,
directly below the readout and above the Fan/Heat/Temp dials — so **the dials,
the milestone button, and the chart are all on screen and usable at the same
time.** This was explicit: Case wants to adjust Heat/Fan and watch the graph
respond without navigating away. Collapsing back to the compact strip is the
same tap.

### What's on it

**Top panel — Temp + RoR**, matching `RoastCurveChart`'s existing visual
language (Temp `monotone`, smoothed RoR line) but fed by the live curve buffer
instead of a finished roast's saved array. Reuses the existing
`src/lib/ror.js` smoothing, already proven live.

**Bottom panel — Control map, with the profile overlaid.** Heat/Fan as
`stepAfter` (never smoothed — discrete dials, per project convention), same as
today. When a profile is being followed, its planned steps
(`{time, heat, fan}` — confirmed this is all a profile step actually contains;
no temperature target exists) are drawn as a **target/reference line
alongside the actual logged steps** — the graph version of the existing "Next
step" guidance strip, made continuous and comparable at a glance. No new data
model needed; this uses `profileFollowing.steps` as-is.

**Milestone bands — live, not just markers.** Matches the finished chart's
phase-shaded regions, but animated: **the current phase's band is
highlighted/shaded live as the roast moves through it** (Case's explicit
answer), with the boundary appearing the instant a milestone is tapped — same
underlying data (`roastLog` phase entries), just rendered while still growing
instead of after the fact.

### Time axis — build both, decide after testing

Case wants **both** windowing styles tried before committing:
- **Fixed 3-minute scrolling window**, with left/right scroll/pan to review
  any earlier point in the roast so far (a real "live instrument" feel).
- **Auto-expanding axis** (what `RoastCurveChart` already does for a finished
  roast) — always shows the whole roast so far, compresses as it grows.

Both are built as a switchable mode in the same component (not two separate
components) so comparing them is a single toggle, tested live against the mock
bridge before either ships as the default.

### Architecture

**New component**, not a modification of `RoastCurveChart.jsx` — keeps the
finished-roast History chart at zero risk. The live component reads:
- `curveRef`'s growing buffer (already exists — the same data the recording
  gate captures) for Temp/RoR,
- `roastLog` for phase bands and Heat/Fan actuals (already exists),
- `profileFollowing.steps` for the overlay (already exists).

No new data is required anywhere in this phase — this is a rendering surface
over state the app already has live, in memory, right now.

### Phase 2 (explicitly deferred): First/Second Crack time estimates

Case asked about Artisan-style projected time-to-milestone. This is real work,
not a quick add — an honest estimate means extrapolating the *current* RoR
trend forward toward a BT threshold, and:
- it will be unreliable in the first 1-2 minutes before RoR stabilizes, and
  should be **suppressed rather than shown wrong** during that window (same
  instinct as the recording gate — don't display a number that can mislead);
- the right threshold likely needs tuning against Case's own roast history
  rather than a generic industry constant, once enough real curves exist to
  learn from.

Deliberately staged *after* the core chart ships and has been used on a few
real roasts — same "prove the pipe, then build on it" order as the rest of
this project.

### Verification

**Intent:** open the Roast tab, tap the readout, the panel expands with the
dials still visible and adjustable; start a mock/real roast and watch Temp/RoR
draw live; log a milestone and see the phase band shade in real time; follow a
profile and see its steps overlaid against actual.

**Non-breakage:** `RoastCurveChart.jsx` and the History detail view are
untouched and re-verified unchanged; existing e2e baselines still pass;
Fan → Heat → Temp order and `stepAfter` convention hold in the new component
too.

**Build order:** against `bridge/test/mock-roastlink.js` on localhost first —
same test-before-hardware discipline as every other piece of this build.

---

## Open items

| Item | Resolution |
|---|---|
| Board variant (TWO+ / V2 / V3) | Firmware is v1.1.3, but the *hardware* variant is still unconfirmed. Determines whether `sensorHealth` frames exist. Conditional, not a redesign — `tools/roastlink-sniff.js` answers it. |
| Device in STA mode | **Blocking.** Currently observed at `192.168.4.1` (AP mode). Must complete WiFi setup. |
| `roastlink.local` resolves on the Mac | Confirm via the sniffer; manual IP is the fallback. |
| Real CSV from a roast | Sharpens curve shape and RoR window tuning. |

## Tooling

`tools/roastlink-sniff.js` — a read-only diagnostic that connects to the device,
disables probe mirroring, sends `hello_ui`, and reports the field inventory, measured
sample rate, `sensorHealth` availability, and ping/pong health. Zero dependencies on
Node 22+. Verified end-to-end against a mock implementing the documented contract.

```
node tools/roastlink-sniff.js                # roastlink.local
node tools/roastlink-sniff.js <device-ip>    # explicit IP
```

---

## Verification (intent + non-breakage)

**Intent — did the thing asked for happen?**
- Open the bridge, press Connect: three lamps go green.
- Start a roast: a live bean temp appears on the Mac *and* the iPhone, updating ~1/sec,
  and the two agree.
- Save the roast: reopen it and the curve is there, correctly time-aligned to the phases.

**Non-breakage — did anything that used to work stop working?**
- Log a roast with the bridge **off** — manual entry behaves exactly as before.
- Open an existing roast from before this change — it renders normally with no curve.
- Existing e2e suite passes; new screens get baselines in the same session.
- Fan → Heat → Temp order intact; Heat/Fan chart lines still `stepAfter`.
- `security-auditor` pass before commit; `/rls-audit` to confirm policies unchanged.

---

## SHIPPED — v3.4.0, 2026-08-29

The live graph hold gate is closed. Reviewed on localhost, released, and
verified live: bundle `main.f60e2005.js`, version string 3.4.0 in the shipped
JS, `roastlink-live` present.

**What shipped.** The Roast tab is one instrument surface divided by hairlines
instead of four nested cards: elapsed time and bean temp on one row, the live
curve under it, Fan/Heat/Temp as a hairline triptych, milestone and run
controls in the thumb zone. Phase bands name themselves on the curve
(`DRY 0:00`, `MAILLARD 3:10`, `DEV 7:45`) with the time each began, so the
phase rail yields whenever the curve is up and falls back for probe-less manual
roasts. Temperature axis pinned at 475F; RoR gained a real right-hand axis.
Both window modes (3 min and Full) stay available at all times.

**Release gotcha worth remembering.** The first deploy attempt published 3.0.1,
because `main` had not been merged and `npm run deploy` happily builds whatever
is checked out. Guard before every deploy:
`node -p "require('./package.json').version"` and confirm the deploy log reads
`roastlogs@<expected> deploy`.

---

## DENSITY PASS — done 2026-08-31 (PR #12, awaiting localhost review)

The instrument was **607px in a 603px window**: it missed fitting by a hair, so
every zone had been shaved to make five fit and the payoff was never delivered.
Of the curve zone's 298px, ~50px was restatement (two identical x-axes 80px
apart, plus a legend row), none of it plot pixels.

The old note's leading hypothesis named the right zone but the wrong cause. The
panels were not too short; they were over-chromed. **607px -> 578px running,
clearing the nav by 25px, with no plot pixels lost and no zone removed.**

Three things measurement turned up that were not in the hypotheses:

- **A latent alignment bug.** The temp panel carries a right-hand RoR axis and
  the control map did not, so their plot areas differed by 40px and the two
  time scales never lined up. Harmless while each drew its own ruler; a
  correctness problem the moment one ruler serves both. Fixed with a
  counterweight axis.
- **The floating adjustment button was sitting on top of PAUSE.** It opens the
  same popup as a dial tap, so it now appears only once the real controls
  scroll away (IntersectionObserver, not a scroll listener).
- **The RoR axis was printing unrounded floats** ("489.5999").

Phase names moved off the plot into a **16px ribbon** above it. In-plot labels
sat at the band's top-left, which is exactly where the y-axis ticks are, and any
band under 20% of the window dropped its label entirely -- so on a full-roast
view DEV and COOL went unnamed, in the mode where the name matters most. The
ribbon fit-tests each name against its measured segment width and shows colour
alone rather than truncating.

## DECISIONS SETTLED 2026-08-31

**Phase vs moment.** A PHASE is a span: shaded band + ribbon segment, width means
duration. A MOMENT is an instant: a dot on the curve and a Roast Timeline row,
nothing else. Measured on a real-shaped roast, only 2 of 9 ladder tags fit as
bands -- the approaches came out as 10-19px slivers -- because Charge,
Turnaround and the three Approaches have no duration. Forcing a moment into a
span is the category error that produced them.

| PHASES (bands) | Boundary |
|---|---|
| Drying | Charge -> 305F |
| Maillard | 305F -> 340F |
| Caramelization | 340F -> First Crack |
| Development | First Crack -> Drop |

| MOMENTS (dots) | When |
|---|---|
| Turnaround | detected BT dip minimum |
| Yellowing | MANUAL, when Case presses it |
| Maillard approach | 280F |
| Caramelization approach | 330F |
| First crack approach | 375F |

First Crack and Drop are both a dot and a band edge.

**No Cooling phase.** The SR540 runs its own 3-minute cool cycle after the drop
and there is nothing worth tracking in it. DROP ends the tracked data, so the
chart stops growing there rather than trailing a flat tail while the timer runs
on to the save screen.

**YELLOWING is a moment, not a boundary.** Case marks it by eye and the press
timestamps it; he wants it for cross-roast comparison on the same bean. It no
longer opens the Maillard band -- 305F does.

**Backwards compatibility: Maillard falls back to the Yellowing mark.** It opens
at the 305F crossing when one was logged, and at the YELLOWING entry when none
was. Every roast already in History renders exactly as it did, probe-less manual
roasts keep working, and no migration or re-save is needed.

**Acronyms are a chart-only concern.** Charts show short tags; anywhere with room
shows the full word. Labels are STORED in full (`MAILLARD APPROACH`,
`CARAMELIZATION`, ...) because the Roast Timeline renders `entry.label` directly.
The chart maps them via `PHASE_TAGS` / `PHASE_NAMES` in `LiveRoastChart.jsx`.
The tooltip prints the full name (`06:28 · Maillard`, or the moment when scanning
near a dot), which makes it the key for the ribbon's acronyms.

**Ladder entries are ordinary phase entries, unflagged.**

**The phase rail keeps today's behaviour** -- it renders only when the curve is
not on screen, keying off whether data is actually arriving rather than off the
equipment dropdown, which is a claim that can disagree with reality.

## NEXT SESSION — equipment field

The temperature phase ladder is BUILT (2026-08-31, PR #12). What remains:

**Equipment field.** A roaster/tube selector in session setup: SR540 bare, OEM
extension tube, V5T Razzo. It drives the 315F preheat warning, and it records
which tube a roast used, without which History comparisons mislead (the tube
materially changes the curve). Deliberately NOT wired to rail-versus-curve
visibility -- see the rail decision above.

**Ladder follow-ups, not yet done:**
- The History roast-detail chart (`RoastCurveChart.jsx`) does not yet draw the
  moment dots or the four-phase bands; only the live chart does. Saved roasts
  DO carry the entries, and the Roast Timeline shows them, so nothing is lost --
  the History chart just does not visualise them yet.
- Turnaround detection guards are first-pass: it ignores the first 10s, looks
  only inside the first 4 minutes, and needs a 5F rise off the low before it
  commits. Wants checking against a few real roasts.
- Approaches fire once, on a rising crossing only. If BT dips back below a
  threshold and re-crosses, nothing re-fires. That is intended; confirm it
  matches how Case reads them.

## PLAYWRIGHT BASELINES — action needed on Case's machine

**The v3.4.0 instrument rebuild shipped without regenerating a single
snapshot** (`git show --stat b411eb2 | grep -c snapshots` -> 0). The roast-tab
baselines were last updated at `885a0cd`, before the rebuild, so they still
expect a `PHASE MILESTONES` section the app no longer has. Six tests have been
failing since v3.4.0 for that reason and will fail on any machine.

Fix is `npx playwright test --update-snapshots` on Case's machine, after
reviewing the density pass. Do NOT regenerate baselines from a cloud container:
a further eight failures there are 2-pixel height differences from that
container's font rendering, and Playwright rejects on size mismatch before
`maxDiffPixelRatio` can apply, so committing those would bake foreign rendering
into the repo.

## KNOWN GAPS (found during the dry run, not yet fixed)

- ~~**The live curve does not survive a page reload.**~~ FIXED 2026-08-31
  (PR #12). The curve persists under `live_curve` alongside the other
  in-progress keys, written every 5th sample with a `pagehide` /
  `visibilitychange` flush for the tail. The `live_` prefix means
  `enforceLocalDataOwner`'s account-switch purge already covers it.
- **A pause collapses samples onto one second.** Capture correctly continues
  through a pause, but `elapsedSeconds` is frozen, so every incoming sample
  overwrites the same bucket.
- **`roastlogs_e2e` in localStorage skips BOTH the login screen and the MFA
  gate** on `npm start` (`src/index.js:29`), and persists after any `/ui-loop`
  run. It looks exactly like a broken app: 401s everywhere, live dot red,
  bridge Viewers stuck at 0, Sign Out doing nothing. Clear with
  `localStorage.removeItem("roastlogs_e2e"); location.reload();`
  Worth a visible "E2E BYPASS ACTIVE" banner so it can never masquerade as a
  normal session.
- ~~**`CLAUDE.md` still imports `@.claude/case-profile/00-04`**~~ FIXED -- it
  now imports `.claude/working-agreement.md`.
