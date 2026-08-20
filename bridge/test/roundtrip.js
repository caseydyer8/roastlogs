"use strict";
// Real round-trip against Supabase Realtime: the Publisher broadcasts a sample,
// an independent subscriber (simulating a RoastLogs screen) must receive it, and
// the Publisher's presence-based viewer count must reach 1. Broadcast only —
// no table is touched.
//
//   SUPABASE_URL=... SUPABASE_KEY=... node bridge/test/roundtrip.js
const { createClient } = require("@supabase/supabase-js");
const { Publisher } = require("../lib/publisher");

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
if (!URL || !KEY) { console.error("set SUPABASE_URL and SUPABASE_KEY"); process.exit(2); }

const CH = "roastlink-live-selftest";
let received = null;
let viewersSeen = 0;

const pub = new Publisher(URL, KEY, { channel: CH });
pub.on("status", (s) => console.log("  [pub status]", s));
pub.on("viewers", (n) => { viewersSeen = Math.max(viewersSeen, n); console.log("  [pub viewers]", n); });
pub.on("error", (e) => console.log("  [pub error]", e.message));

const sub = createClient(URL, KEY, { auth: { persistSession: false } });
const subCh = sub.channel(CH, { config: { presence: { key: "viewer-test" } } });
subCh.on("broadcast", { event: "sample" }, (msg) => {
  received = msg.payload;
  console.log("  [subscriber got]", JSON.stringify(msg.payload));
});

console.log("\n  Supabase Realtime round-trip on channel:", CH, "\n");

subCh.subscribe((status) => {
  if (status === "SUBSCRIBED") {
    subCh.track({ role: "viewer", at: Date.now() });
    pub.connect();
  }
});

pub.on("connected", () => {
  console.log("  [pub] joined; broadcasting a sample in 1s");
  setTimeout(() => pub.publish({ tDevice: 1234, bt: 401.7, et: null, at: 77, ah: 42 }), 1000);
});

setTimeout(async () => {
  console.log("\n  --------- result ---------");
  console.log("  broadcast received :", received ? "YES" : "NO");
  console.log("  viewer count seen  :", viewersSeen);
  const ok = received && received.bt === 401.7 && viewersSeen >= 1;
  console.log("  RESULT             :", ok ? "OK - cloud hop works end to end" : "FAILED");
  try { await pub.disconnect(); await sub.removeChannel(subCh); } catch (_) {}
  process.exit(ok ? 0 : 1);
}, 7000);
