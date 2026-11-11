# Karaoke Tracker: requirements

A personal, local-only PWA for tracking a karaoke repertoire of 500+ songs.

**Goal:** build lists for specific venues and track what I have (and have not) sung at each one, so I don't repeat songs and each night's selection is diverse in genre and time period.

Snapshot of the requirements sheet as of 2026-11-11. Update the Status column here as work lands.

Priority: **Must** = needed for a usable first version, **Should** = next, **Could** = nice to have.

## Library

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R1 | Add a song with title and artist | Must | Done | e2e: "R1: adds a song with title and artist" |
| R2 | Edit or delete a song, with a confirmation before deleting | Must | Not started | |
| R3 | Free-text notes per song | Must | Not started | E.g. "skip the bridge", "starts cold" |
| R36 | Collect a genre and year (decade at least) for a song, for use in sorting and finding | Must | In progress | Add form collects genre and year; missing: edit them, and an e2e test |
| R8 | Log each time I sing a song and the venue; show times sung and last sung (per venue and overall) | Must | Not started | Date required, venue required |
| R40 | Add, rename and delete venues | Must | Not started | Needed by R8, R37 and R39 |
| R5 | Tag songs with my own tags | Should | Not started | E.g. duet, crowd-pleaser, slow, 80s |
| R6 | Store my key change for each song | Should | Not started | E.g. -2 or +1, as set on the karaoke machine |
| R7 | Mark each song as Go-to, Want to try or Retired | Should | Not started | |
| R4 | Rate each song 1-5 for how well I sing it | Could | Not started | |
| R9 | Warn when adding a song that is already in the library | Could | Not started | Match on title + artist, ignoring case |

## Find

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R37 | Select a venue or "overall", and then find | Must | Not started | |
| R41 | Filter to songs never sung at the selected venue, or not sung there since a date I pick | Must | Not started | Depends on R8 and R37 |
| R10 | Search by title or artist as I type | Must | Done | e2e: "R10: searches by title or artist as I type"; unit: tests/unit/search.test.js |
| R11 | Filter by tag, rating and status | Must | Not started | Filters combine |
| R42 | Filter and sort by genre and decade | Must | Not started | Combines with the R11 filters; depends on R36 |
| R12 | Sort by title, artist, rating, last sung or date added | Should | Not started | |
| R13 | "Pick for me": a random song from the current filter | Could | Not started | |

## Setlists

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R39 | A setlist is either venue-specific or general | Must | Not started | |
| R14 | Create, rename and delete setlists | Must | Not started | |
| R15 | Add and remove songs; a song can be in several setlists | Must | Not started | |
| R43 | Flag songs in a setlist that I have already sung at its venue | Must | Not started | Shows the date last sung there; depends on R8 and R39 |
| R16 | Reorder songs in a setlist by dragging | Should | Not started | |
| R44 | Show a setlist's mix by genre and decade | Should | Not started | Counts per genre and decade, so gaps and repeats stand out; depends on R36 |
| R45 | Suggest a set: N songs not yet sung at the venue, spread across genres and decades | Could | Not started | A starting point I can edit |
| R17 | Tonight mode: check off songs as I sing them, which logs them | Could | Not started | Depends on R8 |

## Data

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R18 | Keep all data on the device in IndexedDB; no account, no server | Must | Done | e2e: "R18: data survives a reload" |
| R19 | Ask the browser for persistent storage | Must | Done | `navigator.storage.persist()`; lowers the risk of Safari clearing data. e2e: "R19: asks for persistent storage at startup" |
| R20 | Export a full backup as one JSON file | Must | Not started | Songs, tags, venues, setlists and sing log |
| R21 | Restore from a JSON backup | Must | Not started | Confirm before replacing existing data |
| R22 | Import songs from a CSV file | Must | Not started | Title and artist required; genre, year, key and tags optional. The fastest way to load 500+ songs |
| R23 | Export songs as a CSV file | Should | Not started | |
| R24 | Print-friendly song list and setlist | Should | Not started | Print stylesheet + browser print dialog |
| R25 | Remind me to back up when the last export is over 30 days old | Could | Not started | |

## PWA

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R26 | Web app manifest so it installs to the home screen | Must | Done | Name, icons, standalone display, theme color. e2e: "R26: has an installable web app manifest"; real install only checkable on a phone |
| R27 | Service worker caches the app so it works fully offline | Must | Done | e2e: "R27: loads offline after the service worker is installed" |
| R28 | Served over HTTPS from a static host | Must | Not started | E.g. GitHub Pages, Netlify or Cloudflare Pages; required for service workers |
| R29 | iPhone home-screen icon and status-bar settings | Should | Not started | apple-touch-icon and related meta tags |
| R30 | Detect a new version and offer to reload | Should | Not started | |

## UX

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R31 | Mobile-first layout, usable one-handed | Must | In progress | Tap targets at least 44 px. Bottom tabs and 44 px controls exist; final pass and e2e check after Wave 2 |
| R38 | Web search for a song (to listen to outside the venue) | Should | Not started | A button on each song opens a video search for "title artist" in a new tab. Nothing is saved; needs a connection |
| R32 | Dark theme by default, with a light option | Should | Not started | Readable in a dim bar |
| R33 | Works at desktop widths too | Should | Not started | |
| R34 | Opens in under 2 seconds; search feels instant with 1,000 songs | Should | Not started | |
| R35 | Suggest title and artist from MusicBrainz when online | Should | Not started | Free API, no key; the only network call in the app |

## Out of scope

| ID | Item | Notes |
|---|---|---|
| X1 | Friends, sharing and any social features | |
| X2 | Accounts, login and cloud sync between devices | Backup file covers moving to a new phone |
| X3 | Payments or a paywall | |
| X4 | Lyrics, backing tracks or audio playback | Licensing |
| X5 | App Store or Google Play listing | |
