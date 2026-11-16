// The History scope (Design B): what was sung where (R8, R72), logging a sing
// by hand (R71) and the venues themselves (R40).
//   Venue chips across the top: each venue, then All venues. By song lists
//     every song sung there with times and last sung, most recent first, and
//     opens to its individual sings, each with Delete to undo a mis-tap
//     (R72); By night lists the same sings by date, newest first. The dock's
//     field searches the history by title or artist.
//   "Log a sing" opens the manual form on top (R71, R8): the venue, the song
//     found by typing (nothing lists until then, 20 at most) and the date,
//     today unless changed.
//   "Venues" opens the venue list on top: add, rename, and delete when no
//     sing uses it (R40). Tonight's "Manage venues…" opens the same screen,
//     renderVenues().
import { db, request } from '../db.js';
import {
  el, viewEl, confirmAction, openScreen, closeScreen, screenTicket, screenStillShowing, icon, ICONS,
} from '../ui.js';
import * as dock from '../dock.js';
import { filterSongs, sortByTitle, matchesQuery } from '../lib/search.js';
import {
  plural, todayLocalISO, isISODate, singStats, venueStats, statsRows, singsBySong,
  sortVenues, venueNameError, venueInUseMessage, describeVenueDelete,
} from '../lib/stats.js';
import { currentSetlistKey, nextSetlistKey } from '../lib/night.js';
import { VENUE_KEY } from './songs.js';

// Most songs the picker lists at once; more than this asks to narrow the search.
const MAX_PICKS = 20;

// The All venues chip.
const ALL = 'all';

// Kept while the app is open: the venue chip (a venue id or ALL; unset until
// History first shows, when it starts at Tonight's venue), By song or By
// night, and the dock's field.
let chosen;
let groupBy = 'song';
let query = '';

// Bumped on every screen change, so a slow load never paints over a newer screen.
let screen = 0;

function stillCurrent(token, ticket) {
  return token === screen && screenStillShowing(ticket);
}

const TRASH = ['M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'];

// ---------- Dates, as History words them ----------

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateParts(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day, weekday: new Date(year, month - 1, day).getDay() };
}

// 'Sat 14 Nov 2026' (shown in capitals).
function longDate(iso) {
  if (!isISODate(iso)) return String(iso);
  const { year, month, day, weekday } = dateParts(iso);
  return `${DAYS[weekday]} ${day} ${MONTHS[month - 1]} ${year}`;
}

// '14 Nov', or '14 Nov 2025' in another year than today's.
function shortDate(iso, today) {
  if (!isISODate(iso)) return String(iso);
  const { year, month, day } = dateParts(iso);
  const base = `${day} ${MONTHS[month - 1]}`;
  return String(year) === today.slice(0, 4) ? base : `${base} ${year}`;
}

// The Back button of a screen stacked on a scope: '‹ History', named "Back to History".
function backButton(scopeName) {
  return el('button', { class: 'back', type: 'button', 'aria-label': `Back to ${scopeName}`, onclick: () => closeScreen() },
    icon(['M15 6l-6 6 6 6'], { size: 20 }), scopeName);
}

const scopeName = () => (dock.currentScope() === 'tonight' ? 'Tonight' : 'History');

// ---------- History (R8, R72) ----------

