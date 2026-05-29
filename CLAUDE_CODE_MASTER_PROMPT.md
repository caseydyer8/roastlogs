\# ☕ RoastLogs — Claude Code Master Agent Prompt

\# Version: May 2026

\# Paste this entire file into Claude Code to begin an autonomous build session.

\# Casey reviews all output on localhost before any commit reaches main or production.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\## PHASE 0 — BRANCH SETUP (Run this first, every session)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



Before touching a single source file, establish the safe working environment.



\### Step 0A — Verify you are on the correct branch



Run in terminal:

```

git status

git branch

```



You must be on the `develop` branch before doing any work.

\- If `develop` does not exist yet, create it: `git checkout -b develop`

\- If it exists, switch to it: `git checkout develop`

\- If you are on `main`, STOP and switch to `develop` first.



NEVER commit directly to `main`. All work happens on `develop`.



\### Step 0B — Snapshot the current state as a recovery tag



Run:

```

git tag snapshot-before-session-$(date +%Y%m%d) main

git push origin --tags

```



This creates a permanent, named recovery point on `main` before any changes.

Casey can always roll back to this exact state with: `git checkout snapshot-before-session-YYYYMMDD`



\### Step 0C — Create a session working branch off develop



Run:

```

git checkout develop

git pull origin develop 2>/dev/null || true

git checkout -b session/$(date +%Y%m%d)-bugs-and-features

```



This gives you an isolated working branch. If anything goes wrong, Casey deletes it and nothing is lost.



\### Branch architecture summary:

```

main          ← production only. Never touched directly. What GitHub Pages serves.

&#x20; └─ develop  ← integration branch. All reviewed, tested work merges here first.

&#x20;      └─ session/YYYYMMDD-\*  ← your working branch each session (created above)

```



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\## PHASE 1 — CODEBASE AUDIT (Run before writing any code)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



The bugs file (bugs/BUGS\_AND\_FUTURE\_IDEAS.md) is stale — last updated March 29, 2026.

Work was done in April and May 2026 that is NOT reflected in that file's Status fields.

DO NOT trust that file's "Open/Closed" status. Audit the actual code.



Run these searches and record findings in SESSION\_NOTES.md before writing any code:



```bash

\# Get the full component inventory

ls src/

ls src/components/ 2>/dev/null || echo "No components subdirectory found"



\# Check for each item in the work queue

grep -r "formatTime\\|formatMMSS" src/ --include="\*.js" --include="\*.jsx" -l

grep -r "type=\\"file\\"\\|FileReader" src/ --include="\*.js" --include="\*.jsx" -l

grep -r "expandedFruitType" src/ --include="\*.js" --include="\*.jsx"

grep -r "addStep" src/ --include="\*.js" --include="\*.jsx"

grep -r "max=\\"9\\"\\|max={9}" src/ --include="\*.js" --include="\*.jsx" -l

grep -r "brewRatio.\*Custom\\|Custom.\*brewRatio" src/ --include="\*.js" --include="\*.jsx"

grep -r "Log a Session\\|logSession\\|prefillBean" src/ --include="\*.js" --include="\*.jsx"

grep -r "roastlogs\_temp\_unit\\|useUnits" src/ --include="\*.js" --include="\*.jsx"

grep -r "deviation\\|Deviation" src/ --include="\*.js" --include="\*.jsx"

grep -r "exportCSV\\|exportJSON\\|Export Data\\|downloadFile" src/ --include="\*.js" --include="\*.jsx"

grep -r "About\\|about.\*modal\\|AboutModal" src/ --include="\*.js" --include="\*.jsx"

grep -r "roastlogs\_theme\\|lightMode\\|data-theme\\|light-mode" src/ --include="\*.js" --include="\*.jsx"

grep -r "ForgeTab\\|forge.\*tab\\|Forge" src/ --include="\*.js" --include="\*.jsx" -l

grep -r "is\_ai\_generated\\|AI.\*badge\\|ai.\*badge" src/ --include="\*.js" --include="\*.jsx"



\# Check nav structure

grep -r "activeTab\\|setActiveTab\\|bottom.\*nav\\|BottomNav" src/ --include="\*.js" --include="\*.jsx" -l



\# Security audit while we're here

grep -r "dangerouslySetInnerHTML" src/ --include="\*.js" --include="\*.jsx"

grep -r "console\\.log.\*key\\|console\\.log.\*KEY\\|console\\.log.\*supabase" src/ --include="\*.js" --include="\*.jsx"

```



For each work queue item, note in SESSION\_NOTES.md:

\- ALREADY DONE — found \[what you found] — SKIPPING

\- PARTIALLY DONE — found \[what exists] — COMPLETING

\- NOT FOUND — implementing from scratch



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\## PROJECT IDENTITY

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



App: RoastLogs — mobile-first PWA for the Fresh Roast SR540 + extension tube.

The extension tube is central to every roast feature — it slows the roast, lowers effective

temps \~10-15°C, improves airflow, and requires different Heat/Fan strategies than stock SR540.



\- Live app:  https://caseydyer8.github.io/roastlogs

\- Repo:      https://github.com/caseydyer8/roastlogs

\- Local:     /Users/casey/Documents/roastlogs

