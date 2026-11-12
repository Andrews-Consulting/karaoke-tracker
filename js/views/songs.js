// Songs view: the list with add and search (R1, R10), find by venue, sings,
// tag, status, rating, genre and decade with times sung per song (R37, R41,
// R11, R42, R8), sorted by any of the R42 and R12 orders, and one song's
// detail with a video search link (R38), edit form and delete (R2, R3, R36;
// the edit form also holds tags, key, status and rating). Stays quick with
// 1,000 songs (R34): rows are built once and at most PAGE_SIZE are drawn at a time.
import { db, request } from '../db.js';
import { el, viewEl, confirmAction, openScreen, closeScreen } from '../ui.js';
import {
  makeSong, updateSong, validateSong, planSongDelete, describeSongDelete,
  SONG_STATUSES, STATUS_LABELS, RATINGS, statusLabel, formatRating, formatTags,
} from '../lib/song.js';
import { singStats, sortVenues } from '../lib/stats.js';
import {
  SUNG_NOT_SINCE, SORT_MENU, MIN_RATING_OPTIONS, defaultFilters, decadeLabel, filterChoices, sungOptions,
  countActiveFilters, applyFind, sungParts, titleOrder,
} from '../lib/find.js';

// The meta record that remembers the list's venue across visits and reloads (R37).
const VENUE_KEY = 'findVenueId';

// How many rows the list draws at first, and adds with each "Show more" (R34).
// The count line always gives the full number that match.
const PAGE_SIZE = 200;

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
function sungLine(parts) {
  const children = [];
  for (const part of parts) {
    if (children.length) children.push(' · ');
    children.push(el('span', { class: 'nowrap', text: part }));
  }
  return el('span', { class: 'sung' }, ...children);
}

// The list. Coming back from a song passes back what the list showed, so it
// is restored: the search (`query`), the venue (`venueId`; undefined means the
// one remembered in meta), the filters and sort (`filters`) and whether the
// filters were open (`filtersOpen`). Also the song to scroll to (`focusId`)
// and an optional status line (`message`).
export async function renderSongs({
  query = '', venueId, filters = defaultFilters(), filtersOpen = false, focusId = null, message = '',
} = {}) {
  const [songRecords, venueRecords, sings, saved] = await Promise.all([
    db.getAll('songs'),
    db.getAll('venues'),
    db.getAll('sings'),
    venueId === undefined ? db.get('meta', VENUE_KEY) : null,
  ]);
  const songs = titleOrder(songRecords);
  const venues = sortVenues(venueRecords);

  // A remembered venue that has since been deleted falls back to Overall.
  const wanted = venueId === undefined ? (saved ? saved.value : null) : venueId;
  const state = {
    query,
    venueId: venues.some((v) => v.id === wanted) ? wanted : null,
    filters: { ...defaultFilters(), ...filters },
  };
  let stats = singStats(sings, state.venueId);

  // What to restore when coming back from a song.
  const backState = () => ({
    query: state.query, venueId: state.venueId, filters: { ...state.filters }, filtersOpen: filtersBox.open,
  });

  const count = el('p', { class: 'count' });
  const list = el('ul', { class: 'list' });

  // What the search, filters and sort give (`shown`), how many of those rows
  // are drawn (`limit`), and each song's row, built the first time it is
  // drawn and reused until the venue changes its sing line.
  let shown = [];
  let limit = PAGE_SIZE;
  const rows = new Map();

  function rowFor(s) {
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
      added[0]?.querySelector('button').focus({ preventScroll: true });
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
      el('button', {
        type: 'button', class: 'song-row',
        onclick: () => {
          const back = backState();
          openScreen(() => renderSong(s.id, back));
        },
      },
        el('span', { class: 'title', text: s.title }),
        el('span', { class: 'sub', text: details }),
        sungLine(sungParts(stats.get(s.id), state.venueId != null))));
  }

  // Runs the search, filters and sort again and draws the first page of rows.
  function draw() {
    shown = applyFind(songs, stats, state.filters, state.query);
    count.textContent = `${shown.length} of ${songs.length} songs`;
    drawRows(PAGE_SIZE);
  }

  // Draws the first `n` rows of `shown`.
  function drawRows(n) {
    limit = n;
    const items = shown.slice(0, limit).map(rowFor);
    if (songs.length === 0) {
      items.push(el('li', { class: 'muted', text: 'No songs yet. Add your first one above.' }));
    } else if (shown.length === 0) {
      items.push(el('li', { class: 'muted', text: 'No songs match the search and filters.' }));
    }
    setChildren(list, items);
    showMoreButton();
  }

  // ---- Venue (R37) ----

  const venueSelect = fillSelect(el('select', { name: 'venue' }),
    [['', 'Overall'], ...venues.map((v) => [String(v.id), v.name])],
    state.venueId == null ? '' : String(state.venueId));
  venueSelect.addEventListener('change', () => {
    const venue = venues.find((v) => String(v.id) === venueSelect.value);
    state.venueId = venue ? venue.id : null;
    stats = singStats(sings, state.venueId);
    rows.clear(); // every row's sing line is for the old venue
    db.put('meta', { key: VENUE_KEY, value: state.venueId })
      .catch((err) => console.warn('Could not remember the venue:', err));
    syncFilters();
    draw(); // also re-sorts, for the last-sung orders (R12)
  });

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
    fillSelect(statusSelect, [['', 'Any status'], ...SONG_STATUSES.map((s) => [s, STATUS_LABELS[s]])], f.status);
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
        syncFilters();
        draw();
      },
    }));
  filtersForm.addEventListener('submit', (e) => e.preventDefault());

  const filtersBox = el('details', { class: 'card find-filters' }, summary, filtersForm);
  filtersBox.open = filtersOpen;
  syncFilters();

  const errorBox = el('p', { class: 'error', role: 'alert', hidden: '' });
  const form = el('form', { class: 'stack', 'aria-label': 'Add a song' },
    textField('Title', { name: 'title', required: '' }),
    textField('Artist', { name: 'artist', required: '' }),
    el('div', { class: 'row' }, textField('Genre', { name: 'genre' }), yearField()),
    errorBox,
    el('button', { class: 'btn primary', type: 'submit', text: 'Add song' }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const fields = {
      title: data.get('title'),
      artist: data.get('artist'),
      genre: data.get('genre'),
      year: data.get('year'),
    };
    if (showErrors(form, errorBox, validateSong(fields))) return;
    await db.add('songs', makeSong(fields));
    // Search and filters start afresh so the new song shows; the venue stays.
    renderSongs({ venueId: state.venueId });
  });

  viewEl.replaceChildren(
    el('div', { class: 'stack' },
      el('details', { class: 'card' }, el('summary', { text: 'Add a song' }), form),
      message ? el('p', { class: 'notice', role: 'status', text: message }) : null,
      findField('Venue', venueSelect),
      search,
      filtersBox,
      count,
      list,
      moreButton));
  draw();

  if (focusId != null) {
    // Coming back from a song further down than the first page draws enough pages to reach it.
    const index = shown.findIndex((s) => s.id === focusId);
    if (index >= limit) drawRows(Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE);
    const row = list.querySelector(`[data-song-id="${focusId}"] button`);
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
  const song = await db.get('songs', id);
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
      select('status', SONG_STATUSES.map((s) => [s, STATUS_LABELS[s]]), song.status)),
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