export async function renderHistory() {
  const token = ++screen;
  const ticket = screenTicket();
  const [songs, venueRecords, singRecords, tonightVenue] = await Promise.all([
    db.getAll('songs'), db.getAll('venues'), db.getAll('sings'), db.get('meta', VENUE_KEY),
  ]);
  if (!stillCurrent(token, ticket)) return;
  const venues = sortVenues(venueRecords);
  const venueName = new Map(venues.map((v) => [v.id, v.name]));
  const today = todayLocalISO();
  let sings = singRecords;

  // Tonight's venue the first time, or when the chosen one has been deleted;
  // All venues when Tonight is under Overall.
  if (chosen !== ALL && !venueName.has(chosen)) {
    const wanted = tonightVenue ? tonightVenue.value : null;
    chosen = venueName.has(wanted) ? wanted : ALL;
  }
  const venueId = () => (chosen === ALL ? null : chosen);
  const where = () => (chosen === ALL ? 'every venue' : venueName.get(chosen));
  const expanded = new Set(); // songs left open in By song, kept across redraws

  const status = el('p', { class: 'status', role: 'status' });
  const header = el('header', { class: 'scope-head' },
    el('h2', { text: 'History' }),
    el('div', { class: 'head-actions' },
      el('button', {
        class: 'btn log-sing', type: 'button', 'aria-describedby': 'log-caption',
        onclick: () => openScreen(() => renderLogSing(venueId())),
      }, icon(ICONS.plus, { size: 16, width: 2.6 }), 'Log a sing'),
      el('button', { class: 'btn', type: 'button', text: 'Venues', onclick: () => openScreen(() => renderVenues()) })));
  const caption = el('p', { id: 'log-caption', class: 'muted caption', text: 'Log a sing you forgot, or one from another night' });

  // The venue chips: each venue, then All venues (R8's Overall).
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Show the history of' });
  function drawChips() {
    const chip = (value, text) => el('button', {
      type: 'button', class: 'chip', text, 'aria-pressed': String(chosen === value),
      onclick: () => {
        if (chosen === value) return;
        chosen = value;
        expanded.clear();
        drawAll();
      },
    });
    chips.replaceChildren(...venues.map((v) => chip(v.id, v.name)), chip(ALL, 'All venues'));
  }

  // By song or By night.
  const grouping = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Group the history' });
  function drawGrouping() {
    const option = (value, text) => el('button', {
      type: 'button', text, 'aria-pressed': String(groupBy === value),
      onclick: () => {
        if (groupBy === value) return;
        groupBy = value;
        drawGrouping();
        drawList();
      },
    });
    grouping.replaceChildren(option('song', 'By song'), option('night', 'By night'));
  }

  const count = el('p', { class: 'cap history-count' });
  const printHead = el('h2', { class: 'print-only' });
  const body = el('div', { class: 'history-body' });
  const empty = el('p', { class: 'muted empty' });

  // ---- A sing and its Delete (R72) ----

  // "Sun 1 Nov 2026", with " · tonight" for today's and the venue under All venues.
  function when(sing) {
    return el('span', { class: 'when' },
      el('span', { class: 'date', text: longDate(sing.date) }),
      sing.date === today ? el('span', { class: 'note', text: ' · tonight' }) : null,
      chosen === ALL ? el('span', { class: 'note', text: ` · ${venueName.get(sing.venueId) || 'Unknown venue'}` }) : null);
  }

  // What a sing's Delete and its confirmation call it: the date, and the venue under All venues.
  function singLabel(sing) {
    const day = longDate(sing.date);
    return chosen === ALL ? `${day} at ${venueName.get(sing.venueId) || 'an unknown venue'}` : day;
  }

  function deleteButton(sing, title) {
    const label = singLabel(sing);
    return el('button', {
      class: 'delete-sing', type: 'button', 'aria-label': `Delete sing of ${title} on ${label}`,
      onclick: async () => {
        if (!confirmAction(`Delete this sing of “${title}” on ${label}?`)) return;
        try {
          await db.delete('sings', sing.id);
          sings = await db.getAll('sings');
        } catch (err) {
          status.textContent = `Could not delete: ${err.message}`;
          return;
        }
        if (root.isConnected) drawList();
      },
    }, icon(TRASH, { size: 16, width: 2.2 }), 'Delete');
  }

  // ---- By song: one row per song, opening to its sings ----

  function songRow(row, entries) {
    const title = row.song ? row.song.title : 'Deleted song';
    const details = el('details', {},
      el('summary', {},
        el('span', { class: 'text' },
          el('span', { class: 'title', text: title }),
          row.song ? el('span', { class: 'sub', text: row.song.artist }) : null),
        el('span', { class: 'stat', text: `${row.count}× · ${shortDate(row.lastSung, today)}` }),
        icon(ICONS.chevron, { size: 18 })),
      el('ul', { class: 'entries', 'aria-label': `Each sing of ${title}` },
        ...entries.map((sing) => el('li', { 'data-sing-id': sing.id }, when(sing), deleteButton(sing, title)))));
    details.open = expanded.has(row.songId);
    details.addEventListener('toggle', () => {
      if (details.open) expanded.add(row.songId);
      else expanded.delete(row.songId);
    });
    return el('li', { 'data-song-id': row.songId }, details);
  }

  // ---- By night: the same sings by date, newest first ----

  function nightSections(here, songsById) {
    const byDate = new Map();
    const sorted = [...here].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.id ?? 0) - (a.id ?? 0)));
    for (const sing of sorted) {
      if (!byDate.has(sing.date)) byDate.set(sing.date, []);
      byDate.get(sing.date).push(sing);
    }
    return [...byDate].map(([date, list]) => el('section', { class: 'history-night', 'aria-label': longDate(date) },
      el('h3', { class: 'cap' }, longDate(date), date === today ? el('span', { class: 'note', text: ' · tonight' }) : null),
      el('ul', { class: 'list' }, ...list.map((sing) => {
        const song = songsById.get(sing.songId);
        const title = song ? song.title : 'Deleted song';
        const sub = [song ? song.artist : '', chosen === ALL ? venueName.get(sing.venueId) || 'Unknown venue' : '']
          .filter(Boolean).join(' · ');
        return el('li', { class: 'night-row', 'data-sing-id': sing.id, 'data-song-id': sing.songId },
          el('span', { class: 'text' },
            el('span', { class: 'title', text: title }),
            sub ? el('span', { class: 'sub', text: sub }) : null),
          deleteButton(sing, title));
      }))));
  }

  // ---- Drawing ----

  function drawList() {
    const songsById = new Map(songs.map((s) => [s.id, s]));
    const text = query.trim();
    // A sing whose song is gone still shows, so it can be deleted, until the field narrows the list.
    // The query goes in untrimmed: a trailing space asks for whole words (R10).
    const matches = (songId) => (text ? !!songsById.get(songId) && matchesQuery(songsById.get(songId), query) : true);
    const here = sings.filter((s) => (venueId() == null || s.venueId === venueId()) && matches(s.songId));
    const total = here.length;
    if (groupBy === 'song') {
      const rows = statsRows(songs, singStats(here, null));
      const entries = singsBySong(here, null);
      count.textContent = total ? `${plural(total, 'sing', 'sings')} of ${plural(rows.length, 'song', 'songs')} · recent first` : '';
      body.replaceChildren(el('ul', { class: 'list history', 'aria-label': 'Sing history' },
        ...rows.map((row) => songRow(row, entries.get(row.songId)))));
    } else {
      const nights = nightSections(here, songsById);
      count.textContent = total ? `${plural(total, 'sing', 'sings')} on ${plural(nights.length, 'night', 'nights')} · newest first` : '';
      body.replaceChildren(...nights);
    }
    body.hidden = total === 0;
    const none = chosen === ALL ? 'Nothing sung yet. Log a sing, or tap Sang it on Tonight.' : `Nothing sung at ${where()} yet.`;
    empty.textContent = total ? '' : text && sings.some((s) => venueId() == null || s.venueId === venueId())
      ? `Nothing in this history matches “${text}”.` : none;
    empty.hidden = !!total;
  }

  function drawAll() {
    drawChips();
    printHead.textContent = chosen === ALL ? 'All venues' : where();
    drawList();
    dock.search({
      placeholder: chosen === ALL ? 'Search every venue\'s history' : `Search ${where()}'s history`,
      value: query,
      onInput: (value) => {
        if (!root.isConnected) return;
        query = value;
        drawList();
      },
    });
  }

  const root = el('div', { class: 'stack history-view' },
    header,
    caption,
    chips,
    el('div', { class: 'history-bar' }, grouping, count),
    status,
    printHead,
    body,
    empty);
  viewEl.replaceChildren(root);
  viewEl.scrollTop = 0;
  drawGrouping();
  dock.filters(null);
  drawAll();
}

