#!/usr/bin/env node
/**
 * roastlink-sniff — point it at a RoastLink and see exactly what it says.
 *
 * Read-only. Connects, subscribes to the telemetry stream, prints raw frames,
 * then reports what it found: field inventory, measured sample rate, whether
 * sensorHealth frames exist (which tells us the board variant's capability),
 * and whether ping/pong keepalive works.
 *
 * The one thing it writes is `mirror_enabled: 0`, which asks the firmware to
 * stop substituting one probe's value for the other. With a single probe that
 * substitution can invent an ET reading out of BT, so we turn it off before
 * trusting anything. It is a per-session setting, not a config change.
 *
 *   node tools/roastlink-sniff.js                    # roastlink.local
 *   node tools/roastlink-sniff.js 192.168.1.42       # explicit IP
 *   node tools/roastlink-sniff.js roastlink.local 60 # watch for 60s
 *
 * Needs Node 22+ (built-in WebSocket). Falls back to the `ws` package if present.
 */

const host = process.argv[2] || "roastlink.local";
const seconds = Number(process.argv[3] || 30);
const url = `ws://${host}:81/`;

// Node 22+ exposes WebSocket globally, so this normally runs with zero installs.
let WS = globalThis.WebSocket;
if (!WS) {
  try {
    WS = require("ws");
  } catch {
    console.error(
      "No WebSocket available.\n" +
        "Use Node 22+ (`node --version`), or run `npm i ws` in this folder."
    );
    process.exit(1);
  }
}

const state = {
  frames: 0,
  telemetry: 0,
  firstAt: null,
  lastAt: null,
  fields: new Set(),
  frameTypes: new Set(),
  sensorHealth: null,
  pong: false,
  deviceT: { first: null, last: null },
  bt: { min: Infinity, max: -Infinity },
  samples: [],
  raw: [],
};

console.log(`\n  RoastLink sniffer`);
console.log(`  connecting to ${url}`);
console.log(`  watching for ${seconds}s — Ctrl-C to stop early\n`);

const ws = new WS(url);
let timer = null;

ws.onopen = () => {
  console.log("  [open] connected\n");

  // Ask the firmware to stop substituting probes (see header note).
  send({ command: "mirror_enabled", data: 0 });

  // The handshake that turns this into a push stream.
  send("hello_ui");

  // Keepalive probe — a silent-death detector, and the basis for the status lamp.
  setTimeout(() => send("ping"), 1500);

  timer = setTimeout(finish, seconds * 1000);
};

function send(msg) {
  const payload = typeof msg === "string" ? msg : JSON.stringify(msg);
  console.log(`  -> ${payload}`);
  ws.send(payload);
}

ws.onmessage = (ev) => {
  const now = Date.now();
  const text = typeof ev.data === "string" ? ev.data : String(ev.data);

  state.frames++;
  if (!state.firstAt) state.firstAt = now;
  state.lastAt = now;

  // Show the first handful verbatim so the real shape is visible, not my summary.
  if (state.raw.length < 12) {
    state.raw.push(text);
    console.log(`  <- ${text}`);
  } else if (state.frames === 13) {
    console.log("  <- ... (further frames collected quietly)\n");
  }

  if (text.trim() === "pong") {
    state.pong = true;
    return;
  }

  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return; // non-JSON frame (banner, etc.)
  }

  if (msg.type) state.frameTypes.add(msg.type);
  if (msg.type === "sensorHealth") {
    state.sensorHealth = msg;
    return;
  }

  // Telemetry frames use lowercase names and carry a bean temp.
  if (typeof msg.bt === "number") {
    state.telemetry++;
    Object.keys(msg).forEach((k) => state.fields.add(k));
    state.bt.min = Math.min(state.bt.min, msg.bt);
    state.bt.max = Math.max(state.bt.max, msg.bt);
    state.samples.push({ at: now, t: msg.t, bt: msg.bt });
    if (typeof msg.t === "number") {
      if (state.deviceT.first === null) state.deviceT.first = msg.t;
      state.deviceT.last = msg.t;
    }
  }
};

ws.onerror = (err) => {
  console.error(`\n  [error] ${err?.message || err}`);
  console.error(
    "\n  Most common causes:\n" +
      "   - Device is in AP mode. If its IP is 192.168.4.1 it is serving its own\n" +
      "     hotspot. Finish WiFi setup so it joins your network (LED: amber single\n" +
      "     blink = STA/connected; breathing = AP).\n" +
      "   - roastlink.local not resolving — pass the IP from OLED Screen C instead.\n" +
      "   - Another client holds the connection. Close the device's web UI tabs;\n" +
      "     the manual warns to keep only one open at a time.\n"
  );
  process.exit(1);
};

ws.onclose = () => {
  if (timer) clearTimeout(timer);
  finish();
};

let done = false;
function finish() {
  if (done) return;
  done = true;
  if (timer) clearTimeout(timer);

  const span = state.lastAt && state.firstAt ? (state.lastAt - state.firstAt) / 1000 : 0;
  const rate = span > 0 ? state.telemetry / span : 0;

  console.log("\n  ─────────── what we learned ───────────\n");
  console.log(`  frames total        ${state.frames}`);
  console.log(`  telemetry frames    ${state.telemetry}`);
  console.log(
    `  measured rate       ${rate ? rate.toFixed(2) + " /sec" : "n/a"}` +
      (rate ? `  (manual claims 1.00)` : "")
  );
  console.log(
    `  fields seen         ${
      state.fields.size ? [...state.fields].sort().join(", ") : "none"
    }`
  );
  if (state.frameTypes.size) {
    console.log(`  frame types         ${[...state.frameTypes].sort().join(", ")}`);
  }
  console.log(`  ping/pong           ${state.pong ? "OK" : "no pong seen"}`);

  if (state.bt.min !== Infinity) {
    console.log(
      `  bean temp range     ${state.bt.min.toFixed(1)} - ${state.bt.max.toFixed(1)} F`
    );
  }

  if (state.deviceT.first !== null) {
    console.log(
      `  device clock 't'    ${state.deviceT.first} -> ${state.deviceT.last}` +
        `  (uptime seconds, NOT roast time)`
    );
  }

  console.log("");
  if (state.sensorHealth) {
    console.log("  sensorHealth        PRESENT — this board reports probe validity");
    console.log(`                      ${JSON.stringify(state.sensorHealth)}`);
    console.log("                      -> we can trust btValid for fault handling");
  } else {
    console.log("  sensorHealth        not seen");
    console.log("                      -> either an original TWO+ (V2/V3 only feature)");
    console.log("                         or it only emits during an active roast.");
    console.log("                         We fall back to staleness detection.");
  }

  const ok = state.telemetry > 0;
  console.log("");
  console.log(
    ok
      ? "  RESULT: hello_ui works — the device pushes telemetry. Contract confirmed."
      : "  RESULT: no telemetry seen. If frames arrived but none had 'bt', paste the\n" +
        "          raw lines above and we will adjust the parser."
  );
  console.log("");

  try {
    ws.close();
  } catch {}
  process.exit(ok ? 0 : 2);
}

process.on("SIGINT", finish);
