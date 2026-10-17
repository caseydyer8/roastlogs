"use strict";

// Pure-function tests for lib/keyCheck.js. No dependencies and no network:
//   cd bridge && npm test
// The JWTs below are built at runtime from made-up claims and a fake
// signature -- none of these strings is, or ever was, a real key.

const test = require("node:test");
const assert = require("node:assert/strict");
const { isSecretKey } = require("../../lib/keyCheck");

const b64u = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.ZmFrZS1zaWduYXR1cmU`;

test("a legacy JWT whose role claim is service_role is refused", () => {
  assert.equal(isSecretKey(jwt({ role: "service_role" })), true);
});

test("the service_role claim is found among the usual extra claims", () => {
  const key = jwt({ iss: "supabase", ref: "abcdefghij", role: "service_role", iat: 1, exp: 2 });
  assert.equal(isSecretKey(key), true);
});

test("the payload is read as base64url, not plain base64", () => {
  // "?" and ">" encode to "/" and "+" in base64 but "_" and "-" in base64url.
  const claims = { role: "service_role", note: "???>>>~~~???" };
  const payload = b64u(claims);
  assert.match(payload, /[-_]/, "fixture must actually contain base64url-only characters");
  assert.equal(isSecretKey(jwt(claims)), true);
});

test("a padded payload is still read", () => {
  const padded = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64");
  assert.match(padded, /=$/, "fixture must actually be padded");
  assert.equal(isSecretKey(`e30.${padded}.sig`), true);
});

test("the legacy anon JWT is accepted", () => {
  assert.equal(isSecretKey(jwt({ role: "anon" })), false);
});

test("an authenticated-role JWT is not treated as a secret key", () => {
  assert.equal(isSecretKey(jwt({ role: "authenticated" })), false);
});

test("a JWT with no role claim is accepted", () => {
  assert.equal(isSecretKey(jwt({ iss: "supabase" })), false);
});

test("the sb_secret_ prefix is refused", () => {
  assert.equal(isSecretKey("sb_secret_x"), true);
});

test("the sb_secret_ prefix is refused regardless of case or padding spaces", () => {
  assert.equal(isSecretKey("SB_SECRET_x"), true);
  assert.equal(isSecretKey("  sb_secret_x  "), true);
});

test("the publishable key is accepted", () => {
  assert.equal(isSecretKey("sb_publishable_x"), false);
});

test("a secret key wrapped in quotes, an env line, or a Bearer header is refused", () => {
  // Pastes from a dashboard, a .env file, or a curl command carry decoration
  // around the key, so the marker must be found anywhere in the string.
  assert.equal(isSecretKey('"sb_secret_x"'), true);
  assert.equal(isSecretKey("'sb_secret_x'"), true);
  assert.equal(isSecretKey("SUPABASE_SECRET_KEY=sb_secret_x"), true);
  assert.equal(isSecretKey("Bearer sb_secret_x"), true);
  assert.equal(isSecretKey("apikey: sb_secret_x\n"), true);
});

test("a plaintext service_role marker is refused wherever it sits", () => {
  assert.equal(isSecretKey("SUPABASE_SERVICE_ROLE_KEY=abc"), true);
  assert.equal(isSecretKey("service_role"), true);
  assert.equal(isSecretKey("  Service_Role abc  "), true);
});

test("a wrapped publishable key or anon JWT is still accepted", () => {
  assert.equal(isSecretKey('"sb_publishable_x"'), false);
  assert.equal(isSecretKey("SUPABASE_ANON_KEY=sb_publishable_x"), false);
  assert.equal(isSecretKey(`Bearer ${jwt({ role: "anon" })}`), false);
});

test("a JWT is still caught with stray whitespace around it", () => {
  assert.equal(isSecretKey(`  ${jwt({ role: "service_role" })}\n`), true);
});

test("empty, missing and non-string input is accepted and never throws", () => {
  for (const bad of ["", "   ", undefined, null, 0, 42, true, {}, [], () => {}]) {
    assert.doesNotThrow(() => isSecretKey(bad));
    assert.equal(isSecretKey(bad), false);
  }
});

test("malformed keys are accepted and never throw", () => {
  const notJson = `${b64u({ alg: "none" })}.${Buffer.from("not json").toString("base64url")}.sig`;
  const cases = [
    "a.b", // two segments
    "a.b.c", // three segments, none decodable
    "a.b.c.d", // four segments
    "..", // three empty segments
    "a..c",
    notJson,
    `a.${Buffer.from('"service_role"').toString("base64url")}.c`, // JSON string, not an object
    `a.${Buffer.from("null").toString("base64url")}.c`,
    `a.${Buffer.from("[]").toString("base64url")}.c`,
    `a.${Buffer.from("42").toString("base64url")}.c`,
    "!!!.@@@.###",
    "x".repeat(100000),
  ];
  for (const bad of cases) {
    assert.doesNotThrow(() => isSecretKey(bad));
    assert.equal(isSecretKey(bad), false);
  }
});

test("a role that merely contains service_role is not a match", () => {
  assert.equal(isSecretKey(jwt({ role: "not_service_role" })), false);
  assert.equal(isSecretKey(jwt({ role: ["service_role"] })), false);
  assert.equal(isSecretKey(jwt({ note: "service_role" })), false);
});

test("the check writes nothing to the console, even on malformed input", () => {
  const methods = ["log", "info", "warn", "error", "debug"];
  const originals = {};
  const seen = [];
  for (const m of methods) {
    originals[m] = console[m];
    console[m] = (...args) => seen.push(args);
  }
  try {
    isSecretKey(jwt({ role: "service_role" }));
    isSecretKey("sb_secret_x");
    isSecretKey("a.not-base64-or-json.c");
  } finally {
    for (const m of methods) console[m] = originals[m];
  }
  assert.deepEqual(seen, []);
});
