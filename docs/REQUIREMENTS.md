# Mic Jaunt: requirements

A personal, local-only PWA for tracking a karaoke repertoire of 500+ songs.

**Goal:** build lists for specific venues and track what I have (and have not) sung at each one, so I don't repeat songs and each night's selection is diverse in genre and time period.

Snapshot of the requirements sheet as of 2026-11-11. Update the Status column here as work lands.

Priority: **Must** = needed for a usable first version, **Should** = next, **Could** = nice to have.

## Library

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R1 | Add a song with title and artist | Must | Done | e2e: "R1: adds a song with title and artist" |
| R2 | Edit or delete a song, with a confirmation before deleting | Must | Done | Deleting also removes the song's sing log and setlist entries. e2e: "R2: edits a song", "R2: deletes a song after confirming", "R2: keeps the song when the delete confirmation is dismissed" |
| R3 | Free-text notes per song | Must | Done | E.g. "skip the bridge", "starts cold". e2e: "R3: saves free-text notes on a song" |
| R36 | Collect a genre and year (decade at least) for a song, for use in sorting and finding | Must | Done | Year is a single number; for a decade-only song enter any year in it. e2e: "R36: edits genre and year" |
| R8 | Log each time I sing a song and the venue; show times sung and last sung (per venue and overall) | Must | Done | Date required, venue required. Logged from the Venues tab; "Overall" row shows cross-venue stats. The Songs list shows per-song stats for the selected venue (R37). e2e: "R8: logs a sing with date and venue and shows times sung and last sung at that venue", "R8: shows overall times sung and last sung across venues" |
| R40 | Add, rename and delete venues | Must | Done | Needed by R8 and R37. A venue with sing log entries cannot be deleted; setlists labelled for it become "Any venue" (R56). e2e: "R40: adds, renames and deletes a venue", "R40: refuses to delete a venue that has sing log entries" |
| R5 | Tag songs with my own tags | Should | Done | E.g. duet, crowd-pleaser, slow, 80s. Entered in the edit form and CSV import; pulled forward so R11 has data. e2e: "R2: edits tags (R5), key (R6), status (R7) and rating (R4), and they survive a reload" |
| R6 | Store my key change for each song | Should | Done | E.g. -2 or +1, as set on the karaoke machine. Same e2e test as R5 |
| R7 | Mark each song as Go-to, Want to try or Retired | Should | Done | Same e2e test as R5 |
| R64 | A new song's status starts blank ("Not set") until I choose one; the Add form offers the choice | Must | Done | The Status filter gains "Not set". Existing songs keep their status. e2e: "R64: a new song has no status until one is chosen, and \"Not set\" can be filtered" |
| R4 | Rate each song 1-5 for how well I sing it | Could | Done | Same e2e test as R5 |
| R9 | Warn when adding a song that is already in the library | Could | Done | Matches title + artist ignoring case while typing; shows "Already in your library" with Open it, and the button reads "Add anyway". e2e: "R9: warns when the song is already in the library and still allows adding" |

## Find

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R37 | Select a venue or "overall", and then find | Must | Done | A Venue menu on the Songs tab; the choice is remembered across reloads. Each row shows times sung and last sung at that venue. e2e: "R37: selecting a venue shows times sung and last sung there in the list", "R37: the venue selection survives a reload" |
| R41 | Filter to songs never sung at the selected venue, or not sung there since a date I pick | Must | Done | "Not since D" keeps songs never sung there or last sung strictly before D. e2e: "R41: filters to songs never sung at the selected venue", "R41: filters to songs not sung since a date" |
| R10 | Search by title or artist as I type | Must | Done | e2e: "R10: searches by title or artist as I type"; unit: tests/unit/search.test.js |
| R11 | Filter by tag, rating and status | Must | Done | Filters combine, with each other and with the search. Rating is a minimum (4+). e2e: "R11: tag, status and rating filters combine" |
| R42 | Filter and sort by genre and decade | Must | Done | Sort by title, genre, decade or decade newest first; songs without a genre or year sort last. e2e: "R42: filters by genre and decade and sorts by decade" |
| R12 | Sort by title, artist, rating, last sung or date added | Should | Done | In the Sort by menu with the R42 orders. Last sung uses the selected venue; "longest ago first" puts never-sung songs first. e2e: "R12: sorts by artist, rating and date added", "R12: sorts by last sung at the selected venue" |
| R13 | "Pick for me": a random song from the current filter | Could | Done | Button beside the count line; picks from everything the venue, search and filters leave, and opens it. e2e: "R13: picks a random song from the current filter and opens it" |

