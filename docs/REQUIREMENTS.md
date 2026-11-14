# Mic Jaunt: requirements

A personal, local-only PWA for tracking a karaoke repertoire of 500+ songs. Live at <https://micjaunt.app>.

**Goal:** build lists for specific venues and track what I have (and have not) sung at each one, so I don't repeat songs and each night's selection is diverse in genre and time period.

This sheet describes the app as it is. It started as the requirements list of 2026-11-11 and was rewritten on 2026-11-14 so every built behaviour has a row, including the ones that grew out of use. IDs are stable and match the e2e test names in `tests/e2e/`; replaced items are in History at the end. Update it as work lands.

Priority: **Must** = needed for a usable version, **Should** = next, **Could** = nice to have. Status: **Done** = built with the named e2e test; **Built** = built, no e2e test yet; **Planned** = agreed, not built.

## Songs tab: a night out

The Songs tab's job is finding the next song to sing and working a list through the night; adding songs is occasional. The venue and the set being worked are chosen once and stay pinned; three modes work on them.

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R37 | Choose the venue I am at, or "Overall" for no venue, and have that choice remembered | Must | Done | Every song shows times sung and last sung at that venue. e2e: "R37: selecting a venue shows times sung and last sung there in the list", "R37: the venue selection survives a reload" |
| R47 | There is always a set open for the venue: the set menu offers every setlist and "New list for tonight…" (named like "Fri 14 Nov"), and the choice is remembered per venue | Must | Done | First visit to a venue opens the first list labelled for it, then an any-venue list, else creates one named after the venue. Under Overall the menu offers "New list…" and, with no setlists at all, an unsaved "My list" that the first + creates. e2e: "R47: picking a venue opens its list, creating one on first visit, and remembers it", "R47: New list for tonight creates a dated list and selects it" |
| R56 | A setlist's venue is a label, not a binding: any setlist can be opened at any venue, and the set menu groups them as for this venue, any venue, other venues | Must | Done | Under Overall + and List (with Remove) work; "Sang it", "Next time" and Sung stay off. Deleting a venue clears the label on its setlists and the venue's set memory. e2e: "R56: the Set menu offers every setlist, grouped for this venue, any venue and other venues", "R56: a list labelled for one venue can be opened and sung at another", "R56: under Overall a list can be built and ordered but not sung", "R56: deleting a venue clears the label on its setlists instead of being blocked", "R56: a setlist is labelled for a venue or any venue, and the label can be changed" |
| R48 | Find mode: search and filter my songs, and add one to the current set or take it off with one tap | Must | Done | Each row's + becomes ✓ when the song is in the set. "Add a song" sits at the bottom; a search that matches nothing offers to add that title. e2e: "R48: + adds a song to the set from Find mode and ✓ removes it", "R48: Add a song sits at the bottom and a search with no match offers to add it" |
| R49 | List mode: the current set in order; move a song, mark it "Sang it" (logs a sing at the venue today and takes it off the set), or park it for "Next time" | Must | Done | "Next time" moves the song to the venue's Next time list, an ordinary setlist created on first use that can be renamed. e2e: "R49: Sang it logs a sing today and removes the song from the set", "R49: Next time moves the song to the venue's Next time list, which can be renamed", "R49: moves songs up and down in List mode" |
| R61 | Reorder the set in List mode by dragging, the same way as on the setlist screen | Must | Done | Shared drag module; arrow keys on the handle move the song too. e2e: "R61: List mode has a drag handle that reorders the set, like the setlist screen" |
| R50 | Sung mode: what I have sung at this venue, newest first and grouped by date, with Undo for today's entries | Must | Done | Undo deletes the sing and puts the song back at the top of the set. e2e: "R50: Sung mode lists sings newest first by date and Undo puts the song back on top" |
| R54 | Show a song to the KJ full screen: title, artist and key in the biggest type that fits, portrait or landscape | Must | Done | From a song in List mode or from the song screen; everything else hides until Close or the back gesture. e2e: "R54: tapping a song in List mode shows it full screen for the KJ, portrait and landscape" |
| R57 | From a setlist, jump to the Songs tab with that set open at the current venue to find songs for it | Must | Done | Replaced the setlist screen's own song picker. e2e: "R57: Find songs on a setlist opens the Songs tab with that set at the current venue" |
| R53 | Filters and sort persist across tabs and reloads; the search persists across tabs | Must | Done | Clear filters resets them. Adding a song clears the search but keeps the filters. e2e: "R53: filters survive another tab and a reload; the search survives the tab but not the reload" |
| R52 | With a sung filter on, hide the redundant "never sung here" line so more songs fit per screen | Must | Done | e2e: "R52: a sung filter hides the \"never sung here\" lines, and clearing it brings them back" |

