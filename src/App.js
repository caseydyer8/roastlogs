import React from "react";

const TABS = ["Roast", "History", "Beans", "Settings"];

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
  const [beanName, setBeanName] = React.useState("");
  const [greenWeightGrams, setGreenWeightGrams] = React.useState("");
  const [targetRoastLevel, setTargetRoastLevel] = React.useState(ROAST_LEVEL_OPTIONS[2]);

  const [isTimerRunning, setIsTimerRunning] = React.useState(false);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);

  const [milestones, setMilestones] = React.useState([]);

  const [heat, setHeat] = React.useState("");
  const [fan, setFan] = React.useState("");
  const [temp, setTemp] = React.useState("");
  const [adjustments, setAdjustments] = React.useState([]);

  const [activeNumpad, setActiveNumpad] = React.useState(null); // 'heat', 'fan', or 'temp'

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

  const logMilestone = (label) => {
    setMilestones((prev) => [{ label, t: elapsedSeconds }, ...prev]);
  };

  const handleStart = () => {
    if (!isTimerRunning && elapsedSeconds === 0) {
      setIsTimerRunning(true);
      logMilestone("START");
      return;
    }

    if (!isTimerRunning && elapsedSeconds > 0) {
      setIsTimerRunning(true);
      logMilestone("START (RESUME)");
      return;
    }

    logMilestone("START");
  };

  const handleStop = () => {
    setIsTimerRunning(false);
  };

  const handleLogAdjustment = () => {
    setAdjustments((prev) => [
      { t: elapsedSeconds, heat, fan, temp },
      ...prev,
    ]);
    setHeat("");
    setFan("");
    setTemp("");
  };

  let ActiveIcon = null;
  if (activeTab === "Roast") ActiveIcon = RoasterIcon;
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

              <div className="mt-3 grid grid-cols-1 gap-3">
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
              <div className="mt-2 text-xs text-zinc-500">
                {isTimerRunning ? "Running" : "Paused"}
              </div>
            </section>

            {/* 3) PHASE MILESTONES */}
            <section className="rounded-3xl border border-zinc-800/60 bg-zinc-900/20 p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Phase Milestones
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleStart}
                  className="col-span-2 rounded-3xl bg-amber-500 px-4 py-4 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-amber-500/90"
                >
                  START
                </button>
                {[
                  "DRYING END",
                  "MAILLARD END",
                  "FIRST CRACK",
                  "COOLING START",
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
              </div>

              {/* Milestone log */}
              <div className="mt-4 max-h-36 overflow-y-auto rounded-2xl border border-zinc-800/60 bg-zinc-950/20">
                {milestones.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-zinc-500">
                    Milestones will appear here as you tap them.
                  </div>
                ) : (
                  <ul className="divide-y divide-zinc-800/60">
                    {milestones.map((m, idx) => (
                      <li key={`${m.label}-${m.t}-${idx}`} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-zinc-100">{m.label}</div>
                          <div className="font-mono text-sm text-amber-300">
                            {formatTime(m.t)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* 4) ADJUSTMENT LOGGER */}
            <section className="rounded-3xl border border-zinc-800/60 bg-zinc-900/20 p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Adjustment Logger
              </div>

              <div className="mt-3 grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setActiveNumpad("heat")}
                  className={[
                    "flex flex-col items-center justify-center rounded-2xl border bg-zinc-950/40 p-3 transition active:scale-95",
                    activeNumpad === "heat" ? "border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]" : "border-zinc-800/70",
                  ].join(" ")}
                >
                  <div className="text-[10px] font-medium uppercase tracking-tight text-zinc-400">
                    Heat 1-9
                  </div>
                  <div className="mt-1 text-2xl font-bold text-zinc-50">{heat || "—"}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveNumpad("fan")}
                  className={[
                    "flex flex-col items-center justify-center rounded-2xl border bg-zinc-950/40 p-3 transition active:scale-95",
                    activeNumpad === "fan" ? "border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]" : "border-zinc-800/70",
                  ].join(" ")}
                >
                  <div className="text-[10px] font-medium uppercase tracking-tight text-zinc-400">
                    Fan 1-9
                  </div>
                  <div className="mt-1 text-2xl font-bold text-zinc-50">{fan || "—"}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveNumpad("temp")}
                  className={[
                    "flex flex-col items-center justify-center rounded-2xl border bg-zinc-950/40 p-3 transition active:scale-95",
                    activeNumpad === "temp" ? "border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]" : "border-zinc-800/70",
                  ].join(" ")}
                >
                  <div className="text-[10px] font-medium uppercase tracking-tight text-zinc-400">
                    Temp °F
                  </div>
                  <div className="mt-1 text-2xl font-bold text-zinc-50">{temp || "—"}</div>
                </button>
              </div>

              <div className="mt-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleLogAdjustment}
                  className="w-full rounded-3xl bg-amber-500 px-4 py-4 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-amber-500/90"
                >
                  LOG
                </button>
              </div>

              <div className="mt-4 max-h-56 overflow-y-auto rounded-2xl border border-zinc-800/60 bg-zinc-950/20">
                {adjustments.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-zinc-500">
                    Logged adjustments will appear here.
                  </div>
                ) : (
                  <ul className="divide-y divide-zinc-800/60">
                    {adjustments.map((a, idx) => (
                      <li key={`${a.t}-${idx}`} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="font-mono text-sm text-amber-300">
                            {formatTime(a.t)}
                          </div>
                          <div className="text-xs text-zinc-400">
                            Heat{" "}
                            <span className="font-semibold text-zinc-100">{a.heat || "—"}</span>
                            {" · "}Fan{" "}
                            <span className="font-semibold text-zinc-100">{a.fan || "—"}</span>
                            {" · "}Temp{" "}
                            <span className="font-semibold text-zinc-100">{a.temp || "—"}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* 5) STOP / END ROAST */}
            <button
              type="button"
              onClick={handleStop}
              className="w-full rounded-3xl bg-red-600 px-4 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-red-500 active:bg-red-600/90"
            >
              STOP / END ROAST
            </button>
          </div>
        )}

        {activeTab === "History" && (
          <div className="space-y-4">
            <ScreenCard title="Your recent roasts" subtitle="History">
              Placeholder list screen. This is where past roasts will appear with searchable
              details.
            </ScreenCard>
            <div className="space-y-3">
              {["Ethiopia • 10:32", "Colombia • 11:05", "Blend • 09:58"].map((item) => (
                <button
                  key={item}
                  type="button"
                  className="w-full rounded-3xl border border-zinc-800/60 bg-zinc-900/20 p-4 text-left transition hover:bg-zinc-900/35"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-zinc-100">{item}</div>
                    <div className="text-xs text-amber-300">View</div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">Tap to open details (placeholder)</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === "Beans" && (
          <div className="space-y-4">
            <ScreenCard title="Bean library" subtitle="Beans">
              Placeholder catalog screen. Add origins, processing, density, and notes for each bean.
              <div className="mt-5">
                <PrimaryButton onClick={() => {}}>Add Beans</PrimaryButton>
              </div>
            </ScreenCard>
            <div className="rounded-3xl border border-zinc-800/60 bg-gradient-to-b from-zinc-900/30 to-zinc-900/10 p-4">
              <div className="text-xs font-medium text-zinc-400">Tip</div>
              <div className="mt-1 text-sm text-zinc-200">
                Keep your bean entries consistent so roast comparisons are meaningful.
              </div>
            </div>
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
          <div className="grid grid-cols-4 gap-2">
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
