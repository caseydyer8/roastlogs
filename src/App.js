import RoastCurveChart from "./components/charts/RoastCurveChart";
import React from "react";
import { syncRoastToSupabase, deleteRoastFromSupabase, fetchRoastsFromSupabase, syncBrewToSupabase, deleteBrewFromSupabase, fetchBrewsFromSupabase, syncBeanToSupabase, deleteBeanFromSupabase, fetchBeansFromSupabase } from "./syncService";
import { useAuth } from "./contexts/AuthContext";
import { useUnits } from "./hooks/useUnits"; // IDEA-009: units of measure

// Settings is reached via the gear icon in the header (locked decision), not the bottom nav.
const TABS = ["Roast", "History", "Brew", "Beans"];

const EMPTY_BEAN_FORM = {
  name: "",
  baggedName: "",
  origin: "",
  region: "",
  producer: "",
  variety: "",
  process: "",
  masl: "",
  sourcedFrom: "",
  purchaseDate: "",
  purchaseWeight: "",
  tastingTargets: ""
};

// toISOString() reports UTC, which drifts a day off local date near midnight
// in negative-UTC-offset zones — build the date string from local getters instead.
function todayLocalDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CoffeeIcon({ active, sizeClass = "h-6 w-6" }) {
  const fillColor = active ? "rgb(var(--accent-text))" : "rgb(var(--text-muted))"; // theme-aware: darker amber on light, muted gray/brown inactive
  const creaseColor = active ? "rgb(var(--accent-fill))" : "rgb(var(--border-color))"; // theme-aware highlight tone

  return (
    <svg
      aria-hidden="true"
      className={sizeClass}
      viewBox="0 0 24 24"
      fill="none"
    >
      {/* Mug body — bold fill, same silhouette weight as the other icons */}
      <path
        d="M4 7.5c0-1.2 1-2.2 2.2-2.2h10.1a2.2 2.2 0 0 1 2.2 2.2v8.2a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V7.5z"
        style={{ fill: fillColor }}
      />
      {/* Handle */}
      <path
        d="M18.5 9.3h1a3.2 3.2 0 0 1 3.2 3.2v1a3.2 3.2 0 0 1-3.2 3.2h-1"
        style={{ stroke: fillColor }}
        strokeWidth="1.8"
        fill="none"
      />
      {/* Liquid line — thin accent detail, mirrors the Bean crease */}
      <path
        d="M6.3 9.3h9.4"
        style={{ stroke: creaseColor }}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RoasterIcon({ active, sizeClass = "h-6 w-6" }) {
  const outerFill = active ? "rgb(var(--accent-text))" : "rgb(var(--text-muted))"; // theme-aware: darker amber on light, muted gray/brown inactive
  const innerFill = active ? "rgb(var(--accent-fill))" : "rgb(var(--border-color))"; // theme-aware highlight tone

  return (
    <svg
      aria-hidden="true"
      className={sizeClass}
      viewBox="0 0 24 24"
      fill="none"
    >
      {/* Original two-teardrop flame, scaled up ~1.2x around center to match the current icon set's size */}
      <g transform="translate(-2.4 -2.4) scale(1.2)">
        {/* Outer flame - teardrop with rounded bottom lobes */}
        <path
          d="M12 3c-1.3 2-3.4 4.3-4.4 6.4-.7 1.5-1 3-.9 4.2.1 1.4.7 2.6 1.5 3.6.9 1.1 2.1 1.8 3.3 2 .3.1.6.1.9.1.3 0 .6 0 .9-.1 1.2-.2 2.4-.9 3.3-2 .8-1 1.4-2.2 1.5-3.6.1-1.2-.2-2.7-.9-4.2C15.4 7.3 13.3 5 12 3Z"
          style={{ fill: outerFill }}
        />
        {/* Inner flame - smaller, centered teardrop */}
        <path
          d="M12 6c-1 1.5-2.4 3.1-3.1 4.7-.5 1.1-.7 2.1-.6 3.1.1 1 .5 1.9 1.1 2.7.7.8 1.6 1.3 2.5 1.4.2 0 .4.1.6.1.2 0 .4 0 .6-.1.9-.1 1.8-.6 2.5-1.4.6-.8 1-1.7 1.1-2.7.1-1-.1-2-.6-3.1C14.4 9.1 13 7.5 12 6Z"
          style={{ fill: innerFill }}
        />
      </g>
    </svg>
  );
}

function ClockIcon({ active, sizeClass = "h-6 w-6" }) {
  const fillColor = active ? "rgb(var(--accent-text))" : "rgb(var(--text-muted))"; // theme-aware: darker amber on light, muted gray/brown inactive
  const creaseColor = active ? "rgb(var(--accent-fill))" : "rgb(var(--border-color))"; // theme-aware highlight tone

  return (
    <svg
      aria-hidden="true"
      className={sizeClass}
      viewBox="0 0 24 24"
      fill="none"
    >
      {/* Clock face — bold fill, same silhouette weight as the other icons */}
      <circle cx="12" cy="12" r="9" style={{ fill: fillColor }} />
      {/* Hands — thin accent detail, mirrors the Bean crease */}
      <path
        d="M12 7.5V12l3.2 1.8"
        style={{ stroke: creaseColor }}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function BeanIcon({ active, sizeClass = "h-6 w-6" }) {
  const fillColor = active ? "rgb(var(--accent-text))" : "rgb(var(--text-muted))"; // theme-aware: darker amber on light, muted gray/brown inactive
  const creaseColor = active ? "rgb(var(--accent-fill))" : "rgb(var(--border-color))"; // theme-aware highlight tone

  return (
    <svg
      aria-hidden="true"
      className={sizeClass}
      viewBox="0 0 24 24"
      fill="none"
    >
      {/* Bean body — bold silhouette, sized to match the other icons */}
      <ellipse cx="12" cy="12" rx="7.2" ry="9.5" style={{ fill: fillColor }} />
      {/* Central S-curve crease */}
      <path
        d="M12 5.5c-1.4 2.1-2.3 4.3-2.3 6.5s.9 4.4 2.3 6.5"
        style={{ stroke: creaseColor }}
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function GearIcon({ active, sizeClass = "h-6 w-6" }) {
  const bodyColor = active ? "rgb(var(--accent-text))" : "rgb(var(--text-muted))"; // theme-aware: darker amber on light, muted gray/brown inactive
  const innerRingColor = active ? "rgb(var(--accent-fill))" : "rgb(var(--border-color))"; // theme-aware highlight tone

  return (
    <svg
      aria-hidden="true"
      className={sizeClass}
      viewBox="0 0 24 24"
      fill="none"
    >
      {/* Outer gear ring (washer-like body) — bumped up from the original r=7/stroke=4 to match the bolder set */}
      <circle cx="12" cy="12" r="7.5" style={{ stroke: bodyColor }} strokeWidth="4.5" fill="none" />
      {/* 8 teeth, restored from the original design */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <rect
          key={deg}
          x="10.4"
          y="1.2"
          width="3.2"
          height="3.8"
          rx="1.2"
          style={{ fill: bodyColor }}
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
      {/* Inner highlight ring */}
      <circle cx="12" cy="12" r="4.3" style={{ stroke: innerRingColor }} strokeWidth="1.4" fill="none" />
    </svg>
  );
}

// Build Profile card icon — 3 slider tracks with handles, "preparatory/planning"
// counterpart to the active-roast flame. Stroke-only to match the icon it
// replaces; same theme-aware accent tone as the flame's active color.
function SliderIcon({ sizeClass = "h-6 w-6" }) {
  const strokeColor = "rgb(var(--accent-text))";

  return (
    <svg
      aria-hidden="true"
      className={sizeClass}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path d="M4 6h16" style={{ stroke: strokeColor }} strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="6" r="2" style={{ stroke: strokeColor }} strokeWidth="2" />
      <path d="M4 12h16" style={{ stroke: strokeColor }} strokeWidth="2" strokeLinecap="round" />
      <circle cx="13" cy="12" r="2" style={{ stroke: strokeColor }} strokeWidth="2" />
      <path d="M4 18h16" style={{ stroke: strokeColor }} strokeWidth="2" strokeLinecap="round" />
      <circle cx="18" cy="18" r="2" style={{ stroke: strokeColor }} strokeWidth="2" />
    </svg>
  );
}

function TabButton({ label, active, onClick }) {
  let Icon;
  if (label === "Roast") Icon = RoasterIcon;
  else if (label === "Brew") Icon = CoffeeIcon;
  else if (label === "History") Icon = ClockIcon;
  else if (label === "Beans") Icon = BeanIcon;
  else if (label === "Settings") Icon = GearIcon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 text-xs font-medium transition",
        active
          ? "bg-accent/15 text-accent-text ring-1 ring-accent/30"
          : "text-ink hover:bg-surface/60 hover:text-ink",
      ].join(" ")}
      aria-current={active ? "page" : undefined}
    >
      {Icon && <Icon active={active} sizeClass="h-6 w-6" />}
      <span className="text-[13px] leading-none">{label}</span>
    </button>
  );
}

function NumberPad({ value, onDigit, onDelete, onDone, label }) {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/80 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-200 sm:rounded-3xl sm:border sm:border-border/60 sm:bg-surface sm:p-6">
        <div className="bg-surface p-6 pb-10 sm:p-0">
          <div className="mb-6 text-center">
            <div className="text-xs font-medium uppercase tracking-wider text-ink-muted">{label}</div>
            <div className="mt-2 text-4xl font-bold tracking-tight text-accent-text">
              {value || "—"}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {digits.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDigit(String(d))}
                className="flex h-16 items-center justify-center rounded-2xl bg-surface/50 text-2xl font-semibold text-ink transition active:bg-card active:scale-95"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={onDelete}
              className="flex h-16 items-center justify-center rounded-2xl bg-surface/50 text-xl font-semibold text-ink-muted transition active:bg-card active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-backspace"><path d="M9 19c-5 0-7-3-7-3s2-3 7-3h11a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H9Z"/><path d="m12 15 4 4"/><path d="m16 15-4 4"/></svg>
            </button>
            <button
              type="button"
              onClick={() => onDigit("0")}
              className="flex h-16 items-center justify-center rounded-2xl bg-surface/50 text-2xl font-semibold text-ink transition active:bg-card active:scale-95"
            >
              0
            </button>
            <button
              type="button"
              onClick={onDone}
              className="flex h-16 items-center justify-center rounded-2xl bg-accent text-lg font-bold text-zinc-950 transition active:bg-amber-400 active:scale-95"
            >
              DONE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenCard({ title, subtitle, children }) {
  return (
    <section className="rounded-3xl border border-border/60 bg-surface/30 p-5 shadow-[0_0_0_1px_rgba(0,0,0,0.2)]">
      <div className="text-xs font-medium uppercase tracking-wider text-ink-muted">{subtitle}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-ink">{title}</div>
      <div className="mt-4 text-sm leading-6 text-ink">{children}</div>
    </section>
  );
}

function PrimaryButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-accent/90"
    >
      {children}
    </button>
  );
}

// Semantic roast-level color spectrum (light tan → dark roast) — separate from the amber
// brand accent; used only where the color MEANS roast level (History rows, level chips).
const ROAST_LEVEL_COLORS = {
  "Cinnamon (Light+)": "#e8c99a",
  "City (Light)": "#c98f52",
  "City+ (Light-Medium)": "#a56a3a",
  "Full City (Medium)": "#8a5230",
  "Full City+ (Medium-Dark)": "#7a482b",
  "Vienna (Dark)": "#6b4226",
  "French (Very Dark)": "#5a3620",
  "Italian (Darkest)": "#4a2c1a",
};
const roastLevelColor = (level) => ROAST_LEVEL_COLORS[level] || "#c98f52";

// Display-only shortening for History list rows: keep "Country Region Process",
// drop varietal/lot codes, years, and trailing detail so rows scan cleanly.
// e.g. "Ethiopia Duwancho Natural Variety: 74148, 74110" → "Ethiopia Duwancho Natural".
// The stored name is never changed — detail views always show the full name.
const shortBeanName = (name) => {
  if (!name) return name;
  let s = String(name).split(/[:([]/)[0];                 // cut at ":" "(" "["
  s = s.replace(/[\s,·—–-]+$/g, "");                      // trailing separators
  s = s.replace(/\b(19|20)\d{2}$/, "").trim();            // trailing year
  s = s.replace(/\b(variety|varietal|lot|grade|selection|no\.?)$/i, "").trim();
  const isStopWord = (w) => /^(el|la|los|las|de|del|da|do|dos|the|of|and|y|e)$/i.test(w);
  const words = s.split(/\s+/);
  while (words.join(" ").length > 30 && words.length > 2) words.pop();
  while (words.length > 1 && isStopWord(words[words.length - 1])) words.pop();
  return words.join(" ") || name;
};

// fill: 0 | 0.5 | 1 — half fill uses a hard-stop gradient on the star polygon.
function Star({ fill, size = 14 }) {
  // Strip the colons useId emits — SVG url(#…) fragment ids must be safe on all
  // browsers (iOS Safari included), and ":r1:" is a risky fragment identifier.
  const gradId = `star-half-${React.useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {fill === 0.5 && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="50%" style={{ stopColor: "rgb(var(--accent-text))" }} />
            <stop offset="50%" style={{ stopColor: "transparent" }} />
          </linearGradient>
        </defs>
      )}
      <polygon
        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
        style={{
          fill: fill >= 1 ? "rgb(var(--accent-text))" : fill >= 0.5 ? `url(#${gradId})` : "none",
          stroke: fill > 0 ? "rgb(var(--accent-text))" : "rgb(var(--border-color))",
        }}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Read-only star display; supports half-star values (e.g. 3.5). Integer ratings render unchanged.
function StarRow({ rating, size = 14 }) {
  const r = Number(rating) || 0;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} size={size} fill={r >= star ? 1 : r >= star - 0.5 ? 0.5 : 0} />
      ))}
    </div>
  );
}

// Half-star input: each star has two tap zones — left half = x.5, right half = x.0.
function StarRatingInput({ value, onChange }) {
  const r = Number(value) || 0;
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <div key={star} className="relative transition active:scale-90">
          <Star size={40} fill={r >= star ? 1 : r >= star - 0.5 ? 0.5 : 0} />
          <button
            type="button"
            aria-label={`${star - 0.5} stars`}
            onClick={() => onChange(star - 0.5)}
            className="absolute inset-y-0 left-0 w-1/2"
          />
          <button
            type="button"
            aria-label={`${star} stars`}
            onClick={() => onChange(star)}
            className="absolute inset-y-0 right-0 w-1/2"
          />
        </div>
      ))}
    </div>
  );
}

// Replace-on-type for the 1-9 dial inputs: the LAST typed character wins ("5" then "7"
// becomes "7", not a swallowed keystroke), and anything outside 1-9 (incl. 0) clears.
const dialDigit = (raw) => {
  const d = String(raw).slice(-1);
  return /^[1-9]$/.test(d) ? d : "";
};

// Editable cockpit tile — the Fan/Heat/Temp starting inputs on session setup.
// (The live hero readout uses its own inline tappable row per the mockup.)
function CockpitTile({ label, value, accent = false, onChange }) {
  const valueClass = `text-2xl font-black tabular-nums ${accent ? "text-accent-text" : "text-ink"}`;
  return (
    <label className="block rounded-2xl border border-border/70 bg-primary/40 px-2 py-3 text-center transition focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20">
      <div className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">{label}</div>
      <input
        value={value}
        onChange={onChange}
        type="number"
        inputMode="numeric"
        placeholder="—"
        className={`mt-1 w-full bg-transparent text-center outline-none placeholder:text-ink-muted ${valueClass}`}
      />
    </label>
  );
}

// Dashed-amber "bag label" shell shared by the Brew summary and both tasting-detail views.
function BagLabelCard({ className = "", children }) {
  return (
    <section className={`rounded-3xl border border-border/60 p-6 shadow-xl ${className}`}>
      <div className="flex flex-col items-center border-y-2 border-dashed border-accent/40 py-5 text-center">
        {children}
      </div>
    </section>
  );
}

// Compact –/+ stepper for the discrete 1-9 Fan/Heat dials (Profile Builder).
function Stepper({ label, value, onChange }) {
  const v = Math.min(9, Math.max(1, parseInt(value, 10) || 5));
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase text-ink-muted font-bold ml-1">{label}</span>
      <div className="flex items-center overflow-hidden rounded-xl border border-border bg-surface">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(String(Math.max(1, v - 1)))}
          className="flex h-11 w-11 shrink-0 items-center justify-center text-xl font-bold text-ink transition active:bg-surface active:scale-95"
        >
          –
        </button>
        <div className="flex-1 text-center font-mono text-lg font-bold tabular-nums text-accent-text">{v}</div>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(String(Math.min(9, v + 1)))}
          className="flex h-11 w-11 shrink-0 items-center justify-center text-xl font-bold text-ink transition active:bg-surface active:scale-95"
        >
          +
        </button>
      </div>
    </div>
  );
}

// One tappable MM:SS chip per profile step — opens a single picker with both wheels.
function TimeChipColumn({ values, selected, onPick, itemHeight, visibleCount }) {
  const listRef = React.useRef(null);
  React.useEffect(() => {
    if (listRef.current) {
      const idx = values.indexOf(selected);
      if (idx >= 0) {
        listRef.current.scrollTop = Math.max(0, (idx - Math.floor(visibleCount / 2)) * itemHeight);
      }
    }
  }, []);
  return (
    <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain" style={{ height: itemHeight * visibleCount }}>
      {values.map((v) => (
        <div
          key={v}
          style={{ height: itemHeight }}
          className={`flex cursor-pointer select-none items-center justify-center text-xl font-bold transition-colors ${
            v === selected ? "text-accent-text" : "text-ink"
          }`}
          onClick={() => onPick(v)}
        >
          {String(v).padStart(2, "0")}
        </div>
      ))}
    </div>
  );
}

