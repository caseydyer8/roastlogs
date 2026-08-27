"use strict";

// Publishes live RoastLink samples to a Supabase Realtime *broadcast* channel.
//
// Security model (see docs/roastlink-live-data-plan.md): broadcast is ephemeral
// and touches no table, so RLS is not bypassed — it is simply not in the path.
// The bridge authenticates with the already-public publishable key, which the
// admin-only + aal2 policies render powerless against real data. A fully
// compromised bridge could broadcast fake temperatures and nothing more.
//
// Presence is used for a genuine viewer count: the bridge tracks itself as
// role "bridge"; every RoastLogs screen tracks itself as a viewer, so the
// "Viewers" lamp reflects real subscribers, not a guess.
//
// Events: status(str) · connected · viewers(n) · error(Error)

const EventEmitter = require("events");
const { createClient } = require("@supabase/supabase-js");
const WebSocketImpl = require("ws");

const DEFAULTS = { channel: "roastlink-live", event: "sample" };

class Publisher extends EventEmitter {
  constructor(url, key, opts = {}) {
    super();
    this.opts = { ...DEFAULTS, ...opts };
    this.status = "idle"; // idle|joining|joined|error|closed
    this.viewers = 0;
    this.supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      // Supabase's Realtime client only auto-detects a WebSocket on Node 22+.
      // Electron 32 bundles an older Node internally, so without an explicit
      // transport it throws "Node.js detected but native WebSocket not
      // found" the moment it tries to open the socket -- exactly the failure
      // Case hit in the Electron shell (plain `node run.js` on real Node 22
      // never showed it, since native WebSocket covered it there).
      realtime: { transport: WebSocketImpl, params: { eventsPerSecond: 5 } },
    });
    this.channel = null;
  }

  connect() {
    this._setStatus("joining");
    this.channel = this.supabase.channel(this.opts.channel, {
      config: { broadcast: { ack: false }, presence: { key: "bridge" } },
    });

    this.channel.on("presence", { event: "sync" }, () => {
      const state = this.channel.presenceState();
      let n = 0;
      for (const key of Object.keys(state)) {
        for (const p of state[key]) {
          if (p.role !== "bridge") n += 1;
        }
      }
      if (n !== this.viewers) { this.viewers = n; this.emit("viewers", n); }
    });

    this.channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        this._setStatus("joined");
        this.channel.track({ role: "bridge", at: Date.now() });
        this.emit("connected");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        this._setStatus("error");
        this.emit("error", new Error("realtime " + status));
      } else if (status === "CLOSED") {
        this._setStatus("closed");
      }
    });
    return this;
  }

  publish(sample) {
    if (this.status !== "joined" || !this.channel) return false;
    this.channel.send({ type: "broadcast", event: this.opts.event, payload: sample });
    return true;
  }

  async disconnect() {
    try {
      if (this.channel) await this.supabase.removeChannel(this.channel);
    } catch (_) {}
    this.channel = null;
    this._setStatus("closed");
  }

  _setStatus(s) { if (this.status !== s) { this.status = s; this.emit("status", s); } }
}

module.exports = { Publisher, DEFAULTS };
