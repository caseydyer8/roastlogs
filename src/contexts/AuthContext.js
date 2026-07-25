import React from "react";
import { supabase } from "../supabaseClient";

const AuthContext = React.createContext(null);

// User-owned localStorage caches (NOT device preferences like theme/units).
// SYNCED_DATA_KEYS mirror Supabase and re-fetch from the cloud after a purge.
// `global_profiles` also syncs as of Phase 2 — but only AFTER the one-time
// upload has actually happened, which PROFILES_UPLOADED_KEY records.
const SYNCED_DATA_KEYS = ["roasts", "tastingNotes", "beans"];
const USER_DATA_KEYS = [...SYNCED_DATA_KEYS, "global_profiles"];
const DATA_OWNER_KEY = "roastlogs_data_owner";
// Written by App.js once local-only profiles have been pushed to roast_profiles.
// Until that happens, `global_profiles` is the ONLY copy in existence and must
// never be purged in the unknown-owner case — that would destroy it outright.
const PROFILES_UPLOADED_KEY = "roastlogs_profiles_uploaded";
// Purged data is moved aside rather than deleted, so a bad purge is recoverable.
// There is no PITR on the Supabase free plan, so "recoverable" matters.
const QUARANTINE_SUFFIX = "__quarantine";

function purgeLiveRoastKeys() {
  // In-progress roast session keys are all prefixed "live_".
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith("live_")) window.localStorage.removeItem(key);
  }
}

// Move a key's value aside instead of destroying it. The app never reads
// quarantine keys, so quarantined data cannot surface for the wrong user; it
// exists purely as an undo path. App.js clears it after a successful sync.
function quarantineKey(key) {
  const value = window.localStorage.getItem(key);
  if (value != null) {
    window.localStorage.setItem(key + QUARANTINE_SUFFIX, value);
  }
  window.localStorage.removeItem(key);
}

function purgeCachedUserData(keys, { includeLive = false } = {}) {
  try {
    keys.forEach(quarantineKey);
    if (includeLive) purgeLiveRoastKeys();
  } catch (e) {
    // localStorage unavailable (private mode etc.) — nothing to purge.
  }
}

// RLS scopes what the SERVER returns; this scopes the DEVICE cache so a prior
// user's data can never surface for a different account on a shared device.
// Device preferences (theme/units) are intentionally left untouched.
function enforceLocalDataOwner(userId) {
  try {
    if (!userId) return;
    const prevOwner = window.localStorage.getItem(DATA_OWNER_KEY);
    if (prevOwner && prevOwner !== userId) {
      // A KNOWN different account is signing in — purge everything, including
      // the in-progress roast and profiles.
      purgeCachedUserData(USER_DATA_KEYS, { includeLive: true });
    } else if (!prevOwner) {
      // Unknown owner + existing cache = data cached before ownership tracking
      // shipped; we can't prove it belongs to whoever is signing in now. Purge
      // so a prior user's cache can't surface for a different first
      // post-upgrade user.
      //
      // Profiles and the in-progress roast are only safe to purge once profiles
      // have actually been uploaded — before that, localStorage is their only
      // home and purging would delete them permanently.
      const profilesAreBackedUp =
        window.localStorage.getItem(PROFILES_UPLOADED_KEY) === "1";
      const keys = profilesAreBackedUp ? USER_DATA_KEYS : SYNCED_DATA_KEYS;
      const hasCache = keys.some((k) => window.localStorage.getItem(k) != null);
      if (hasCache) {
        purgeCachedUserData(keys, { includeLive: profilesAreBackedUp });
      }
    }
    if (prevOwner !== userId) {
      window.localStorage.setItem(DATA_OWNER_KEY, userId);
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
        if (event === "PASSWORD_RECOVERY") setIsRecovery(true);
        if (event === "SIGNED_OUT") setIsRecovery(false);
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
