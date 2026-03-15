# ☕ RoastLogs

A mobile-first Progressive Web App (PWA) for logging and tracking coffee roasts on the **Fresh Roast SR540** with the extension tube attachment.

Built with React + Tailwind CSS. Designed for iPhone via Safari PWA installation.

---

## 🔥 What It Does

RoastLogs helps home coffee roasters track every detail of their roasts in real time:

- **Live Roast Timer** — phase milestone buttons (Drying End, First Crack, etc.) with timestamps
- **Adjustment Logger** — log heat, fan speed, and temperature changes as they happen
- **Roast History** — browse all past roasts with charts and full adjustment timelines
- **Green Bean Inventory** — track bean stock with auto-deduction after each roast
- **AI Bean Recommendations** — Claude AI looks up roast guidance for any bean and origin
- **Export** — PDF roast summaries and CSV history exports

---

## 📱 Current Status

| Feature | Status |
|---|---|
| Dark theme + amber/orange UI | ✅ Complete |
| 4-tab navigation (Roast, History, Beans, Settings) | ✅ Complete |
| Custom SVG icons | ✅ Complete |
| Live Roast Screen | 🔨 In Progress |
| Roast History | ⬜ Planned |
| Bean Inventory | ⬜ Planned |
| Supabase Cloud Sync | ⬜ Planned |
| AI Bean Recommendations | ⬜ Planned |
| GitHub Pages PWA deployment | ⬜ Planned |
| App Store (iOS) | ⬜ Optional |

---

## 🛠 Tech Stack

- **React** — frontend framework
- **Tailwind CSS** — dark mode styling
- **Recharts** — roast profile charts
- **Supabase** — cloud sync and auth
- **Claude API** — AI bean recommendations
- **GitHub Pages** — free PWA hosting
- **Capacitor.js** — optional App Store wrapper

---

## 🚀 Running Locally
```bash
git clone https://github.com/caseydyer8/roastlogs.git
cd roastlogs
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in Chrome.

---

## 📁 Project Structure
```
roastlogs/
├── src/
│   ├── App.js          # Main app — navigation, screens, icons
│   └── index.css       # Tailwind CSS imports
├── docs/
│   └── RoastLogs_Requirements_v1.2.docx   # Full requirements & roadmap
├── public/
└── package.json
```

---

## ☕ About

Built by a home roaster, for home roasters. Specifically designed around the SR540 + extension tube setup where roast dynamics differ from stock configuration.

> *The extension tube slows the roast, improves airflow control, and makes logging even more important for repeatability.*

---

*Built with vibe coding using Claude AI + Cursor IDE*
