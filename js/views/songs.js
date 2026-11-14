// Songs view, built around a night out. Pinned at the top: the venue (R37)
// and the set open there (R47), any setlist whatever its venue label (R56),
// then three modes of one screen:
//   Find (R48): search (R10), filters by sings, tag, status, rating, genre and
//     decade with times sung per song (R41, R11, R42, R8), the R42 and R12
//     sort orders, "Pick for me" (R13), a + on each row that adds the song to
//     the set, and "Add a song" at the bottom (R1), with suggestions from
//     MusicBrainz (R35) and a warning about a song already there (R9). Stays
//     quick with 1,000 songs (R34): rows are built once and at most PAGE_SIZE
//     are drawn at a time.
//   List (R49): the set in order, with move up and down, "Sang it" and "Next time".
//   Sung (R50): what was sung at the venue by date, with Undo for today.
// Under Overall there is a set too (R56): + and List work, with Remove in
// place of "Sang it" and "Next time"; Sung needs a venue.
// "Find songs" on a setlist (R57) opens this tab in Find with that set.
// One song's detail has a video search link (R38), an edit form and delete
// (R2, R3, R36; the edit form also holds tags, key, status and rating).
import { db, request } from '../db.js';
import { el, viewEl, confirmAction, openScreen, closeScreen } from '../ui.js';
import {
  makeSong, updateSong, validateSong, planSongDelete, describeSongDelete, songKey,
  SONG_STATUSES, STATUS_LABELS, NO_STATUS_LABEL, RATINGS, statusLabel, formatRating, formatTags,
} from '../lib/song.js';
import { pickRandom } from '../lib/pick.js';
import { createSuggester, fetchArtistGenres } from '../musicbrainz.js';
import { singStats, sortVenues, todayLocalISO } from '../lib/stats.js';
import { filterSongs } from '../lib/search.js';
import {
  SUNG_NOT_SINCE, SORT_MENU, MIN_RATING_OPTIONS, defaultFilters, decadeLabel, filterChoices, sungOptions,
  countActiveFilters, applyFind, sungParts, titleOrder, sungFilterActive, NO_STATUS_FILTER,
} from '../lib/find.js';
import {
  makeSetlist, addSongId, removeSongId, moveSongId, moveSongIdBy, setlistSongs, sungFlags, tonightSing,
} from '../lib/setlist.js';
import { dragToReorder } from '../drag.js';
import {
  currentSetlistKey, nextSetlistKey, tonightListName, uniqueSetlistName, currentSetlistFor, setMenuGroups,
  OVERALL_LIST_NAME, nextSetlistFor, putBackOnTop, groupSingsByDate,
} from '../lib/night.js';

// The meta record that remembers the list's venue across visits and reloads (R37).
const VENUE_KEY = 'findVenueId';

