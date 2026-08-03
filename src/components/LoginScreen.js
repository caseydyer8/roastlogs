import React from "react";
import { useAuth } from "../contexts/AuthContext";

export default function LoginScreen() {
  const { signIn, requestPasswordReset } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  // "signin" | "reset" — reset asks for the email only and sends a reset link.
  const [mode, setMode] = React.useState("signin");
  const [resetSent, setResetSent] = React.useState(false);
  const emailRef = React.useRef(null);

  React.useEffect(() => {
    // Auto-focus email on non-touch devices only — avoids an abrupt
    // keyboard pop-up on iPhone the moment the screen loads.
    const isTouch =
      typeof window !== "undefined" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0);
    if (!isTouch && emailRef.current) {
      emailRef.current.focus();
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // On success the auth state change re-renders the app — no reload.
    } catch (err) {
      setError(err?.message || "Sign in failed. Please try again.");
      setSubmitting(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setResetSent(true);
    } catch (err) {
      setError(err?.message || "Couldn't send the reset email. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setResetSent(false);
  };

  const inputClass =
    "w-full min-h-[44px] rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 text-base text-ink placeholder:text-ink-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20";
  const labelClass =
    "block text-xs font-medium uppercase tracking-wider text-ink-muted mb-2";

  return (
    <div className="min-h-screen bg-primary text-ink flex items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <svg className="h-14 w-14 mb-3 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" />
            <path d="M17 9h2a2.5 2.5 0 0 1 0 5h-2" />
            <path d="M8 2.5c-.6.8-.6 1.7 0 2.5M12 2.5c-.6.8-.6 1.7 0 2.5" />
          </svg>
          <h1 className="text-3xl font-black tracking-tight text-ink">
            RoastLogs
          </h1>
          <p className="mt-1 text-sm text-ink-muted font-medium">
            Fresh Roast SR540 Roast Logger
          </p>
        </div>

        <form
          onSubmit={mode === "signin" ? handleSubmit : handleReset}
          className="rounded-3xl border border-border/60 bg-surface/30 p-6 shadow-[0_0_0_1px_rgba(0,0,0,0.2)]"
        >
          {mode === "reset" && (
            <p className="mb-5 text-sm text-ink-muted leading-relaxed">
              Enter your email and we'll send you a link to set a new password.
            </p>
          )}

          <label className={labelClass}>Email</label>
          <input
            ref={emailRef}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputClass}
          />

          {mode === "signin" && (
            <>
              <label className={`${labelClass} mt-4`}>Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
              />
            </>
          )}

          <button
            type="submit"
            disabled={submitting || (mode === "reset" && resetSent)}
            className="mt-6 w-full min-h-[44px] inline-flex items-center justify-center rounded-2xl bg-accent px-4 py-3 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {mode === "signin"
              ? submitting
                ? "Signing in..."
                : "Sign In"
              : submitting
              ? "Sending..."
              : resetSent
              ? "Email Sent"
              : "Send Reset Link"}
          </button>

          {resetSent && (
            <p className="mt-4 text-center text-sm font-medium text-success-text">
              Check your inbox for the reset link. It expires in one hour.
            </p>
          )}

          {error && (
            <p className="mt-4 text-center text-sm font-medium text-error-text">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => switchMode(mode === "signin" ? "reset" : "signin")}
            className="mt-5 w-full text-center text-xs font-bold uppercase tracking-wider text-ink-muted transition hover:text-accent-text"
          >
            {mode === "signin" ? "Forgot password?" : "Back to sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
