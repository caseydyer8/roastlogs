import React from "react";
import { useAuth } from "../contexts/AuthContext";

// Shown after a correct password when the account has two-factor enabled but
// this session hasn't entered a code yet. The router keeps the user here (not
// in the app) until submitMfaChallenge steps the session up to aal2.
export default function MfaChallengeScreen() {
  const { submitMfaChallenge, signOut } = useAuth();
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const inputRef = React.useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    const clean = code.replace(/\D/g, "");
    if (clean.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setSubmitting(true);
    try {
      await submitMfaChallenge(clean);
      // Success flips mfaRequired false → the app renders. No reload needed.
    } catch (err) {
      setError(err?.message || "That code didn't work — try the current one.");
      setSubmitting(false);
      setCode("");
      if (inputRef.current) inputRef.current.focus();
    }
  };

  return (
    <div className="min-h-screen bg-primary text-ink flex items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="text-5xl mb-3" aria-hidden="true">
            🔒
          </div>
          <h1 className="text-3xl font-black tracking-tight text-ink">
            Two-Factor
          </h1>
          <p className="mt-1 text-sm text-ink-muted font-medium">
            Enter the 6-digit code from your authenticator app.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-border/60 bg-surface/30 p-6 shadow-[0_0_0_1px_rgba(0,0,0,0.2)]"
        >
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-2">
            Authentication code
          </label>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className="w-full min-h-[44px] rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 text-center text-2xl font-mono tracking-[0.4em] text-ink placeholder:text-ink-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
          />

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full min-h-[44px] inline-flex items-center justify-center rounded-2xl bg-accent px-4 py-3 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Verifying..." : "Verify"}
          </button>

          {error && (
            <p className="mt-4 text-center text-sm font-medium text-error-text">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => signOut().catch(() => {})}
            className="mt-5 w-full text-center text-xs font-bold uppercase tracking-wider text-ink-muted transition hover:text-accent-text"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
