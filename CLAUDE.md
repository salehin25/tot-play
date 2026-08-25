# Tot Play — Project Context

Touch-friendly mini-game PWA for toddlers. Static site: plain HTML/CSS/vanilla JS, no build step, no framework, no dependencies. Works fully offline as an installable PWA.

**Quick start:** `python -m http.server 8000` (or `npx serve .`) → open `http://localhost:8000`. The repo root IS the web root. Opening `index.html` via `file://` runs games but breaks service worker / PWA features.

## Top-level layout

```
index.html           — App shell / menu of 8 game tiles
manifest.webmanifest — PWA manifest
sw.js                — Service worker + offline cache (ASSETS array)
css/shared.css       — Shared styles: tokens, bubbles, topbar, cells, confetti, big-msg
js/common.js         — Shared: TotAudio, TotFS, confetti(), bigMessage(), createMatchGame()
js/coloring.js       — Coloring game engine (fill/brush/undo, line-mask flood fill)
js/coloring-data.js  — COLORING_PICTURES array (list of pic entries)
js/sound-toggle.js   — Mute button; persists to sessionStorage key "totMuted"
js/page-init.js      — Fullscreen button + bubble field background (all non-index pages)
games/*.html         — 8 standalone game pages (share the files above)
icons/               — favicon + 192/512 app icons
img/                 — coloring line-art + img/silhouettes/ image sets
```

## 8 games (index → games/)

| Tile | File | Engine |
|------|------|--------|
| 🎨 Colors | `games/coloring.html` | canvas fill/brush, `js/coloring.js` |
| 🔤 ABC Match | `games/abc-match.html` | `createMatchGame()` |
| 🔢 Numbers | `games/number-match.html` | `createMatchGame()` (dots) |
| ⭐ Shapes | `games/shape-match.html` | `createMatchGame()` (emoji) |
| ✏️ Letter Tracer | `games/alphabet-trace.html` | standalone canvas |
| 🧩 Silhouette Match | `games/silhouette-match.html` | image match |
| 🎈 Pop & Count | `games/pop-count.html` | inline canvas balloons + counting |
| 🚪 Peek-a-Boo | `games/peekaboo.html` | inline door-flip + TTS + custom photos |

> Note: `README.md` still says "four built-in games" and lists only Colors/ABC/Numbers/Shapes — it's stale. There are 8 games; the four newer ones (Letter Tracer, Silhouette Match, Pop & Count, Peek-a-Boo) added later.

## Page structure convention (all games)

Every game page follows the same skeleton (see `games/abc-match.html`):
1. `<meta viewport>` with `maximum-scale=1.0, user-scalable=no, viewport-fit=cover` (fixed-size UI).
2. `.bubbles` background div + `.topbar` with `🏠` home link, `.title`, and `#soundBtn` + `#fsBtn` icon buttons.
3. Scripts loaded **in this order** (coloring games load `coloring-data.js` + `coloring.js` between `common.js` and `sound-toggle.js`):
   ```html
   <script src="../js/common.js"></script>
   <script src="../js/sound-toggle.js"></script>
   <script src="../js/page-init.js"></script>
   ```
   `page-init.js` wires up `#fsBtn` and the bubble field. The page's own inline `<script>` goes before `sound-toggle.js`.

## js/common.js — shared API (load this first on every page)

- **`TotAudio`** — WebAudio synth singleton. `unlock()` (create/resume ctx, must run after a user gesture), `setMuted/isMuted`, and sound helpers `tap/pick/match/wrong/win`. `TotAudio.setMuted` initializes the muted flag — call before playback, so always load `sound-toggle.js` after any inline audio code.
- **`TotFS`** — fullscreen helpers: `.enter()/.exit()/.toggle()/.isFs()`, plus injects a floating `✕` exit button when fullscreen is available.
- **`confetti(durationMs=1800)`** — full-screen canvas confetti burst. Call on win/celebration moments.
- **`bigMessage(text)`** — transient zoom-fade praise text, auto-removes after ~1.1s.
- **`createMatchGame(config)`** — the match-game engine (left↔right drag-to-match).
  - `config.pool`: array of `{id}` items; `pairsPerRound` (default 5); `render(item, side)` returns cell HTML; `praise[]` strings shown on round win.
  - Handles drag-line SVG, wrong-answer shake + `TotAudio.wrong`, lock-guard, `confetti` + `bigMessage` on round win, automatic next round. Cells needing `--pairs` CSS var (see `shared.css` `.col` / `.cell`).
  - Usage example in `games/abc-match.html` (letters + per-letter colors).