## Setlists

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R39 | A setlist is either venue-specific or general | Must | Superseded | Replaced by R56 on 2026-11-13: the venue on a setlist is a label ("For Viking" or "Any venue"), not a binding |
| R14 | Create, rename and delete setlists | Must | Done | Names are unique, ignoring case; delete confirms and says how many songs it holds. e2e: "R14: creates, renames and deletes a setlist", "R14: keeps the setlist when the delete confirmation is dismissed", "R14: lists setlists by name and refuses empty and duplicate names" |
| R15 | Add and remove songs; a song can be in several setlists | Must | Done | Songs are added from the Songs tab's Find mode (+ on each row, reached by "Find songs", R57); Remove on the setlist screen needs no confirmation. e2e: "R15: adds and removes songs, and a song can be in two setlists" |
| R43 | Flag songs in a setlist that I have already sung at its venue | Must | Done | On the setlist screen the flag uses the list's label venue (none for "Any venue"); in List mode on the Songs tab it uses the venue you picked. e2e: "R43: flags songs already sung at the setlist's venue with the last date", "R43: a general setlist shows no sung flags" |
| R16 | Reorder songs in a setlist by dragging | Should | Done | Drag handle (pointer events, works with touch) plus Up and Down buttons and arrow keys on the handle. No auto-scroll while dragging; use the buttons for long moves. Real-finger drag needs a check on the phone. e2e: "R16: moves a song up and down with the buttons and the order survives a reload", "R16: drags a song to a new position" |
| R44 | Show a setlist's mix by genre and decade | Should | Done | A collapsible "Mix" card on the setlist: counts per genre (most first) and per decade (oldest first); "No genre" and "No year" last. e2e: "R44: shows the mix by genre and decade and updates when a song is removed" |
| R45 | Suggest a set: N songs not yet sung at the venue, spread across genres and decades | Could | Done | "Suggest songs" card on the setlist: adds N (1 to 50, default 10) never-sung, non-Retired songs to the end, round-robin across genres then decades, in random order. e2e: "R45: suggests never-sung songs spread across genres and decades", "R45: says so when fewer songs are left than asked for" |
| R17 | Tonight mode: check off songs as I sing them, which logs them | Could | Superseded | Built in Wave 4, then replaced by List mode on the Songs tab (R49) on 2026-11-12: "Sang it" logs the sing and takes the song off the set, and Sung mode (R50) has Undo |

