# ☕ RoastLogs — Product Requirements Document
**Version 2.1 | Updated April 2, 2026**
**Project:** RoastLogs PWA — Fresh Roast SR540 + Extension Tube
**Developer:** Casey Dyer | Vibe Coding Approach (Claude + Windsurf IDE)
**Live URL:** https://caseydyer8.github.io/roastlogs
**Repo:** https://github.com/caseydyer8/roastlogs
**Local Path:** /Users/casey/Documents/roastlogs

---

## 1. Project Overview

RoastLogs is a mobile-first Progressive Web App (PWA) built specifically for home coffee roasters using the Fresh Roast SR540 with the extension tube. The app covers live roast session logging, roast history with charts, green bean inventory, brew/tasting tracking, and roast profiles. Built with React + Tailwind CSS, hosted on GitHub Pages, with Supabase cloud sync.

### Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React + Tailwind CSS |
| Charts | Recharts |
| Local Storage | IndexedDB + localStorage |
| Photo Storage | IndexedDB (local only, never synced to cloud) |
| Cloud Sync | Supabase (free tier, RLS disabled) |
| Hosting | GitHub Pages |
| AI Coding | Windsurf IDE (Cascade / SWE-1.5 model) |
| Planning | Claude.ai |

### Key Architecture Decisions
- **Photos stored locally only** — IndexedDB on device, never uploaded to Supabase. Preserves 0.5GB Supabase quota for text/number data only.
- **Supabase sync explicitly strips all photo/image/base64 fields** before any cloud write.
- **PWA-first** — installable on iPhone via Safari. Native App Store path deferred to Phase 5.
- **One Windsurf prompt per feature, new chat each time** — core vibe coding discipline.

---

## 2. Build Timeline & Time Log

| Phase | Description | Status | Est. Time | Actual Time | Completed |
|---|---|---|---|---|---|
| Phase 1 | Foundation, Live Roast Timer, GitHub Pages deploy | ✅ Complete | 4–6 hrs | ~5 hrs | Early March 2026 |
| Phase 2 | Roast History, Charts, Post-Roast Entry, Supabase | ✅ Complete | 4–6 hrs | ~6 hrs | Mid March 2026 |
| Phase 3 | Bean Inventory, AI Recommendations, Roast Level Guide | ✅ Complete | 4–6 hrs | ~5 hrs | Mid March 2026 |
| Phase 4 | Tasting Wizard, Profile Builder, PWA Polish | ✅ Complete | 4–6 hrs | ~6 hrs | Late March 2026 |
| Bug Fix Session 1 | formatMMSS hoisting, Beans tab crash, weight NaN | ✅ Complete | ~1 hr | ~1 hr | March 28, 2026 |
| Bug Fix Session 2 | iPhone test session, bug list created | ✅ Complete | ~2 hrs | ~2 hrs | March 29, 2026 |
| Bug Fix Session 3 | BUG-002, BUG-005, BUG-006 fixes | ✅ Complete | ~1 hr | ~1 hr | Prior to April 2 |
| Bug Fix Session 4 | BUG-003, BUG-004, IDEA-001, IDEA-002, photo architecture | ✅ Complete | ~3 hrs | ~3 hrs | April 2, 2026 |
| **Remaining** | BUG-001, IDEA-003 through IDEA-010 | 🔲 Pending | ~4–6 hrs | — | — |
| **Phase 5** | Capacitor.js + App Store submission | 🔲 Optional | ~4–6 hrs | — | — |

**Total time invested to date: ~30 hours**
**Estimated time to full MVP (bugs + all ideas): 4–6 hours**
**Estimated time to App Store launch: additional 4–6 hours**

---

## 3. Feature Status

### 3.1 Live Roast Session Screen ✅ Complete
- Master timer (MM:SS)
- Phase milestone buttons: Start, Drying End, Maillard End, First Crack, Cooling Start
- Adjustment logger: Heat (1–9), Fan (1–9), Temp, timestamp, optional note
- Session header: bean name, green weight, roasted weight, target roast level, batch number, date/time, notes
- DEV timer (counts up from First Crack, always red)
- Numpad for Heat/Fan/Temp input
- Heat/Fan capped at 1–9

### 3.2 Post-Roast Entry ✅ Complete
- Roasted weight entry (calculates weight loss %)
- Visual roast color assessment
- Star rating (1–5)
- Would you roast again? (Yes/No/Maybe)
- Brew method used for tasting

### 3.3 Roast History & Log ✅ Complete
- Scrollable list sorted newest first
- Search and filter
- Full detail view with timeline
- Recharts: heat/fan/temp over time
- Edit roast functionality
- Timestamps display in MM:SS format ✅ (BUG-002 fixed)

### 3.4 Roast Level Reference System ✅ Complete
- All 8 roast levels with SR540 + extension tube guidance

### 3.5 AI Bean Recommendation Engine ✅ Complete
- Claude API integration for bean roasting recommendations
- Web search enabled for current origin data

### 3.6 Green Bean Inventory Tracker ✅ Complete
- Add/edit/delete beans
- Auto-deduct weight on roast
- Low stock alerts
- Bean profile page with roast history