\- Stack:     Create React App · React 18 · Tailwind CSS · Supabase JS v2 · Recharts · GitHub Pages

\- Version:   1.0.0 (package.json confirmed)



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\## ABSOLUTE RULES — NEVER VIOLATE

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



1\.  BRANCH DISCIPLINE: All work on session/\* branch only. Never commit to main.

2\.  NO DEPLOY: Never run `npm run deploy` or `git push origin main`. Casey handles all deploys.

3\.  NO GIT TO MAIN: Never run `git merge main`, `git push origin main`, or `gh-pages` commands.

4\.  AUDIT BEFORE CODE: Read the existing component before writing anything for it.

5\.  BUGS FIRST: Complete all open bugs before starting any IDEA feature.

6\.  ONE ITEM AT A TIME: Finish completely before moving on.

7\.  NO PHOTOS IN SUPABASE: Strip all image/base64 fields before any Supabase write. Always.

8\.  NO dangerouslySetInnerHTML: Use React's default rendering. Period.

9\.  NO CREDENTIALS IN CODE: Keys live in .env only. Never log them. Never hardcode them.

10\. NEVER MODIFY .env: Read it to understand var names. Do not alter it.

11\. PRESERVE THEME: Dark mode amber/orange palette is locked. Do not introduce new colors.

12\. COMMENT EVERY CHANGE: Add `// BUG-XXX FIXED: desc` or `// IDEA-XXX: desc` to modified files.

13\. CONSERVATIVE ON AMBIGUITY: Leave `// TODO: Casey review — \[question]` and move on.

14\. SECURITY FLAGS: Any new security concern must appear in SESSION\_NOTES.md Security section.

15\. SESSION\_NOTES.md: Required output. Create/overwrite at session end. Casey reads this first.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\## CONFIRMED COMPLETED — DO NOT TOUCH

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



Verified done from session memory. Leave these alone:



✅ BUG-001 — Supabase sync red dot (fixed May 4: .env key, paused project, missing tasting\_notes columns)

✅ IDEA-001 — Acidity tappable buttons (Flat/Low/Medium/Bright/Vibrant) in tasting wizard Step 4

✅ IDEA-002 — Body tappable buttons in Step 4 + all selected flavor notes shown (not just top 5)

✅ IDEA-003 — Profile Builder: full-width amber card, FOR THIS BEAN/GENERIC PROFILES sections, cleanup tool

✅ formatMMSS hoisting crash (fixed March 28)

✅ Beans tab roastDetail crash (.milestones → .roastLog, fixed March 29)

✅ Gray screen / Tailwind not loading (fixed early sessions)

✅ Weight loss NaN (greenWeight/roastedWeight string→number, fixed March 28)



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\## ARCHITECTURE — LOCKED IN

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



Supabase tables:

&#x20; roast\_sessions   — core session data

&#x20; tasting\_notes    — acidity, body, brew\_again, roast\_id, method, device, temp,

&#x20;                    families, descriptors, rating, notes, date

&#x20; beans            — green bean inventory

&#x20; roast\_profiles   — manual + AI profiles (is\_ai\_generated=TRUE for Forge output)

&#x20; brew\_sessions    — brew/tasting sessions



Locked decisions (do not change):

&#x20; - Photos → IndexedDB only. NEVER Supabase. Strip before every sync write.

&#x20; - roast\_profiles shared table for manual and AI profiles (is\_ai\_generated flag)

&#x20; - Claude API called client-side (known security debt — flag with comment, do not remove)

&#x20; - Settings = gear icon ⚙ top-right of app header (NOT bottom nav)

&#x20; - Bottom nav target order: Roast · History · Brew · Beans · Forge

&#x20; - RLS currently DISABLED on Supabase (known debt — do not make it worse)



Environment variables (in .env, never touch):

&#x20; REACT\_APP\_SUPABASE\_URL

&#x20; REACT\_APP\_SUPABASE\_ANON\_KEY

&#x20; REACT\_APP\_CLAUDE\_API\_KEY



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\## WORK QUEUE — PRIORITY 1: BUGS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



Execute in strict order. Audit each one before writing code.



────────────────────────────────────────

BUG-002 — Edit Roast Timestamps Show Raw Seconds

────────────────────────────────────────

Symptom: Timeline entry timestamps display as raw seconds (e.g. 634) in History edit mode.

&#x20;        After saving and returning to detail view they show correctly as MM:SS.



Audit: Search for timestamp display in edit-mode render of timeline/adjustment entries.

&#x20;      Check if formatTime() is being called there. If already fixed, skip and note it.



Fix: Find every place a timestamp value is DISPLAYED (not edited) inside the roast edit UI.

&#x20;    Wrap those values with the same formatTime() already used in the read-only detail view.

&#x20;    Do NOT change stored values. Do NOT apply to editable input fields — display labels only.



After fix, add: // BUG-002 FIXED: formatTime() applied to edit-mode timestamp display labels



Test steps (write these in SESSION\_NOTES.md):

1\. History tab → tap any roast with adjustment entries → tap Edit

2\. Every timestamp label should show MM:SS (e.g. 10:34), not raw seconds (e.g. 634)

3\. Save → return to detail → still shows correctly



