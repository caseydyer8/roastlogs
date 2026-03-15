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
            <ScreenCard title="Ready to roast" subtitle="Roast">
              Start a new roast session and log time/temperature/events. This is a placeholder
              screen for now, but the layout and navigation are final-form.
              <div className="mt-5 flex items-center gap-3">
                <PrimaryButton onClick={() => {}}>Start Roast</PrimaryButton>
                <button
                  type="button"
                  className="rounded-2xl border border-zinc-800/70 bg-zinc-900/40 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-900/70"
                >
                  Quick Log
                </button>
              </div>
            </ScreenCard>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-3xl border border-zinc-800/60 bg-zinc-900/20 p-4">
                <div className="text-xs font-medium text-zinc-400">Target</div>
                <div className="mt-2 text-lg font-semibold text-zinc-50">City+</div>
                <div className="mt-1 text-xs text-zinc-400">Example profile</div>
              </div>
              <div className="rounded-3xl border border-zinc-800/60 bg-zinc-900/20 p-4">
                <div className="text-xs font-medium text-zinc-400">Batch</div>
                <div className="mt-2 text-lg font-semibold text-zinc-50">250g</div>
                <div className="mt-1 text-xs text-zinc-400">Example amount</div>
              </div>
            </div>
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
    </div>
  );
}

export default App;
