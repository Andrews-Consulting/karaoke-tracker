// Venues view: add, rename and delete venues (R40); log each sing and show
// times sung and last sung, per venue and overall (R8).
//
// Three screens in one tab: the venue list, one venue (log a sing and its
// history) and "Overall" (history across every venue). renderVenues() always
// shows the list, so tapping the Venues tab is a way back as well.
import { db } from '../db.js';
import { el, viewEl, confirmAction } from '../ui.js';
import { filterSongs, sortByTitle } from '../lib/search.js';
import {
  plural, todayLocalISO, isISODate, singStats, venueStats, totals, statsRows, singsBySong,
  sortVenues, venueNameError, venueInUseMessage,
} from '../lib/stats.js';

// Most songs the picker lists at once; more than this asks to narrow the search.
const MAX_PICKS = 20;

// Bumped on every screen change, so a slow load never paints over a newer screen.
let screen = 0;

function show(...children) {
  viewEl.replaceChildren(el('div', { class: 'stack venues-view' }, ...children));
  viewEl.scrollTop = 0;
}

function summaryText(stats) {
  return stats && stats.count ? `${plural(stats.count, 'sing', 'sings')} · last ${stats.lastSung}` : 'No sings yet';
}

function backButton() {
  return el('button', { class: 'btn back', type: 'button', text: '‹ All venues', onclick: () => renderVenues() });
}

// ---------- Venue list (R40) ----------

export async function renderVenues() {
  const token = ++screen;
  const [venueRecords, sings] = await Promise.all([db.getAll('venues'), db.getAll('sings')]);
  if (token !== screen) return;
  const venues = sortVenues(venueRecords);
  const perVenue = venueStats(sings);

  const nameInput = el('input', { name: 'name', required: '', autocomplete: 'off' });
  const addError = el('p', { class: 'error', role: 'alert' });
  const form = el('form', { class: 'stack', 'aria-label': 'Add a venue' },
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
    await db.add('venues', { name: nameInput.value.trim() });
    renderVenues();
  });

  function venueRow(venue) {
    const li = el('li', { class: 'venue-row', 'data-venue-id': venue.id });
    const message = el('p', { class: 'error', role: 'alert' });

    function showNormal() {
      li.replaceChildren(
        el('button', {
          class: 'open', type: 'button', 'aria-label': `Open ${venue.name}`,
          onclick: () => renderVenue(venue.id),
        },
        el('span', { class: 'title', text: venue.name }),
        el('span', { class: 'sub', text: summaryText(perVenue.get(venue.id)) })),
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
        await db.put('venues', { id: venue.id, name: input.value.trim() });
        renderVenues();
      });
      li.replaceChildren(renameForm);
      input.focus();
    }

    // Hard delete, and only when no sing or setlist uses the venue (owner's decision).
    async function remove() {
      message.textContent = '';
      const [venueSings, venueSetlists] = await Promise.all([
        db.getAllByIndex('sings', 'venueId', venue.id),
        db.getAllByIndex('setlists', 'venueId', venue.id),
      ]);
      const inUse = venueInUseMessage(venue.name, venueSings.length, venueSetlists.length);
      if (inUse) {
        message.textContent = inUse;
        return;
      }
      if (!confirmAction(`Delete the venue “${venue.name}”?`)) return;
      await db.delete('venues', venue.id);
      renderVenues();
    }

    showNormal();
    return li;
  }

  const overallRow = el('li', { class: 'venue-row' },
    el('button', { class: 'open', type: 'button', 'aria-label': 'Open overall stats', onclick: () => renderOverall() },
      el('span', { class: 'title', text: 'Overall' }),
      el('span', { class: 'sub', text: `All venues · ${summaryText(totals(sings))}` })));

  const list = el('ul', { class: 'list', 'aria-label': 'Venues' }, overallRow, ...venues.map(venueRow));
  if (!venues.length) list.append(el('li', { class: 'muted', text: 'No venues yet. Add your first one above.' }));

  show(el('div', { class: 'card' }, form), list);
}

// ---------- Sing history (R8) ----------