────────────────────────────────────────

BUG-003 — Brew Tab Photo Button Non-Functional

────────────────────────────────────────

Symptom: "Tap to add photo" button does nothing on iPhone.



Audit: Search for type="file" and FileReader in Brew Setup component.

&#x20;      If both exist and a thumbnail renders after selection, skip and note it.



Fix (implement all parts):

&#x20; 1. Replace non-functional button/div with:

&#x20;    <label htmlFor="brew-photo-input"> (styled to match existing button appearance)

&#x20;    

&#x20; 2. Hidden input immediately after the label:

&#x20;    <input

&#x20;      id="brew-photo-input"

&#x20;      type="file"

&#x20;      accept="image/jpeg,image/png,image/webp,image/heic"

&#x20;      capture="environment"

&#x20;      style={{ display: 'none' }}

&#x20;      onChange={handlePhotoSelect}

&#x20;    />



&#x20; 3. handlePhotoSelect function:

&#x20;    - Check file type: reject anything not in \[image/jpeg, image/png, image/webp, image/heic]

&#x20;    - Check file size: reject files over 5MB (5 \* 1024 \* 1024 bytes)

&#x20;    - On rejection: show user-facing error message (inline text or toast)

&#x20;    - On acceptance: read as base64 using FileReader

&#x20;    - Store base64 string in brew session state (IndexedDB/local only — NOT Supabase)

&#x20;    

&#x20; 4. After selection: render thumbnail preview below the button

&#x20; 

&#x20; 5. Add X button on thumbnail to clear the photo



&#x20; 6. Add comment: // SECURITY: file type/size validated. Base64 in IndexedDB only, never Supabase.



Test steps:

1\. Brew tab → photo button → tap on iPhone → camera/photo library opens

2\. Select photo → thumbnail appears below button

3\. Select file > 5MB → error message appears, no thumbnail

4\. Tap X on thumbnail → photo clears



────────────────────────────────────────

BUG-004 — Fruity Sub-Categories Single Selection Only

────────────────────────────────────────

Symptom: In Brew tasting Step 3, only one Fruity sub-category (Berry, Citrus, etc.)

&#x20;        can be expanded at a time. A coffee can have both Berry and Citrus notes.



Audit: Find expandedFruitType state. Check if it's a string or array.

&#x20;      If already an array with multi-expand working, skip and note it.



Fix:

&#x20; // FROM:

&#x20; const \[expandedFruitType, setExpandedFruitType] = useState("");

&#x20; // Toggler: setExpandedFruitType(type === expandedFruitType ? "" : type)

&#x20; // Render condition: expandedFruitType === type



&#x20; // TO:

&#x20; const \[expandedFruitType, setExpandedFruitType] = useState(\[]);

&#x20; // Toggler: setExpandedFruitType(prev =>

&#x20; //   prev.includes(type) ? prev.filter(t => t !== type) : \[...prev, type]

&#x20; // )

&#x20; // Render condition: expandedFruitType.includes(type)



&#x20; Adapt exact variable names to match what's in the codebase — pattern above is the logic to apply.



Test steps:

1\. Brew tasting Step 3 → expand Fruity → tap Berry → Berry descriptors show

2\. Tap Citrus WITHOUT closing Berry → BOTH Berry and Citrus descriptors visible simultaneously

3\. Select descriptors from both → both selectable



────────────────────────────────────────

BUG-005 — Profile Builder Steps Append to Top

────────────────────────────────────────

Symptom: New steps appear at top of the list. Should appear at bottom (chronological order).



Audit: Find addStep function in Profile Builder (the full-width amber card on Roast tab).

&#x20;      Check if new step appears at bottom. If yes, skip and note it.



Fix: In addStep, change array construction from prepend to append:

&#x20; // FROM: setSteps(\[newStep, ...steps]) or setSteps(prev => \[newStep, ...prev])

&#x20; // TO:   setSteps(\[...steps, newStep]) or setSteps(prev => \[...prev, newStep])



Test steps:

1\. Profile Builder → add Step 1 (0:00) → add Step 2 (4:00) → add Step 3 (8:00)

2\. Steps appear in order: 0:00 at top, 8:00 at bottom



────────────────────────────────────────

BUG-006 — Profile Builder Heat/Fan Accept Values Over 9

────────────────────────────────────────

Symptom: Heat and Fan inputs accept numbers > 9. SR540 dial only goes 1–9.



Audit: Find Heat/Fan inputs in Profile Builder step rows. Check for max="9" AND onChange clamping.

&#x20;      If both are present and working, skip and note it.



Fix — two parts, both required:



&#x20; Part 1: HTML attributes on both Heat and Fan inputs:

&#x20;   min="1" max="9"



&#x20; Part 2: onChange clamping (HTML max alone fails on mobile keyboards):

&#x20;   const clampDial = (val) => Math.min(9, Math.max(1, parseInt(val) || 1));

&#x20;   onChange={(e) => updateStep(index, 'heat', clampDial(e.target.value))}

&#x20;   onChange={(e) => updateStep(index, 'fan', clampDial(e.target.value))}

&#x20;   

&#x20;   Adapt function/handler names to match what's actually in the component.



Test steps:

