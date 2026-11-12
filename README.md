# Karaoke Tracker

A personal, local-only PWA for tracking a karaoke repertoire: songs, venues, what was sung where, and setlists that avoid repeats and mix genres and decades.

No build step, no dependencies, no server. Plain HTML, CSS and JavaScript modules.

Requirements live in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## Run it locally

Service workers and modules need a web server, so opening `index.html` directly will not work. From the repo root:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. The VS Code "Live Server" extension works too.

## Where things are

| Path | What it is |
|---|---|
| `index.html` | Page shell, tab bar, PWA meta tags |
| `css/app.css` | Styles; theme colors are CSS variables at the top |
| `js/app.js` | Navigation and startup only |
| `js/views/` | One module per section: `songs.js`, `setlists.js`, `venues.js`, `settings.js` |
| `js/ui.js` | The `el()` DOM helper, confirmations and other shared UI |
| `js/lib/` | Pure logic (search, song records, later CSV and backup formats): no DOM, no IndexedDB, unit-tested |
| `js/db.js` | IndexedDB wrapper, schema and record shapes |
| `sw.js` | Service worker: offline cache |
| `manifest.webmanifest` | Install settings (name, icons, colors) |
| `icons/` | App icons; regenerate with `python3 tools/make_icons.py` |
| `tools/serve.js` | Zero-dependency static server used by Playwright and `npm run serve` |
| `tests/unit/` | Vitest tests for `js/lib/` |
| `tests/e2e/` | Playwright tests, named by requirement ID |
| `docs/REQUIREMENTS.md` | Requirements and their status |

## Tests

Dev dependencies only; the app itself still has none.

```bash
npm install
npx playwright install chromium webkit   # once
npm test            # unit then e2e
npm run test:unit   # Vitest, tests/unit/
npm run test:e2e    # Playwright, tests/e2e/, mobile Chromium + mobile WebKit
```

- Pure logic lives in `js/lib/` so Vitest can test it without a browser.
- Playwright starts `tools/serve.js` on `PORT` (default 8000). Run `PORT=8001 npm run test:e2e` to test a second checkout at the same time.
- Every test gets a fresh browser context, so IndexedDB starts empty.
- E2E test names carry the requirement ID they prove, e.g. `R10: searches by title or artist as I type`.

## What works today

- Installable shell with offline cache (R26, R27, R29)
- Songs: add, search, open, edit every field (notes, genre, year, key, tags, status, rating), delete with confirmation (R1, R10, R2, R3, R36, R4–R7)
- Find, on the Songs tab: pick a venue or "Overall" to see times sung and last sung per song, then filter by never sung here / not since a date, tag, status, rating, genre and decade, and sort by title, genre or decade (R37, R41, R11, R42)
- Setlists: general or tied to a venue; create, edit, delete; add and remove songs; songs already sung at the setlist's venue are flagged with the last date (R39, R14, R15, R43)
- Settings: CSV import, JSON backup and restore (R22, R20, R21)
- Venues: add, rename, delete when unused; log a sing with date and venue; times sung and last sung per venue and overall (R40, R8)
- Data stored in IndexedDB, with a persistent-storage request (R18, R19)

## Still to build

1. One-handed polish: 44 px check, back gesture on detail screens (R31)
2. Deploy notes (R28)

## Two things to remember

- **Bump `CACHE_VERSION` in `sw.js`** whenever you change a cached file, and add every new file under `js/` to `APP_SHELL`, or installed copies keep the old version or break offline. While developing, DevTools → Application → Service Workers → "Update on reload" saves the trouble.
- **Schema changes** go in a new `if (oldVersion < N)` block in `js/db.js` with `DB_VERSION` bumped. Do not edit an existing block.

## Deploy

Any static host with HTTPS works: GitHub Pages, Netlify, Cloudflare Pages. All paths are relative, so serving from a sub-folder is fine. On the phone, open the URL and use "Add to Home Screen".