## Find: search, filters and sort

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R10 | Search my songs by title or artist as I type | Must | Done | e2e: "R10: searches by title or artist as I type"; unit: tests/unit/search.test.js |
| R41 | Filter to songs never sung at the selected venue, or not sung there since a date I pick | Must | Done | "Not since D" keeps songs never sung there or last sung strictly before D. e2e: "R41: filters to songs never sung at the selected venue", "R41: filters to songs not sung since a date" |
| R11 | Filter by tag, status (including "Not set") and minimum rating; filters combine with each other and with the search | Must | Done | e2e: "R11: tag, status and rating filters combine" |
| R42 | Filter and sort by genre and decade | Must | Done | Songs without a genre or year sort last. e2e: "R42: filters by genre and decade and sorts by decade" |
| R12 | Sort by title, artist, rating, last sung at the venue (either way) or date added | Should | Done | "Longest ago first" puts never-sung songs first. e2e: "R12: sorts by artist, rating and date added", "R12: sorts by last sung at the selected venue" |
| R69 | The filters fold away, show how many are active, and clear in one tap; the list says how many songs match | Must | Done | "Filters (2)"; "12 of 480 songs". Covered within the R53, R42 and R67 tests (filtersSummary and Clear filters) |
| R13 | "Pick for me": open a random song from whatever the venue, search and filters leave | Could | Done | e2e: "R13: picks a random song from the current filter and opens it" |
| R34 | Opens in under 2 seconds and search feels instant with 1,000 songs | Should | Done | The list draws 200 rows at a time with "Show N more"; rows are built once and reused. e2e: "R34: opens with 1,000 songs in under 2 seconds and searches instantly" |

## Library: the songs themselves

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R1 | Add a song with title and artist, with genre, year and status optional at the time | Must | Done | e2e: "R1: adds a song with title and artist" |
| R9 | Warn when a song being added is already in the library, and let me open it or add anyway | Could | Done | Matches title and artist ignoring case while typing. e2e: "R9: warns when the song is already in the library and still allows adding" |
| R35 | While typing a new song, suggest titles and artists from MusicBrainz when online, with a switch to turn it off | Should | Done | The only network call in the app; after 3 characters, 400 ms after the last keystroke. Tests never reach the real site. e2e: "R35: suggests titles and artists from MusicBrainz and fills the form on tap", "R35: makes no request when online suggestions are off", "R35: shows nothing when MusicBrainz fails" |
| R63 | Suggestions match word prefixes, narrow by the artist as typed, and fill the year (earliest release) and genre too, offering the artist's other genres to pick from | Must | Done | Values I typed are never overwritten. e2e: "R63: a tapped suggestion fills the earliest release year and the artist's top genre, with the others as chips", "R63: typing in Artist narrows the search, and typed genre and year are never overwritten" |
| R70 | A song screen shows everything about the song: title, artist, notes, genre, year, key, tags, status, rating and whether KaraFun has it, with Edit, Delete, "Show to the KJ", a video search and a way back to the list | Must | Done | Covered by the R2, R3, R38, R54 and R68 tests, which all go through it |
| R2 | Edit any field of a song, or delete it after confirming; deleting also removes its sing log and setlist entries | Must | Done | e2e: "R2: edits a song", "R2: deletes a song after confirming", "R2: keeps the song when the delete confirmation is dismissed" |
| R3 | Free-text notes per song | Must | Done | E.g. "skip the bridge", "starts cold". e2e: "R3: saves free-text notes on a song" |
| R36 | A genre and a year per song, for sorting and finding by decade | Must | Done | Year is a single number; for a decade-only song enter any year in it. e2e: "R36: edits genre and year" |
| R5 | My own tags on a song | Should | Done | E.g. duet, crowd-pleaser, slow. e2e: "R2: edits tags (R5), key (R6), status (R7) and rating (R4), and they survive a reload" |
| R6 | My key change for each song, as set on the karaoke machine | Should | Done | E.g. -2 or +1. Same e2e test as R5 |
| R7 | Mark a song Go-to, Want to try or Retired | Should | Done | Same e2e test as R5 |
| R64 | A new song's status is "Not set" until I choose one, and "Not set" can be filtered | Must | Done | e2e: "R64: a new song has no status until one is chosen, and \"Not set\" can be filtered" |
| R4 | Rate a song 1 to 5 for how well I sing it | Could | Done | Same e2e test as R5 |
| R38 | Look a song up on the web, to listen to it outside the venue | Should | Done | Opens a YouTube search for "title artist" in a new tab; nothing fetched or saved. e2e: "R38: a song has a video search link for its title and artist" |