1\. Profile Builder → add step → type 10 in Heat → snaps to 9

2\. Type 0 → snaps to 1

3\. Type -5 → snaps to 1

4\. Repeat for Fan



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\## WORK QUEUE — PRIORITY 2: FEATURES

\## Only begin after ALL 5 bugs above are confirmed complete.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



────────────────────────────────────────

IDEA-005 — Brew Tab: Custom Ratio Free Text Field

────────────────────────────────────────

Audit: Find Ratio dropdown in Brew Setup. Check if conditional text input shows on "Custom". Skip if done.



Fix:

&#x20; - When brewRatio === "Custom", render a text input below/after the dropdown

&#x20; - Placeholder: "e.g. 1:14.5"

&#x20; - Add customRatio state variable

&#x20; - Include customRatio in saved brew session object

&#x20; - Selecting a non-Custom option hides the text input



Test: Brew tab → select Custom → text field appears → type ratio → save → data persists



────────────────────────────────────────

IDEA-006 — Beans Tab: "Log a Session" Button

────────────────────────────────────────

Audit: Find Bean Detail view. Check if "Log a Session" button exists that pre-fills Roast tab. Skip if done.



Files involved: Bean Detail component + wherever activeTab state lives (likely App.js) + Roast tab Session Header



Implementation:

&#x20; 1. Add "Log a Session" button in Bean Detail view, in or near the Roast Sessions section

&#x20;    Style: amber, full-width or prominent, consistent with primary action buttons

&#x20;    

&#x20; 2. Lift prefillBean state to App.js (or wherever activeTab lives):

&#x20;    const \[prefillBean, setPrefillBean] = useState(null);

&#x20;    

&#x20; 3. On button tap in Bean Detail:

&#x20;    setPrefillBean({ name: bean.name, origin: bean.origin });

&#x20;    setActiveTab("roast"); // match actual tab key used in app

&#x20;    

&#x20; 4. In Roast tab Session Header, use useEffect to apply prefill:

&#x20;    useEffect(() => {

&#x20;      if (prefillBean) {

&#x20;        setBeanName(prefillBean.name);

&#x20;        // set origin if that field exists in Session Header

&#x20;        setPrefillBean(null); // clear after applying

&#x20;      }

&#x20;    }, \[prefillBean]);

&#x20;    

&#x20; DO NOT use localStorage for this cross-component communication.

&#x20; Adapt state variable names to match what actually exists in the app.



Test:

1\. Beans tab → tap any bean → find "Log a Session" button

2\. Tap it → navigates to Roast tab → bean name pre-filled in Session Header



────────────────────────────────────────

IDEA-009 — Settings: Units of Measure

────────────────────────────────────────

Audit: Search for roastlogs\_temp\_unit or useUnits hook. Skip if present.



Implementation:



&#x20; Step 1 — Settings UI:

&#x20;   Add "Units" section with two toggle rows:

&#x20;   - Temperature: \[°F] \[°C]  (default °F, stored as 'F' or 'C')

&#x20;   - Weight:      \[g]  \[oz]  (default g, stored as 'g' or 'oz')

&#x20;   Persist each: localStorage.setItem('roastlogs\_temp\_unit', 'F')

&#x20;                 localStorage.setItem('roastlogs\_weight\_unit', 'g')



&#x20; Step 2 — Create src/hooks/useUnits.js:

&#x20;   export function useUnits() {

&#x20;     const tempUnit = localStorage.getItem('roastlogs\_temp\_unit') || 'F';

&#x20;     const weightUnit = localStorage.getItem('roastlogs\_weight\_unit') || 'g';

&#x20;     

&#x20;     const toDisplayTemp = (celsius) => {

&#x20;       if (!celsius \&\& celsius !== 0) return '—';

&#x20;       if (tempUnit === 'F') return Math.round(celsius \* 9/5 + 32) + '°F';

&#x20;       return celsius + '°C';

&#x20;     };

&#x20;     

&#x20;     const toDisplayWeight = (grams) => {

&#x20;       if (!grams \&\& grams !== 0) return '—';

&#x20;       if (weightUnit === 'oz') return (grams / 28.3495).toFixed(1) + ' oz';

&#x20;       return grams + 'g';

&#x20;     };

&#x20;     

&#x20;     return { tempUnit, weightUnit, toDisplayTemp, toDisplayWeight };

&#x20;   }



&#x20; Step 3 — Apply at display layer only (NEVER change stored values):

&#x20;   Import useUnits() in History detail view and live roast screen

&#x20;   Wrap temperature displays with toDisplayTemp()

&#x20;   Wrap weight displays with toDisplayWeight()

&#x20;   Add: // TODO: Casey review — verify all temp/weight display locations covered



Test: Settings → switch to °C → open roast in History → temps show in °C → switch back → °F returns



────────────────────────────────────────

IDEA-004 — Profile vs. Actual Deviations

────────────────────────────────────────

Audit: Check RoastDetailChart and roast detail view for deviation markers or text section. Skip if done.



Context: When a session has a profile attached, compare logged Heat/Fan values against profile targets.

Deviation = logged value differs from profile target at that time window by more than ±1 step.



Part 1 — Chart markers (in RoastDetailChart):

