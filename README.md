# Mic Jaunt

A personal, local-only PWA for tracking a karaoke repertoire: songs, venues, what was sung where, and setlists that avoid repeats and mix genres and decades. Lives at <https://micjaunt.app>.

The internal id is `mic-jaunt` too: the IndexedDB name, the cache prefix, the backup format's `app` field and the download file names. Backup files from before the rename (`app: "karaoke-tracker"`) still restore.

No build step, no dependencies, no server. Plain HTML, CSS and JavaScript modules.

Requirements live in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md), which describes the app as it is; [docs/USER-STORIES.md](docs/USER-STORIES.md) says the same as what the singer wants and why, without reference to the screens.

## Run it locally

Service workers and modules need a web server, so opening `index.html` directly will not work. From the repo root:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. The VS Code "Live Server" extension works too.

## Where things are

| Path | What it is |
|---|---|
| `index.html` | Page shell, the dock's markup (scope bar, search field, slot), PWA meta tags |
| `css/app.css` | Styles; the Design B palette is CSS variables at the top |
| `js/app.js` | Scope routing and startup only |
| `js/dock.js` | The dock at the bottom: selects a scope, hands the search field, filter button and slot to the scope showing |
| `js/views/` | One module per scope or screen: `tonight.js` (home), `find.js` (Songs, with the Filters sheet), `song.js` (the song page and its edit form), `songs.js` (what those share: tonight's set at a venue, delete, the Add a song sheet), `setlists.js` (Lists), `venues.js` (History), `settings.js` (behind the gear), `help.js` (the short Help screen at the top of Settings, R76), `kj.js` (the KJ view) |
| `help/` | The full guide for the singer at <https://micjaunt.app/help/>, linked from the Help screen: `index.html`, `help.css` and iPhone screenshots in `img/` (downscaled from `npm run screenshots`). Not in the offline cache |
| `js/ui.js` | The `el()` DOM helper, icons, confirmations, and the screen stack behind the back gesture |
| `js/lib/` | Pure logic (search, song records, later CSV and backup formats): no DOM, no IndexedDB, unit-tested |
| `js/db.js` | IndexedDB wrapper, schema and record shapes |
| `js/karafun.js` | Stores, replaces and removes the KaraFun catalog and flags the songs it has (R66, R68); parsing and matching are in `js/lib/karafun.js` |
| `sw.js` | Service worker: offline cache |
| `manifest.webmanifest` | Install settings (name, icons, colors) |
| `icons/` | App icons; regenerate with `python3 tools/make_icons.py` |
| `tools/serve.js` | Zero-dependency static server used by Playwright and `npm run serve` |
| `tools/screenshots.js` | Phone screenshots of every screen for design review (`npm run screenshots`) |
| `tests/unit/` | Vitest tests for `js/lib/` |
| `tests/e2e/` | Playwright tests, named by requirement ID |
| `docs/REQUIREMENTS.md` | Requirements and their status |
| `docs/DESIGN-B.md` | The redesign being built: how the chosen direction maps onto the app, and the build order; `docs/design/` holds the designer's files |

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
- Two unit tests guard the bookkeeping. `tests/unit/requirements.test.js` reads `docs/REQUIREMENTS.md` and the e2e specs: every test a row names must exist with that title, every `Rnn:` test must be named by a row and its `Rnn` must be a current row, a Done row names at least one e2e test and a Built or Planned row names none. `tests/unit/app-shell.test.js` reads `sw.js`: every module reachable from `js/app.js` must be in `APP_SHELL`, and every path there must exist.

## Changing the app

The guards above are how the quality of the app is kept, so a change that adds or alters behaviour comes with all of these, and the unit suite fails until it does:

1. A row in `docs/REQUIREMENTS.md`, new or updated, that says what the app does now, in plain words, and a matching line in `docs/USER-STORIES.md`. A replaced behaviour goes to the History table there; IDs are never reused.
2. An e2e test in `tests/e2e/` whose title starts with the row's ID and says what it proves, named in the row's Notes. A row without a test reads Built, not Done.
3. For a new file under `js/`, its path in `APP_SHELL` in `sw.js`; for any change to a cached file, the version bumped with `npm run bump 1.0.57`, which writes it to `js/version.js` (Settings and the guide show it), `sw.js` (the cache name, which is what makes installed copies fetch new files) and `package.json`. The unit suite fails if the three differ. `npm run check-version dev` says whether your branch needs the bump; CI runs the same check on every pull request.
4. `npm test` green, both browsers. CI (`.github/workflows/ci.yml`) runs it on every pull request.

The guards check that the pieces are present and agree with each other. They cannot check that a test's title is true of what it asserts, or that a row describes the code: that is what review is for.

## Screenshots

`npm run screenshots` writes a PNG of every screen to `screenshots/<device>/<theme>/`, for an iPhone 14 (WebKit) and a Pixel 7 (Chromium) in dark and light, from a fixed sample library. `DEVICE=iphone THEME=dark npm run screenshots` does one set. It uses port 8004 and is for design review; the folder is not committed.

## What works today

- Installable shell with offline cache (R26, R27, R29)
- A dock at the bottom of every screen (Design B, see docs/DESIGN-B.md): the scope bar (Tonight, Songs, Lists, History and a gear for Settings) and the search field, which belongs to whichever scope is showing; the Up next card sits above it on Tonight and the filter button beside it on Songs
- **Tonight**, the home scope, built around a night out (R47–R50, R74): the venue is chosen in the header, with the date, and the Set menu shows tonight's set or any other list. Tonight's set is designated per venue (R75): another list shows as plain songs, each with + to pull it into tonight's set and a swipe for Remove, under a line with **Use for tonight**; the list shown is also where the Songs scope's + and Tonight's field add. A Sung strip says what you sang here today, with Undo last; tap it for every sing here by date, with Undo for today's. Up next heads the set, so it reads 01, 02, 03 from the top: **Sang it** logs the sing, takes the song off the set and shows the next song to the KJ in one tap, with Undo on that screen; **KJ** shows it full screen. After that comes the rest of the set, dragged by the handle at the left to reorder (R61); tap a title for its details, or swipe the row left for Park (to the venue's Next time list) and Remove. Typing in the field lists your matching songs with + to add them, and offers the KaraFun catalog when few match. Under Overall the set can be built but not sung (R56)
- **Songs**: the whole library, searched from the dock's field ("Search 412 songs"). The count line ("38 of 412 songs") has **Pick one** (R13) and the sort as a token; the dock's filter button, with a badge for how many are on, opens the Filters sheet over the list, and the filters on show as tokens above it, each removed with its ×, with Clear all (R69). Each row shows the song, its sings at tonight's venue ("2× · 17 Oct" or "New here"), a KaraFun mark, and + to add it to tonight's set (R48); tapping it opens the song page
- **The song page** (R70): the title, artist and key large, for the KJ, with a KJ button for the full-screen view; status and rating as toggles, the key with − and +, and On set / Add to set, each saved on tap; notes, tags, the sings here and at every venue, genre, year and KaraFun; Listen (a video search), Edit and Delete
- The KJ view (R54): title, artist and key as large as fit, the key with its meaning in words; turned to landscape it shows only the title, artist and key
- Library: add (the Add a song sheet at the end of Songs, or straight from a search that matched nothing), open, edit every field (notes, genre, year, key, tags, status, rating), delete with confirmation (R1, R10, R2, R3, R36, R4–R7); title, artist, year and genre suggestions from MusicBrainz while typing, matching word prefixes, with an off switch in Settings (R35, R63); a new song's status starts as "Not set" (R64); a warning when the song is already there (R9)
- Filters: never sung here / not since a date, tag, status, rating, genre, decade and In KaraFun; sort by title, artist, rating, last sung, date added, genre or decade (R37, R41, R11, R42, R12, R68). Fast with 1,000 songs (R34); each song has a video search link (R38)
- KaraFun catalog in Songs: once a catalog is loaded, a "My songs | KaraFun" switch searches it by genre, decade, duet, explicit and language, and each row adds the song to my songs or straight into the set with + (R67); songs KaraFun has carry a KaraFun mark (R68)
- **Lists**, for building and tidying lists: each list shows its label ("For The Crown" or "Any venue"; any list can be opened at any venue, R56), its song count, a genre line and a decade line, and how many of its songs are in tonight's set; "New list" at the top, and the dock's field filters them. A list opens on top with **Make this tonight's set** unless it is (R75), its genre and decade lines (one line each, whose "+more" unfolds the full counts in place), + / ✓ on each song for tonight's set ("✓ = in tonight's set"), each song's sings at the list's venue as Tonight shows them, a drag handle (held at the screen's edge, a drag scrolls it for long moves), a swipe left for Remove and a tap on the song for its page; its actions are one row that scrolls sideways on a phone: "Find songs" (the Songs scope with + to add to this list, without making it tonight's set, R57), "Rename" (the name and the label), "Merge into…" (onto the end of another, one song at a time with + or all with Move all, R59) and Delete, with "Suggest songs" under the songs (never-sung songs in the list's own mix or across every genre, shown first as a preview to trim, then added with Undo) (R14, R15, R43, R16, R44, R45, R70)
- No title bar: the selected scope in the dock is an accent pill, and content starts at the top edge (R58). Lists reopens the list you were on if you come back within five minutes (R60)
- Settings: CSV import of songs and, via a venue column, sings; CSV export; JSON backup by download or, on a phone, the share sheet; "Check a backup file"; restore (R22, R46, R23, R20, R62, R21). The KaraFun catalog: load KaraFun's CSV, see when and how many, replace or remove it; loading marks which of your songs KaraFun has (R66, R68); in Safari on an iPhone the catalog loads only in the Home Screen app (R66). In Safari on an iPhone a banner says that Safari deletes the data after seven days away and that it does not follow the app to the Home Screen, blunter from its second showing, with Move my data, How (the install steps in Help) and Later for three days; other browsers get a softer banner while storage is not persistent; a fresh install offers to restore (R65). Help has the install steps for iPhone and Android (R76)
- Print-friendly song list, setlist and venue history from the browser's print menu (R24); new-version banner with Reload (R30); iPhone icon and status-bar tags (R29); a reminder when the last backup is over 30 days old (R25)
- **History**: a chip for each venue and All venues, starting at Tonight's venue; By song lists each song with times and last sung, opening to every sing with Delete, and By night lists the same sings by date; the dock's field searches by title or artist (R8, R72). "Log a sing" logs one you forgot or from another night, finding the song by typing, dated today unless changed (R71). "Venues" (also Tonight's "Manage venues…") adds, renames and deletes venues, a venue only when no sing uses it (R40)
- Data stored in IndexedDB, with a persistent-storage request (R18, R19)

- One-handed layout: the dock at the bottom, 44 px controls everywhere, actions at the bottom of detail screens, and the back gesture returns from a detail screen instead of leaving the app (R31)
- Dark by default on a blue-black ground with a sky accent (R51), or green, amber, lime or pink from Settings (R55); system fonts only, monospace for dates, counts and keys; a light option and "Match the phone" (R32); readable at desktop widths (R33)
- Filters persist across scopes and reloads (R53); a sung filter hides the redundant "never sung here" lines (R52)

## Still to build

Every requirement so far is built, R28 (hosting) included: the app lives at <https://micjaunt.app>. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## Two things to remember

- **Bump the version with `npm run bump <version>`** whenever you change a cached file, and add every new file under `js/` to `APP_SHELL` in `sw.js`, or installed copies keep the old version or break offline. The unit suite checks the shell and that the three copies of the number agree; `npm run check-version <base>` checks the bump. `sw.js` must stay a classic script with the number written in it: a module worker can never be adopted by the copies already installed. While developing, DevTools → Application → Service Workers → "Update on reload" saves the trouble.
- **Schema changes** go in a new `if (oldVersion < N)` block in `js/db.js` with `DB_VERSION` bumped. Do not edit an existing block.

## Deploy (R28)

Any static host with HTTPS works. There is nothing to build: the host serves the repo's files as they are. Service workers need HTTPS (or `localhost`), so a plain `http://` host will run the app but not install it or work offline.

Only the app files matter to the host: `index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `icons/`, and `help/` for the full guide. The `tests/`, `tools/`, `docs/` and `node_modules/` folders are harmless but unused.

**GitHub Pages** (free, HTTPS included):

1. Push the repo to GitHub.
2. Repo **Settings → Pages → Build and deployment**: Source "Deploy from a branch", branch `main`, folder `/ (root)`. Save.
3. After a minute the site is at `https://<user>.github.io/<repo>/`. The sub-folder is fine: every path in the app is relative and the manifest's `start_url` and `scope` are `.`.

**Custom domain (micjaunt.app):** the `CNAME` file at the repo root holds the domain, so GitHub Pages picks it up when it deploys. At the registrar, point the apex at GitHub Pages with four A records (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`) and, optionally, `www` as a CNAME to `<user>.github.io`. Then in **Settings → Pages** confirm the custom domain and tick **Enforce HTTPS** once the certificate check passes (minutes to an hour). `.app` domains are HTTPS-only by browser policy, so the site will not load at all until that certificate exists. If you also own `micjaunt.com`, forward it to `https://micjaunt.app` at the registrar rather than adding it to Pages.

**Netlify or Cloudflare Pages:** connect the repo (or drag the folder onto Netlify Drop). Build command: none. Publish directory: the repo root.

**On the phone:** open the URL in Safari (iPhone: Share, or ⋯ then Share, then "Add to Home Screen") or Chrome (Android: the three-dot menu, "Add to home screen", then Install). Help in the app has the same steps. The installed copy opens full screen and works offline after the first visit. Take a backup from Settings now and then; it is the only copy of your data.

**Shipping an update:** commit, `npm run bump <version>`, push. An open copy of the app shows "A new version is ready" with a Reload button once the new files are cached (R30); a closed copy picks them up on its next open.