### 3.7 Brew / Tasting Wizard ✅ Complete
- 4-step wizard based on SCA Coffee Tasters Flavor Wheel
- Step 1: Acidity (Delicate/Mild/Balanced/Bright/Sharp) + Body (Watery/Delicate/Medium/Round/Syrupy) ✅ Updated April 2
- Step 2: Flavor family selection
- Step 3: Sub-category selection — Fruity supports multi-select ✅ (BUG-004 fixed April 2)
- Step 4: Shows ALL selected flavor notes + Acidity and Body descriptor words ✅ Updated April 2
- Photo capture stored locally in IndexedDB ✅ (BUG-003 fixed April 2)
- Brew sync to Supabase tasting_notes table ✅ Added April 2

### 3.8 Profile Builder ✅ Complete (with fixes)
- Create and save roast profiles
- Steps append to bottom chronologically ✅ (BUG-005 fixed)
- Heat/Fan capped at 1–9 ✅ (BUG-006 fixed)
- Profile vs Actual comparison in History detail view 🔲 Manual deviations not yet shown (IDEA-004)

### 3.9 Data Storage Architecture ✅ Established April 2
- Supabase tables: `roasts` (UNRESTRICTED), `tasting_notes` (UNRESTRICTED)
- Photos: IndexedDB local only — never sent to Supabase
- Supabase sync strips all photo/image/base64 fields before cloud write
- Helper functions: `savePhotoLocally(key, base64)`, `getPhotoLocally(key)`

### 3.10 PWA & Deployment ✅ Complete
- Installable on iPhone via Safari → Share → Add to Home Screen
- Hosted at caseydyer8.github.io/roastlogs
- Offline capable for core roasting features
- Dark mode default

---

## 4. Remaining Work to MVP

### 4.1 BUG-001 — Supabase Sync Red Dot (Est. 1 hr)
**Priority: High — fix first next session**
Supabase sync indicator turns red after saving a roast. Brew sync added April 2 but roast sync dot still unresolved.
- Check `supabaseClient.js` env var reading
- Add `console.log` to `syncRoastToSupabase`
- Verify `handleStop` is calling sync
- Confirm `.env` is in project root not `src/`

### 4.2 IDEA-003 — Profile Builder UX Redesign (Est. 1 hr)
**Priority: Medium — ASK QUESTIONS before implementing**
Profile name placeholder is misleading. Full UX rethink needed.

### 4.3 IDEA-004 — Profile vs Actual: Show Manual Deviations (Est. 1 hr)
**Priority: Medium — ASK QUESTIONS before implementing**
History detail view should show manual adjustments that deviated from the saved profile, or "No changes made" if followed exactly.

### 4.4 IDEA-005 — Custom Ratio Free Text Field (Est. 30 min)
**Priority: Low — no questions needed**
Show free text input when "Custom" selected in Ratio dropdown.

### 4.5 IDEA-006 — Beans Tab: Log a Session Button (Est. 30 min)
**Priority: Medium — no questions needed**
Add "Log a Session" button in Bean Detail view that pre-fills Roast tab with bean name and navigates there.

### 4.6 IDEA-007 — Settings: Export Data (Est. 1–2 hrs)
**Priority: Medium — ASK QUESTIONS before implementing**
Export menu with CSV, XLSX, PDF options. Need to clarify data format for each.

### 4.7 IDEA-008 — Settings: Light Mode (Est. 1 hr)
**Priority: Low — ASK QUESTIONS before implementing**
Light/dark mode toggle. Casey wants input on color scheme before building.

### 4.8 IDEA-009 — Settings: Units of Measure (Est. 30 min)
**Priority: Low — no questions needed**
Toggle °F/°C and grams/ounces throughout the app.

### 4.9 IDEA-010 — Settings: About Screen (Est. 30 min)
**Priority: Low — ASK QUESTIONS before implementing**
About button currently does nothing. Need to know what Casey wants displayed.

---

## 5. On the Horizon (Post-MVP)

- **Camera OCR** — Read Heat/Fan values from SR540 display mid-roast. Confirmed physically feasible. Deferred.
- **Phase 5: App Store** — Capacitor.js conversion to native iOS. Requires $99/yr Apple Developer account.

---

## 6. Standard Session Workflow

Every coding session follows this sequence:

**Startup:**
```
cd /Users/casey/Documents/roastlogs
git pull
npm install
npm start
```

**During session:**
- One Windsurf prompt per feature, new Cascade chat each time
- Use SWE-1.5 model (free, best for React/Tailwind)
- Test on localhost:3000 before committing
- Fix bugs before adding features

**End of session:**
```
git add .
git commit -m "description of changes"
git push origin main
npm run deploy
```

Then reinstall PWA on iPhone: Safari → caseydyer8.github.io/roastlogs → Share → Add to Home Screen.

---

## 7. Supabase Configuration

| Setting | Value |
|---|---|
| Tables | `roasts`, `tasting_notes` |
| RLS | Disabled on both tables |
| Photos | Never stored in Supabase |
| SQL Editor | Available for direct queries |

---

*RoastLogs PRD v2.1 — Happy Roasting ☕*
