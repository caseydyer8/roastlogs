"use strict";
// Full data-path proof: mock RoastLink -> Bridge -> Supabase Realtime -> viewer.
//   SUPABASE_URL=... SUPABASE_KEY=... node bridge/test/e2e.js
const { createClient } = require("@supabase/supabase-js");
const { Bridge } = require("../lib/bridge");

const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_KEY;
if (!URL || !KEY) { console.error("set SUPABASE_URL and SUPABASE_KEY"); process.exit(2); }
const CH = "roastlink-live-e2e";

let receivedByViewer = 0;
let lastBt = null;
let finalLamps = null;

const viewer = createClient(URL, KEY, { auth: { persistSession: false } });
const vch = viewer.channel(CH, { config: { presence: { key: "viewer-e2e" } } });
vch.on("broadcast", { event: "sample" }, (m) => { receivedByViewer += 1; lastBt = m.payload.bt; });

const bridge = new Bridge({ host: "127.0.0.1", supabaseUrl: URL, supabaseKey: KEY, channel: CH });
bridge.on("lamps", (l) => { finalLamps = l; console.log("  [lamps]", JSON.stringify(l)); });
bridge.on("error", (e) => console.log("  [error]", e.source, e.error.message));

console.log("\n  End-to-end: mock device -> Bridge -> Supabase -> viewer\n");

vch.subscribe((status) => {
  if (status === "SUBSCRIBED") { vch.track({ role: "viewer", at: Date.now() }); bridge.start(); }
});

setTimeout(async () => {
  console.log("\n  --------- result ---------");
  console.log("  samples viewer received :", receivedByViewer, "(last bt:", lastBt, ")");
  console.log("  final lamps             :", JSON.stringify(finalLamps));
  const ok = receivedByViewer >= 3 &&
             finalLamps && finalLamps.device === "live" &&
             finalLamps.cloud === "joined" && finalLamps.viewers >= 1;
  console.log("  RESULT                  :", ok ? "OK - full pipe proven" : "FAILED");
  try { await bridge.stop(); await viewer.removeChannel(vch); } catch (_) {}
  process.exit(ok ? 0 : 1);
}, 9000);
