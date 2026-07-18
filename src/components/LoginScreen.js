import React from "react";
import { useAuth } from "../contexts/AuthContext";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
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

  return (
    <div className="min-h-screen bg-primary text-ink flex items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="text-5xl mb-3" aria-hidden="true">
            ☕
          </div>
          <h1 className="text-3xl font-black tracking-tight text-ink">
            RoastLogs
          </h1>
          <p className="mt-1 text-sm text-ink-muted font-medium">
            Fresh Roast SR540 Roast Logger
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-border/60 bg-surface/30 p-6 shadow-[0_0_0_1px_rgba(0,0,0,0.2)]"
        >
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-2">
            Email
          </label>
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
            className="w-full min-h-[44px] rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 text-base text-ink placeholder:text-ink-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
          />

          <label className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-2 mt-4">
            Password
          </label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full min-h-[44px] rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 text-base text-ink placeholder:text-ink-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
          />

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full min-h-[44px] inline-flex items-center justify-center rounded-2xl bg-accent px-4 py-3 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>

          {error && (
            <p className="mt-4 text-center text-sm font-medium text-error-text">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