## Setlists: building and tidying lists

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R14 | Create, rename and delete setlists; each is labelled for a venue or for any venue, and the label can be changed | Must | Done | Names unique ignoring case; the list shows each setlist's label and song count; delete confirms with the song count. e2e: "R14: creates, renames and deletes a setlist", "R14: keeps the setlist when the delete confirmation is dismissed", "R14: lists setlists by name and refuses empty and duplicate names" |
| R15 | Add songs to a setlist and remove them; a song can be in several setlists | Must | Done | Adding happens on the Songs tab (R48, R57); Remove needs no confirmation. e2e: "R15: adds and removes songs, and a song can be in two setlists" |
| R16 | Reorder a setlist by dragging, with Up and Down for long moves | Should | Done | Pointer events, works with touch; arrow keys on the handle. e2e: "R16: moves a song up and down with the buttons and the order survives a reload", "R16: drags a song to a new position" |
| R43 | Flag songs in a setlist that I have already sung at its label venue, with the date | Must | Done | No flags on an any-venue list. In List mode on the Songs tab the flag uses the venue I picked. e2e: "R43: flags songs already sung at the setlist's venue with the last date", "R43: a general setlist shows no sung flags" |
| R44 | See a setlist's mix: how many songs per genre and per decade | Should | Done | Collapsible; "No genre" and "No year" last. e2e: "R44: shows the mix by genre and decade and updates when a song is removed" |
| R45 | Suggest N songs for a setlist that I have not sung at its venue, spread across genres and decades | Could | Done | 1 to 50, default 10; never-sung, non-Retired songs, round-robin across genres then decades, random within. e2e: "R45: suggests never-sung songs spread across genres and decades", "R45: says so when fewer songs are left than asked for" |
| R59 | Merge a setlist into another: every song not already there goes to the end of the other, and the source is left empty | Must | Done | Confirms with the counts, including how many are already there. e2e: "R59: merging moves every song not already there to the end of the other list and empties the source" |
| R60 | The Setlists tab holds its place: coming back within five minutes reopens the setlist I was on; later it starts at the list | Must | Done | Leaving through "All setlists" means the tab starts at the list next time. e2e: "R60: coming back to the Setlists tab within minutes reopens the setlist; later it starts at the list" |

## Venues and the sing log

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R40 | Add, rename and delete venues; a venue with sings cannot be deleted | Must | Done | Setlists labelled for a deleted venue become "Any venue". e2e: "R40: adds, renames and deletes a venue", "R40: refuses to delete a venue that has sing log entries" |
| R8 | Log each time I sing a song at a venue, on a date I choose; see times sung and last sung per venue and overall | Must | Done | Logged from the venue's screen or "Sang it" (R49). An Overall screen covers every venue. e2e: "R8: logs a sing with date and venue and shows times sung and last sung at that venue", "R8: shows overall times sung and last sung across venues" |
| R71 | Logging a sing by hand: find the song by typing (nothing lists until I do, and a long match list asks me to narrow it), with the date defaulting to today and editable | Must | Built | Up to 20 matches shown. No e2e test yet |
| R72 | A venue's history (and the Overall history) lists each song with times and last sung, opens to the individual sings, and lets me delete one to undo a mis-tap | Must | Built | Delete confirms. No e2e test yet |

