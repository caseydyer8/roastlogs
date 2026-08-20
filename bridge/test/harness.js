"use strict";
// Headless exercise of RoastLinkClient against a device (real or the mock).
//   node bridge/test/harness.js [host] [seconds]
const { RoastLinkClient } = require("../lib/roastlink");

const host = process.argv[2] || "127.0.0.1";
const secs = Number(process.argv[3] || 8);

const c = new RoastLinkClient(host);
let samples = 0;
let health = 0;
let firstT = null;
let lastT = null;

c.on("state", (s) => console.log("  [state]  ", s));
c.on("open", () => console.log("  [open]   connected; sent mirror_enabled:0 + hello_ui"));
c.on("sample", (s) => {
  samples += 1;
  if (firstT === null) firstT = s.tDevice;
  lastT = s.tDevice;
  if (samples <= 5 || samples % 5 === 0) console.log("  [sample] ", JSON.stringify(s));
});
c.on("health", (h) => { health += 1; if (health === 1) console.log("  [health] ", JSON.stringify(h)); });
c.on("event", (e) => console.log("  [event]  ", JSON.stringify(e)));
c.on("error", (e) => console.log("  [error]  ", e.message));

console.log(`\n  RoastLink client harness -> ${c.url} for ${secs}s\n`);
c.start();

setTimeout(() => {
  const span = firstT !== null && lastT !== null ? lastT - firstT : 0;
  console.log("\n  --------- result ---------");
  console.log("  samples        ", samples);
  console.log("  health frames  ", health);
  console.log("  device t       ", firstT, "->", lastT, "(uptime seconds)");
  console.log("  final state    ", c.state);
  console.log("  RESULT         ", samples > 0 ? "OK - client reads telemetry" : "NO TELEMETRY");
  c.stop();
  process.exit(samples > 0 ? 0 : 1);
}, secs * 1000);
