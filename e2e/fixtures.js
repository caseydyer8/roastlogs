// Deterministic fake roast used by the UI tests. Matches the real data
// contract: roastLog is NEWEST-FIRST, mixed entry types, string dial values,
// phase labels START / YELLOWING / FIRST CRACK / COOLING START.
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
    { type: "phase", t: 600, label: "COOLING START" },
    { type: "adjustment", t: 540, heat: "3", fan: "9", temp: "438" },
    { type: "phase", t: 480, label: "FIRST CRACK" },
    { type: "adjustment", t: 420, heat: "5", fan: "7", temp: "405" },
    { type: "phase", t: 300, label: "YELLOWING" },
    { type: "adjustment", t: 240, heat: "6", fan: "8", temp: "330" },
    { type: "adjustment", t: 120, heat: "7", fan: "8", temp: "250" },
    { type: "start_settings", t: 0, heat: "7", fan: "9", temp: "150", label: "START" },
  ],
};

module.exports = { fixtureRoast };