## Data

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R18 | Keep all data on the device in IndexedDB; no account, no server | Must | Done | e2e: "R18: data survives a reload" |
| R19 | Ask the browser for persistent storage | Must | Done | `navigator.storage.persist()`; lowers the risk of Safari clearing data. e2e: "R19: asks for persistent storage at startup" |
| R20 | Export a full backup as one JSON file | Must | Done | Songs, tags, venues, setlists and sing log. e2e: "R20: downloads a JSON backup containing all songs". Download inside the installed iPhone app needs a check on the phone |
| R21 | Restore from a JSON backup | Must | Done | Confirm before replacing existing data. e2e: "R21: restores a backup after confirming" and "R21: leaves data alone when the restore confirmation is dismissed" |
| R22 | Import songs from a CSV file | Must | Done | Title and artist required; genre, year, key and tags optional. The fastest way to load 500+ songs. e2e: "R22: imports a CSV of songs". Semicolon-separated CSVs are not detected |
| R46 | CSV import logs sings: a venue column logs one sing per row, dated by a date column or the import day | Should | Done | Venues are created as needed; sings are logged for songs already in the library too; a sing already logged (same song, venue, date) is skipped. Dates: YYYY-MM-DD, YYYY-MM, YYYY or M/D/YYYY. e2e: "R46: a venue column logs a sing per row, dated by the date column or today", "R46: an unreadable date skips the sing but keeps the song" |
| R65 | Point out, at both ends, that data entered in Safari on an iPhone does not follow the app to the Home Screen | Must | Done | In Safari with songs: a banner with "Move my data" (opens the Backup card) and Later (a week). In the installed app with an empty library: a "Starting fresh?" card with "Restore a backup". Nothing can copy between the two stores. e2e: "R65: in Safari on an iPhone with songs, a banner points at Share backup; Later hides it for a week", "R65: the installed app shows no banner, and an empty library offers to restore a backup" |
| R62 | Share a backup through the share sheet, and check a backup file without restoring it | Must | Done | A download from an installed iPhone app may silently do nothing, so "Share backup" (shown where the browser can share files) hands the file to Save to Files, AirDrop or Mail and counts as a backup only when the sheet reports success. "Check a backup file" reads a file and reports what it holds and how it compares with the phone. e2e: "R62: Share backup hands the file to the share sheet and counts as a backup only when it goes through", "R62: a cancelled share is not counted as a backup", "R62: without a share sheet only Download backup shows", "R62: Check a backup file reports what it holds and compares it with the phone, without restoring" |
| R23 | Export songs as a CSV file | Should | Done | Settings → "Download songs as CSV": title, artist, genre, year, key, tags, status, rating, notes; imports back as duplicates only. e2e: "R23: downloads a CSV of all songs that imports back without duplicates" |
| R24 | Print-friendly song list and setlist | Should | Done | Print stylesheet only; print from the browser's share or print menu. Hides tabs, forms and buttons; black on white. e2e: "R24: prints the song list without the tabs and forms", "R24: prints a setlist's songs", "R24: prints a venue's history with every date" |
| R25 | Remind me to back up when the last export is over 30 days old | Could | Done | Banner above the tabs at startup once there are songs and no backup in 30 days; "Back up now" opens Settings, "Later" hides it for a week. The download records `lastBackupAt` in the meta store. e2e: "R25: reminds once there are songs and no backup, and goes quiet after a backup", "R25: reminds when the last backup is over 30 days old, and Later hides it for a week" |

## PWA

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R26 | Web app manifest so it installs to the home screen | Must | Done | Name, icons, standalone display, theme color. e2e: "R26: has an installable web app manifest"; real install only checkable on a phone |
| R27 | Service worker caches the app so it works fully offline | Must | Done | e2e: "R27: loads offline after the service worker is installed" |
| R28 | Served over HTTPS from a static host | Must | Done | Live at https://micjaunt.app on GitHub Pages from `main`, HTTPS enforced, since 2026-11-12. Steps in README "Deploy" |
| R29 | iPhone home-screen icon and status-bar settings | Should | Done | apple-touch-icon (180 px) and the apple-mobile-web-app meta tags in index.html. e2e: "R29: has iPhone home-screen icon and status-bar meta tags" |
| R30 | Detect a new version and offer to reload | Should | Done | When a new service worker takes control, a banner above the tabs offers Reload or Later; the app also checks for updates when it returns to the foreground. e2e: "R30: offers to reload when a new version is installed" |

