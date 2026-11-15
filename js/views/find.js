// The Songs scope (Design B): my songs, searched from the dock's field (R10)
// and narrowed by the Filters panel, a sheet the dock's filter button opens:
// sings at the venue chosen on Tonight (R41), tag, status and rating (R11),
// genre and decade (R42), in KaraFun or not (R68), and the R42 and R12 sort
// orders. The filters on show as tokens above the list, each removed with
// its ×, with "Clear all" (R69); filters and sort persist across scopes and
// reloads, the search across scopes (R53). The count line says how many
// songs match, with Pick one (R13) and the sort.
// Each row: title, artist, genre and year, the sings at the venue (R37, R8;
// hidden under a sung filter, R52), the KaraFun mark (R68), and + / ✓ for
// tonight's set (R48, under Overall too, R56). A tap on the row opens the
// song page (js/views/song.js). Stays quick with 1,000 songs (R34): rows are
// built once and at most PAGE_SIZE are drawn at a time.
// Once a KaraFun catalog is loaded, a "My songs | KaraFun" switch searches
// the catalog instead, with its own filters; each catalog row adds the song
// to my songs or straight into the set (R67).
// "Add a song" at the end of the list, and "Add “xyz”" under a search that
// found nothing, open the add form as a sheet (js/views/songs.js).
import { db, CATALOG_STORE } from '../db.js';
import {
  el, viewEl, openScreen, closeScreen, screenTicket, screenStillShowing, renderingBack, icon, ICONS,
} from '../ui.js';
import * as dock from '../dock.js';
import {
  makeSong, SONG_STATUSES, STATUS_LABELS, NO_STATUS_LABEL, normalizeRating,
} from '../lib/song.js';
import { pickRandom } from '../lib/pick.js';
import { singStats, sortVenues, plural, todayLocalISO } from '../lib/stats.js';
import { filterSongs } from '../lib/search.js';
import {
  SUNG_ANY, SUNG_NEVER, SUNG_NOT_SINCE, SORT_MENU, MIN_RATING_OPTIONS, defaultFilters, decadeOf, decadeLabel,
  filterChoices, sungOptions, countActiveFilters, applyFind, titleOrder, sungFilterActive, NO_STATUS_FILTER,
  KARAFUN_FILTER_OPTIONS, KARAFUN_IN, KARAFUN_OUT,
} from '../lib/find.js';
import {
  CATALOG_SORT_MENU, CATALOG_DUET_OPTIONS, CATALOG_EXPLICIT_OPTIONS, defaultCatalogFilters, countCatalogFilters,
  catalogMayList, formatCount, prepareCatalog, catalogChoices, catalogSearcher, rowStyles, songFromCatalog,
  libraryIndex, librarySongFor,
} from '../lib/catalog.js';
import { addSongId, removeSongId, setlistSongs } from '../lib/setlist.js';
import { currentSetlistKey, OVERALL_LIST_NAME } from '../lib/night.js';
import {
  VENUE_KEY, openCurrentSet, startList, goToBackup, renderAddSong,
} from './songs.js';
import { openSongScreen } from './song.js';
import { hereShort, shortDate } from './tonight.js';

// How many rows the list draws at first, and adds with each "Show more" (R34).
// The count line always gives the full number that match.
const PAGE_SIZE = 200;

// Icons drawn here: a token's ×, the sort token's arrows, Pick one's die.
const CLOSE_ICON = ['M6 6l12 12M18 6L6 18'];
const SORT_ICON = ['M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4'];
const DIE_ICON = ['M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z',
  'M9 9h.01M15 9h.01M9 15h.01M15 15h.01'];

// Bumped on every Songs screen, so a slow load never paints over a newer one.
let screen = 0;

// True while a load started with `token` and screen `ticket` should still be
// shown: no newer Songs screen has started and no other screen has been drawn.
function stillCurrent(token, ticket) {
  return token === screen && screenStillShowing(ticket);
}

const fold = (text) => String(text ?? '').trim().toLowerCase();

// A <select> with [value, text] options, showing `value`.
function fillSelect(select, options, value) {
  select.replaceChildren(...options.map(([optionValue, text]) => el('option', { value: optionValue, text })));
  select.value = value;
  return select;
}

// A filter control with its label beside it rather than around it, so the
// control's name is just the label, not the label plus every option's text.
// The catalog's controls (R67) take the prefix 'catalog'.
function findField(labelText, control, prefix = 'find') {
  control.id = `${prefix}-${control.name}`;
  return el('div', { class: 'find-field' }, el('label', { for: control.id, text: labelText }), control);
}

// Makes `items` the children of `parent`, in order. Rows that stay are left
// where they are, so the browser keeps their style and layout and only the
// rows that come or go cost anything as the search narrows or widens (R34).
function setChildren(parent, items) {
  const keep = new Set(items);
  for (const child of [...parent.children]) {
    if (!keep.has(child)) child.remove();
  }
  let next = parent.firstChild;
  for (const item of items) {
    if (item === next) next = next.nextSibling;
    else parent.insertBefore(item, next);
  }
}

// Small marks after a catalog row's details: "Duet" and "Explicit" (R67).
// False labels are skipped. Each follows a space: "Queen & David Bowie · 1981 · Rock Duet".
function marks(...labels) {
  return labels.filter(Boolean).flatMap((label) => [' ', el('span', { class: `mark mark-${label.toLowerCase()}`, text: label })]);
}

// The filters and sort the owner last used, kept across scopes and reloads (R53).
const FILTERS_KEY = 'findFilters';

function loadSavedFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || 'null');
    return saved && typeof saved === 'object' ? { ...defaultFilters(), ...saved } : defaultFilters();
  } catch {
    return defaultFilters();
  }
}