## Data: on the device, backed up by me

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R18 | All data stays on the device; no account, no server | Must | Done | IndexedDB. e2e: "R18: data survives a reload" |
| R19 | Ask the browser for persistent storage at startup, show whether it was granted, and let me ask again | Must | Done | Settings → Storage. e2e: "R19: asks for persistent storage at startup" |
| R20 | Save a full backup as one file: songs, venues, sing log, setlists | Must | Done | e2e: "R20: downloads a JSON backup containing all songs" |
| R62 | On a phone, hand the backup to the share sheet (Files, AirDrop, Mail), counted as a backup only when it goes through; check any backup file to see what it holds without restoring it | Must | Done | A download inside an installed iPhone app may silently do nothing. e2e: "R62: Share backup hands the file to the share sheet and counts as a backup only when it goes through", "R62: a cancelled share is not counted as a backup", "R62: without a share sheet only Download backup shows", "R62: Check a backup file reports what it holds and compares it with the phone, without restoring" |
| R21 | Restore from a backup after confirming, replacing what is on the device | Must | Done | Backups from before the rename (`karaoke-tracker`) still restore. e2e: "R21: restores a backup after confirming", "R21: leaves data alone when the restore confirmation is dismissed" |
| R25 | Remind me to back up when the last backup is over 30 days old, with a snooze | Could | Done | Once there are songs; "Later" hides it for a week. e2e: "R25: reminds once there are songs and no backup, and goes quiet after a backup", "R25: reminds when the last backup is over 30 days old, and Later hides it for a week" |
| R65 | Point out, at both ends, that data entered in Safari on an iPhone does not follow the app to the Home Screen | Must | Done | In Safari with songs: a banner offering to move the data. In the installed app with an empty library: an offer to restore a backup. e2e: "R65: in Safari on an iPhone with songs, a banner points at Share backup; Later hides it for a week", "R65: the installed app shows no banner, and an empty library offers to restore a backup" |
| R22 | Import songs from a CSV file: title and artist required; genre, year, key, tags, status, rating and notes optional; duplicates and bad rows skipped and reported | Must | Done | The fastest way to load 500+ songs. e2e: "R22: imports a CSV of songs", "R22: skips duplicate and invalid rows and says so", "R22: explains a file it cannot import and adds nothing" |
| R46 | A venue column in the CSV logs one sing per row, dated by a date column or the import day; venues are created as needed | Should | Done | Dates: YYYY-MM-DD, YYYY-MM, YYYY or M/D/YYYY. e2e: "R46: a venue column logs a sing per row, dated by the date column or today", "R46: an unreadable date skips the sing but keeps the song" |
| R23 | Export my songs as a CSV file that imports back without duplicates | Should | Done | e2e: "R23: downloads a CSV of all songs that imports back without duplicates" |
| R24 | Print the song list, a setlist or a venue's history cleanly from the browser's print menu | Should | Done | e2e: "R24: prints the song list without the tabs and forms", "R24: prints a setlist's songs", "R24: prints a venue's history with every date" |

## KaraFun catalog

KaraFun publishes its whole catalog (about 100,000 songs) as a free CSV: `Id;Title;Artist;Year;Duo;Explicit;"Date Added";Styles;Languages`, semicolon-separated, UTF-8, about 7 MB, linked from <https://www.karafun.com/karaoke-song-list.html>. Their site refuses requests that are not a person in a browser and sends no CORS header, and their terms allow private use only, so the app never fetches or hosts the file: I download it in Safari (Save to Files) and load it in Settings, and refresh it the same way every six months or so. The catalog is a browsing aid, kept outside backups and rebuilt from the file. MusicBrainz (R35, R63) stays for songs KaraFun does not have.

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R66 | Load the KaraFun catalog from its CSV file; see when it was loaded and how many songs it holds; replace it with a newer file; remove it | Must | Done | Columns found by header name; bad and repeated rows skipped and counted. Stored 2,500 rows per short transaction with progress, so the app stays usable during a load. The wrong file, or one with no usable rows, is refused before anything changes; a failure part-way removes the part loaded; rows left by an app closed mid-load are reported. e2e: "R66: loading the KaraFun CSV stores the catalog, shows when and how many, and can be replaced", "R66: a large catalog is stored in batches with progress", "R66: the wrong file is refused", "R66: a file that breaks part-way leaves no half-loaded catalog", "R66: rows left by a load that stopped part-way are reported, and loading again replaces them", "R66: removing the catalog clears it", "R66: catalog details without the rows, as after a restore on a new phone, read as no catalog loaded" |
| R67 | Search the KaraFun catalog from Find instead of my songs, with genre, decade, duet, explicit and language filters and its own sort; add a song from it to my songs with title, artist, year and genre filled, or straight into the current set | Must | Done | Only once a catalog is loaded. Songs already mine are marked. Nothing lists until two characters or a filter; 200 rows at a time. A My songs search with no match offers to search the catalog. The catalog is read once per load and kept in memory. e2e: "R67: the KaraFun switch appears once a catalog is loaded and searches it with the catalog filters", "R67: a catalog song can be added to my songs and straight into the current set", "R67: without a catalog Find is unchanged", "R67: a replaced catalog is read again, and removing it takes the switch away", "R67: a long catalog list draws 200 rows at a time, without Add a song or Starting fresh" |
| R68 | My songs carry a KaraFun flag: set when added from the catalog, and matched by title and artist for every song when a catalog is loaded; shown on the song and filterable | Must | Done | A flag that no longer matches is cleared; where KaraFun lists a song more than once, mine keeps the version it has, else the lowest id. Removing the catalog keeps the flags. e2e: "R68: loading the catalog flags the songs KaraFun has and clears flags that no longer match", "R68: songs KaraFun has show a badge and can be filtered" |

