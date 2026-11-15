# Design B: the search field is the app

The redesign chosen on 2026-11-14 from three directions drawn from [USER-STORIES.md](USER-STORIES.md). The reference is the clickable prototype in [design/b-prototype.dc.html](design/b-prototype.dc.html) (open it on the design canvas to play it; the file is self-contained HTML and readable as a spec for spacing, type and colour) and the static screens `design/B1` to `B6`. This document says how the prototype maps onto the app, and the decisions taken where the prototype was silent or wrong. Every requirement in [REQUIREMENTS.md](REQUIREMENTS.md) still holds; only the interface changes. The data layer (`js/db.js`, `js/lib/`) does not change.

## The shell

One **dock** sits at the bottom of every scope, from the bottom up:

1. **Scope bar:** Tonight · Songs · Lists · History, plus a gear button at the right end for Settings. Replaces the Songs / Setlists / Venues / Settings tabs. The selected scope is an accent pill like today's selected tab.
2. **Search field** with a filter button beside it. The field belongs to the scope showing: Tonight "Add a song to tonight", Songs "Search N songs" (or "Search the KaraFun catalog"), Lists "Search lists" or "Search <list name>", History "Search <venue>'s history". The filter button opens the Filters panel as a sheet, shows a badge with the active count, and hides where no filters apply (Lists, History).
3. **A slot** above the field for Tonight's matches while typing. (Up next was docked here at first; on 2026-11-15 it moved to the head of the set in the page, so the set reads 01, 02, 03 from the top and the card sits where a thumb rests after unlocking the phone.)