// ---------- Log a sing (R71, R8) ----------

// `venueId` is the venue History shows (null under All venues); the form
// starts there, else at Tonight's venue, else the first by name.
async function renderLogSing(venueId) {
  const token = ++screen;
  const ticket = screenTicket();
  const [songs, venueRecords, tonightVenue] = await Promise.all([
    db.getAll('songs'), db.getAll('venues'), db.get('meta', VENUE_KEY),
  ]);
  if (!stillCurrent(token, ticket)) return;
  const venues = sortVenues(venueRecords);
  const sorted = sortByTitle(songs);
  let picked = null;

  const show = (...children) => {
    viewEl.replaceChildren(el('div', { class: 'stack log-view' },
      backButton('History'),
      el('h2', { text: 'Log a sing' }),
      el('p', { class: 'muted caption', text: 'Log a sing you forgot, or one from another night.' }),
      ...children));
    viewEl.scrollTop = 0;
  };

  // A sing is logged at a venue, so there has to be one.
  if (!venues.length) {
    show(el('p', { class: 'muted', text: 'Add a venue first: each sing is logged at one.' }),
      el('button', {
        class: 'btn primary', type: 'button', text: 'Venues', onclick: () => openScreen(() => renderVenues({ back: 'Log a sing' })),
      }));
    return;
  }

  const start = [venueId, tonightVenue ? tonightVenue.value : null].find((id) => venues.some((v) => v.id === id));
  const venueInput = el('select', { name: 'venue', id: 'log-venue' },
    ...venues.map((v) => el('option', { value: String(v.id), text: v.name })));
  if (start != null) venueInput.value = String(start);

  const search = el('input', {
    type: 'search', placeholder: 'Search title or artist', 'aria-label': 'Find a song to log', autocomplete: 'off',
    oninput: () => drawPicks(),
  });
  const pickCount = el('p', { class: 'count' });
  const picks = el('ul', { class: 'picks', 'aria-label': 'Matching songs' });
  const pickedLine = el('p', { class: 'picked', 'aria-live': 'polite' });
  const date = el('input', { type: 'date', name: 'date', required: '', value: todayLocalISO() });
  const error = el('p', { class: 'error', role: 'alert' });
  const status = el('p', { class: 'status', role: 'status' });

  function drawPicked() {
    pickedLine.textContent = picked ? `Song: ${picked.title} — ${picked.artist}` : 'No song picked yet.';
  }

  function drawPicks() {
    const text = search.value.trim();
    // A blank search lists nothing: the first 20 of hundreds helps nobody.
    const matches = text ? filterSongs(sorted, search.value) : []; // untrimmed: a trailing space asks for whole words
    if (!songs.length) pickCount.textContent = 'No songs yet. Add some under Songs first.';
    else if (!text) pickCount.textContent = `Type to find one of ${plural(songs.length, 'song', 'songs')}.`;
    else if (!matches.length) pickCount.textContent = 'No songs match.';
    else if (matches.length > MAX_PICKS) {
      pickCount.textContent = `Showing ${MAX_PICKS} of ${plural(matches.length, 'match', 'matches')}. Type more to narrow the search.`;
    } else pickCount.textContent = plural(matches.length, 'match', 'matches');

    picks.replaceChildren(...matches.slice(0, MAX_PICKS).map((song) =>
      el('li', {},
        el('button', {
          class: 'pick', type: 'button', 'aria-pressed': String(!!picked && picked.id === song.id),
          'aria-label': `${song.title} by ${song.artist}`,
          onclick: () => {
            picked = song;
            error.textContent = '';
            drawPicks();
            drawPicked();
          },
        },
        el('span', { class: 'title', text: song.title }),
        el('span', { class: 'sub', text: song.artist })))));
  }

  const form = el('form', { class: 'card stack', 'aria-label': 'Log a sing' },
    // The label beside the menu rather than around it, so the menu's name is just "Venue".
    el('div', { class: 'log-field' }, el('label', { for: 'log-venue', text: 'Venue' }), venueInput),
    search, pickCount, picks, pickedLine,
    el('label', { text: 'Date' }, date),
    el('button', { class: 'btn primary', type: 'submit', text: 'Log sing' }),
    error, status);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = '';
    const venue = venues.find((v) => String(v.id) === venueInput.value);
    if (!picked) {
      error.textContent = 'Pick a song first.';
      search.focus();
      return;
    }
    if (!isISODate(date.value)) {
      error.textContent = 'Pick the date you sang it.';
      date.focus();
      return;
    }
    if (!venue) {
      error.textContent = 'Pick the venue.';
      venueInput.focus();
      return;
    }
    error.textContent = '';
    // Clear the pick before awaiting, so a double tap cannot log the song twice.
    const song = picked;
    picked = null;
    try {
      await db.add('sings', { songId: song.id, venueId: venue.id, date: date.value });
    } catch (err) {
      error.textContent = `Could not log it: ${err.message}`;
      return;
    }
    status.textContent = `Logged “${song.title}” at ${venue.name} on ${longDate(date.value)}.`;
    search.value = '';
    drawPicks();
    drawPicked();
  });

  show(form);
  drawPicks();
  drawPicked();
}