## Installable and offline

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R26 | Installs to the home screen as an app | Must | Done | Name, icons, standalone display, theme colour. e2e: "R26: has an installable web app manifest" |
| R27 | Works fully offline once opened | Must | Done | Service worker cache. e2e: "R27: loads offline after the service worker is installed" |
| R28 | Served over HTTPS from a static host | Must | Done | GitHub Pages from `main`, custom domain, HTTPS enforced, since 2026-11-12 |
| R29 | iPhone home-screen icon and status-bar settings | Should | Done | e2e: "R29: has iPhone home-screen icon and status-bar meta tags" |
| R30 | Notice a new version, also when the app returns to the foreground, and offer to reload | Should | Done | e2e: "R30: offers to reload when a new version is installed" |
| R73 | Settings shows the app version | Could | Built | No e2e test |

## Look and feel

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R31 | Mobile-first, usable one-handed: controls at least 44 px, actions within thumb reach, and the back gesture returns from a detail screen instead of leaving the app | Must | Done | e2e: "R31: every control on every screen is at least 44 px tall and wide", "R31: the back gesture returns from a song and its edit form instead of leaving the app", "R31: the back gesture returns from a venue, overall and a setlist to their lists", "R31: the in-page Back button keeps the history in step with the screens" |
| R58 | No title bar: the bottom tabs carry the selection, and content starts at the top edge | Must | Done | The page title stays for screen readers and printouts. e2e: "R58: there is no title bar; the selected tab is filled with the accent and larger" |
| R32 | Dark by default, with a light option and "Match the phone" | Should | Done | Applied before the first paint. e2e: "R32: is dark by default and a light option survives a reload", "R32: \"Match the phone\" follows the phone's setting" |
| R51 | High contrast: text and accent read at about 7:1 on the dark background | Must | Done | Checked in screenshots; no e2e test |
| R55 | Choose the accent colour: green (default), amber, lime or pink | Must | Done | Each has a deeper partner for the light theme. e2e: "R55: the accent colour can be changed in Settings and survives a reload" |
| R33 | Readable at desktop widths too | Should | Done | Content stays at 720 px, centred. e2e: "R33: works at a desktop width with readable line lengths and no sideways scroll" |

## History

| ID | What changed | When |
|---|---|---|
| R17 | Tonight mode on the Setlists tab (check songs off as sung) was replaced by List mode on the Songs tab (R49) with Sung mode's Undo (R50) | 2026-11-12 |
| R39 | "A setlist is venue-specific or general" became a label, not a binding (R56) | 2026-11-13 |
| R57 | The setlist screen's own song picker was replaced by "Find songs" into the Songs tab | 2026-11-13 |
| R51 | The accent changed from pink to green; pink stayed as a choice (R55) | 2026-11-13 |

## Out of scope

| ID | Item | Notes |
|---|---|---|
| X1 | Friends, sharing and any social features | |
| X2 | Accounts, login and cloud sync between devices | Backup file covers moving to a new phone |
| X3 | Payments or a paywall | |
| X4 | Lyrics, backing tracks or audio playback | Licensing |
| X5 | App Store or Google Play listing | |
