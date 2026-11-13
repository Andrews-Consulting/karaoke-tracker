# Mic Jaunt

A personal, local-only PWA for tracking a karaoke repertoire: songs, venues, what was sung where, and setlists that avoid repeats and mix genres and decades. Lives at <https://micjaunt.app>.

The internal id is `mic-jaunt` too: the IndexedDB name, the cache prefix, the backup format's `app` field and the download file names. Backup files from before the rename (`app: "karaoke-tracker"`) still restore.

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
| `tools/screenshots.js` | Phone screenshots of every screen for design review (`npm run screenshots`) |
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

## Screenshots

`npm run screenshots` writes a PNG of every screen to `screenshots/<device>/<theme>/`, for an iPhone 14 (WebKit) and a Pixel 7 (Chromium) in dark and light, from a fixed sample library. `DEVICE=iphone THEME=dark npm run screenshots` does one set. It uses port 8004 and is for design review; the folder is not committed.

## What works today

- Installable shell with offline cache (R26, R27, R29)
- Songs tab, built around a night out (R47–R50): the venue and the set you are working sit at the top, with three modes. **Find** searches and filters the library, shows times sung and last sung at the venue, and adds a song to the set with one tap. **List** is the set in order: move up and down, "Sang it" logs the sing and takes the song off, "Next time" parks it on the venue's Next time list. **Sung** shows what you sang here by date, with Undo for today
- Library: add (at the bottom of Find, or straight from a search that matched nothing), open, edit every field (notes, genre, year, key, tags, status, rating), delete with confirmation (R1, R10, R2, R3, R36, R4–R7); title and artist suggestions from MusicBrainz while typing, with an off switch in Settings (R35); a warning when the song is already there (R9); "Pick for me" (R13)
- Find filters: never sung here / not since a date, tag, status, rating, genre and decade; sort by title, artist, rating, last sung, date added, genre or decade (R37, R41, R11, R42, R12). Fast with 1,000 songs (R34); each song has a video search link (R38)
- Setlists tab, for building and tidying lists: general or tied to a venue; create, edit, delete; add, remove and drag to reorder; "Sung here" flags; a Mix card counts genres and decades; "Suggest songs" fills a set with never-sung songs spread across genres and decades (R39, R14, R15, R43, R16, R44, R45)
- Settings: CSV import of songs and, via a venue column, sings; CSV export; JSON backup and restore (R22, R46, R23, R20, R21)
- Print-friendly song list, setlist and venue history from the browser's print menu (R24); new-version banner with Reload (R30); iPhone icon and status-bar tags (R29); a reminder when the last backup is over 30 days old (R25)
- Venues: add, rename, delete when unused; log a sing with date and venue; times sung and last sung per venue and overall (R40, R8)
- Data stored in IndexedDB, with a persistent-storage request (R18, R19)

- One-handed layout: bottom tabs, 44 px controls everywhere, actions at the bottom of detail screens, and the back gesture returns from a detail screen instead of leaving the app (R31)
- Dark by default with a light option and "Match the phone" (R32); readable at desktop widths (R33)

## Still to build

Every requirement is built except R28 (hosting, which is yours to do; see Deploy below). See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## Two things to remember

- **Bump `CACHE_VERSION` in `sw.js`** whenever you change a cached file, and add every new file under `js/` to `APP_SHELL`, or installed copies keep the old version or break offline. While developing, DevTools → Application → Service Workers → "Update on reload" saves the trouble.
- **Schema changes** go in a new `if (oldVersion < N)` block in `js/db.js` with `DB_VERSION` bumped. Do not edit an existing block.

## Deploy (R28)

Any static host with HTTPS works. There is nothing to build: the host serves the repo's files as they are. Service workers need HTTPS (or `localhost`), so a plain `http://` host will run the app but not install it or work offline.

Only the app files matter to the host: `index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `icons/`. The `tests/`, `tools/`, `docs/` and `node_modules/` folders are harmless but unused.

**GitHub Pages** (free, HTTPS included):

1. Push the repo to GitHub.
2. Repo **Settings → Pages → Build and deployment**: Source "Deploy from a branch", branch `main`, folder `/ (root)`. Save.
3. After a minute the site is at `https://<user>.github.io/<repo>/`. The sub-folder is fine: every path in the app is relative and the manifest's `start_url` and `scope` are `.`.

**Custom domain (micjaunt.app):** the `CNAME` file at the repo root holds the domain, so GitHub Pages picks it up when it deploys. At the registrar, point the apex at GitHub Pages with four A records (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`) and, optionally, `www` as a CNAME to `<user>.github.io`. Then in **Settings → Pages** confirm the custom domain and tick **Enforce HTTPS** once the certificate check passes (minutes to an hour). `.app` domains are HTTPS-only by browser policy, so the site will not load at all until that certificate exists. If you also own `micjaunt.com`, forward it to `https://micjaunt.app` at the registrar rather than adding it to Pages.

**Netlify or Cloudflare Pages:** connect the repo (or drag the folder onto Netlify Drop). Build command: none. Publish directory: the repo root.

**On the phone:** open the URL in Safari (iPhone) or Chrome (Android), then Share → "Add to Home Screen". The installed copy opens full screen and works offline after the first visit. Take a backup from Settings now and then; it is the only copy of your data.

**Shipping an update:** commit, bump `CACHE_VERSION` in `sw.js`, push. An open copy of the app shows "A new version is ready" with a Reload button once the new files are cached (R30); a closed copy picks them up on its next open.
