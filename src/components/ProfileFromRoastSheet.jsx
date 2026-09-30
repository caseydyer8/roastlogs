import React from "react";
import { planFromRoast, formatMMSS } from "../lib/profileFromRoast";

// The two moments a finished roast can feed a profile:
//
//   mode="saved"    right after SAVE ROAST. The roast is already written, so this
//                   only ever ADDS a profile -- dismissing it can never lose one.
//   mode="history"  after saving an edit to a roast some profile was built from,
//                   offering to bring the profile back in line.
//
// Purely presentational: App.js owns the profiles and does the writing.

const SHORT = { YELLOWING: "Yellowing", "FIRST CRACK": "First crack", "COOLING START": "Drop" };

function planSummary(roast) {
  const { steps, milestones } = planFromRoast(roast);
  const bits = [`${steps.length} ${steps.length === 1 ? "step" : "steps"}`];
  milestones
    .filter((m) => SHORT[m.label])
    .forEach((m) => bits.push(`${SHORT[m.label]} ${formatMMSS(m.t)}`));
  return bits.join(" · ");
}

const primary =
  "w-full rounded-2xl bg-accent py-3.5 font-cond text-base font-bold uppercase tracking-[0.06em] text-zinc-950 shadow-sm transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40";
const secondary =
  "w-full rounded-2xl border border-border/70 bg-surface/40 py-3.5 font-cond text-base font-bold uppercase tracking-[0.06em] text-ink transition hover:bg-surface/70 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40";

export default function ProfileFromRoastSheet({
  mode,               // "saved" | "history"
  roast,
  followedProfile,    // the profile this roast followed, if it still exists ("saved" only)
  linkedProfile,      // the profile built from this roast ("history" only)
  defaultName,
  onSaveNew,          // (name) -> void
  onUpdate,           // () -> void   updates followedProfile / linkedProfile
  onDismiss,
}) {
  const [name, setName] = React.useState(defaultName || "");
  const trimmed = name.trim();
  const summary = planSummary(roast);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-primary/80 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "history" ? "Update profile" : "Save as profile"}
      data-testid="profile-from-roast"
    >
      <div className="w-full max-w-sm animate-in slide-in-from-bottom-4 duration-200 rounded-3xl border border-border/60 bg-surface p-5 shadow-2xl">
        {mode === "saved" ? (
          <>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-success-text">Roast saved</div>
            <h3 className="mt-1 font-cond text-2xl font-bold text-ink">Keep this as a profile?</h3>
            <p className="mt-1 text-xs text-ink-muted">
              {followedProfile ? (
                <>
                  You changed the plan from <span className="font-bold text-ink">{followedProfile.name}</span> during this roast.
                </>
              ) : (
                "Save what you did — Fan and Heat by time, plus every milestone — so you can roast it again."
              )}
            </p>
          </>
        ) : (
          <>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-text">Roast edited</div>
            <h3 className="mt-1 font-cond text-2xl font-bold text-ink">Update the profile too?</h3>
            <p className="mt-1 text-xs text-ink-muted">
              <span className="font-bold text-ink">{linkedProfile?.name}</span> was saved from this roast, and the edit changes its plan.
            </p>
          </>
        )}

        <div className="mt-3 rounded-2xl border border-border/60 bg-primary/30 px-3 py-2 font-mono text-[11px] text-ink-muted">{summary}</div>

        {mode === "saved" && (
          <label className="mt-3 block">
            <div className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
              {followedProfile ? "Name (for a new profile)" : "Profile name"}
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              type="text"
              aria-label="Profile name"
              className="mt-1.5 w-full rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 text-sm text-ink focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </label>
        )}

        <div className="mt-4 space-y-2">
          {mode === "saved" && followedProfile && (
            <button type="button" onClick={onUpdate} className={primary}>
              Update {followedProfile.name}
            </button>
          )}
          {mode === "saved" && (
            <button
              type="button"
              onClick={() => onSaveNew(trimmed)}
              disabled={!trimmed}
              className={followedProfile ? secondary : primary}
            >
              {followedProfile ? "Save as new profile" : "Save profile"}
            </button>
          )}
          {mode === "history" && (
            <button type="button" onClick={onUpdate} className={primary}>
              Update profile
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="w-full py-2.5 text-xs font-bold uppercase tracking-widest text-ink-muted transition hover:text-ink"
          >
            {mode === "history" ? "Not now" : "No thanks"}
          </button>
        </div>
      </div>
    </div>
  );
}
