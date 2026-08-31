/**
 * Mock RoastLink TWO+ — speaks the documented WebSocket contract on :81 so the
 * sniffer can be exercised without hardware. Mirrors API/WEBSOCKET-API.md:
 * hello_ui starts a 1Hz telemetry push, ping -> pong, sensorHealth frames.
 */
const http = require("http");
const crypto = require("crypto");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const server = http.createServer();

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  let streaming = false;
  let uptime = 1234; // device uptime seconds — deliberately not zero
  let roastT = 0;    // seconds since telemetry started, drives the curve below

  // A real SR540 roast, not a ramp: a six-minute batch with a genuine
  // TURNAROUND. Cold beans pull the chamber down off the charge, BT bottoms out
  // around 0:42, then climbs with a decaying rate of rise to the drop.
  //
  // The previous curve was monotonic, which meant the turnaround marker could
  // never fire against it -- there was no dip to detect. It also ran ten
  // minutes, so every temperature threshold landed late and bunched.
  //
  // Written as explicit anchors rather than a fitted exponential so the
  // turnaround time and the drop temperature are things you set, not things you
  // solve for.
  const T_CHARGE = 214;   // probe reading as the beans go in
  const T_MIN = 196;      // the turnaround low
  const T_MIN_AT = 42;    // seconds — where that low lands
  const T_END = 404;      // BT at the drop
  const DROP_AT = 360;    // seconds — a six-minute roast
  const TAU = 210;        // climb-out time constant; sets how RoR decays

  const CLIMB_NORM = 1 - Math.exp(-(DROP_AT - T_MIN_AT) / TAU);

  const btAt = (t) => {
    if (t <= 0) return T_CHARGE;
    if (t < T_MIN_AT) {
      // Easing out into the low, so the floor is rounded rather than a corner
      // the rate-of-rise maths would read as a step change.
      const k = 1 - t / T_MIN_AT;
      return T_CHARGE - (T_CHARGE - T_MIN) * (1 - k * k);
    }
    // Exponential approach to the drop temperature: this is what gives a real
    // roast its decaying rate of rise instead of a straight line.
    return (
      T_MIN +
      ((T_END - T_MIN) * (1 - Math.exp(-(t - T_MIN_AT) / TAU))) / CLIMB_NORM
    );
  };

  const sendText = (s) => {
    const payload = Buffer.from(s, "utf8");
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x81, len]);
    } else {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    }
    socket.write(Buffer.concat([header, payload]));
  };

  const tick = setInterval(() => {
    if (!streaming) return;
    uptime += 1;
    roastT += 1;
    // A little probe noise so smoothing and RoR have something real to chew on.
    const bt = btAt(roastT) + (Math.random() - 0.5) * 0.6;
    sendText(
      JSON.stringify({
        et: +(bt + 24).toFixed(1),
        bt: +bt.toFixed(1),
        at: 77.0,
        ah: 42,
        t: uptime,
      })
    );
    if (uptime % 5 === 0) {
      sendText(
        JSON.stringify({
          type: "sensorHealth",
          btValid: true,
          etValid: false,
          btState: "ok",
          etState: "fault",
          btFault: 0,
        })
      );
    }
  }, 1000);

  let acc = Buffer.alloc(0);

  socket.on("data", (chunk) => {
    // Frames can coalesce in one TCP segment, so buffer and drain in a loop
    // rather than assuming one frame per data event.
    acc = Buffer.concat([acc, chunk]);

    for (;;) {
      if (acc.length < 2) return;
      let len = acc[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (acc.length < 4) return;
        len = acc.readUInt16BE(2);
        off = 4;
      }
      const masked = (acc[1] & 0x80) !== 0;
      const total = off + (masked ? 4 : 0) + len;
      if (acc.length < total) return; // wait for the rest

      const mask = masked ? acc.slice(off, off + 4) : null;
      const data = acc.slice(off + (masked ? 4 : 0), total);
      const out = Buffer.alloc(data.length);
      for (let i = 0; i < data.length; i++) {
        out[i] = mask ? data[i] ^ mask[i % 4] : data[i];
      }
      acc = acc.slice(total);
      handle(out.toString("utf8"));
    }
  });

  const handle = (msg) => {
    if (msg === "ping") return sendText("pong");
    if (msg === "hello_ui") {
      streaming = true;
      console.log("[mock] hello_ui received -> streaming");
      return;
    }
    try {
      const j = JSON.parse(msg);
      if (j.command === "mirror_enabled") {
        console.log("[mock] mirror_enabled ->", j.data);
        sendText(JSON.stringify({ id: j.id || 0, ok: true }));
      }
    } catch {}
  };

  socket.on("close", () => clearInterval(tick));
  socket.on("error", () => clearInterval(tick));
});

const PORT = Number(process.env.MOCK_PORT) || 8081;
server.listen(PORT, "127.0.0.1", () => console.log(`[mock] listening on ws://127.0.0.1:${PORT}/  (connect the bridge to 127.0.0.1:${PORT})`));
