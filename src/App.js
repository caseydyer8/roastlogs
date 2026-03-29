import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Label,
} from "recharts";

const TABS = ["Roast", "History", "Brew", "Beans", "Settings"];

const formatMMSS = (s) => {
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

function RoastSparkline({ data }) {
  if (!data || data.length === 0) return null;
  return (
    <div className="h-20 w-32">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="temp"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RoastDetailChart({ roast }) {
  if (!roast || !roast.roastLog) return null;

  const chartData = [];
  const startEntry = roast.roastLog.find((e) => e.type === "start_settings" || (e.type === "adjustment" && e.t === 0));
  
  let currentHeat = startEntry?.heat || 0;
  let currentFan = startEntry?.fan || 0;
  let currentTemp = startEntry?.temp || 0;

  for (let t = 0; t <= (roast.totalSeconds || 0); t++) {
    const logEntry = roast.roastLog.find((e) => e.t === t && (e.type === "adjustment" || e.type === "start_settings"));
    if (logEntry) {
      if (logEntry.heat) currentHeat = Number(logEntry.heat);
      if (logEntry.fan) currentFan = Number(logEntry.fan);
      if (logEntry.temp) currentTemp = Number(logEntry.temp);
    }

    // Calculate RoR (Rate of Rise) per 30 seconds
    let ror = null;
    if (t >= 30) {
      const prevTempEntry = chartData[t - 30];
      if (prevTempEntry && prevTempEntry.temp && currentTemp) {
        ror = currentTemp - prevTempEntry.temp;
      }
    }

    chartData.push({
      t,
      displayTime: formatMMSS(t),
      heat: currentHeat,
      fan: currentFan,
      temp: currentTemp ? Number(currentTemp) : null,
      ror: ror,
    });
  }

  const phases = roast.roastLog.filter((e) => e.type === "phase" && ["YELLOWING", "FIRST CRACK", "COOLING START"].includes(e.label));

  const totalTime = formatMMSS(roast.totalSeconds || 0);
  
  const firstCrack = roast.roastLog.find(e => e.label === "FIRST CRACK");
  const coolingStart = roast.roastLog.find(e => e.label === "COOLING START");
  
  let dtr = "—";
  if (firstCrack && coolingStart && (roast.totalSeconds || 0) > 0) {
    const devTime = coolingStart.t - firstCrack.t;
    dtr = `${((devTime / roast.totalSeconds) * 100).toFixed(1)}%`;
  }

  const weightLoss = roast.greenWeight && roast.roastedWeight 
    ? `${(((Number(roast.greenWeight) - Number(roast.roastedWeight)) / Number(roast.greenWeight)) * 100).toFixed(1)}%`
    : "—";

  return (
    <div className="space-y-6">
      <div className="h-64 w-full bg-zinc-950/50 rounded-3xl p-4 border border-zinc-800/50">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis 
              dataKey="t" 
              tickFormatter={formatMMSS} 
              stroke="#52525b" 
              fontSize={10} 
              tick={{fill: '#71717a'}}
              minTickGap={30}
            />
            <YAxis stroke="#52525b" fontSize={10} tick={{fill: '#71717a'}} />
            <Tooltip
              contentStyle={{ backgroundColor: "#09090b", border: "1px solid #27272a", borderRadius: "12px", fontSize: "12px" }}
              labelFormatter={formatMMSS}
              itemStyle={{ padding: "2px 0" }}
            />
            
            {phases.map((p, idx) => (
              <ReferenceLine key={idx} x={p.t} stroke="#52525b" strokeDasharray="3 3">
                <Label value={p.label} position="top" fill="#71717a" fontSize={10} offset={10} />
              </ReferenceLine>
            ))}

            <Line type="monotone" dataKey="temp" stroke="#ef4444" strokeWidth={2} dot={false} name="Temp" />
            <Line type="stepAfter" dataKey="heat" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="Heat" />
            <Line type="stepAfter" dataKey="fan" stroke="#f97316" strokeWidth={1.5} dot={false} name="Fan" />
            <Line type="monotone" dataKey="ror" stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="RoR" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Total Time</div>
          <div className="text-sm font-bold text-zinc-100 font-mono">{totalTime}</div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">DTR</div>
          <div className="text-sm font-bold text-red-400 font-mono">{dtr}</div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Weight Loss</div>
          <div className="text-sm font-bold text-amber-400 font-mono">{weightLoss}</div>
        </div>
      </div>
    </div>
  );
}

function CoffeeIcon({ active, sizeClass = "h-6 w-6" }) {
  const outerFill = active ? "#f59e0b" : "#52525b"; // amber-500 / zinc-600
  const innerFill = active ? "#fde68a" : "#71717a"; // amber-200 / zinc-500

  return (
    <svg
      aria-hidden="true"
      className={sizeClass}
      viewBox="0 0 24 24"
      fill="none"
    >
      {/* Coffee Mug Body */}
      <path
        d="M6 8c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z"
        fill={outerFill}
      />
      {/* Mug Handle */}
      <path
        d="M18 9h1a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-1V9z"
        stroke={outerFill}
        strokeWidth="2"
      />
      {/* Inner Highlight/Liquid Surface */}
      <path
        d="M7 9h10v1H7V9z"
        fill={innerFill}
      />
      {/* Steam lines */}
      <path
        d="M9 2c0 1 .5 1.5 1 2s0 1-.5 2M12 1c0 1 .5 1.5 1 2s0 1-.5 2M15 2c0 1 .5 1.5 1 2s0 1-.5 2"
        stroke={innerFill}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RoasterIcon({ active, sizeClass = "h-6 w-6" }) {
  const outerFill = active ? "#f59e0b" : "#52525b"; // amber-500 / zinc-600
  const innerFill = active ? "#fde68a" : "#71717a"; // amber-200 / zinc-500

  return (
    <svg
      aria-hidden="true"
      className={sizeClass}
      viewBox="0 0 24 24"
      fill="none"
    >
      {/* Outer flame - teardrop with rounded bottom lobes */}
      <path
        d="M12 3c-1.3 2-3.4 4.3-4.4 6.4-.7 1.5-1 3-.9 4.2.1 1.4.7 2.6 1.5 3.6.9 1.1 2.1 1.8 3.3 2 .3.1.6.1.9.1.3 0 .6 0 .9-.1 1.2-.2 2.4-.9 3.3-2 0 0 0 0 0 0 .8-1 1.4-2.2 1.5-3.6.1-1.2-.2-2.7-.9-4.2C15.4 7.3 13.3 5 12 3Z"
        fill={outerFill}
      />
      {/* Inner flame - smaller, centered teardrop */}
      <path
        d="M12 6c-1 1.5-2.4 3.1-3.1 4.7-.5 1.1-.7 2.1-.6 3.1.1 1 .5 1.9 1.1 2.7.7.8 1.6 1.3 2.5 1.4.2 0 .4.1.6.1.2 0 .4 0 .6-.1.9-.1 1.8-.6 2.5-1.4.6-.8 1-1.7 1.1-2.7.1-1-.1-2-.6-3.1C14.4 9.1 13 7.5 12 6Z"
        fill={innerFill}
      />
    </svg>
  );
}

function ClockIcon({ active, sizeClass = "h-6 w-6" }) {
  const colorClass = active ? "text-amber-400" : "text-zinc-500";
  return (
    <svg
      aria-hidden="true"
      className={`${sizeClass} ${colorClass}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.6" />
      <line
        x1="12"
        y1="12"
        x2="12"
        y2="8.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="12"
        x2="14.8"
        y2="13.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Minimal tick marks */}
      <line
        x1="12"
        y1="4"
        x2="12"
        y2="5.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="18.8"
        x2="12"
        y2="20"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BeanIcon({ active, sizeClass = "h-6 w-6" }) {
  const fillColor = active ? "#f59e0b" : "#52525b"; // amber-500 / zinc-600
  const creaseColor = active ? "#fde68a" : "#71717a"; // amber-200 / zinc-500

  return (
    <svg
      aria-hidden="true"
      className={sizeClass}
      viewBox="0 0 24 24"
      fill="none"
    >
      {/* Symmetrical bean body */}
      <ellipse cx="12" cy="12" rx="4.2" ry="6.2" fill={fillColor} />
      {/* Central S-curve crease */}
      <path
        d="M12.2 6c.6 1 .9 2 .9 3 0 1.1-.4 2.1-.9 3-.5.9-1.2 1.7-1.6 2.6-.4.9-.5 1.8-.5 2.4"
        stroke={creaseColor}
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function GearIcon({ active, sizeClass = "h-6 w-6" }) {
  const bodyColor = active ? "#f59e0b" : "#52525b"; // amber-500 / zinc-600
  const innerRingColor = active ? "#fde68a" : "#71717a"; // amber-200 / zinc-500

  return (
    <svg
      aria-hidden="true"
      className={sizeClass}
      viewBox="0 0 24 24"
      fill="none"
    >
      {/* Outer gear ring (washer-like body) */}
      <circle
        cx="12"
        cy="12"
        r="7"
        stroke={bodyColor}
        strokeWidth="4"
        fill="none"
      />
      {/* 8 wide, rounded teeth */}
      <rect
        x="10.6"
        y="2"
        width="2.8"
        height="3.4"
        rx="1.1"
        fill={bodyColor}
        transform="rotate(0 12 3.7)"
      />
      <rect
        x="10.6"
        y="2"
        width="2.8"
        height="3.4"
        rx="1.1"
        fill={bodyColor}
        transform="rotate(45 12 12)"
      />
      <rect
        x="10.6"
        y="2"
        width="2.8"
        height="3.4"
        rx="1.1"
        fill={bodyColor}
        transform="rotate(90 12 12)"
      />
      <rect
        x="10.6"
        y="2"
        width="2.8"
        height="3.4"
        rx="1.1"
        fill={bodyColor}
        transform="rotate(135 12 12)"
      />
      <rect
        x="10.6"
        y="2"
        width="2.8"
        height="3.4"
        rx="1.1"
        fill={bodyColor}
        transform="rotate(180 12 12)"
      />
      <rect
        x="10.6"
        y="2"
        width="2.8"
        height="3.4"
        rx="1.1"
        fill={bodyColor}
        transform="rotate(225 12 12)"
      />
      <rect
        x="10.6"
        y="2"
        width="2.8"
        height="3.4"
        rx="1.1"
        fill={bodyColor}
        transform="rotate(270 12 12)"
      />
      <rect
        x="10.6"
        y="2"
        width="2.8"
        height="3.4"
        rx="1.1"
        fill={bodyColor}
        transform="rotate(315 12 12)"
      />
      {/* Inner highlight ring */}
      <circle
        cx="12"
        cy="12"
        r="4"
        stroke={innerRingColor}
        strokeWidth="1.4"
        fill="none"
      />
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
          ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
          : "text-zinc-300 hover:bg-zinc-900/60 hover:text-zinc-100",
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/80 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-200 sm:rounded-3xl sm:border sm:border-zinc-800/60 sm:bg-zinc-900 sm:p-6">
        <div className="bg-zinc-900 p-6 pb-10 sm:p-0">
          <div className="mb-6 text-center">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</div>
            <div className="mt-2 text-4xl font-bold tracking-tight text-amber-400">
              {value || "—"}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {digits.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDigit(String(d))}
                className="flex h-16 items-center justify-center rounded-2xl bg-zinc-800/50 text-2xl font-semibold text-zinc-100 transition active:bg-zinc-700 active:scale-95"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={onDelete}
              className="flex h-16 items-center justify-center rounded-2xl bg-zinc-800/50 text-xl font-semibold text-zinc-400 transition active:bg-zinc-700 active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-backspace"><path d="M9 19c-5 0-7-3-7-3s2-3 7-3h11a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H9Z"/><path d="m12 15 4 4"/><path d="m16 15-4 4"/></svg>
            </button>
            <button
              type="button"
              onClick={() => onDigit("0")}
              className="flex h-16 items-center justify-center rounded-2xl bg-zinc-800/50 text-2xl font-semibold text-zinc-100 transition active:bg-zinc-700 active:scale-95"
            >
              0
            </button>
            <button
              type="button"
              onClick={onDone}
              className="flex h-16 items-center justify-center rounded-2xl bg-amber-500 text-lg font-bold text-zinc-950 transition active:bg-amber-400 active:scale-95"
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
    <section className="rounded-3xl border border-zinc-800/60 bg-zinc-900/30 p-5 shadow-[0_0_0_1px_rgba(0,0,0,0.2)]">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">{subtitle}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">{title}</div>
      <div className="mt-4 text-sm leading-6 text-zinc-300">{children}</div>
    </section>
  );
}

function PrimaryButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-amber-500/90"
    >
      {children}
    </button>
  );
}

function ProfileBuilder({ bean, onSave, onCancel }) {
  const [profile, setProfile] = React.useState({ name: "", steps: [], isDefault: false });

  const formatMMSS = (totalSeconds) => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const parseMMSS = (timeStr) => {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const parts = timeStr.split(':');
    if (parts.length !== 2) return 0;
    const mm = parseInt(parts[0], 10) || 0;
    const ss = parseInt(parts[1], 10) || 0;
    return (mm * 60) + ss;
  };

  const addStep = () => {
    setProfile(prev => ({
      ...prev,
      steps: [...prev.steps, { totalSeconds: 0, heat: "5", fan: "5" }].sort((a, b) => a.totalSeconds - b.totalSeconds)
    }));
  };

  const updateStep = (idx, field, value) => {
    const newSteps = [...profile.steps];
    if (field === 'time') {
      // Temporary string storage for the input field to allow typing
      newSteps[idx] = { ...newSteps[idx], displayTime: value, totalSeconds: parseMMSS(value) };
    } else {
      newSteps[idx] = { ...newSteps[idx], [field]: value };
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-in zoom-in-95 duration-200 rounded-3xl border border-zinc-800/60 bg-zinc-900 p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <h3 className="text-xl font-bold text-white mb-4">Profile Builder {bean ? `for ${bean.name}` : ""}</h3>
        <input 
          placeholder="Profile Name (e.g. Light Roast)"
          value={profile.name}
          onChange={e => setProfile({...profile, name: e.target.value})}
          className="w-full rounded-xl bg-zinc-950/40 border border-zinc-800 px-4 py-3 mb-4 text-sm text-zinc-100"
        />
        <div className="space-y-3 mb-6">
          {profile.steps.map((step, idx) => (
            <div key={idx} className="flex gap-2 items-center bg-zinc-950/20 p-3 rounded-2xl border border-zinc-800/40">
              <input 
                type="text" 
                value={step.displayTime !== undefined ? step.displayTime : formatMMSS(step.totalSeconds)} 
                placeholder="MM:SS"
                onChange={e => updateStep(idx, 'time', e.target.value)}
                onBlur={() => {
                  // Clean up displayTime on blur to snap to formatted MM:SS
                  const newSteps = [...profile.steps];
                  newSteps[idx] = { ...newSteps[idx], displayTime: undefined };
                  setProfile(prev => ({ ...prev, steps: newSteps }));
                }}
                className="w-20 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-center font-mono text-xs text-zinc-100"
              />
              <div className="flex-1 grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase text-zinc-500 font-bold ml-1">Heat</span>
                  <input type="number" min="1" max="9" value={step.heat} onChange={e => updateStep(idx, 'heat', e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-center text-zinc-100" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase text-zinc-500 font-bold ml-1">Fan</span>
                  <input type="number" min="1" max="9" value={step.fan} onChange={e => updateStep(idx, 'fan', e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-center text-zinc-100" />
                </div>
              </div>
              <button onClick={() => setProfile({...profile, steps: profile.steps.filter((_, i) => i !== idx)})} className="text-red-500 p-2 text-xl">×</button>
            </div>
          ))}
          <button onClick={addStep} className="w-full py-3 rounded-2xl border-2 border-dashed border-zinc-800 text-zinc-500 text-xs font-bold hover:border-zinc-700 hover:text-zinc-400">+ ADD STEP</button>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-zinc-800 text-zinc-300 font-bold">CANCEL</button>
          <button onClick={handleSave} className="flex-1 py-3 rounded-2xl bg-amber-500 text-zinc-950 font-bold">SAVE PROFILE</button>
        </div>
      </div>
    </div>
  );
}

function RoastModeDialog({ profiles, bean, onSelectManual, onSelectProfile, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-in zoom-in-95 duration-200 rounded-3xl border border-zinc-800/60 bg-zinc-900 p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-6 text-center">Start Roast</h3>
        <div className="space-y-3">
          {profiles.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Follow a saved profile</div>
              {profiles.map(p => (
                <button key={p.id} onClick={() => onSelectProfile(p)} className="w-full p-4 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 text-left hover:bg-zinc-800 transition">
                  <div className="font-bold text-zinc-100">{p.name}</div>
                  <div className="text-[10px] text-zinc-500 mt-1">{p.steps.length} steps</div>
                </button>
              ))}
            </div>
          )}
          <div className="pt-2">
            <button onClick={onSelectManual} className="w-full p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold hover:bg-amber-500/20 transition">
              MANUAL ROAST
            </button>
          </div>
          <button onClick={onCancel} className="w-full py-3 text-zinc-500 text-xs font-bold uppercase tracking-widest">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = React.useState("Roast");

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

  const [roastLog, setRoastLog] = React.useState(() => JSON.parse(localStorage.getItem("live_roastLog") || "[]"));

  const [adjustments, setAdjustments] = React.useState(() => JSON.parse(localStorage.getItem("live_adjustments") || "[]"));

  const [activeProfile, setActiveProfile] = React.useState(null);
  const [nextProfileStep, setNextProfileStep] = React.useState(null);
  const [profileBuilder, setProfileBuilder] = React.useState({ name: "", steps: [], isDefault: false });
  const [isProfileBuilderOpen, setIsProfileBuilderOpen] = React.useState(false);
  const [showRoastModeDialog, setShowRoastModeDialog] = React.useState(false);

  const [heat, setHeat] = React.useState("");
  const [fan, setFan] = React.useState("");
  const [temp, setTemp] = React.useState("");
  const [isAdjPopupOpen, setIsAdjPopupOpen] = React.useState(false);
  const [adjPopupTimestamp, setAdjPopupTimestamp] = React.useState(null);
  const [activeNumpad, setActiveNumpad] = React.useState(null); // 'heat', 'fan', or 'temp'
  
  // Roast Profile Logic
  const [profileFollowing, setProfileFollowing] = React.useState(null);
  const [currentProfileStepIdx, setCurrentProfileStepIdx] = React.useState(-1);
  const [profiles, setProfiles] = React.useState(() => JSON.parse(localStorage.getItem("global_profiles") || "[]"));
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
  const [brewPhoto, setBrewPhoto] = React.useState(null);
  
  // New Tasting wizard state
  const [acidityRating, setAcidityRating] = React.useState(3);
  const [bodyRating, setBodyRating] = React.useState(3);
  const [selectedFamilies, setSelectedFamilies] = React.useState([]);
  const [selectedDescriptors, setSelectedDescriptors] = React.useState([]);
  const [expandedFruitType, setExpandedFruitType] = React.useState(null);
  const [selectedTastingNote, setSelectedTastingNote] = React.useState(null);
  const [showTastingHistory, setShowTastingHistory] = React.useState(false);
  const [historySegment, setHistorySegment] = React.useState("ROASTS");
  const [historySearch, setHistorySearch] = React.useState("");
  const [isEditingRoast, setIsEditingRoast] = React.useState(false);
  const [editedRoast, setEditedRoast] = React.useState(null);
  const [hasChanges, setHasChanges] = React.useState(false);
  const [showDiscardModal, setShowDiscardModal] = React.useState(false);

  const startEditing = (roast) => {
    setEditedRoast(JSON.parse(JSON.stringify(roast))); // Deep clone
    setHasChanges(false);
    setIsEditingRoast(true);
  };
  
  // Beans tab state
  const [beansView, setBeansView] = React.useState("list"); // 'list', 'addBean', 'beanDetail', 'roastDetail', 'tastingDetail'
  const [selectedBean, setSelectedBean] = React.useState(null);
  const [newBean, setNewBean] = React.useState({
    name: "",
    origin: "",
    farm: "",
    purchaseDate: "",
    purchaseWeight: ""
  });

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
    
    // Find profiles for the current bean
    const beanProfiles = profiles.filter(p => p.beanName === beanName);
    if (beanProfiles.length > 0 || profiles.some(p => !p.beanName)) {
      setShowRoastModeDialog(true);
    } else {
      startRoast(null);
    }
  };

  const startRoast = (profile) => {
    setShowRoastModeDialog(false);
    setIsTimerRunning(true);
    
    if (elapsedSeconds === 0) {
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

    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      clearLiveSession();
    }, 2000);
  };

  const handleLogAdjustment = () => {
    setRoastLog((prev) => [
      { type: 'adjustment', t: adjPopupTimestamp ?? elapsedSeconds, heat, fan, temp },
      ...prev,
    ]);
    setHeat("");
    setFan("");
    setTemp("");
    setAdjPopupTimestamp(null);
  };

  const handleSaveEdit = () => {
    if (!editedRoast) return;
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

    const updated = existingRoasts.map(r => {
      if (r.id === editedRoast.id) {
        return {
          ...editedRoast,
          greenWeight: editedRoast.greenWeight ? parseFloat(editedRoast.greenWeight) : 0,
          roastedWeight: editedRoast.roastedWeight ? parseFloat(editedRoast.roastedWeight) : 0,
          totalSeconds: editedRoast.totalSeconds || 0,
          devSeconds: editedRoast.devSeconds || 0
        };
      }
      return r;
    });

    localStorage.setItem("roasts", JSON.stringify(updated));
    setSelectedRoast(editedRoast);
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

  const handleDeleteRoast = (id) => {
    if (!window.confirm("Are you sure you want to delete this roast?")) return;
    
    const existingRoasts = JSON.parse(localStorage.getItem("roasts") || "[]");
    const updatedRoasts = existingRoasts.filter((r) => r.id !== id);
    localStorage.setItem("roasts", JSON.stringify(updatedRoasts));
    setSelectedRoast(null);
  };

  const BREW_METHODS = ["Pour Over", "Espresso Machine", "Chemex", "French Press", "AeroPress", "Moka Pot", "Hario V60"];
  const GRIND_SIZES = ["Extra Fine", "Fine", "Medium-Fine", "Medium", "Medium-Coarse", "Coarse"];
  const WATER_RATIOS = ["1:14", "1:15", "1:16", "1:17", "1:18", "Custom"];

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
      ratio: brewRatio,
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

    const existingBrews = JSON.parse(localStorage.getItem("tastingNotes") || "[]");
    localStorage.setItem("tastingNotes", JSON.stringify([newBrew, ...existingBrews]));
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
    setExpandedFruitType(null);
    setBrewRating(0);
    setBrewAgain(null);
    setBrewNotes("");
  };

  let ActiveIcon = null;
  if (activeTab === "Roast") ActiveIcon = RoasterIcon;
  else if (activeTab === "Brew") ActiveIcon = CoffeeIcon;
  else if (activeTab === "History") ActiveIcon = ClockIcon;
  else if (activeTab === "Beans") ActiveIcon = BeanIcon;
  else if (activeTab === "Settings") ActiveIcon = GearIcon;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <header className="sticky top-0 z-20 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 pb-4 pt-5">
          <div className="flex items-center gap-2">
            {ActiveIcon && <ActiveIcon active sizeClass="h-7 w-7" />}
            <div className="text-lg font-semibold tracking-tight">{activeTab}</div>
          </div>
          <div className="text-xs font-medium text-zinc-400">RoastLogs</div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-28 pt-6">
        {activeTab === "Roast" && (
          <div className="space-y-4">
            {/* 1) SESSION HEADER */}
            <section className="rounded-3xl border border-zinc-800/60 bg-zinc-900/30 p-4 shadow-[0_0_0_1px_rgba(0,0,0,0.2)]">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Session
              </div>

              {/* Starting Settings */}
              {elapsedSeconds === 0 && !isTimerRunning && (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <label className="block">
                    <div className="text-[10px] font-bold uppercase tracking-tight text-zinc-400">Heat (1-9)</div>
                    <input
                      value={startingHeat}
                      onChange={(e) => setStartingHeat(e.target.value.slice(0, 1))}
                      type="number"
                      inputMode="numeric"
                      placeholder="—"
                      className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-3 py-3 text-center text-lg font-bold text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </label>
                  <label className="block">
                    <div className="text-[10px] font-bold uppercase tracking-tight text-zinc-400">Fan (1-9)</div>
                    <input
                      value={startingFan}
                      onChange={(e) => setStartingFan(e.target.value.slice(0, 1))}
                      type="number"
                      inputMode="numeric"
                      placeholder="—"
                      className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-3 py-3 text-center text-lg font-bold text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </label>
                  <label className="block">
                    <div className="text-[10px] font-bold uppercase tracking-tight text-zinc-400">Temp</div>
                    <input
                      value={startingTemp}
                      onChange={(e) => setStartingTemp(e.target.value)}
                      type="number"
                      inputMode="numeric"
                      placeholder="—"
                      className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-3 py-3 text-center text-lg font-bold text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </label>
                </div>
              )}

              <div className={`${elapsedSeconds === 0 && !isTimerRunning ? "mt-6 border-t border-zinc-800/50 pt-4" : "mt-2"} grid grid-cols-1 gap-3`}>
                <label className="block">
                  <div className="text-xs font-medium text-zinc-300">Bean Name</div>
                  <input
                    value={beanName}
                    onChange={(e) => setBeanName(e.target.value)}
                    type="text"
                    placeholder="e.g., Ethiopia Yirgacheffe"
                    className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </label>

                <label className="block">
                  <div className="text-xs font-medium text-zinc-300">Green Weight (g)</div>
                  <input
                    value={greenWeightGrams}
                    onChange={(e) => setGreenWeightGrams(e.target.value)}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="e.g., 250"
                    className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </label>

                <label className="block">
                  <div className="text-xs font-medium text-zinc-300">Target Roast Level</div>
                  <select
                    value={targetRoastLevel}
                    onChange={(e) => setTargetRoastLevel(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  >
                    {ROAST_LEVEL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            {/* 2) LARGE TIMER */}
            <section className="rounded-3xl border border-zinc-800/60 bg-gradient-to-b from-zinc-900/35 to-zinc-900/10 p-5 text-center">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Live Timer
              </div>
              <div className="mt-3 font-mono text-6xl font-semibold tracking-tight text-amber-400">
                {formatTime(elapsedSeconds)}
              </div>
              {firstCrackTime !== null && (
                <div className="mt-2 text-2xl font-bold tracking-tight text-red-500 animate-in fade-in slide-in-from-top-2 duration-300">
                  DEV: {devSeconds}s
                </div>
              )}
              <div className="mt-2 text-xs text-zinc-500">
                {isTimerRunning ? "Running" : "Paused"}
              </div>
            </section>

            {/* 3) PHASE MILESTONES */}
            <section className="rounded-3xl border border-zinc-800/60 bg-zinc-900/20 p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Phase Milestones
                </div>
                <div className="flex gap-2">
                  {isTimerRunning && (
                    <button
                      onClick={() => setShowDiscardModal(true)}
                      className="rounded-lg border border-zinc-700 px-2 py-1 text-[10px] font-bold text-zinc-500 hover:text-red-400 hover:border-red-900/50 transition"
                    >
                      DISCARD
                    </button>
                  )}
                  {elapsedSeconds === 0 && !isTimerRunning && (
                    <button
                      onClick={() => setIsProfileBuilderOpen(true)}
                      className="rounded-lg bg-zinc-800 px-2 py-1 text-[10px] font-bold text-zinc-400 hover:text-zinc-200 transition"
                    >
                      BUILD PROFILE
                    </button>
                  )}
                </div>
              </div>
              
              {profileFollowing && (
                <div className="mt-3 p-3 rounded-2xl bg-amber-500/5 border border-amber-500/10">
                  <div className="text-[10px] font-bold text-amber-500/60 uppercase tracking-widest mb-2">Active Profile: {profileFollowing.name}</div>
                  <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {profileFollowing.steps.map((step, idx) => {
                      const stepSeconds = step.totalSeconds !== undefined ? step.totalSeconds : parseMMSS(step.time);
                      const isPast = elapsedSeconds > stepSeconds;
                      const isCurrent = currentProfileStepIdx === idx || (elapsedSeconds === stepSeconds);
                      const isNext = idx === currentProfileStepIdx + 1;
                      const isFlashing = isNext && nextProfileStep;
                      
                      return (
                        <div 
                          key={idx} 
                          className={`flex-shrink-0 px-3 py-2 rounded-xl border transition-all duration-500 ${
                            isCurrent ? "bg-amber-500 border-amber-600 text-zinc-950 scale-105 shadow-lg shadow-amber-500/20" : 
                            isFlashing ? "bg-amber-500/40 border-amber-500 animate-pulse text-amber-100" :
                            isPast ? "bg-zinc-800/30 border-zinc-800/50 text-zinc-600" :
                            "bg-zinc-900/50 border-zinc-800/50 text-zinc-400"
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

              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleStart}
                  className="col-span-2 rounded-3xl bg-amber-500 px-4 py-4 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-amber-500/90"
                >
                  START
                </button>
                {[
                  "YELLOWING",
                  "FIRST CRACK",
                ].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => logMilestone(label)}
                    className="rounded-3xl border border-zinc-800/70 bg-zinc-950/30 px-4 py-4 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-900/50 active:bg-zinc-900/70"
                  >
                    {label}
                  </button>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => logMilestone("COOLING START")}
                    className="rounded-3xl border border-zinc-800/70 bg-zinc-950/30 px-4 py-4 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-900/50 active:bg-zinc-900/70"
                  >
                    COOLING START
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDiscardModal(true)}
                    className="rounded-3xl border border-zinc-700 bg-zinc-950/30 px-4 py-4 text-sm font-semibold text-zinc-500 transition hover:bg-red-900/20 hover:text-red-400 active:bg-red-900/30"
                  >
                    DISCARD
                  </button>
                </div>
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
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/90 p-4 backdrop-blur-sm">
                <div className="w-full max-w-sm animate-in zoom-in-95 duration-200 rounded-3xl border border-zinc-800/60 bg-zinc-900 p-6 shadow-2xl text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-900/20 text-red-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Discard this roast?</h3>
                  <p className="text-sm text-zinc-400 mb-6">All logged data will be lost.</p>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowDiscardModal(false)}
                      className="flex-1 py-3 rounded-2xl bg-zinc-800 text-zinc-300 font-bold hover:bg-zinc-700 transition"
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
                profiles={profiles.filter(p => !p.beanName || p.beanName === beanName)}
                onCancel={() => setShowRoastModeDialog(false)}
                onSelectManual={() => startRoast(null)}
                onSelectProfile={(p) => startRoast(p)}
              />
            )}

            {/* 4) UNIFIED ROAST TIMELINE */}
            <section className="rounded-3xl border border-zinc-800/60 bg-zinc-900/20 p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Roast Timeline
              </div>

              <div className="mt-4 max-h-[400px] overflow-y-auto rounded-2xl border border-zinc-800/60 bg-zinc-950/20">
                {roastLog.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-zinc-500">
                    Timeline events will appear here as they occur.
                  </div>
                ) : (
                  <ul className="divide-y divide-zinc-800/60">
                    {roastLog.map((entry, idx) => (
                      <li key={`${entry.t}-${idx}`} className="px-4 py-3">
                        {entry.type === 'phase' ? (
                          <div className="flex items-center justify-between rounded-xl bg-amber-500/10 px-3 py-2 border border-amber-500/20">
                            <div className="text-sm font-bold uppercase tracking-wide text-amber-400">
                              {entry.label}
                            </div>
                            <div className="font-mono text-sm font-semibold text-amber-300">
                              {formatTime(entry.t)}
                            </div>
                          </div>
                        ) : entry.type === 'start_settings' ? (
                          <div className="flex items-center justify-between px-1">
                            <div className="font-mono text-sm text-amber-300">
                              {formatTime(entry.t)}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-xs text-zinc-400">
                                Heat{" "}
                                <span className="font-semibold text-zinc-100">{entry.heat || "—"}</span>
                                {" · "}Fan{" "}
                                <span className="font-semibold text-zinc-100">{entry.fan || "—"}</span>
                                {" · "}Temp{" "}
                                <span className="font-semibold text-zinc-100">{entry.temp || "—"}</span>
                              </div>
                              <div className="ml-1 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400 border border-amber-500/30">
                                {entry.label}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between px-1">
                            <div className="font-mono text-sm text-amber-300">
                              {formatTime(entry.t)}
                            </div>
                            <div className="text-xs text-zinc-400">
                              Heat{" "}
                              <span className="font-semibold text-zinc-100">{entry.heat || "—"}</span>
                              {" · "}Fan{" "}
                              <span className="font-semibold text-zinc-100">{entry.fan || "—"}</span>
                              {" · "}Temp{" "}
                              <span className="font-semibold text-zinc-100">{entry.temp || "—"}</span>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Floating Adjustment Log Button */}
            {isTimerRunning && (
              <button
                type="button"
                onClick={() => {
                  setHeat("");
                  setFan("");
                  setTemp("");
                  setAdjPopupTimestamp(elapsedSeconds);
                  setIsAdjPopupOpen(true);
                }}
                className="fixed bottom-24 right-6 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500 text-zinc-950 shadow-xl shadow-amber-500/20 transition active:scale-95"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            )}

            {/* Adjustment Log Popup */}
            {isAdjPopupOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm">
                <div className="w-full max-w-sm animate-in zoom-in-95 duration-200 rounded-3xl border border-zinc-800/60 bg-zinc-900 p-6 shadow-2xl">
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Log Adjustment</div>
                      <div className="mt-1 font-mono text-sm text-amber-400">{formatTime(adjPopupTimestamp ?? elapsedSeconds)}</div>
                    </div>
                    <button 
                      onClick={() => {
                        setIsAdjPopupOpen(false);
                        setActiveNumpad(null);
                      }}
                      className="rounded-full bg-zinc-800 p-2 text-zinc-400"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveNumpad("heat")}
                      className={[
                        "flex flex-col items-center justify-center rounded-2xl border bg-zinc-950/40 p-4 transition active:scale-95",
                        activeNumpad === "heat" ? "border-amber-500 ring-2 ring-amber-500/20" : "border-zinc-800/70",
                      ].join(" ")}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-tight text-zinc-500">Heat</div>
                      <div className="mt-1 text-2xl font-black text-zinc-100">{heat || "—"}</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveNumpad("fan")}
                      className={[
                        "flex flex-col items-center justify-center rounded-2xl border bg-zinc-950/40 p-4 transition active:scale-95",
                        activeNumpad === "fan" ? "border-amber-500 ring-2 ring-amber-500/20" : "border-zinc-800/70",
                      ].join(" ")}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-tight text-zinc-500">Fan</div>
                      <div className="mt-1 text-2xl font-black text-zinc-100">{fan || "—"}</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveNumpad("temp")}
                      className={[
                        "flex flex-col items-center justify-center rounded-2xl border bg-zinc-950/40 p-4 transition active:scale-95",
                        activeNumpad === "temp" ? "border-amber-500 ring-2 ring-amber-500/20" : "border-zinc-800/70",
                      ].join(" ")}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-tight text-zinc-500">Temp</div>
                      <div className="mt-1 text-2xl font-black text-zinc-100">{temp || "—"}</div>
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
                      className="w-full rounded-2xl bg-amber-500 py-4 text-lg font-bold text-zinc-950 shadow-lg shadow-amber-500/10 transition active:scale-[0.98]"
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
                <div className="text-center text-sm font-bold text-green-500 animate-bounce">
                  Roast Saved!
                </div>
              )}
              {coolingStartTime !== null && (
                <button
                  type="button"
                  onClick={handleStop}
                  className="w-full rounded-3xl bg-green-600 px-4 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-green-500 active:bg-green-600/90"
                >
                  SAVE ROAST
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === "Brew" && (
          <div className="space-y-4">
            {brewStep === 0 && (
              <div className="space-y-6">
                <section className="rounded-3xl border border-zinc-800/60 bg-zinc-900/30 p-5 shadow-sm">
                  <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">Brew Setup</div>
                  <div className="mt-4 space-y-4">
                    <label className="block">
                      <div className="text-xs font-medium text-zinc-300">Link to Roast Session</div>
                      <select
                        value={brewLinkedRoastId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setBrewLinkedRoastId(id);
                          if (id) {
                            const roasts = JSON.parse(localStorage.getItem("roasts") || "[]");
                            const roast = roasts.find(r => String(r.id) === id);
                            if (roast) setBrewBeanName(roast.beanName);
                          }
                        }}
                        className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      >
                        <option value="">None (Manual Entry)</option>
                        {JSON.parse(localStorage.getItem("roasts") || "[]").map(r => (
                          <option key={r.id} value={r.id}>{r.beanName} ({r.date})</option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <div className="text-xs font-medium text-zinc-300">Bean Name</div>
                      <input
                        value={brewBeanName}
                        onChange={(e) => setBrewBeanName(e.target.value)}
                        type="text"
                        placeholder="e.g., Ethiopia Yirgacheffe"
                        className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <div className="text-xs font-medium text-zinc-300">Brew Method</div>
                        <select
                          value={brewMethod}
                          onChange={(e) => setBrewMethod(e.target.value)}
                          className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                        >
                          {BREW_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <div className="text-xs font-medium text-zinc-300">Device Name</div>
                        <input
                          value={brewDevice}
                          onChange={(e) => setBrewDevice(e.target.value)}
                          type="text"
                          placeholder="e.g., V60"
                          className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <div className="text-xs font-medium text-zinc-300">Ratio</div>
                        <select
                          value={brewRatio}
                          onChange={(e) => setBrewRatio(e.target.value)}
                          className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                        >
                          {WATER_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <div className="text-xs font-medium text-zinc-300">Grind Size</div>
                        <select
                          value={brewGrindSize}
                          onChange={(e) => setBrewGrindSize(e.target.value)}
                          className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                        >
                          {GRIND_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </label>
                    </div>

                    <label className="block">
                      <div className="text-xs font-medium text-zinc-300">Water Temp (°F)</div>
                      <input
                        value={brewTemp}
                        onChange={(e) => setBrewTemp(e.target.value)}
                        type="number"
                        placeholder="205"
                        className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </label>

                    <button
                      type="button"
                      className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-800 bg-zinc-950/20 py-8 text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-400"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                      <span className="text-xs font-medium">Tap to add photo</span>
                    </button>

                    <button
                      onClick={() => setBrewStep(1)}
                      className="w-full rounded-3xl bg-amber-500 px-4 py-4 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-amber-500/90"
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
                  <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Step 1 of 4 — Acidity & Body</div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(s => (
                      <div key={s} className={`h-1.5 w-1.5 rounded-full ${s <= 1 ? 'bg-amber-500' : 'bg-zinc-800'}`} />
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-800/60 bg-zinc-900/30 p-6 shadow-sm">
                  <p className="text-lg font-medium leading-relaxed text-zinc-100">"Take a small sip. Rate these two qualities."</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">ACIDITY — How bright or sharp is it?</div>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map(num => (
                        <button
                          key={num}
                          onClick={() => setAcidityRating(num)}
                          className={`flex h-14 flex-col items-center justify-center rounded-2xl border transition ${
                            acidityRating === num ? "border-amber-500 bg-amber-500/20 text-amber-400" : "border-zinc-800 bg-zinc-900/50 text-zinc-500"
                          }`}
                        >
                          <span className="text-lg font-bold">{num}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between px-1 text-[10px] uppercase tracking-tighter text-zinc-500">
                      <span>Flat</span>
                      <span>Low</span>
                      <span>Medium</span>
                      <span>Bright</span>
                      <span>Vibrant</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">BODY — How does it feel in your mouth?</div>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map(num => (
                        <button
                          key={num}
                          onClick={() => setBodyRating(num)}
                          className={`flex h-14 flex-col items-center justify-center rounded-2xl border transition ${
                            bodyRating === num ? "border-amber-500 bg-amber-500/20 text-amber-400" : "border-zinc-800 bg-zinc-900/50 text-zinc-500"
                          }`}
                        >
                          <span className="text-lg font-bold">{num}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between px-1 text-[10px] uppercase tracking-tighter text-zinc-500">
                      <span>Watery</span>
                      <span>Light</span>
                      <span>Medium</span>
                      <span>Full</span>
                      <span>Syrupy</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setBrewStep(2)}
                  className="w-full rounded-3xl bg-amber-500 py-4 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-amber-500/90"
                >
                  NEXT
                </button>
              </div>
            )}

            {brewStep === 2 && (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Step 2 of 4 — What do you taste?</div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(s => (
                      <div key={s} className={`h-1.5 w-1.5 rounded-full ${s <= 2 ? 'bg-amber-500' : 'bg-zinc-800'}`} />
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-800/60 bg-zinc-900/30 p-6 shadow-sm">
                  <p className="text-lg font-medium leading-relaxed text-zinc-100">"Take a full sip. Which broad flavor families stand out? Select all that apply."</p>
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
                        selectedFamilies.includes(family.id) ? "border-amber-500 bg-amber-500/15 text-amber-400" : "border-zinc-800 bg-zinc-950/40 text-zinc-400"
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
                    className="rounded-3xl border border-zinc-800 py-4 text-base font-semibold text-zinc-300 transition active:bg-zinc-900"
                  >
                    BACK
                  </button>
                  <button
                    disabled={selectedFamilies.length === 0}
                    onClick={() => setBrewStep(3)}
                    className="rounded-3xl bg-amber-500 py-4 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-amber-500/90 disabled:opacity-50 disabled:grayscale"
                  >
                    NEXT
                  </button>
                </div>
              </div>
            )}

            {brewStep === 3 && (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Step 3 of 4 — Let's get specific</div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(s => (
                      <div key={s} className={`h-1.5 w-1.5 rounded-full ${s <= 3 ? 'bg-amber-500' : 'bg-zinc-800'}`} />
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-800/60 bg-zinc-900/30 p-6 shadow-sm">
                  <p className="text-lg font-medium leading-relaxed text-zinc-100">"For each flavor family you selected, which specific notes fit best?"</p>
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
                            <div className="text-xs font-bold uppercase tracking-wider text-zinc-100">{family.label}</div>
                          </div>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {Object.keys(options).map(type => (
                              <button
                                key={type}
                                onClick={() => setExpandedFruitType(expandedFruitType === type ? null : type)}
                                className={`rounded-xl border px-3 py-2 text-[10px] font-bold tracking-widest transition ${
                                  expandedFruitType === type ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-zinc-800 bg-zinc-900/50 text-zinc-500"
                                }`}
                              >
                                {type.replace('_', ' ')}
                              </button>
                            ))}
                          </div>
                          {expandedFruitType && (
                            <div className="flex flex-wrap gap-2 rounded-2xl bg-zinc-950/30 p-4 border border-zinc-800/40">
                              {options[expandedFruitType].map(opt => (
                                <button
                                  key={opt}
                                  onClick={() => {
                                    const next = selectedDescriptors.includes(opt)
                                      ? selectedDescriptors.filter(d => d !== opt)
                                      : [...selectedDescriptors, opt];
                                    setSelectedDescriptors(next);
                                  }}
                                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                                    selectedDescriptors.includes(opt) ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-zinc-800 bg-zinc-900/30 text-zinc-400"
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div key={familyId} className="space-y-4">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{family.emoji}</span>
                          <div className="text-xs font-bold uppercase tracking-wider text-zinc-100">{family.label}</div>
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
                                selectedDescriptors.includes(opt) ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-zinc-800 bg-zinc-900/30 text-zinc-400"
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
                    className="rounded-3xl border border-zinc-800 py-4 text-base font-semibold text-zinc-300 transition active:bg-zinc-900"
                  >
                    BACK
                  </button>
                  <button
                    onClick={() => setBrewStep(4)}
                    className="rounded-3xl bg-amber-500 py-4 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-amber-500/90"
                  >
                    NEXT
                  </button>
                </div>
              </div>
            )}

            {brewStep === 4 && (
              <div className="space-y-8 pb-12">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Step 4 of 4 — Your Tasting Notes</div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(s => (
                      <div key={s} className={`h-1.5 w-1.5 rounded-full ${s <= 4 ? 'bg-amber-500' : 'bg-zinc-800'}`} />
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-800/60 bg-zinc-900/30 p-6 shadow-sm">
                  <p className="text-lg font-medium leading-relaxed text-zinc-100">"Here are the flavor notes you identified."</p>
                </div>

                <section className="rounded-3xl border border-zinc-800/60 bg-white p-8 shadow-xl text-zinc-950">
                  <div className="flex flex-col items-center text-center">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-1">Single Origin Roast</div>
                    <h3 className="text-2xl font-black uppercase tracking-tight mb-0.5">{brewBeanName}</h3>
                    {(() => {
                      if (brewLinkedRoastId) {
                        const roasts = JSON.parse(localStorage.getItem("roasts") || "[]");
                        const roast = roasts.find(r => String(r.id) === brewLinkedRoastId);
                        if (roast) return <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-6">{roast.targetLevel}</div>;
                      }
                      return <div className="mb-6" />;
                    })()}
                    
                    <div className="w-12 h-[2px] bg-amber-500 mb-6" />
                    
                    <div className="text-lg font-bold text-amber-600 tracking-tight leading-relaxed italic">
                      {selectedDescriptors?.slice(0, 5).join(' · ')}
                    </div>
                  </div>
                </section>

                <div className="space-y-6">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Overall Rating</div>
                    <div className="mt-4 flex gap-2">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button key={star} onClick={() => setBrewRating(star)} className="transition active:scale-90">
                          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill={brewRating >= star ? "#f59e0b" : "none"} stroke={brewRating >= star ? "#f59e0b" : "#3f3f46"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                          </svg>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Brew again?</div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {['Yes', 'No', 'Maybe'].map(opt => (
                        <button
                          key={opt}
                          onClick={() => setBrewAgain(opt)}
                          className={`rounded-2xl border py-3 text-sm font-bold transition ${
                            brewAgain === opt ? "border-amber-500 bg-amber-500/20 text-amber-400" : "border-zinc-800 bg-zinc-900/50 text-zinc-500"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Free Notes</div>
                    <textarea
                      value={brewNotes}
                      onChange={(e) => setBrewNotes(e.target.value)}
                      placeholder="Any additional thoughts on this cup?"
                      className="mt-4 min-h-[120px] w-full rounded-3xl border border-zinc-800 bg-zinc-950/40 p-5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setBrewStep(3)}
                    className="rounded-3xl border border-zinc-800 py-4 text-base font-semibold text-zinc-300 transition active:bg-zinc-900"
                  >
                    BACK
                  </button>
                  <button
                    onClick={handleSaveBrew}
                    className="rounded-3xl bg-amber-500 py-4 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-amber-500/90"
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
            <div className="flex rounded-2xl bg-zinc-800 p-1">
              <button
                onClick={() => setHistorySegment("ROASTS")}
                className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition ${
                  historySegment === "ROASTS" ? "bg-amber-500 text-zinc-950" : "text-zinc-400"
                }`}
              >
                ROASTS
              </button>
              <button
                onClick={() => setHistorySegment("TASTINGS")}
                className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition ${
                  historySegment === "TASTINGS" ? "bg-amber-500 text-zinc-950" : "text-zinc-400"
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
                className="w-full rounded-2xl border border-zinc-800/70 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>

            {historySegment === "ROASTS" ? (
              !selectedRoast ? (
                <div className="space-y-3">
                  {(() => {
                    let savedRoasts = JSON.parse(localStorage.getItem("roasts") || "[]");
                    if (historySearch) {
                      savedRoasts = savedRoasts.filter(r => r.beanName.toLowerCase().includes(historySearch.toLowerCase()));
                    }
                    if (savedRoasts.length === 0) {
                      return (
                        <div className="rounded-3xl border border-zinc-800/60 bg-zinc-900/10 p-8 text-center">
                          <div className="text-zinc-500 text-sm">
                            {historySearch ? "No matching roasts found." : "No roasts logged yet. Start your first roast!"}
                          </div>
                        </div>
                      );
                    }
                    return savedRoasts.map((roast) => (
                      <button
                        key={roast.id}
                        type="button"
                        onClick={() => setSelectedRoast(roast)}
                        className="w-full rounded-3xl border border-zinc-800/60 bg-zinc-900/20 p-4 text-left transition hover:bg-zinc-900/35 active:scale-[0.98]"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <RoastSparkline 
                              data={roast.roastLog
                                .filter(e => (e.type === 'adjustment' || e.type === 'start_settings') && e.temp)
                                .map(e => ({ temp: Number(e.temp) }))
                              } 
                            />
                            <div>
                              <div className="text-sm font-bold text-zinc-100">{roast.beanName}</div>
                              <div className="mt-0.5 text-[11px] text-zinc-500">{roast.date}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-sm font-semibold text-amber-400">
                              {roast.duration}
                            </div>
                            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
                              {roast.targetLevel.split(" ")[0]}
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
                    className="flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    BACK TO HISTORY
                  </button>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      {!isEditingRoast ? (
                        <button
                          onClick={() => startEditing(selectedRoast)}
                          className="rounded-xl bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-700 transition"
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
                          className="rounded-xl bg-red-900/20 px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-900/30 transition"
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

                  <section className="rounded-3xl border border-zinc-800/60 bg-zinc-900/30 p-5 shadow-sm">
                    {!isEditingRoast ? (
                      <>
                        <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">{selectedRoast.date}</div>
                        <div className="mt-2 text-2xl font-bold tracking-tight text-zinc-50">{selectedRoast.beanName}</div>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <label className="block">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Date/Time</div>
                          <input 
                            type="text" 
                            value={editedRoast.date} 
                            onChange={(e) => updateEditedRoast('date', e.target.value)}
                            className="w-full bg-zinc-950/40 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-100"
                          />
                        </label>
                        <label className="block">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Bean Name</div>
                          <input 
                            type="text" 
                            value={editedRoast.beanName} 
                            onChange={(e) => updateEditedRoast('beanName', e.target.value)}
                            className="w-full bg-zinc-950/40 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-100"
                          />
                        </label>
                      </div>
                    )}
                    <div className="mt-4 grid grid-cols-2 gap-4 border-t border-zinc-800/50 pt-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-zinc-500">Green Weight</div>
                        {!isEditingRoast ? (
                          <div className="text-sm font-medium text-zinc-200">{selectedRoast.greenWeight}g</div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              value={editedRoast.greenWeight} 
                              onChange={(e) => updateEditedRoast('greenWeight', e.target.value)}
                              className="w-20 bg-zinc-950/40 border border-zinc-800 rounded-lg px-2 py-1 text-sm text-zinc-100"
                            />
                            <span className="text-sm text-zinc-500">g</span>
                          </div>
                        )}
                      </div>
                      <div className="col-span-1">
                        <div className="text-[10px] uppercase tracking-widest text-zinc-500">Roasted Weight</div>
                        {!isEditingRoast ? (
                          <div className="text-sm font-medium text-zinc-200">{selectedRoast.roastedWeight ? selectedRoast.roastedWeight + "g" : "—"}</div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              value={editedRoast.roastedWeight || ""} 
                              onChange={(e) => updateEditedRoast('roastedWeight', e.target.value)}
                              className="w-20 bg-zinc-950/40 border border-zinc-800 rounded-lg px-2 py-1 text-sm text-zinc-100"
                              placeholder="0"
                            />
                            <span className="text-sm text-zinc-500">g</span>
                          </div>
                        )}
                      </div>
                      <div className="col-span-1">
                        <div className="text-[10px] uppercase tracking-widest text-zinc-500">Duration</div>
                        {!isEditingRoast ? (
                          <div className="text-sm font-medium text-amber-400">{selectedRoast.duration}</div>
                        ) : (
                          <input 
                            type="text" 
                            value={editedRoast.duration} 
                            onChange={(e) => updateEditedRoast('duration', e.target.value)}
                            className="w-24 bg-zinc-950/40 border border-zinc-800 rounded-lg px-2 py-1 text-sm text-amber-400"
                          />
                        )}
                      </div>
                      <div className="col-span-1">
                        <div className="text-[10px] uppercase tracking-widest text-red-500">Dev Time</div>
                        {!isEditingRoast ? (
                          <div className="text-sm font-bold text-red-400">{selectedRoast.devSeconds}s</div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              value={editedRoast.devSeconds} 
                              onChange={(e) => updateEditedRoast('devSeconds', e.target.value)}
                              className="w-20 bg-zinc-950/40 border border-zinc-800 rounded-lg px-2 py-1 text-sm text-red-400"
                            />
                            <span className="text-sm text-red-500/60">s</span>
                          </div>
                        )}
                      </div>
                      <div className="col-span-2">
                        <div className="text-[10px] uppercase tracking-widest text-zinc-500">Roast Level</div>
                        {!isEditingRoast ? (
                          <div className="text-sm font-medium text-zinc-200">{selectedRoast.targetLevel}</div>
                        ) : (
                          <select
                            value={editedRoast.targetLevel}
                            onChange={(e) => updateEditedRoast('targetLevel', e.target.value)}
                            className="mt-1 w-full bg-zinc-950/40 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100"
                          >
                            {ROAST_LEVEL_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    {!isEditingRoast && (
                      <div className="mt-6 border-t border-zinc-800/50 pt-6">
                        <RoastDetailChart roast={selectedRoast} />
                      </div>
                    )}
                  </section>

                  {selectedRoast.profile && (
                    <section className="rounded-3xl border border-zinc-800/60 bg-zinc-900/20 p-5">
                      <div className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-4">Profile vs Actual</div>
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2">
                          <div>Planned</div>
                          <div>Actual Adjustment</div>
                        </div>
                        {selectedRoast.profile.steps.map((step, idx) => {
                          const stepSeconds = step.totalSeconds !== undefined ? step.totalSeconds : parseMMSS(step.time);
                          const actual = selectedRoast.roastLog.find(e => e.t === stepSeconds && e.type === 'adjustment');
                          
                          return (
                            <div key={idx} className="grid grid-cols-2 gap-2">
                              <div className="bg-zinc-950/30 border border-zinc-800/50 rounded-xl p-2">
                                <div className="text-[10px] font-mono text-zinc-500">{step.time}</div>
                                <div className="text-xs font-bold text-zinc-300">H{step.heat} F{step.fan}</div>
                              </div>
                              <div className={`rounded-xl p-2 border ${actual ? "bg-amber-500/10 border-amber-500/20" : "bg-red-500/5 border-red-500/10 opacity-50"}`}>
                                {actual ? (
                                  <>
                                    <div className="text-[10px] font-mono text-amber-500/60">{formatTime(actual.t)}</div>
                                    <div className="text-xs font-bold text-amber-400">H{actual.heat} F{actual.fan}</div>
                                  </>
                                ) : (
                                  <div className="text-[10px] italic text-red-400/60 mt-1">Missed</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  <section className="rounded-3xl border border-zinc-800/60 bg-zinc-900/20 p-5">
                    <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">Roast Timeline</div>
                    <div className="mt-4 space-y-3">
                      {!(!isEditingRoast ? selectedRoast.roastLog : editedRoast.roastLog) || (!isEditingRoast ? selectedRoast.roastLog : editedRoast.roastLog).length === 0 ? (
                        <div className="text-xs text-zinc-500">No events logged.</div>
                      ) : (
                        (!isEditingRoast ? selectedRoast.roastLog : editedRoast.roastLog).map((entry, i) => (
                          <div key={i} className="border-b border-zinc-800/30 pb-2 last:border-0 last:pb-0">
                            {entry.type === 'phase' ? (
                              <div className="flex items-center justify-between rounded-xl bg-amber-500/10 px-3 py-2 border border-amber-500/20">
                                {!isEditingRoast ? (
                                  <div className="text-sm font-bold uppercase tracking-wide text-amber-400">
                                    {entry.label}
                                  </div>
                                ) : (
                                  <input 
                                    type="text" 
                                    value={entry.label} 
                                    onChange={(e) => updateLogEntry(i, 'label', e.target.value)}
                                    className="bg-transparent border-none p-0 text-sm font-bold uppercase tracking-wide text-amber-400 focus:ring-0 w-32"
                                  />
                                )}
                                {!isEditingRoast ? (
                                  <div className="font-mono text-sm font-semibold text-amber-300">
                                    {formatTime(entry.t)}
                                  </div>
                                ) : (
                                  <input 
                                    type="number" 
                                    value={entry.t} 
                                    onChange={(e) => updateLogEntry(i, 't', Number(e.target.value))}
                                    className="bg-zinc-950/40 border border-zinc-800 rounded-lg px-2 py-0.5 text-xs font-mono text-amber-300 w-16 text-right"
                                  />
                                )}
                              </div>
                            ) : entry.type === 'start_settings' ? (
                              <div className="flex items-center justify-between px-1">
                                {!isEditingRoast ? (
                                  <div className="font-mono text-sm text-amber-300">
                                    {formatTime(entry.t)}
                                  </div>
                                ) : (
                                  <input 
                                    type="number" 
                                    value={entry.t} 
                                    onChange={(e) => updateLogEntry(i, 't', Number(e.target.value))}
                                    className="bg-zinc-950/40 border border-zinc-800 rounded-lg px-2 py-0.5 text-xs font-mono text-amber-300 w-16"
                                  />
                                )}
                                <div className="flex items-center gap-2">
                                  <div className="text-xs text-zinc-400 flex items-center gap-1">
                                    H:
                                    {!isEditingRoast ? (
                                      <span className="font-semibold text-zinc-100">{entry.heat || "—"}</span>
                                    ) : (
                                      <input type="text" value={entry.heat} onChange={(e) => updateLogEntry(i, 'heat', e.target.value)} className="w-6 bg-zinc-950/40 border border-zinc-800 rounded px-1 text-zinc-100" />
                                    )}
                                    <span className="mx-0.5">·</span>
                                    F:
                                    {!isEditingRoast ? (
                                      <span className="font-semibold text-zinc-100">{entry.fan || "—"}</span>
                                    ) : (
                                      <input type="text" value={entry.fan} onChange={(e) => updateLogEntry(i, 'fan', e.target.value)} className="w-6 bg-zinc-950/40 border border-zinc-800 rounded px-1 text-zinc-100" />
                                    )}
                                    <span className="mx-0.5">·</span>
                                    T:
                                    {!isEditingRoast ? (
                                      <span className="font-semibold text-zinc-100">{entry.temp || "—"}°</span>
                                    ) : (
                                      <input type="text" value={entry.temp} onChange={(e) => updateLogEntry(i, 'temp', e.target.value)} className="w-12 bg-zinc-950/40 border border-zinc-800 rounded px-1 text-zinc-100" />
                                    )}
                                  </div>
                                  <div className="ml-1 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400 border border-amber-500/30">
                                    {entry.label}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between px-1">
                                {!isEditingRoast ? (
                                  <div className="font-mono text-sm text-amber-300">
                                    {formatTime(entry.t)}
                                  </div>
                                ) : (
                                  <input 
                                    type="number" 
                                    value={entry.t} 
                                    onChange={(e) => updateLogEntry(i, 't', Number(e.target.value))}
                                    className="bg-zinc-950/40 border border-zinc-800 rounded-lg px-2 py-0.5 text-xs font-mono text-amber-300 w-16"
                                  />
                                )}
                                <div className="text-xs text-zinc-400 flex items-center gap-1">
                                  H:
                                  {!isEditingRoast ? (
                                    <span className="font-semibold text-zinc-100">{entry.heat || "—"}</span>
                                  ) : (
                                    <input type="text" value={entry.heat} onChange={(e) => updateLogEntry(i, 'heat', e.target.value)} className="w-6 bg-zinc-950/40 border border-zinc-800 rounded px-1 text-zinc-100" />
                                  )}
                                  <span className="mx-0.5">·</span>
                                  F:
                                  {!isEditingRoast ? (
                                    <span className="font-semibold text-zinc-100">{entry.fan || "—"}</span>
                                  ) : (
                                    <input type="text" value={entry.fan} onChange={(e) => updateLogEntry(i, 'fan', e.target.value)} className="w-6 bg-zinc-950/40 border border-zinc-800 rounded px-1 text-zinc-100" />
                                  )}
                                  <span className="mx-0.5">·</span>
                                  T:
                                  {!isEditingRoast ? (
                                    <span className="font-semibold text-zinc-100">{entry.temp || "—"}°</span>
                                  ) : (
                                    <input type="text" value={entry.temp} onChange={(e) => updateLogEntry(i, 'temp', e.target.value)} className="w-12 bg-zinc-950/40 border border-zinc-800 rounded px-1 text-zinc-100" />
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
                      onClick={() => handleDeleteRoast(selectedRoast.id)}
                      className="w-full rounded-2xl border border-red-900/30 bg-red-900/10 py-3 text-sm font-semibold text-red-400 transition hover:bg-red-900/20 active:bg-red-900/30"
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
                    let savedTastings = JSON.parse(localStorage.getItem("tastingNotes") || "[]");
                    if (historySearch) {
                      savedTastings = savedTastings.filter(t => (t.beanName || "Unknown Bean").toLowerCase().includes(historySearch.toLowerCase()));
                    }
                    if (savedTastings.length === 0) {
                      return (
                        <div className="rounded-3xl border border-zinc-800/60 bg-zinc-900/10 p-8 text-center">
                          <div className="text-zinc-500 text-sm">
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
                        className="w-full rounded-3xl border border-zinc-800/60 bg-zinc-900/20 p-5 text-left transition hover:bg-zinc-900/35 active:scale-[0.98]"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <div className="text-base font-bold text-white">{tasting.beanName || "Unknown Bean"}</div>
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map(star => (
                              <svg key={star} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill={tasting.rating >= star ? "#f59e0b" : "none"} stroke={tasting.rating >= star ? "#f59e0b" : "#3f3f46"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                              </svg>
                            ))}
                          </div>
                        </div>
                        <div className="text-[11px] text-zinc-400 mb-3">{tasting.date} · {tasting.method}</div>
                        
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {tasting.descriptors?.slice(0, 3).map((d, i) => (
                            <span key={i} className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-400">
                              {d}
                            </span>
                          ))}
                          {tasting.descriptors?.length > 3 && (
                            <span className="text-[10px] font-bold text-zinc-500 py-0.5">+{tasting.descriptors.length - 3} more</span>
                          )}
                        </div>
                        
                        <div className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase">
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
                    className="flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    BACK TO HISTORY
                  </button>

                  <section className="rounded-3xl border border-zinc-800/60 bg-zinc-900/30 p-6 shadow-sm">
                    <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">{selectedTastingNote.date}</div>
                    <h2 className="mt-2 text-3xl font-bold text-zinc-50 leading-tight">{selectedTastingNote.beanName || "Unknown Bean"}</h2>
                    <div className="mt-1 text-sm font-medium text-amber-500/80">{selectedTastingNote.method} · {selectedTastingNote.device}</div>
                    
                    <div className="mt-8 space-y-6 border-t border-zinc-800/50 pt-6">
                      <div className="grid grid-cols-2 gap-y-5 gap-x-8">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-1">Ratio</div>
                          <div className="text-sm font-bold text-zinc-200">{selectedTastingNote.ratio}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-1">Grind</div>
                          <div className="text-sm font-bold text-zinc-200">{selectedTastingNote.grindSize}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-1">Temp</div>
                          <div className="text-sm font-bold text-zinc-200">{selectedTastingNote.temp}°F</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-1">Rating</div>
                          <div className="flex gap-0.5 mt-0.5">
                            {[1, 2, 3, 4, 5].map(star => (
                              <svg key={star} xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={selectedTastingNote.rating >= star ? "#f59e0b" : "none"} stroke={selectedTastingNote.rating >= star ? "#f59e0b" : "#3f3f46"} strokeWidth="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                              </svg>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-2">Acidity: {["Flat", "Low", "Medium", "Bright", "Vibrant"][selectedTastingNote.acidity-1]} ({selectedTastingNote.acidity})</div>
                          <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                            <div className="h-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" style={{ width: `${(selectedTastingNote.acidity / 5) * 100}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-2">Body: {["Watery", "Light", "Medium", "Full", "Syrupy"][selectedTastingNote.body-1]} ({selectedTastingNote.body})</div>
                          <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                            <div className="h-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" style={{ width: `${(selectedTastingNote.body / 5) * 100}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {selectedTastingNote.families?.map(familyId => (
                          <div key={familyId}>
                            <div className="text-[10px] uppercase tracking-widest font-black text-zinc-400 mb-2">
                              {FLAVOR_FAMILIES.find(f => f.id === familyId)?.label}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {selectedTastingNote.descriptors?.filter(d => {
                                const familyOptions = FLAVOR_DRILLDOWN[familyId];
                                if (typeof familyOptions === 'object' && !Array.isArray(familyOptions)) {
                                  return Object.values(familyOptions).flat().includes(d);
                                }
                                return familyOptions.includes(d);
                              }).map((d, i) => (
                                <span key={i} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300">
                                  {d}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <section className="rounded-3xl border border-zinc-800/60 bg-white p-8 shadow-xl text-zinc-950">
                        <div className="flex flex-col items-center text-center">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-1">Tasting Summary</div>
                          <h3 className="text-xl font-black uppercase tracking-tight mb-0.5">{selectedTastingNote.beanName || "Unknown Bean"}</h3>
                          <div className="w-10 h-[2px] bg-amber-500 my-4" />
                          <div className="text-base font-bold text-amber-600 tracking-tight italic leading-relaxed">
                            {selectedTastingNote.descriptors?.slice(0, 5).join(' · ')}
                          </div>
                        </div>
                      </section>

                      {selectedTastingNote.notes && (
                        <div className="rounded-2xl bg-zinc-950/40 p-5 border border-zinc-800/40">
                          <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-2">Free Notes</div>
                          <p className="text-sm italic text-zinc-300 leading-relaxed font-medium">"{selectedTastingNote.notes}"</p>
                        </div>
                      )}
                    </div>
                  </section>
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
                  <h2 className="text-2xl font-bold text-white">Your Beans</h2>
                  <button
                    onClick={() => setBeansView("addBean")}
                    className="rounded-2xl bg-amber-500 px-4 py-2 text-xs font-bold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:scale-95"
                  >
                    ADD BEAN
                  </button>
                </header>

                <div className="space-y-3">
                  {(() => {
                    const roasts = JSON.parse(localStorage.getItem("roasts") || "[]");
                    const tastings = JSON.parse(localStorage.getItem("tastingNotes") || "[]");
                    const manualBeans = JSON.parse(localStorage.getItem("beans") || "[]");

                    // Gather all unique bean names
                    const allBeanNames = Array.from(new Set([
                      ...roasts.map(r => r.beanName),
                      ...tastings.map(t => t.beanName),
                      ...manualBeans.map(b => b.name)
                    ])).filter(Boolean);

                    if (allBeanNames.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                          <div className="rounded-3xl border border-zinc-800/60 bg-zinc-900/10 p-8">
                            <p className="max-w-[240px] text-sm text-zinc-500 leading-relaxed">
                              No beans yet. Beans appear automatically when you log a roast or complete a tasting, or tap Add Bean to add one manually.
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return allBeanNames.map(name => {
                      const beanRoasts = roasts.filter(r => r.beanName === name);
                      const beanTastings = tastings.filter(t => t.beanName === name);
                      const manualData = manualBeans.find(b => b.name === name);
                      
                      // Calculate average rating
                      const ratings = beanTastings.map(t => t.rating).filter(r => r > 0);
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
                            setSelectedBean({ name, ...manualData });
                            setBeansView("beanDetail");
                          }}
                          className="w-full rounded-3xl border border-zinc-800/60 bg-zinc-900/20 p-5 text-left transition hover:bg-zinc-900/35 active:scale-[0.98]"
                        >
                          <div className="flex justify-between items-start mb-1">
                            <div className="text-base font-bold text-white">{name}</div>
                            {avgRating && (
                              <div className="flex items-center gap-1 text-amber-500">
                                <span className="text-xs font-bold">{avgRating}</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="flex justify-between items-center mt-1">
                            <div className="text-[11px] text-zinc-400">
                              {beanRoasts.length} roasts · {beanTastings.length} tastings
                            </div>
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                              Last: {recentDate}
                            </div>
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {beansView === "addBean" && (
              <div className="space-y-6">
                <button
                  onClick={() => setBeansView("list")}
                  className="flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  BACK TO BEANS
                </button>
                
                <header>
                  <h2 className="text-2xl font-bold text-white">Add New Bean</h2>
                </header>

                <div className="space-y-4 rounded-3xl border border-zinc-800/60 bg-zinc-900/30 p-6 shadow-sm">
                  <label className="block">
                    <div className="text-xs font-medium text-zinc-300">Bean Name (Required)</div>
                    <input
                      type="text"
                      value={newBean.name}
                      onChange={(e) => setNewBean({ ...newBean, name: e.target.value })}
                      placeholder="e.g., Ethiopia Yirgacheffe"
                      className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-4">
                    <label className="block">
                      <div className="text-xs font-medium text-zinc-300">Origin/Country</div>
                      <input
                        type="text"
                        value={newBean.origin}
                        onChange={(e) => setNewBean({ ...newBean, origin: e.target.value })}
                        placeholder="e.g., Ethiopia"
                        className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </label>
                    <label className="block">
                      <div className="text-xs font-medium text-zinc-300">Farm/Producer</div>
                      <input
                        type="text"
                        value={newBean.farm}
                        onChange={(e) => setNewBean({ ...newBean, farm: e.target.value })}
                        placeholder="Optional"
                        className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <label className="block">
                      <div className="text-xs font-medium text-zinc-300">Purchase Date</div>
                      <input
                        type="date"
                        value={newBean.purchaseDate}
                        onChange={(e) => setNewBean({ ...newBean, purchaseDate: e.target.value })}
                        className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </label>
                    <label className="block">
                      <div className="text-xs font-medium text-zinc-300">Purchase Weight (g)</div>
                      <input
                        type="number"
                        value={newBean.purchaseWeight}
                        onChange={(e) => setNewBean({ ...newBean, purchaseWeight: e.target.value })}
                        placeholder="e.g., 1000"
                        className="mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </label>
                  </div>

                  <button
                    disabled={!newBean.name}
                    onClick={() => {
                      const existing = JSON.parse(localStorage.getItem("beans") || "[]");
                      localStorage.setItem("beans", JSON.stringify([...existing, { ...newBean, id: Date.now() }]));
                      setNewBean({ name: "", origin: "", farm: "", purchaseDate: "", purchaseWeight: "" });
                      setBeansView("list");
                    }}
                    className="mt-4 w-full rounded-3xl bg-amber-500 py-4 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-amber-500/90 disabled:opacity-50 disabled:grayscale"
                  >
                    SAVE BEAN
                  </button>
                </div>
              </div>
            )}

            {beansView === "beanDetail" && selectedBean && (
              <div className="space-y-6 pb-20">
                <button
                  onClick={() => setBeansView("list")}
                  className="flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  BACK TO BEANS
                </button>

                <header>
                  <h2 className="text-3xl font-bold text-white leading-tight">{selectedBean.name}</h2>
                  {selectedBean.origin && (
                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-zinc-400">
                      <span>{selectedBean.origin}</span>
                      {selectedBean.farm && <span>· {selectedBean.farm}</span>}
                    </div>
                  )}
                </header>

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-[0.15em] text-zinc-500">Saved Profiles</h3>
                    <button
                      onClick={() => setIsProfileBuilderOpen(true)}
                      className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-[10px] font-bold text-amber-400 hover:bg-amber-500/20 transition"
                    >
                      + NEW PROFILE
                    </button>
                  </div>
                  <div className="space-y-2">
                    {profiles.filter(p => p.beanName === selectedBean.name).length === 0 ? (
                      <p className="text-sm text-zinc-600 italic py-2">No profiles saved for this bean.</p>
                    ) : (
                      profiles.filter(p => p.beanName === selectedBean.name).map(p => (
                        <div key={p.id} className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900/30 border border-zinc-800/60">
                          <div>
                            <div className="font-bold text-zinc-100 flex items-center gap-2">
                              {p.name}
                              {p.isDefault && <span className="text-[8px] bg-amber-500 text-zinc-950 px-1 rounded font-black uppercase">Default</span>}
                            </div>
                            <div className="text-[10px] text-zinc-500 mt-1">{p.steps.length} steps</div>
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
                                className="text-[10px] font-bold text-zinc-500 hover:text-amber-500 transition"
                              >
                                SET DEFAULT
                              </button>
                            )}
                            <button 
                              onClick={() => setProfiles(profiles.filter(profile => profile.id !== p.id))}
                              className="text-[10px] font-bold text-red-500/60 hover:text-red-500 transition"
                            >
                              DELETE
                            </button>
                          </div>
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

                {selectedBean.purchaseDate && (
                  <section className="rounded-3xl border border-zinc-800/60 bg-zinc-900/30 p-5 shadow-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-1">Purchased</div>
                        <div className="text-sm font-bold text-zinc-200">{selectedBean.purchaseDate}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-1">Stock</div>
                        <div className="text-sm font-bold text-zinc-200">
                          {(() => {
                            const roasts = JSON.parse(localStorage.getItem("roasts") || "[]");
                            const usedWeight = roasts
                              .filter(r => r.beanName === selectedBean.name)
                              .reduce((sum, r) => sum + (Number(r.greenWeight) || 0), 0);
                            const remaining = (Number(selectedBean.purchaseWeight) || 0) - usedWeight;
                            return `${remaining}g / ${selectedBean.purchaseWeight}g`;
                          })()}
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-[0.15em] text-zinc-500">Roast Sessions</h3>
                    {(() => {
                      const roasts = JSON.parse(localStorage.getItem("roasts") || "[]").filter(r => r.beanName === selectedBean.name);
                      return <span className="text-[10px] font-bold text-amber-500/80 bg-amber-500/10 px-2 py-0.5 rounded-full">{roasts.length} sessions</span>;
                    })()}
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const roasts = JSON.parse(localStorage.getItem("roasts") || "[]").filter(r => r.beanName === selectedBean.name);
                      if (roasts.length === 0) return <p className="text-sm text-zinc-600 italic py-2">No roast sessions found for this bean.</p>;
                      return roasts.map(r => (
                        <button
                          key={r.id}
                          onClick={() => {
                            setSelectedRoast(r);
                            setBeansView("roastDetail");
                          }}
                          className="w-full rounded-2xl border border-zinc-800/40 bg-zinc-900/15 p-4 text-left transition hover:bg-zinc-900/30"
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="text-sm font-bold text-zinc-100">{r.date}</div>
                              <div className="text-[11px] text-zinc-500">{r.targetLevel} · {r.greenWeight}g</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-mono font-bold text-amber-400">{r.duration}</div>
                            </div>
                          </div>
                        </button>
                      ));
                    })()}
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-[0.15em] text-zinc-500">Tasting Notes</h3>
                    {(() => {
                      const tastings = JSON.parse(localStorage.getItem("tastingNotes") || "[]").filter(t => t.beanName === selectedBean.name);
                      return <span className="text-[10px] font-bold text-amber-500/80 bg-amber-500/10 px-2 py-0.5 rounded-full">{tastings.length} notes</span>;
                    })()}
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const tastings = JSON.parse(localStorage.getItem("tastingNotes") || "[]").filter(t => t.beanName === selectedBean.name);
                      if (tastings.length === 0) return <p className="text-sm text-zinc-600 italic py-2">No tasting notes found for this bean.</p>;
                      return tastings.map(t => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setSelectedTastingNote(t);
                            setBeansView("tastingDetail");
                          }}
                          className="w-full rounded-2xl border border-zinc-800/40 bg-zinc-900/15 p-4 text-left transition hover:bg-zinc-900/30"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="text-sm font-bold text-zinc-100">{t.date}</div>
                              <div className="text-[11px] text-zinc-500">{t.method}</div>
                            </div>
                            {t.rating > 0 && (
                              <div className="flex gap-0.5">
                                {[1, 2, 3, 4, 5].map(star => (
                                  <svg key={star} xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill={t.rating >= star ? "#f59e0b" : "none"} stroke={t.rating >= star ? "#f59e0b" : "#3f3f46"} strokeWidth="2">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                  </svg>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {t.descriptors?.slice(0, 3).map((d, i) => (
                              <span key={i} className="rounded-full bg-amber-500/5 border border-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-400/80">
                                {d}
                              </span>
                            ))}
                          </div>
                        </button>
                      ));
                    })()}
                  </div>
                </section>
              </div>
            )}

            {beansView === "roastDetail" && selectedRoast && (
              <div className="space-y-6 pb-20">
                <button
                  onClick={() => setBeansView("beanDetail")}
                  className="flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  BACK TO {selectedBean.name.toUpperCase()}
                </button>

                {/* ROAST DETAIL CONTENT (REPLICATED FROM HISTORY) */}
                <section className="rounded-3xl border border-zinc-800/60 bg-zinc-900/30 p-5 shadow-sm">
                  <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">{selectedRoast.date}</div>
                  <div className="mt-2 text-2xl font-bold tracking-tight text-zinc-50">{selectedRoast.beanName}</div>
                  <div className="mt-4 grid grid-cols-2 gap-4 border-t border-zinc-800/50 pt-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-zinc-500">Weight</div>
                      <div className="text-sm font-medium text-zinc-200">{selectedRoast.greenWeight}g</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-zinc-500">Duration</div>
                      <div className="text-sm font-medium text-amber-400">{selectedRoast.duration}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[10px] uppercase tracking-widest text-zinc-500">Roast Level</div>
                      <div className="text-sm font-medium text-zinc-200">{selectedRoast.targetLevel}</div>
                    </div>
                  </div>
                </section>

                <section className="rounded-3xl border border-zinc-800/60 bg-zinc-900/20 p-5">
                  <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">Phase Timeline</div>
                  <div className="mt-4 space-y-3">
                    {selectedRoast.milestones.map((m, i) => (
                      <div key={i} className="flex items-center justify-between border-b border-zinc-800/30 pb-2 last:border-0 last:pb-0">
                        <div className="text-sm font-semibold text-zinc-200">{m.label}</div>
                        <div className="font-mono text-xs text-amber-300/80">{formatTime(m.t)}</div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-3xl border border-zinc-800/60 bg-zinc-900/20 p-5">
                  <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">Adjustment Log</div>
                  <div className="mt-4 space-y-3">
                    {selectedRoast.adjustments.length === 0 ? (
                      <div className="text-xs text-zinc-500">No adjustments logged.</div>
                    ) : (
                      selectedRoast.adjustments.map((a, i) => (
                        <div key={i} className="flex items-center justify-between border-b border-zinc-800/30 pb-2 last:border-0 last:pb-0">
                          <div className="font-mono text-xs text-amber-300/80">{formatTime(a.t)}</div>
                          <div className="text-[11px] text-zinc-400">
                            H:<span className="text-zinc-100 ml-0.5">{a.heat || "—"}</span>
                            <span className="mx-1.5">·</span>
                            F:<span className="text-zinc-100 ml-0.5">{a.fan || "—"}</span>
                            <span className="mx-1.5">·</span>
                            T:<span className="text-zinc-100 ml-0.5">{a.temp || "—"}°</span>
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
                  className="flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  BACK TO {selectedBean.name.toUpperCase()}
                </button>

                {/* TASTING DETAIL CONTENT (REPLICATED FROM HISTORY) */}
                <section className="rounded-3xl border border-zinc-800/60 bg-zinc-900/30 p-6 shadow-sm">
                  <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">{selectedTastingNote.date}</div>
                  <h2 className="mt-2 text-3xl font-bold text-zinc-50 leading-tight">{selectedTastingNote.beanName || "Unknown Bean"}</h2>
                  <div className="mt-1 text-sm font-medium text-amber-500/80">{selectedTastingNote.method} · {selectedTastingNote.device}</div>
                  
                  <div className="mt-8 space-y-6 border-t border-zinc-800/50 pt-6">
                    <div className="grid grid-cols-2 gap-y-5 gap-x-8">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-1">Ratio</div>
                        <div className="text-sm font-bold text-zinc-200">{selectedTastingNote.ratio}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-1">Grind</div>
                        <div className="text-sm font-bold text-zinc-200">{selectedTastingNote.grindSize}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-1">Temp</div>
                        <div className="text-sm font-bold text-zinc-200">{selectedTastingNote.temp}°F</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-1">Rating</div>
                        <div className="flex gap-0.5 mt-0.5">
                          {[1, 2, 3, 4, 5].map(star => (
                            <svg key={star} xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={selectedTastingNote.rating >= star ? "#f59e0b" : "none"} stroke={selectedTastingNote.rating >= star ? "#f59e0b" : "#3f3f46"} strokeWidth="2">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                            </svg>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-2">Acidity: {["Flat", "Low", "Medium", "Bright", "Vibrant"][selectedTastingNote.acidity-1]} ({selectedTastingNote.acidity})</div>
                        <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                          <div className="h-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" style={{ width: `${(selectedTastingNote.acidity / 5) * 100}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-2">Body: {["Watery", "Light", "Medium", "Full", "Syrupy"][selectedTastingNote.body-1]} ({selectedTastingNote.body})</div>
                        <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                          <div className="h-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" style={{ width: `${(selectedTastingNote.body / 5) * 100}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {selectedTastingNote.families?.map(familyId => (
                        <div key={familyId}>
                          <div className="text-[10px] uppercase tracking-widest font-black text-zinc-400 mb-2">
                            {FLAVOR_FAMILIES.find(f => f.id === familyId)?.label}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {selectedTastingNote.descriptors?.filter(d => {
                              const familyOptions = FLAVOR_DRILLDOWN[familyId];
                              if (typeof familyOptions === 'object' && !Array.isArray(familyOptions)) {
                                return Object.values(familyOptions).flat().includes(d);
                              }
                              return familyOptions.includes(d);
                            }).map((d, i) => (
                              <span key={i} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300">
                                {d}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <section className="rounded-3xl border border-zinc-800/60 bg-white p-8 shadow-xl text-zinc-950">
                      <div className="flex flex-col items-center text-center">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-1">Tasting Summary</div>
                        <h3 className="text-xl font-black uppercase tracking-tight mb-0.5">{selectedTastingNote.beanName || "Unknown Bean"}</h3>
                        <div className="w-10 h-[2px] bg-amber-500 my-4" />
                        <div className="text-base font-bold text-amber-600 tracking-tight italic leading-relaxed">
                          {selectedTastingNote.descriptors?.slice(0, 5).join(' · ')}
                        </div>
                      </div>
                    </section>

                    {selectedTastingNote.notes && (
                      <div className="rounded-2xl bg-zinc-950/40 p-5 border border-zinc-800/40">
                        <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-2">Free Notes</div>
                        <p className="text-sm italic text-zinc-300 leading-relaxed font-medium">"{selectedTastingNote.notes}"</p>
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
              Placeholder settings screen. Units, timers, defaults, and export options will live
              here.
              <div className="mt-5 flex flex-wrap gap-3">
                <PrimaryButton onClick={() => {}}>Export Data</PrimaryButton>
                <button
                  type="button"
                  className="rounded-2xl border border-zinc-800/70 bg-zinc-900/40 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-900/70"
                >
                  About
                </button>
              </div>
            </ScreenCard>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-800/60 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto max-w-md px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <div className="grid grid-cols-5 gap-1">
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
    </div>
  );
}

export default App;