// One row per song with times sung and last sung, most recently sung first.
// Each row opens to the individual sings, which can be deleted to undo a mis-tap.
// venueId null = every venue.
function makeHistory({ songs, venues, venueId, emptyText }) {
  const count = el('p', { class: 'count' });
  const list = el('ul', { class: 'list history', 'aria-label': 'Sing history' });
  const venueName = new Map(venues.map((v) => [v.id, v.name]));
  const expanded = new Set(); // songIds left open, kept across redraws

  function entryRow(sing, title) {
    const where = venueId == null ? ` at ${venueName.get(sing.venueId) || 'unknown venue'}` : '';
    const label = `${sing.date}${where}`;
    return el('li', {},
      el('span', { text: label }),
      el('button', {
        class: 'btn', type: 'button', text: 'Delete', 'aria-label': `Delete sing of ${title} on ${label}`,
        onclick: async () => {
          if (!confirmAction(`Delete this sing of “${title}” on ${label}?`)) return;
          await db.delete('sings', sing.id);
          refresh();
        },
      }));
  }

  function songRow(row, entries) {
    const title = row.song ? row.song.title : 'Deleted song';
    const sub = [row.song && row.song.artist, `Sung ${plural(row.count, 'time', 'times')}`, `Last sung ${row.lastSung}`];
    const details = el('details', {},
      el('summary', {},
        el('span', { class: 'text' },
          el('span', { class: 'title', text: title }),
          el('span', { class: 'sub', text: sub.filter(Boolean).join(' · ') }))),
      el('ul', { class: 'entries' }, ...entries.map((sing) => entryRow(sing, title))));
    details.open = expanded.has(row.songId);
    details.addEventListener('toggle', () => {
      if (details.open) expanded.add(row.songId);
      else expanded.delete(row.songId);
    });
    return el('li', { 'data-song-id': row.songId }, details);
  }

  function draw(sings) {
    const rows = statsRows(songs, singStats(sings, venueId));
    const entries = singsBySong(sings, venueId);
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    count.textContent = total ? `${plural(total, 'sing', 'sings')} of ${plural(rows.length, 'song', 'songs')}` : '';
    list.replaceChildren(...rows.map((row) => songRow(row, entries.get(row.songId))));
    if (!rows.length) list.append(el('li', { class: 'muted', text: emptyText }));
  }

  async function refresh() {
    draw(await db.getAll('sings'));
  }

  return { element: el('div', { class: 'stack' }, count, list), draw, refresh };
}

// ---------- One venue: log a sing and its history (R8) ----------

async function renderVenue(venueId) {
  const token = ++screen;
  const [venue, songs, sings] = await Promise.all([
    db.get('venues', venueId), db.getAll('songs'), db.getAll('sings'),
  ]);
  if (token !== screen) return;
  if (!venue) {
    renderVenues();
    return;
  }

  const sorted = sortByTitle(songs);
  let picked = null;

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
    const query = search.value.trim();
    const matches = filterSongs(sorted, query);
    const noun = query ? ['match', 'matches'] : ['song', 'songs'];
    if (!songs.length) pickCount.textContent = 'No songs yet. Add some in the Songs tab first.';
    else if (!matches.length) pickCount.textContent = 'No songs match.';
    else if (matches.length > MAX_PICKS) {
      pickCount.textContent = `Showing ${MAX_PICKS} of ${plural(matches.length, ...noun)}. Type more to narrow the search.`;
    } else pickCount.textContent = plural(matches.length, ...noun);

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

  const form = el('form', { class: 'stack', 'aria-label': 'Log a sing' },
    el('strong', { text: 'Log a sing' }),
    search, pickCount, picks, pickedLine,
    el('label', { text: 'Date' }, date),
    el('button', { class: 'btn primary', type: 'submit', text: 'Log sing' }),
    error, status);

  const history = makeHistory({
    songs, venues: [venue], venueId: venue.id, emptyText: 'Nothing sung here yet.',
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = '';
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
    error.textContent = '';
    // Clear the pick before awaiting, so a double tap cannot log the song twice.
    const song = picked;
    picked = null;
    await db.add('sings', { songId: song.id, venueId: venue.id, date: date.value });
    status.textContent = `Logged “${song.title}” on ${date.value}.`;
    search.value = '';
    drawPicks();
    drawPicked();
    history.refresh();
  });

  show(
    backButton(),
    el('h2', { text: venue.name }),
    el('div', { class: 'card' }, form),
    el('h3', { text: 'Sung here' }),
    history.element);
  drawPicks();
  drawPicked();
  history.draw(sings);
}

// ---------- Overall: every venue (R8) ----------

async function renderOverall() {
  const token = ++screen;
  const [venues, songs, sings] = await Promise.all([db.getAll('venues'), db.getAll('songs'), db.getAll('sings')]);
  if (token !== screen) return;

  const history = makeHistory({
    songs, venues, venueId: null, emptyText: 'Nothing sung yet. Open a venue to log a sing.',
  });
  show(
    backButton(),
    el('h2', { text: 'Overall' }),
    el('p', { class: 'muted', text: 'Times sung and last sung across every venue.' }),
    history.element);
  history.draw(sings);
}
