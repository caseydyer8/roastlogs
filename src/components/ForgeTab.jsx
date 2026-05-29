import React from "react";

// FORGE — AI roast profile generator for the Fresh Roast SR540 + extension tube.
// NOTE: this app keeps roast profiles in localStorage (the `profiles` state in App.js),
// not in a Supabase `roast_profiles` table. Saving therefore hands the parsed profile up
// to App via onSaveProfile, which adds it to that same profile store so it appears in the
// Profile Builder. See SESSION_NOTES for the Supabase roast_profiles discrepancy.

const FORGE_SYSTEM_PROMPT = `You are an expert coffee roasting consultant with deep knowledge of the Fresh Roast SR540 air roaster with the extension tube attachment. The extension tube significantly changes roast dynamics: it slows the roast, improves airflow distribution, allows for more nuanced heat control, and generally produces more even development.

When generating a roast profile, you must:
1. Account for the extension tube effect — temps run ~10-15°C lower than stock SR540
2. Use the SR540 1-9 dial range for both Heat and Fan settings
3. Provide specific settings at 30-second or 1-minute intervals throughout the roast
4. Include clear phase markers: Drying Phase, Maillard Phase, First Crack, Development, Cooling
5. Warn if any setting risks scorching or uneven roast with the extension tube
6. Tailor advice to the bean's origin and processing method

SR540 Heat Reference (with extension tube):
- Heat 1-2: ~140-185°C | Heat 3-4: ~185-210°C | Heat 5-6: ~210-230°C
- Heat 7-8: ~230-255°C | Heat 9: ~255-265°C

Return ONLY this JSON object, no preamble, no markdown fences:
{
  "profileName": "string",
  "beanName": "string",
  "origin": "string",
  "processingMethod": "string",
  "targetRoastLevel": "string",
  "estimatedTotalTime": "string",
  "phases": [{"name":"string","startTime":"string","endTime":"string","notes":"string"}],
  "timeline": [{"time":"string","heat":number,"fan":number,"note":"string"}],
  "expectedFirstCrack": "string",
  "flavorNotes": ["string"],
  "sr540Warnings": ["string"],
  "generalNotes": "string"
}`;

const LOADING_MESSAGES = [
  "Analyzing bean origin and processing method...",
  "Calculating SR540 heat curve with extension tube...",
  "Mapping roast phase development...",
  "Dialing in first crack timing...",
  "Finalizing your roast profile...",
];

const PROCESSING_METHODS = ["Washed", "Natural", "Honey", "Wet-Hulled", "Other"];
const ROAST_LEVELS = ["Cinnamon", "City", "City+", "Full City", "Full City+", "Vienna", "French", "Italian"];

// SECURITY DEBT: API key is client-side. Move to Netlify/Vercel serverless proxy before public launch.
const CLAUDE_API_KEY = process.env.REACT_APP_CLAUDE_API_KEY;

async function generateForgeProfile(formData) {
  const userMessage = [
    `Bean Name: ${formData.beanName}`,
    `Origin: ${formData.origin}`,
    `Grower/Farm: ${formData.growerFarm || "Not specified"}`,
    `Processing Method: ${formData.processingMethod}`,
    `Target Roast Level: ${formData.targetRoastLevel}`,
    `Importer Tasting Notes: ${formData.importerNotes || "None provided"}`,
    "",
    "Generate a complete roast profile for the Fresh Roast SR540 with extension tube.",
  ].join("\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: FORGE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw new Error("AUTH_FAILED");
    if (status === 429) throw new Error("RATE_LIMITED");
    throw new Error(`API_ERROR_${status}`);
  }

  const data = await response.json();
  const rawText = data.content[0].text;
  const clean = rawText.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-zinc-300">
        {label}{required && <span className="text-amber-500"> *</span>}
      </div>
      {children}
    </label>
  );
}

const inputClass =
  "mt-2 w-full rounded-2xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20";

