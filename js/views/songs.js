// The Songs scope: today's Find, until it moves into the dock (Design B, step
// 2). The venue (R37) and tonight's set (R47, R56) are chosen on Tonight and
// remembered in meta; a line at the top says which.
//   Find (R48): search (R10), filters by sings, tag, status, rating, genre and
//     decade with times sung per song (R41, R11, R42, R8), the R42 and R12
//     sort orders, "Pick for me" (R13), a + on each row that adds the song to
//     tonight's set, and "Add a song" at the bottom (R1), with suggestions
//     from MusicBrainz (R35) and a warning about a song already there (R9).
//     Stays quick with 1,000 songs (R34): rows are built once and at most
//     PAGE_SIZE are drawn at a time. Songs the KaraFun catalog has carry a
//     KaraFun mark and can be filtered on (R68). Once a catalog is loaded, a
//     "My songs | KaraFun" switch searches the catalog instead, with its own
//     filters, and each catalog row adds the song to my songs or straight into
//     the set (R67).
// "Find songs" on a setlist (R57) opens this scope with that set as tonight's.
// One song's screen has the KJ button (R54), a video search link (R38), an
// edit form and delete (R2, R3, R36; the edit form also holds tags, key,
// status and rating). Tonight opens it too, for Details.
// The set helpers here (openCurrentSet, startList) are shared with Tonight.
import { db, request, CATALOG_STORE } from '../db.js';
import {
  el, viewEl, confirmAction, openScreen, closeScreen, screenTicket, screenStillShowing,
} from '../ui.js';
import * as dock from '../dock.js';
import {
  makeSong, updateSong, validateSong, planSongDelete, describeSongDelete, songKey,
  SONG_STATUSES, STATUS_LABELS, NO_STATUS_LABEL, RATINGS, statusLabel, formatRating, formatTags,
} from '../lib/song.js';
import { pickRandom } from '../lib/pick.js';
import { createSuggester, fetchArtistGenres } from '../musicbrainz.js';
import { singStats, sortVenues, plural } from '../lib/stats.js';
import { filterSongs } from '../lib/search.js';
import {
  SUNG_NOT_SINCE, SORT_MENU, MIN_RATING_OPTIONS, defaultFilters, decadeLabel, filterChoices, sungOptions,
  countActiveFilters, applyFind, sungParts, titleOrder, sungFilterActive, NO_STATUS_FILTER, KARAFUN_FILTER_OPTIONS,
} from '../lib/find.js';
import {
  CATALOG_SORT_MENU, CATALOG_DUET_OPTIONS, CATALOG_EXPLICIT_OPTIONS, defaultCatalogFilters, countCatalogFilters,
  catalogMayList, formatCount, prepareCatalog, catalogChoices, catalogSearcher, rowStyles, songFromCatalog,
  libraryIndex, librarySongFor,
} from '../lib/catalog.js';
import { makeSetlist, addSongId, removeSongId, setlistSongs } from '../lib/setlist.js';
import {
  currentSetlistKey, uniqueSetlistName, currentSetlistFor, OVERALL_LIST_NAME,
} from '../lib/night.js';
import { renderKj } from './kj.js';

// The meta record that remembers the venue across visits and reloads (R37).
// Tonight's venue menu sets it; the Songs scope reads it.
export const VENUE_KEY = 'findVenueId';

