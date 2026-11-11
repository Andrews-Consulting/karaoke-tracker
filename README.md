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
| `js/app.js` | Views and navigation |
| `js/db.js` | IndexedDB wrapper and schema |
| `sw.js` | Service worker: offline cache |
| `manifest.webmanifest` | Install settings (name, icons, colors) |
| `icons/` | App icons; regenerate with `python3 tools/make_icons.py` |
| `docs/REQUIREMENTS.md` | Requirements and their status |

## What works today

- Installable shell with offline cache (R26, R27, R29)
- Add a song with title, artist, genre and year; search as you type (R1, R10, part of R36)
- Data stored in IndexedDB, with a persistent-storage request (R18, R19)

Everything else in the requirements is still to build. The database already has stores for venues, the sing log and setlists.

## Suggested build order

1. Song edit, delete and notes (R2, R3)
2. CSV import, to load the full repertoire (R22)
3. JSON backup and restore, before real data goes in (R20, R21)
4. Venues and the sing log (R40, R8)
5. Venue selection and the "not sung here" filter (R37, R41)
6. Genre and decade filters (R42, R11)
7. Setlists, with the already-sung flag (R39, R14, R15, R43)

## Two things to remember

- **Bump `CACHE_VERSION` in `sw.js`** whenever you change a cached file, or installed copies keep the old version. While developing, DevTools → Application → Service Workers → "Update on reload" saves the trouble.
- **Schema changes** go in a new `if (oldVersion < N)` block in `js/db.js` with `DB_VERSION` bumped. Do not edit an existing block.

## Deploy

Any static host with HTTPS works: GitHub Pages, Netlify, Cloudflare Pages. All paths are relative, so serving from a sub-folder is fine. On the phone, open the URL and use "Add to Home Screen".
