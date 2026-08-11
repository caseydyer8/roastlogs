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
| WiFi at the roaster | Garage, strong signal, extender already in place. Low risk. |
| Two-way event sync | **Not wanted.** RoastLogs never commands the device. |
| Recording window | **Gated by RoastLogs, phase 1.** Recording starts at `START`, stops at `COOLING START`. |

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

## Phasing

**Phase 1 — prove the pipe (the deliverable)**
1. Bridge connects to the device over WiFi, disables mirroring, subscribes via `hello_ui`.
2. Publishes offset-corrected samples to a Realtime channel.
3. RoastLogs shows live BT on **both** Mac and iPhone, with the status lamp.
4. `curve` saved with the roast on Save.
5. Manual entry and all existing behavior untouched.

**Phase 2 — make it an instrument**
- Live RoR with smoothing; explicit preheat "READY TO CHARGE" target.
- Two-way event sync (milestone button drives the device's log too).
- Turning-point auto-detection (first local minimum after charge).
- Ambient temp/humidity captured per roast.
- Comparison tool flags cross-equipment comparisons.

**Later**
- Second thermocouple (ET) if the roaster is modified.
- BLE fallback transport.

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
node tools/roastlink-sniff.js 192.168.1.42   # explicit IP
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
