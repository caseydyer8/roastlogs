import React from 'react';
import ReactDOM from 'react-dom/client';
// IBM Plex — self-hosted via fontsource, latin subset only (English UI), the
// weights the v3 instrument type system uses. Bundled, so it works offline (PWA)
// with no external font request (CSP-friendly).
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import './index.css';
import App from './App';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginScreen from './components/LoginScreen';
import UpdatePasswordScreen from './components/UpdatePasswordScreen';
import MfaChallengeScreen from './components/MfaChallengeScreen';

function Root() {
  const { session, loading, isRecovery, mfaRequired } = useAuth();

  // E2E-only auth bypass. Two safety layers:
  // 1. NODE_ENV check — production builds dead-code-eliminate this entire
  //    branch, so the bypass does not exist in the deployed bundle.
  // 2. The Playwright harness blocks all *.supabase.co network calls, so
  //    bypass mode can never read or write real data.
  const isE2EBypass =
    process.env.NODE_ENV === "development" &&
    window.localStorage.getItem("roastlogs_e2e") === "1";

  if (loading) {
    return (
      <div className="min-h-screen bg-primary text-ink flex flex-col items-center justify-center gap-4">
        <svg className="h-11 w-11 animate-pulse text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" /><path d="M17 9h2a2.5 2.5 0 0 1 0 5h-2" /><path d="M8 2.5c-.6.8-.6 1.7 0 2.5M12 2.5c-.6.8-.6 1.7 0 2.5" /></svg>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-card">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-accent" />
        </div>
      </div>
    );
  }

  if (!session && !isE2EBypass) {
    return <LoginScreen />;
  }

  // Arriving from a password-reset email creates a real session, so this check
  // must come BEFORE rendering the app — otherwise the reset link would simply
  // log the user in without ever letting them set a new password.
  if (isRecovery) {
    return <UpdatePasswordScreen />;
  }

  // A correct password isn't enough when two-factor is on: hold at the code
  // prompt until the session steps up to aal2. Comes before the app for the same
  // reason recovery does — the app must never render to a half-authenticated
  // session. (Enforced server-side too, once the aal2 RLS migration lands.)
  if (mfaRequired && !isE2EBypass) {
    return <MfaChallengeScreen />;
  }

  // Keyed by account id so a session that switches from user A to user B
  // WITHOUT an intervening sign-out (e.g. signing in on a second tab) remounts
  // App from scratch. Without this, A's in-memory state would survive and get
  // written into B's account.
  return <App key={session?.user?.id || "e2e-bypass"} />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>
);