## js/coloring.js — Colors game engine

- Canvas fixed at **900×640**. Same API pattern as other games; add scripts after `common.js`:
  ```html
  <script src="../js/common.js"></script>
  <script src="../js/coloring-data.js"></script>
  <script src="../js/coloring.js"></script>
  ```
- **Pictures live in `js/coloring-data.js`** (`COLORING_PICTURES` array): add one entry `{ name, src }` per image dropped in `img/`. Keeps per-tab DOM ids (`#palette`, `#sizes` in two side-panels, `#toolFill/#toolBrush/#toolRainbow`, `#undoBtn/#clearBtn/#resetBtn`, `#prevBtn/#nextBtn`, `#picName`, `#paint`).
- Painting uses a **line-mask flood fill**: a luminance-threshold `Uint8Array` line mask built from the loaded image (`buildLineMask`, threshold `LINE_LUM=140`) so fills respect the picture's thick outlines; brush strokes are confined to the flooded region. `FILL_TOL=40` color tolerance. Undo stack capped at 20.
- **If you add a picture, also add its path to the `ASSETS` array in `sw.js`** and bump the `CACHE` version, or offline/PWA users won't see it.

## css/shared.css — design tokens & shared components

- Design system vars in `:root`: `--ink #24315e`, `--card`, `--sun`, `--red/blue/green/purple/pink`, `--shadow`. Buttons/fonts are large and touch-first.
- Shared components keyed in this file: `.topbar .home-btn .icon-btn .title`, `.stage`, `.match-board .col .cell` (states `.selected /.matched /.wrong`), `.dots`, `#lines` + `.drag-line/.match-line`, `#confetti`, `.big-msg .txt`, bubble/floaty animations.
- Page-specific styles live in each game's inline `<style>` (e.g. `coloring.html` panels/palette/swatches, `pop-count.html` balloon canvas + `.counter`, `peekaboo.html` doors).

## sw.js — service worker / offline cache

- `CACHE = "tot-play-vN"` version string; `ASSETS` is an explicit allowlist array.
- **Rule: whenever you add or rename any file that should work offline (a new game page, a new `img/` asset), add it to `ASSETS` and bump `CACHE` to the next `vN`.** New `games/*.html` and new `img/` files are the common missed cases.
- Cache-first with network fallback; on fetch miss it caches the fresh response and falls back to `index.html`.

## Persistence (browser storage)

- `sessionStorage["totMuted"]` (`"1"`/`"0"`) — global mute, via `js/sound-toggle.js`.
- `localStorage["peekaboo_photos"]` — Peek-a-Boo custom door photos (data-URLs), JSON array indexed 0–5.
- These are the only stored state; no server / backend anywhere.

## Conventions & gotchas

- **No build step**: edit files directly; every file is served as-is. Keep all JS framework-free.
- **Touch-first**: `touch-action: none` on interactable canvases/cells; `e.preventDefault()` in pointer handlers; prevent double-tap zoom (`touchend` guard) and overscroll in `common.js`. Don't reintroduce single-tap delay.
- **Audio requires a user gesture** — `TotAudio.unlock()` is bound to the first `pointerdown` once (`common.js`); sound design uses WebAudio oscillators/noise, no audio files.
- **Reusable match games** (`createMatchGame`) — when a game is left↔right drag-to-match, prefer reusing it over a fresh engine.
- `games/coloring.html` has a duplicate `<div id="sizes">` (in the left tools panel and right Brush Size panel) — `coloring.js buildSizes()` populates both; don't remove either without updating it.

## Verified bug / known issue

- `games/peekaboo.html` line ~160 (`ribbit` sound): `ctx.createGgain()` is a typo — should be `ctx.createGain()`. Knocking a **Frog** door throws a TypeError and skips the croak; the door still opens. (This was observed while writing this file.)

## Mute toggle wiring (hardest-to-remember detail)

Order inside a game page matters for audio:
```html
<script src="../js/common.js"></script>      <!-- defines TotAudio (does NOT mute) -->
<script src="../js/sound-toggle.js"></script> <!-- reads sessionStorage, calls TotAudio.setMuted -->
```
If any inline script plays a sound before `sound-toggle.js` loads, muted state won't apply to that first sound. Keep the game script before `sound-toggle.js` only when it doesn't fire sounds at load (it usually doesn't).

## Tests / build

No automated tests, no bundler, no package.json, no license file. Validate by opening the served page and tapping through a game (touch device or DevTools device mode recommended).