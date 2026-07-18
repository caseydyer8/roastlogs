// Deterministic fake SAVED roast used by the UI tests. Matches the real data
// contract for saved roasts: mixed entry types, string dial values, phase labels
// START / YELLOWING / FIRST CRACK / COOLING START — and OLDEST-FIRST order.
// (Only the LIVE roastLog is newest-first; handleStop reverses it before saving,
// so anything read back from localStorage/Supabase is chronological.)
const fixtureRoast = {
  id: 1750000000000,
  date: "2026-07-01",
  beanName: "E2E Ethiopia Test",
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

module.exports = { fixtureRoast, fixtureTasting };