export default function ForgeTab({ onSaveProfile, showToast }) {
  const [form, setForm] = React.useState({
    beanName: "",
    origin: "",
    growerFarm: "",
    processingMethod: "Washed",
    targetRoastLevel: "City+",
    importerNotes: "",
  });
  const [loading, setLoading] = React.useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = React.useState(0);
  const [profile, setProfile] = React.useState(null);
  const [error, setError] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  // Cycle the loading messages every 2 seconds while a request is in flight.
  React.useEffect(() => {
    if (!loading) return;
    setLoadingMsgIdx(0);
    const id = setInterval(() => {
      setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(id);
  }, [loading]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const canGenerate = form.beanName.trim() && form.origin.trim() && form.processingMethod && form.targetRoastLevel;

  const handleGenerate = async () => {
    setError("");
    if (!CLAUDE_API_KEY) {
      setError("Forge API key not configured. Add REACT_APP_CLAUDE_API_KEY to .env");
      return;
    }
    if (!canGenerate) {
      setError("Please fill in the required fields.");
      return;
    }
    setLoading(true);
    setProfile(null);
    setSaved(false);
    try {
      const result = await generateForgeProfile(form);
      setProfile(result);
    } catch (e) {
      if (e.message === "AUTH_FAILED") {
        setError("API authentication failed. Check REACT_APP_CLAUDE_API_KEY in .env");
      } else if (e.message === "RATE_LIMITED") {
        setError("Rate limit reached. Wait a moment and try again.");
      } else if (e instanceof SyntaxError) {
        setError("Received unexpected response format. Try again.");
      } else if (e.message && e.message.startsWith("API_ERROR_")) {
        setError(`API error (${e.message.replace("API_ERROR_", "")}). Try again.`);
      } else {
        setError("Network error. Check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!profile) return;
    try {
      onSaveProfile(profile);
      setSaved(true);
      if (showToast) showToast("Profile saved! Find it in Profile Builder.");
    } catch (e) {
      if (showToast) showToast("Could not save profile. Try again.", "error");
    }
  };

  const resetToForm = () => {
    setProfile(null);
    setError("");
    setSaved(false);
  };

  return (
    <div className="space-y-6 pb-24">
      <header className="space-y-1">
        <h2 className="text-3xl font-bold text-amber-400">⚗ Forge a Roast Profile</h2>
        <p className="text-sm text-zinc-400">Powered by Claude AI · Built for the SR540 + Extension Tube</p>
      </header>

      {/* INPUT FORM */}
      {!profile && !loading && (
        <section className="space-y-4 rounded-3xl border border-zinc-800/60 bg-zinc-900/30 p-5 shadow-sm">
          <Field label="Bean Name" required>
            <input className={inputClass} placeholder="e.g. Ethiopia Yirgacheffe" value={form.beanName} onChange={(e) => update("beanName", e.target.value)} />
          </Field>
          <Field label="Origin / Country" required>
            <input className={inputClass} placeholder="e.g. Ethiopia, Gedeb region" value={form.origin} onChange={(e) => update("origin", e.target.value)} />
          </Field>
          <Field label="Grower / Farm">
            <input className={inputClass} placeholder="e.g. Worka Cooperative" value={form.growerFarm} onChange={(e) => update("growerFarm", e.target.value)} />
          </Field>
          <Field label="Processing Method" required>
            <select className={inputClass} value={form.processingMethod} onChange={(e) => update("processingMethod", e.target.value)}>
              {PROCESSING_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Target Roast Level" required>
            <select className={inputClass} value={form.targetRoastLevel} onChange={(e) => update("targetRoastLevel", e.target.value)}>
              {ROAST_LEVELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Importer Notes">
            <textarea
              rows={4}
              className={inputClass}
              placeholder={"Paste importer tasting notes or describe target flavors...\ne.g. jasmine, bergamot, lemon zest, tea-like body"}
              value={form.importerNotes}
              onChange={(e) => update("importerNotes", e.target.value)}
            />
          </Field>

          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
              {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="flex w-full items-center justify-center gap-2 rounded-3xl bg-amber-500 px-4 py-4 text-base font-bold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-amber-500/90 disabled:opacity-50 disabled:grayscale"
          >
            🔥 Generate My Profile
          </button>
        </section>
      )}

      {/* LOADING STATE */}
      {loading && (
        <section className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-amber-500/20 bg-amber-500/5 p-10 text-center">
          <div className="text-4xl animate-pulse">🔥</div>
          <div className="h-8 w-8 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin" />
          <div className="text-sm font-medium text-amber-300 transition-all">{LOADING_MESSAGES[loadingMsgIdx]}</div>
        </section>
      )}

      {/* OUTPUT DISPLAY */}
      {profile && !loading && (
        <section className="space-y-5">
          <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5">
            <div className="text-2xl font-bold text-amber-400">🔥 {profile.profileName}</div>
            <div className="mt-1 text-sm text-zinc-300">
              {[profile.beanName, profile.origin, profile.processingMethod].filter(Boolean).join(" · ")}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
              {profile.targetRoastLevel && <span>Target: <span className="font-semibold text-zinc-200">{profile.targetRoastLevel}</span></span>}
              {profile.estimatedTotalTime && <span>Estimated time: <span className="font-semibold text-zinc-200">{profile.estimatedTotalTime}</span></span>}
            </div>
          </div>

          {/* PHASES */}
          {Array.isArray(profile.phases) && profile.phases.length > 0 && (
            <div className="rounded-3xl border border-zinc-800/60 bg-zinc-900/30 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Phases</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
                      <th className="pb-2 pr-2">Name</th><th className="pb-2 pr-2">Start</th><th className="pb-2 pr-2">End</th><th className="pb-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.phases.map((p, i) => (
                      <tr key={i} className="border-t border-zinc-800/40 align-top">
                        <td className="py-2 pr-2 font-semibold text-zinc-200">{p.name}</td>
                        <td className="py-2 pr-2 font-mono text-amber-300/80">{p.startTime}</td>
                        <td className="py-2 pr-2 font-mono text-amber-300/80">{p.endTime}</td>
                        <td className="py-2 text-zinc-400">{p.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* HEAT & FAN TIMELINE */}
          {Array.isArray(profile.timeline) && profile.timeline.length > 0 && (
            <div className="rounded-3xl border border-zinc-800/60 bg-zinc-900/30 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Heat &amp; Fan Timeline</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
                      <th className="pb-2 pr-2">Time</th><th className="pb-2 pr-2">Heat</th><th className="pb-2 pr-2">Fan</th><th className="pb-2">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.timeline.map((row, i) => (
                      <tr key={i} className="border-t border-zinc-800/40 align-top">
                        <td className="py-2 pr-2 font-mono text-amber-300/80">{row.time}</td>
                        <td className="py-2 pr-2 font-bold text-zinc-100">{row.heat}</td>
                        <td className="py-2 pr-2 font-bold text-zinc-100">{row.fan}</td>
                        <td className="py-2 text-zinc-400">{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {profile.expectedFirstCrack && (
            <div className="text-sm text-zinc-300">
              <span className="font-semibold text-zinc-400">Expected First Crack:</span> {profile.expectedFirstCrack}
            </div>
          )}

          {/* FLAVOR NOTES */}
          {Array.isArray(profile.flavorNotes) && profile.flavorNotes.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Flavor Notes</div>
              <div className="flex flex-wrap gap-2">
                {profile.flavorNotes.map((f, i) => (
                  <span key={i} className="rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300">{f}</span>
                ))}
              </div>
            </div>
          )}

          {/* SR540 WARNINGS */}
          {Array.isArray(profile.sr540Warnings) && profile.sr540Warnings.length > 0 && (
            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-yellow-400 mb-2">⚠ SR540 Warnings</div>
              <ul className="space-y-1 text-sm text-yellow-200/90">
                {profile.sr540Warnings.map((w, i) => <li key={i}>• {w}</li>)}
              </ul>
            </div>
          )}

          {/* NOTES */}
          {profile.generalNotes && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Notes</div>
              <p className="text-sm leading-6 text-zinc-300">{profile.generalNotes}</p>
            </div>
          )}

          <div className="space-y-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saved}
              className="w-full rounded-3xl bg-amber-500 px-4 py-4 text-base font-bold text-zinc-950 shadow-sm transition hover:bg-amber-400 active:bg-amber-500/90 disabled:opacity-50"
            >
              {saved ? "✓ Saved" : "Save This Profile"}
            </button>
            <button
              onClick={resetToForm}
              className="w-full rounded-3xl bg-zinc-800 px-4 py-4 text-base font-semibold text-zinc-300 transition hover:bg-zinc-700"
            >
              Generate Another
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
