"use strict";

// Is this Supabase key one that bypasses row-level security (RLS)?
//
// The bridge's key field is for the PUBLISHABLE key only: it is meant to be
// public, and under the admin-only + aal2 policies it can read nothing. A
// service_role / secret key ignores every policy (aal2 included), and the
// settings file stores the key in plaintext -- so one mis-paste would put a
// key to every table on disk. main.js calls this BEFORE anything is saved.
//
// Two shapes to catch:
//   - a plaintext marker -- "sb_secret_" (new-style secret keys) or
//     "service_role" -- found ANYWHERE in the pasted text, not just at the
//     start. Pastes arrive wrapped: '"sb_secret_..."' (quoted),
//     'SUPABASE_SECRET_KEY=sb_secret_...' (a .env line), 'Bearer sb_secret_...'.
//     There is no false-positive cost: a real JWT never contains the plaintext
//     "service_role" (it is base64url), and sb_publishable_ keys never contain
//     "sb_secret_". This is a superset of the renderer's own pre-check;
//   - legacy keys, which are JWTs. There "service_role" is base64url inside
//     the payload, so the text match cannot see it -- the payload has to be
//     decoded and its role claim read.
//
// Never throws, and never logs or returns any part of the key: JSON.parse
// errors quote the text they choked on, so failures are swallowed silently.
// The signature is NOT verified -- this is a guard against a paste mistake,
// not authentication, so there is no secret to check it against.

const SECRET_MARKER = /sb_secret_|service_role/i;

function isSecretKey(key) {
  if (typeof key !== "string") return false;
  const k = key.trim();
  if (SECRET_MARKER.test(k)) return true;

  // header.payload.signature -- only the payload is read.
  const parts = k.split(".");
  if (parts.length !== 3) return false;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return claims !== null && typeof claims === "object" && claims.role === "service_role";
  } catch (_) {
    return false;
  }
}

module.exports = { isSecretKey };