## UX

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R31 | Mobile-first layout, usable one-handed | Must | Done | Bottom tabs, actions at the bottom of detail screens, every control at least 44 px. Detail screens add a history entry so the back gesture returns to the list instead of leaving the app. e2e: "R31: every control on every screen is at least 44 px tall and wide", "R31: the back gesture returns from a song and its edit form instead of leaving the app", "R31: the back gesture returns from a venue, overall and a setlist to their lists", "R31: the in-page Back button keeps the history in step with the screens". One-hand feel needs a check on the phone |
| R38 | Web search for a song (to listen to outside the venue) | Should | Done | "Search video" on the song screen opens a YouTube search for "title artist" in a new tab. Nothing is fetched or saved; needs a connection. e2e: "R38: a song has a video search link for its title and artist" |
| R32 | Dark theme by default, with a light option | Should | Done | Settings → Appearance: Dark (default), Light, or Match the phone. Saved on the device; applied before the first paint. e2e: "R32: is dark by default and a light option survives a reload", "R32: \"Match the phone\" follows the phone's setting" |
| R33 | Works at desktop widths too | Should | Done | Content stays at a readable 720 px, centred; tabs stay together in the middle. e2e: "R33: works at a desktop width with readable line lengths and no sideways scroll" |
| R34 | Opens in under 2 seconds; search feels instant with 1,000 songs | Should | Done | The list draws 200 rows at a time with a "Show N more" button; rows are built once and reused. Measured in emulation: open in 0.7–1.3 s, each keystroke under 170 ms in the page. Needs a check on the phone. e2e: "R34: opens with 1,000 songs in under 2 seconds and searches instantly" |
| R63 | MusicBrainz suggestions match word prefixes, narrow by the artist as typed, and fill the year and genre too | Must | Done | 25 recordings are fetched so the earliest release year wins over compilations; one extra request on tap gets the artist's genres, the top one filled in and up to three offered as chips. Typed values are never overwritten. e2e: "R63: a tapped suggestion fills the earliest release year and the artist's top genre, with the others as chips", "R63: typing in Artist narrows the search, and typed genre and year are never overwritten" |
| R35 | Suggest title and artist from MusicBrainz when online | Should | Done | Free API, no key; the only network call in the app. After 3 characters of title, 400 ms after the last keystroke, up to 5 suggestions; a Settings switch turns it off. Tests never reach the real site. e2e: "R35: suggests titles and artists from MusicBrainz and fills the form on tap", "R35: makes no request when online suggestions are off", "R35: shows nothing when MusicBrainz fails" |

## Night out (v2 of the Songs tab)

Added 2026-11-12 after using v1. The Songs tab's job is finding the next song to sing and working a list through the night; adding songs is occasional.

| ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| R47 | The Songs tab starts with the venue and the current set, pinned at the top; there is always a set open | Must | Done | A Set menu lists the venue's setlists and "New list for tonight…" (named like "Fri 14 Nov"). The first visit to a venue opens the first list labelled for it, then any-venue lists, else creates one named after it; the choice is remembered per venue and under Overall (R56). e2e: "R47: picking a venue opens its list, creating one on first visit, and remembers it", "R47: New list for tonight creates a dated list and selects it" |
| R48 | Find mode: search, filters and the song list, with one tap to add a song to the current set | Must | Done | Each row has a + that becomes ✓ when the song is in the set (tap again to remove). "Add a song" sits at the bottom of the list; a search that matches nothing offers "Add “xyz”" with the title prefilled. e2e: "R48: + adds a song to the set from Find mode and ✓ removes it", "R48: Add a song sits at the bottom and a search with no match offers to add it" |
| R49 | List mode: the current set in order, with move up/down, "Sang it" and "Next time" | Must | Done | "Sang it" logs a sing at the venue today and removes the song from the set. "Next time" moves it to the venue's Next time list, an ordinary setlist created on first use (rename it on the Setlists tab; the link survives). Setlist names are unique, so a second venue's list is "Next time (2)". e2e: "R49: Sang it logs a sing today and removes the song from the set", "R49: Next time moves the song to the venue's Next time list, which can be renamed", "R49: moves songs up and down in List mode" |
| R50 | Sung mode: what I have sung at this venue, newest first, grouped by date, with Undo for today | Must | Done | Undo deletes the sing and puts the song back at the top of the set. e2e: "R50: Sung mode lists sings newest first by date and Undo puts the song back on top" |

