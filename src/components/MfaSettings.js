import React from "react";
import { useAuth } from "../contexts/AuthContext";

// Two-factor management, shown inside the Account card. Handles first-time
// enrollment (show QR → verify a code) and turning it off. Login-time challenges
// are handled separately by MfaChallengeScreen.
export default function MfaSettings() {
  const { listMfaFactors, enrollMfa, confirmMfaEnrollment, unenrollMfa } = useAuth();
  // loading | off | enrolling | on
  const [status, setStatus] = React.useState("loading");
  const [factorId, setFactorId] = React.useState(null);
  const [qrSrc, setQrSrc] = React.useState(null);
  const [secret, setSecret] = React.useState(null);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const data = await listMfaFactors();
      const verified = (data?.totp || []).filter((f) => f.status === "verified");
      if (verified.length > 0) {
        setFactorId(verified[0].id);
        setStatus("on");
      } else {
        setStatus("off");
      }
    } catch (e) {
      setStatus("off");
    }
  }, [listMfaFactors]);

  React.useEffect(() => {
    load();
  }, [load]);

  const startEnroll = async () => {
    setError("");
    setBusy(true);
    try {
      const data = await enrollMfa();
      setFactorId(data.id);
      const q = data.totp?.qr_code || "";
      // qr_code may be a data URI or raw SVG markup depending on version — handle both.
      setQrSrc(q.startsWith("data:") ? q : `data:image/svg+xml;utf-8,${encodeURIComponent(q)}`);
      setSecret(data.totp?.secret || "");
      setStatus("enrolling");
    } catch (e) {
      setError(e?.message || "Couldn't start two-factor setup.");
    } finally {
      setBusy(false);
    }
  };

  const finishEnroll = async () => {
    setError("");
    const clean = code.replace(/\D/g, "");
    if (clean.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    try {
      await confirmMfaEnrollment(factorId, clean);
      setQrSrc(null);
      setSecret(null);
      setCode("");
      setStatus("on");
    } catch (e) {
      setError(e?.message || "That code didn't verify — try the current one.");
    } finally {
      setBusy(false);
    }
  };

  // Abandoning setup removes the pending (unverified) factor so it doesn't linger.
  const cancelEnroll = async () => {
    if (factorId) {
      try { await unenrollMfa(factorId); } catch (e) {}
    }
    setFactorId(null);
    setQrSrc(null);
    setSecret(null);
    setCode("");
    setError("");
    setStatus("off");
  };

  const disable = async () => {
    if (!window.confirm("Turn off two-factor for this account? Your login will only require a password.")) return;
    setBusy(true);
    setError("");
    try {
      await unenrollMfa(factorId);
      setFactorId(null);
      setStatus("off");
    } catch (e) {
      setError(e?.message || "Couldn't turn off two-factor.");
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "w-full min-h-[44px] rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 text-center text-xl font-mono tracking-[0.3em] text-ink placeholder:text-ink-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs text-ink-muted">
          Two-factor authentication
        </div>
        {status === "on" && (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success-text">
            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
            ON
          </span>
        )}
      </div>

      {status === "loading" && (
        <div className="text-xs text-ink-muted">Checking…</div>
      )}

      {status === "off" && (
        <>
          <p className="mb-3 text-xs text-ink-muted leading-relaxed">
            Add a second step at login — a 6-digit code from an authenticator app
            (Google Authenticator, 1Password, Authy). Even if your password leaked,
            no one could sign in without your phone.
          </p>
          <button
            type="button"
            onClick={startEnroll}
            disabled={busy}
            className="w-full py-3 text-sm font-bold text-accent-text bg-accent/10 border border-accent/30 rounded-2xl hover:bg-accent/20 transition disabled:opacity-60"
          >
            {busy ? "Starting…" : "Enable two-factor"}
          </button>
        </>
      )}

      {status === "enrolling" && (
        <div className="space-y-3">
          <p className="text-xs text-ink-muted leading-relaxed">
            1. Scan this with your authenticator app, then enter the current
            6-digit code to confirm.
          </p>
          {qrSrc && (
            <div className="flex justify-center rounded-2xl bg-white p-3">
              <img src={qrSrc} alt="Two-factor QR code" className="h-44 w-44" />
            </div>
          )}
          {secret && (
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
                Or enter this key manually
              </div>
              <div className="font-mono text-xs text-ink break-all select-all">{secret}</div>
            </div>
          )}
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className={inputClass}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancelEnroll}
              disabled={busy}
              className="flex-1 py-3 rounded-2xl border border-border/60 text-ink font-bold text-xs hover:bg-card transition disabled:opacity-60"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={finishEnroll}
              disabled={busy}
              className="flex-1 py-3 rounded-2xl bg-accent text-zinc-950 font-bold text-xs hover:bg-amber-400 transition disabled:opacity-60"
            >
              {busy ? "Verifying…" : "CONFIRM"}
            </button>
          </div>
        </div>
      )}

      {status === "on" && (
        <>
          <p className="mb-3 text-xs text-ink-muted leading-relaxed">
            Two-factor is on. You'll enter a code from your authenticator app each
            time you sign in.
          </p>
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className="w-full py-3 text-sm font-bold text-error-text bg-error/10 border border-error/20 rounded-2xl hover:bg-error/20 transition disabled:opacity-60"
          >
            {busy ? "Working…" : "Turn off two-factor"}
          </button>
        </>
      )}

      {error && (
        <p className="mt-3 text-center text-sm font-medium text-error-text">{error}</p>
      )}
    </div>
  );
}
