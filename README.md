# ☕ RoastLogs

A mobile-first Progressive Web App (PWA) for logging and tracking coffee roasts on the **Fresh Roast SR540** with the extension tube attachment.

Built with React + Tailwind CSS. Designed for iPhone via Safari PWA installation.

**📲 Live app:** [caseydyer8.github.io/roastlogs](https://caseydyer8.github.io/roastlogs/)

---

## 🔥 What It Does

RoastLogs helps home coffee roasters track every detail of their roasts in real time:

- **Live Roast Timer** — phase milestone buttons (Yellowing, First Crack, Cooling Start) with timestamps
- **Adjustment Logger** — log fan, heat, and temperature changes as they happen via a quick numpad popup
- **Roast Profiles** — build step-by-step fan/heat plans with drum-roll pickers, follow them live, and see profile-deviation markers when a roast strays from plan
- **Roast Story Charts** — every saved roast gets a split visualization: temp + rate-of-rise curves over phase bands, a step-style heat/fan control map, and metrics (Avg RoR, Drop Temp, DTR%)
- **Roast History** — browse past roasts with sparklines, full timelines, and in-place editing
- **Brew & Tasting Notes** — log brews linked to specific roasts with ratings and flavor descriptors
- **Bean Inventory** — track green bean stock
- **Cloud Sync** — Supabase auth with roasts and tasting notes synced across devices
- **Export** — CSV roast log and full JSON backup, generated client-side

---

## 📱 Current Status — v1.1.0 (live)

| Feature | Status |
|---|---|
| Live roast screen (timer, milestones, adjustments) | ✅ Live |
| Roast history + split roast-story charts | ✅ Live |
| Roast profiles + deviation tracking | ✅ Live |
| Brew & tasting notes | ✅ Live |
| Bean inventory | ✅ Live |
| Supabase auth + cloud sync (roasts, tasting notes) | ✅ Live |
| GitHub Pages PWA deployment | ✅ Live |
| Playwright visual regression tests | ✅ In repo |
| Beans/profiles cloud sync | ⬜ Planned |
| Roast comparison overlay | ⬜ Planned |

---

## 🛠 Tech Stack

- **React** (Create React App) — frontend
- **Tailwind CSS** — dark-only zinc/amber theme
- **Recharts** — roast curve and control-map charts
- **Supabase** — authentication + Postgres cloud sync
- **Playwright** — visual regression tests at phone + desktop viewports
- **GitHub Pages** — PWA hosting via `gh-pages`

---

## 🚀 Running Locally
```bash
git clone https://github.com/caseydyer8/roastlogs.git
cd roastlogs
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in Chrome.

## 🧪 Testing
```bash
npx playwright test          # visual + behavior tests (iPhone + desktop viewports)
```
Tests run with a dev-only auth bypass and all Supabase network calls blocked — they never touch real data.

## 📦 Deploying
```bash
npm run deploy               # builds and publishes to GitHub Pages (gh-pages branch)
```

---

## 📁 Project Structure
```
roastlogs/
├── src/
│   ├── App.js              # Main app — tabs, screens, roast logic
│   ├── index.js            # Auth gate (login screen vs app)
│   ├── syncService.js      # Supabase sync for roasts + tasting notes
│   ├── supabaseClient.js   # Supabase client init
│   ├── components/         # LoginScreen, charts/RoastCurveChart, ...
│   ├── contexts/           # AuthContext
│   └── hooks/
├── e2e/                    # Playwright tests + screenshot baselines
├── docs/                   # RLS migration SQL, guides, requirements
└── public/
```

---

## ☕ About

Built by a home roaster, for home roasters. Specifically designed around the SR540 + extension tube setup where roast dynamics differ from stock configuration.

> *The extension tube slows the roast, improves airflow control, and makes logging even more important for repeatability.*

---

*Vibe-coded with Claude Code*