&#x20; - Compute deviation points after chart data is built

&#x20; - Add Recharts <ReferenceDot> or <ReferenceLine> at each deviation timestamp

&#x20; - Color: red or orange, distinct from normal data lines

&#x20; - Add legend entry: "⚠ Profile deviation"

&#x20; - Only render if session.profileId (or equivalent) is set



Part 2 — Text section below chart:

&#x20; - Add "Profile Deviations" section below chart in roast detail view

&#x20; - Show only if profile was attached to the session

&#x20; - No deviations: render "✓ Followed profile exactly" in green

&#x20; - With deviations: render list, one row per deviation:

&#x20;     \[MM:SS] Heat: logged X, profile called for Y (difference: +Z)

&#x20;     \[MM:SS] Fan: logged X, profile called for Y (difference: -Z)

&#x20; - Subtle amber/yellow styling for deviation rows



Test:

1\. Open roast with profile + manual adjustments → chart has colored deviation markers

2\. Below chart: deviations listed with timestamps and values

3\. Open roast that followed profile exactly → "✓ Followed profile exactly"

4\. Open roast with no profile → deviations section hidden entirely



────────────────────────────────────────

IDEA-007 — Settings: Export Data

────────────────────────────────────────

Audit: Find Export Data in Settings. Check if CSV/JSON download logic exists. Skip if done.



UI: Export Data button opens choice panel (inline expand or modal):

&#x20; - "Export Roast Log (CSV)"

&#x20; - "Export Full Backup (JSON)"



CSV columns (in this order):

&#x20; Date, Bean Name, Origin, Green Weight (g), Roasted Weight (g), Weight Loss %,

&#x20; Target Roast Level, Visual Color, Rating (1-5), Brew Again (Yes/No/Maybe), Session Notes



JSON structure:

&#x20; {

&#x20;   "exportDate": "ISO string",

&#x20;   "appVersion": "1.0.0",

&#x20;   "roastSessions": \[...sessions with nested adjustmentLog and tastingNotes],

&#x20;   "beans": \[...all beans],

&#x20;   "roastProfiles": \[...all profiles],

&#x20;   "brewSessions": \[...all brew sessions]

&#x20; }



Data source: Pull from Supabase. If a session exists in IndexedDB but not Supabase, include it.

Deduplicate by ID. Merge both sources.



Download trigger (no server needed):

&#x20; const downloadFile = (content, filename, mimeType) => {

&#x20;   const blob = new Blob(\[content], { type: mimeType });

&#x20;   const url = URL.createObjectURL(blob);

&#x20;   const a = document.createElement('a');

&#x20;   a.href = url;

&#x20;   a.download = filename;

&#x20;   a.click();

&#x20;   URL.revokeObjectURL(url);

&#x20; };

&#x20; Filename format: roastlogs-export-YYYY-MM-DD.csv / roastlogs-backup-YYYY-MM-DD.json



UX: loading spinner while fetching, success toast after download, error message on failure.



Test:

1\. Settings → Export Data → two options appear

2\. CSV exports → file downloads → opens correctly in Numbers/Excel

3\. JSON exports → valid JSON with correct structure



────────────────────────────────────────

IDEA-010 — Settings: About Screen

────────────────────────────────────────

Audit: Find About button in Settings. Check if it opens anything. Skip if implemented.



Implementation: About opens a modal (or bottom sheet) with:



&#x20; ☕ RoastLogs             ← amber, large

&#x20; v1.0.0                   ← read from package.json (import or process.env.npm\_package\_version)

&#x20; 

&#x20; "Built for the Fresh Roast SR540 + Extension Tube"

&#x20; 

&#x20; ─────────────────────

&#x20; 

&#x20; Features:

&#x20; • Live roast session logging with phase milestone buttons

&#x20; • Full roast history with heat/fan/temp charts

&#x20; • Green bean inventory with auto-deduction

&#x20; • Brew \& tasting session notes

&#x20; • AI-powered roast profile generation (Forge)

&#x20; 

&#x20; ─────────────────────

&#x20; 

&#x20; Built for home roasters, by a home roaster. ☕

&#x20; 

&#x20; \[X close — top right]



Design: Dark mode, amber accents, no external links (pre-launch).



Version: In package.json "version" is already "1.0.0". Access it by importing package.json:

&#x20; import { version } from '../package.json'; // adjust path to actual package.json location

&#x20; OR: const version = process.env.REACT\_APP\_VERSION; // if set in .env



Test: Settings → About → modal opens → shows name, version, feature list → X closes it



────────────────────────────────────────

IDEA-008 — Settings: Light Mode Toggle

────────────────────────────────────────

Audit: Search for roastlogs\_theme, lightMode.css, data-theme. Skip if both toggle + CSS exist.

&#x20;      If CSS exists but no toggle (or vice versa), complete the missing half.



Settings toggle:

&#x20; - "Light Mode" row in Settings, on/off toggle (default off = dark)

&#x20; - On change: localStorage.setItem('roastlogs\_theme', 'light' or 'dark')

&#x20; - Immediately apply: document.documentElement.setAttribute('data-theme', value)



App startup (in App.js or index.js, runs on mount):

