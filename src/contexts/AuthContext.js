import React from "react";
import { supabase } from "../supabaseClient";

const AuthContext = React.createContext(null);

// Data localStorage keys that hold USER-OWNED content (not device preferences
// like theme/units). These are the roasts/tastings/beans caches plus profiles,
// and the in-progress ("live_*") roast session. They must never carry across
// accounts on a shared device.
const USER_DATA_KEYS = ["roasts", "tastingNotes", "beans", "global_profiles"];
const DATA_OWNER_KEY = "roastlogs_data_owner";

function purgeCachedUserData() {
  try {
    USER_DATA_KEYS.forEach((k) => window.localStorage.removeItem(k));
    // In-progress roast session keys are all prefixed "live_".
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("live_")) window.localStorage.removeItem(key);
    }
  } catch (e) {
    // localStorage unavailable (private mode etc.) — nothing to purge.
  }
}

// RLS scopes what the SERVER returns; this scopes the DEVICE cache. If a
// DIFFERENT account signs in on this device, purge the previous user's cached
// rows so they can never surface for the new user. Device preferences
// (theme/units) are intentionally left untouched. A plain sign-out leaves the
// cache in place — a returning same-user login keeps it; a different-user login
// purges it — so a user's own local data survives logging out and back in.
function enforceLocalDataOwner(userId) {
  try {
    if (!userId) return;
    const prevOwner = window.localStorage.getItem(DATA_OWNER_KEY);
    if (prevOwner && prevOwner !== userId) {
      purgeCachedUserData();
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
