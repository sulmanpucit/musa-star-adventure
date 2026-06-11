# Musa's Star Adventure ⭐

A platformer game starring **Musa**, the Star Hero! Made for ages 8+.

## How to play

Open in a browser, either of:
- **MAMP**: start MAMP, then visit `http://localhost:8888/musa/` (or your MAMP port)
- **Direct**: just double-click `index.html` — no server needed

### Controls
- **⬅️ ➡️ / A D** — move
- **⬆️ / W / SPACE** — jump (hold for a higher jump!)
- **ESC** — pause
- On tablets/phones, touch buttons appear automatically

### The goal
- Reach the **red flag** at the end of each level
- Collect **3 stars** hidden in every level (play again to find them all!)
- **Jump on slimes** to squish them — don't let them touch you!
- **Green checkpoints** save your spot in a level
- **Red springs** bounce you super high
- Progress saves automatically in the browser — close it anytime, your stars are safe

## The adventure
1. 🌻 **World 1: Sunny Meadows** — learn to run, jump, and bounce
2. 💎 **World 2: Crystal Caves** — watch out for spikes!
3. ☁️ **World 3: Cloud Kingdom** — hop across clouds and moving platforms
4. 🏰 **World 4: Star Castle** — the final challenge!

16 levels, 48 stars. Roughly 2–3 hours of adventure. Good luck, Musa! 🚀

## Tech notes
Plain HTML5 canvas + JavaScript, no dependencies, no internet needed.
Sounds and music are generated with WebAudio. Progress is stored in
`localStorage` (clearing browser data resets the game).

- `index.html` — page + menus/HUD
- `style.css` — UI styling
- `js/levels.js` — 16 levels as ASCII tile maps (edit these to make new levels!)
- `js/audio.js` — sound effects + music
- `js/game.js` — game engine
