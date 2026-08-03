import React from "react";
import { useAuth } from "../contexts/AuthContext";

// Shown when the user arrives from a password-reset email. Supabase hands them
// a real session at that point, so AuthContext's `isRecovery` flag is what keeps
// them here instead of dropping them straight into the app.
export default function UpdatePasswordScreen() {
  const { updatePassword, signOut } = useAuth();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // Mirrors the Supabase password policy (min 8 + upper/lower/digit/symbol).
  // Checked here too so the user gets an instant, readable message instead of a
  // server error after a round-trip.
  const rules = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "An uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "A lowercase letter", ok: /[a-z]/.test(password) },
    { label: "A number", ok: /[0-9]/.test(password) },
    { label: "A symbol", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const allRulesPass = rules.every((r) => r.ok);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    if (!allRulesPass) {
      setError("Password doesn't meet all the requirements below.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await updatePassword(password);
      // isRecovery flips false — the app renders with the session already live.
    } catch (err) {
      setError(err?.message || "Couldn't update the password. Try again.");
      setSubmitting(false);
    }
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
            Set a New Password
          </h1>
          <p className="mt-1 text-sm text-ink-muted font-medium">
            Choose something you'll remember.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-border/60 bg-surface/30 p-6 shadow-[0_0_0_1px_rgba(0,0,0,0.2)]"
        >
          <label className={labelClass}>New Password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={inputClass}
          />

          <label className={`${labelClass} mt-4`}>Confirm Password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            className={inputClass}
          />

          <ul className="mt-4 space-y-1.5">
            {rules.map((rule) => (
              <li
                key={rule.label}
                className={`flex items-center gap-2 text-xs font-medium transition ${
                  rule.ok ? "text-success-text" : "text-ink-muted"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[9px] font-black ${
                    rule.ok
                      ? "border-transparent bg-success text-success-text"
                      : "border-border/70"
                  }`}
                >
                  {rule.ok ? "✓" : ""}
                </span>
                {rule.label}
              </li>
            ))}
          </ul>

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full min-h-[44px] inline-flex items-center justify-center rounded-2xl bg-accent px-4 py-3 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Saving..." : "Save Password"}
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
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}