// Opens Settings at the Backup card (R65). The tab button is the one way to
// switch views from inside a view without a circular import of app.js.
export function goToBackup() {
  document.querySelector('.tabs button[data-view="settings"]')?.click();
  setTimeout(() => document.getElementById('backup-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
}

// How many rows the list draws at first, and adds with each "Show more" (R34).
// The count line always gives the full number that match.
const PAGE_SIZE = 200;

// The Set menu's last option, which starts a new list for tonight (R47).
const NEW_LIST = 'new';
// The Set menu's value for Overall's list before it is first saved (R56).
const UNSAVED = '';

// The three modes (R47). The one showing is kept while the app is open and
// is Find on a fresh load; switching modes is not a new screen, so it adds no
// history entry.
const MODES = [['find', 'Find'], ['list', 'List'], ['sung', 'Sung']];
let mode = 'find';

// Bumped on every screen change, so a slow load never paints over a newer screen.
let screen = 0;

// True while a load started with `token` should still be shown: no newer
// Songs screen has started and the Songs tab is still the selected one.
function stillCurrent(token) {
  const tab = document.querySelector('.tabs button[data-view="songs"]');
  return token === screen && (!tab || tab.getAttribute('aria-current') === 'page');
}

const sameOrder = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

// ---------- Sets at a venue (R47, R49, R50, R56), each change in one transaction ----------

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
function openCurrentSet(venue, setlists, meta) {
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
function startList(venue, name) {
  const venueId = venue ? venue.id : null;
  return db.transaction(['setlists', 'meta'], 'readwrite', async (stores) => {
    const all = await request(stores.setlists.getAll());
    const fresh = makeSetlist(uniqueSetlistName(name, all), venueId);
    const set = { ...fresh, id: await request(stores.setlists.add(fresh)) };
    stores.meta.put({ key: currentSetlistKey(venueId), value: set.id });
    return { set, setlists: [...all, set] };
  });
}

// "Find songs" on a setlist (R57): makes it the current set at the venue the
// Songs tab is on (or under Overall), then shows the Songs tab in Find mode.
// The venue stays as it is.
export async function showSetInFind(setlistId) {
  const [saved, venues] = await Promise.all([db.get('meta', VENUE_KEY), db.getAll('venues')]);
  const wanted = saved ? saved.value : null;
  const venueId = venues.some((v) => v.id === wanted) ? wanted : null; // a deleted venue means Overall
  await db.put('meta', { key: currentSetlistKey(venueId), value: setlistId });
  mode = 'find';
  document.querySelector('.tabs button[data-view="songs"]')?.click();
}

// "Next time" (R49): saves `from` (the set without the song) and appends the
// song to the venue's Next time list, creating that list on first use or when
// the remembered one is gone. Resolves with { target, setlists }.
function moveToNextTime(venue, from, songId) {
  return db.transaction(['setlists', 'meta'], 'readwrite', async (stores) => {
    const all = await request(stores.setlists.getAll());
    const key = nextSetlistKey(venue.id);
    const saved = await request(stores.meta.get(key));
    let target = nextSetlistFor(all, venue.id, saved ? saved.value : undefined);
    if (target && target.id === from.id) throw new Error('this set is the Next time list');
    if (!target) {
      const fresh = makeSetlist(uniqueSetlistName('Next time', all), venue.id);
      target = { ...fresh, id: await request(stores.setlists.add(fresh)) };
      stores.meta.put({ key, value: target.id });
    }
    target = addSongId(target, songId);
    stores.setlists.put(target);
    stores.setlists.put(from);
    const others = all.filter((s) => s.id !== target.id && s.id !== from.id);
    return { target, setlists: [...others, target, from] };
  });
}

// "Sang it" (R49): logs the sing and saves the set without the song, together.
// Resolves with the sing as stored, id included.
function logSing(sing, set) {
  return db.transaction(['sings', 'setlists'], 'readwrite', async (stores) => {
    const id = await request(stores.sings.add(sing));
    stores.setlists.put(set);
    return { ...sing, id };
  });
}

// Undo (R50): deletes the sing and saves the set with the song back on top, together.
function undoSing(singId, set) {
  return db.transaction(['sings', 'setlists'], 'readwrite', async (stores) => {
    stores.sings.delete(singId);
    stores.setlists.put(set);
  });
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
function findField(labelText, control) {
  control.id = `find-${control.name}`;
  return el('div', { class: 'find-field' }, el('label', { for: control.id, text: labelText }), control);
}

// A Venue or Set menu in the pinned bar (R47): the label sits inside the box,
// before the value, so the bar stays one row high.
function pickerField(labelText, control) {
  control.id = `find-${control.name}`;
  return el('div', { class: 'night-picker' }, el('label', { for: control.id, text: labelText }), control);
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
// does not lose it (R53). A reload starts with an empty search.
let rememberedQuery = '';

// The Songs tab. Coming back from a song passes back what the screen showed,
// so it is restored: the search (`query`), the venue (`venueId`; undefined
// means the one remembered in meta), the filters and sort (`filters`) and
// whether the filters were open (`filtersOpen`). Also the song to scroll to
// (`focusId`) and an optional status line (`message`). The set comes from
// meta and the mode from module state, so both come back too.
export async function renderSongs({
  query, venueId, filters, filtersOpen = false, focusId = null, message = '',
} = {}) {
  const token = ++screen;
  // Nothing passed means "as the owner left it": saved filters, remembered search (R53).
  if (query === undefined) query = rememberedQuery;
  if (filters === undefined) filters = loadSavedFilters();
  const [songRecords, venueRecords, singRecords, setlistRecords, metaRecords] = await Promise.all([
    db.getAll('songs'),
    db.getAll('venues'),
    db.getAll('sings'),
    db.getAll('setlists'),
    db.getAll('meta'),
  ]);
  if (!stillCurrent(token)) return;
  const songs = titleOrder(songRecords);
  const songsById = new Map(songs.map((s) => [s.id, s]));
  const venues = sortVenues(venueRecords);
  const meta = new Map(metaRecords.map((r) => [r.key, r.value])); // kept in step with what is saved
  // Kept in step with every sing and setlist this screen saves.
  let sings = singRecords;
  let setlists = setlistRecords;

  // A remembered venue that has since been deleted falls back to Overall.
  const wanted = venueId === undefined ? (meta.has(VENUE_KEY) ? meta.get(VENUE_KEY) : null) : venueId;
  const state = {
    query,
    venueId: venues.some((v) => v.id === wanted) ? wanted : null,
    filters: { ...defaultFilters(), ...filters },
    set: null, // the set open at the venue or under Overall (R47, R56); id null while Overall's is unsaved
  };
  rememberedQuery = state.query;
  const currentVenue = () => venues.find((v) => v.id === state.venueId) || null;
  {
    const opened = await openCurrentSet(currentVenue(), setlists, meta);
    if (!stillCurrent(token)) return;
    ({ set: state.set, setlists } = opened);
    if (state.set.id != null) meta.set(currentSetlistKey(state.venueId), state.set.id);
  }
  if (state.venueId == null && mode === 'sung') mode = 'find'; // Sung needs a venue
  let inSet = new Set(state.set.songIds);
  let stats = singStats(sings, state.venueId);

  // What to restore when coming back from a song.
  const backState = () => ({
    query: state.query, venueId: state.venueId, filters: { ...state.filters }, filtersOpen: filtersBox.open,
  });

  // Opens a song; Back returns to this screen as it is now (R31).
  function openSong(songId) {
    const back = backState();
    openScreen(() => renderSong(songId, back));
  }

  // The line under the bar that says what a tap did, or why it failed.
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

  // What the search, filters and sort give (`shown`), how many of those rows
  // are drawn (`limit`), and each song's row, built the first time it is
  // drawn and reused until its sing line changes (a new venue or a new sing).
  // Each row has a + that adds the song to the set (R48, under Overall too,
  // R56); those are kept by song id so they follow the set as it changes.
  let shown = [];
  let limit = PAGE_SIZE;
  const rows = new Map();
  const toggles = new Map();

  function rowFor(s) {
    let item = rows.get(s.id);
    if (!item) {
      item = songItem(s);
      rows.set(s.id, item);
    }
    return item;
  }

  // Rows are built again the next time they are drawn.
  function forgetRows() {
    rows.clear();
    toggles.clear();
  }

  const moreButton = el('button', {
    type: 'button', class: 'btn more', hidden: '',
    onclick: () => {
      const added = shown.slice(limit, limit + PAGE_SIZE).map(rowFor);
      limit += PAGE_SIZE;
      list.append(...added);
      showMoreButton();
      // Focus moves to the first new row, where the button was.
      added[0]?.querySelector('.song-row').focus({ preventScroll: true });
    },
  });

  function showMoreButton() {
    const left = shown.length - limit;
    moreButton.hidden = left <= 0;
    moreButton.textContent = left > 0 ? `Show ${Math.min(left, PAGE_SIZE)} more` : '';
  }

  function songItem(s) {
    const details = [s.artist, s.genre, s.year].filter(Boolean).join(' · ');
    return el('li', { class: 'song-item', 'data-song-id': s.id },
      el('button', { type: 'button', class: 'song-row', onclick: () => openSong(s.id) },
        el('span', { class: 'title', text: s.title }),
        el('span', { class: 'sub', text: details }),
        sungLine(sungParts(stats.get(s.id), state.venueId != null), !stats.get(s.id))),
      toggleFor(s));
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

  // Inline, where the list would be, when nothing in the library matches the search (R48).
  const noMatchText = el('p', { class: 'muted' });
  const addFromSearchButton = el('button', { type: 'button', class: 'btn', onclick: addFromSearch });
  const noMatch = el('li', { class: 'no-match' }, noMatchText, addFromSearchButton);

  // Runs the search, filters and sort again and draws the first page of rows.
  function draw() {
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
      if (text && filterSongs(songs, text).length === 0) {
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

  // ---- Venue (R37) and set (R47) ----

  const venueSelect = fillSelect(el('select', { name: 'venue' }),
    [['', 'Overall'], ...venues.map((v) => [String(v.id), v.name])],
    state.venueId == null ? '' : String(state.venueId));
  let venueChange = 0; // the newest venue choice, so a slow one never wins
  venueSelect.addEventListener('change', async () => {
    const ticket = ++venueChange;
    const venue = venues.find((v) => String(v.id) === venueSelect.value) || null;
    state.venueId = venue ? venue.id : null;
    db.put('meta', { key: VENUE_KEY, value: state.venueId })
      .catch((err) => console.warn('Could not remember the venue:', err));
    let set;
    try {
      ({ set, setlists } = await openCurrentSet(venue, setlists, meta));
    } catch (err) {
      failed(err);
      return;
    }
    if (ticket !== venueChange || !root.isConnected) return;
    if (set.id != null) meta.set(currentSetlistKey(state.venueId), set.id);
    if (!venue && mode === 'sung') mode = 'find'; // Sung needs a venue
    state.set = set;
    inSet = new Set(set.songIds);
    stats = singStats(sings, state.venueId);
    forgetRows(); // every row's sing line is for the old venue
    say('');
    syncFilters();
    fillSetSelect();
    syncModes();
    showMode(); // in Find, also re-sorts for the last-sung orders (R12)
  });

  // The Set menu (R56): every setlist by name, grouped "For <venue>", "Any
  // venue" and "Other venues" (under Overall: "Any venue" and "For a venue"),
  // then "New list for tonight…" (under Overall "New list…", for any venue).
  // Overall's unsaved "My list" shows first until its first song saves it.
  const setSelect = el('select', { name: 'set' });
  function fillSetSelect() {
    const options = setMenuGroups(setlists, venues, state.venueId).map((group) => el('optgroup', { label: group.label },
      ...group.items.map((item) => el('option', { value: String(item.id), text: item.text }))));
    if (state.set.id == null) options.unshift(el('option', { value: UNSAVED, text: state.set.name }));
    options.push(el('option', { value: NEW_LIST, text: state.venueId == null ? 'New list…' : 'New list for tonight…' }));
    setSelect.replaceChildren(...options);
    setSelect.value = state.set.id == null ? UNSAVED : String(state.set.id);
    setSelect.disabled = false;
  }

  setSelect.addEventListener('change', async () => {
    const venue = currentVenue();
    const venueId = state.venueId;
    if (setSelect.value === NEW_LIST) {
      setSelect.disabled = true; // one new list per choice
      let made;
      try {
        made = await startList(venue, tonightListName(new Date()));
      } catch (err) {
        failed(err);
        return;
      }
      if (state.venueId !== venueId || !root.isConnected) return;
      setlists = made.setlists;
      chooseSet(made.set);
      say(`Started “${made.set.name}”.`);
      return;
    }
    const chosen = setlists.find((s) => String(s.id) === setSelect.value);
    if (!chosen) return;
    chooseSet(chosen);
    say('');
    db.put('meta', { key: currentSetlistKey(venueId), value: chosen.id })
      .catch((err) => console.warn('Could not remember the set:', err));
  });

  // Opens another set at the same venue (or under Overall).
  function chooseSet(set) {
    state.set = set;
    inSet = new Set(set.songIds);
    meta.set(currentSetlistKey(state.venueId), set.id);
    fillSetSelect();
    syncSet();
    if (mode === 'list') drawList();
  }

  // The current set with new contents, before it is saved.
  function changeSet(next) {
    state.set = next;
    setlists = setlists.map((s) => (s.id === next.id ? next : s));
    inSet = new Set(next.songIds);
    syncSet();
  }

  // What shows the set outside List mode: the List (N) count and every + in Find.
  function syncSet() {
    syncModes();
    for (const [songId, button] of toggles) drawToggle(button, songsById.get(songId));
  }

  // ---- Modes (R47) ----

  const modeButtons = new Map(MODES.map(([key, label]) => [key, el('button', {
    type: 'button', class: 'mode', role: 'tab', id: `mode-${key}`, text: label, onclick: () => switchMode(key),
  })]));
  const modes = el('div', { class: 'modes', role: 'tablist', 'aria-label': 'Songs tab' }, ...modeButtons.values());
  // Arrow keys move between the modes, as in any tab list.
  modes.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!step) return;
    const keys = MODES.map(([key]) => key).filter((key) => !modeButtons.get(key).disabled);
    const next = keys[(keys.indexOf(mode) + step + keys.length) % keys.length];
    e.preventDefault();
    switchMode(next);
    modeButtons.get(next).focus();
  });
  // Under Overall, says why Sung is greyed out and List has no "Sang it" (R56).
  const overallNote = el('p', { class: 'muted night-note', text: 'Pick a venue to log a sing or use Sung.' });

  function syncModes() {
    const overall = state.venueId == null;
    for (const [key, button] of modeButtons) {
      button.setAttribute('aria-selected', String(key === mode));
      button.tabIndex = key === mode ? 0 : -1;
      button.disabled = overall && key === 'sung';
    }
    const listLabel = `List (${setlistSongs(state.set, songsById).length})`;
    if (modeButtons.get('list').textContent !== listLabel) modeButtons.get('list').textContent = listLabel;
    overallNote.hidden = !overall;
  }

  function switchMode(key) {
    if (key === mode || (state.venueId == null && key === 'sung')) return;
    mode = key;
    say('');
    syncModes();
    showMode();
    viewEl.scrollTop = 0;
  }

  // Draws the mode that is showing into the panel under the bar.
  function showMode() {
    if (mode === 'list') {
      panel.replaceChildren(listPanel);
      drawList();
    } else if (mode === 'sung') {
      panel.replaceChildren(sungPanel);
      drawSung();
    } else {
      panel.replaceChildren(findPanel);
      draw();
    }
  }

  // Sings changed: the Find rows' sing lines and the filters on them are out of date.
  function singsChanged() {
    stats = singStats(sings, state.venueId);
    forgetRows();
  }

  // ---- List mode (R49) ----

  const setList = el('ol', { class: 'list night-list', 'aria-label': 'Songs in the set' });
  const setEmpty = el('div', { class: 'night-empty' },
    el('p', { class: 'muted', text: 'Nothing in this set yet. Find songs and tap + to add them.' }),
    el('button', { type: 'button', class: 'btn primary', text: 'Find songs', onclick: () => switchMode('find') }));
  const listPanel = el('div', { class: 'stack', role: 'tabpanel', 'aria-labelledby': 'mode-list' }, setList, setEmpty);
  const moves = new Map(); // each row's ↑ and ↓ by song id, so focus can follow a moved song

  // The venue's Next time list, when it has one (R49).
  function nextTimeList() {
    return nextSetlistFor(setlists, state.venueId, meta.get(nextSetlistKey(state.venueId)));
  }

  function drawList() {
    const inList = setlistSongs(state.set, songsById);
    // Flags say what was sung at the venue the set is open at, whatever its label (R56).
    const flags = sungFlags({ ...state.set, venueId: state.venueId }, sings);
    const next = nextTimeList();
    const isNextTime = !!next && next.id === state.set.id; // never move a song onto itself
    moves.clear();
    setList.replaceChildren(...inList.map((song, i) => setRow(song, flags.get(song.id), i, inList.length, !isNextTime)));
    setList.hidden = inList.length === 0;
    setEmpty.hidden = inList.length > 0;
  }

  // A song in the set: title, artist and its sung flag (R43), which open the
  // song, then ↑ ↓, "Sang it" and "Next time"; under Overall, which has no
  // venue to log a sing at, ↑ ↓ and "Remove" (R56).
  function setRow(song, lastSung, index, total, canMoveOn) {
    // True when the tapped control had focus (a keyboard, or a desktop click),
    // so focus follows the song; phones do not focus buttons on a tap.
    const focused = (e) => document.activeElement === e.currentTarget;
    const up = el('button', {
      type: 'button', class: 'btn move', text: '↑', 'aria-label': `Move ${song.title} up`,
      onclick: (e) => moveInSet(song, -1, focused(e) ? 'up' : null),
    });
    const down = el('button', {
      type: 'button', class: 'btn move', text: '↓', 'aria-label': `Move ${song.title} down`,
      onclick: (e) => moveInSet(song, 1, focused(e) ? 'down' : null),
    });
    up.disabled = index === 0;
    down.disabled = index === total - 1;
    moves.set(song.id, { up, down });
    // A drag handle, as on the setlist screen (R61); arrow keys move the song too.
    const handle = el('button', {
      type: 'button', class: 'btn handle', text: '≡', 'aria-label': `Move ${song.title}`,
      onkeydown: (e) => {
        const delta = { ArrowUp: -1, ArrowDown: 1 }[e.key];
        if (!delta) return;
        e.preventDefault();
        moveInSet(song, delta, 'handle');
      },
    });
    moves.get(song.id).handle = handle;
    const li = el('li', { class: 'night-song', 'data-song-id': song.id },
      handle,
      // Tapping the song shows it full screen for the KJ (R54); details are a tap further.
      el('button', {
        type: 'button', class: 'night-open', 'aria-label': `Show ${song.title} to the KJ`,
        onclick: () => {
          const back = backState();
          openScreen(() => renderKjCard(song.id, back));
        },
      },
        el('span', { class: 'title', text: song.title }),
        el('span', { class: 'sub', text: song.artist }),
        lastSung ? el('span', { class: 'flag' }, 'Sung here · last ', el('span', { class: 'nowrap', text: lastSung })) : null),
      el('div', { class: 'night-actions' },
        up,
        down,
        ...(state.venueId == null
          ? [el('button', {
            type: 'button', class: 'btn', text: 'Remove', 'aria-label': `Remove ${song.title} from the set`,
            onclick: () => removeFromList(song),
          })]
          : [
            el('button', {
              type: 'button', class: 'btn sang', text: 'Sang it', 'aria-label': `Sang ${song.title}`,
              onclick: () => sangIt(song),
            }),
            canMoveOn
              ? el('button', {
                type: 'button', class: 'btn', text: 'Next time', 'aria-label': `${song.title} next time`,
                onclick: () => nextTime(song),
              })
              : null,
          ])));
    dragToReorder({
      list: setList, li, handle,
      onDrop: (newIndex, hadFocus) => moveInSetTo(song, newIndex, hadFocus),
      onCancel: drawList,
    });
    return li;
  }

  // A drop at `newIndex` (R61): drawn at once, then saved.
  async function moveInSetTo(song, newIndex, refocus) {
    const next = moveSongId(state.set, song.id, newIndex, songsById);
    if (sameOrder(next.songIds, state.set.songIds)) {
      drawList();
      return;
    }
    changeSet(next);
    drawList();
    if (refocus) moves.get(song.id)?.handle?.focus();
    try {
      await db.put('setlists', next);
    } catch (err) {
      failed(err);
    }
  }

  // Takes a song off the set under Overall, with no confirmation: + puts it back (R56).
  async function removeFromList(song) {
    if (!inSet.has(song.id)) return; // a second tap finds it gone
    const next = removeSongId(state.set, song.id);
    changeSet(next);
    say(`Removed “${song.title}” from the set.`);
    if (mode === 'list') drawList();
    try {
      await db.put('setlists', next);
    } catch (err) {
      failed(err);
    }
  }

  // ↑ (-1) or ↓ (1): drawn at once, then saved.
  async function moveInSet(song, delta, which) {
    const next = moveSongIdBy(state.set, song.id, delta, songsById);
    if (sameOrder(next.songIds, state.set.songIds)) return;
    changeSet(next);
    drawList();
    if (which) {
      const row = moves.get(song.id);
      const order = which === 'up' ? ['up', 'down'] : which === 'down' ? ['down', 'up'] : [];
      const name = order.find((key) => !row[key].disabled) || 'handle';
      row[name]?.focus();
    }
    try {
      await db.put('setlists', next);
    } catch (err) {
      failed(err);
    }
  }

  // Logs a sing here today and takes the song out of the set, with no
  // confirmation: Undo is under Sung (R49, R50).
  async function sangIt(song) {
    const venue = currentVenue();
    if (!venue || !inSet.has(song.id)) return; // a second tap finds it gone
    const next = removeSongId(state.set, song.id);
    const sing = tonightSing(song.id, venue.id, todayLocalISO());
    changeSet(next);
    try {
      sings = [...sings, await logSing(sing, next)];
    } catch (err) {
      failed(err);
      return;
    }
    singsChanged();
    say(`Sang “${song.title}”. Undo is under Sung.`);
    if (mode === 'list') drawList();
  }

  // Moves the song from the set to the end of the venue's Next time list (R49).
  async function nextTime(song) {
    const venue = currentVenue();
    if (!venue || !inSet.has(song.id)) return;
    const from = removeSongId(state.set, song.id);
    changeSet(from);
    try {
      const moved = await moveToNextTime(venue, from, song.id);
      setlists = moved.setlists;
      meta.set(nextSetlistKey(venue.id), moved.target.id);
    } catch (err) {
      failed(err);
      return;
    }
    fillSetSelect(); // a Next time list made just now joins the Set menu
    say(`Moved “${song.title}” to Next time.`);
    if (mode === 'list') drawList();
  }

  // ---- Sung mode (R50) ----

  const sungList = el('div', { class: 'stack night-sung' });
  const sungPanel = el('div', { role: 'tabpanel', 'aria-labelledby': 'mode-sung' }, sungList);

  function drawSung() {
    const today = todayLocalISO();
    const groups = groupSingsByDate(sings, songsById, state.venueId, today);
    if (!groups.length) {
      sungList.replaceChildren(el('p', { class: 'muted', text: 'Nothing sung here yet.' }));
      return;
    }
    sungList.replaceChildren(...groups.map((group) => el('section', { class: 'night-day', 'aria-label': group.label },
      el('h3', { text: group.label }),
      el('ul', { class: 'list' }, ...group.entries.map(({ sing, song }) => sungRow(sing, song, group.date === today))))));
  }

  // A sing: the song, which opens it, and for today's sings an Undo.
  function sungRow(sing, song, today) {
    return el('li', { class: 'night-song', 'data-song-id': song.id, 'data-sing-id': sing.id },
      el('button', { type: 'button', class: 'night-open', onclick: () => openSong(song.id) },
        el('span', { class: 'title', text: song.title }),
        el('span', { class: 'sub', text: song.artist })),
      today
        ? el('div', { class: 'night-actions' },
          el('button', {
            type: 'button', class: 'btn', text: 'Undo', 'aria-label': `Undo ${song.title}`,
            onclick: () => undo(sing, song),
          }))
        : null);
  }

  // Deletes the sing and puts the song back at the top of the set, with no confirmation (R50).
  async function undo(sing, song) {
    if (!state.set || !sings.some((s) => s.id === sing.id)) return; // a second tap finds it gone
    sings = sings.filter((s) => s.id !== sing.id);
    const next = putBackOnTop(state.set, song.id);
    changeSet(next);
    try {
      await undoSing(sing.id, next);
    } catch (err) {
      failed(err);
      return;
    }
    singsChanged();
    say(`Put “${song.title}” back at the top of the set.`);
    if (mode === 'sung') drawSung();
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
  const sortSelect = el('select', { name: 'sort' });
  const summary = el('summary');

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
    fillSelect(sortSelect, SORT_MENU, f.sort);
    const active = countActiveFilters(f);
    summary.textContent = active ? `Filters (${active})` : 'Filters';
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
  onChange(sortSelect, text);

  const filtersForm = el('form', { class: 'stack find-form', 'aria-label': 'Filters' },
    el('div', { class: 'row' }, findField('Sung', sungSelect), sinceField),
    el('div', { class: 'find-grid' },
      findField('Tag', tagSelect),
      findField('Status', statusSelect),
      findField('Rating', ratingSelect),
      findField('Genre', genreSelect),
      findField('Decade', decadeSelect),
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
    // Search and filters start afresh so the new song shows; the venue stays.
    renderSongs({ venueId: state.venueId, query: '' }); // the search clears so the new song shows; filters stay (R53)
  });

  // Adding a song is occasional, so it waits at the bottom of the list (R48).
  const addCard = el('details', { class: 'card add-song' }, el('summary', { text: 'Add a song' }), form);

  const findPanel = el('div', { class: 'stack', role: 'tabpanel', 'aria-labelledby': 'mode-find' },
    search,
    filtersBox,
    el('div', { class: 'pick-row' }, count, pickButton, pickNote),
    list,
    moreButton,
    addCard);

  // The venue, the set and the modes stay pinned at the top while the rest scrolls (R47).
  const bar = el('div', { class: 'night-bar' },
    el('div', { class: 'night-pickers' }, pickerField('Venue', venueSelect), pickerField('Set', setSelect)),
    modes,
    overallNote);
  const panel = el('div', { class: 'night-panel' });
  const root = el('div', { class: 'stack songs-view' }, bar, status, panel);

  viewEl.replaceChildren(root);
  fillSetSelect();
  syncModes();
  showMode();

  if (focusId != null) {
    let row = null;
    if (mode === 'find') {
      // Coming back from a song further down than the first page draws enough pages to reach it.
      const index = shown.findIndex((s) => s.id === focusId);
      if (index >= limit) drawRows(Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE);
      row = list.querySelector(`[data-song-id="${focusId}"] .song-row`);
    } else {
      row = panel.querySelector(`[data-song-id="${focusId}"] .night-open`);
    }
    if (row) {
      row.scrollIntoView({ block: 'center' });
      row.focus({ preventScroll: true });
    }
  }
}

// One song: notes first (what matters at the venue), then the other fields,
// with Edit and Delete at the bottom within thumb reach. `back` is the list's
// state (search, venue, filters) to restore on the way back.
async function renderSong(id, back) {
  const token = ++screen;
  const song = await db.get('songs', id);
  if (!stillCurrent(token)) return;
  if (!song) {
    closeScreen(() => renderSongs({ ...back, message: 'That song is no longer in your library.' }));
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
    closeScreen(() => renderSongs({ ...back, message: `Deleted “${song.title}”.` }));
  }

  viewEl.replaceChildren(
    el('div', { class: 'stack song-detail' },
      backButton(() => closeScreen(() => renderSongs({ ...back, focusId: song.id }))),
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
          field('Tags', formatTags(song.tags))),
        errorBox,
        el('button', {
          type: 'button', class: 'btn kj-button', text: 'Show to the KJ',
          onclick: () => openScreen(() => renderKjCard(song.id, back)),
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

// The song full screen, in the biggest type that fits, to show the KJ (R54):
// title, artist and the key change. The header, tabs and banners hide while it
// is up (body[data-screen="kj"], cleared by the screen stack on any other
// render), so a phone turned to landscape gives the title the whole width.
async function renderKjCard(id, back) {
  const token = ++screen;
  const song = await db.get('songs', id);
  if (!stillCurrent(token)) return;
  if (!song) {
    closeScreen(() => renderSongs({ ...back, message: 'That song is no longer in your library.' }));
    return;
  }
  document.body.dataset.screen = 'kj';
  viewEl.replaceChildren(
    el('div', { class: 'kj-card', role: 'dialog', 'aria-label': 'Show to the KJ' },
      el('div', { class: 'kj-text' },
        el('p', { class: 'kj-title', text: song.title }),
        el('p', { class: 'kj-artist', text: song.artist }),
        song.key ? el('p', { class: 'kj-key', text: `Key ${song.key}` }) : null),
      el('div', { class: 'row kj-actions' },
        el('button', {
          type: 'button', class: 'btn', text: 'Details',
          onclick: () => openScreen(() => renderSong(song.id, back)),
        }),
        el('button', {
          type: 'button', class: 'btn primary', text: 'Close',
          onclick: () => closeScreen(() => renderSongs({ ...back, focusId: song.id })),
        }))));
  viewEl.scrollTop = 0;
}

function backButton(onclick) {
  return el('button', { type: 'button', class: 'btn back', onclick },
    el('span', { 'aria-hidden': 'true', text: '‹ ' }), 'Back to list');
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
