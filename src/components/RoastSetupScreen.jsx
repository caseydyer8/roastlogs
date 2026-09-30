import React from "react";
import { EQUIPMENT_OPTIONS, equipmentHasProbe } from "../lib/equipment";
import { beanStock } from "../lib/inventory";

// The Roast tab's front door. Everything a roast needs decided BEFORE the beans
// go in -- bean, weight, level, profile, hardware, preheat target -- on one
// calm screen, so START (or BEGIN PREHEAT) is the only thing left to do.
//
// Purely presentational: App.js owns every piece of state and passes it down,
// because the same values feed the live session, the save path and the
// mid-roast summary bar. This component reads the inventory itself (beans and
// roasts live in localStorage, not React state) but never writes to it.

function readJSON(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// Fan -> Heat, always. Steps carry `totalSeconds` or an "mm:ss" `time`.
function stepSeconds(step) {
  if (step.totalSeconds !== undefined) return Number(step.totalSeconds);
  const [mm, ss] = String(step.time || "").split(":").map(Number);
  return (mm || 0) * 60 + (ss || 0);
}

// The 0:00 step is what a profile wants the dials at when the beans go in.
export function profileStartStep(profile) {
  return (profile?.steps || []).find((s) => stepSeconds(s) === 0) || null;
}

function SectionLabel({ children, aside }) {
  return (
    <div className="mb-2 flex items-baseline justify-between px-1">
      <div className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">{children}</div>
      {aside}
    </div>
  );
}

const fieldClass =
  "w-full rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20";

export default function RoastSetupScreen({
  beanName,
  beanId,
  onPickBean,          // (bean | null) -> void ; null clears the link but keeps typed text
  onBeanNameChange,    // free-text edit, always unlinks
  greenWeightGrams,
  onWeightChange,
  targetRoastLevel,
  roastLevels,
  onLevelChange,
  profiles,
  profileFollowing,
  manualChosen,
  onChooseProfile,     // (profile) -> void
  onChooseManual,      // () -> void
  onBuildProfile,
  startingSettings,    // node: the Fan / Heat / Temp cockpit tiles, owned by App
  equipmentSetup,
  onEquipmentChange,
  preheatTarget,
  onPreheatTargetChange,
  probeLive,
  saveSuccess,
  onPrimary,
}) {
  const beans = React.useMemo(() => readJSON("beans"), []);
  const roasts = React.useMemo(() => readJSON("roasts"), []);
  const hasProbe = equipmentHasProbe(equipmentSetup);

  // A bean with a link is "picked"; typed text with no link is free-hand.
  const linked = beans.find((b) => beanId != null && Number(b.id) === Number(beanId)) || null;
  const [freeHand, setFreeHand] = React.useState(() => !linked && !!beanName);

  // A name carried in from before Setup existed (or a reload) that exactly
  // matches one bean gets linked, so its roast deducts from the right bag.
  React.useEffect(() => {
    if (beanId != null || !beanName) return;
    const matches = beans.filter((b) => b.name === beanName);
    if (matches.length === 1) {
      onPickBean(matches[0]);
      setFreeHand(false);
    }
  }, []);

  const rows = beans
    .map((b) => ({ bean: b, stock: beanStock(b, roasts) }))
    .sort((a, b) => (b.stock > 0) - (a.stock > 0) || String(a.bean.name).localeCompare(String(b.bean.name)));

  const weight = Number(greenWeightGrams) || 0;
  const stockAfter = linked ? Math.max(0, beanStock(linked, roasts) - weight) : null;

  // Profiles that apply: everything until a bean is named, then that bean's plus
  // the generic ones. The bean's default floats up and is badged, never pre-picked.
  const usable = (profiles || [])
    .filter((p) => !beanName || !p.beanName || p.beanName === beanName)
    .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
  const noProfiles = usable.length === 0;
  const profileChosen = !!profileFollowing || manualChosen || noProfiles;

  const primaryLabel = !hasProbe ? "Start roast" : probeLive ? "Begin preheat" : "Continue";
  const ready = profileChosen;

  return (
    <div className="space-y-5" data-testid="roast-setup">
      <div className="px-1 pt-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-text">Roast setup</div>
        <h1 className="mt-1 font-cond text-3xl font-bold leading-tight text-ink">What are we roasting?</h1>
      </div>

      {saveSuccess && (
        <div className="rounded-2xl border border-success/40 bg-success/10 px-4 py-3 text-center text-sm font-bold text-success-text">
          Roast saved to history — last setup carried forward.
        </div>
      )}

      {/* 1) BEAN */}
      <section>
        <SectionLabel>Bean</SectionLabel>
        <div className="overflow-hidden rounded-3xl border border-border/60 bg-surface/30 divide-y divide-border/40">
          {rows.length > 0 && (
            <div className="max-h-64 overflow-y-auto divide-y divide-border/40">
              {rows.map(({ bean, stock }) => {
                const selected = !freeHand && linked && Number(linked.id) === Number(bean.id);
                return (
                  <button
                    key={bean.id}
                    type="button"
                    onClick={() => {
                      setFreeHand(false);
                      onPickBean(bean);
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
                      selected ? "bg-accent/10" : "hover:bg-surface/60"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className={`truncate font-cond text-base font-bold ${selected ? "text-accent-text" : "text-ink"}`}>
                        {bean.name}
                      </div>
                      {bean.origin && <div className="truncate text-[11px] text-ink-muted">{bean.origin}</div>}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`font-mono text-lg font-bold tabular-nums ${stock > 0 ? "text-ink" : "text-ink-muted"}`}>
                        {stock}
                        <span className="ml-0.5 text-[10px] font-medium text-ink-muted">g</span>
                      </div>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-ink-muted">left</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setFreeHand(true);
              onPickBean(null);
            }}
            className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold transition ${
              freeHand ? "bg-accent/10 text-accent-text" : "text-ink-muted hover:bg-surface/60 hover:text-ink"
            }`}
          >
            Not in my inventory
            <span className="text-[10px] font-bold uppercase tracking-widest">Type it in</span>
          </button>
          {freeHand && (
            <div className="p-3">
              <input
                value={beanName}
                onChange={(e) => onBeanNameChange(e.target.value)}
                type="text"
                placeholder="e.g., Ethiopia Yirgacheffe"
                aria-label="Bean name"
                className={fieldClass}
              />
            </div>
          )}
        </div>
      </section>

      {/* 2) WEIGHT + LEVEL */}
      <section className="grid grid-cols-5 gap-3">
        <div className="col-span-2">
          <SectionLabel>Green weight</SectionLabel>
          <div className="rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20">
            <div className="flex items-baseline gap-1">
              <input
                value={greenWeightGrams}
                onChange={(e) => onWeightChange(e.target.value)}
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="250"
                aria-label="Green weight in grams"
                className="w-full bg-transparent font-mono text-2xl font-bold tabular-nums text-ink outline-none placeholder:text-ink-muted"
              />
              <span className="text-xs font-medium text-ink-muted">g</span>
            </div>
          </div>
          {stockAfter !== null && weight > 0 && (
            <div className="mt-1.5 px-1 text-[11px] text-ink-muted">
              <span className="font-mono font-bold text-ink">{stockAfter}g</span> left after this roast
            </div>
          )}
        </div>
        <div className="col-span-3">
          <SectionLabel>Target level</SectionLabel>
          <select
            value={targetRoastLevel}
            onChange={(e) => onLevelChange(e.target.value)}
            aria-label="Target roast level"
            className={`${fieldClass} h-[62px]`}
          >
            {roastLevels.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* 3) PROFILE -- chosen on purpose, every roast */}
      <section>
        <SectionLabel
          aside={
            <button
              type="button"
              onClick={onBuildProfile}
              className="text-[10px] font-bold uppercase tracking-widest text-accent-text hover:brightness-110"
            >
              + Build new
            </button>
          }
        >
          Profile
        </SectionLabel>
        <div className="space-y-2">
          {usable.map((p) => {
            const selected = profileFollowing && String(profileFollowing.id) === String(p.id);
            const start = profileStartStep(p);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChooseProfile(p)}
                aria-pressed={!!selected}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  selected
                    ? "border-accent/60 bg-accent/10"
                    : "border-border/60 bg-surface/30 hover:bg-surface/60"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`truncate font-cond text-base font-bold ${selected ? "text-accent-text" : "text-ink"}`}>
                    {p.name}
                  </span>
                  {p.isDefault && (
                    <span className="rounded bg-accent px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-zinc-950">
                      Default
                    </span>
                  )}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-ink-muted">
                  {(p.steps || []).length} {(p.steps || []).length === 1 ? "step" : "steps"}
                  {start && ` · starts F:${start.fan} · H:${start.heat}`}
                  {p.beanName ? ` · ${p.beanName}` : ""}
                </div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onChooseManual}
            aria-pressed={manualChosen && !profileFollowing}
            className={`w-full rounded-2xl border px-4 py-3 text-left font-cond text-base font-bold transition ${
              manualChosen && !profileFollowing
                ? "border-accent/60 bg-accent/10 text-accent-text"
                : "border-border/60 bg-surface/30 text-ink hover:bg-surface/60"
            }`}
          >
            Manual roast
            <span className="ml-2 font-sans text-[11px] font-normal text-ink-muted">no profile — I'll drive it</span>
          </button>
        </div>
      </section>

      {/* 4) STARTING SETTINGS -- Fan -> Heat -> Temp; a profile fills these in */}
      <section>
        <SectionLabel>Starting settings</SectionLabel>
        <div className="grid grid-cols-3 gap-3">{startingSettings}</div>
      </section>

      {/* 5) EQUIPMENT (+ preheat target when there is a probe to preheat by) */}
      <section>
        <SectionLabel>Equipment</SectionLabel>
        <div className="space-y-3 rounded-3xl border border-border/60 bg-surface/30 p-4">
          <select
            value={equipmentSetup}
            onChange={(e) => onEquipmentChange(e.target.value)}
            aria-label="Roaster setup"
            className={fieldClass}
          >
            {EQUIPMENT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          {hasProbe ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-ink">Preheat target</div>
                <div className={`text-[11px] ${probeLive ? "text-success-text" : "text-ink-muted"}`}>
                  {probeLive ? "RoastLink live" : "Waiting for RoastLink"}
                </div>
              </div>
              <div className="flex items-baseline gap-1 rounded-2xl border border-border/70 bg-primary/40 px-3 py-2 focus-within:border-accent/60">
                <input
                  value={preheatTarget}
                  onChange={(e) => onPreheatTargetChange(Number(e.target.value) || 0)}
                  type="number"
                  inputMode="numeric"
                  aria-label="Preheat target in degrees Fahrenheit"
                  className="w-16 bg-transparent text-right font-mono text-xl font-bold tabular-nums text-ink outline-none"
                />
                <span className="text-xs font-medium text-ink-muted">°F</span>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-ink-muted">No probe on this setup — preheat is skipped, START goes straight to the roast.</div>
          )}
        </div>
      </section>

      {/* PRIMARY */}
      <div className="pb-2">
        <button
          type="button"
          onClick={onPrimary}
          disabled={!ready}
          className="w-full rounded-3xl bg-accent px-4 py-4 font-cond text-lg font-bold uppercase tracking-[0.08em] text-zinc-950 shadow-sm transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {primaryLabel}
        </button>
        {!ready && (
          <div className="mt-2 text-center text-[11px] text-ink-muted">Pick a profile, or choose Manual roast.</div>
        )}
      </div>
    </div>
  );
}
