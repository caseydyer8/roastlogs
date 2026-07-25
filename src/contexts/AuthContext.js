import React from "react";
import { supabase } from "../supabaseClient";

const AuthContext = React.createContext(null);

// User-owned localStorage caches (NOT device preferences like theme/units).
// All four are cloud-backed as of Phase 2, so purging them is recoverable.
const SYNCED_DATA_KEYS = ["roasts", "tastingNotes", "beans"];
const USER_DATA_KEYS = [...SYNCED_DATA_KEYS, "global_profiles"];
const DATA_OWNER_KEY = "roastlogs_data_owner";
// Purged data is moved aside rather than deleted, so a bad purge is recoverable.
// There is no PITR on the Supabase free plan, so "recoverable" matters.
const QUARANTINE_SUFFIX = "__quarantine";
// Supabase emits PASSWORD_RECOVERY only once, when it first parses the reset
// link's URL hash. A reload afterwards emits INITIAL_SESSION instead, so
// in-memory recovery state alone would let a reload skip the "set a new
// password" screen and land in the app on a full session — turning a reset link
// into a silent, permanent login. Persisting the recovering user's id survives
// the reload and keeps the gate closed until the password is actually changed.
const RECOVERY_UID_KEY = "roastlogs_pw_recovery_uid";

function readRecoveryUid() {
  try { return window.localStorage.getItem(RECOVERY_UID_KEY); } catch (e) { return null; }
}
function writeRecoveryUid(uid) {
  try { window.localStorage.setItem(RECOVERY_UID_KEY, uid || ""); } catch (e) {}
}
function clearRecoveryUid() {
  try { window.localStorage.removeItem(RECOVERY_UID_KEY); } catch (e) {}
}

function purgeLiveRoastKeys() {
  // In-progress roast session keys are all prefixed "live_".
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith("live_")) {
      try { window.localStorage.removeItem(key); } catch (e) {}
    }
  }
}

// Move a key's value aside instead of destroying it. The app never reads
// quarantine keys back, so quarantined data cannot surface for the wrong user;
// it exists purely as a manual undo path.
//
// CRITICAL: the backup copy is best-effort, but the REMOVAL is not optional.
// Writing the copy needs ~2x the key's space and can throw QuotaExceededError
// on a full device — if that throw skipped the removal, the previous user's
// data would stay readable by the next account. This control must fail CLOSED.
function quarantineKey(key) {
  const value = window.localStorage.getItem(key);
  if (value == null) return;
  try {
    window.localStorage.setItem(key + QUARANTINE_SUFFIX, value);
  } catch (e) {
    // Out of space: drop any stale/partial backup, then still remove below.
    try { window.localStorage.removeItem(key + QUARANTINE_SUFFIX); } catch (e2) {}
  }
  window.localStorage.removeItem(key);
}

function purgeCachedUserData(keys, { includeLive = false } = {}) {
  // Each key is isolated: a failure on one must never skip the rest. A shared
  // try/catch here would let a single throw abort the whole purge silently.
  keys.forEach((k) => {
    try { quarantineKey(k); } catch (e) {}
  });
  if (includeLive) {
    try { purgeLiveRoastKeys(); } catch (e) {}
  }
}

// RLS scopes what the SERVER returns; this scopes the DEVICE cache so a prior
// user's data can never surface for a different account on a shared device.
// Device preferences (theme/units) are intentionally left untouched.
function enforceLocalDataOwner(userId) {
  try {
    if (!userId) return;
    const prevOwner = window.localStorage.getItem(DATA_OWNER_KEY);
    const isKnownDifferentAccount = prevOwner && prevOwner !== userId;
    // No recorded owner = a cache from before ownership tracking shipped. We
    // cannot prove it belongs to whoever is signing in now, so it is treated
    // exactly like a different account. This branch can only ever run on a
    // device's FIRST sign-in, so it must not depend on any state that is
    // written later by the app.
    const isUnknownOwner = !prevOwner;

    if (isKnownDifferentAccount || isUnknownOwner) {
      // Purge EVERYTHING — synced caches, profiles, and the in-progress roast.
      // Safe to include profiles because purges quarantine rather than delete.
      purgeCachedUserData(USER_DATA_KEYS, { includeLive: true });
    }

    if (prevOwner !== userId) {
      // Only record the new owner once the cache is verifiably clear. If any
      // key survived (e.g. storage failure), leave the marker alone so the next
      // sign-in retries the purge instead of assuming it succeeded.
      const stillPresent = USER_DATA_KEYS.some(
        (k) => window.localStorage.getItem(k) != null
      );
      if (!stillPresent) {
        window.localStorage.setItem(DATA_OWNER_KEY, userId);
      }
    }
  } catch (e) {
    // ignore storage errors
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = React.useState(null);
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  // True while the user arrived via a password-reset email link. Supabase gives
  // them a real session at that point, so this flag is what keeps them on the
  // "choose a new password" screen instead of dropping them into the app.
  const [isRecovery, setIsRecovery] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    // Check for an existing session on mount.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        enforceLocalDataOwner(data.session?.user?.id);
        // An abandoned password recovery must not drop into the app on reload.
        if (data.session?.user?.id && readRecoveryUid() === data.session.user.id) {
          setIsRecovery(true);
        }
        setSession(data.session);
        setUser(data.session?.user ?? null);
        setLoading(false);
      })
      .catch((e) => {
        console.warn("Failed to get Supabase session", e);
        if (!mounted) return;
        setLoading(false);
      });

    // Subscribe to auth changes (sign in/out, token refresh, expiry, recovery).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mounted) return;
        if (event === "PASSWORD_RECOVERY") {
          writeRecoveryUid(newSession?.user?.id);
          setIsRecovery(true);
        }
        if (event === "SIGNED_OUT") {
          clearRecoveryUid();
          setIsRecovery(false);
        }
        enforceLocalDataOwner(newSession?.user?.id);
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const signIn = React.useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  }, []);

  const signOut = React.useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  // Send a password-reset email. `redirectTo` must be listed under
  // Authentication → URL Configuration → Redirect URLs in the Supabase
  // dashboard, or the link in the email will be rejected.
  const requestPasswordReset = React.useCallback(async (email) => {
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) throw error;
  }, []);

  // Set a new password for the user currently in the recovery session.
  const updatePassword = React.useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    clearRecoveryUid();
    setIsRecovery(false);
  }, []);

  const value = React.useMemo(
    () => ({
      user,
      session,
      loading,
      isRecovery,
      signIn,
      signOut,
      requestPasswordReset,
      updatePassword,
    }),
    [
      user,
      session,
      loading,
      isRecovery,
      signIn,
      signOut,
      requestPasswordReset,
      updatePassword,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