| R51 | High-contrast palette: dark background with a green accent instead of pink | Must | Done | Green #13b86a reads at about 7:1 on the background (pink was 6:1); text is a warm off-white. No e2e test; checked in screenshots |
| R55 | Choose the accent colour in Settings: green (default), amber, lime or pink | Must | Done | Saved on the device, applied before the first paint; each has a deeper partner for the light theme. e2e: "R55: the accent colour can be changed in Settings and survives a reload" |
| R52 | With a sung filter on, hide the "never sung here" line so more songs fit per screen | Must | Done | Lines with a date stay. e2e: "R52: a sung filter hides the \"never sung here\" lines, and clearing it brings them back" |
| R53 | Filters and sort persist across tabs and reloads; the search persists across tabs | Must | Done | Saved on the device; Clear filters resets. Adding a song clears the search but keeps the filters. e2e: "R53: filters survive another tab and a reload; the search survives the tab but not the reload" |
| R54 | Show the song full screen to the KJ: title, artist and key in the biggest type that fits, portrait or landscape | Must | Done | Tap the song in List mode, or "Show to the KJ" on the song screen. Header, tabs and banners hide; Close or the back gesture returns. e2e: "R54: tapping a song in List mode shows it full screen for the KJ, portrait and landscape" |

| R56 | A setlist's venue is a label, not a binding: any setlist can be opened at any venue; "For Viking" or blank for anywhere | Must | Done | The Set menu lists every setlist in groups: for this venue, any venue, other venues ("Name · Venue"). The remembered set per venue stays; with nothing remembered, the first list labelled for the venue, then the first for any venue, else one named after the venue. Under Overall the menu shows too; + and List (with Remove) work, "Sang it", "Next time" and Sung stay off; with no setlists at all Overall offers an unsaved "My list" that the first + creates. Deleting a venue clears the label and the venue's set memory instead of being blocked. Setlists tab wording: "For venue (optional)", blank = "Any venue". Supersedes R39. e2e: "R56: the Set menu offers every setlist, grouped for this venue, any venue and other venues", "R56: a list labelled for one venue can be opened and sung at another", "R56: under Overall a list can be built and ordered but not sung", "R56: deleting a venue clears the label on its setlists instead of being blocked", "R56: a setlist is labelled for a venue or any venue, and the label can be changed" |
| R57 | "Find songs" on a setlist opens the Songs tab with that set at the current venue; the setlist screen's Add songs picker goes | Must | Done | The button hides while the empty state shows its own. Suggest songs and Mix stay on the setlist screen. e2e: "R57: Find songs on a setlist opens the Songs tab with that set at the current venue" |
| R58 | Drop the title bar; the bottom tabs carry the selection, with the selected tab larger and filled with the accent | Must | Done | The page title stays as a visually hidden h1 for screen readers and prints at the top of a printout. A background strip sits under the see-through status bar on a notched phone; needs a look on the iPhone. e2e: "R58: there is no title bar; the selected tab is filled with the accent and larger" |
| R59 | Merge a setlist into another: pick any other setlist; every song not already there is appended to its end; the source is left empty | Must | Done | "Merge into…" on the setlist screen; confirms with the counts, including how many are already there; ids of deleted songs are dropped. The remembered-set and Next time roles are not affected. e2e: "R59: merging moves every song not already there to the end of the other list and empties the source" |

| R60 | The Setlists tab holds its place: coming back within a few minutes reopens the setlist I was on; later it starts at the list | Must | Done | Five minutes. The back gesture still reaches the list, and leaving through "All setlists" means the tab starts at the list next time. e2e: "R60: coming back to the Setlists tab within minutes reopens the setlist; later it starts at the list" |
| R61 | List mode on the Songs tab has the same drag handle as the setlist screen | Must | Done | One shared drag module (js/drag.js); arrow keys on the handle move the song too. e2e: "R61: List mode has a drag handle that reorders the set, like the setlist screen" |

R17 Tonight mode on the Setlists tab is superseded by R49 and is removed when R49 lands. R45 Suggest songs and R44 Mix stay on the Setlists tab, which is for building and tidying lists.

## Out of scope

| ID | Item | Notes |
|---|---|---|
| X1 | Friends, sharing and any social features | |
| X2 | Accounts, login and cloud sync between devices | Backup file covers moving to a new phone |
| X3 | Payments or a paywall | |
| X4 | Lyrics, backing tracks or audio playback | Licensing |
| X5 | App Store or Google Play listing | |