// Opens Settings at the Backup card (R65).
export function goToBackup() {
  dock.scope('settings');
  setTimeout(() => document.getElementById('backup-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
}

// How many rows the list draws at first, and adds with each "Show more" (R34).
// The count line always gives the full number that match.
const PAGE_SIZE = 200;

// Bumped on every Songs screen, so a slow load never paints over a newer one.
let screen = 0;

// True while a load started with `token` and screen `ticket` should still be
// shown: no newer Songs screen has started and no other screen has been drawn.
function stillCurrent(token, ticket) {
  return token === screen && screenStillShowing(ticket);
}

// ---------- Sets at a venue (R47, R56), each change in one transaction ----------

// Overall's list before anything is in it (R56): shown, but saved only when
// the first song goes in, so opening the app never creates a setlist.
const unsavedOverallList = () => ({ id: null, ...makeSetlist(OVERALL_LIST_NAME, null) });

// The current set at a venue, or under Overall when `venue` is null (R47,
// R56): the remembered one, whatever its label; else the first by name
// labelled for the venue, then the first for any venue (under Overall, the
// first for any venue, then the first of all); else at a venue a new one
// named after it, and under Overall an unsaved "My list". Read and written in
// one transaction, so two quick visits never create two. Resolves with
// { set, setlists }, where setlists is every setlist as stored afterwards.
// Skips the transaction when `setlists` and `meta` (key -> value) already
// hold the remembered set.
export function openCurrentSet(venue, setlists, meta) {
  const venueId = venue ? venue.id : null;
  const key = currentSetlistKey(venueId);
  const known = currentSetlistFor(setlists, venueId, meta.get(key));
  if (known && known.id === meta.get(key)) return Promise.resolve({ set: known, setlists });
  if (!venue && !known) return Promise.resolve({ set: unsavedOverallList(), setlists });
  return db.transaction(['setlists', 'meta'], 'readwrite', async (stores) => {
    const all = await request(stores.setlists.getAll());
    const saved = await request(stores.meta.get(key));
    let set = currentSetlistFor(all, venueId, saved ? saved.value : undefined);
    let stored = all;
    if (!set && !venue) return { set: unsavedOverallList(), setlists: all };
    if (!set) {
      const fresh = makeSetlist(uniqueSetlistName(venue.name, all), venue.id);
      set = { ...fresh, id: await request(stores.setlists.add(fresh)) };
      stored = [...all, set];
    }
    if (!saved || saved.value !== set.id) stores.meta.put({ key, value: set.id });
    return { set, setlists: stored };
  });
}

// A new list named `name`, made unique, which becomes the current set at the
// venue (labelled for it), or under Overall when `venue` is null (for any
// venue). "New list for tonight" (R47) names it for today; Overall's first
// list is "My list" (R56). Resolves with { set, setlists }.
export function startList(venue, name) {
  const venueId = venue ? venue.id : null;
  return db.transaction(['setlists', 'meta'], 'readwrite', async (stores) => {
    const all = await request(stores.setlists.getAll());
    const fresh = makeSetlist(uniqueSetlistName(name, all), venueId);
    const set = { ...fresh, id: await request(stores.setlists.add(fresh)) };
    stores.meta.put({ key: currentSetlistKey(venueId), value: set.id });
    return { set, setlists: [...all, set] };
  });
}

// "Find songs" on a setlist (R57): makes it tonight's set at the remembered
// venue (or under Overall), then shows the Songs scope. The venue stays as it is.
export async function showSetInFind(setlistId) {
  const [saved, venues] = await Promise.all([db.get('meta', VENUE_KEY), db.getAll('venues')]);
  const wanted = saved ? saved.value : null;
  const venueId = venues.some((v) => v.id === wanted) ? wanted : null; // a deleted venue means Overall
  await db.put('meta', { key: currentSetlistKey(venueId), value: setlistId });
  dock.scope('songs');
}

// Tonight's catalog line and its "add as a new song" line: the Songs scope
// with `query` in the search, searching the KaraFun catalog when `catalog`.
export function findInSongs(query, { catalog = false } = {}) {
  rememberedQuery = query;
  if (catalog) source = 'karafun'; // falls back to my songs when no catalog is loaded
  dock.scope('songs');
}

// A video search for the song, opened by the owner in a new tab (R38).
function videoSearchUrl(song) {
  const terms = [song.title, song.artist].map((t) => String(t ?? '').trim()).filter(Boolean).join(' ');
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(terms)}`;
}

// Deletes a song together with its sings and its place in every setlist, in
// one transaction, so nothing is left pointing at a missing song (R2).
// Resolves with what was removed: { singIds, setlists }.
export function deleteSong(id) {
  return db.transaction(['songs', 'sings', 'setlists'], 'readwrite', async (stores) => {
    const sings = await request(stores.sings.index('songId').getAll(id));
    const setlists = await request(stores.setlists.getAll());
    const plan = planSongDelete(id, sings, setlists);
    stores.songs.delete(id);
    for (const singId of plan.singIds) stores.sings.delete(singId);
    for (const setlist of plan.setlists) stores.setlists.put(setlist);
    return plan;
  });
}

// Shows validateSong() errors on a form. Returns true when there were any.
function showErrors(form, errorBox, errors) {
  for (const field of form.elements) field.removeAttribute('aria-invalid');
  const names = Object.keys(errors);
  errorBox.hidden = names.length === 0;
  errorBox.textContent = names.map((name) => errors[name]).join(' ');
  for (const name of names) form.elements[name]?.setAttribute('aria-invalid', 'true');
  if (names.length) form.elements[names[0]]?.focus();
  return names.length > 0;
}

function textField(label, props) {
  return el('label', { text: label }, el('input', { autocomplete: 'off', ...props }));
}

function yearField() {
  return textField('Year', { name: 'year', type: 'number', min: '1900', max: '2100', inputmode: 'numeric' });
}

// A <select> with [value, text] options, showing `value`.
function fillSelect(select, options, value) {
  select.replaceChildren(...options.map(([optionValue, text]) => el('option', { value: optionValue, text })));
  select.value = value;
  return select;
}

// A find control with its label beside it rather than around it, so the
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

// A row's sing line, each part on one line so a date never breaks at its hyphens.
// A "never sung" line carries class `never`, so it can be hidden while a sung
// filter already says so for every row (R52).
function sungLine(parts, never = false) {
  const children = [];
  for (const part of parts) {
    if (children.length) children.push(' · ');
    children.push(el('span', { class: 'nowrap', text: part }));
  }
  return el('span', { class: never ? 'sung never' : 'sung' }, ...children);
}

// Small marks after a row's details: "KaraFun" on my songs (R68), "Duet" and
// "Explicit" on catalog rows (R67). False labels are skipped. Each follows a
// space, so the line reads "Amy Winehouse · Soul · 2006 KaraFun".
function marks(...labels) {
  return labels.filter(Boolean).flatMap((label) => [' ', el('span', { class: `mark mark-${label.toLowerCase()}`, text: label })]);
}

// The filters and sort the owner last used, kept across tabs and reloads (R53).
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

// The search box text, kept while the app is open so another tab and back
// does not lose it (R53). A reload starts with an empty search. My songs and
// the KaraFun catalog share it, so a song not in my songs can be looked up in
// the catalog with one tap.
let rememberedQuery = '';

// ---------- The KaraFun catalog in Find (R67) ----------

// What Find searches: my songs, or the KaraFun catalog once one is loaded.
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

// Called on every render of the Songs tab with what is stored now.
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

// The Songs scope. Coming back from a song passes back what the screen
// showed, so it is restored: the search (`query`), the filters and sort
// (`filters`) and whether the filters were open (`filtersOpen`). Also the
// song to scroll to (`focusId`) and an optional status line (`message`). The
// venue and the set come from meta, so they come back too.
export async function renderSongs({
  query, filters, filtersOpen = false, focusId = null, message = '',
} = {}) {
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

  // What to restore when coming back from a song.
  const backState = () => ({
    query: state.query, filters: { ...state.filters }, filtersOpen: filtersBox.open,
  });

  // Opens a song; Back returns to this screen as it is now (R31).
  function openSong(songId) {
    const back = backState();
    openScreen(() => renderSong(songId, back));
  }

  // The line at the top that says what a tap did, or why it failed.
  const status = el('p', { class: 'notice night-status', role: 'status', text: message });
  const say = (text) => { status.textContent = text; };

  // A save that failed leaves the screen out of step, so it is drawn again from what is stored.
  function failed(err) {
    renderSongs({ ...backState(), message: `Could not save: ${err.message}` });
  }

  const count = el('p', { class: 'count' });
  const list = el('ul', { class: 'list' });

  // "Pick for me" (R13): one of the songs the count line reports, at random,
  // opened the way its row would open it.
  const pickButton = el('button', {
    type: 'button', class: 'btn pick', text: 'Pick for me',
    onclick: () => {
      const song = pickRandom(shown);
      if (song) openSong(song.id);
    },
  });
  const pickNote = el('p', { class: 'muted pick-note', text: 'Nothing to pick from.', hidden: '' });

  // What the search, filters and sort give (`shown`: songs, or catalog rows
  // in the KaraFun source), how many of those rows are drawn (`limit`), and
  // each song's row, built the first time it is drawn and reused until its
  // sing line changes (a new venue or a new sing).
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

  // A song KaraFun has carries a KaraFun mark after its details (R68).
  function songItem(s) {
    const details = [s.artist, s.genre, s.year].filter(Boolean).join(' · ');
    return el('li', { class: 'song-item', 'data-song-id': s.id },
      el('button', { type: 'button', class: 'song-row', onclick: () => openSong(s.id) },
        el('span', { class: 'title', text: s.title }),
        el('span', { class: 'sub' }, details, ...marks(s.karafunId != null && 'KaraFun')),
        sungLine(sungParts(stats.get(s.id), state.venueId != null), !stats.get(s.id))),
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
          type: 'button', class: 'btn catalog-add', text: 'Add to my songs',
          'aria-label': `Add ${entry.row.title} to my songs`,
          onclick: () => addCatalogSong(entry),
        }));
    }
    // A row not in my songs cannot be in the set: a + that adds it.
    drawToggle(entry.toggle, song || { id: null, title: entry.row.title });
  }

  // The song in my songs for a catalog row, added first when it is not there:
  // title, artist, year, genre, the catalog id (R68) and a duet tag. It joins
  // this screen's songs at once, so My songs and List show it.
  function catalogSong(row) {
    const known = librarySongFor(library, row);
    if (known) return Promise.resolve(known);
    if (!adding.has(row.id)) {
      const fields = makeSong(songFromCatalog(row));
      adding.set(row.id, db.add('songs', fields).then((id) => {
        const song = { id, ...fields };
        songs = titleOrder([...songs, song]);
        songsById.set(id, song);
        if (!songsByKey.has(songKey(song))) songsByKey.set(songKey(song), song);
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
      count.textContent = '';
      setChildren(list, [catalogLoadingItem]);
      showMoreButton();
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
      count.textContent = `${total} songs in the KaraFun catalog`;
      setChildren(list, [catalogHint]);
      showMoreButton();
      return;
    }
    shown = ready.search(f, state.query);
    count.textContent = `${formatCount(shown.length)} of ${total} songs`;
    drawRows(PAGE_SIZE);
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

  // Inline, where the list would be, when nothing in the library matches the
  // search (R48); with a catalog loaded, the same search can go to it (R67).
  const noMatchText = el('p', { class: 'muted' });
  const addFromSearchButton = el('button', { type: 'button', class: 'btn', onclick: addFromSearch });
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
    // With a sung filter on, every row would say "never sung here": hide those lines (R52).
    list.classList.toggle('hide-never', sungFilterActive(state.filters));
    count.textContent = `${shown.length} of ${songs.length} songs`;
    pickButton.disabled = shown.length === 0;
    pickNote.hidden = shown.length > 0;
    drawRows(PAGE_SIZE);
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
    const count = setlistSongs(state.set, songsById).length;
    context.textContent = `${venue ? venue.name : 'Overall'} · ${state.set.name} · ${plural(count, 'song', 'songs')}`;
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

  const search = el('input', {
    type: 'search',
    placeholder: 'Search title or artist',
    'aria-label': 'Search songs',
    oninput: (e) => {
      state.query = e.target.value;
      draw();
    },
  });
  search.value = query;

  // ---- Filters and sort (R41, R11, R42) ----

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
  const summary = el('summary');

  // "Filters (N)" for the source showing: my songs' filters or the catalog's (R67).
  function syncSummary() {
    const active = source === 'karafun' ? countCatalogFilters(state.catalogFilters) : countActiveFilters(state.filters);
    summary.textContent = active ? `Filters (${active})` : 'Filters';
  }

  // Shows the state in every control: after a change, Clear filters or a new venue.
  function syncFilters() {
    const f = state.filters;
    const choices = filterChoices(songs, f);
    fillSelect(sungSelect, sungOptions(state.venueId != null), f.sung);
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
    syncSummary();
  }

  function setFilter(key, value) {
    state.filters = { ...state.filters, [key]: value };
    saveFilters(state.filters);
    syncFilters();
    draw();
  }

  const onChange = (node, read) => {
    const update = () => setFilter(node.name, read(node.value));
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
    el('button', {
      type: 'button', class: 'btn', text: 'Clear filters',
      onclick: () => {
        state.filters = defaultFilters();
        saveFilters(state.filters);
        syncFilters();
        draw();
      },
    }));
  filtersForm.addEventListener('submit', (e) => e.preventDefault());

  const filtersBox = el('details', { class: 'card find-filters' }, summary, filtersForm);
  filtersBox.open = filtersOpen;
  syncFilters();

  // ---- The catalog's filters and sort (R67), in the same card ----

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
    syncSummary();
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
    el('button', {
      type: 'button', class: 'btn', text: 'Clear filters',
      onclick: () => setCatalogFilters(defaultCatalogFilters()),
    }));
  catalogForm.addEventListener('submit', (e) => e.preventDefault());
  syncCatalogFilters();

  // ---- What Find searches: my songs or the KaraFun catalog (R67) ----

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

  // Shows the source in the switch and the Find panel: the catalog has its own
  // filters, and no Pick for me or Add a song (nor Starting fresh, which is a row).
  function syncSource() {
    const karafun = source === 'karafun';
    for (const [key, button] of sourceButtons) {
      button.setAttribute('aria-checked', String(key === source));
      button.tabIndex = key === source ? 0 : -1;
    }
    const form = karafun ? catalogForm : filtersForm;
    if (filtersBox.lastElementChild !== form) filtersBox.replaceChildren(summary, form);
    search.placeholder = karafun ? 'Search the KaraFun catalog' : 'Search title or artist';
    pickButton.hidden = karafun;
    if (karafun) pickNote.hidden = true; // drawing my songs sets it again
    addCard.hidden = karafun;
    syncSummary();
  }

  function switchSource(key) {
    if (key === source || !hasCatalog) return;
    source = key;
    say('');
    syncSource();
    draw();
    viewEl.scrollTop = 0;
  }

  // ---- Add a song, with suggestions (R35) and a duplicate warning (R9) ----

  const errorBox = el('p', { class: 'error', role: 'alert', hidden: '' });
  const suggestionList = el('ul', { class: 'suggestions', 'aria-label': 'Suggestions from MusicBrainz', hidden: '' });
  const duplicateText = el('p', { role: 'status' });
  const duplicateBox = el('div', { class: 'duplicate', hidden: '' },
    duplicateText,
    el('button', { type: 'button', class: 'btn', text: 'Open it', onclick: openDuplicate }));
  const submitButton = el('button', { class: 'btn primary', type: 'submit', text: 'Add song' });
  // Genres MusicBrainz knows for the artist, offered as one-tap chips (R63).
  // (Its labels avoid the word "genre", so the Genre field's label stays unique.)
  const genreChips = el('div', { class: 'genre-chips', role: 'group', 'aria-label': 'From MusicBrainz', hidden: '' });
  const addStatus = el('select', { name: 'status' },
    ...[['', NO_STATUS_LABEL], ...SONG_STATUSES.map((s) => [s, STATUS_LABELS[s]])]
      .map(([value, text]) => el('option', { value, text })));
  const form = el('form', { class: 'stack', 'aria-label': 'Add a song' },
    textField('Title', { name: 'title', required: '' }),
    suggestionList,
    textField('Artist', { name: 'artist', required: '' }),
    el('div', { class: 'row' }, textField('Genre', { name: 'genre' }), yearField()),
    genreChips,
    el('label', { text: 'Status' }, addStatus), // not set by default (R64)
    errorBox,
    duplicateBox,
    submitButton);
  const titleInput = form.elements.namedItem('title');
  const artistInput = form.elements.namedItem('artist');
  const genreInput = form.elements.namedItem('genre');
  const yearInput = form.elements.namedItem('year');

  // R9: the first song in the library with the typed title and artist, ignoring case.
  const songsByKey = new Map();
  for (const s of songs) {
    if (!songsByKey.has(songKey(s))) songsByKey.set(songKey(s), s);
  }
  let duplicate = null;

  function checkDuplicate() {
    const title = titleInput.value.trim();
    const artist = artistInput.value.trim();
    duplicate = (title && artist && songsByKey.get(songKey({ title, artist }))) || null;
    const warning = duplicate ? `Already in your library: “${duplicate.title}” by ${duplicate.artist}.` : '';
    // Only a change is written, so a screen reader announces the warning once.
    if (duplicateText.textContent !== warning) duplicateText.textContent = warning;
    duplicateBox.hidden = !duplicate;
    submitButton.textContent = duplicate ? 'Add anyway' : 'Add song';
  }

  function openDuplicate() {
    if (duplicate) openSong(duplicate.id);
  }

  // "Add “xyz”" under a search that found nothing: the form opens with the
  // search as the title, ready for the artist (R48).
  function addFromSearch() {
    addCard.open = true;
    titleInput.value = state.query.trim();
    suggester.update(titleInput.value, artistInput.value);
    checkDuplicate();
    artistInput.focus();
  }

  // R35: suggestions under the title; taking one fills title and artist, and
  // the year and genre MusicBrainz knows (R63). The list scrolls into view so
  // the keyboard does not hide it.
  function showSuggestions(suggestions) {
    if (!form.isConnected) return;
    suggestionList.replaceChildren(...suggestions.map((s) => el('li', {},
      el('button', {
        type: 'button', class: 'suggestion', 'aria-label': `Use ${s.title} by ${s.artist}`,
        onclick: () => useSuggestion(s),
      }, s.title, el('span', { class: 'by', text: ` — ${s.artist}` }),
      s.year ? el('span', { class: 'by', text: ` (${s.year})` }) : null))));
    suggestionList.hidden = suggestions.length === 0;
    if (suggestions.length) suggestionList.scrollIntoView({ block: 'nearest' });
  }

  function showGenreChips(genres) {
    genreChips.replaceChildren(...genres.map((g) => el('button', {
      type: 'button', class: 'btn chip', text: g, 'aria-label': `Use ${g}`,
      onclick: () => { genreInput.value = g; },
    })));
    genreChips.hidden = genres.length === 0;
  }

  const suggester = createSuggester(showSuggestions, () => form.isConnected);

  async function useSuggestion(s) {
    suggester.cancel();
    titleInput.value = s.title;
    artistInput.value = s.artist;
    if (!yearInput.value && s.year) yearInput.value = String(s.year); // earliest release (R63)
    showSuggestions([]);
    checkDuplicate();
    submitButton.focus({ preventScroll: true });
    const genres = await fetchArtistGenres(s.artistId);
    if (!form.isConnected || titleInput.value !== s.title) return; // moved on meanwhile
    if (!genreInput.value && genres.length) genreInput.value = genres[0];
    showGenreChips(genres);
  }

  function clearHints() {
    showSuggestions([]);
    showGenreChips([]);
  }

  titleInput.addEventListener('input', () => {
    suggester.update(titleInput.value, artistInput.value);
    if (!titleInput.value.trim()) showGenreChips([]);
    checkDuplicate();
  });
  artistInput.addEventListener('input', () => {
    suggester.update(titleInput.value, artistInput.value); // the artist narrows the search (R63)
    checkDuplicate();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    suggester.cancel();
    clearHints();
    const data = new FormData(form);
    const fields = {
      title: data.get('title'),
      artist: data.get('artist'),
      genre: data.get('genre'),
      year: data.get('year'),
      status: data.get('status'), // '' = not set (R64)
    };
    if (showErrors(form, errorBox, validateSong(fields))) return;
    await db.add('songs', makeSong(fields));
    renderSongs({ query: '' }); // the search clears so the new song shows; filters stay (R53)
  });

  // Adding a song is occasional, so it waits at the bottom of the list (R48).
  const addCard = el('details', { class: 'card add-song' }, el('summary', { text: 'Add a song' }), form);

  // The My songs | KaraFun switch heads Find once a catalog is loaded (R67).
  const root = el('div', { class: 'stack songs-view' },
    context,
    status,
    hasCatalog ? sourceSwitch : null,
    search,
    filtersBox,
    el('div', { class: 'pick-row' }, count, pickButton, pickNote),
    list,
    moreButton,
    addCard);

  viewEl.replaceChildren(root);
  syncContext();
  syncSource();
  draw();

  // Only my songs open a song screen, so only they have a row to come back to.
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

// Opens a song's screen from another scope (Tonight's Details). `back` is
// { label, render }: the Back button's words ('Back to Tonight') and the
// render that returns there, given { focusId } or { message }.
export function openSongScreen(songId, back) {
  openScreen(() => renderSong(songId, back));
}

// Where a song screen returns to: the Songs scope with the state it had
// (`back` is its search and filters), or another scope's { label, render }.
function leaveSong(back, extra) {
  return typeof back.render === 'function' ? back.render(extra) : renderSongs({ ...back, ...extra });
}

// One song: notes first (what matters at the venue), then the other fields,
// with Edit and Delete at the bottom within thumb reach. `back` is the list's
// state (search, filters) to restore on the way back, or { label, render }.
async function renderSong(id, back) {
  const token = ++screen;
  const ticket = screenTicket();
  const song = await db.get('songs', id);
  if (!stillCurrent(token, ticket)) return;
  if (!song) {
    closeScreen(() => leaveSong(back, { message: 'That song is no longer in your library.' }));
    return;
  }

  const field = (label, value) => el('div', { class: 'field' },
    el('dt', { text: label }),
    el('dd', { class: value ? '' : 'muted', text: value || '—' }));

  const errorBox = el('p', { class: 'error', role: 'alert', hidden: '' });

  async function remove() {
    const [sings, setlists] = await Promise.all([
      db.getAllByIndex('sings', 'songId', song.id),
      db.getAll('setlists'),
    ]);
    if (!confirmAction(describeSongDelete(song, planSongDelete(song.id, sings, setlists)))) return;
    try {
      await deleteSong(song.id);
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = `Could not delete the song: ${err.message}`;
      return;
    }
    closeScreen(() => leaveSong(back, { message: `Deleted “${song.title}”.` }));
  }

  viewEl.replaceChildren(
    el('div', { class: 'stack song-detail' },
      backButton(back.label || 'Back to list', () => closeScreen(() => leaveSong(back, { focusId: song.id }))),
      el('section', { class: 'card stack', 'aria-label': 'Song details' },
        el('div', {},
          el('h2', { text: song.title }),
          el('p', { class: 'artist', text: song.artist })),
        el('div', {},
          el('h3', { text: 'Notes' }),
          song.notes
            ? el('p', { class: 'song-notes', text: song.notes })
            : el('p', { class: 'song-notes muted', text: 'No notes yet.' })),
        el('dl', { class: 'song-fields' },
          field('Key', song.key),
          field('Status', statusLabel(song.status)),
          field('Rating', formatRating(song.rating)),
          field('Genre', song.genre),
          field('Year', song.year == null ? '' : String(song.year)),
          field('Tags', formatTags(song.tags)),
          field('KaraFun', song.karafunId != null ? 'Yes' : 'No')), // R68
        errorBox,
        // The song full screen for the KJ (R54); Done comes back here.
        el('button', {
          type: 'button', class: 'btn kj-button', text: 'KJ', 'aria-label': 'Show to the KJ',
          onclick: () => openScreen(() => renderKj(song.id, { label: 'For the KJ' })),
        }),
        // Opens in a new tab, so the app stays where it was; nothing is fetched or saved (R38).
        el('a', { class: 'btn video-link', href: videoSearchUrl(song), target: '_blank', rel: 'noopener' },
          'Search video', el('span', { 'aria-hidden': 'true', text: ' ↗' })),
        el('div', { class: 'row' },
          el('button', {
            type: 'button', class: 'btn primary', text: 'Edit',
            onclick: () => openScreen(() => renderEditSong(song, back)),
          }),
          el('button', { type: 'button', class: 'btn danger', text: 'Delete', onclick: remove })))));
  viewEl.scrollTop = 0;
}

function backButton(label, onclick) {
  return el('button', { type: 'button', class: 'btn back', onclick },
    el('span', { 'aria-hidden': 'true', text: '‹ ' }), label);
}

// Every field of a song (R2, R3, R36, plus tags, key, status and rating).
function renderEditSong(song, back) {
  const select = (name, options, value) => {
    const node = el('select', { name },
      ...options.map(([optionValue, text]) => el('option', { value: optionValue, text })));
    node.value = value;
    return node;
  };

  const notes = el('textarea', {
    name: 'notes', rows: '4', placeholder: 'e.g. skip the bridge, starts cold',
  });
  notes.value = song.notes;

  const errorBox = el('p', { class: 'error', role: 'alert', hidden: '' });
  const form = el('form', { class: 'card stack', 'aria-label': 'Edit song' },
    textField('Title', { name: 'title', required: '', value: song.title }),
    textField('Artist', { name: 'artist', required: '', value: song.artist }),
    el('div', { class: 'row' },
      textField('Genre', { name: 'genre', value: song.genre }),
      yearField()),
    el('div', { class: 'row' },
      textField('Key', { name: 'key', value: song.key, placeholder: 'e.g. -2 or +1' }),
      el('label', { text: 'Rating' },
        select('rating', [['', 'No rating'], ...RATINGS.map((r) => [String(r), String(r)])],
          song.rating == null ? '' : String(song.rating)))),
    el('label', { text: 'Status' },
      select('status', [['', NO_STATUS_LABEL], ...SONG_STATUSES.map((s) => [s, STATUS_LABELS[s]])], song.status)),
    textField('Tags (comma-separated)', { name: 'tags', value: formatTags(song.tags), placeholder: 'e.g. duet, slow, 80s' }),
    el('label', { text: 'Notes' }, notes),
    errorBox,
    el('div', { class: 'row' },
      el('button', {
        type: 'button', class: 'btn', text: 'Cancel',
        onclick: () => closeScreen(() => renderSong(song.id, back)),
      }),
      el('button', { type: 'submit', class: 'btn primary', text: 'Save' })));
  form.elements.year.value = song.year == null ? '' : String(song.year);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(form));
    if (showErrors(form, errorBox, validateSong(fields))) return;
    try {
      await db.put('songs', updateSong(song, fields));
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = `Could not save the song: ${err.message}`;
      return;
    }
    closeScreen(() => renderSong(song.id, back));
  });

  viewEl.replaceChildren(el('div', { class: 'song-detail' }, form));
  viewEl.scrollTop = 0;
}
