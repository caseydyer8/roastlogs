import React from "react";
import { supabase } from "../supabaseClient";

const AuthContext = React.createContext(null);

// User-owned localStorage caches (NOT device preferences like theme/units).
// SYNCED_DATA_KEYS mirror Supabase and are safe to purge anytime — they re-fetch
// from the cloud. `global_profiles` is local-only until profile sync ships, so
// it is only purged when a *known* different account signs in (never in the
// unknown-owner case, to avoid destroying the upgrading user's profiles).
const SYNCED_DATA_KEYS = ["roasts", "tastingNotes", "beans"];
const USER_DATA_KEYS = [...SYNCED_DATA_KEYS, "global_profiles"];
const DATA_OWNER_KEY = "roastlogs_data_owner";

function purgeLiveRoastKeys() {
  // In-progress roast session keys are all prefixed "live_".
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith("live_")) window.localStorage.removeItem(key);
  }
}

function purgeCachedUserData(keys, { includeLive = false } = {}) {
  try {
    keys.forEach((k) => window.localStorage.removeItem(k));
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
      // the in-progress roast and (local-only) profiles.
      purgeCachedUserData(USER_DATA_KEYS, { includeLive: true });
    } else if (!prevOwner) {
      // Unknown owner + existing cache = data cached before this feature shipped;
      // we can't prove it belongs to this user. Purge the cloud-backed caches
      // (they re-fetch, so no loss) so a prior single-user cache can't surface
      // for a different first post-upgrade user. Local-only profiles and any
      // in-progress roast are preserved so the upgrading owner keeps them;
      // profiles gain full protection once they sync to the cloud (Phase 2).
      const hasSyncedCache = SYNCED_DATA_KEYS.some(
        (k) => window.localStorage.getItem(k) != null
      );
      if (hasSyncedCache) purgeCachedUserData(SYNCED_DATA_KEYS);
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

    // Subscribe to auth changes (sign in/out, token refresh, expiry).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted) return;
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

  const value = React.useMemo(
    () => ({ user, session, loading, signIn, signOut }),
    [user, session, loading, signIn, signOut]
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
