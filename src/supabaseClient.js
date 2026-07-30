import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Auth options are explicit for clarity. The session (access JWT + refresh
// token) deliberately persists to localStorage so a reload/relaunch stays
// signed in.
//
// We intentionally do NOT switch to flowType 'pkce'. PKCE stores a one-time
// code-verifier in the *originating* client's storage, so a password-reset link
// opened in a different context than it was requested from would fail to
// complete — and that split is the norm for an installed PWA, where the
// standalone app and the system browser keep separate storage. The default flow
// keeps cross-context reset working; on HTTPS the marginal token-in-URL risk is
// low and is further contained by the Content-Security-Policy.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