&#x20; const savedTheme = localStorage.getItem('roastlogs\_theme') || 'dark';

&#x20; document.documentElement.setAttribute('data-theme', savedTheme);



Create src/lightMode.css (import in App.js):

&#x20; /\* RoastLogs Light Mode — warm parchment/kraft-paper aesthetic            \*/

&#x20; /\* TODO: Casey review — adjust these hex values to taste before launch     \*/



&#x20; \[data-theme="light"] {

&#x20;   --bg-primary:    #fdf6e3;   /\* warm cream \*/

&#x20;   --bg-surface:    #f5e6c8;   /\* light kraft paper \*/

&#x20;   --bg-card:       #ede0c4;   /\* card background \*/

&#x20;   --text-primary:  #2c1a0e;   /\* dark espresso \*/

&#x20;   --text-secondary:#5c3d2e;   /\* medium roast brown \*/

&#x20;   --text-muted:    #8b6347;   /\* light roast tan \*/

&#x20;   --border-color:  #d4a96a;   /\* warm tan \*/

&#x20; }

&#x20; /\* Amber accents: UNCHANGED — same as dark mode \*/



&#x20; /\* Override Tailwind zinc classes in light mode \*/

&#x20; \[data-theme="light"] .bg-zinc-900  { background-color: var(--bg-primary)    !important; }

&#x20; \[data-theme="light"] .bg-zinc-800  { background-color: var(--bg-surface)    !important; }

&#x20; \[data-theme="light"] .bg-zinc-700  { background-color: var(--bg-card)       !important; }

&#x20; \[data-theme="light"] .text-white   { color: var(--text-primary)             !important; }

&#x20; \[data-theme="light"] .text-zinc-400{ color: var(--text-muted)               !important; }

&#x20; \[data-theme="light"] .text-zinc-300{ color: var(--text-secondary)           !important; }

&#x20; \[data-theme="light"] .border-zinc-700 { border-color: var(--border-color)   !important; }

&#x20; \[data-theme="light"] .border-zinc-600 { border-color: var(--border-color)   !important; }



Test:

1\. Settings → Light Mode ON → background shifts to warm cream

2\. Amber buttons/highlights unchanged

3\. Text readable (dark on cream)

4\. Toggle OFF → dark mode returns

5\. Refresh → theme persists



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\## WORK QUEUE — PRIORITY 3: FORGE TAB (Major Feature)

\## Only begin after ALL bugs AND all IDEA items above are complete.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



Audit: Search for ForgeTab component, a 5th nav tab, or any Forge-related code.

&#x20;      If Forge already exists in any form, complete/fix rather than rewrite.



Files to create:

&#x20; src/components/ForgeTab.jsx  (or ForgeTab.js — match convention of existing components)



Files to modify:

&#x20; Bottom nav component — add Forge as 5th tab

&#x20; App.js — add case for forge tab to render ForgeTab



Nav final order: Roast · History · Brew · Beans · Forge

Icon: flame — use 🔥 emoji or SVG flame matching existing nav icon style/library



────────────────────────────────────────

FORGE — Input Form

────────────────────────────────────────

Heading: "⚗ Forge a Roast Profile"

Subheading: "Powered by Claude AI · Built for the SR540 + Extension Tube"

(Make this feel exciting — it is the premium feature of the app)



Fields:

&#x20; Bean Name\*            text, required, placeholder: "e.g. Ethiopia Yirgacheffe"

&#x20; Origin / Country\*     text, required, placeholder: "e.g. Ethiopia, Gedeb region"

&#x20; Grower / Farm         text, optional, placeholder: "e.g. Worka Cooperative"

&#x20; Processing Method\*    select: Washed | Natural | Honey | Wet-Hulled | Other

&#x20; Target Roast Level\*   select: Cinnamon | City | City+ | Full City | Full City+ | Vienna | French | Italian

&#x20; Importer Notes        textarea, 4 rows, optional

&#x20;                       placeholder: "Paste importer tasting notes or describe target flavors...

&#x20;                                     e.g. jasmine, bergamot, lemon zest, tea-like body"



Generate button: amber, full-width, flame icon, text "Generate My Profile"

&#x20; - Disabled + shows spinner while API call runs



────────────────────────────────────────

FORGE — Loading State

────────────────────────────────────────

While API runs, show animated loading card with cycling messages (rotate every 2 seconds):

&#x20; "Analyzing bean origin and processing method..."

&#x20; "Calculating SR540 heat curve with extension tube..."

&#x20; "Mapping roast phase development..."

&#x20; "Dialing in first crack timing..."

&#x20; "Finalizing your roast profile..."



────────────────────────────────────────

FORGE — Output Display

────────────────────────────────────────

After successful parse, show structured profile card:



&#x20; 🔥 \[profileName]

&#x20; \[beanName] · \[origin] · \[processingMethod]

&#x20; Target: \[targetRoastLevel]    Estimated time: \[estimatedTotalTime]



&#x20; PHASES TABLE

&#x20; Name | Start | End | Notes



&#x20; HEAT \& FAN TIMELINE TABLE

&#x20; Time | Heat | Fan | Note

&#x20; (one row per timeline entry from JSON)



&#x20; Expected First Crack: \[expectedFirstCrack]



