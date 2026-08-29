"use strict";

// RoastLink TWO+ WebSocket client.
//
// Speaks the documented contract (API/WEBSOCKET-API.md in getroastlink/roastlink-ui):
//   - connect to ws://<host>:81/
//   - send {"command":"mirror_enabled","data":0} so an empty ET socket can never
//     masquerade as BT (critical on Casey's single-probe setup)
//   - send the text frame "hello_ui" once to switch the device into push mode
//   - receive telemetry frames {"bt":..,"et":..,"at":..,"ah":..,"t":..}
//   - "ping" -> "pong" keepalive detects a silently dead link
//
// This layer is deliberately dumb about roast semantics: it emits raw device
// samples (with the device's own uptime `t`) and leaves roast-elapsed time,
// recording windows, and RoR to the session layer above it.
//
// Events: state(str) · open · sample(obj) · health(obj) · event(obj) ·
//         stale · close · error(Error)

const EventEmitter = require("events");

// Node 22+ exposes WebSocket globally; Electron's bundled Node may not, so fall
// back to the `ws` package when the global is missing.
let WS = globalThis.WebSocket;
if (!WS) {
  try { WS = require("ws"); } catch (_) { /* handled at connect time */ }
}

const DEFAULTS = {
  port: 81,
  pingIntervalMs: 5000,
  pongTimeoutMs: 8000,
  reconnectBaseMs: 1000,
  reconnectMaxMs: 15000,
};

class RoastLinkClient extends EventEmitter {
  constructor(host, opts = {}) {
    super();
    this.host = host;
    this.opts = { ...DEFAULTS, ...opts };
    this.ws = null;
    this.state = "idle"; // idle|connecting|live|stale|reconnecting|closed
    this.lastSample = null;
    this.health = null;
    this._stopped = false;
    this._attempts = 0;
    this._pingTimer = null;
    this._pongTimer = null;
    this._reconnectTimer = null;
  }

  get url() {
    // Allow an explicit "host:port" (e.g. "127.0.0.1:8081"), used by the local
    // mock -- it can't bind privileged port 81 without root on macOS. A bare
    // host ("roastlink.local") falls back to opts.port (81), the real device.
    const m = /^(.*):(\d+)$/.exec(this.host || "");
    if (m) return `ws://${m[1]}:${m[2]}/`;
    return `ws://${this.host}:${this.opts.port}/`;
  }

  start() {
    this._stopped = false;
    this._connect();
    return this;
  }

  stop() {
    this._stopped = true;
    this._clearTimers();
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this.ws) { try { this.ws.close(); } catch (_) {} }
    this._setState("closed");
  }

  _setState(s) {
    if (this.state !== s) { this.state = s; this.emit("state", s); }
  }

  _connect() {
    if (!WS) {
      this.emit("error", new Error("No WebSocket implementation (need Node 22+ or the ws package)"));
      return;
    }
    this._setState(this._attempts ? "reconnecting" : "connecting");
    let ws;
    try {
      ws = new WS(this.url);
    } catch (e) {
      this.emit("error", e);
      this._scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this._attempts = 0;
      this._send({ command: "mirror_enabled", data: 0 });
      this._send("hello_ui");
      this._startPing();
      this._setState("live");
      this.emit("open");
    };
    ws.onmessage = (ev) => {
      const data = typeof ev.data === "string" ? ev.data : String(ev.data);
      this._onFrame(data);
    };
    ws.onerror = (err) => {
      const e = err && err.message ? new Error(err.message) : new Error("websocket error");
      this.emit("error", e);
    };
    ws.onclose = () => {
      this._clearTimers();
      this.emit("close");
      if (this._stopped) this._setState("closed");
      else this._scheduleReconnect();
    };
  }

  _send(msg) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try {
      this.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
      return true;
    } catch (_) {
      return false;
    }
  }

  _onFrame(text) {
    const t = text.trim();
    if (t === "pong") { this._alive(); return; }

    let msg;
    try { msg = JSON.parse(t); } catch (_) { return; }

    if (msg.type === "sensorHealth") {
      this.health = msg;
      this.emit("health", msg);
      return;
    }
    if (msg.type === "ev") {
      this.emit("event", { label: msg.label, tDevice: msg.t });
      return;
    }
    if (typeof msg.bt === "number") {
      const sample = {
        tDevice: typeof msg.t === "number" ? msg.t : null,
        bt: msg.bt,
        et: typeof msg.et === "number" ? msg.et : null,
        at: typeof msg.at === "number" ? msg.at : null,
        ah: typeof msg.ah === "number" ? msg.ah : null,
        receivedAt: Date.now(),
      };
      this.lastSample = sample;
      this._alive(); // fresh telemetry proves the link, same as a pong
      this.emit("sample", sample);
    }
  }

  _startPing() {
    this._clearTimers();
    this._pingTimer = setInterval(() => {
      this._send("ping");
      if (this._pongTimer) return; // a window is already open
      this._pongTimer = setTimeout(() => {
        this._pongTimer = null;
        this._setState("stale");
        this.emit("stale");
        try { this.ws && this.ws.close(); } catch (_) {} // forces the reconnect path
      }, this.opts.pongTimeoutMs);
    }, this.opts.pingIntervalMs);
  }

  _alive() {
    if (this._pongTimer) { clearTimeout(this._pongTimer); this._pongTimer = null; }
    if (this.state === "stale") this._setState("live");
  }

  _clearTimers() {
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    if (this._pongTimer) { clearTimeout(this._pongTimer); this._pongTimer = null; }
  }

  _scheduleReconnect() {
    if (this._stopped) return;
    this._setState("reconnecting");
    const delay = Math.min(this.opts.reconnectBaseMs * 2 ** this._attempts, this.opts.reconnectMaxMs);
    this._attempts += 1;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._stopped) this._connect();
    }, delay);
  }
}

module.exports = { RoastLinkClient, DEFAULTS };