function TimeChip({ totalSeconds, onChange }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const secs = Math.max(0, Math.floor(totalSeconds || 0));
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  const display = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const ITEM_HEIGHT = 52;
  const VISIBLE_COUNT = 5;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="h-11 rounded-xl border border-border bg-surface px-3 text-center font-mono text-sm font-bold text-ink transition active:bg-surface active:scale-95"
      >
        {display}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-primary/85 p-4 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-3xl border border-border/60 bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border/60 px-4 py-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">STEP TIME (MM:SS)</span>
            </div>
            <div className="relative">
              <div
                className="pointer-events-none absolute left-0 right-0 z-10 border-b border-t border-accent/25 bg-accent/10"
                style={{ height: ITEM_HEIGHT, top: ITEM_HEIGHT * Math.floor(VISIBLE_COUNT / 2) }}
              />
              <div className="flex">
                <TimeChipColumn
                  values={Array.from({ length: 26 }, (_, i) => i)}
                  selected={mm}
                  onPick={(v) => onChange(v * 60 + ss)}
                  itemHeight={ITEM_HEIGHT}
                  visibleCount={VISIBLE_COUNT}
                />
                <div className="flex items-center font-mono text-xl font-bold text-ink-muted">:</div>
                <TimeChipColumn
                  values={Array.from({ length: 60 }, (_, i) => i)}
                  selected={ss}
                  onPick={(v) => onChange(mm * 60 + v)}
                  itemHeight={ITEM_HEIGHT}
                  visibleCount={VISIBLE_COUNT}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="m-4 w-[calc(100%-2rem)] rounded-2xl bg-accent py-3 text-sm font-bold text-zinc-950 transition active:scale-[0.98]"
            >
              DONE
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ProfileBuilder({ bean, onSave, onCancel }) {
  const [profile, setProfile] = React.useState({ name: "", steps: [], isDefault: false, notes: "" });

  const formatMMSS = (totalSeconds) => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const addStep = () => {
    setProfile(prev => ({
      ...prev,
      steps: [...prev.steps, { totalSeconds: 0, heat: "5", fan: "5" }]
    }));
  };

  const updateStep = (idx, field, value) => {
    const newSteps = [...profile.steps];
    newSteps[idx] = { ...newSteps[idx], [field]: value };
    setProfile(prev => ({ ...prev, steps: newSteps }));
  };

  const handleSave = () => {
    // Sort steps by totalSeconds before saving
    const finalProfile = {
      ...profile,
      steps: [...profile.steps]
        .map(step => ({
          time: formatMMSS(step.totalSeconds),
          totalSeconds: step.totalSeconds,
          heat: step.heat,
          fan: step.fan
        }))
        .sort((a, b) => a.totalSeconds - b.totalSeconds)
    };
    onSave(finalProfile);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-in zoom-in-95 duration-200 rounded-3xl border border-border/60 bg-surface p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <h3 className="text-xl font-bold text-ink mb-4">Profile Builder {bean ? `for ${bean.name}` : ""}</h3>
        <input
          placeholder="Profile Name (e.g. Light Roast)"
          value={profile.name}
          onChange={e => setProfile({...profile, name: e.target.value})}
          className="w-full rounded-xl bg-primary/40 border border-border px-4 py-3 mb-4 text-sm text-ink"
        />
        <textarea
          placeholder="Notes (optional) — tasting result, what you'd change next time..."
          value={profile.notes}
          onChange={e => setProfile({...profile, notes: e.target.value})}
          rows={3}
          className="w-full rounded-xl bg-primary/40 border border-border px-4 py-3 mb-4 text-sm text-ink resize-none"
        />
        <div className="space-y-3 mb-6">
          {profile.steps.length > 0 && (
            <div className="text-[10px] font-bold uppercase tracking-widest text-ink-muted ml-1">
              Steps are sorted by time when saved
            </div>
          )}
          {profile.steps.map((step, idx) => (
            <div key={idx} className="flex gap-2 items-end bg-primary/20 p-3 rounded-2xl border border-border/40">
              {/* Time: one tappable MM:SS chip */}
              <div className="flex flex-col gap-1 shrink-0">
                <span className="text-[10px] uppercase text-ink-muted font-bold ml-1">Time</span>
                <TimeChip
                  totalSeconds={step.totalSeconds || 0}
                  onChange={(secs) => updateStep(idx, "totalSeconds", secs)}
                />
              </div>
              {/* Fan and Heat inline steppers (discrete 1-9) */}
              <div className="flex-1 grid grid-cols-2 gap-2">
                <Stepper label="Fan" value={step.fan} onChange={v => updateStep(idx, "fan", v)} />
                <Stepper label="Heat" value={step.heat} onChange={v => updateStep(idx, "heat", v)} />
              </div>
              <button
                aria-label="Remove step"
                onClick={() => setProfile({...profile, steps: profile.steps.filter((_, i) => i !== idx)})}
                className="text-error-text p-2 text-xl h-11 flex items-center"
              >×</button>
            </div>
          ))}
          <button onClick={addStep} className="w-full py-3 rounded-2xl border-2 border-dashed border-border text-ink-muted text-xs font-bold hover:border-border hover:text-ink-muted">+ ADD STEP</button>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-surface text-ink font-bold">CANCEL</button>
          <button onClick={handleSave} className="flex-1 py-3 rounded-2xl bg-accent text-zinc-950 font-bold">SAVE PROFILE</button>
        </div>
      </div>
    </div>
  );
}

function RoastModeDialog({ profiles, bean, onSelectManual, onSelectProfile, onCancel }) {
  // Filter profiles from the already-filtered props
  const beanSpecificProfiles = (profiles || []).filter(p => p.beanName && p.beanName !== "");
  const genericProfiles = (profiles || []).filter(p => !p.beanName || p.beanName === "");
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-in zoom-in-95 duration-200 rounded-3xl border border-border/60 bg-surface p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-ink mb-6 text-center">Start Roast</h3>
        <div className="space-y-3">
          {beanSpecificProfiles.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-accent-text ml-1">FOR THIS BEAN</div>
              {beanSpecificProfiles.map(p => (
                <button key={p.id} onClick={() => onSelectProfile(p)} className="w-full p-4 rounded-2xl bg-surface/50 border border-border/50 text-left hover:bg-surface transition">
                  <div className="font-bold text-ink">{p.name}</div>
                  <div className="text-[10px] text-ink-muted mt-1">{p.steps.length} steps</div>
                </button>
              ))}
            </div>
          )}
          
          {genericProfiles.length > 0 && (
            <div className="space-y-2">
              {beanSpecificProfiles.length > 0 && (
                <div className="text-[10px] font-bold uppercase tracking-widest text-ink-muted ml-1">GENERIC PROFILES</div>
              )}
              {genericProfiles.map(p => (
                <button key={p.id} onClick={() => onSelectProfile(p)} className="w-full p-4 rounded-2xl bg-surface/50 border border-border/50 text-left hover:bg-surface transition">
                  <div className="font-bold text-ink">{p.name}</div>
                  <div className="text-[10px] text-ink-muted mt-1">{p.steps.length} steps</div>
                </button>
              ))}
            </div>
          )}
          
          <div className="pt-2">
            <button onClick={onSelectManual} className="w-full p-4 rounded-2xl bg-accent/10 border border-accent/20 text-accent-text font-bold hover:bg-accent/20 transition">
              MANUAL ROAST
            </button>
          </div>
          <button onClick={onCancel} className="w-full py-3 text-ink-muted text-xs font-bold uppercase tracking-widest">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = React.useState("Roast");
  // IDEA-006: cross-component prefill for "Log a Session" from a Bean Detail view (no localStorage handoff)
  const [prefillBean, setPrefillBean] = React.useState(null);
  // IDEA-009: units of measure (display-layer only; stored values unchanged)
  const { tempUnit, weightUnit, setTempUnit, setWeightUnit, toDisplayTemp, toDisplayWeight } = useUnits();

  // Lightweight global toast used by Settings features (export/about/theme/forge)
  const [toast, setToast] = React.useState(null); // { message, type: 'success' | 'error' }
  const showToast = React.useCallback((message, type = "success") => {
    setToast({ message, type });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 3000);
  }, []);

  // IDEA-010: About modal
  const [showAboutModal, setShowAboutModal] = React.useState(false);
  // IDEA-007: Export Data panel
  const [showExportPanel, setShowExportPanel] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  // IDEA-008: Light/Dark theme (drives the Settings toggle UI; applied via data-theme)
  const [theme, setTheme] = React.useState(() => localStorage.getItem("roastlogs_theme") || "dark");

  const ROAST_LEVEL_OPTIONS = [
    "Cinnamon (Light+)",
    "City (Light)",
    "City+ (Light-Medium)",
    "Full City (Medium)",
    "Full City+ (Medium-Dark)",
    "Vienna (Dark)",
    "French (Very Dark)",
    "Italian (Darkest)",
  ];

  const formatTime = (totalSeconds) => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  // Live roast session state (Roast tab only)
  const [beanName, setBeanName] = React.useState(() => localStorage.getItem("live_beanName") || "");
  const [greenWeightGrams, setGreenWeightGrams] = React.useState(() => localStorage.getItem("live_greenWeightGrams") || "");
  const [targetRoastLevel, setTargetRoastLevel] = React.useState(() => localStorage.getItem("live_targetRoastLevel") || ROAST_LEVEL_OPTIONS[2]);

  const [startingHeat, setStartingHeat] = React.useState(() => localStorage.getItem("live_startingHeat") || "");
  const [startingFan, setStartingFan] = React.useState(() => localStorage.getItem("live_startingFan") || "");
  const [startingTemp, setStartingTemp] = React.useState(() => localStorage.getItem("live_startingTemp") || "");

  const [isTimerRunning, setIsTimerRunning] = React.useState(false);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(() => Number(localStorage.getItem("live_elapsedSeconds")) || 0);

  // New Development Timer state
  const [isDevTimerRunning, setIsDevTimerRunning] = React.useState(false);
  const [devSeconds, setDevSeconds] = React.useState(() => Number(localStorage.getItem("live_devSeconds")) || 0);
  const [firstCrackTime, setFirstCrackTime] = React.useState(() => Number(localStorage.getItem("live_firstCrackTime")) || null);
  const [coolingStartTime, setCoolingStartTime] = React.useState(() => Number(localStorage.getItem("live_coolingStartTime")) || null);

  const [roastLog, setRoastLog] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem("live_roastLog") || "[]");
    } catch (e) {
      console.warn("Failed to parse live_roastLog", e);
      return [];
    }
  });

  const [adjustments, setAdjustments] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem("live_adjustments") || "[]");
    } catch (e) {
      console.warn("Failed to parse live_adjustments", e);
      return [];
    }
  });

  const [activeProfile, setActiveProfile] = React.useState(null);
  const [nextProfileStep, setNextProfileStep] = React.useState(null);
  const [profileBuilder, setProfileBuilder] = React.useState({ name: "", steps: [], isDefault: false });
  const [isProfileBuilderOpen, setIsProfileBuilderOpen] = React.useState(false);
  const [editingProfileNotesId, setEditingProfileNotesId] = React.useState(null);
  const [profileNotesDraft, setProfileNotesDraft] = React.useState("");
  const [showRoastModeDialog, setShowRoastModeDialog] = React.useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = React.useState({ show: false, profileName: '', isDeleteAll: false });

  const [heat, setHeat] = React.useState("");
  const [fan, setFan] = React.useState("");
  const [temp, setTemp] = React.useState("");
  const [isAdjPopupOpen, setIsAdjPopupOpen] = React.useState(false);
  const [adjPopupTimestamp, setAdjPopupTimestamp] = React.useState(null);
  const [activeNumpad, setActiveNumpad] = React.useState(null); // 'heat', 'fan', or 'temp'
  
  // Roast Profile Logic
  const [profileFollowing, setProfileFollowing] = React.useState(null);
  const [currentProfileStepIdx, setCurrentProfileStepIdx] = React.useState(-1);
  const [profiles, setProfiles] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem("global_profiles") || "[]");
    } catch (e) {
      console.warn("Failed to parse global_profiles", e);
      return [];
    }
  });
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [selectedRoast, setSelectedRoast] = React.useState(null); // For history detail view

  // Brew session state
  const [brewStep, setBrewStep] = React.useState(0); // 0 = Setup, 1-7 = Wizard, 8 = Summary
  const [brewLinkedRoastId, setBrewLinkedRoastId] = React.useState("");
  const [brewBeanName, setBrewBeanName] = React.useState("");
  const [brewMethod, setBrewMethod] = React.useState("Pour Over");
  const [brewDevice, setBrewDevice] = React.useState("");
  const [brewRatio, setBrewRatio] = React.useState("1:16");
  const [brewGrindSize, setBrewGrindSize] = React.useState("Medium");
  const [brewTemp, setBrewTemp] = React.useState("");
  const [customRatio, setCustomRatio] = React.useState("");
  
  // New Tasting wizard state
  const [acidityRating, setAcidityRating] = React.useState(3);
  const [bodyRating, setBodyRating] = React.useState(3);
  const [selectedFamilies, setSelectedFamilies] = React.useState([]);
  const [selectedDescriptors, setSelectedDescriptors] = React.useState([]);
  const [expandedFruitType, setExpandedFruitType] = React.useState([]);
  const [selectedTastingNote, setSelectedTastingNote] = React.useState(null);
  const [showTastingHistory, setShowTastingHistory] = React.useState(false);
  const [historySegment, setHistorySegment] = React.useState("ROASTS");
  const [historySearch, setHistorySearch] = React.useState("");
  const [isEditingRoast, setIsEditingRoast] = React.useState(false);
  const [editedRoast, setEditedRoast] = React.useState(null);
  const [hasChanges, setHasChanges] = React.useState(false);
  const [showDiscardModal, setShowDiscardModal] = React.useState(false);
  // Styled delete confirmation (replaces native window.confirm): { type: 'roast' | 'tasting', id }
  const [confirmDelete, setConfirmDelete] = React.useState(null);
  const [syncStatus, setSyncStatus] = React.useState('idle'); // 'idle', 'syncing', 'success', 'error'

  // Photo feature removed 2026-07 (was brew-only, IndexedDB-only, never synced to Supabase).
  // Old records may still carry a `photo` key — it is simply ignored; orphaned IndexedDB
  // blobs in 'roastlogs-photos' are harmless.

  // Supabase sync on mount
  React.useEffect(() => {
    const performInitialSync = async () => {
      setSyncStatus('syncing');
      
      // Sync roasts
      const cloudRoasts = await fetchRoastsFromSupabase();
      
      if (!cloudRoasts || !Array.isArray(cloudRoasts)) {
        setSyncStatus('idle');
        return;
      }

      const localRoasts = (() => {
        try {
          const stored = localStorage.getItem("roasts");
          const parsed = JSON.parse(stored || "[]");
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          return [];
        }
      })();

      const mergedRoasts = [...localRoasts];
      let hasNewData = false;

      cloudRoasts.forEach(cloudRoast => {
        const localIndex = mergedRoasts.findIndex(r => Number(r.id) === Number(cloudRoast.id));
        if (localIndex === -1) {
          mergedRoasts.push(cloudRoast);
          hasNewData = true;
        }
      });

      if (hasNewData) {
        mergedRoasts.sort((a, b) => b.id - a.id);
        localStorage.setItem("roasts", JSON.stringify(mergedRoasts));
      }
      
      // Sync brews/tasting notes
      const cloudBrews = await fetchBrewsFromSupabase();
      
      if (cloudBrews && Array.isArray(cloudBrews)) {
        const localBrews = (() => {
          try {
            const stored = localStorage.getItem("tastingNotes");
            const parsed = JSON.parse(stored || "[]");
            return Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            return [];
          }
        })();

        const mergedBrews = [...localBrews];
        let hasNewBrewData = false;

        cloudBrews.forEach(cloudBrew => {
          const localIndex = mergedBrews.findIndex(b => Number(b.id) === Number(cloudBrew.id));
          if (localIndex === -1) {
            mergedBrews.push(cloudBrew);
            hasNewBrewData = true;
          }
        });

        if (hasNewBrewData) {
          mergedBrews.sort((a, b) => b.id - a.id);
          localStorage.setItem("tastingNotes", JSON.stringify(mergedBrews));
        }
      }

      // Sync beans
      const cloudBeans = await fetchBeansFromSupabase();

      if (cloudBeans && Array.isArray(cloudBeans)) {
        const localBeans = readLocalJSON("beans");
        const mergedBeans = [...localBeans];
        let hasNewBeanData = false;

        cloudBeans.forEach(cloudBean => {
          const localIndex = mergedBeans.findIndex(b => Number(b.id) === Number(cloudBean.id));
          if (localIndex === -1) {
            mergedBeans.push(cloudBean);
            hasNewBeanData = true;
          }
        });

        if (hasNewBeanData) {
          mergedBeans.sort((a, b) => b.id - a.id);
          localStorage.setItem("beans", JSON.stringify(mergedBeans));
        }
      }

      setSyncStatus((cloudRoasts.length > 0 || localRoasts.length > 0) ? 'success' : 'idle');
    };
    performInitialSync();
  }, []);

  const startEditing = (roast) => {
    setEditedRoast(JSON.parse(JSON.stringify(roast))); // Deep clone
    setHasChanges(false);
    setIsEditingRoast(true);
  };
  
  // Beans tab state
  const [beansView, setBeansView] = React.useState("list"); // 'list', 'addBean', 'editBean', 'beanDetail', 'roastDetail', 'tastingDetail'
  const [selectedBean, setSelectedBean] = React.useState(null);
  const [newBean, setNewBean] = React.useState({ ...EMPTY_BEAN_FORM });
  const [isAdjustingWeight, setIsAdjustingWeight] = React.useState(false);
  const [weightAdjustmentForm, setWeightAdjustmentForm] = React.useState({ date: "", delta: "", reason: "" });

  // Writes updatedFields onto selectedBean, persists to the "beans" array by id (promoting
  // a virtual/derived bean to a real saved record if it has no id yet), and refreshes selectedBean.
  const persistBeanUpdate = (updatedFields) => {
    const existing = readLocalJSON("beans");
    const savedBean = { ...selectedBean, ...updatedFields, id: (selectedBean && selectedBean.id) || Date.now() };
    const idx = existing.findIndex(b => b.id === savedBean.id);
    const updatedBeans = idx === -1 ? [...existing, savedBean] : existing.map(b => b.id === savedBean.id ? savedBean : b);
    localStorage.setItem("beans", JSON.stringify(updatedBeans));
    setSelectedBean(savedBean);

    setSyncStatus('syncing');
    syncBeanToSupabase(savedBean).then(success => {
      setSyncStatus(success ? 'success' : 'error');
    });

    return savedBean;
  };

  const [brewRating, setBrewRating] = React.useState(0);
  const [brewAgain, setBrewAgain] = React.useState(null); // 'Yes', 'No', 'Maybe'
  const [brewNotes, setBrewNotes] = React.useState("");

  // Persistence Effects
  React.useEffect(() => {
    localStorage.setItem("live_beanName", beanName);
  }, [beanName]);

  React.useEffect(() => {
    localStorage.setItem("live_greenWeightGrams", greenWeightGrams);
  }, [greenWeightGrams]);

  React.useEffect(() => {
    localStorage.setItem("live_targetRoastLevel", targetRoastLevel);
  }, [targetRoastLevel]);

  React.useEffect(() => {
    localStorage.setItem("live_startingHeat", startingHeat);
  }, [startingHeat]);

  React.useEffect(() => {
    localStorage.setItem("live_startingFan", startingFan);
  }, [startingFan]);

  React.useEffect(() => {
    localStorage.setItem("live_startingTemp", startingTemp);
  }, [startingTemp]);

  React.useEffect(() => {
    localStorage.setItem("live_elapsedSeconds", elapsedSeconds);
  }, [elapsedSeconds]);

  React.useEffect(() => {
    localStorage.setItem("live_devSeconds", devSeconds);
  }, [devSeconds]);

  React.useEffect(() => {
    localStorage.setItem("live_firstCrackTime", firstCrackTime);
  }, [firstCrackTime]);

  React.useEffect(() => {
    localStorage.setItem("live_coolingStartTime", coolingStartTime);
  }, [coolingStartTime]);

  React.useEffect(() => {
    localStorage.setItem("live_roastLog", JSON.stringify(roastLog));
  }, [roastLog]);

  React.useEffect(() => {
    localStorage.setItem("global_profiles", JSON.stringify(profiles));
  }, [profiles]);

  // IDEA-008: apply the saved theme on mount and whenever it changes.
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // IDEA-006: when a bean is sent over from Bean Detail's "Log a Session", prefill the Roast Session Header.
  // Only applies when no roast is in progress so we never clobber a live session.
  React.useEffect(() => {
    if (prefillBean && elapsedSeconds === 0 && !isTimerRunning) {
      setBeanName(prefillBean.name || "");
      // Session Header has no Origin field today; name is the meaningful prefill.
      // TODO: Casey review — add an Origin field to the Roast Session Header if you want origin prefilled too.
      setPrefillBean(null);
    }
  }, [prefillBean, elapsedSeconds, isTimerRunning]);

  React.useEffect(() => {
    localStorage.setItem("live_profileFollowing", JSON.stringify(profileFollowing));
  }, [profileFollowing]);

  React.useEffect(() => {
    localStorage.setItem("live_currentProfileStepIdx", currentProfileStepIdx);
  }, [currentProfileStepIdx]);

  const clearLiveSession = () => {
    const keys = [
      "live_beanName",
      "live_greenWeightGrams",
      "live_targetRoastLevel",
      "live_startingHeat",
      "live_startingFan",
      "live_startingTemp",
      "live_elapsedSeconds",
      "live_devSeconds",
      "live_firstCrackTime",
      "live_coolingStartTime",
      "live_roastLog",
      "live_profileFollowing",
      "live_currentProfileStepIdx"
    ];
    keys.forEach(k => localStorage.removeItem(k));
    
    setBeanName("");
    setGreenWeightGrams("");
    setTargetRoastLevel(ROAST_LEVEL_OPTIONS[2]);
    setStartingHeat("");
    setStartingFan("");
    setStartingTemp("");
    setElapsedSeconds(0);
    setDevSeconds(0);
    setFirstCrackTime(null);
    setCoolingStartTime(null);
    setIsDevTimerRunning(false);
    setRoastLog([]);
    setProfileFollowing(null);
    setCurrentProfileStepIdx(-1);
    setNextProfileStep(null);
    setHeat("");
    setFan("");
    setTemp("");
  };

  const handleNumpadDigit = (digit) => {
    if (activeNumpad === "heat") {
      setHeat(digit); // Max 9, so just replace
    } else if (activeNumpad === "fan") {
      setFan(digit); // Max 9, so just replace
    } else if (activeNumpad === "temp") {
      // Temp always opens blank (never prefilled), so plain append is safe.
      setTemp((prev) => {
        const next = prev + digit;
        return next.length <= 4 ? next : prev;
      });
    }
  };

  const handleNumpadDelete = () => {
    if (activeNumpad === "heat") setHeat("");
    else if (activeNumpad === "fan") setFan("");
    else if (activeNumpad === "temp") setTemp((prev) => prev.slice(0, -1));
  };

  React.useEffect(() => {
    if (!isTimerRunning) return undefined;
    const id = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isTimerRunning]);

  React.useEffect(() => {
    if (!isTimerRunning || !profileFollowing) return;

    const checkProfileStep = () => {
      const nextIdx = currentProfileStepIdx + 1;
      if (nextIdx >= profileFollowing.steps.length) return;

      const nextStep = profileFollowing.steps[nextIdx];
      const nextStepSeconds = nextStep.totalSeconds !== undefined ? nextStep.totalSeconds : parseMMSS(nextStep.time);

      // Flash logic: last 5 seconds
      if (elapsedSeconds >= nextStepSeconds - 5 && elapsedSeconds < nextStepSeconds) {
        setNextProfileStep(nextStep);
      } else {
        setNextProfileStep(null);
      }

      // Trigger logic: exact moment
      if (elapsedSeconds === nextStepSeconds) {
        // Auto-log if not manually logged for this timestamp
        const alreadyLogged = roastLog.some(entry => entry.t === elapsedSeconds && entry.type === 'adjustment');
        if (!alreadyLogged) {
          setRoastLog((prev) => [
            { type: 'adjustment', t: elapsedSeconds, heat: nextStep.heat, fan: nextStep.fan, temp: "", label: "Profile" },
            ...prev,
          ]);
        }
        setCurrentProfileStepIdx(nextIdx);
      }
    };

    checkProfileStep();
  }, [elapsedSeconds, isTimerRunning, profileFollowing, currentProfileStepIdx, roastLog]);

  const parseMMSS = (timeStr) => {
    const [mm, ss] = timeStr.split(':').map(Number);
    return (mm * 60) + ss;
  };

  React.useEffect(() => {
    if (!isDevTimerRunning || !isTimerRunning) return undefined;
    const id = window.setInterval(() => {
      setDevSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isDevTimerRunning, isTimerRunning]);

  const logMilestone = (label) => {
    // A logged milestone is done — ignore re-taps. The amber-filled button reads like a
    // toggle, and a duplicate FIRST CRACK would also reset firstCrackTime while the DEV
    // counter keeps running, corrupting the saved dev time.
    if ((roastLog || []).some((e) => e.type === "phase" && e.label === label)) return;

    setRoastLog((prev) => [{ type: 'phase', label, t: elapsedSeconds }, ...prev]);
    
    if (label === "FIRST CRACK") {
      setIsDevTimerRunning(true);
      setFirstCrackTime(elapsedSeconds);
    } else if (label === "COOLING START") {
      setIsTimerRunning(false);
      setIsDevTimerRunning(false);
      setCoolingStartTime(elapsedSeconds);
    }
  };

  const handleStart = () => {
    if (isTimerRunning) return;

    // Resuming a paused roast — don't re-ask for a profile, just continue.
    if (roastStarted) {
      startRoast(null);
      return;
    }

    // Find profiles for the current bean
    const beanProfiles = (profiles || []).filter(p => p.beanName === beanName);
    if (beanProfiles.length > 0 || (profiles || []).some(p => !p.beanName)) {
      setShowRoastModeDialog(true);
    } else {
      startRoast(null);
    }
  };

  const handlePause = () => {
    setIsTimerRunning(false);
    // Loud cue — an accidental pause mid-roast silently compresses every later
    // timestamp, and the small status pill alone is easy to miss.
    showToast("Roast paused — beans are still roasting! Tap RESUME to continue.");
  };

  const startRoast = (profile) => {
    setShowRoastModeDialog(false);
    setIsTimerRunning(true);

    if (!roastStarted) {
      if (profile) {
        setProfileFollowing(profile);
        setCurrentProfileStepIdx(-1);
      }
      // Log starting settings
      setRoastLog([{ 
        type: 'start_settings', 
        t: 0, 
        heat: startingHeat, 
        fan: startingFan, 
        temp: startingTemp,
        label: "Start"
      }]);
    } else {
      setRoastLog((prev) => [{ type: 'phase', label: "START (RESUME)", t: elapsedSeconds }, ...prev]);
    }
  };

  const handleStop = () => {
    setIsTimerRunning(false);
    setIsDevTimerRunning(false);
    
    const newRoast = {
      id: Date.now(),
      date: new Date().toLocaleString(),
      beanName: beanName || "Unnamed Bean",
      greenWeight: greenWeightGrams ? parseFloat(greenWeightGrams) : 0,
      roastedWeight: 0,
      targetLevel: targetRoastLevel,
      roastLog: [...roastLog].reverse(),
      duration: formatTime(elapsedSeconds),
      totalSeconds: elapsedSeconds || 0,
      devSeconds: devSeconds || 0,
      profile: profileFollowing,
      startingSettings: {
        heat: startingHeat,
        fan: startingFan,
        temp: startingTemp
      }
    };

    const existingRoasts = [];
    try {
      const stored = localStorage.getItem("roasts");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          parsed.forEach(r => {
            if (r && typeof r === 'object') {
              existingRoasts.push(r);
            }
          });
        }
      }
    } catch (e) {
      console.warn("Failed to parse roasts from localStorage, starting fresh", e);
    }

    localStorage.setItem("roasts", JSON.stringify([newRoast, ...existingRoasts]));

    // Supabase Sync
    setSyncStatus('syncing');
    syncRoastToSupabase(newRoast).then(success => {
      setSyncStatus(success ? 'success' : 'error');
    });

    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      clearLiveSession();
    }, 2000);
  };

  const handleLogAdjustment = () => {
    setRoastLog((prev) => [
      { type: 'adjustment', t: adjPopupTimestamp ?? elapsedSeconds, heat, fan, temp },
      ...(prev || []),
    ]);
    setHeat("");
    setFan("");
    setTemp("");
    setAdjPopupTimestamp(null);
  };

  // Most recently logged Fan/Heat/Temp for the hero readout — scans the newest-first
  // roastLog by FIELD NAME (never array position) so each value carries forward
  // independently even when an adjustment left some fields blank.
  const latestLogged = React.useMemo(() => {
    const out = { fan: "", heat: "", temp: "" };
    for (const entry of roastLog || []) {
      if (entry.type !== "adjustment" && entry.type !== "start_settings") continue;
      if (!out.fan && entry.fan) out.fan = entry.fan;
      if (!out.heat && entry.heat) out.heat = entry.heat;
      if (!out.temp && entry.temp) out.temp = entry.temp;
      if (out.fan && out.heat && out.temp) break;
    }
    return out;
  }, [roastLog]);

  // A session counts as started once ANYTHING is logged — not only once the clock has
  // ticked. Pausing within the first second (elapsedSeconds still 0) must not look like
  // a fresh session, or restarting would replace the whole roastLog.
  const roastStarted = elapsedSeconds > 0 || (roastLog || []).length > 0;

  // Open the adjustment logger. Fan/Heat prefill from the last logged values (they are
  // dial STATES — carry-forward is truth), but Temp always opens BLANK: it is a fresh
  // measurement each time, and re-saving a carried-forward temp at a new timestamp
  // would write a phantom flat reading into the roast curve and RoR.
  // Both entry points (hero value tap + floating "+") land here; a hero tap also
  // focuses that field's numpad.
  const openAdjPopup = (focusField) => {
    setFan(latestLogged.fan);
    setHeat(latestLogged.heat);
    setTemp("");
    setAdjPopupTimestamp(elapsedSeconds);
    setIsAdjPopupOpen(true);
    setActiveNumpad(focusField || null);
  };

  const handleSaveEdit = () => {
    if (!editedRoast) return;

    // Recalculate duration and dev seconds based on roastLog
    const coolingStart = editedRoast.roastLog.find(e => e.label === "COOLING START");
    const firstCrack = editedRoast.roastLog.find(e => e.label === "FIRST CRACK");
    
    const totalSeconds = coolingStart ? coolingStart.t : editedRoast.totalSeconds;
    const duration = formatTime(totalSeconds);
    const devSeconds = (firstCrack && coolingStart) ? (coolingStart.t - firstCrack.t) : editedRoast.devSeconds;

    const roastToSave = {
      ...editedRoast,
      totalSeconds,
      duration,
      devSeconds,
      greenWeight: parseFloat(editedRoast.greenWeight) || 0,
      roastedWeight: parseFloat(editedRoast.roastedWeight) || 0
    };

    const existingRoasts = [];
    try {
      const stored = localStorage.getItem("roasts");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          parsed.forEach(r => {
            if (r && typeof r === 'object') {
              existingRoasts.push(r);
            }
          });
        }
      }
    } catch (e) {
      console.warn("Failed to parse roasts for edit", e);
    }

    const updated = (existingRoasts || []).map(r => {
      if (r.id === roastToSave.id) {
        return roastToSave;
      }
      return r;
    });

    localStorage.setItem("roasts", JSON.stringify(updated));
    
    // Supabase Sync
    setSyncStatus('syncing');
    syncRoastToSupabase(roastToSave).then(success => {
      setSyncStatus(success ? 'success' : 'error');
    });

    setSelectedRoast(roastToSave);
    setHasChanges(false);
  };

  const updateEditedRoast = (field, value) => {
    setEditedRoast(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const updateLogEntry = (idx, field, value) => {
    const newLog = [...editedRoast.roastLog];
    newLog[idx] = { ...newLog[idx], [field]: value };
    updateEditedRoast('roastLog', newLog);
  };

  // Performs the delete — confirmation happens in the styled modal (confirmDelete state).
  const handleDeleteRoast = (id) => {
    const existingRoasts = (() => {
      try {
        return JSON.parse(localStorage.getItem("roasts") || "[]");
      } catch (e) {
        console.warn("Failed to parse roasts", e);
        return [];
      }
    })();
    const updatedRoasts = (existingRoasts || []).filter((r) => r.id !== id);
    localStorage.setItem("roasts", JSON.stringify(updatedRoasts));
    
    // Supabase Sync
    setSyncStatus('syncing');
    deleteRoastFromSupabase(id).then(() => {
      setSyncStatus('success');
    }).catch(() => {
      setSyncStatus('error');
    });

    setSelectedRoast(null);
  };

  // Performs the delete — confirmation happens in the styled modal (confirmDelete state).
  const handleDeleteTasting = (id) => {
    const existingBrews = (() => {
      try {
        return JSON.parse(localStorage.getItem("tastingNotes") || "[]");
      } catch (e) {
        console.warn("Failed to parse tastingNotes", e);
        return [];
      }
    })();
    const updatedBrews = (existingBrews || []).filter((t) => t.id !== id);
    localStorage.setItem("tastingNotes", JSON.stringify(updatedBrews));

    // Supabase Sync
    setSyncStatus('syncing');
    deleteBrewFromSupabase(id).then(() => {
      setSyncStatus('success');
    }).catch(() => {
      setSyncStatus('error');
    });

    setSelectedTastingNote(null);
  };

  // cascade: also deletes every roast/tasting linked to this bean by name, not just the bean profile.
  const handleDeleteBean = (bean, cascade) => {
    if (prefillBean && prefillBean.name === bean.name) {
      setPrefillBean(null);
    }

    if (cascade) {
      const existingRoasts = readLocalJSON("roasts");
      const matchedRoasts = existingRoasts.filter(r => r.beanName === bean.name);
      localStorage.setItem("roasts", JSON.stringify(existingRoasts.filter(r => r.beanName !== bean.name)));

      const existingBrews = readLocalJSON("tastingNotes");
      const matchedBrews = existingBrews.filter(t => t.beanName === bean.name);
      localStorage.setItem("tastingNotes", JSON.stringify(existingBrews.filter(t => t.beanName !== bean.name)));

      setSyncStatus('syncing');
      Promise.all([
        ...matchedRoasts.map(r => deleteRoastFromSupabase(r.id)),
        ...matchedBrews.map(t => deleteBrewFromSupabase(t.id)),
        ...(bean.id ? [deleteBeanFromSupabase(bean.id)] : []),
      ]).then(() => setSyncStatus('success')).catch(() => setSyncStatus('error'));
    } else if (bean.id) {
      setSyncStatus('syncing');
      deleteBeanFromSupabase(bean.id).then(() => setSyncStatus('success')).catch(() => setSyncStatus('error'));
    }

    if (bean.id) {
      const existingBeans = readLocalJSON("beans");
      localStorage.setItem("beans", JSON.stringify(existingBeans.filter(b => b.id !== bean.id)));
    }

    setSelectedBean(null);
    setBeansView("list");
    setConfirmDelete(null);
  };

  const BREW_METHODS = ["Pour Over", "Espresso Machine", "Chemex", "French Press", "AeroPress", "Moka Pot", "Hario V60"];
  const GRIND_SIZES = ["Extra Fine", "Fine", "Medium-Fine", "Medium", "Medium-Coarse", "Coarse"];
  // One-tap ratio chips (older saved brews may hold other ratio strings — display-only, still fine)
  const RATIO_CHIPS = ["1:15", "1:16", "1:17", "Custom"];

  const FLAVOR_FAMILIES = [
    { id: 'chocolatey', label: 'Chocolatey', emoji: '☕' },
    { id: 'fruity', label: 'Fruity', emoji: '🍎' },
    { id: 'floral', label: 'Floral', emoji: '🌸' },
    { id: 'sweet', label: 'Sweet', emoji: '🍯' },
    { id: 'nutty', label: 'Nutty', emoji: '🌰' },
    { id: 'spicy', label: 'Spicy', emoji: '🌶' },
    { id: 'roasted', label: 'Roasted', emoji: '🔥' },
    { id: 'earthy', label: 'Earthy/Vegetal', emoji: '🌿' },
    { id: 'fermented', label: 'Fermented/Winey', emoji: '🍷' }
  ];

  const FLAVOR_DRILLDOWN = {
    chocolatey: ["Milk Chocolate", "Dark Chocolate", "Cocoa", "Bittersweet", "Hazelnut", "Almond", "Nougat", "Marzipan"],
    fruity: {
      BERRY: ["Blackberry", "Raspberry", "Blueberry", "Strawberry"],
      CITRUS: ["Grapefruit", "Orange", "Lemon", "Lime"],
      STONE_FRUIT: ["Peach", "Cherry", "Apricot", "Plum"],
      TROPICAL: ["Mango", "Passion Fruit", "Lychee", "Guava", "Papaya"],
      DRIED_FRUIT: ["Raisin", "Prune", "Date", "Fig"]
    },
    floral: ["Rose", "Jasmine", "Chamomile", "Lavender", "Hibiscus", "Orange Blossom", "Elderflower", "Black Tea"],
    sweet: ["Brown Sugar", "Honey", "Caramel", "Vanilla", "Molasses", "Maple Syrup", "Toffee", "Butterscotch", "Cotton Candy", "Marshmallow", "Praline"],
    nutty: ["Almond", "Hazelnut", "Peanut", "Walnut", "Pecan", "Cashew"],
    spicy: ["Clove", "Cinnamon", "Nutmeg", "Anise", "Black Pepper", "Cardamom", "Ginger"],
    roasted: ["Dark Roast", "Smoky", "Tobacco", "Malt", "Grain", "Ashy", "Burnt Sugar", "Cedar"],
    earthy: ["Earthy", "Woody", "Mushroom", "Fresh Herbs", "Hay", "Green Tea", "Olive Oil"],
    fermented: ["Red Wine", "White Wine", "Whiskey", "Bourbon", "Overripe Fruit", "Vinegar", "Kombucha"]
  };

  const handleSaveBrew = () => {
    const newBrew = {
      id: Date.now(),
      date: new Date().toLocaleString(),
      roastId: brewLinkedRoastId,
      beanName: brewBeanName,
      method: brewMethod,
      device: brewDevice,
      ratio: brewRatio === "Custom" ? customRatio : brewRatio,
      grindSize: brewGrindSize,
      temp: brewTemp,
      acidity: acidityRating,
      body: bodyRating,
      families: selectedFamilies,
      descriptors: selectedDescriptors,
      rating: brewRating,
      brewAgain: brewAgain,
      notes: brewNotes
    };

    const existingBrews = (() => {
      try {
        return JSON.parse(localStorage.getItem("tastingNotes") || "[]");
      } catch (e) {
        console.warn("Failed to parse tastingNotes", e);
        return [];
      }
    })();
    localStorage.setItem("tastingNotes", JSON.stringify([newBrew, ...existingBrews]));
    
    // Supabase Sync
    setSyncStatus('syncing');
    syncBrewToSupabase(newBrew).then(success => {
      setSyncStatus(success ? 'success' : 'error');
    });
    
    setBrewStep(0);
    // Reset wizard
    setBrewLinkedRoastId("");
    setBrewBeanName("");
    setBrewDevice("");
    setBrewTemp("");
    setAcidityRating(3);
    setBodyRating(3);
    setSelectedFamilies([]);
    setSelectedDescriptors([]);
    setExpandedFruitType([]);
    setBrewRating(0);
    setBrewAgain(null);
    setBrewNotes("");
    setCustomRatio("");
  };

  // IDEA-007: Export Data — CSV roast log + full JSON backup. Pure client-side download, no server.
  const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const readLocalJSON = (key) => {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; }
  };

  // Merge two id-keyed lists, deduplicating by id (later source wins on conflict).
  const mergeById = (local, remote) => {
    const map = new Map();
    (local || []).forEach(item => { if (item && item.id != null) map.set(String(item.id), item); });
    (remote || []).forEach(item => {
      if (item && item.id != null) map.set(String(item.id), { ...map.get(String(item.id)), ...item });
    });
    return Array.from(map.values());
  };

  const gatherExportData = async () => {
    const [remoteRoasts, remoteBrews, remoteBeans] = await Promise.all([
      fetchRoastsFromSupabase().catch(() => []),
      fetchBrewsFromSupabase().catch(() => []),
      fetchBeansFromSupabase().catch(() => []),
    ]);
    return {
      roasts: mergeById(readLocalJSON("roasts"), remoteRoasts),
      brews: mergeById(readLocalJSON("tastingNotes"), remoteBrews),
      beans: mergeById(readLocalJSON("beans"), remoteBeans),
      roastProfiles: readLocalJSON("global_profiles"),
    };
  };

  const csvEscape = (val) => {
    const s = (val === null || val === undefined) ? "" : String(val);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const { roasts, brews, beans } = await gatherExportData();
      const beanByName = {};
      beans.forEach(b => { if (b && b.name) beanByName[b.name] = b; });
      const noteByRoastId = {};
      brews.forEach(t => { if (t && t.roastId != null && t.roastId !== "") noteByRoastId[String(t.roastId)] = t; });

      const headers = ["Date", "Bean Name", "Origin", "Green Weight (g)", "Roasted Weight (g)", "Weight Loss %", "Target Roast Level", "Visual Color", "Rating (0.5-5)", "Brew Again (Yes/No/Maybe)", "Session Notes"];
      const rows = roasts.map(r => {
        const bean = beanByName[r.beanName] || {};
        const note = noteByRoastId[String(r.id)] || {};
        const green = Number(r.greenWeight);
        const roasted = Number(r.roastedWeight);
        const loss = (green > 0 && roasted > 0) ? (((green - roasted) / green) * 100).toFixed(1) : "";
        return [
          r.date, r.beanName, bean.origin || "", r.greenWeight || "", r.roastedWeight || "",
          loss, r.targetLevel || "", r.visualColor || "", note.rating || "",
          note.brewAgain || "", note.notes || "",
        ].map(csvEscape).join(",");
      });
      const csv = [headers.join(","), ...rows].join("\n");
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(csv, `roastlogs-export-${date}.csv`, "text/csv;charset=utf-8;");
      showToast("Roast log exported (CSV).");
      setShowExportPanel(false);
    } catch (e) {
      console.warn("CSV export failed", e);
      showToast("Export failed. Please try again.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportJSON = async () => {
    setIsExporting(true);
    try {
      const { roasts, brews, beans, roastProfiles } = await gatherExportData();
      const roastSessions = roasts.map(r => ({
        ...r,
        adjustmentLog: r.roastLog || [],
        tastingNotes: brews.filter(t => String(t.roastId) === String(r.id)),
      }));
      const backup = {
        exportDate: new Date().toISOString(),
        appVersion: "1.5.0",
        roastSessions,
        beans,
        roastProfiles,
        brewSessions: brews,
      };
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(JSON.stringify(backup, null, 2), `roastlogs-backup-${date}.json`, "application/json");
      showToast("Full backup exported (JSON).");
      setShowExportPanel(false);
    } catch (e) {
      console.warn("JSON export failed", e);
      showToast("Export failed. Please try again.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  let ActiveIcon = null;
  if (activeTab === "Roast") ActiveIcon = RoasterIcon;
  else if (activeTab === "Brew") ActiveIcon = CoffeeIcon;
  else if (activeTab === "History") ActiveIcon = ClockIcon;
  else if (activeTab === "Beans") ActiveIcon = BeanIcon;
  else if (activeTab === "Settings") ActiveIcon = GearIcon;

  return (
    <div className="min-h-screen bg-primary text-ink">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-primary/80 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 pb-4 pt-5">
          <div className="flex items-center gap-2">
            {ActiveIcon && <ActiveIcon active sizeClass="h-7 w-7" />}
            <div className="text-lg font-semibold tracking-tight">{activeTab}</div>
            <div 
              className={`h-2 w-2 rounded-full ml-1 ${
                syncStatus === 'success' ? 'bg-green-500' :
                syncStatus === 'syncing' ? 'bg-yellow-500' :
                syncStatus === 'error' ? 'bg-red-500' : 'bg-ink-muted'
              }`}
              title={`Sync status: ${syncStatus}`}
            />
          </div>
          {/* FORGE/locked decision: Settings lives behind the gear icon top-right, not the bottom nav */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-ink-muted">RoastLogs</span>
            <button
              type="button"
              onClick={() => setActiveTab("Settings")}
              aria-label="Settings"
              className={`rounded-full p-1.5 transition hover:bg-surface/60 ${activeTab === "Settings" ? "ring-1 ring-accent/30" : ""}`}
            >
              <GearIcon active={activeTab === "Settings"} sizeClass="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-28 pt-6">
        {activeTab === "Roast" && (
          <div className="space-y-4">
            {/* 1) SESSION HEADER */}
            <section className="rounded-3xl border border-border/60 bg-surface/30 p-4 shadow-[0_0_0_1px_rgba(0,0,0,0.2)]">
              <div className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                Session
              </div>

              {/* Starting Settings — editable cockpit tiles, hidden once the session has begun */}
              {!roastStarted && !isTimerRunning && (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <CockpitTile
                    label="Fan (1-9)"
                    value={startingFan}
                    onChange={(e) => setStartingFan(dialDigit(e.target.value))}
                  />
                  <CockpitTile
                    label="Heat (1-9)"
                    value={startingHeat}
                    onChange={(e) => setStartingHeat(dialDigit(e.target.value))}
                  />
                  <CockpitTile
                    label="Temp"
                    accent
                    value={startingTemp}
                    onChange={(e) => setStartingTemp(e.target.value)}
                  />
                </div>
              )}

              {/* Bean fields grouped under one labeled card */}
              <div className={`${!roastStarted && !isTimerRunning ? "mt-4" : "mt-2"} rounded-2xl border border-border/60 bg-primary/20 p-4`}>
                <div className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Bean</div>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <label className="block">
                    <div className="text-xs font-medium text-ink">Bean Name</div>
                    <input
                      value={beanName}
                      onChange={(e) => setBeanName(e.target.value)}
                      type="text"
                      placeholder="e.g., Ethiopia Yirgacheffe"
                      className="mt-2 w-full rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  </label>

                  <label className="block">
                    <div className="text-xs font-medium text-ink">Green Weight (g)</div>
                    <input
                      value={greenWeightGrams}
                      onChange={(e) => setGreenWeightGrams(e.target.value)}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="e.g., 250"
                      className="mt-2 w-full rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  </label>

                  <label className="block">
                    <div className="text-xs font-medium text-ink">Target Roast Level</div>
                    <select
                      value={targetRoastLevel}
                      onChange={(e) => setTargetRoastLevel(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 text-sm text-ink focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                    >
                      {ROAST_LEVEL_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </section>

            {/* PROMINENT PROFILE BUILDER CARD */}
            {!roastStarted && !isTimerRunning && (
              <section 
                onClick={() => setIsProfileBuilderOpen(true)}
                className="rounded-3xl bg-accent/10 border border-accent/20 p-4 cursor-pointer hover:bg-accent/15 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <SliderIcon />
                    <div>
                      <div className="font-bold text-accent-text">Build Profile</div>
                      <div className="text-xs text-ink-muted">Create a step-by-step heat & fan plan before you roast</div>
                    </div>
                  </div>
                  <div className="text-accent-text">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </section>
            )}

            {/* 2) HERO COCKPIT — amber-tinted hero card per the taste-skill mockup:
                status pill, DEV in the corner, big left-aligned timer, and an inline
                Fan·Heat·Temp readout row. Each readout value is a tap target that opens
                the adjustment logger pre-filled (the FAB is the second entry point). */}
            <section className="rounded-3xl border border-accent/30 bg-gradient-to-b from-amber-500/10 via-amber-500/[0.03] to-zinc-950/40 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isTimerRunning ? "animate-pulse bg-accent ring-[3px] ring-accent/20" : "bg-ink-muted"
                    }`}
                  />
                  <span
                    className={`text-[10px] font-bold uppercase tracking-[0.12em] ${
                      isTimerRunning ? "text-accent-text" : "text-ink-muted"
                    }`}
                  >
                    {isTimerRunning ? "Roasting" : roastStarted ? "Paused" : "Ready"}
                  </span>
                </div>
                {firstCrackTime !== null && (
                  <div className="animate-in fade-in duration-300 font-mono text-xs font-bold tabular-nums text-error-text">
                    DEV {devSeconds}s
                  </div>
                )}
              </div>

              <div className="mt-2 font-mono text-[68px] font-extrabold leading-none tracking-[-0.035em] tabular-nums text-accent-text">
                {formatTime(elapsedSeconds)}
              </div>

              {/* Tappable readout — the ONLY F/H/T display on this screen */}
              {(roastStarted || isTimerRunning) && (
                <div className="mt-4 flex border-t border-border/60 pt-3">
                  <button
                    type="button"
                    onClick={() => openAdjPopup("fan")}
                    className="flex min-h-[44px] flex-1 flex-col items-start gap-0.5 rounded-lg py-1.5 transition active:scale-95 active:bg-surface/40"
                  >
                    <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-muted">Fan</span>
                    <span className="font-mono text-xl font-bold tabular-nums text-ink">{latestLogged.fan || "—"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openAdjPopup("heat")}
                    className="ml-3 flex min-h-[44px] flex-1 flex-col items-start gap-0.5 rounded-lg border-l border-border/60 py-1.5 pl-3 transition active:scale-95 active:bg-surface/40"
                  >
                    <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-muted">Heat</span>
                    <span className="font-mono text-xl font-bold tabular-nums text-ink">{latestLogged.heat || "—"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openAdjPopup("temp")}
                    className="ml-3 flex min-h-[44px] flex-1 flex-col items-start gap-0.5 rounded-lg border-l border-border/60 py-1.5 pl-3 transition active:scale-95 active:bg-surface/40"
                  >
                    <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-muted">Temp</span>
                    <span className="font-mono text-xl font-bold tabular-nums text-ink">
                      {latestLogged.temp ? toDisplayTemp(latestLogged.temp) : "—"}
                    </span>
                  </button>
                </div>
              )}
            </section>

            {/* 3) PHASE MILESTONES */}
            <section className="rounded-3xl border border-border/60 bg-surface/20 p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                  Phase Milestones
                </div>
              </div>
              
              {profileFollowing && (
                <div className="mt-3 p-3 rounded-2xl bg-accent/5 border border-accent/10">
                  <div className="text-[10px] font-bold text-accent-text/60 uppercase tracking-widest mb-2">Active Profile: {profileFollowing?.name}</div>
                  <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {(profileFollowing?.steps || []).map((step, idx) => {
                      const stepSeconds = step.totalSeconds !== undefined ? step.totalSeconds : parseMMSS(step.time);
                      const isPast = elapsedSeconds > stepSeconds;
                      const isCurrent = currentProfileStepIdx === idx || (elapsedSeconds === stepSeconds);
                      const isNext = idx === currentProfileStepIdx + 1;
                      const isFlashing = isNext && nextProfileStep;
                      
                      return (
                        <div 
                          key={idx} 
                          className={`flex-shrink-0 px-3 py-2 rounded-xl border transition-all duration-500 ${
                            isCurrent ? "bg-accent border-accent text-zinc-950 scale-105 shadow-lg shadow-amber-500/20" : 
                            isFlashing ? "bg-accent/40 border-accent animate-pulse text-accent-text" :
                            isPast ? "bg-surface/30 border-border/50 text-ink-muted" :
                            "bg-surface/50 border-border/50 text-ink-muted"
                          }`}
                        >
                          <div className="text-[10px] font-mono font-bold">{step.time}</div>
                          <div className="text-xs font-black">H{step.heat} F{step.fan}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Roomy large-target layout (kept deliberately); logged milestones fill amber. */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={isTimerRunning ? handlePause : handleStart}
                  className="col-span-2 rounded-3xl bg-accent px-4 py-4 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-accent/90 active:scale-[0.99]"
                >
                  {isTimerRunning ? "PAUSE" : roastStarted ? "RESUME" : "START"}
                </button>
                {[
                  "YELLOWING",
                  "FIRST CRACK",
                ].map((label) => {
                  const logged = (roastLog || []).some((e) => e.type === "phase" && e.label === label);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => logMilestone(label)}
                      className={[
                        "rounded-3xl px-4 py-4 text-sm font-semibold transition active:scale-[0.98]",
                        logged
                          ? "border border-accent bg-accent text-zinc-950 shadow-sm shadow-amber-500/20"
                          : "border border-border/70 bg-primary/30 text-ink hover:bg-surface/50 active:bg-surface/70",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  );
                })}
                {(() => {
                  const logged = (roastLog || []).some((e) => e.type === "phase" && e.label === "COOLING START");
                  return (
                    <button
                      type="button"
                      onClick={() => logMilestone("COOLING START")}
                      className={[
                        "col-span-2 rounded-3xl px-4 py-4 text-sm font-semibold transition active:scale-[0.98]",
                        logged
                          ? "border border-accent bg-accent text-zinc-950 shadow-sm shadow-amber-500/20"
                          : "border border-border/70 bg-primary/30 text-ink hover:bg-surface/50 active:bg-surface/70",
                      ].join(" ")}
                    >
                      COOLING START
                    </button>
                  );
                })()}
              </div>
            </section>

            {/* Profile Builder & Dialogs */}
            {isProfileBuilderOpen && (
              <ProfileBuilder 
                bean={selectedBean} 
                onCancel={() => setIsProfileBuilderOpen(false)}
                onSave={(newProfile) => {
                  const p = { ...newProfile, id: Date.now(), beanName: beanName };
                  setProfiles(prev => [...prev, p]);
                  setIsProfileBuilderOpen(false);
                }}
              />
            )}

            {showDiscardModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-primary/90 p-4 backdrop-blur-sm">
                <div className="w-full max-w-sm animate-in zoom-in-95 duration-200 rounded-3xl border border-border/60 bg-surface p-6 shadow-2xl text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error/20 text-error-text">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </div>
                  <h3 className="text-xl font-bold text-ink mb-2">Discard this roast?</h3>
                  <p className="text-sm text-ink-muted mb-6">All logged data will be lost.</p>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowDiscardModal(false)}
                      className="flex-1 py-3 rounded-2xl bg-surface text-ink font-bold hover:bg-card transition"
                    >
                      CANCEL
                    </button>
                    <button 
                      onClick={() => {
                        clearLiveSession();
                        setShowDiscardModal(false);
                        setIsTimerRunning(false);
                        setIsDevTimerRunning(false);
                      }}
                      className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-500 transition"
                    >
                      DISCARD
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showRoastModeDialog && (
              <RoastModeDialog 
                bean={selectedBean}
                profiles={(profiles || []).filter(p => !p.beanName || p.beanName === "" || p.beanName === beanName)}
                onCancel={() => setShowRoastModeDialog(false)}
                onSelectManual={() => startRoast(null)}
                onSelectProfile={(p) => startRoast(p)}
              />
            )}

            {/* 4) UNIFIED ROAST TIMELINE */}
            <section className="rounded-3xl border border-border/60 bg-surface/20 p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                Roast Timeline
              </div>

              {/* Compressed color-barred list: amber bar = phase entry, gray bar = adjustment */}
              <div className="mt-4 max-h-[400px] overflow-y-auto rounded-2xl border border-border/60 bg-primary/20">
                {roastLog.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-ink-muted">
                    Timeline events will appear here as they occur.
                  </div>
                ) : (
                  <ul className="py-1">
                    {(roastLog || []).map((entry, idx) => {
                      const isPhase = entry.type === 'phase';
                      const isStart = entry.type === 'start_settings';
                      return (
                        <li key={`${entry.t}-${idx}`} className="flex items-stretch gap-2.5 px-3 py-1.5">
                          <span className={`w-1 shrink-0 rounded-full ${isPhase || isStart ? "bg-accent" : "bg-card"}`} />
                          <div className="flex flex-1 items-center justify-between gap-2">
                            <span className={`font-mono text-xs ${isPhase ? "font-bold text-accent-text" : "text-accent-text/70"}`}>
                              {formatTime(entry.t)}
                            </span>
                            {isPhase ? (
                              <span className="text-xs font-bold uppercase tracking-wide text-accent-text">
                                {entry.label}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-xs text-ink-muted tabular-nums">
                                <span>
                                  F: <span className="font-semibold text-ink">{entry.fan || "—"}</span>
                                  {" · "}H: <span className="font-semibold text-ink">{entry.heat || "—"}</span>
                                  {" · "}T: <span className="font-semibold text-ink">{toDisplayTemp(entry.temp)}</span>
                                </span>
                                {isStart && (
                                  <span className="rounded-md border border-accent/30 bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-text">
                                    {entry.label}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* Floating Adjustment Log Button — second entry to the same pre-filled popup */}
            {isTimerRunning && (
              <button
                type="button"
                onClick={() => openAdjPopup(null)}
                className="fixed bottom-24 right-6 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-zinc-950 shadow-xl shadow-amber-500/20 transition active:scale-95"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            )}

            {/* Adjustment Log Popup */}
            {isAdjPopupOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/80 p-4 backdrop-blur-sm">
                <div className="w-full max-w-sm animate-in zoom-in-95 duration-200 rounded-3xl border border-border/60 bg-surface p-6 shadow-2xl">
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">Log Adjustment</div>
                      <div className="mt-1 font-mono text-sm text-accent-text">{formatTime(adjPopupTimestamp ?? elapsedSeconds)}</div>
                    </div>
                    <button 
                      onClick={() => {
                        setIsAdjPopupOpen(false);
                        setActiveNumpad(null);
                      }}
                      className="rounded-full bg-surface p-2 text-ink-muted"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveNumpad("fan")}
                      className={[
                        "flex flex-col items-center justify-center rounded-2xl border bg-primary/40 p-4 transition active:scale-95",
                        activeNumpad === "fan" ? "border-accent ring-2 ring-accent/20" : "border-border/70",
                      ].join(" ")}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-tight text-ink-muted">Fan</div>
                      <div className="mt-1 text-2xl font-black text-ink">{fan || "—"}</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveNumpad("heat")}
                      className={[
                        "flex flex-col items-center justify-center rounded-2xl border bg-primary/40 p-4 transition active:scale-95",
                        activeNumpad === "heat" ? "border-accent ring-2 ring-accent/20" : "border-border/70",
                      ].join(" ")}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-tight text-ink-muted">Heat</div>
                      <div className="mt-1 text-2xl font-black text-ink">{heat || "—"}</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveNumpad("temp")}
                      className={[
                        "flex flex-col items-center justify-center rounded-2xl border bg-primary/40 p-4 transition active:scale-95",
                        activeNumpad === "temp" ? "border-accent ring-2 ring-accent/20" : "border-border/70",
                      ].join(" ")}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-tight text-ink-muted">Temp</div>
                      <div className="mt-1 text-2xl font-black text-ink">{temp || "—"}</div>
                    </button>
                  </div>

                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        handleLogAdjustment();
                        setIsAdjPopupOpen(false);
                        setActiveNumpad(null);
                      }}
                      className="w-full rounded-2xl bg-accent py-4 text-lg font-bold text-zinc-950 shadow-lg shadow-amber-500/10 transition active:scale-[0.98]"
                    >
                      SAVE ENTRY
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 5) SAVE ROAST */}
            <div className="space-y-3">
              {saveSuccess && (
                <div className="text-center text-sm font-bold text-success-text animate-bounce">
                  Roast saved to history!
                </div>
              )}
              {coolingStartTime !== null && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDiscardModal(true)}
                    className="w-full rounded-3xl bg-red-600 px-4 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-red-500 active:bg-red-700"
                  >
                    DISCARD
                  </button>
                  <button
                    type="button"
                    onClick={handleStop}
                    className="w-full rounded-3xl bg-green-600 px-4 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-green-500 active:bg-green-600/90"
                  >
                    SAVE ROAST
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "Brew" && (
          <div className="space-y-4">
            {brewStep === 0 && (
              <div className="space-y-6">
                {/* SESSION — what you're drinking */}
                <section className="rounded-3xl border border-border/60 bg-surface/30 p-5 shadow-sm">
                  <div className="text-xs font-medium uppercase tracking-wider text-ink-muted">Session</div>
                  <div className="mt-4 space-y-4">
                    <label className="block">
                      <div className="text-xs font-medium text-ink">Link to Roast Session</div>
                      <select
                        value={brewLinkedRoastId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setBrewLinkedRoastId(id);
                          if (id) {
                            const roasts = (() => {
                              try {
                                return JSON.parse(localStorage.getItem("roasts") || "[]");
                              } catch (e) {
                                console.warn("Failed to parse roasts", e);
                                return [];
                              }
                            })();
                            const roast = (roasts || []).find(r => String(r.id) === id);
                            if (roast) setBrewBeanName(roast.beanName);
                          }
                        }}
                        className="mt-2 w-full rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 text-sm text-ink focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                      >
                        <option value="">None (Manual Entry)</option>
                        {(() => {
                          try {
                            return JSON.parse(localStorage.getItem("roasts") || "[]");
                          } catch (e) {
                            return [];
                          }
                        })().map(r => (
                          <option key={r.id} value={r.id}>{r.beanName} ({r.date})</option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <div className="text-xs font-medium text-ink">Bean Name</div>
                      <input
                        value={brewBeanName}
                        onChange={(e) => setBrewBeanName(e.target.value)}
                        type="text"
                        placeholder="e.g., Ethiopia Yirgacheffe"
                        className="mt-2 w-full rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                      />
                    </label>
                  </div>
                </section>

                {/* PARAMETERS — how you're brewing it */}
                <section className="rounded-3xl border border-border/60 bg-surface/30 p-5 shadow-sm">
                  <div className="text-xs font-medium uppercase tracking-wider text-ink-muted">Parameters</div>
                  <div className="mt-4 space-y-4">
                    {/* Method + Grind as cockpit-style tiles (native select overlaid for the picker) */}
                    <div className="grid grid-cols-2 gap-3">
                      <label className="relative block rounded-2xl border border-border/70 bg-primary/40 px-3 py-3 text-center transition focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Method</div>
                        <div className="mt-1 truncate text-sm font-bold text-ink">{brewMethod}</div>
                        <select
                          value={brewMethod}
                          onChange={(e) => setBrewMethod(e.target.value)}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          aria-label="Brew Method"
                        >
                          {BREW_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </label>
                      <label className="relative block rounded-2xl border border-border/70 bg-primary/40 px-3 py-3 text-center transition focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Grind</div>
                        <div className="mt-1 truncate text-sm font-bold text-ink">{brewGrindSize}</div>
                        <select
                          value={brewGrindSize}
                          onChange={(e) => setBrewGrindSize(e.target.value)}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          aria-label="Grind Size"
                        >
                          {GRIND_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </label>
                    </div>

                    {/* Ratio — one-tap quick-select chips */}
                    <div>
                      <div className="text-xs font-medium text-ink">Ratio</div>
                      <div className="mt-2 grid grid-cols-4 gap-2">
                        {RATIO_CHIPS.map(r => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setBrewRatio(r)}
                            className={`rounded-2xl border py-3 text-sm font-bold transition active:scale-95 ${
                              brewRatio === r
                                ? "border-accent bg-accent/20 text-accent-text"
                                : "border-border bg-primary/40 text-ink-muted"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                      {brewRatio === "Custom" && (
                        <input
                          type="text"
                          placeholder="e.g. 1:15.5"
                          value={customRatio}
                          onChange={(e) => setCustomRatio(e.target.value)}
                          className="mt-2 w-full rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <div className="text-xs font-medium text-ink">Device Name</div>
                        <input
                          value={brewDevice}
                          onChange={(e) => setBrewDevice(e.target.value)}
                          type="text"
                          placeholder="e.g., V60"
                          className="mt-2 w-full rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                      </label>
                      <label className="block">
                        <div className="text-xs font-medium text-ink">Water Temp (°F)</div>
                        <input
                          value={brewTemp}
                          onChange={(e) => setBrewTemp(e.target.value)}
                          type="number"
                          placeholder="205"
                          className="mt-2 w-full rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                      </label>
                    </div>

                    <button
                      onClick={() => setBrewStep(1)}
                      className="w-full rounded-3xl bg-accent px-4 py-4 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-accent/90"
                    >
                      START TASTING
                    </button>
                  </div>
                </section>
              </div>
            )}

            {brewStep === 1 && (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">Step 1 of 4 — Acidity & Body</div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(s => (
                      <div key={s} className={`h-1.5 w-1.5 rounded-full ${s <= 1 ? 'bg-accent' : 'bg-surface'}`} />
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-border/60 bg-surface/30 p-6 shadow-sm">
                  <p className="text-lg font-medium leading-relaxed text-ink">"Take a small sip. Rate these two qualities."</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">ACIDITY — How bright or sharp is it?</div>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map(num => (
                        <button
                          key={num}
                          onClick={() => setAcidityRating(num)}
                          className={`flex h-14 flex-col items-center justify-center rounded-2xl border transition ${
                            acidityRating === num ? "border-accent bg-accent/20 text-accent-text" : "border-border bg-surface/50 text-ink-muted"
                          }`}
                        >
                          <span className="text-lg font-bold">{num}</span>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-[10px] uppercase tracking-tighter text-ink-muted">
                      <span className="text-center">Delicate</span>
                      <span className="text-center">Mild</span>
                      <span className="text-center">Balanced</span>
                      <span className="text-center">Bright</span>
                      <span className="text-center">Sharp</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">BODY — How does it feel in your mouth?</div>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map(num => (
                        <button
                          key={num}
                          onClick={() => setBodyRating(num)}
                          className={`flex h-14 flex-col items-center justify-center rounded-2xl border transition ${
                            bodyRating === num ? "border-accent bg-accent/20 text-accent-text" : "border-border bg-surface/50 text-ink-muted"
                          }`}
                        >
                          <span className="text-lg font-bold">{num}</span>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-[10px] uppercase tracking-tighter text-ink-muted">
                      <span className="text-center">Watery</span>
                      <span className="text-center">Delicate</span>
                      <span className="text-center">Medium</span>
                      <span className="text-center">Round</span>
                      <span className="text-center">Syrupy</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setBrewStep(2)}
                  className="w-full rounded-3xl bg-accent py-4 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-accent/90"
                >
                  NEXT
                </button>
              </div>
            )}

            {brewStep === 2 && (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">Step 2 of 4 — What do you taste?</div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(s => (
                      <div key={s} className={`h-1.5 w-1.5 rounded-full ${s <= 2 ? 'bg-accent' : 'bg-surface'}`} />
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-border/60 bg-surface/30 p-6 shadow-sm">
                  <p className="text-lg font-medium leading-relaxed text-ink">"Take a full sip. Which broad flavor families stand out? Select all that apply."</p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {FLAVOR_FAMILIES.map(family => (
                    <button
                      key={family.id}
                      onClick={() => {
                        const next = selectedFamilies.includes(family.id)
                          ? selectedFamilies.filter(id => id !== family.id)
                          : [...selectedFamilies, family.id];
                        setSelectedFamilies(next);
                      }}
                      className={`flex flex-col items-center justify-center rounded-3xl border p-4 transition ${
                        selectedFamilies.includes(family.id) ? "border-accent bg-accent/15 text-accent-text" : "border-border bg-primary/40 text-ink-muted"
                      }`}
                    >
                      <span className="text-2xl mb-2">{family.emoji}</span>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-center leading-tight">{family.label}</span>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setBrewStep(1)}
                    className="rounded-3xl border border-border py-4 text-base font-semibold text-ink transition active:bg-surface"
                  >
                    BACK
                  </button>
                  <button
                    disabled={selectedFamilies.length === 0}
                    onClick={() => setBrewStep(3)}
                    className="rounded-3xl bg-accent py-4 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-accent/90 disabled:opacity-50 disabled:grayscale"
                  >
                    NEXT
                  </button>
                </div>
              </div>
            )}

            {brewStep === 3 && (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">Step 3 of 4 — Let's get specific</div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(s => (
                      <div key={s} className={`h-1.5 w-1.5 rounded-full ${s <= 3 ? 'bg-accent' : 'bg-surface'}`} />
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-border/60 bg-surface/30 p-6 shadow-sm">
                  <p className="text-lg font-medium leading-relaxed text-ink">"For each flavor family you selected, which specific notes fit best?"</p>
                </div>

                <div className="space-y-8">
                  {selectedFamilies.map(familyId => {
                    const family = FLAVOR_FAMILIES.find(f => f.id === familyId);
                    const options = FLAVOR_DRILLDOWN[familyId];

                    if (familyId === 'fruity') {
                      return (
                        <div key={familyId} className="space-y-4">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{family.emoji}</span>
                            <div className="text-xs font-bold uppercase tracking-wider text-ink">{family.label}</div>
                          </div>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {Object.keys(options).map(type => (
                              <button
                                key={type}
                                onClick={() => {
                                  if (expandedFruitType.includes(type)) {
                                    setExpandedFruitType(expandedFruitType.filter(t => t !== type));
                                  } else {
                                    setExpandedFruitType([...expandedFruitType, type]);
                                  }
                                }}
                                className={`rounded-xl border px-3 py-2 text-[10px] font-bold tracking-widest transition ${
                                  expandedFruitType.includes(type) ? "border-accent bg-accent/20 text-accent-text" : "border-border bg-surface/50 text-ink-muted"
                                }`}
                              >
                                {type.replace('_', ' ')}
                              </button>
                            ))}
                          </div>
                          {expandedFruitType.length > 0 && (
                            <>
                              {expandedFruitType.map(type => (
                                <div key={type} className="flex flex-wrap gap-2 rounded-2xl bg-primary/30 p-4 border border-border/40">
                                  {options[type].map(opt => (
                                <button
                                  key={opt}
                                  onClick={() => {
                                    const next = selectedDescriptors.includes(opt)
                                      ? selectedDescriptors.filter(d => d !== opt)
                                      : [...selectedDescriptors, opt];
                                    setSelectedDescriptors(next);
                                  }}
                                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                                    selectedDescriptors.includes(opt) ? "border-accent bg-accent/15 text-accent-text" : "border-border bg-surface/30 text-ink-muted"
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div key={familyId} className="space-y-4">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{family.emoji}</span>
                          <div className="text-xs font-bold uppercase tracking-wider text-ink">{family.label}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {options.map(opt => (
                            <button
                              key={opt}
                              onClick={() => {
                                const next = selectedDescriptors.includes(opt)
                                  ? selectedDescriptors.filter(d => d !== opt)
                                  : [...selectedDescriptors, opt];
                                setSelectedDescriptors(next);
                              }}
                              className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                                selectedDescriptors.includes(opt) ? "border-accent bg-accent/15 text-accent-text" : "border-border bg-surface/30 text-ink-muted"
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setBrewStep(2)}
                    className="rounded-3xl border border-border py-4 text-base font-semibold text-ink transition active:bg-surface"
                  >
                    BACK
                  </button>
                  <button
                    onClick={() => setBrewStep(4)}
                    className="rounded-3xl bg-accent py-4 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-accent/90"
                  >
                    NEXT
                  </button>
                </div>
              </div>
            )}

            {brewStep === 4 && (
              <div className="space-y-8 pb-12">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">Step 4 of 4 — Your Tasting Notes</div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(s => (
                      <div key={s} className={`h-1.5 w-1.5 rounded-full ${s <= 4 ? 'bg-accent' : 'bg-surface'}`} />
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-border/60 bg-surface/30 p-6 shadow-sm">
                  <p className="text-lg font-medium leading-relaxed text-ink">"Here are the flavor notes you identified."</p>
                </div>

                {/* One combined dark "bag label" card — dashed amber rules evoke a printed label */}
                <BagLabelCard className="bg-surface/40">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted mb-1">Single Origin Roast</div>
                    <h3 className="text-2xl font-black uppercase tracking-tight text-ink mb-0.5">{brewBeanName || "Unnamed Bean"}</h3>
                    {(() => {
                      if (brewLinkedRoastId) {
                        const roasts = (() => {
                          try {
                            return JSON.parse(localStorage.getItem("roasts") || "[]");
                          } catch (e) {
                            return [];
                          }
                        })();
                        const roast = roasts.find(r => String(r.id) === brewLinkedRoastId);
                        if (roast) return <div className="text-[11px] font-bold text-ink-muted uppercase tracking-widest">{roast.targetLevel}</div>;
                      }
                      return null;
                    })()}
                    <div className="mt-2 text-sm font-bold tracking-wide text-ink">
                      {[brewDevice || brewMethod, brewRatio === "Custom" ? customRatio : brewRatio, brewTemp ? `${brewTemp}°F` : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>

                    <div className="w-12 h-[2px] bg-accent my-5" />

                    <div className="space-y-2">
                      <div className="text-lg font-bold text-accent-text tracking-tight leading-relaxed italic">
                        {selectedDescriptors?.join(' · ')}
                      </div>
                      <div className="text-sm font-medium text-ink-muted">
                        Acidity: {["Delicate", "Mild", "Balanced", "Bright", "Sharp"][acidityRating-1]} <span className="mx-2">·</span> Body: {["Watery", "Delicate", "Medium", "Round", "Syrupy"][bodyRating-1]}
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">Overall Rating</div>
                      <div className="mt-3 flex justify-center">
                        <StarRatingInput value={brewRating} onChange={setBrewRating} />
                      </div>
                    </div>

                    <div className="mt-5 w-full">
                      <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">Brew again?</div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {['Yes', 'No', 'Maybe'].map(opt => (
                          <button
                            key={opt}
                            onClick={() => setBrewAgain(opt)}
                            className={`rounded-2xl border py-3 text-sm font-bold transition ${
                              brewAgain === opt ? "border-accent bg-accent/20 text-accent-text" : "border-border bg-surface/50 text-ink-muted"
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                </BagLabelCard>

                {/* Free-text notes stay a separate labeled field below the label card */}
                <label className="block">
                  <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">Free Notes</div>
                  <textarea
                    value={brewNotes}
                    onChange={(e) => setBrewNotes(e.target.value)}
                    placeholder="Any additional thoughts on this cup?"
                    className="mt-4 min-h-[120px] w-full rounded-3xl border border-border bg-primary/40 p-5 text-sm text-ink placeholder:text-ink-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setBrewStep(3)}
                    className="rounded-3xl border border-border py-4 text-base font-semibold text-ink transition active:bg-surface"
                  >
                    BACK
                  </button>
                  <button
                    onClick={handleSaveBrew}
                    className="rounded-3xl bg-accent py-4 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-accent/90"
                  >
                    SAVE TASTING NOTE
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "History" && (
          <div className="space-y-4">
            <div className="flex rounded-2xl bg-surface p-1">
              <button
                onClick={() => setHistorySegment("ROASTS")}
                className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition ${
                  historySegment === "ROASTS" ? "bg-accent text-zinc-950" : "text-ink-muted"
                }`}
              >
                ROASTS
              </button>
              <button
                onClick={() => setHistorySegment("TASTINGS")}
                className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition ${
                  historySegment === "TASTINGS" ? "bg-accent text-zinc-950" : "text-ink-muted"
                }`}
              >
                TASTINGS
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder={`Search ${historySegment.toLowerCase()} by bean name...`}
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full rounded-2xl border border-border/70 bg-surface/40 px-4 py-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>

            {historySegment === "ROASTS" ? (
              !selectedRoast ? (
                <div className="space-y-3">
                  {(() => {
                    const allRoasts = (() => {
                      try {
                        const stored = localStorage.getItem("roasts");
                        const parsed = JSON.parse(stored || "[]");
                        return Array.isArray(parsed) ? parsed : [];
                      } catch (e) {
                        console.warn("Failed to parse roasts", e);
                        return [];
                      }
                    })();
                    const savedRoasts = historySearch
                      ? (allRoasts || []).filter(r => r.beanName?.toLowerCase().includes(historySearch.toLowerCase()))
                      : allRoasts;

                    // Distinct empty states: nothing logged yet vs. no search results.
                    if (!allRoasts || allRoasts.length === 0) {
                      return (
                        <div className="rounded-3xl border border-border/60 bg-surface/10 p-8 text-center">
                          <div className="text-sm font-semibold text-ink">No roasts yet</div>
                          <div className="mt-1 text-xs text-ink-muted">
                            Your roast history will build here as you log sessions.
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab("Roast")}
                            className="mt-4 rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-amber-400 active:scale-95"
                          >
                            START YOUR FIRST ROAST
                          </button>
                        </div>
                      );
                    }
                    if (savedRoasts.length === 0) {
                      return (
                        <div className="rounded-3xl border border-border/60 bg-surface/10 p-8 text-center">
                          <div className="text-ink-muted text-sm">
                            No roasts match “{historySearch}”.
                          </div>
                        </div>
                      );
                    }

                    return (savedRoasts || []).map((roast) => (
                      <button
                        key={roast.id}
                        type="button"
                        onClick={() => setSelectedRoast(roast)}
                        className="group flex w-full items-stretch gap-3 rounded-3xl border border-border/60 bg-surface/30 p-4 text-left transition hover:bg-surface/50 active:scale-[0.98]"
                      >
                        {/* Semantic roast-level accent bar (light tan → dark roast) */}
                        <span
                          className="w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: roastLevelColor(roast.targetLevel) }}
                        />
                        {/* Name truncates to one line — the full name lives in the detail view */}
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[15px] font-bold tracking-tight text-ink transition group-hover:text-accent-text">
                              {shortBeanName(roast.beanName)}
                            </div>
                            <div className="mt-1 font-mono text-[11px] tabular-nums text-ink-muted">
                              {(roast.date || "").split(",")[0]}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-mono text-sm font-semibold tabular-nums text-accent-text">
                              {roast.duration}
                            </div>
                            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-primary/40 px-2 py-0.5">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: roastLevelColor(roast.targetLevel) }}
                              />
                              <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                                {roast.targetLevel?.split(" ")[0]}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ));
                  })()}
                </div>
              ) : (
                <div className="space-y-4 pb-10">
                  <button
                    onClick={() => setSelectedRoast(null)}
                    className="flex items-center gap-2 text-xs font-semibold text-ink-muted hover:text-ink transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    BACK TO HISTORY
                  </button>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      {!isEditingRoast ? (
                        <button
                          onClick={() => startEditing(selectedRoast)}
                          className="rounded-xl bg-surface px-4 py-2 text-xs font-bold text-ink hover:bg-card transition"
                        >
                          EDIT ROAST
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setIsEditingRoast(false);
                            setEditedRoast(null);
                            setHasChanges(false);
                          }}
                          className="rounded-xl bg-error/20 px-4 py-2 text-xs font-bold text-error-text hover:bg-error/30 transition"
                        >
                          CANCEL EDIT
                        </button>
                      )}
                    </div>
                    {hasChanges && (
                      <button
                        onClick={handleSaveEdit}
                        className="rounded-xl bg-green-600 px-6 py-2 text-xs font-bold text-white shadow-lg shadow-green-600/20 animate-pulse hover:bg-green-500 transition"
                      >
                        SAVE CHANGES
                      </button>
                    )}
                  </div>

                  <section className="rounded-3xl border border-border/60 bg-surface/30 p-5 shadow-sm">
                    {!isEditingRoast ? (
                      <>
                        <div className="text-xs font-medium uppercase tracking-wider text-ink-muted">{selectedRoast.date}</div>
                        <div className="mt-2 text-2xl font-bold tracking-tight text-ink">{selectedRoast.beanName}</div>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <label className="block">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-1">Date/Time</div>
                          <input 
                            type="text" 
                            value={editedRoast.date} 
                            onChange={(e) => updateEditedRoast('date', e.target.value)}
                            className="w-full bg-primary/40 border border-border rounded-xl px-4 py-2 text-sm text-ink"
                          />
                        </label>
                        <label className="block">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-1">Bean Name</div>
                          <input 
                            type="text" 
                            value={editedRoast.beanName} 
                            onChange={(e) => updateEditedRoast('beanName', e.target.value)}
                            className="w-full bg-primary/40 border border-border rounded-xl px-4 py-2 text-sm text-ink"
                          />
                        </label>
                      </div>
                    )}
                    <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border/50 pt-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-ink-muted">Green Weight</div>
                        {!isEditingRoast ? (
                          /* IDEA-009: display-layer weight unit conversion */
                          <div className="text-sm font-medium text-ink">{toDisplayWeight(selectedRoast.greenWeight)}</div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              value={editedRoast.greenWeight} 
                              onChange={(e) => updateEditedRoast('greenWeight', e.target.value)}
                              className="w-20 bg-primary/40 border border-border rounded-lg px-2 py-1 text-sm text-ink"
                            />
                            <span className="text-sm text-ink-muted">g</span>
                          </div>
                        )}
                      </div>
                      <div className="col-span-1">
                        <div className="text-[10px] uppercase tracking-widest text-ink-muted">Roasted Weight</div>
                        {!isEditingRoast ? (
                          /* IDEA-009: display-layer weight unit conversion */
                          <div className="text-sm font-medium text-ink">{selectedRoast.roastedWeight ? toDisplayWeight(selectedRoast.roastedWeight) : "—"}</div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              value={editedRoast.roastedWeight || ""} 
                              onChange={(e) => updateEditedRoast('roastedWeight', e.target.value)}
                              className="w-20 bg-primary/40 border border-border rounded-lg px-2 py-1 text-sm text-ink"
                              placeholder="0"
                            />
                            <span className="text-sm text-ink-muted">g</span>
                          </div>
                        )}
                      </div>
                      <div className="col-span-1">
                        <div className="text-[10px] uppercase tracking-widest text-ink-muted">Duration</div>
                        {!isEditingRoast ? (
                          <div className="text-sm font-medium text-accent-text">{selectedRoast.duration}</div>
                        ) : (() => {
                          const coolingStart = editedRoast.roastLog.find(e => e.label === "COOLING START");
                          const durationSeconds = coolingStart ? coolingStart.t : editedRoast.totalSeconds;
                          return (
                            <div className="text-sm font-bold text-accent-text font-mono">
                              {formatTime(durationSeconds)}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="col-span-1">
                        <div className="text-[10px] uppercase tracking-widest text-error-text">Dev Time</div>
                        {!isEditingRoast ? (
                          <div className="text-sm font-bold text-error-text">{selectedRoast.devSeconds}s</div>
                        ) : (() => {
                          const firstCrack = editedRoast.roastLog.find(e => e.label === "FIRST CRACK");
                          const coolingStart = editedRoast.roastLog.find(e => e.label === "COOLING START");
                          const devSeconds = (firstCrack && coolingStart) ? (coolingStart.t - firstCrack.t) : editedRoast.devSeconds;
                          return (
                            <div className="text-sm font-bold text-error-text font-mono">
                              {devSeconds}s
                            </div>
                          );
                        })()}
                      </div>
                      <div className="col-span-2">
                        <div className="text-[10px] uppercase tracking-widest text-ink-muted">Roast Level</div>
                        {!isEditingRoast ? (
                          <div className="text-sm font-medium text-ink">{selectedRoast.targetLevel}</div>
                        ) : (
                          <select
                            value={editedRoast.targetLevel}
                            onChange={(e) => updateEditedRoast('targetLevel', e.target.value)}
                            className="mt-1 w-full bg-primary/40 border border-border rounded-xl px-3 py-2 text-sm text-ink"
                          >
                            {ROAST_LEVEL_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    {!isEditingRoast && (
                      <div className="mt-6 border-t border-border/50 pt-6">
                        <RoastCurveChart roast={selectedRoast} />
                      </div>
                    )}
                  </section>

                  {selectedRoast.profile && (
                    <section className="rounded-3xl border border-border/60 bg-surface/20 p-5">
                      <div className="text-xs font-medium uppercase tracking-wider text-ink-muted mb-4">Profile vs Actual</div>
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-ink-muted uppercase tracking-widest px-2">
                          <div>Planned</div>
                          <div>Actual Adjustment</div>
                        </div>
                        {selectedRoast.profile.steps.map((step, idx) => {
                          const stepSeconds = step.totalSeconds !== undefined ? step.totalSeconds : parseMMSS(step.time);
                          const actual = selectedRoast.roastLog.find(e => e.t === stepSeconds && e.type === 'adjustment');
                          
                          return (
                            <div key={idx} className="grid grid-cols-2 gap-2">
                              <div className="bg-primary/30 border border-border/50 rounded-xl p-2">
                                <div className="text-[10px] font-mono text-ink-muted">{step.time}</div>
                                <div className="text-xs font-bold text-ink">H{step.heat} F{step.fan}</div>
                              </div>
                              <div className={`rounded-xl p-2 border ${actual ? "bg-accent/10 border-accent/20" : "bg-error/5 border-error/10 opacity-50"}`}>
                                {actual ? (
                                  <>
                                    <div className="text-[10px] font-mono text-accent-text/60">{formatTime(actual.t)}</div>
                                    <div className="text-xs font-bold text-accent-text">H{actual.heat} F{actual.fan}</div>
                                  </>
                                ) : (
                                  <div className="text-[10px] italic text-error-text/60 mt-1">Missed</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  <section className="rounded-3xl border border-border/60 bg-surface/20 p-5">
                    <div className="text-xs font-medium uppercase tracking-wider text-ink-muted">Roast Timeline</div>
                    <div className="mt-4 space-y-3">
                      {!(!isEditingRoast ? selectedRoast.roastLog : editedRoast.roastLog) || (!isEditingRoast ? selectedRoast.roastLog : editedRoast.roastLog).length === 0 ? (
                        <div className="text-xs text-ink-muted">No events logged.</div>
                      ) : (
                        (!isEditingRoast ? selectedRoast.roastLog : editedRoast.roastLog).map((entry, i) => (
                          <div key={i} className="border-b border-border/30 pb-2 last:border-0 last:pb-0">
                            {entry.type === 'phase' ? (
                              <div className="flex items-center justify-between rounded-xl bg-accent/10 px-3 py-2 border border-accent/20">
                                {!isEditingRoast ? (
                                  <div className="text-sm font-bold uppercase tracking-wide text-accent-text">
                                    {entry.label}
                                  </div>
                                ) : (
                                  <input 
                                    type="text" 
                                    value={entry.label} 
                                    onChange={(e) => updateLogEntry(i, 'label', e.target.value)}
                                    className="bg-transparent border-none p-0 text-sm font-bold uppercase tracking-wide text-accent-text focus:ring-0 w-32"
                                  />
                                )}
                                {!isEditingRoast ? (
                                  <div className="font-mono text-sm font-semibold text-accent-text">
                                    {formatTime(entry.t)}
                                  </div>
                                ) : (
                                  <input 
                                    type="text" 
                                    value={formatTime(entry.t)} 
                                    onChange={(e) => {
                                      const parts = e.target.value.split(':');
                                      if (parts.length === 2) {
                                        const seconds = (parseInt(parts[0]) * 60) + parseInt(parts[1]);
                                        updateLogEntry(i, 't', isNaN(seconds) ? entry.t : seconds);
                                      }
                                    }}
                                    className="bg-primary/40 border border-border rounded-lg px-2 py-0.5 text-xs font-mono text-accent-text w-16 text-right"
                                  />
                                )}
                              </div>
                            ) : entry.type === 'start_settings' ? (
                              <div className="flex items-center justify-between px-1">
                                {!isEditingRoast ? (
                                  <div className="font-mono text-sm text-accent-text">
                                    {formatTime(entry.t)}
                                  </div>
                                ) : (
                                  <input 
                                    type="text" 
                                    value={formatTime(entry.t)} 
                                    onChange={(e) => {
                                      const parts = e.target.value.split(':');
                                      if (parts.length === 2) {
                                        const seconds = (parseInt(parts[0]) * 60) + parseInt(parts[1]);
                                        updateLogEntry(i, 't', isNaN(seconds) ? entry.t : seconds);
                                      }
                                    }}
                                    className="bg-primary/40 border border-border rounded-lg px-2 py-0.5 text-xs font-mono text-accent-text w-16"
                                  />
                                )}
                                <div className="flex items-center gap-2">
                                  <div className="text-xs text-ink-muted flex items-center gap-1">
                                    F:
                                    {!isEditingRoast ? (
                                      <span className="font-semibold text-ink">{entry.fan || "—"}</span>
                                    ) : (
                                      <input type="text" value={entry.fan} onChange={(e) => updateLogEntry(i, 'fan', e.target.value)} className="w-6 bg-primary/40 border border-border rounded px-1 text-ink" />
                                    )}
                                    <span className="mx-0.5">·</span>
                                    H:
                                    {!isEditingRoast ? (
                                      <span className="font-semibold text-ink">{entry.heat || "—"}</span>
                                    ) : (
                                      <input type="text" value={entry.heat} onChange={(e) => updateLogEntry(i, 'heat', e.target.value)} className="w-6 bg-primary/40 border border-border rounded px-1 text-ink" />
                                    )}
                                    <span className="mx-0.5">·</span>
                                    T:
                                    {!isEditingRoast ? (
                                      <span className="font-semibold text-ink">{toDisplayTemp(entry.temp)}</span>
                                    ) : (
                                      <input type="text" value={entry.temp} onChange={(e) => updateLogEntry(i, 'temp', e.target.value)} className="w-12 bg-primary/40 border border-border rounded px-1 text-ink" />
                                    )}
                                  </div>
                                  <div className="ml-1 rounded-md bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-text border border-accent/30">
                                    {entry.label}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between px-1">
                                {!isEditingRoast ? (
                                  <div className="font-mono text-sm text-accent-text">
                                    {formatTime(entry.t)}
                                  </div>
                                ) : (
                                  <input 
                                    type="text" 
                                    value={formatTime(entry.t)} 
                                    onChange={(e) => {
                                      const parts = e.target.value.split(':');
                                      if (parts.length === 2) {
                                        const seconds = (parseInt(parts[0]) * 60) + parseInt(parts[1]);
                                        updateLogEntry(i, 't', isNaN(seconds) ? entry.t : seconds);
                                      }
                                    }}
                                    className="bg-primary/40 border border-border rounded-lg px-2 py-0.5 text-xs font-mono text-accent-text w-16"
                                  />
                                )}
                                <div className="text-xs text-ink-muted flex items-center gap-1">
                                  F:
                                  {!isEditingRoast ? (
                                    <span className="font-semibold text-ink">{entry.fan || "—"}</span>
                                  ) : (
                                    <input type="text" value={entry.fan} onChange={(e) => updateLogEntry(i, 'fan', e.target.value)} className="w-6 bg-primary/40 border border-border rounded px-1 text-ink" />
                                  )}
                                  <span className="mx-0.5">·</span>
                                  H:
                                  {!isEditingRoast ? (
                                    <span className="font-semibold text-ink">{entry.heat || "—"}</span>
                                  ) : (
                                    <input type="text" value={entry.heat} onChange={(e) => updateLogEntry(i, 'heat', e.target.value)} className="w-6 bg-primary/40 border border-border rounded px-1 text-ink" />
                                  )}
                                  <span className="mx-0.5">·</span>
                                  T:
                                  {!isEditingRoast ? (
                                    <span className="font-semibold text-ink">{toDisplayTemp(entry.temp)}</span>
                                  ) : (
                                    <input type="text" value={entry.temp} onChange={(e) => updateLogEntry(i, 'temp', e.target.value)} className="w-12 bg-primary/40 border border-border rounded px-1 text-ink" />
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <div className="pt-4">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete({ type: "roast", id: selectedRoast.id })}
                      className="w-full rounded-2xl border border-error/30 bg-error/10 py-3 text-sm font-semibold text-error-text transition hover:bg-error/20 active:bg-error/30"
                    >
                      DELETE ROAST
                    </button>
                  </div>
                </div>
              )
            ) : (
              !selectedTastingNote ? (
                <div className="space-y-3">
                  {(() => {
                    let savedTastings = (() => {
                      try {
                        return JSON.parse(localStorage.getItem("tastingNotes") || "[]");
                      } catch (e) {
                        console.warn("Failed to parse tastingNotes", e);
                        return [];
                      }
                    })();
                    if (historySearch) {
                      savedTastings = (savedTastings || []).filter(t => (t.beanName || "Unknown Bean").toLowerCase().includes(historySearch.toLowerCase()));
                    }
                    if (!savedTastings || savedTastings.length === 0) {
                      return (
                        <div className="rounded-3xl border border-border/60 bg-surface/10 p-8 text-center">
                          <div className="text-ink-muted text-sm">
                            {historySearch ? "No matching tastings found." : "No tasting notes yet. Complete your first tasting in the Brew tab."}
                          </div>
                        </div>
                      );
                    }
                    return savedTastings.map((tasting) => (
                      <button
                        key={tasting.id}
                        type="button"
                        onClick={() => setSelectedTastingNote(tasting)}
                        className="w-full rounded-3xl border border-border/60 bg-surface/20 p-5 text-left transition hover:bg-surface/35 active:scale-[0.98]"
                      >
                        <div className="mb-1 flex items-start justify-between gap-3">
                          <div className="min-w-0 truncate text-[15px] font-bold text-ink">{shortBeanName(tasting.beanName) || "Unknown Bean"}</div>
                          <div className="shrink-0 pt-0.5">
                            <StarRow rating={tasting.rating} size={12} />
                          </div>
                        </div>
                        <div className="mb-3 font-mono text-[11px] tabular-nums text-ink-muted">{(tasting.date || "").split(",")[0]} · {tasting.method}</div>
                        
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {tasting.descriptors?.slice(0, 3).map((d, i) => (
                            <span key={i} className="rounded-full bg-accent/10 border border-accent/20 px-2.5 py-0.5 text-[10px] font-bold text-accent-text">
                              {d}
                            </span>
                          ))}
                          {tasting.descriptors?.length > 3 && (
                            <span className="text-[10px] font-bold text-ink-muted py-0.5">+{tasting.descriptors.length - 3} more</span>
                          )}
                        </div>
                        
                        <div className="text-[10px] font-bold tracking-wider text-ink-muted uppercase">
                          Acidity {tasting.acidity} <span className="mx-1">·</span> Body {tasting.body}
                        </div>
                      </button>
                    ));
                  })()}
                </div>
              ) : (
                <div className="space-y-6 pb-20">
                  <button
                    onClick={() => setSelectedTastingNote(null)}
                    className="flex items-center gap-2 text-xs font-semibold text-ink-muted hover:text-ink transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    BACK TO HISTORY
                  </button>

                  <section className="rounded-3xl border border-border/60 bg-surface/30 p-6 shadow-sm">
                    <div className="text-xs font-medium uppercase tracking-wider text-ink-muted">{selectedTastingNote.date}</div>
                    <h2 className="mt-2 text-3xl font-bold text-ink leading-tight">{selectedTastingNote.beanName || "Unknown Bean"}</h2>
                    <div className="mt-1 text-sm font-medium text-accent-text/80">{selectedTastingNote.method} · {selectedTastingNote.device}</div>
                    
                    <div className="mt-8 space-y-6 border-t border-border/50 pt-6">
                      <div className="grid grid-cols-2 gap-y-5 gap-x-8">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-1">Ratio</div>
                          <div className="text-sm font-bold text-ink">{selectedTastingNote.ratio}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-1">Grind</div>
                          <div className="text-sm font-bold text-ink">{selectedTastingNote.grindSize}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-1">Temp</div>
                          <div className="text-sm font-bold text-ink">{selectedTastingNote.temp}°F</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-1">Rating</div>
                          <div className="mt-0.5">
                            <StarRow rating={selectedTastingNote.rating} size={14} />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-2">Acidity: {["Flat", "Low", "Medium", "Bright", "Vibrant"][selectedTastingNote.acidity-1]} ({selectedTastingNote.acidity})</div>
                          <div className="h-2 w-full rounded-full bg-surface overflow-hidden">
                            <div className="h-full bg-accent shadow-[0_0_8px_rgba(245,158,11,0.4)]" style={{ width: `${(selectedTastingNote.acidity / 5) * 100}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-2">Body: {["Watery", "Light", "Medium", "Full", "Syrupy"][selectedTastingNote.body-1]} ({selectedTastingNote.body})</div>
                          <div className="h-2 w-full rounded-full bg-surface overflow-hidden">
                            <div className="h-full bg-accent shadow-[0_0_8px_rgba(245,158,11,0.4)]" style={{ width: `${(selectedTastingNote.body / 5) * 100}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {selectedTastingNote.families?.map(familyId => (
                          <div key={familyId}>
                            <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-2">
                              {FLAVOR_FAMILIES.find(f => f.id === familyId)?.label}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {(selectedTastingNote.descriptors || [])?.filter(d => {
                                const familyOptions = FLAVOR_DRILLDOWN[familyId];
                                if (typeof familyOptions === 'object' && !Array.isArray(familyOptions)) {
                                  return Object.values(familyOptions).flat().includes(d);
                                }
                                return (familyOptions || []).includes(d);
                              }).map((d, i) => (
                                <span key={i} className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent-text">
                                  {d}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <BagLabelCard className="bg-primary/40">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted mb-1">Tasting Summary</div>
                          <h3 className="text-xl font-black uppercase tracking-tight text-ink mb-0.5">{selectedTastingNote.beanName || "Unknown Bean"}</h3>
                          <div className="w-10 h-[2px] bg-accent my-4" />
                          <div className="text-base font-bold text-accent-text tracking-tight italic leading-relaxed">
                            {selectedTastingNote.descriptors?.slice(0, 5).join(' · ')}
                          </div>
                      </BagLabelCard>

                      {selectedTastingNote.notes && (
                        <div className="rounded-2xl bg-primary/40 p-5 border border-border/40">
                          <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-2">Free Notes</div>
                          <p className="text-sm italic text-ink leading-relaxed font-medium">"{selectedTastingNote.notes}"</p>
                        </div>
                      )}
                    </div>
                  </section>

                  <div className="pt-4">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete({ type: "tasting", id: selectedTastingNote.id })}
                      className="w-full rounded-2xl border border-error/30 bg-error/10 py-3 text-sm font-semibold text-error-text transition hover:bg-error/20 active:bg-error/30"
                    >
                      DELETE TASTING
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {activeTab === "Beans" && (
          <div className="space-y-4">
            {beansView === "list" && (
              <div className="space-y-6">
                <header className="flex items-center justify-between">
                  <h1 className="text-3xl font-black tracking-tight text-ink">RoastLogs</h1>
                  <div className="flex gap-2">        
                    <button
                      onClick={() => {
                        setNewBean({ ...EMPTY_BEAN_FORM });
                        setBeansView("addBean");
                      }}
                      className="rounded-2xl bg-accent px-4 py-2 text-xs font-bold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:scale-95"
                    >
                      ADD BEAN
                    </button>
                  </div>
                </header>

                <div className="space-y-3">
                  {(() => {
                    const roasts = (() => {
                      try {
                        return JSON.parse(localStorage.getItem("roasts") || "[]");
                      } catch (e) {
                        return [];
                      }
                    })();
                    const tastings = (() => {
                      try {
                        return JSON.parse(localStorage.getItem("tastingNotes") || "[]");
                      } catch (e) {
                        return [];
                      }
                    })();
                    const manualBeans = (() => {
                      try {
                        return JSON.parse(localStorage.getItem("beans") || "[]");
                      } catch (e) {
                        return [];
                      }
                    })();

                    // Gather all unique bean names
                    const allBeanNames = Array.from(new Set([
                      ...(roasts || []).map(r => r.beanName),
                      ...(tastings || []).map(t => t.beanName),
                      ...(manualBeans || []).map(b => b.name)
                    ])).filter(Boolean);

                    if (allBeanNames.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                          <div className="rounded-3xl border border-border/60 bg-surface/10 p-8">
                            <p className="max-w-[240px] text-sm text-ink-muted leading-relaxed">
                              No beans yet. Beans appear automatically when you log a roast or complete a tasting, or tap Add Bean to add one manually.
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return allBeanNames.map(name => {
                      const beanRoasts = (roasts || []).filter(r => r.beanName === name);
                      const beanTastings = (tastings || []).filter(t => t.beanName === name);
                      const manualData = (manualBeans || []).find(b => b.name === name);
                      
                      // Calculate average rating
                      const ratings = (beanTastings || []).map(t => Number(t.rating)).filter(r => r > 0);
                      const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;
                      
                      // Find most recent activity date
                      const allDates = [
                        ...beanRoasts.map(r => new Date(r.date)),
                        ...beanTastings.map(t => new Date(t.date))
                      ].filter(d => !isNaN(d.getTime()));
                      const recentDate = allDates.length > 0 ? new Date(Math.max(...allDates)).toLocaleDateString() : "No activity";

                      return (
                        <button
                          key={name}
                          onClick={() => {
                            setIsAdjustingWeight(false);
                            setSelectedBean({ name, ...manualData });
                            setBeansView("beanDetail");
                          }}
                          className="flex w-full items-center gap-4 rounded-3xl border border-border/60 bg-surface/20 p-4 text-left transition hover:bg-surface/35 active:scale-[0.98]"
                        >
                          {/* Monogram avatar — beans have no photo field, this is the honest anchor */}
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/60 text-lg font-black text-accent-text ring-2 ring-accent/40">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-base font-bold text-ink">{name}</div>
                                {manualData?.origin && (
                                  <div className="truncate text-[11px] text-ink-muted">{manualData.origin}</div>
                                )}
                              </div>
                              {avgRating && (
                                <div className="flex shrink-0 items-center gap-1 text-accent-text">
                                  <span className="text-xs font-bold tabular-nums">{avgRating}</span>
                                  <Star size={12} fill={1} />
                                </div>
                              )}
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="flex gap-1.5">
                                <span className="rounded-full border border-border bg-primary/40 px-2 py-0.5 text-[10px] font-bold text-ink-muted">
                                  {beanRoasts.length} roasts
                                </span>
                                <span className="rounded-full border border-border bg-primary/40 px-2 py-0.5 text-[10px] font-bold text-ink-muted">
                                  {beanTastings.length} tastings
                                </span>
                              </div>
                              <div className="shrink-0 text-[10px] uppercase tracking-wider text-ink-muted">
                                Last: {recentDate}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {(beansView === "addBean" || beansView === "editBean") && (() => {
              const isEditMode = beansView === "editBean";
              const fieldClass = "mt-2 w-full rounded-2xl border border-border/70 bg-primary/40 px-4 py-3 text-sm text-ink focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20";
              const sectionLabelClass = "text-[10px] font-black uppercase tracking-[0.15em] text-ink-muted mb-3";
              return (
              <div className="space-y-6">
                <button
                  onClick={() => setBeansView(isEditMode ? "beanDetail" : "list")}
                  className="flex items-center gap-2 text-xs font-semibold text-ink-muted hover:text-ink transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  {isEditMode ? "BACK TO BEAN" : "BACK TO BEANS"}
                </button>

                <header>
                  <h2 className="text-2xl font-bold text-ink">{isEditMode ? "Edit Bean" : "Add New Bean"}</h2>
                </header>

                <div className="space-y-6 rounded-3xl border border-border/60 bg-surface/30 p-6 shadow-sm">
                  <div className="space-y-4">
                    <label className="block">
                      <div className="text-xs font-medium text-ink">Bean Name (Required)</div>
                      <input
                        type="text"
                        value={newBean.name}
                        onChange={(e) => setNewBean({ ...newBean, name: e.target.value })}
                        placeholder="e.g., Ethiopia Yirgacheffe"
                        disabled={isEditMode}
                        className={`${fieldClass} disabled:opacity-60`}
                      />
                      {isEditMode && (
                        <div className="mt-1 text-[11px] text-ink-muted">Name can't be changed here — it's how this bean is linked to its roast and tasting history.</div>
                      )}
                    </label>

                    <div className="grid grid-cols-2 gap-4">
                      <label className="block">
                        <div className="text-xs font-medium text-ink">Country of Origin</div>
                        <input
                          type="text"
                          value={newBean.origin}
                          onChange={(e) => setNewBean({ ...newBean, origin: e.target.value })}
                          placeholder="e.g., Ethiopia"
                          className={fieldClass}
                        />
                      </label>
                      <label className="block">
                        <div className="text-xs font-medium text-ink">Producer</div>
                        <input
                          type="text"
                          value={newBean.producer}
                          onChange={(e) => setNewBean({ ...newBean, producer: e.target.value })}
                          placeholder="Optional"
                          className={fieldClass}
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className={sectionLabelClass}>Origin Details</div>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <label className="block">
                          <div className="text-xs font-medium text-ink">Region</div>
                          <input
                            type="text"
                            value={newBean.region}
                            onChange={(e) => setNewBean({ ...newBean, region: e.target.value })}
                            placeholder="e.g., Yirgacheffe"
                            className={fieldClass}
                          />
                        </label>
                        <label className="block">
                          <div className="text-xs font-medium text-ink">Variety</div>
                          <input
                            type="text"
                            value={newBean.variety}
                            onChange={(e) => setNewBean({ ...newBean, variety: e.target.value })}
                            placeholder="e.g., Heirloom"
                            className={fieldClass}
                          />
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <label className="block">
                          <div className="text-xs font-medium text-ink">Process</div>
                          <input
                            type="text"
                            value={newBean.process}
                            onChange={(e) => setNewBean({ ...newBean, process: e.target.value })}
                            placeholder="e.g., Washed"
                            className={fieldClass}
                          />
                        </label>
                        <label className="block">
                          <div className="text-xs font-medium text-ink">Altitude (MASL)</div>
                          <input
                            type="number"
                            value={newBean.masl}
                            onChange={(e) => setNewBean({ ...newBean, masl: e.target.value })}
                            placeholder="e.g., 1900"
                            className={fieldClass}
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className={sectionLabelClass}>Purchase</div>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <label className="block">
                          <div className="text-xs font-medium text-ink">Purchase Date</div>
                          <input
                            type="date"
                            value={newBean.purchaseDate}
                            onChange={(e) => setNewBean({ ...newBean, purchaseDate: e.target.value })}
                            className={fieldClass}
                          />
                        </label>
                        <label className="block">
                          <div className="text-xs font-medium text-ink">Purchase Weight (g)</div>
                          <input
                            type="number"
                            value={newBean.purchaseWeight}
                            onChange={(e) => setNewBean({ ...newBean, purchaseWeight: e.target.value })}
                            placeholder="e.g., 1000"
                            className={fieldClass}
                          />
                        </label>
                      </div>
                      <label className="block">
                        <div className="text-xs font-medium text-ink">Sourced From</div>
                        <input
                          type="text"
                          value={newBean.sourcedFrom}
                          onChange={(e) => setNewBean({ ...newBean, sourcedFrom: e.target.value })}
                          placeholder="e.g., Sweet Maria's"
                          className={fieldClass}
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className={sectionLabelClass}>Notes</div>
                    <div className="space-y-4">
                      <label className="block">
                        <div className="text-xs font-medium text-ink">Original Bagged Name</div>
                        <input
                          type="text"
                          value={newBean.baggedName}
                          onChange={(e) => setNewBean({ ...newBean, baggedName: e.target.value })}
                          placeholder="Name printed on the bag, if different"
                          className={fieldClass}
                        />
                      </label>
                      <label className="block">
                        <div className="text-xs font-medium text-ink">Tasting Notes / Flavor Targets</div>
                        <textarea
                          value={newBean.tastingTargets}
                          onChange={(e) => setNewBean({ ...newBean, tastingTargets: e.target.value })}
                          placeholder="Flavor notes listed on the bag, or what you're aiming for"
                          rows={3}
                          className={`${fieldClass} resize-none`}
                        />
                      </label>
                    </div>
                  </div>

                  <button
                    disabled={!newBean.name}
                    onClick={() => {
                      if (isEditMode) {
                        // farm: undefined drops the legacy pre-rename key so producer becomes authoritative;
                        // otherwise a cleared Producer field would keep falling back to the stale farm value.
                        persistBeanUpdate({ ...newBean, name: selectedBean.name, farm: undefined });
                        setNewBean({ ...EMPTY_BEAN_FORM });
                        setBeansView("beanDetail");
                      } else {
                        const existing = readLocalJSON("beans");
                        const savedBean = { ...newBean, id: Date.now(), weightAdjustments: [] };
                        localStorage.setItem("beans", JSON.stringify([...existing, savedBean]));

                        setSyncStatus('syncing');
                        syncBeanToSupabase(savedBean).then(success => {
                          setSyncStatus(success ? 'success' : 'error');
                        });

                        setNewBean({ ...EMPTY_BEAN_FORM });
                        setBeansView("list");
                      }
                    }}
                    className="mt-4 w-full rounded-3xl bg-accent py-4 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-accent/90 disabled:opacity-50 disabled:grayscale"
                  >
                    {isEditMode ? "SAVE CHANGES" : "SAVE BEAN"}
                  </button>
                </div>
              </div>
              );
            })()}

            {beansView === "beanDetail" && selectedBean && (
              <div className="space-y-6 pb-20">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      setIsAdjustingWeight(false);
                      setBeansView("list");
                    }}
                    className="flex items-center gap-2 text-xs font-semibold text-ink-muted hover:text-ink transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    BACK TO BEANS
                  </button>
                  <button
                    onClick={() => {
                      setNewBean({
                        name: selectedBean.name || "",
                        baggedName: selectedBean.baggedName || "",
                        origin: selectedBean.origin || "",
                        region: selectedBean.region || "",
                        producer: selectedBean.producer ?? selectedBean.farm ?? "",
                        variety: selectedBean.variety || "",
                        process: selectedBean.process || "",
                        masl: selectedBean.masl ?? "",
                        sourcedFrom: selectedBean.sourcedFrom || "",
                        purchaseDate: selectedBean.purchaseDate || "",
                        purchaseWeight: selectedBean.purchaseWeight ?? "",
                        tastingTargets: selectedBean.tastingTargets || ""
                      });
                      setBeansView("editBean");
                    }}
                    className="rounded-xl border border-border/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted hover:text-ink hover:border-border transition"
                  >
                    EDIT
                  </button>
                </div>

                <header>
                  <h2 className="text-3xl font-bold text-ink leading-tight">{selectedBean.name}</h2>
                  {selectedBean.baggedName && selectedBean.baggedName !== selectedBean.name && (
                    <div className="mt-1 text-sm italic text-ink-muted">"{selectedBean.baggedName}"</div>
                  )}
                  {(selectedBean.origin || selectedBean.producer || selectedBean.farm) && (
                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-ink-muted">
                      {selectedBean.origin && <span>{selectedBean.origin}</span>}
                      {(selectedBean.producer || selectedBean.farm) && <span>· {selectedBean.producer || selectedBean.farm}</span>}
                    </div>
                  )}
                  {(selectedBean.region || selectedBean.variety || selectedBean.process || selectedBean.masl != null && selectedBean.masl !== "" || selectedBean.sourcedFrom) && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {selectedBean.region && <span className="rounded-full bg-surface/40 border border-border/50 px-2.5 py-1 text-[11px] font-semibold text-ink-muted">{selectedBean.region}</span>}
                      {selectedBean.variety && <span className="rounded-full bg-surface/40 border border-border/50 px-2.5 py-1 text-[11px] font-semibold text-ink-muted">{selectedBean.variety}</span>}
                      {selectedBean.process && <span className="rounded-full bg-surface/40 border border-border/50 px-2.5 py-1 text-[11px] font-semibold text-ink-muted">{selectedBean.process}</span>}
                      {selectedBean.masl != null && selectedBean.masl !== "" && <span className="rounded-full bg-surface/40 border border-border/50 px-2.5 py-1 text-[11px] font-semibold text-ink-muted">{selectedBean.masl} MASL</span>}
                      {selectedBean.sourcedFrom && <span className="rounded-full bg-surface/40 border border-border/50 px-2.5 py-1 text-[11px] font-semibold text-ink-muted">via {selectedBean.sourcedFrom}</span>}
                    </div>
                  )}
                </header>

                {selectedBean.tastingTargets && (
                  <section className="rounded-3xl border border-border/60 bg-surface/30 p-5 shadow-sm">
                    <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-2">Tasting Notes / Flavor Targets</div>
                    <p className="text-sm text-ink whitespace-pre-wrap">{selectedBean.tastingTargets}</p>
                  </section>
                )}

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-[0.15em] text-ink-muted">Saved Profiles</h3>
                    <button
                      onClick={() => setIsProfileBuilderOpen(true)}
                      className="rounded-lg bg-accent/10 border border-accent/20 px-2 py-1 text-[10px] font-bold text-accent-text hover:bg-accent/20 transition"
                    >
                      + NEW PROFILE
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(profiles || []).filter(p => p.beanName === selectedBean.name).length === 0 ? (
                      <p className="text-sm text-ink-muted italic py-2">No profiles saved for this bean.</p>
                    ) : (
                      (profiles || []).filter(p => p.beanName === selectedBean.name).map(p => (
                        <div key={p.id} className="p-4 rounded-2xl bg-surface/30 border border-border/60">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-bold text-ink flex items-center gap-2">
                                {p.name}
                                {p.isDefault && <span className="text-[8px] bg-accent text-zinc-950 px-1 rounded font-black uppercase">Default</span>}
                              </div>
                              <div className="text-[10px] text-ink-muted mt-1">{p.steps.length} steps</div>
                            </div>
                            <div className="flex gap-2">
                              {!p.isDefault && (
                                <button
                                  onClick={() => {
                                    const updated = profiles.map(profile => ({
                                      ...profile,
                                      isDefault: profile.id === p.id && profile.beanName === selectedBean.name
                                    }));
                                    setProfiles(updated);
                                  }}
                                  className="text-[10px] font-bold text-ink-muted hover:text-accent-text transition"
                                >
                                  SET DEFAULT
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setEditingProfileNotesId(p.id);
                                  setProfileNotesDraft(p.notes || "");
                                }}
                                className="text-[10px] font-bold text-ink-muted hover:text-accent-text transition"
                              >
                                NOTES
                              </button>
                              <button
                                onClick={() => setProfiles((profiles || []).filter(profile => profile.id !== p.id))}
                                className="text-[10px] font-bold text-error-text/60 hover:text-error-text transition"
                              >
                                DELETE
                              </button>
                            </div>
                          </div>
                          {p.notes && editingProfileNotesId !== p.id && (
                            <div className="mt-2 text-[11px] text-ink-muted italic truncate">{p.notes}</div>
                          )}
                          {editingProfileNotesId === p.id && (
                            <div className="mt-3 space-y-2">
                              <textarea
                                value={profileNotesDraft}
                                onChange={(e) => setProfileNotesDraft(e.target.value)}
                                placeholder="Notes — tasting result, what you'd change next time..."
                                rows={3}
                                className="w-full rounded-xl bg-primary/40 border border-border px-3 py-2 text-sm text-ink resize-none"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setEditingProfileNotesId(null)}
                                  className="flex-1 py-2 rounded-xl border border-border/60 text-ink font-bold text-xs hover:bg-card transition"
                                >
                                  CANCEL
                                </button>
                                <button
                                  onClick={() => {
                                    setProfiles(profiles.map(pr => pr.id === p.id ? { ...pr, notes: profileNotesDraft } : pr));
                                    setEditingProfileNotesId(null);
                                  }}
                                  className="flex-1 py-2 rounded-xl bg-accent text-zinc-950 font-bold text-xs hover:bg-amber-400 transition"
                                >
                                  SAVE
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {isProfileBuilderOpen && (
                  <ProfileBuilder 
                    bean={selectedBean} 
                    onCancel={() => setIsProfileBuilderOpen(false)}
                    onSave={(newProfile) => {
                      const p = { ...newProfile, id: Date.now(), beanName: selectedBean.name };
                      setProfiles(prev => [...prev, p]);
                      setIsProfileBuilderOpen(false);
                    }}
                  />
                )}

                {(selectedBean.purchaseDate || selectedBean.purchaseWeight) && (
                  <section className="space-y-4 rounded-3xl border border-border/60 bg-surface/30 p-5 shadow-sm">
                    <div className="grid grid-cols-2 gap-4">
                      {selectedBean.purchaseDate && (
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-1">Purchased</div>
                          <div className="text-sm font-bold text-ink">{selectedBean.purchaseDate}</div>
                        </div>
                      )}
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-1">Stock</div>
                        <div className="text-sm font-bold text-ink">
                          {(() => {
                            const roasts = (() => {
                              try {
                                return JSON.parse(localStorage.getItem("roasts") || "[]");
                              } catch (e) {
                                return [];
                              }
                            })();
                            const usedWeight = (roasts || [])
                              .filter(r => r.beanName === selectedBean.name)
                              .reduce((sum, r) => sum + (Number(r.greenWeight) || 0), 0);
                            const adjustmentTotal = (selectedBean.weightAdjustments || [])
                              .reduce((sum, a) => sum + (Number(a.delta) || 0), 0);
                            const remaining = (Number(selectedBean.purchaseWeight) || 0) - usedWeight + adjustmentTotal;
                            return `${remaining}g / ${selectedBean.purchaseWeight}g`;
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-border/40 pt-4">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-ink-muted">Weight Adjustments</h4>
                      <button
                        onClick={() => {
                          setWeightAdjustmentForm({ date: todayLocalDateString(), delta: "", reason: "" });
                          setIsAdjustingWeight(true);
                        }}
                        className="rounded-lg bg-accent/10 border border-accent/20 px-2 py-1 text-[10px] font-bold text-accent-text hover:bg-accent/20 transition"
                      >
                        + ADJUST WEIGHT
                      </button>
                    </div>

                    {isAdjustingWeight && (() => {
                      const adjustFieldClass = "mt-1 w-full rounded-xl border border-border/70 bg-primary/40 px-3 py-2 text-sm text-ink focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20";
                      return (
                      <div className="space-y-3 rounded-2xl border border-border/50 bg-primary/30 p-4">
                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <div className="text-xs font-medium text-ink">Date</div>
                            <input
                              type="date"
                              value={weightAdjustmentForm.date}
                              onChange={(e) => setWeightAdjustmentForm({ ...weightAdjustmentForm, date: e.target.value })}
                              className={adjustFieldClass}
                            />
                          </label>
                          <label className="block">
                            <div className="text-xs font-medium text-ink">Weight Change (g)</div>
                            <input
                              type="number"
                              value={weightAdjustmentForm.delta}
                              onChange={(e) => setWeightAdjustmentForm({ ...weightAdjustmentForm, delta: e.target.value })}
                              placeholder="e.g., -15 or 250"
                              className={adjustFieldClass}
                            />
                          </label>
                        </div>
                        <label className="block">
                          <div className="text-xs font-medium text-ink">Reason</div>
                          <input
                            type="text"
                            value={weightAdjustmentForm.reason}
                            onChange={(e) => setWeightAdjustmentForm({ ...weightAdjustmentForm, reason: e.target.value })}
                            placeholder="e.g., Spilled during grind, Restocked"
                            className={adjustFieldClass}
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setIsAdjustingWeight(false)}
                            className="flex-1 rounded-xl border border-border/60 py-2 text-xs font-bold text-ink-muted hover:text-ink transition"
                          >
                            CANCEL
                          </button>
                          <button
                            disabled={!weightAdjustmentForm.delta || Number(weightAdjustmentForm.delta) === 0}
                            onClick={() => {
                              const entry = {
                                id: Date.now(),
                                date: weightAdjustmentForm.date || todayLocalDateString(),
                                delta: Number(weightAdjustmentForm.delta) || 0,
                                reason: weightAdjustmentForm.reason
                              };
                              persistBeanUpdate({ weightAdjustments: [...(selectedBean.weightAdjustments || []), entry] });
                              setIsAdjustingWeight(false);
                            }}
                            className="flex-1 rounded-xl bg-accent py-2 text-xs font-bold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-accent/90 disabled:opacity-50 disabled:grayscale"
                          >
                            SAVE
                          </button>
                        </div>
                      </div>
                      );
                    })()}

                    {(selectedBean.weightAdjustments || []).length > 0 && (
                      <div className="space-y-2">
                        {[...selectedBean.weightAdjustments].reverse().map(a => (
                          <div key={a.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-surface/15 px-3 py-2">
                            <div>
                              <div className="text-xs font-bold text-ink">{a.reason || "Adjustment"}</div>
                              <div className="text-[10px] text-ink-muted">{a.date}</div>
                            </div>
                            <div className={`text-sm font-mono font-bold ${a.delta >= 0 ? "text-success-text" : "text-error-text"}`}>
                              {a.delta >= 0 ? "+" : ""}{a.delta}g
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-[0.15em] text-ink-muted">Roast Sessions</h3>
                    {(() => {
                      const roasts = (() => {
                        try {
                          return JSON.parse(localStorage.getItem("roasts") || "[]");
                        } catch (e) {
                          return [];
                        }
                      })().filter(r => r.beanName === selectedBean.name);
                      return <span className="text-[10px] font-bold text-accent-text/80 bg-accent/10 px-2 py-0.5 rounded-full">{roasts.length} sessions</span>;
                    })()}
                  </div>

                  {/* IDEA-006: pre-fill the Roast tab Session Header with this bean and jump there */}
                  <button
                    onClick={() => {
                      setPrefillBean({ name: selectedBean.name, origin: selectedBean.origin });
                      setActiveTab("Roast");
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-sm font-bold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-accent/90"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                    LOG A SESSION
                  </button>
                  <div className="space-y-2">
                    {(() => {
                      const roasts = (() => {
                        try {
                          return JSON.parse(localStorage.getItem("roasts") || "[]");
                        } catch (e) {
                          return [];
                        }
                      })().filter(r => r.beanName === selectedBean.name);
                      if (roasts.length === 0) return <p className="text-sm text-ink-muted italic py-2">No roast sessions found for this bean.</p>;
                      return roasts.map(r => (
                        <button
                          key={r.id}
                          onClick={() => {
                            setSelectedRoast(r);
                            setBeansView("roastDetail");
                          }}
                          className="w-full rounded-2xl border border-border/40 bg-surface/15 p-4 text-left transition hover:bg-surface/30"
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="text-sm font-bold text-ink">{r.date}</div>
                              <div className="text-[11px] text-ink-muted">{r.targetLevel} · {r.greenWeight}g</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-mono font-bold text-accent-text">{r.duration}</div>
                            </div>
                          </div>
                        </button>
                      ));
                    })()}
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-[0.15em] text-ink-muted">Tasting Notes</h3>
                    {(() => {
                      const tastings = (() => {
                        try {
                          return JSON.parse(localStorage.getItem("tastingNotes") || "[]");
                        } catch (e) {
                          return [];
                        }
                      })().filter(t => t.beanName === selectedBean.name);
                      return <span className="text-[10px] font-bold text-accent-text/80 bg-accent/10 px-2 py-0.5 rounded-full">{tastings.length} notes</span>;
                    })()}
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const tastings = (() => {
                        try {
                          return JSON.parse(localStorage.getItem("tastingNotes") || "[]");
                        } catch (e) {
                          return [];
                        }
                      })().filter(t => t.beanName === selectedBean.name);
                      if (tastings.length === 0) return <p className="text-sm text-ink-muted italic py-2">No tasting notes found for this bean.</p>;
                      return tastings.map(t => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setSelectedTastingNote(t);
                            setBeansView("tastingDetail");
                          }}
                          className="w-full rounded-2xl border border-border/40 bg-surface/15 p-4 text-left transition hover:bg-surface/30"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="text-sm font-bold text-ink">{t.date}</div>
                              <div className="text-[11px] text-ink-muted">{t.method}</div>
                            </div>
                            {t.rating > 0 && <StarRow rating={t.rating} size={10} />}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {t.descriptors?.slice(0, 3).map((d, i) => (
                              <span key={i} className="rounded-full bg-accent/5 border border-accent/10 px-2 py-0.5 text-[9px] font-bold text-accent-text/80">
                                {d}
                              </span>
                            ))}
                          </div>
                        </button>
                      ));
                    })()}
                  </div>
                </section>

                <button
                  type="button"
                  onClick={() => setConfirmDelete({ type: "bean", id: selectedBean.id, name: selectedBean.name })}
                  className="w-full rounded-2xl border border-error/30 bg-error/10 py-3 text-sm font-semibold text-error-text transition hover:bg-error/20 active:bg-error/30"
                >
                  DELETE BEAN
                </button>
              </div>
            )}

            {beansView === "roastDetail" && selectedRoast && (
              <div className="space-y-6 pb-20">
                <button
                  onClick={() => setBeansView("beanDetail")}
                  className="flex items-center gap-2 text-xs font-semibold text-ink-muted hover:text-ink transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  BACK TO {selectedBean.name.toUpperCase()}
                </button>

                {/* ROAST DETAIL CONTENT (REPLICATED FROM HISTORY) */}
                <section className="rounded-3xl border border-border/60 bg-surface/30 p-5 shadow-sm">
                  <div className="text-xs font-medium uppercase tracking-wider text-ink-muted">{selectedRoast.date}</div>
                  <div className="mt-2 text-2xl font-bold tracking-tight text-ink">{selectedRoast.beanName}</div>
                  <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border/50 pt-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-ink-muted">Weight</div>
                      <div className="text-sm font-medium text-ink">{selectedRoast.greenWeight}g</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-ink-muted">Duration</div>
                      <div className="text-sm font-medium text-accent-text">{selectedRoast.duration}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[10px] uppercase tracking-widest text-ink-muted">Roast Level</div>
                      <div className="text-sm font-medium text-ink">{selectedRoast.targetLevel}</div>
                    </div>
                  </div>
                </section>

                <section className="rounded-3xl border border-border/60 bg-surface/20 p-5">
                  <div className="text-xs font-medium uppercase tracking-wider text-ink-muted">Phase Timeline</div>
                  <div className="mt-4 space-y-3">
                    {(selectedRoast.roastLog || []).filter(e => e.type === "phase").map((m, i) => (
                      <div key={i} className="flex items-center justify-between border-b border-border/30 pb-2 last:border-0 last:pb-0">
                        <div className="text-sm font-semibold text-ink">{m.label}</div>
                        <div className="font-mono text-xs text-accent-text/80">{formatTime(m.t)}</div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-3xl border border-border/60 bg-surface/20 p-5">
                  <div className="text-xs font-medium uppercase tracking-wider text-ink-muted">Adjustment Log</div>
                  <div className="mt-4 space-y-3">
                    {((selectedRoast.roastLog || []).filter(e => e.type === "adjustment" || e.type === "start_settings")).length === 0 ? (
                      <div className="text-xs text-ink-muted">No adjustments logged.</div>
                    ) : (
                      (selectedRoast.roastLog || []).filter(e => e.type === "adjustment" || e.type === "start_settings").map((a, i) => (
                        <div key={i} className="flex items-center justify-between border-b border-border/30 pb-2 last:border-0 last:pb-0">
                          <div className="font-mono text-xs text-accent-text/80">{formatTime(a.t)}</div>
                          <div className="text-[11px] text-ink-muted">
                            H:<span className="text-ink ml-0.5">{a.heat || "—"}</span>
                            <span className="mx-1.5">·</span>
                            F:<span className="text-ink ml-0.5">{a.fan || "—"}</span>
                            <span className="mx-1.5">·</span>
                            T:<span className="text-ink ml-0.5">{a.temp || "—"}°</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            )}

            {beansView === "tastingDetail" && selectedTastingNote && (
              <div className="space-y-6 pb-20">
                <button
                  onClick={() => setBeansView("beanDetail")}
                  className="flex items-center gap-2 text-xs font-semibold text-ink-muted hover:text-ink transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  BACK TO {selectedBean.name.toUpperCase()}
                </button>

                {/* TASTING DETAIL CONTENT (REPLICATED FROM HISTORY) */}
                <section className="rounded-3xl border border-border/60 bg-surface/30 p-6 shadow-sm">
                  <div className="text-xs font-medium uppercase tracking-wider text-ink-muted">{selectedTastingNote.date}</div>
                  <h2 className="mt-2 text-3xl font-bold text-ink leading-tight">{selectedTastingNote.beanName || "Unknown Bean"}</h2>
                  <div className="mt-1 text-sm font-medium text-accent-text/80">{selectedTastingNote.method} · {selectedTastingNote.device}</div>
                  
                  <div className="mt-8 space-y-6 border-t border-border/50 pt-6">
                    <div className="grid grid-cols-2 gap-y-5 gap-x-8">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-1">Ratio</div>
                        <div className="text-sm font-bold text-ink">{selectedTastingNote.ratio}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-1">Grind</div>
                        <div className="text-sm font-bold text-ink">{selectedTastingNote.grindSize}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-1">Temp</div>
                        <div className="text-sm font-bold text-ink">{selectedTastingNote.temp}°F</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-1">Rating</div>
                        <div className="mt-0.5">
                          <StarRow rating={selectedTastingNote.rating} size={14} />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-2">Acidity: {["Flat", "Low", "Medium", "Bright", "Vibrant"][selectedTastingNote.acidity-1]} ({selectedTastingNote.acidity})</div>
                        <div className="h-2 w-full rounded-full bg-surface overflow-hidden">
                          <div className="h-full bg-accent shadow-[0_0_8px_rgba(245,158,11,0.4)]" style={{ width: `${(selectedTastingNote.acidity / 5) * 100}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-2">Body: {["Watery", "Light", "Medium", "Full", "Syrupy"][selectedTastingNote.body-1]} ({selectedTastingNote.body})</div>
                        <div className="h-2 w-full rounded-full bg-surface overflow-hidden">
                          <div className="h-full bg-accent shadow-[0_0_8px_rgba(245,158,11,0.4)]" style={{ width: `${(selectedTastingNote.body / 5) * 100}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {(selectedTastingNote.families || [])?.map(familyId => (
                        <div key={familyId}>
                          <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-2">
                            {FLAVOR_FAMILIES.find(f => f.id === familyId)?.label}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(selectedTastingNote.descriptors || [])?.filter(d => {
                              const familyOptions = FLAVOR_DRILLDOWN[familyId];
                              if (typeof familyOptions === 'object' && !Array.isArray(familyOptions)) {
                                return Object.values(familyOptions).flat().includes(d);
                              }
                              return (familyOptions || []).includes(d);
                            }).map((d, i) => (
                              <span key={i} className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent-text">
                                {d}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <BagLabelCard className="bg-primary/40">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted mb-1">Tasting Summary</div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-ink mb-0.5">{selectedTastingNote.beanName || "Unknown Bean"}</h3>
                        <div className="w-10 h-[2px] bg-accent my-4" />
                        <div className="text-base font-bold text-accent-text tracking-tight italic leading-relaxed">
                          {(selectedTastingNote.descriptors || [])?.slice(0, 5).join(' · ')}
                        </div>
                    </BagLabelCard>

                    {selectedTastingNote.notes && (
                      <div className="rounded-2xl bg-primary/40 p-5 border border-border/40">
                        <div className="text-[10px] uppercase tracking-widest font-black text-ink-muted mb-2">Free Notes</div>
                        <p className="text-sm italic text-ink leading-relaxed font-medium">"{selectedTastingNote.notes}"</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        )}

        {activeTab === "Settings" && (
          <div className="space-y-4">
            <ScreenCard title="Preferences" subtitle="Settings">
              {/* IDEA-009: Units of Measure */}
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-3">Units</div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-ink">Temperature</span>
                      <div className="flex rounded-xl border border-border overflow-hidden">
                        {["F", "C"].map(u => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => setTempUnit(u)}
                            className={`px-4 py-2 text-sm font-bold transition ${tempUnit === u ? "bg-accent text-zinc-950" : "bg-primary/40 text-ink-muted hover:text-ink"}`}
                          >
                            °{u}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-ink">Weight</span>
                      <div className="flex rounded-xl border border-border overflow-hidden">
                        {["g", "oz"].map(u => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => setWeightUnit(u)}
                            className={`px-4 py-2 text-sm font-bold transition ${weightUnit === u ? "bg-accent text-zinc-950" : "bg-primary/40 text-ink-muted hover:text-ink"}`}
                          >
                            {u}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* IDEA-008: Light Mode toggle */}
                <div className="border-t border-border/50 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-ink">Light Mode</div>
                      <div className="text-[11px] text-ink-muted">Warm parchment theme (default off)</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={theme === "light"}
                      onClick={() => {
                        const next = theme === "light" ? "dark" : "light";
                        localStorage.setItem("roastlogs_theme", next);
                        document.documentElement.setAttribute("data-theme", next);
                        setTheme(next);
                      }}
                      className={`relative h-7 w-12 rounded-full transition ${theme === "light" ? "bg-accent" : "bg-card"}`}
                    >
                      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${theme === "light" ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                  </div>
                </div>

                {/* IDEA-007 + IDEA-010 actions */}
                <div className="border-t border-border/50 pt-4 flex flex-wrap gap-3">
                  <PrimaryButton onClick={() => setShowExportPanel(true)}>Export Data</PrimaryButton>
                  <button
                    type="button"
                    onClick={() => setShowAboutModal(true)}
                    className="rounded-2xl border border-border/70 bg-surface/40 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface/70"
                  >
                    About
                  </button>
                </div>
              </div>
            </ScreenCard>
            
            <ScreenCard title="Manage Profiles" subtitle="Profile Management">
              <div className="space-y-3">
                {(profiles || []).map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-surface/30 rounded-2xl border border-border/40">
                    <div className="flex-1">
                      <div className="font-medium text-ink">{p.name}</div>
                      <div className="text-xs text-ink-muted mt-1">
                        {p.beanName ? `Bean: ${p.beanName}` : <span className="italic text-ink-muted">No bean linked</span>}
                        <span className="ml-2">• {p.steps.length} steps</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setDeleteConfirmModal({ show: true, profileName: p.name, isDeleteAll: false })}
                      className="px-3 py-1 text-xs font-bold text-error-text bg-error/10 border border-error/20 rounded-xl hover:bg-error/20 transition"
                    >
                      DELETE
                    </button>
                  </div>
                ))}
                
                {profiles.length === 0 && (
                  <div className="text-center py-8 text-ink-muted text-sm">
                    No saved profiles yet.
                  </div>
                )}
                
                {profiles.length > 0 && (
                  <button
                    onClick={() => setDeleteConfirmModal({ show: true, profileName: '', isDeleteAll: true })}
                    className="w-full py-3 text-sm font-bold text-error-text bg-error/10 border border-error/20 rounded-2xl hover:bg-error/20 transition"
                  >
                    DELETE ALL PROFILES
                  </button>
                )}
              </div>
            </ScreenCard>

            <ScreenCard title="Account" subtitle="Session">
              {user?.email && (
                <div className="mb-4 text-xs text-ink-muted">
                  Signed in as <span className="font-semibold text-ink">{user.email}</span>
                </div>
              )}
              <button
                onClick={() => {
                  if (window.confirm("Sign out of RoastLogs?")) {
                    signOut().catch((e) => console.warn("Sign out failed", e));
                  }
                }}
                className="w-full py-3 text-sm font-bold text-error-text bg-error/10 border border-error/20 rounded-2xl hover:bg-error/20 transition"
              >
                SIGN OUT
              </button>
            </ScreenCard>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-primary">
        <div className="mx-auto max-w-md px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <div className="grid grid-cols-4 gap-1">
            {TABS.map((tab) => (
              <TabButton
                key={tab}
                label={tab}
                active={activeTab === tab}
                onClick={() => setActiveTab(tab)}
              />
            ))}
          </div>
        </div>
      </nav>

      {activeNumpad && (
        <NumberPad
          value={activeNumpad === "heat" ? heat : activeNumpad === "fan" ? fan : temp}
          label={
            activeNumpad === "heat" ? "Heat 1-9" : activeNumpad === "fan" ? "Fan 1-9" : "Temp °F"
          }
          onDigit={handleNumpadDigit}
          onDelete={handleNumpadDelete}
          onDone={() => setActiveNumpad(null)}
        />
      )}

      {deleteConfirmModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-in zoom-in-95 duration-200 rounded-3xl border border-border/60 bg-surface p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-ink mb-4">
              {deleteConfirmModal.isDeleteAll 
                ? `Delete all ${profiles.length} profiles? This cannot be undone.`
                : `Delete '${deleteConfirmModal.profileName}'? This cannot be undone.`
              }
            </h3>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteConfirmModal({ show: false, profileName: '', isDeleteAll: false })}
                className="flex-1 py-3 rounded-2xl bg-surface text-ink font-bold"
              >
                CANCEL
              </button>
              <button 
                onClick={() => {
                  if (deleteConfirmModal.isDeleteAll) {
                    setProfiles([]);
                  } else {
                    setProfiles(profiles.filter(p => p.name !== deleteConfirmModal.profileName));
                  }
                  setDeleteConfirmModal({ show: false, profileName: '', isDeleteAll: false });
                }}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold"
              >
                {deleteConfirmModal.isDeleteAll ? 'DELETE ALL' : 'DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IDEA-007: Export Data choice panel */}
      {showExportPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/80 p-4 backdrop-blur-sm" onClick={() => !isExporting && setShowExportPanel(false)}>
          <div className="w-full max-w-sm animate-in zoom-in-95 duration-200 rounded-3xl border border-border/60 bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-ink">Export Data</h3>
              <button onClick={() => !isExporting && setShowExportPanel(false)} className="text-ink-muted hover:text-ink text-xl leading-none">×</button>
            </div>
            {isExporting ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-amber-500 animate-spin" />
                <div className="text-sm text-ink-muted">Gathering your data…</div>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleExportCSV}
                  className="w-full rounded-2xl bg-accent py-3 text-sm font-bold text-zinc-950 transition hover:bg-amber-400"
                >
                  Export Roast Log (CSV)
                </button>
                <button
                  onClick={handleExportJSON}
                  className="w-full rounded-2xl border border-border bg-primary/40 py-3 text-sm font-bold text-ink transition hover:bg-surface/70"
                >
                  Export Full Backup (JSON)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* IDEA-010: About modal */}
      {showAboutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/80 p-4 backdrop-blur-sm" onClick={() => setShowAboutModal(false)}>
          <div className="relative w-full max-w-sm animate-in zoom-in-95 duration-200 rounded-3xl border border-border/60 bg-surface p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowAboutModal(false)}
              className="absolute top-4 right-4 text-ink-muted hover:text-ink text-2xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
            <div className="text-center">
              <div className="text-3xl font-bold text-accent-text">☕ RoastLogs</div>
              <div className="mt-1 text-sm font-mono text-ink-muted">v1.5.0</div>
              <div className="mt-3 text-sm text-ink">Built for the Fresh Roast SR540 + Extension Tube</div>
            </div>
            <div className="my-5 border-t border-border/60" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-2">Features</div>
              <ul className="space-y-1.5 text-sm text-ink">
                <li>• Live roast session logging with phase milestone buttons</li>
                <li>• Full roast history with heat/fan/temp charts</li>
                <li>• Green bean inventory with auto-deduction</li>
                <li>• Brew &amp; tasting session notes</li>
              </ul>
            </div>
            <div className="my-5 border-t border-border/60" />
            <div className="text-center text-sm text-ink-muted">Built for home roasters, by a home roaster. ☕</div>
          </div>
        </div>
      )}

      {/* Styled delete confirmation — same pattern as the in-progress-roast discard modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-primary/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-in zoom-in-95 duration-200 rounded-3xl border border-border/60 bg-surface p-6 shadow-2xl text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error/20 text-error-text">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </div>
            <h3 className="text-xl font-bold text-ink mb-2">
              {confirmDelete.type === "roast" ? "Delete this roast?" : confirmDelete.type === "tasting" ? "Delete this tasting?" : "Delete this bean?"}
            </h3>
            {confirmDelete.type === "bean" ? (() => {
              const linkedRoasts = readLocalJSON("roasts").filter(r => r.beanName === confirmDelete.name);
              const linkedTastings = readLocalJSON("tastingNotes").filter(t => t.beanName === confirmDelete.name);
              const hasHistory = linkedRoasts.length + linkedTastings.length > 0;
              const hasSavedRecord = !!confirmDelete.id;
              const historyLabel = `${linkedRoasts.length} roast${linkedRoasts.length === 1 ? "" : "s"} + ${linkedTastings.length} tasting${linkedTastings.length === 1 ? "" : "s"}`;
              // History is matched by bean name, not id — a duplicate name means cascade delete
              // here would also remove the other same-named bean's roasts/tastings.
              const hasDuplicateBeanName = readLocalJSON("beans").filter(b => b.name === confirmDelete.name).length > 1;
              const duplicateWarning = hasDuplicateBeanName && (
                <p className="text-xs text-error-text mb-3">You have more than one bean named "{confirmDelete.name}" — deleting history here removes it for all of them, since roasts/tastings are matched by name.</p>
              );

              if (!hasHistory) {
                return (
                  <>
                    <p className="text-sm text-ink-muted mb-6">This cannot be undone.</p>
                    <div className="flex gap-3">
                      <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 rounded-2xl bg-surface text-ink font-bold hover:bg-card transition">CANCEL</button>
                      <button onClick={() => handleDeleteBean(confirmDelete, false)} className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-500 transition">DELETE</button>
                    </div>
                  </>
                );
              }

              if (!hasSavedRecord) {
                return (
                  <>
                    <p className="text-sm text-ink-muted mb-6">This will delete {historyLabel} for this bean. This cannot be undone.</p>
                    {duplicateWarning}
                    <div className="flex flex-col gap-2">
                      <button onClick={() => handleDeleteBean(confirmDelete, true)} className="w-full py-3 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-500 transition">DELETE {historyLabel.toUpperCase()}</button>
                      <button onClick={() => setConfirmDelete(null)} className="w-full py-3 rounded-2xl bg-surface text-ink font-bold hover:bg-card transition">CANCEL</button>
                    </div>
                  </>
                );
              }

              return (
                <>
                  <p className="text-sm text-ink-muted mb-6">This bean has {historyLabel}. Choose whether to keep or remove them too.</p>
                  {duplicateWarning}
                  <div className="flex flex-col gap-2">
                    <button onClick={() => handleDeleteBean(confirmDelete, true)} className="w-full py-3 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-500 transition">DELETE BEAN + {historyLabel.toUpperCase()}</button>
                    <button onClick={() => handleDeleteBean(confirmDelete, false)} className="w-full py-3 rounded-2xl border border-border/60 text-ink font-bold hover:bg-card transition">KEEP HISTORY, DELETE BEAN ONLY</button>
                    <button onClick={() => setConfirmDelete(null)} className="w-full py-3 text-ink-muted font-bold hover:text-ink transition">CANCEL</button>
                  </div>
                </>
              );
            })() : (
              <>
                <p className="text-sm text-ink-muted mb-6">This cannot be undone.</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="flex-1 py-3 rounded-2xl bg-surface text-ink font-bold hover:bg-card transition"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={() => {
                      if (confirmDelete.type === "roast") {
                        handleDeleteRoast(confirmDelete.id);
                      } else {
                        handleDeleteTasting(confirmDelete.id);
                      }
                      setConfirmDelete(null);
                    }}
                    className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-500 transition"
                  >
                    DELETE
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Global toast */}
      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 pointer-events-none">
          <div className={`rounded-2xl px-4 py-3 text-sm font-semibold shadow-2xl animate-in fade-in slide-in-from-bottom-2 ${toast.type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
