import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Fail loudly and early when the keys are absent. Without this guard,
// createClient(undefined, undefined) yields a client that only breaks later, as
// opaque console errors during auth — and, worse, `npm run deploy` builds from
// this same env, so a missing .env would silently publish a keyless bundle to
// the live site. .env is gitignored by design, so a fresh clone never has it:
// this is the check that turns that into an obvious, self-explaining failure.
const missingEnv = [
  ['REACT_APP_SUPABASE_URL', supabaseUrl],
  ['REACT_APP_SUPABASE_ANON_KEY', supabaseAnonKey],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missingEnv.length > 0) {
  throw new Error(
    `Supabase config missing: ${missingEnv.join(', ')}. ` +
      'Create a .env in the repo root (copy .env.example and fill in the values ' +
      'from Supabase → Project Settings → API), then restart `npm start` — ' +
      'Create React App only reads .env at startup.'
  );
}

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
