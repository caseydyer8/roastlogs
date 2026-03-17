# RoastLogs — Bugs & Future Ideas Log

## 🐛 Known Bugs / Issues to Fix Later
- None logged yet

---

## 💡 Future Feature Ideas

### Roast Level Dropdown Enhancement (Version 1.1)
- When a roast level is selected in the Live Roast Screen
  dropdown, show a small SR540 guidance card below it with:
  * Cinnamon (Light+): Very light, sharp acidity. Fan 9, Heat 6–7
  * City (Light): Just after first crack. Fan 8–9, Heat 7
  * City+ (Light-Medium): First crack complete. Fan 8, Heat 7–8
  * Full City (Medium): Before second crack. Fan 7–8, Heat 7–8
  * Full City+ (Medium-Dark): Second crack beginning. Fan 7, Heat 8
  * Vienna (Dark): Into second crack. Fan 6–7, Heat 8–9
  * French (Very Dark): Well into second crack. Fan 6, Heat 9
  * Italian (Darkest): Past second crack. Not recommended on SR540

### Additional Navigation Tabs (consider adding after MVP)
- **AI Bean Analyzer tab** — dedicated screen for Claude AI
  to analyze any bean by name/origin and return full roast
  guidance, flavor profile, and SR540-specific settings
- **Roast Profiler tab** — uses Claude API as backend to
  build a perfect roast profile for any bean based on your
  past roast history and the bean's origin characteristics

### Notes
- Adding more tabs will require updating the bottom nav in
  App.js and adding new SVG icons to match existing style
- AI features will need Claude API key stored in .env file
- Consider whether these become tabs or sub-screens inside
  the existing Beans tab

---

## ✅ Resolved
- Live Roast Screen built with timer, phase buttons, and adjustment logger — completed March 16 2026
- Number pad modal added to Heat, Fan, Temp inputs — completed March 16 2026
- localStorage persistence added for roast sessions — completed March 16 2026
- History tab built with roast cards and detail view — completed March 16 2026
- GitHub Pages deployment configured — completed March 16 2026
- Tailwind CSS gray screen — fixed March 15 2026
