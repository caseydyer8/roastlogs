"use strict";

// Headless bridge runner — connects to a RoastLink and publishes live samples to
// Supabase Realtime so RoastLogs (Mac + phone) can watch. This is the bridge core
// without the Electron GUI; the GUI comes later and wraps this same lib.
//
//   SUPABASE_URL=... SUPABASE_KEY=... node bridge/run.js <device-ip-or-host>
//
// Host defaults to roastlink.local. Ctrl-C to stop.

const { Bridge } = require("./lib/bridge");

const host = process.argv[2] || process.env.ROASTLINK_HOST || "roastlink.local";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_KEY environment variables.");
  process.exit(2);
}

console.log(`\n  RoastLogs bridge`);
console.log(`  device : ${host}`);
console.log(`  cloud  : ${url}`);
console.log(`  (Ctrl-C to stop)\n`);

const bridge = new Bridge({ host, supabaseUrl: url, supabaseKey: key });
let count = 0;

bridge.on("lamps", (l) =>
  console.log(`  lamps   device:${l.device}   cloud:${l.cloud}   viewers:${l.viewers}`)
);
bridge.on("sample", (s) => {
  count += 1;
  if (count % 10 === 1) console.log(`  bt ${s.bt}°F   (device t=${s.tDevice})`);
});
bridge.on("health", (h) => {
  if (h.btValid === false) console.log("  ! bean probe reports fault");
});
bridge.on("error", (e) => console.log(`  ! ${e.source}: ${e.error.message}`));

bridge.start();

process.on("SIGINT", async () => {
  console.log("\n  stopping...");
  try { await bridge.stop(); } catch (_) {}
  process.exit(0);
});
