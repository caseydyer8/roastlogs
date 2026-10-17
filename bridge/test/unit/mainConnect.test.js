"use strict";

// The "connect" handler in main.js is where a pasted key becomes a file on
// disk, so the ORDER of its steps matters as much as the check itself: refuse
// first, and only then stop the old bridge or touch the settings file.
//
// Electron is not installed for unit tests (and must not be -- it is a
// ~100 MB download), so main.js is loaded against a stub "electron" and a stub
// Bridge. HOME is pointed at a temp directory first, so a settings file can
// never be written into the real home directory.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const EventEmitter = require("node:events");

const home = fs.mkdtempSync(path.join(os.tmpdir(), "rl-bridge-test-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
assert.equal(os.homedir(), home, "test must redirect the settings file away from the real home");
const SETTINGS = path.join(home, ".roastlogs-bridge.json");

const handlers = {};
const bridges = [];

class FakeBridge extends EventEmitter {
  constructor(opts) {
    super();
    this.opts = opts;
    this.started = false;
    this.stopped = false;
    bridges.push(this);
  }
  start() { this.started = true; }
  async stop() { this.stopped = true; }
}

const electron = {
  app: { whenReady: () => new Promise(() => {}), on() {}, quit() {} },
  BrowserWindow: Object.assign(function BrowserWindow() {}, { getAllWindows: () => [] }),
  ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
};

const mainPath = require.resolve("../../main");
const realLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (parent && parent.filename === mainPath) {
    if (request === "electron") return electron;
    if (request === "./lib/bridge") return { Bridge: FakeBridge };
  }
  return realLoad.call(this, request, parent, ...rest);
};
try {
  require(mainPath);
} finally {
  Module._load = realLoad;
}

// Made-up claims and a fake signature -- none of these is a real key.
const b64u = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.ZmFrZS1zaWduYXR1cmU`;

const SERVICE_ROLE_JWT = jwt({ role: "service_role", ref: "abcdefghij" });
const ANON_JWT = jwt({ role: "anon", ref: "abcdefghij" });

function creds(overrides = {}) {
  return {
    host: "roastlink.local",
    supabaseUrl: "https://abcdefghij.supabase.co",
    supabaseKey: "sb_publishable_x",
    email: "bridge@example.invalid",
    password: "not-a-real-password",
    ...overrides,
  };
}

// Runs fn with every console method captured; returns what was printed.
async function captureConsole(fn) {
  const methods = ["log", "info", "warn", "error", "debug"];
  const originals = {};
  const lines = [];
  for (const m of methods) {
    originals[m] = console[m];
    console[m] = (...args) => lines.push(args.map(String).join(" "));
  }
  try {
    await fn();
  } finally {
    for (const m of methods) console[m] = originals[m];
  }
  return lines.join("\n");
}

test.beforeEach(async () => {
  await handlers.disconnect(); // clears the module-level bridge from a prior test
  bridges.length = 0;
  fs.rmSync(SETTINGS, { force: true });
});

test.after(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

test("main.js registers the connect handler", () => {
  assert.equal(typeof handlers.connect, "function");
});

for (const [label, key] of [
  ["a service_role JWT", SERVICE_ROLE_JWT],
  ["an sb_secret_ key", "sb_secret_x"],
  ["a quoted sb_secret_ key", '"sb_secret_x"'],
  ["an sb_secret_ key inside a .env line", "SUPABASE_SECRET_KEY=sb_secret_x"],
  ["an sb_secret_ key behind Bearer", "Bearer sb_secret_x"],
]) {
  test(`${label} is refused: nothing saved, no bridge built, key never echoed`, async () => {
    let res;
    const printed = await captureConsole(async () => {
      res = await handlers.connect(null, creds({ supabaseKey: key }));
    });

    assert.equal(res.ok, false);
    assert.match(res.error, /service_role\/secret key/i);
    assert.match(res.error, /refused/i);
    assert.equal(fs.existsSync(SETTINGS), false, "settings file must not be created");
    assert.equal(bridges.length, 0, "no Bridge may be constructed");
    assert.equal(JSON.stringify(res).includes(key), false, "reply must not echo the key");
    assert.equal(printed.includes(key), false, "console must not receive the key");
  });
}

for (const [label, value] of [
  ["an array holding a secret key", ["sb_secret_x"]],
  ["an object", { toString: () => "sb_publishable_x" }],
  ["a number", 42],
  ["null", null],
  ["undefined", undefined],
  ["an empty string", ""],
]) {
  test(`a Supabase key that is ${label} is rejected as not text: nothing saved`, async () => {
    let res;
    const printed = await captureConsole(async () => {
      res = await handlers.connect(null, creds({ supabaseKey: value }));
    });

    assert.deepEqual(res, { ok: false, error: "Supabase key is missing or not text." });
    assert.equal(fs.existsSync(SETTINGS), false, "settings file must not be created");
    assert.equal(bridges.length, 0, "no Bridge may be constructed");
    assert.equal(printed.includes("sb_secret_x"), false, "console must not receive the value");
  });
}

for (const field of ["host", "supabaseUrl", "supabaseKey", "email", "password"]) {
  for (const [label, secret] of [
    ["an sb_secret_ key", "sb_secret_x"],
    ["a service_role JWT", SERVICE_ROLE_JWT],
  ]) {
    test(`${label} pasted into the ${field} field is refused: nothing saved`, async () => {
      let res;
      const printed = await captureConsole(async () => {
        res = await handlers.connect(null, creds({ [field]: secret }));
      });

      assert.equal(res.ok, false);
      assert.match(res.error, /refused/i);
      assert.equal(fs.existsSync(SETTINGS), false, "settings file must not be created");
      assert.equal(bridges.length, 0, "no Bridge may be constructed");
      assert.equal(JSON.stringify(res).includes(secret), false, "reply must not echo the value");
      assert.equal(printed.includes(secret), false, "console must not receive the value");
    });
  }
}

test("a fresh refusal says nothing about a saved key when none is saved", async () => {
  const res = await handlers.connect(null, creds({ supabaseKey: "sb_secret_x" }));
  assert.equal(res.ok, false);
  assert.doesNotMatch(res.error, /ALREADY saved/);
});

test("a refusal warns when a secret key is ALREADY saved, and still writes nothing", async () => {
  const stale = JSON.stringify({ ...creds(), supabaseKey: SERVICE_ROLE_JWT }, null, 2);
  fs.writeFileSync(SETTINGS, stale, { mode: 0o600 });

  let res;
  const printed = await captureConsole(async () => {
    res = await handlers.connect(null, creds({ supabaseKey: "sb_secret_y" }));
  });

  assert.equal(res.ok, false);
  assert.match(res.error, /refused/i);
  assert.match(res.error, /ALREADY saved in ~\/\.roastlogs-bridge\.json/);
  assert.match(res.error, /rotate the secret key/i);
  assert.equal(fs.readFileSync(SETTINGS, "utf8"), stale, "the settings file must be left byte-identical");
  assert.equal(bridges.length, 0);
  for (const secret of [SERVICE_ROLE_JWT, "sb_secret_y"]) {
    assert.equal(JSON.stringify(res).includes(secret), false, "reply must not echo any key");
    assert.equal(printed.includes(secret), false, "console must not receive any key");
  }
});

test("a refusal gives the plain message when the saved file is valid JSON but not an object", async () => {
  fs.writeFileSync(SETTINGS, "null", { mode: 0o600 });

  const res = await handlers.connect(null, creds({ supabaseKey: "sb_secret_y" }));

  assert.equal(res.ok, false);
  assert.match(res.error, /refused/i);
  assert.doesNotMatch(res.error, /Cannot read/i, "must not leak a TypeError message");
  assert.equal(fs.readFileSync(SETTINGS, "utf8"), "null");
});

test("a refusal does not warn when the saved key is a publishable one", async () => {
  const saved = JSON.stringify(creds(), null, 2);
  fs.writeFileSync(SETTINGS, saved, { mode: 0o600 });

  const res = await handlers.connect(null, creds({ supabaseKey: "sb_secret_y" }));

  assert.equal(res.ok, false);
  assert.doesNotMatch(res.error, /ALREADY saved/);
  assert.equal(fs.readFileSync(SETTINGS, "utf8"), saved);
});

test("a refused paste leaves a running bridge and the saved settings untouched", async () => {
  const first = await handlers.connect(null, creds());
  assert.equal(first.ok, true);
  const saved = fs.readFileSync(SETTINGS, "utf8");
  assert.equal(bridges.length, 1);

  const res = await handlers.connect(null, creds({ supabaseKey: SERVICE_ROLE_JWT }));

  assert.equal(res.ok, false);
  assert.equal(bridges.length, 1, "no second Bridge");
  assert.equal(bridges[0].stopped, false, "the running bridge must not be stopped");
  assert.equal(fs.readFileSync(SETTINGS, "utf8"), saved, "saved settings must be byte-identical");
});

for (const [label, key] of [
  ["the publishable key", "sb_publishable_x"],
  ["the legacy anon JWT", ANON_JWT],
]) {
  test(`${label} still connects and is saved`, async () => {
    const input = creds({ supabaseKey: key });
    const res = await handlers.connect(null, input);

    assert.deepEqual(res, { ok: true });
    assert.equal(bridges.length, 1);
    assert.deepEqual(bridges[0].opts, input, "bridge gets the credentials exactly as entered");
    assert.equal(bridges[0].started, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(SETTINGS, "utf8")), input);
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(SETTINGS).mode & 0o777, 0o600);
    }
  });
}

test("reconnecting with a good key still replaces the running bridge", async () => {
  await handlers.connect(null, creds());
  const res = await handlers.connect(null, creds({ supabaseKey: ANON_JWT }));

  assert.deepEqual(res, { ok: true });
  assert.equal(bridges.length, 2);
  assert.equal(bridges[0].stopped, true);
  assert.equal(bridges[1].started, true);
});
