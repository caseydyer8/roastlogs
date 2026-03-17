# RoastLogs Recovery Prompt — March 16 2026

## Current App State
- Live at: https://caseydyer8.github.io/roastlogs
- GitHub: https://github.com/caseydyer8/roastlogs
- Mac path: /Users/casey/Documents/roastlogs
- Windows path: C:\Users\cdyer\OneDrive\Desktop\RoastLogsVibeCoding\roastlogs

## What Is Built (as of March 16 2026)
- React + Tailwind CSS dark theme (zinc-950, amber accents)
- 4-tab navigation: Roast, History, Beans, Settings
- Custom two-tone SVG icons for all tabs
- Live Roast Screen: MM:SS timer, 5 phase buttons, number pad adjustment logger
- localStorage persistence — roast sessions saved on END ROAST
- History tab — roast cards + full detail view
- GitHub Pages deployed — PWA installable to iPhone
- Bugs log at bugs/BUGS_AND_FUTURE_IDEAS.md

## What To Build Next
1. Brew Tab — guided tasting wizard with SCA flavor wheel
2. Roast History charts (Recharts)
3. Green Bean Inventory (Beans tab)
4. Supabase cloud sync
5. AI bean recommendations (Claude API)

## IDE Setup
- Primary coding tool: Windsurf IDE (codeium.com/windsurf)
- Cursor IDE hit free tier limit — use Windsurf instead

## Startup Commands (Mac)
cd /Users/casey/Documents/roastlogs
git pull
npm start
Then open Windsurf and open the roastlogs folder.

## Startup Commands (Windows)
cd "/c/Users/cdyer/OneDrive/Desktop/RoastLogsVibeCoding/roastlogs"
git pull
npm start
Then open Windsurf and open the roastlogs folder.

## Next Windsurf Prompt (Brew Tab)
Paste this into a New Chat in Windsurf to build the Brew tab:

Add a new 5th tab called Brew to my RoastLogs app in 
src/App.js. Add a coffee mug SVG icon in amber two-tone 
style matching the existing icons. The Brew tab contains 
a guided tasting wizard with these sections:

BREW SETUP: Fields for brew method (dropdown: Pour Over, 
Espresso Machine, Chemex, French Press, AeroPress, Moka Pot, 
Hario V60), device/machine name (text), water to coffee ratio 
(dropdown: 1:14 through 1:18 plus custom), grind size 
(dropdown: Extra Fine through Coarse), water temp in F 
(number), and optional photo.

TASTING WIZARD: 7 guided steps — Aroma, Acidity, Body, 
Sweetness, Flavor Notes, Bitterness, Finish. Each step shows 
a prompt explaining how to taste, a 1-5 scale slider, and 
flavor descriptor buttons organized from broad to specific 
using the SCA flavor wheel categories.

FLAVOR CATEGORIES: Fruity (Berry, Dried Fruit, Citrus, 
Other Fruit), Tropical Fruit (Mango, Passion Fruit, Lychee, 
Guava, Papaya), Sweet (Brown Sugar, Vanilla, Molasses, Honey), 
Candy (Cotton Candy, Caramel, Toffee, Butterscotch), 
Confectionery (Nougat, Marshmallow, Praline, Marzipan), 
Floral (Rose, Jasmine, Chamomile), Advanced Florals 
(Lavender, Hibiscus, Orange Blossom, Elderflower), 
Nutty/Cocoa (Almond, Hazelnut, Chocolate, Dark Chocolate), 
Spices (Clove, Cinnamon, Nutmeg, Pepper), Roasted (Malt, 
Smoky, Tobacco), Sour/Fermented (Winey, Citric, Malic), 
Green/Vegetative (Olive Oil, Herbal, Beany), Other (Papery, 
Chemical, Rubber).

SAVE: Overall star rating 1-5, would you brew again 
(Yes/No/Maybe), free text notes, SAVE button that saves 
to both the linked roast session in History AND the bean 
profile in Beans tab via localStorage.

Keep all existing tabs, icons, navigation and code exactly 
the same. Only add the new Brew tab.
