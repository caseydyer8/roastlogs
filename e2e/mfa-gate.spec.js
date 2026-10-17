const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

// The two-factor gate, exercised through the REAL code path.
//
// Every other spec turns the dev-only auth bypass on (`roastlogs_e2e`), which
// skips src/index.js's `mfaRequired` branch entirely -- so nothing in the suite
// would notice if a password-only session were let into the app. This file does
// NOT set the bypass. It seeds a stored Supabase session instead, and lets
// supabase-js, AuthContext.applySession and Root's routing run unmodified.
//
// Why no network answer needs faking: with no JWT argument,
// supabase.auth.mfa.getAuthenticatorAssuranceLevel() reads the session already in
// storage -- `aal` from the access token's payload, "a verified factor exists"
// from session.user.factors -- and a session that is not near expiry is not
// refreshed. Nothing reaches Supabase: HTTP is aborted and the realtime WebSocket is
// mocked (see beforeEach).
//
// What this does NOT cover is the server half: that a password-only (aal1) token
// reads zero rows is the RLS `aal2` clause, verified against the database, not here.

test.beforeEach(async ({ context, page }) => {
  // Nothing may reach Supabase. Two doors, two guards:
  //  - HTTP (auth, REST) is aborted. context.route covers HTTP only.
  //  - The realtime WebSocket is MOCKED. At aal2 the real app mounts, useLiveRoast
  //    subscribes, and realtime-js would open a REAL wss:// connection to the host in
  //    REACT_APP_SUPABASE_URL carrying this file's forged, unsigned aal2 token and the
  //    anon key. The handler is empty on purpose and never calls connectToServer, so
  //    the page sees a socket that opens and then says nothing, and no byte leaves the
  //    browser.
  await context.route(/supabase\.co/, (route) => route.abort());
  await page.routeWebSocket(/supabase\.co/, () => {});
});

// supabase-js keeps the session under `sb-<project ref>-auth-token`, the ref being
// the first label of REACT_APP_SUPABASE_URL's host (SupabaseClient.ts). The dev
// server reads the same variable -- from the environment, or from .env -- so this
// follows whichever it was given instead of hard-coding a project.
function supabaseUrl() {
  if (process.env.REACT_APP_SUPABASE_URL) return process.env.REACT_APP_SUPABASE_URL;
  try {
    const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
    const match = env.match(/^\s*REACT_APP_SUPABASE_URL\s*=\s*["']?([^"'\s#]+)/m);
    if (match) return match[1];
  } catch (e) { /* no .env: handled below */ }
  throw new Error("REACT_APP_SUPABASE_URL is not set (environment or .env), so the stored-session key cannot be worked out.");
}
const storageKey = () => `sb-${new URL(supabaseUrl()).hostname.split(".")[0]}-auth-token`;

const b64url = (value) =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

// A session the way supabase-js stores one. The token is unsigned and fake: the
// client only decodes it (no signature check), and nothing here reaches a server.
// The user is synthetic -- no real account, address or id appears in this file.
function storedSession({ aal, verifiedFactor }) {
  const now = Math.floor(Date.now() / 1000);
  const userId = "00000000-0000-4000-8000-0000000000e2";
  const claims = {
    sub: userId, aud: "authenticated", role: "authenticated", aal,
    amr: aal === "aal2" ? [{ method: "password" }, { method: "totp" }] : [{ method: "password" }],
    iat: now, exp: now + 3600,
  };
  return {
    access_token: [b64url({ alg: "HS256", typ: "JWT" }), b64url(claims), b64url("e2e-signature")].join("."),
    refresh_token: "e2e-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    user: {
      id: userId, aud: "authenticated", role: "authenticated", email: "e2e@example.invalid",
      app_metadata: {}, user_metadata: {}, created_at: new Date(now * 1000).toISOString(),
      factors: verifiedFactor
        ? [{ id: "00000000-0000-4000-8000-0000000000f1", factor_type: "totp", status: "verified", friendly_name: "e2e" }]
        : [],
    },
  };
}

// Seed the session (a raw string, so a test can store a broken one) and watch the
// DOM from the first paint: "never the app shell" means never, not "not at the
// moment the challenge appeared". The shell is recognised by its bottom-nav button.
async function openWithStoredSession(page, session) {
  await page.addInitScript(([key, value]) => {
    window.localStorage.setItem(key, value);
    window.__shellSeen = false;
    new MutationObserver(() => {
      if ([...document.querySelectorAll("button")].some((b) => b.textContent.includes("History"))) window.__shellSeen = true;
    }).observe(document, { childList: true, subtree: true });
  }, [storageKey(), typeof session === "string" ? session : JSON.stringify(session)]);
  await page.goto("/");
}

const challenge = (page) => page.getByRole("heading", { name: "Two-Factor" });
const appShell = (page) => page.getByRole("button", { name: "History" });

async function expectChallengeAndNeverTheShell(page) {
  await expect(challenge(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByPlaceholder("000000")).toBeVisible(); // the code field
  await expect(appShell(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__shellSeen), "the app shell must never have rendered").toBe(false);
}

test("mfa gate: a password-only (aal1) session with an authenticator enrolled lands on the code prompt, never the app", async ({ page }) => {
  await openWithStoredSession(page, storedSession({ aal: "aal1", verifiedFactor: true }));
  await expectChallengeAndNeverTheShell(page);
});

test("mfa gate: a session whose assurance level cannot be read fails closed to the code prompt, never the app", async ({ page }) => {
  // The reader throws on a token it cannot decode. AuthContext.applySession treats
  // that as "still owes the second factor" -- the fail-closed direction -- rather
  // than as "no second factor needed".
  const unreadable = { ...storedSession({ aal: "aal1", verifiedFactor: true }), access_token: "not-a-jwt" };
  await openWithStoredSession(page, unreadable);
  await expectChallengeAndNeverTheShell(page);
});

test("mfa gate: control -- the same session at aal2 gets the app, so the seeded session is genuinely accepted", async ({ page }) => {
  // Without this, the two tests above would also pass if the seed were simply
  // ignored or the app never loaded past the gate for some unrelated reason.
  await openWithStoredSession(page, storedSession({ aal: "aal2", verifiedFactor: true }));
  await expect(appShell(page)).toBeVisible({ timeout: 15_000 });
  await expect(challenge(page)).toHaveCount(0);
  // The positive control for the observer itself: the aal1 tests assert __shellSeen is
  // false, which would also hold if the observer were broken and never fired. Here the
  // shell is on screen, so a working observer MUST have seen it.
  expect(await page.evaluate(() => window.__shellSeen), "the shell observer sees the shell when it renders").toBe(true);
});
