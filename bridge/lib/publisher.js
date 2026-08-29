"use strict";

// Publishes live RoastLink samples to a Supabase Realtime *broadcast* channel.
//
// Security model (see docs/roastlink-live-data-plan.md): the channel is PRIVATE,
// so Realtime enforces RLS on realtime.messages. The bridge signs in as a
// dedicated machine identity that is deliberately NOT in public.admins -- so
// every data policy still returns it zero rows on every table. Its only
// capability in this entire project is publishing to this one topic. Reading
// the channel requires admin + aal2, same bar as the real data.
//
// This is what closes the spoofing hole: holding the (public) publishable key
// is no longer enough to inject fake temperatures into a live roast.
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
    this.status = "idle"; // idle|authenticating|joining|joined|error|closed
    this.viewers = 0;
    this.email = opts.email || null;
    this.password = opts.password || null;
    this.supabase = createClient(url, key, {
      // autoRefreshToken matters here: a roast can outlive the default token
      // lifetime, and an expired token would silently drop the publish
      // permission mid-roast. persistSession stays off -- credentials live in
      // the bridge's own settings file, not in a Supabase-managed store.
      auth: { persistSession: false, autoRefreshToken: true },
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

  async connect() {
    // Sign in as the bridge identity. Without this the channel join is refused
    // by the realtime.messages policies (anon has no INSERT on this topic).
    if (this.email && this.password) {
      this._setStatus("authenticating");
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: this.email,
        password: this.password,
      });
      if (error) {
        this._setStatus("error");
        this.emit("error", new Error("bridge sign-in failed: " + error.message));
        return this;
      }
      // Hand the fresh access token to the Realtime socket so the policies see
      // the bridge's uid rather than the anonymous role.
      const token = data?.session?.access_token;
      if (token && this.supabase.realtime?.setAuth) {
        await this.supabase.realtime.setAuth(token);
      }
    }

    this._setStatus("joining");
    this.channel = this.supabase.channel(this.opts.channel, {
      config: { private: true, broadcast: { ack: false }, presence: { key: "bridge" } },
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
    try {
      await this.supabase.auth.signOut();
    } catch (_) {}
    this.channel = null;
    this._setStatus("closed");
  }

  _setStatus(s) { if (this.status !== s) { this.status = s; this.emit("status", s); } }
}

module.exports = { Publisher, DEFAULTS };
