import React from 'react';
import ReactDOM from 'react-dom/client';
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
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center gap-4">
        <div className="text-4xl animate-pulse" aria-hidden="true">☕</div>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-amber-500" />
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
