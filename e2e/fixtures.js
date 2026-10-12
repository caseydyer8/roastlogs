// Deterministic fake SAVED roast used by the UI tests. Matches the real data
// contract for saved roasts: mixed entry types, string dial values, phase labels
// START / YELLOWING / FIRST CRACK / COOLING START — and OLDEST-FIRST order.
// (Only the LIVE roastLog is newest-first; handleStop reverses it before saving,
// so anything read back from localStorage/Supabase is chronological.)
const fixtureRoast = {
  id: 1750000000000,
  date: "2026-07-01",
  beanName: "E2E Ethiopia Test",
  // Free-text roast shape: no inventory link. Roasts saved from the v3.9.0
  // Setup screen carry the picked bean's numeric id here instead; roasts from
  // before it don't have the key at all. Both must keep working.
  beanId: null,
  greenWeight: "226",
  roastedWeight: "190",
  targetLevel: "City+ Medium",
  duration: "11:00",
  totalSeconds: 660,
  devSeconds: 120,
  startingSettings: { heat: "7", fan: "9", temp: "150" },
  profile: null,
  roastLog: [
    { type: "start_settings", t: 0, heat: "7", fan: "9", temp: "150", label: "START" },
    { type: "adjustment", t: 120, heat: "7", fan: "8", temp: "250" },
    { type: "adjustment", t: 240, heat: "6", fan: "8", temp: "330" },
    { type: "phase", t: 300, label: "YELLOWING" },
    { type: "adjustment", t: 420, heat: "5", fan: "7", temp: "405" },
    { type: "phase", t: 480, label: "FIRST CRACK" },
    { type: "adjustment", t: 540, heat: "3", fan: "9", temp: "438" },
    { type: "phase", t: 600, label: "COOLING START" },
  ],
};

// Deterministic fake tasting note matching the real handleSaveBrew contract.
// rating is a HALF-STAR value (numeric, 0.5 steps) as of the 2026-07-17 update.
const fixtureTasting = {
  id: 1750000000001,
  date: "2026-07-02",
  roastId: "1750000000000",
  beanName: "E2E Ethiopia Test",
  method: "Pour Over",
  device: "V60",
  ratio: "1:16",
  grindSize: "Medium",
  temp: "205",
  acidity: 3,
  body: 3,
  families: ["chocolatey"],
  descriptors: ["Dark Chocolate", "Cocoa"],
  rating: 3.5,
  brewAgain: "Yes",
  notes: "Deterministic e2e tasting fixture.",
};

// Deterministic inventory bean + profile for the Roast Setup tests. Matches the
// saved shapes: beans carry a Date.now() id, purchaseWeight as a string and a
// weightAdjustments array; a profile step's time is "mm:ss" beside totalSeconds.
const fixtureBean = {
  id: 1750000000100,
  name: "E2E Setup Bean",
  origin: "Ethiopia",
  purchaseWeight: "1000",
  weightAdjustments: [],
};

const fixtureProfile = {
  id: 1750000000200,
  name: "E2E Profile",
  beanName: "",
  isDefault: false,
  steps: [
    { time: "00:00", totalSeconds: 0, fan: "4", heat: "7" },
    { time: "04:00", totalSeconds: 240, fan: "6", heat: "6" },
  ],
};

// A roast IN PROGRESS, as App.js keeps it under live_* keys while the roaster is
// running -- the state iOS leaves behind when it reclaims a backgrounded PWA.
// Unlike fixtureRoast above (a SAVED roast, oldest-first), the live roastLog is
// NEWEST-FIRST and its opening row is the one startRoast() writes: type
// "start_settings", t 0, label "Start" (mixed case; the saved-roast fixture's
// "START" is the display label). handleStop reverses it on save. Dial values
// are strings and temp may be empty. elapsedSeconds is persisted as a bare
// number string; 130s is deliberately mid-roast, before the profile's 4:00 step.
const fixtureLiveRoast = {
  elapsedSeconds: 130,
  roastLog: [
    { type: "start_settings", t: 0, heat: "7", fan: "4", temp: "", label: "Start" },
  ],
};

// A roast that exists ONLY in the cloud, as the `roasts` table returns it: the
// raw snake_case ROW, before fetchRoastsFromSupabase (syncService.js) maps it
// into the app shape. Keep the column names in step with that mapping. It has a
// full 1 Hz bean-temp curve (the live-roast "ghost" is drawn from `curve`), a
// saved roastLog (oldest-first, like every saved roast) and an `equipment`
// object, which a roast saved on the Razzo carries. The e2e cloud mock serves
// it to the launch sync AFTER the app has mounted -- a source roast recorded on
// another device (RL-038).
const fixtureGhostCurve = Array.from({ length: 661 }, (_, t) => ({ t, bt: 200 + Math.round(t / 4) }));

const fixtureGhostSourceRow = {
  id: 1749000000000,
  date: "2026-06-01",
  bean_name: "E2E Ghost Source",
  green_weight: "226",
  roasted_weight: "190",
  target_level: "City+ Medium",
  duration: "11:00",
  total_seconds: 660,
  dev_seconds: 120,
  starting_settings: { heat: "7", fan: "4", temp: "" },
  roast_log: [
    { type: "start_settings", t: 0, heat: "7", fan: "4", temp: "", label: "START" },
    { type: "adjustment", t: 240, heat: "6", fan: "6", temp: "" },
    { type: "phase", t: 300, label: "YELLOWING" },
    { type: "phase", t: 480, label: "FIRST CRACK" },
    { type: "phase", t: 600, label: "COOLING START" },
  ],
  profile: null,
  curve: fixtureGhostCurve,
  equipment: { setup: "razzo-v5t", probe: "k-type" },
  bean_id: null,
};

// A profile saved FROM that roast: the same steps/milestones/sourceRoastId
// planFromRoast() writes. The profile carries only the source roast's id --
// never its curve -- so the ghost exists only while the roast itself is on this
// device. Same id and name as fixtureProfile, so the "Active Profile: E2E
// Profile" badge assertions apply to it unchanged.
const fixtureGhostProfile = {
  ...fixtureProfile,
  sourceRoastId: fixtureGhostSourceRow.id,
  milestones: [
    { label: "YELLOWING", t: 300, temp: 275 },
    { label: "FIRST CRACK", t: 480, temp: 320 },
    { label: "COOLING START", t: 600, temp: 350 },
  ],
};

module.exports = {
  fixtureRoast, fixtureTasting, fixtureBean, fixtureProfile, fixtureLiveRoast,
  fixtureGhostSourceRow, fixtureGhostProfile,
};
