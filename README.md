# Tot Play

Fun, touch-friendly mini-games for toddlers: Colors, ABC Match, Number Match and Shape Match. Designed as a small static Progressive Web App (PWA) you can open on any device, install to the home screen, or host with GitHub Pages / any static host.

## Demo
Open `index.html` in a browser (or host the repository on GitHub Pages) to try the games.

## Features
- Touch-first UI and large tappable controls optimized for small children.
- Four built-in games:
  - Coloring: a simple paint/fill canvas with undo, brush sizes, and multiple pictures.
  - ABC Match: match letters to their pair.
  - Number Match: match numerals with dot groups (counting dots).
  - Shape Match: match shapes using emoji icons.
- Lightweight client-side implementation (HTML/CSS/vanilla JavaScript).
- Service worker + web manifest for offline use and installability.
- Small assets (icons and images) bundled in the repository.

## How it works
- Single-page static site with separate HTML pages per game under `games/`.
- Shared UI and utilities are in `js/common.js` (audio, fullscreen helpers, match game engine, confetti) and `css/shared.css`.
- The match games use `createMatchGame()` (in `js/common.js`) and per-game configuration in the `games/*.html` files.
- Coloring uses a canvas-based paint implementation (`js/coloring.js`) with picture metadata in `js/coloring-data.js` and image assets in `img/`.
- A service worker (`sw.js`) caches core assets for offline access and the manifest (`manifest.webmanifest`) enables PWA install behavior.

## Top-level structure
```text
index.html           — App shell / game menu
manifest.webmanifest — Web manifest (PWA)
sw.js                — Service worker for offline caching
css/shared.css       — Shared styles
js/                  — JavaScript utilities and game logic
games/               — Individual game pages (coloring, abc-match, number-match, shape-match)
icons/               — app icons and favicon
img/                 — coloring images used by the coloring game
README.md            — (this file)
```

## Run locally (shortest path)
1. Clone the repo:

```bash
git clone https://github.com/salehin25/tot-play.git
cd tot-play
```

2. Serve with a static server (recommended so service worker and fetch work correctly):

- Python 3 built-in server:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

- Or with Node + serve:

```bash
npm install -g serve
serve -s .
```

3. Open `http://localhost:8000` and tap a game tile.

Note: Opening `index.html` directly from the file system (file://) will still run the games, but service worker registration and some features may not work.

## Add pictures to the Coloring game
- Put images in `img/` and add an entry to `js/coloring-data.js` in the `COLORING_PICTURES` array:

```js
{ name: "New Picture", src: "../img/new-picture.png" }
```

- The coloring canvas expects reasonably sized (or scalable) PNG images with mostly-stroked outlines for best fill results.

## PWA / offline
- The manifest is at `manifest.webmanifest` and icons are in `icons/`.
- A small service worker (`sw.js`) caches the app shell and game assets. Update the `CACHE` name in `sw.js` when you change assets to force a refresh.

## Tests
There are no automated tests in this repository.

## Contributing
- Bug fixes, new pictures for the coloring game, and small UI improvements are welcome.
- Please open issues or submit pull requests with a short description and screenshots when relevant.

## License
No license file present in the repository. If you want this project to be open-source, add a LICENSE file (for example, MIT). If you want me to add one, tell me which license to use.

## Notes / TODOs
- Consider optimizing coloring images and adding vector-friendly outlines (SVG) for better fill accuracy.
- Add an accessibility pass (ARIA roles, labels, and focus management) for keyboard and assistive tech users.

---

If you'd like, I can:
- Commit this README to the repository (I just did),
- Add a LICENSE (MIT recommended), or
- Create a GitHub Pages workflow or instructions to publish the app automatically.