function saveFilters(filters) {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // Storage blocked: the filters last for this visit only.
  }
}

// The search text, kept while the app is open so another scope and back
// does not lose it (R53). A reload starts with an empty search. My songs and
// the KaraFun catalog share it, so a song not in my songs can be looked up in
// the catalog with one tap.
let rememberedQuery = '';

// ---------- The KaraFun catalog in Songs (R67) ----------

// What Songs searches: my songs, or the KaraFun catalog once one is loaded.
// Kept while the app is open; a reload starts with my songs.
const SOURCES = [['mine', 'My songs'], ['karafun', 'KaraFun']];
let source = 'mine';

// The catalog filters and sort, kept apart from my songs' (R53 style).
const CATALOG_FILTERS_KEY = 'catalogFilters';

function loadSavedCatalogFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(CATALOG_FILTERS_KEY) || 'null');
    return saved && typeof saved === 'object' ? { ...defaultCatalogFilters(), ...saved } : defaultCatalogFilters();
  } catch {
    return defaultCatalogFilters();
  }
}

function saveCatalogFilters(filters) {
  try {
    localStorage.setItem(CATALOG_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // Storage blocked: the filters last for this visit only.
  }
}

// Settings writes this meta record last after loading or replacing the
// catalog (R66), so a different value means the copy in memory is stale.
const CATALOG_LOADED_KEY = 'karafunLoadedAt';

// The catalog in memory: read with one getAll the first time the KaraFun
// source shows, prepared once (about 100,000 rows), and kept until the
// catalog is replaced or removed. { loadedAt, prepared, search }.
let catalog = null;
let catalogLoading = null; // { loadedAt, promise } while a read is under way

// Called on every render of the Songs scope with what is stored now.
function forgetStaleCatalog(hasCatalog, loadedAt) {
  if (!hasCatalog) {
    catalog = null;
    catalogLoading = null;
    source = 'mine';
  } else if (catalog && catalog.loadedAt !== loadedAt) {
    catalog = null;
  }
}

// Resolves with the catalog in memory for `loadedAt`, reading it first if
// need be. Quick taps share one read.
function loadCatalog(loadedAt) {
  if (catalog && catalog.loadedAt === loadedAt) return Promise.resolve(catalog);
  if (!catalogLoading || catalogLoading.loadedAt !== loadedAt) {
    const loading = { loadedAt, promise: null };
    loading.promise = db.getAll(CATALOG_STORE).then((rows) => {
      const prepared = prepareCatalog(rows);
      const made = { loadedAt, prepared, search: catalogSearcher(prepared) };
      if (catalogLoading === loading) {
        catalog = made;
        catalogLoading = null;
      }
      return made;
    }, (err) => {
      if (catalogLoading === loading) catalogLoading = null;
      throw err;
    });
    catalogLoading = loading;
  }
  return catalogLoading.promise;
}

// Tonight's catalog line and its "add as a new song" line: the Songs scope
// with `query` in the search, searching the KaraFun catalog when `inCatalog`.
export function findInSongs(query, { catalog: inCatalog = false } = {}) {
  rememberedQuery = query;
  if (inCatalog) source = 'karafun'; // falls back to my songs when no catalog is loaded
  dock.scope('songs');
}

// The Songs screen whose Filters sheet is open, so going back (the back
// gesture or Done) closes the sheet where it is rather than drawing the list again.
let liveSheet = null;

// The Songs scope. Coming back from a song or the add form passes back what
// the screen showed, so it is restored: the search (`query`) and the filters
// and sort (`filters`); also the song to scroll to (`focusId`) and an optional
// status line (`message`). The venue and the set come from meta, so they come
// back too. `sheet` draws it with the Filters sheet open.
export async function renderSongs({
  query, filters, sheet = false, focusId = null, message = '',
} = {}) {
  if (renderingBack() && liveSheet && liveSheet.showing()) {
    liveSheet.close();
    return;
  }
  const token = ++screen;
  const ticket = screenTicket();
  // Nothing passed means "as the owner left it": saved filters, remembered search (R53).
  if (query === undefined) query = rememberedQuery;
  if (filters === undefined) filters = loadSavedFilters();
  const [songRecords, venueRecords, singRecords, setlistRecords, metaRecords, catalogCount] = await Promise.all([
    db.getAll('songs'),
    db.getAll('venues'),
    db.getAll('sings'),
    db.getAll('setlists'),
    db.getAll('meta'),
    db.count(CATALOG_STORE),
  ]);
  if (!stillCurrent(token, ticket)) return;
  // Songs added from the KaraFun catalog join these while the screen is up (R67).
  let songs = titleOrder(songRecords);
  const songsById = new Map(songs.map((s) => [s.id, s]));
  let library = libraryIndex(songs); // which catalog rows are in my songs
  const venues = sortVenues(venueRecords);
  const meta = new Map(metaRecords.map((r) => [r.key, r.value])); // kept in step with what is saved
  // A catalog is loaded when its store has rows (R66); the switch shows only then (R67).
  const hasCatalog = catalogCount > 0;
  const catalogLoadedAt = meta.get(CATALOG_LOADED_KEY) ?? null;
  forgetStaleCatalog(hasCatalog, catalogLoadedAt);
  // A remembered venue that has since been deleted falls back to Overall.
  const wanted = meta.has(VENUE_KEY) ? meta.get(VENUE_KEY) : null;
  const state = {
    query,
    venueId: venues.some((v) => v.id === wanted) ? wanted : null,
    filters: { ...defaultFilters(), ...filters },
    catalogFilters: loadSavedCatalogFilters(), // the KaraFun source's own (R67)
    set: null, // tonight's set at the venue or under Overall (R47, R56); id null while Overall's is unsaved
  };
  rememberedQuery = state.query;
  const currentVenue = () => venues.find((v) => v.id === state.venueId) || null;
  let setlists = setlistRecords;
  {
    const opened = await openCurrentSet(currentVenue(), setlists, meta);
    if (!stillCurrent(token, ticket)) return;
    ({ set: state.set, setlists } = opened);
    if (state.set.id != null) meta.set(currentSetlistKey(state.venueId), state.set.id);
  }
  let inSet = new Set(state.set.songIds);
  const stats = singStats(singRecords, state.venueId);
  const atVenue = state.venueId != null;
  const today = todayLocalISO();

  // The way back to this screen as it is now, for the song page and the add form (R31).
  const songsBack = () => {
    const saved = { query: state.query, filters: { ...state.filters } };
    return { label: 'Back to Songs', render: (extra = {}) => renderSongs({ ...saved, ...extra }) };
  };

  function openSong(songId) {
    openSongScreen(songId, songsBack());
  }

  // The add form as a sheet (R1), with `title` filled in from a search that found nothing.
  function openAdd(title = '') {
    const back = songsBack();
    openScreen(() => renderAddSong({ title, done: back.render, open: (id) => openSongScreen(id, back) }));
  }

  // The line at the top that says what a tap did, or why it failed.
  const status = el('p', { class: 'notice night-status', role: 'status', text: message });
  const say = (text) => { status.textContent = text; };

  // A save that failed leaves the screen out of step, so it is drawn again from what is stored.
  function failed(err) {
    renderSongs({ query: state.query, filters: state.filters, message: `Could not save: ${err.message}` });
  }

  // "38 of 412 songs": the number large.
  const countBig = el('span', { class: 'count-big' });
  const countRest = document.createTextNode('');
  const count = el('p', { class: 'count' }, countBig, countRest);
  function setCount(big, rest) {
    countBig.textContent = big;
    countRest.data = rest;
  }

  const list = el('ul', { class: 'list song-list', 'aria-label': 'Songs' });

  // Pick one (R13): one of the songs the count line reports, at random,
  // opened the way its row would open it.
  const pickButton = el('button', {
    type: 'button', class: 'btn pick', 'aria-label': 'Pick one of these at random',
    onclick: () => {
      const song = pickRandom(shown);
      if (song) openSong(song.id);
    },
  }, icon(DIE_ICON, { size: 20, width: 2 }), 'Pick one');
  const pickNote = el('p', { class: 'muted pick-note', text: 'Nothing to pick from.', hidden: '' });

  // What the search, filters and sort give (`shown`: songs, or catalog rows
  // in the KaraFun source), how many of those rows are drawn (`limit`), and
  // each song's row, built the first time it is drawn and reused.
  // Each row has a + that adds the song to the set (R48, under Overall too,
  // R56); those are kept by song id so they follow the set as it changes.
  let shown = [];
  let limit = PAGE_SIZE;
  const rows = new Map();
  const toggles = new Map();

  function rowFor(s) {
    if (source === 'karafun') return catalogItemFor(s);
    let item = rows.get(s.id);
    if (!item) {
      item = songItem(s);
      rows.set(s.id, item);
    }
    return item;
  }

  const moreButton = el('button', {
    type: 'button', class: 'btn more', hidden: '',
    onclick: () => {
      const added = shown.slice(limit, limit + PAGE_SIZE).map(rowFor);
      limit += PAGE_SIZE;
      list.append(...added);
      showMoreButton();
      // Focus moves to the first new row, where the button was.
      added[0]?.querySelector('button')?.focus({ preventScroll: true });
    },
  });

  function showMoreButton() {
    const left = shown.length - limit;
    moreButton.hidden = left <= 0;
    moreButton.textContent = left > 0 ? `Show ${Math.min(left, PAGE_SIZE)} more` : '';
  }

  // A row: the title; artist, genre and year; at the right, the sings at the
  // venue ("2× · 17 Oct", or "New here" with the class `never`, hidden while a
  // sung filter says so for every row, R52) and the KaraFun mark (R68); then the +.
  function songItem(s) {
    const stat = stats.get(s.id);
    return el('li', { class: 'song-item', 'data-song-id': s.id },
      el('button', { type: 'button', class: 'song-row', onclick: () => openSong(s.id) },
        el('span', { class: 'row-text' },
          el('span', { class: 'title', text: s.title }),
          el('span', { class: 'sub', text: [s.artist, s.genre, s.year].filter(Boolean).join(' · ') })),
        el('span', { class: 'row-meta' },
          el('span', { class: stat ? 'sung' : 'sung never', text: hereShort(stat, atVenue, today) }),
          s.karafunId != null ? el('span', { class: 'mark mark-karafun', text: 'KaraFun' }) : null)),
      toggleFor(s));
  }

  // ---- KaraFun catalog rows (R67) ----

  // Each catalog row's parts, built the first time it is drawn:
  // { row, item, action, toggle }, by catalog id.
  const catalogItems = new Map();
  const adding = new Map(); // catalog id -> the song being added for it, so quick taps add it once

  function catalogItemFor(row) {
    let entry = catalogItems.get(row.id);
    if (!entry) {
      entry = catalogItem(row);
      catalogItems.set(row.id, entry);
    }
    drawCatalogItem(entry); // my songs or the set may have changed since it was drawn
    return entry.item;
  }

  // The title; artist, year, styles and the Duet and Explicit marks; "Add to
  // my songs", or "In my songs" once it is there; and the + that adds it to
  // the set. No sing line or status: those are for my songs.
  function catalogItem(row) {
    const details = [row.artist, row.year, ...rowStyles(row)].filter(Boolean).join(' · ');
    const entry = {
      row,
      action: el('div', { class: 'catalog-action' }),
      toggle: el('button', { type: 'button', class: 'btn set-toggle', onclick: () => catalogToggle(entry) }),
    };
    entry.item = el('li', { class: 'song-item catalog-item', 'data-karafun-id': row.id },
      el('div', { class: 'catalog-text' },
        el('span', { class: 'title', text: row.title }),
        el('span', { class: 'sub' }, details, ...marks(row.duet && 'Duet', row.explicit && 'Explicit')),
        entry.action),
      entry.toggle);
    return entry;
  }

  function drawCatalogItem(entry) {
    const song = librarySongFor(library, entry.row);
    const shows = song ? 'in' : 'out';
    if (entry.action.dataset.shows !== shows) {
      entry.action.dataset.shows = shows;
      entry.action.replaceChildren(song
        ? el('span', { class: 'in-library' }, el('span', { 'aria-hidden': 'true', text: '✓ ' }), 'In my songs')
        : el('button', {
          type: 'button', class: 'btn catalog-add', 'aria-label': `Add ${entry.row.title} to my songs`,
          onclick: () => addCatalogSong(entry),
        }, icon(ICONS.plus, { size: 14, width: 2.8 }), 'Add to my songs'));
    }
    // A row not in my songs cannot be in the set: a + that adds it.
    drawToggle(entry.toggle, song || { id: null, title: entry.row.title });
  }

  // The song in my songs for a catalog row, added first when it is not there:
  // title, artist, year, genre, the catalog id (R68) and a duet tag. It joins
  // this screen's songs at once, so My songs shows it.
  function catalogSong(row) {
    const known = librarySongFor(library, row);
    if (known) return Promise.resolve(known);
    if (!adding.has(row.id)) {
      const fields = makeSong(songFromCatalog(row));
      adding.set(row.id, db.add('songs', fields).then((id) => {
        const song = { id, ...fields };
        songs = titleOrder([...songs, song]);
        songsById.set(id, song);
        library = libraryIndex(songs);
        return song;
      }).finally(() => adding.delete(row.id)));
    }
    return adding.get(row.id);
  }

  async function addCatalogSong(entry) {
    let song;
    try {
      song = await catalogSong(entry.row);
    } catch (err) {
      failed(err);
      return;
    }
    if (!root.isConnected) return;
    drawCatalogItem(entry);
    say(`Added “${song.title}” to your songs.`);
  }

  // + on a catalog row: into my songs first when need be, then into the set;
  // ✓ takes it out of the set, as in my songs (R48).
  async function catalogToggle(entry) {
    if (adding.has(entry.row.id)) return; // the first tap is still adding it
    const isNew = !librarySongFor(library, entry.row);
    let song;
    try {
      song = await catalogSong(entry.row);
    } catch (err) {
      failed(err);
      return;
    }
    if (!root.isConnected) return;
    drawCatalogItem(entry);
    await toggleInSet(song);
    if (isNew) say(`Added “${song.title}” to your songs and the set.`);
  }

  // The KaraFun source: nothing until two characters or a filter, then the
  // matching catalog rows, 200 at a time as for my songs.
  const catalogHint = el('li', {
    class: 'muted catalog-hint',
    text: 'Type two or more letters, or choose a filter, to search the KaraFun catalog.',
  });
  const catalogLoadingItem = el('li', { class: 'muted catalog-hint', text: 'Loading the catalog…' });
  let catalogWait = null; // the read this screen waits on, so it draws once when the rows arrive

  // The catalog in memory, when it is the one stored now.
  const readyCatalog = () => (catalog && catalog.loadedAt === catalogLoadedAt ? catalog : null);

  function drawCatalog() {
    rememberedQuery = state.query;
    list.classList.remove('hide-never');
    const ready = readyCatalog();
    if (!ready) {
      shown = [];
      setCount('', '');
      setChildren(list, [catalogLoadingItem]);
      showMoreButton();
      syncDone();
      catalogWait ||= loadCatalog(catalogLoadedAt).then(() => {
        catalogWait = null;
        if (!root.isConnected) return;
        syncCatalogFilters(); // the menus' choices come from the rows
        if (source === 'karafun') draw();
      }, (err) => {
        catalogWait = null;
        if (root.isConnected && source === 'karafun') {
          setChildren(list, [el('li', { class: 'error', text: `Could not read the KaraFun catalog: ${err.message}` })]);
        }
      });
      return;
    }
    const f = state.catalogFilters;
    const total = formatCount(ready.prepared.size);
    if (!catalogMayList(f, state.query)) {
      shown = [];
      setCount(total, ' songs in the KaraFun catalog');
      setChildren(list, [catalogHint]);
      showMoreButton();
      syncDone();
      return;
    }
    shown = ready.search(f, state.query);
    setCount(formatCount(shown.length), ` of ${total} songs`);
    drawRows(PAGE_SIZE);
    syncDone();
  }

  // + adds the song to the end of the set; ✓ shows it is there, and takes it out (R48).
  function toggleFor(song) {
    const button = el('button', { type: 'button', class: 'btn set-toggle', onclick: () => toggleInSet(song) });
    toggles.set(song.id, button);
    drawToggle(button, song);
    return button;
  }

  function drawToggle(button, song) {
    const has = inSet.has(song.id);
    const label = has ? `Remove ${song.title} from the set` : `Add ${song.title} to the set`;
    if (button.getAttribute('aria-label') === label) return;
    button.textContent = has ? '✓' : '+';
    button.setAttribute('aria-label', label);
    button.classList.toggle('in-set', has);
  }

  async function toggleInSet(song) {
    if (state.set.id == null) {
      const venueId = state.venueId;
      if (!(await saveOverallList()) || state.venueId !== venueId) return;
    }
    const next = inSet.has(song.id) ? removeSongId(state.set, song.id) : addSongId(state.set, song.id);
    changeSet(next);
    try {
      await db.put('setlists', next);
    } catch (err) {
      failed(err);
    }
  }

  // Overall's unsaved "My list" is created by the first + (R56). Quick taps
  // share one creation. Resolves true once the set has an id.
  let savingOverall = null;
  function saveOverallList() {
    savingOverall ||= startList(null, OVERALL_LIST_NAME).then((made) => {
      if (state.venueId == null && state.set.id == null && root.isConnected) {
        setlists = made.setlists;
        chooseSet(made.set);
      }
      return state.set.id != null;
    }, (err) => {
      savingOverall = null;
      failed(err);
      return false;
    });
    return savingOverall;
  }

  // Where the list would be, when nothing in the library matches the search
  // (R48): add it as a new song; with a catalog loaded, search that (R67).
  const noMatchText = el('p', { class: 'muted' });
  const addFromSearchButton = el('button', {
    type: 'button', class: 'btn', onclick: () => openAdd(state.query.trim()),
  });
  const searchCatalogButton = hasCatalog
    ? el('button', {
      type: 'button', class: 'btn no-match-catalog', text: 'Search the KaraFun catalog',
      onclick: () => switchSource('karafun'),
    })
    : null;
  const noMatch = el('li', { class: 'no-match' }, noMatchText, addFromSearchButton, searchCatalogButton);

  // Runs the search, filters and sort again and draws the first page of rows.
  function draw() {
    if (source === 'karafun') {
      drawCatalog();
      return;
    }
    shown = applyFind(songs, stats, state.filters, state.query);
    rememberedQuery = state.query;
    // With a sung filter on, every row would say "New here": hide those lines (R52).
    list.classList.toggle('hide-never', sungFilterActive(state.filters));
    setCount(String(shown.length), ` of ${songs.length} songs`);
    pickButton.disabled = shown.length === 0;
    pickNote.hidden = shown.length > 0;
    drawRows(PAGE_SIZE);
    syncDone();
  }

  // Draws the first `n` rows of `shown`.
  function drawRows(n) {
    limit = n;
    const items = shown.slice(0, limit).map(rowFor);
    if (shown.length === 0) {
      const text = state.query.trim();
      if (source === 'karafun') {
        items.push(el('li', { class: 'muted', text: 'No KaraFun songs match the search and filters.' }));
      } else if (text && filterSongs(songs, text).length === 0) {
        noMatchText.textContent = `No match for “${text}”.`;
        addFromSearchButton.textContent = `Add “${text}”`;
        items.push(noMatch);
      } else if (songs.length === 0) {
        items.push(el('li', { class: 'muted', text: 'No songs yet. Add your first one below.' }));
        // A fresh install: the data from Safari does not come over by itself (R65).
        items.push(el('li', { class: 'card stack starting-fresh' },
          el('strong', { text: 'Starting fresh?' }),
          el('p', {
            class: 'muted',
            text: 'If you used Mic Jaunt in Safari before adding it to the Home Screen, your songs stayed in Safari. '
              + 'Back up there (Settings → Share backup → Save to Files), then restore here.',
          }),
          el('button', {
            type: 'button', class: 'btn', text: 'Restore a backup',
            onclick: () => goToBackup(),
          })));
      } else {
        items.push(el('li', { class: 'muted', text: 'No songs match the search and filters.' }));
      }
    }
    setChildren(list, items);
    showMoreButton();
  }

  // ---- Tonight's set (R47, R56), chosen on Tonight ----

  // Which venue and set the + works on: "The Crown · Friday · 2 songs".
  const context = el('p', { class: 'find-context' });

  function syncContext() {
    const venue = currentVenue();
    const n = setlistSongs(state.set, songsById).length;
    context.textContent = `${venue ? venue.name : 'Overall'} · ${state.set.name} · ${plural(n, 'song', 'songs')}`;
  }

  // Overall's list once its first song saved it (R56).
  function chooseSet(set) {
    state.set = set;
    inSet = new Set(set.songIds);
    meta.set(currentSetlistKey(state.venueId), set.id);
    syncSet();
  }

  // The current set with new contents, before it is saved.
  function changeSet(next) {
    state.set = next;
    setlists = setlists.map((s) => (s.id === next.id ? next : s));
    inSet = new Set(next.songIds);
    syncSet();
  }

  // What shows the set: the line at the top and every +, my songs' and the catalog's (R67).
  function syncSet() {
    syncContext();
    for (const [songId, button] of toggles) drawToggle(button, songsById.get(songId));
    for (const entry of catalogItems.values()) drawCatalogItem(entry);
  }

  // ---- The dock's field (R10) ----

  // The placeholder counts my songs: "Search 412 songs". The name stays
  // "Search songs" for either source.
  const placeholder = () => (source === 'karafun' ? 'Search the KaraFun catalog' : `Search ${plural(songs.length, 'song', 'songs')}`);
  let shownPlaceholder = null;
  function syncField() {
    if (shownPlaceholder === placeholder()) return;
    shownPlaceholder = placeholder();
    dock.search({
      placeholder: shownPlaceholder,
      label: 'Search songs',
      value: state.query,
      onInput: (value) => {
        if (!root.isConnected) return;
        state.query = value;
        draw();
        viewEl.scrollTop = 0; // the first matches sit at the top, in view above the keyboard
      },
      // Search on the keyboard puts it away; the list is already up to date.
      onSubmit: () => document.activeElement?.blur(),
    });
  }

  // ---- My songs' filters and sort (R41, R11, R42, R68), in the sheet ----

  const sungSelect = el('select', { name: 'sung' });
  const sinceInput = el('input', { type: 'date', name: 'since' });
  const sinceField = findField('Since', sinceInput);
  const tagSelect = el('select', { name: 'tag' });
  const statusSelect = el('select', { name: 'status' });
  const ratingSelect = el('select', { name: 'minRating' });
  const genreSelect = el('select', { name: 'genre' });
  const decadeSelect = el('select', { name: 'decade' });
  const karafunSelect = el('select', { name: 'karafun' }); // In KaraFun or not (R68)
  const karafunField = findField('KaraFun', karafunSelect);
  const sortSelect = el('select', { name: 'sort' });

  // Shows the state in every control: after a change, Clear filters or a removed token.
  function syncFilters() {
    const f = state.filters;
    const choices = filterChoices(songs, f);
    fillSelect(sungSelect, sungOptions(atVenue), f.sung);
    if (sinceInput.value !== f.since) sinceInput.value = f.since; // never disturb a date being typed
    sinceField.hidden = f.sung !== SUNG_NOT_SINCE;
    fillSelect(tagSelect, [['', 'Any tag'], ...choices.tags.map((t) => [t, t])], f.tag);
    fillSelect(statusSelect, [['', 'Any status'], ...SONG_STATUSES.map((s) => [s, STATUS_LABELS[s]]), [NO_STATUS_FILTER, NO_STATUS_LABEL]], f.status);
    fillSelect(ratingSelect, [['', 'Any rating'], ...MIN_RATING_OPTIONS.map(([r, text]) => [String(r), text])],
      f.minRating == null ? '' : String(f.minRating));
    fillSelect(genreSelect, [['', 'Any genre'], ...choices.genres.map((g) => [g, g])], f.genre);
    fillSelect(decadeSelect, [['', 'Any decade'], ...choices.decades.map((d) => [String(d), decadeLabel(d)])],
      f.decade == null ? '' : String(f.decade));
    fillSelect(karafunSelect, KARAFUN_FILTER_OPTIONS, f.karafun || '');
    // Shown when it can narrow anything: a catalog is loaded or a song carries a
    // KaraFun id; and while it is on, so a filter in use never hides (R68).
    karafunField.hidden = !(hasCatalog || f.karafun || songs.some((s) => s.karafunId != null));
    fillSelect(sortSelect, SORT_MENU, f.sort);
    syncChrome();
  }

  function setFilters(changes) {
    state.filters = { ...state.filters, ...changes };
    saveFilters(state.filters);
    syncFilters();
    draw();
  }

  const onChange = (node, read) => {
    const update = () => setFilters({ [node.name]: read(node.value) });
    node.addEventListener('change', update);
    if (node.tagName === 'INPUT') node.addEventListener('input', update);
  };
  const text = (value) => value;
  const numberOrNull = (value) => (value === '' ? null : Number(value));
  onChange(sungSelect, text);
  onChange(sinceInput, text);
  onChange(tagSelect, text);
  onChange(statusSelect, text);
  onChange(ratingSelect, numberOrNull);
  onChange(genreSelect, text);
  onChange(decadeSelect, numberOrNull);
  onChange(karafunSelect, text);
  onChange(sortSelect, text);

  // Clear filters, Clear all: every filter off and the sort back to Title, as before (R53, R69).
  function clearFilters() {
    if (source === 'karafun') {
      setCatalogFilters(defaultCatalogFilters());
      return;
    }
    state.filters = defaultFilters();
    saveFilters(state.filters);
    syncFilters();
    draw();
  }

  const filtersForm = el('form', { class: 'stack find-form', 'aria-label': 'Filters' },
    el('div', { class: 'row' }, findField('Sung', sungSelect), sinceField),
    el('div', { class: 'find-grid' },
      findField('Tag', tagSelect),
      findField('Status', statusSelect),
      findField('Rating', ratingSelect),
      findField('Genre', genreSelect),
      findField('Decade', decadeSelect),
      karafunField,
      findField('Sort by', sortSelect)),
    el('button', { type: 'button', class: 'btn', text: 'Clear filters', onclick: clearFilters }));
  filtersForm.addEventListener('submit', (e) => e.preventDefault());

  // ---- The catalog's filters and sort (R67), in the same sheet ----

  const catalogSelects = {
    genre: el('select', { name: 'genre' }),
    decade: el('select', { name: 'decade' }),
    duet: el('select', { name: 'duet' }),
    explicit: el('select', { name: 'explicit' }),
    language: el('select', { name: 'language' }),
    sort: el('select', { name: 'sort' }),
  };
  const NO_CHOICES = { genres: [], languages: [], decades: [] }; // until the rows are read

  function syncCatalogFilters() {
    const f = state.catalogFilters;
    const ready = readyCatalog();
    const choices = catalogChoices(ready ? ready.prepared : NO_CHOICES, f);
    const s = catalogSelects;
    fillSelect(s.genre, [['', 'Any genre'], ...choices.genres.map((g) => [g, g])], f.genre);
    fillSelect(s.decade, [['', 'Any decade'], ...choices.decades.map((d) => [String(d), decadeLabel(d)])],
      f.decade == null ? '' : String(f.decade));
    fillSelect(s.duet, CATALOG_DUET_OPTIONS, f.duet);
    fillSelect(s.explicit, CATALOG_EXPLICIT_OPTIONS, f.explicit);
    fillSelect(s.language, [['', 'Any language'], ...choices.languages.map((l) => [l, l])], f.language);
    fillSelect(s.sort, CATALOG_SORT_MENU, f.sort);
    syncChrome();
  }

  function setCatalogFilters(filters) {
    state.catalogFilters = filters;
    saveCatalogFilters(filters);
    syncCatalogFilters();
    draw();
  }

  for (const [key, select] of Object.entries(catalogSelects)) {
    select.addEventListener('change', () => setCatalogFilters({
      ...state.catalogFilters, [key]: key === 'decade' ? numberOrNull(select.value) : select.value,
    }));
  }

  const catalogForm = el('form', { class: 'stack find-form', 'aria-label': 'Filters' },
    el('div', { class: 'find-grid' },
      findField('Genre', catalogSelects.genre, 'catalog'),
      findField('Decade', catalogSelects.decade, 'catalog'),
      findField('Duet', catalogSelects.duet, 'catalog'),
      findField('Explicit', catalogSelects.explicit, 'catalog'),
      findField('Language', catalogSelects.language, 'catalog'),
      findField('Sort by', catalogSelects.sort, 'catalog')),
    el('button', { type: 'button', class: 'btn', text: 'Clear filters', onclick: clearFilters }));
  catalogForm.addEventListener('submit', (e) => e.preventDefault());

  // ---- The filters on, as tokens (R69), and the sort ----

  // My songs' filters on, each { label, spoken, clear }: what the token
  // says, what its × says to a screen reader, and the fields that turn it off.
  // One for each filter countActiveFilters() counts.
  function filterTokens() {
    const f = state.filters;
    const tokens = [];
    const add = (label, spoken, clear) => tokens.push({ label, spoken, clear });
    if (sungFilterActive(f)) {
      const label = f.sung === SUNG_NEVER
        ? (atVenue ? 'never here' : 'never sung')
        : `${atVenue ? 'not here' : 'not sung'} since ${shortDate(f.since, today)}`;
      add(label, label, { sung: SUNG_ANY, since: '' });
    }
    if (fold(f.tag)) add(f.tag, `tag ${f.tag}`, { tag: '' });
    if (SONG_STATUSES.includes(f.status) || f.status === NO_STATUS_FILTER) {
      const label = f.status === NO_STATUS_FILTER ? 'no status' : STATUS_LABELS[f.status];
      add(label, `status ${label}`, { status: '' });
    }
    const rating = normalizeRating(f.minRating);
    if (rating !== null) {
      const label = `rated ${rating === 5 ? '5' : `${rating}+`}`;
      add(label, label, { minRating: null });
    }
    if (fold(f.genre)) add(f.genre, `genre ${f.genre}`, { genre: '' });
    if (decadeOf(f.decade) !== null) add(decadeLabel(f.decade), decadeLabel(f.decade), { decade: null });
    if (f.karafun === KARAFUN_IN) add('in KaraFun', 'in KaraFun', { karafun: '' });
    if (f.karafun === KARAFUN_OUT) add('not in KaraFun', 'not in KaraFun', { karafun: '' });
    return tokens;
  }

  // The catalog's, likewise (countCatalogFilters()).
  function catalogTokens() {
    const f = state.catalogFilters;
    const tokens = [];
    const add = (label, spoken, clear) => tokens.push({ label, spoken, clear });
    if (fold(f.genre)) add(f.genre, `genre ${f.genre}`, { genre: '' });
    if (decadeOf(f.decade) !== null) add(decadeLabel(f.decade), decadeLabel(f.decade), { decade: null });
    if (f.duet === 'only') add('duets only', 'duets only', { duet: 'any' });
    if (f.duet === 'none') add('no duets', 'no duets', { duet: 'any' });
    if (f.explicit === 'hide') add('no explicit', 'no explicit', { explicit: 'any' });
    if (fold(f.language)) add(f.language, `language ${f.language}`, { language: '' });
    return tokens;
  }

  const filterState = el('p', { class: 'cap filter-state' });
  const clearAll = el('button', {
    type: 'button', class: 'clear-all', text: 'Clear all',
    onclick: () => {
      clearFilters();
      sortToken.focus({ preventScroll: true });
    },
  });
  const sortText = el('span', { class: 'sort-text' });
  const sortToken = el('button', { type: 'button', class: 'sort-token', onclick: () => openSheet() },
    icon(SORT_ICON, { size: 16, width: 2.2 }), sortText);
  const tokensBox = el('div', { class: 'tokens', role: 'group', 'aria-label': 'Filters on', hidden: '' });

  // A token's × turns that filter off; the focus moves to the next token, or the sort.
  function tokenButton(token, index) {
    return el('button', {
      type: 'button', class: 'token', 'aria-label': `Remove filter: ${token.spoken}`,
      onclick: (e) => {
        const hadFocus = document.activeElement === e.currentTarget;
        if (source === 'karafun') setCatalogFilters({ ...state.catalogFilters, ...token.clear });
        else setFilters(token.clear);
        if (!hadFocus) return;
        const next = tokensBox.hidden ? sortToken : tokensBox.children[index] || tokensBox.lastElementChild;
        next?.focus({ preventScroll: true });
      },
    }, el('span', { text: token.label }), icon(CLOSE_ICON, { size: 14, width: 2.8 }));
  }

  // Everything that says which filters are on: the tokens, "2 filters on"
  // with Clear all, the sort token, and the dock's filter button and badge.
  function syncChrome() {
    const karafun = source === 'karafun';
    const tokens = karafun ? catalogTokens() : filterTokens();
    const on = karafun ? countCatalogFilters(state.catalogFilters) : countActiveFilters(state.filters);
    filterState.textContent = on ? `${on} ${on === 1 ? 'filter' : 'filters'} on` : 'No filters';
    clearAll.hidden = on === 0;
    tokensBox.replaceChildren(...tokens.map(tokenButton));
    tokensBox.hidden = tokens.length === 0;
    const menu = karafun ? CATALOG_SORT_MENU : SORT_MENU;
    const sort = karafun ? state.catalogFilters.sort : state.filters.sort;
    const label = (menu.find(([value]) => value === sort) || menu[0])[1];
    sortText.textContent = label;
    sortToken.setAttribute('aria-label', `Sort: ${label}. Change sort`);
    dock.filters({ count: on, onOpen: openSheet });
  }

  // ---- The Filters sheet ----

  // Opened from the dock's filter button or the sort token, as a screen of
  // its own (R31: the back gesture closes it), drawn over this list, which
  // stays up to date underneath. Done says how many songs it shows.
  const sheetBody = el('div', { class: 'sheet-body' });
  const sheetDone = el('button', { type: 'button', class: 'btn primary sheet-done', onclick: () => closeScreen() });
  const sheetPanel = el('section', {
    class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'filters-head', tabindex: '-1',
    onkeydown: (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeScreen();
    },
  },
    el('h2', { id: 'filters-head', class: 'sheet-head', text: 'Filters' }),
    sheetBody,
    el('div', { class: 'sheet-foot' }, sheetDone));
  const sheetLayer = el('div', { class: 'sheet-layer', hidden: '' },
    el('div', { class: 'sheet-backdrop', onclick: () => closeScreen() }),
    sheetPanel);

  function syncDone() {
    const n = shown.length;
    sheetDone.textContent = n ? `Show ${formatCount(n)} ${n === 1 ? 'song' : 'songs'}` : 'Done';
  }

  // Covers the screen above the dock and banners, which stay usable.
  function placeSheet() {
    if (!sheetLayer.isConnected) {
      window.removeEventListener('resize', placeSheet);
      return;
    }
    const box = viewEl.getBoundingClientRect();
    sheetLayer.style.top = `${box.top}px`;
    sheetLayer.style.height = `${box.height}px`;
  }

  function showSheet() {
    sheetLayer.hidden = false;
    placeSheet();
    window.addEventListener('resize', placeSheet);
    sheetPanel.focus({ preventScroll: true });
  }

  function hideSheet() {
    const hadFocus = sheetLayer.contains(document.activeElement);
    sheetLayer.hidden = true;
    window.removeEventListener('resize', placeSheet);
    if (hadFocus) document.querySelector('#dock .dock-filter')?.focus({ preventScroll: true });
  }

  function openSheet() {
    if (!sheetLayer.hidden) return;
    openScreen(() => (root.isConnected
      ? showSheet()
      : renderSongs({ query: state.query, filters: state.filters, sheet: true })));
  }

  liveSheet = { showing: () => root.isConnected && !sheetLayer.hidden, close: hideSheet };

  // ---- What Songs searches: my songs or the KaraFun catalog (R67) ----

  const sourceButtons = new Map(SOURCES.map(([key, label]) => [key, el('button', {
    type: 'button', class: 'source', role: 'radio', text: label, onclick: () => switchSource(key),
  })]));
  const sourceSwitch = el('div', { class: 'source-switch', role: 'radiogroup', 'aria-label': 'Search in' },
    ...sourceButtons.values());
  // Arrow keys move between the two, as in any radio group.
  sourceSwitch.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!step) return;
    const keys = SOURCES.map(([key]) => key);
    const next = keys[(keys.indexOf(source) + step + keys.length) % keys.length];
    e.preventDefault();
    switchSource(next);
    sourceButtons.get(next).focus();
  });

  // Shows the source in the switch, the field and the sheet: the catalog has
  // its own filters, and no Pick one or Add a song (nor Starting fresh, which is a row).
  function syncSource() {
    const karafun = source === 'karafun';
    for (const [key, button] of sourceButtons) {
      button.setAttribute('aria-checked', String(key === source));
      button.tabIndex = key === source ? 0 : -1;
    }
    const form = karafun ? catalogForm : filtersForm;
    if (sheetBody.firstChild !== form) sheetBody.replaceChildren(form);
    pickButton.hidden = karafun;
    if (karafun) pickNote.hidden = true; // drawing my songs sets it again
    addButton.hidden = karafun;
    syncField();
    syncChrome();
  }

  function switchSource(key) {
    if (key === source || !hasCatalog) return;
    source = key;
    say('');
    syncSource();
    draw();
    viewEl.scrollTop = 0;
  }

  // Adding a song is occasional, so it waits at the end of the list (R48).
  const addButton = el('button', { type: 'button', class: 'btn add-open', onclick: () => openAdd() },
    icon(ICONS.plus, { size: 18 }), 'Add a song');

  // The My songs | KaraFun switch heads the scope once a catalog is loaded (R67).
  const root = el('div', { class: 'songs-view' },
    context,
    status,
    hasCatalog ? sourceSwitch : null,
    el('div', { class: 'pick-row' }, count, pickButton, pickNote),
    el('div', { class: 'filter-line' }, el('div', { class: 'filter-on' }, filterState, clearAll), sortToken),
    tokensBox,
    list,
    moreButton,
    addButton,
    sheetLayer);

  viewEl.replaceChildren(root);
  syncFilters();
  syncCatalogFilters();
  syncContext();
  syncSource();
  draw();
  if (sheet) showSheet();

  // Only my songs open a song page, so only they have a row to come back to.
  if (focusId != null && source !== 'karafun') {
    // Coming back from a song further down than the first page draws enough pages to reach it.
    const index = shown.findIndex((s) => s.id === focusId);
    if (index >= limit) drawRows(Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE);
    const row = list.querySelector(`[data-song-id="${focusId}"] .song-row`);
    if (row) {
      row.scrollIntoView({ block: 'center' });
      row.focus({ preventScroll: true });
    }
  }
}