// ---------- Venues (R40) ----------

// "3 sings · last 1 Nov", or "No sings yet".
function summaryText(stats, today) {
  return stats && stats.count ? `${plural(stats.count, 'sing', 'sings')} · last ${shortDate(stats.lastSung, today)}` : 'No sings yet';
}

// Deletes a venue in one transaction (R40, R56): setlists labelled for it
// become Any venue, and Tonight's memory of its current set and its Next
// time list goes. Refuses, without changing anything, when a sing still uses
// the venue (one could have been logged since the check before confirming).
function deleteVenue(venueId) {
  return db.transaction(['venues', 'sings', 'setlists', 'meta'], 'readwrite', async (stores) => {
    const sings = await request(stores.sings.index('venueId').count(venueId));
    if (sings) throw new Error('a sing was logged there meanwhile');
    for (const setlist of await request(stores.setlists.index('venueId').getAll(venueId))) {
      stores.setlists.put({ ...setlist, venueId: null });
    }
    stores.meta.delete(currentSetlistKey(venueId));
    stores.meta.delete(nextSetlistKey(venueId));
    stores.venues.delete(venueId);
  });
}

// The venue list, stacked on History (its "Venues" button), on Tonight
// ("Manage venues…") or on Log a sing; Back returns there and `back` names it
// (the scope showing when left out).
export async function renderVenues({ back = null } = {}) {
  const backTo = back || scopeName();
  const token = ++screen;
  const ticket = screenTicket();
  const [venueRecords, sings] = await Promise.all([db.getAll('venues'), db.getAll('sings')]);
  if (!stillCurrent(token, ticket)) return;
  const venues = sortVenues(venueRecords);
  const perVenue = venueStats(sings);
  const today = todayLocalISO();

  const nameInput = el('input', { name: 'name', required: '', autocomplete: 'off' });
  const addError = el('p', { class: 'error', role: 'alert' });
  const form = el('form', { class: 'card stack', 'aria-label': 'Add a venue' },
    el('label', { text: 'Venue name' }, nameInput),
    el('button', { class: 'btn primary', type: 'submit', text: 'Add venue' }),
    addError);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const problem = venueNameError(nameInput.value, venues);
    if (problem) {
      addError.textContent = problem;
      nameInput.focus();
      return;
    }
    try {
      await db.add('venues', { name: nameInput.value.trim() });
    } catch (err) {
      addError.textContent = `Could not save the venue. ${(err && err.message) || err}`;
      return;
    }
    renderVenues({ back: backTo });
  });

  function venueRow(venue) {
    const li = el('li', { class: 'venue-row', 'data-venue-id': venue.id });
    const message = el('p', { class: 'error', role: 'alert' });

    function showNormal() {
      li.replaceChildren(
        el('span', { class: 'text' },
          el('span', { class: 'title', text: venue.name }),
          el('span', { class: 'sub', text: summaryText(perVenue.get(venue.id), today) })),
        el('div', { class: 'actions' },
          el('button', {
            class: 'btn', type: 'button', text: 'Rename', 'aria-label': `Rename ${venue.name}`, onclick: showRename,
          }),
          el('button', {
            class: 'btn danger', type: 'button', text: 'Delete', 'aria-label': `Delete ${venue.name}`, onclick: remove,
          })),
        message);
    }

    function showRename() {
      const input = el('input', {
        name: 'name', required: '', autocomplete: 'off', value: venue.name, 'aria-label': `New name for ${venue.name}`,
      });
      const error = el('p', { class: 'error', role: 'alert' });
      const renameForm = el('form', { class: 'stack', 'aria-label': `Rename ${venue.name}` },
        input,
        el('div', { class: 'row' },
          el('button', { class: 'btn primary', type: 'submit', text: 'Save' }),
          el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: showNormal })),
        error);
      renameForm.addEventListener('keydown', (e) => { if (e.key === 'Escape') showNormal(); });
      renameForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const problem = venueNameError(input.value, venues, venue.id);
        if (problem) {
          error.textContent = problem;
          input.focus();
          return;
        }
        try {
          await db.put('venues', { id: venue.id, name: input.value.trim() });
        } catch (err) {
          error.textContent = `Could not rename the venue. ${(err && err.message) || err}`;
          return;
        }
        renderVenues({ back: backTo });
      });
      li.replaceChildren(renameForm);
      input.focus();
    }

    // Hard delete, and only when no sing uses the venue (owner's decision).
    // Setlists labelled for it become Any venue (R56).
    async function remove() {
      message.textContent = '';
      const [venueSings, labelled] = await Promise.all([
        db.getAllByIndex('sings', 'venueId', venue.id),
        db.getAllByIndex('setlists', 'venueId', venue.id),
      ]);
      const inUse = venueInUseMessage(venue.name, venueSings.length);
      if (inUse) {
        message.textContent = inUse;
        return;
      }
      if (!confirmAction(describeVenueDelete(venue.name, labelled.length))) return;
      try {
        await deleteVenue(venue.id);
      } catch (err) {
        message.textContent = `Could not delete “${venue.name}”: ${err.message}.`;
        return;
      }
      renderVenues({ back: backTo });
    }

    showNormal();
    return li;
  }

  const list = el('ul', { class: 'list', 'aria-label': 'Venues' }, ...venues.map(venueRow));
  if (!venues.length) list.append(el('li', { class: 'muted', text: 'No venues yet. Add your first one above.' }));

  viewEl.replaceChildren(el('div', { class: 'stack venues-view' },
    backButton(backTo),
    el('h2', { text: 'Venues' }),
    form,
    list));
  viewEl.scrollTop = 0;
}