Detail screens (a song, a list's songs, the KJ view, Settings, venues) stack on top with the existing `openScreen`/`closeScreen` history mechanism (R31), so the back gesture still returns within the app. The dock stays visible under detail screens except the KJ view, which takes the whole screen.

Shell API, in a new `js/dock.js`, so each scope's module owns its behaviour without touching the others:

- `dock.scope(name)` selects a scope and renders it; `dock.onScope(fn)` for the gear and for "Find songs" style jumps.
- `dock.search({ placeholder, value, onInput, onSubmit })` hands the field to the scope showing; the scope's remembered query is passed back as `value`. The field keeps focus across a scope's redraws.
- `dock.filters({ count, onOpen })` shows the filter button with its badge, `dock.filters(null)` hides it.
- `dock.slot(element | null)` sets the docked card above the field (Tonight's Up next).

Mobile Safari keyboard: the dock is `position: fixed` at the bottom; when the field has focus the matches render above it, scrolled so the first match is just above the card.

## Tonight

The home scope. Header: venue name with a menu (every venue, Overall, "Manage venues…"), the date, and the Set menu (lists grouped for this venue / any venue / other venues, "New list for tonight…").

**Tonight's set is designated, not merely shown** (decided 2026-11-15 after use, R75). Per venue (and for Overall) one setlist is *tonight's set*: the one Sang it, Park, the song page's Add to set and the Sung strip's Undo all work on, and the only one with an Up next. It is designated on the Lists scope ("Make this tonight's set" on a list's screen; the card and the screen say "Tonight's set" once it is), by "New list for tonight…", by "Use for tonight" (below), or automatically on a venue's first visit (first list labelled for it, else an any-venue list, else one named after the venue). The Set menu on Tonight only chooses which list is **shown**: tonight's set by default, or any other list as plain songs. Showing another list never changes the designation, so parking a song and then looking at the Next time list no longer makes its first song "Up next".

The list shown is the **working list**, shared with the Songs scope: the Set menu sets it, and so does "Find songs" on a list's screen (which opens Songs with that list and never designates it: the owner may be building another night's list while waiting to sing). It holds for the session, whatever scope is open, and returns to tonight's set on a reload, another venue or a new designation.

- **Showing tonight's set:** everything below as written.
- **Showing another list:** a line under the header, "Showing <name> · tonight's set is <name>", with a **Use for tonight** button that designates it; no Up next card and no Sung strip; every song as a numbered row from 01, with the drag handle (reordering this list), a `+` / `✓` that pulls the song into tonight's set (the owner's case: open Next time or a crowd-pleasers list and drop songs into tonight), and a swipe for **Remove** from this list (no Park: that is for tonight's set). Typing in the field adds to the list shown, and says so: the field reads "Add a song to <name>" and the matches' buttons "Add X to <name>". The Songs scope's + adds to it too.

- **Sung strip:** "SUNG · N  Ring of Fire, Ain't No S…  Undo last". Tap the strip to open tonight's sings grouped by date (R50) as a sheet with Undo per entry for today. Undo puts the song back on top of the set.
- **After that:** the rest of the set in order, each row: a drag handle at the far left (R61, away from where a thumb scrolls), position, title, artist, "N× · last date" or "NEW HERE" in monospace. Tap the title for Details. Swipe the row left for **Park** (to the venue's Next time list, R49) and **Remove**, which wait behind it and are still reachable by keyboard and screen reader; one row open at a time, a tap on it closes it. (Until 2026-11-15 a `…` button opened these as an inline row.) Park is not offered on Up next: the KJ already has that song.
- **Up next card**, at the head of the set, above After that: "UP NEXT · 01", key badge, title, artist with "HERE 2× · LAST 17 OCT", and two buttons: **Sang it** and **KJ**. Sang it is a plain button at rest and fills with the accent only while pressed. Sang it logs the sing at the venue today, removes the song from the set, and opens the **KJ view for the next song at once** (R74: one tap). Under Overall, Sang it is absent and the card shows KJ only.
- **Typing** in the field shows matches above the card: up to 8 rows with title, artist, "here" stats and a `+` that becomes `✓`; "Search the KaraFun catalog for “…”" under them when fewer than three match and a catalog is loaded, which jumps to Songs scope with the catalog source and the query. Clearing the field returns to the set. This replaces today's Find mode inside the Songs tab for the quick add; the full search with filters is the Songs scope.
- **Empty states:** no venue yet → the venue menu offers "Add a venue…"; empty set → "Nothing in tonight's set yet. Type a song above, or open Lists."

## KJ view (R54, R74)

Full screen, dock hidden. Portrait: a top strip "Folsom Prison Blues logged at The Crown · Undo" when reached through Sang it; "UP NEXT FOR THE KJ"; title and artist as large as fits; the key as a huge number with "two semitones down"; a Done button at the bottom. **Landscape (a CSS orientation query): only the title, artist and key, as large as fit; nothing else.** Rotating back restores the portrait view. Done, or the back gesture, returns to Tonight.

## Songs

Today's Find mode as its own scope, with the field in the dock.

- A **My songs / KaraFun** switch at the top when a catalog is loaded (R67).
- Count line "38 of 412 songs" with **Pick one** (R13) and a sort token.
- **Active filters as tokens** above the list, each with an × to remove, and "Clear all" (R69). The filter button opens the full Filters panel as a sheet, with the same menus as today (sung, since, tag, status, rating, genre, decade, KaraFun, sort) or the catalog's (genre, decade, duet, explicit, language, sort). Filters persist as today (R53).
- Rows: title, artist, genre · year, the "here" stats in monospace, a KaraFun mark (R68), and `+` / `✓` for tonight's set (R48). Tap a row to open the song page. 200 rows at a time with "Show N more" (R34).
- Catalog rows: title, artist, year, styles, Duet / Explicit marks, "Add to my songs" or "In my songs", and the same `+` (which also adds the song to my songs).
- **Add a song** at the end of the list and "Add “xyz”" under an empty result, opening the add form as a sheet (R1, R9, R35, R63, R64).

## Song page (R70)

Back · KJ. Title and artist in the KJ-sized header; key with a stepper (R6); status as three toggles (R7, R64); rating 1–5 (R4); notes; tags; "here" and "all venues" stats; KaraFun: Yes/No (R68); **On set / Add to set** toggle for tonight; Listen (R38), Edit (the full form, R2, R3, R36, R5) and Delete.

## Lists

- The lists: name, label ("For The Crown" / "Any venue"), song count, a genre line and a decade line (R44 in miniature), and "N of M in tonight's set" or "This is tonight's set". **New list** at the top (name and label, R14, R56). The field filters the lists.
- A list's songs: Back, header with the label and mix lines and, unless it is tonight's set, **Make this tonight's set** (R75); a one-line legend "✓ = in tonight's set", rows with `+` / `✓` for tonight's set (the owner's case: open "Crowd pleasers", drop two songs into tonight), "here" stats (R43), the drag handle at the far left (R16: held at the screen's top or bottom edge, a drag scrolls it, so long moves need no buttons), and a swipe left for **Remove**, as on Tonight. Actions on the list screen: Rename and label, Find songs (R57: Songs scope with this list as the working list, R75; it does not become tonight's set), Suggest songs (R45), Mix (R44), Merge into… (R59), Delete. The list reopens for five minutes when coming back to the scope (R60).

## History

- Venue chips: each venue, All venues (R8 overall). By song / By night. By song rows open to the individual sings with Delete (R72). The field searches the history.
- **Log a sing** button with the caption "Log a sing you forgot, or one from another night": the manual form (find the song by typing, date defaulting to today, R71).
- **Venues** button: add, rename, delete (R40).

## Settings

Reached from the gear in the scope bar. Same cards as today: Appearance (theme, accent), Online suggestions, Storage, Import songs, Export songs, Backup, KaraFun catalog, version. The move-to-Home-Screen banner, backup reminder and new-version banner render above the dock as today.

## Look

Taken from the prototype, not re-invented: blue-black ground (`#0C1015` page, `#151B22` and `#1C242D` surfaces, `#27313C` borders), sky accent `#6CC4FF`, light text `#E8EEF4` with muted `#9AA7B4`, monospace for data (dates, counts, keys, labels in small caps). **No web fonts:** the app makes no network calls except MusicBrainz, so IBM Plex is replaced by the system stack (`system-ui` for text, `ui-monospace, Menlo, monospace` for data). The sky accent joins the accent choices as the new default; green, amber, lime and pink stay (R55). Light theme keeps working with a deeper sky partner (R32). Contrast at least 4.5:1 (R51), controls at least 44 px (R31), desktop width centred at 720 px (R33), print rules kept (R24).

## Build order

Everything lands on the `redesign-b` branch, merged to `dev` only when the whole suite is green again. Steps 1 to 3 were built on 2026-11-14 (cache v32, app version 0.3.0); the phone check is the owner's. Where a worker's decision differed from the text above, the REQUIREMENTS Notes for the affected rows say what was built.

1. **Shell, palette and Tonight** (one worker): `js/dock.js`, `index.html`, `js/app.js`, `css/app.css` tokens and dock, Tonight scope from today's `songs.js` List/Sung/night-bar code, KJ view with the landscape rule, Settings behind the gear, the e2e helpers (`expectTab` → scopes) and the tests that touch Tonight. Lists and History wrap today's setlists and venues views for the moment.
2. **Songs scope and the song page** (second worker, in parallel): `js/views/find.js` from today's Find mode with tokens and the panel sheet, the song page, the add form as a sheet, and their tests.
3. **Lists and History** to the B design, and the sheet for tonight's sings.
4. Screenshots, phone check, cache bump, merge to dev.

Tests keep their requirement IDs and names; only their steps change. `docs/REQUIREMENTS.md` Notes are updated where a note described the old interface.