&#x20; FLAVOR NOTES (amber tag chips for each item in flavorNotes array)



&#x20; ⚠ SR540 WARNINGS (if sr540Warnings array is non-empty)

&#x20; Show in yellow/orange callout box



&#x20; NOTES

&#x20; \[generalNotes paragraph]



&#x20; \[Save This Profile]   ← amber, full-width

&#x20; \[Generate Another]    ← zinc/secondary



────────────────────────────────────────

FORGE — Save Profile

────────────────────────────────────────

On "Save This Profile":

&#x20; Insert to Supabase roast\_profiles:

&#x20;   {

&#x20;     name: profile.profileName,

&#x20;     is\_ai\_generated: true,

&#x20;     bean\_name: profile.beanName,

&#x20;     origin: profile.origin,

&#x20;     processing\_method: profile.processingMethod,

&#x20;     target\_roast\_level: profile.targetRoastLevel,

&#x20;     steps: JSON.stringify(profile.timeline),

&#x20;     phases: JSON.stringify(profile.phases),

&#x20;     ai\_metadata: JSON.stringify({

&#x20;       flavorNotes: profile.flavorNotes,

&#x20;       sr540Warnings: profile.sr540Warnings,

&#x20;       generalNotes: profile.generalNotes,

&#x20;       estimatedTotalTime: profile.estimatedTotalTime,

&#x20;       expectedFirstCrack: profile.expectedFirstCrack

&#x20;     }),

&#x20;     created\_at: new Date().toISOString()

&#x20;   }

&#x20; 

&#x20; Strip any image/photo fields (should be none, but enforce the rule).

&#x20; Success toast: "Profile saved! Find it in Profile Builder."

&#x20; Error toast on Supabase failure.



AI Badge: Wherever roast\_profiles are listed in the app, if is\_ai\_generated === true,

&#x20; show an "AI ✦" badge in amber. If not already implemented, add it wherever profiles appear.



────────────────────────────────────────

FORGE — Claude API Call

────────────────────────────────────────



// SECURITY DEBT: API key is client-side. Move to Netlify/Vercel serverless proxy before public launch.

const CLAUDE\_API\_KEY = process.env.REACT\_APP\_CLAUDE\_API\_KEY;



const generateForgeProfile = async (formData) => {

&#x20; const userMessage = \[

&#x20;   `Bean Name: ${formData.beanName}`,

&#x20;   `Origin: ${formData.origin}`,

&#x20;   `Grower/Farm: ${formData.growerFarm || 'Not specified'}`,

&#x20;   `Processing Method: ${formData.processingMethod}`,

&#x20;   `Target Roast Level: ${formData.targetRoastLevel}`,

&#x20;   `Importer Tasting Notes: ${formData.importerNotes || 'None provided'}`,

&#x20;   '',

&#x20;   'Generate a complete roast profile for the Fresh Roast SR540 with extension tube.'

&#x20; ].join('\\n');



&#x20; const response = await fetch('https://api.anthropic.com/v1/messages', {

&#x20;   method: 'POST',

&#x20;   headers: {

&#x20;     'Content-Type': 'application/json',

&#x20;     'x-api-key': CLAUDE\_API\_KEY,

&#x20;     'anthropic-version': '2023-06-01'

&#x20;   },

&#x20;   body: JSON.stringify({

&#x20;     model: 'claude-sonnet-4-20250514',

&#x20;     max\_tokens: 2000,

&#x20;     system: FORGE\_SYSTEM\_PROMPT,

&#x20;     messages: \[{ role: 'user', content: userMessage }]

&#x20;   })

&#x20; });



&#x20; if (!response.ok) {

&#x20;   const status = response.status;

&#x20;   if (status === 401) throw new Error('AUTH\_FAILED');

&#x20;   if (status === 429) throw new Error('RATE\_LIMITED');

&#x20;   throw new Error(`API\_ERROR\_${status}`);

&#x20; }



&#x20; const data = await response.json();

&#x20; const rawText = data.content\[0].text;

&#x20; const clean = rawText.replace(/```json|```/g, '').trim();

&#x20; return JSON.parse(clean);

};



// Error handling:

// 'AUTH\_FAILED'  → toast: "API authentication failed. Check REACT\_APP\_CLAUDE\_API\_KEY in .env"

// 'RATE\_LIMITED' → toast: "Rate limit reached. Wait a moment and try again."

// JSON parse err → toast: "Received unexpected response format. Try again."

// Network err    → toast: "Network error. Check your connection and try again."

// Missing key    → if (!CLAUDE\_API\_KEY) show: "Forge API key not configured. Add REACT\_APP\_CLAUDE\_API\_KEY to .env"



────────────────────────────────────────

FORGE — System Prompt Constant

────────────────────────────────────────



Define at top of ForgeTab component file:



const FORGE\_SYSTEM\_PROMPT = `You are an expert coffee roasting consultant with deep knowledge of the Fresh Roast SR540 air roaster with the extension tube attachment. The extension tube significantly changes roast dynamics: it slows the roast, improves airflow distribution, allows for more nuanced heat control, and generally produces more even development.



When generating a roast profile, you must:

1\. Account for the extension tube effect — temps run \~10-15°C lower than stock SR540

2\. Use the SR540 1-9 dial range for both Heat and Fan settings

3\. Provide specific settings at 30-second or 1-minute intervals throughout the roast

4\. Include clear phase markers: Drying Phase, Maillard Phase, First Crack, Development, Cooling

5\. Warn if any setting risks scorching or uneven roast with the extension tube

6\. Tailor advice to the bean's origin and processing method



SR540 Heat Reference (with extension tube):

\- Heat 1-2: \~140-185°C | Heat 3-4: \~185-210°C | Heat 5-6: \~210-230°C

\- Heat 7-8: \~230-255°C | Heat 9: \~255-265°C



Return ONLY this JSON object, no preamble, no markdown fences:

{

&#x20; "profileName": "string",

&#x20; "beanName": "string",

&#x20; "origin": "string",

&#x20; "processingMethod": "string",

&#x20; "targetRoastLevel": "string",

&#x20; "estimatedTotalTime": "string",

&#x20; "phases": \[{"name":"string","startTime":"string","endTime":"string","notes":"string"}],

&#x20; "timeline": \[{"time":"string","heat":number,"fan":number,"note":"string"}],

&#x20; "expectedFirstCrack": "string",

&#x20; "flavorNotes": \["string"],

&#x20; "sr540Warnings": \["string"],

&#x20; "generalNotes": "string"

}`;



────────────────────────────────────────

FORGE — Test Steps

────────────────────────────────────────

1\. Open Forge tab → input form visible with all fields

2\. Fill required fields → tap "Generate My Profile" → loading animation with cycling messages

3\. After \~5-15 seconds → profile renders: phases table, heat/fan timeline, flavor tags, notes

4\. If sr540Warnings present → yellow/orange callout box shows

5\. Tap "Save This Profile" → success toast → navigate to Roast tab → Profile Builder shows saved profile with "AI ✦" badge

6\. Test missing API key: temporarily comment out REACT\_APP\_CLAUDE\_API\_KEY in .env → correct error message shown



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\## SESSION WRAP-UP — REQUIRED OUTPUT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



When you finish or reach a stopping point, create/overwrite SESSION\_NOTES.md in project root.

Use this exact structure:



\---

\# Session Notes — \[date]



\## ✅ Completed

\[Each item ID, one-line description of what was done, files modified]



\## ⏭ Skipped — Already Implemented

\[Each item: what you found in the codebase that confirmed it was done]



\## 🚧 Incomplete

\[What remains, and specifically why — blocked / ambiguous / out of scope / ran out of time]



\## ❓ Decisions Needed from Casey

\[Anything requiring his judgment — be specific, give options where possible]



\## 🧪 How to Test Each Change

\[Step-by-step test instructions for localhost:3000 for every completed item]



\## 🔀 Git Instructions for Casey

\[Exact commands for Casey to run to review, merge, or discard the session branch:

&#x20;- To review: git checkout session/YYYYMMDD-\* then npm start

&#x20;- To merge to develop: git checkout develop \&\& git merge session/YYYYMMDD-\*

&#x20;- To discard: git branch -D session/YYYYMMDD-\*]



\## 🔒 Security Notes

\[Any new security concerns introduced this session — must be explicit]

\---



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\## PRE-COMPLETION CHECKLIST (mental check before marking each item done)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



\[ ] Audited existing code before writing

\[ ] No ESLint/compile errors breaking npm start

\[ ] No console.error or console.warn introduced

\[ ] Supabase writes: photo/base64 stripped

\[ ] No dangerouslySetInnerHTML anywhere

\[ ] Dark mode intact at 375px viewport

\[ ] Amber accents preserved

\[ ] No hardcoded credentials

\[ ] Comment added to modified files

\[ ] SESSION\_NOTES.md updated



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\## APPENDIX — BRANCH STRATEGY REFERENCE

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



Branches:

&#x20; main              → production. GitHub Pages deploys from here. Never touch directly.

&#x20; develop           → integration. All reviewed work lands here before going to main.

&#x20; session/YYYYMMDD  → agent working branch. One per session. Deleted after merge.



Tags (recovery points, set before each session):

&#x20; snapshot-before-session-YYYYMMDD  → permanent named point on main Casey can always return to



How Casey promotes work to production:

&#x20; 1. Review SESSION\_NOTES.md

&#x20; 2. Run: npm start on session branch → test on localhost + iPhone

&#x20; 3. If good: git checkout develop \&\& git merge session/YYYYMMDD-\*

&#x20; 4. Final check on develop branch

&#x20; 5. If good: git checkout main \&\& git merge develop \&\& npm run deploy

&#x20; 6. Delete session branch: git branch -D session/YYYYMMDD-\*



How Casey rolls back if something breaks:

&#x20; Option A (revert develop): git checkout develop \&\& git revert HEAD

&#x20; Option B (nuke session branch): git branch -D session/YYYYMMDD-\* (before it's merged — zero impact)

&#x20; Option C (full rollback to snapshot): git checkout main \&\& git reset --hard snapshot-before-session-YYYYMMDD \&\& npm run deploy



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



When in doubt: be conservative, leave a TODO comment, and move on.

Casey reviews everything before anything reaches main or goes live.

