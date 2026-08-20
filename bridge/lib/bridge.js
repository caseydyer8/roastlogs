"use strict";

// The bridge controller: wires the RoastLink device client to the Supabase
// publisher and exposes a single "lamps" status object for the UI. This is the
// headless core the Electron shell will wrap — device in, cloud out, three
// honest status signals (device link, cloud link, live viewer count).
//
// Events: lamps(obj) · sample(obj) · health(obj) · event(obj) · error({source,error})

const EventEmitter = require("events");
const { RoastLinkClient } = require("./roastlink");
const { Publisher } = require("./publisher");

class Bridge extends EventEmitter {
  constructor({ host, supabaseUrl, supabaseKey, channel } = {}) {
    super();
    this.client = new RoastLinkClient(host);
    this.publisher = new Publisher(supabaseUrl, supabaseKey, channel ? { channel } : {});
    this.lamps = { device: "idle", cloud: "idle", viewers: 0 };
    this._wire();
  }

  _wire() {
    this.client.on("state", (s) => { this.lamps.device = s; this._lamps(); });
    this.client.on("sample", (s) => {
      // Live path only — the bridge never persists. RoastLogs owns the record.
      this.publisher.publish(s);
      this.emit("sample", s);
    });
    this.client.on("health", (h) => this.emit("health", h));
    this.client.on("event", (e) => this.emit("event", e));
    this.client.on("error", (e) => this.emit("error", { source: "device", error: e }));

    this.publisher.on("status", (s) => { this.lamps.cloud = s; this._lamps(); });
    this.publisher.on("viewers", (n) => { this.lamps.viewers = n; this._lamps(); });
    this.publisher.on("error", (e) => this.emit("error", { source: "cloud", error: e }));
  }

  start() {
    this.publisher.connect();
    this.client.start();
    return this;
  }

  async stop() {
    this.client.stop();
    await this.publisher.disconnect();
  }

  _lamps() { this.emit("lamps", { ...this.lamps }); }
}

module.exports = { Bridge };
