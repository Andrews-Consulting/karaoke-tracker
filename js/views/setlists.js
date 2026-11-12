// Setlists view: create, edit and delete setlists, each general or tied to one
// venue (R14, R39); add and remove songs (R15); flag songs already sung at the
// setlist's venue, with the date last sung there (R43).
//
// Two screens in one tab: the setlist list and one setlist. renderSetlists()
// always shows the list, so tapping the Setlists tab is a way back as well.
import { db } from '../db.js';
import { el, viewEl, confirmAction, openScreen, closeScreen } from '../ui.js';
import { plural, sortVenues } from '../lib/stats.js';
import {
  setlistNameError, sortSetlists, venueValue, venueIdFromValue, venueOptions, venueLabel, venueLine,
  makeSetlist, updateSetlist, describeSetlistDelete, addSongId, removeSongId, setlistSongs,
  pickableSongs, sungFlags,
} from '../lib/setlist.js';

// Most songs the picker lists at once; more than this asks to narrow the search.
const MAX_PICKS = 20;

// Bumped on every screen change, so a slow load never paints over a newer screen.
let screen = 0;

// True while a load started with `token` should still be shown: no newer
// setlist screen has started and the Setlists tab is still the selected one.
function stillCurrent(token) {
  const tab = document.querySelector('.tabs button[data-view="setlists"]');
  return token === screen && (!tab || tab.getAttribute('aria-current') === 'page');
}

function show(...children) {
  viewEl.replaceChildren(el('div', { class: 'stack setlists-view' }, ...children));
  viewEl.scrollTop = 0;
}

// A muted line of "a · b" where each part stays on one line.
function subLine(parts) {
  const children = [];
  for (const part of parts.filter(Boolean)) {
    if (children.length) children.push(' · ');
    children.push(el('span', { class: 'nowrap', text: part }));
  }
  return el('span', { class: 'sub' }, ...children);
}

// The venue <select> (R39): General, then every venue by name.
function venueSelect(venues, venueId) {
  const select = el('select', { name: 'venue' },
    ...venueOptions(venues, venueId).map((o) => el('option', { value: o.value, text: o.label })));
  select.value = venueValue(venueId);
  return select;
}

// ---------- Setlist list (R14, R39) ----------

export async function renderSetlists() {
  const token = ++screen;
  const [setlistRecords, venueRecords, songs] = await Promise.all([
    db.getAll('setlists'), db.getAll('venues'), db.getAll('songs'),
  ]);
  if (!stillCurrent(token)) return;
  const setlists = sortSetlists(setlistRecords);
  const venues = sortVenues(venueRecords);
  const songsById = new Map(songs.map((s) => [s.id, s]));
  let saving = false; // stops a double tap from saving twice

  const nameInput = el('input', { name: 'name', required: '', autocomplete: 'off' });
  const venueInput = venueSelect(venues, null);
  const addError = el('p', { class: 'error', role: 'alert' });
  // novalidate: an empty name gets the same inline error as a blank one.
  const form = el('form', { class: 'stack', 'aria-label': 'New setlist', novalidate: '' },
    el('h2', { text: 'New setlist' }),
    el('label', { text: 'Setlist name' }, nameInput),
    el('label', { text: 'Venue' }, venueInput),
    venues.length ? null : el('p', { class: 'count', text: 'Add venues in the Venues tab to tie a setlist to one.' }),
    el('button', { class: 'btn primary', type: 'submit', text: 'Create setlist' }),
    addError);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    const problem = setlistNameError(nameInput.value, setlists);
    if (problem) {
      addError.textContent = problem;
      nameInput.focus();
      return;
    }
    saving = true;
    await db.add('setlists', makeSetlist(nameInput.value, venueIdFromValue(venueInput.value)));
    renderSetlists();
  });

  function setlistRow(setlist) {
    const li = el('li', { class: 'setlist-row', 'data-setlist-id': setlist.id });
    const songCount = setlistSongs(setlist, songsById).length;

    function showNormal() {
      li.replaceChildren(
        el('button', {
          class: 'open', type: 'button', 'aria-label': `Open ${setlist.name}`,
          onclick: () => openScreen(() => renderSetlist(setlist.id)),
        },
        el('span', { class: 'title', text: setlist.name }),
        subLine([venueLabel(setlist, venues), plural(songCount, 'song', 'songs')])),
        el('div', { class: 'actions' },
          el('button', {
            class: 'btn', type: 'button', text: 'Edit', 'aria-label': `Edit ${setlist.name}`, onclick: showEdit,
          }),
          el('button', {
            class: 'btn danger', type: 'button', text: 'Delete', 'aria-label': `Delete ${setlist.name}`, onclick: remove,
          })));
    }

    // Name and venue in one inline form (R14 rename, R39 change venue or General).
    function showEdit() {
      const input = el('input', { name: 'name', required: '', autocomplete: 'off', value: setlist.name });
      const select = venueSelect(venues, setlist.venueId);
      const error = el('p', { class: 'error', role: 'alert' });
      const editForm = el('form', { class: 'stack', 'aria-label': `Edit ${setlist.name}`, novalidate: '' },
        el('label', { text: 'Setlist name' }, input),
        el('label', { text: 'Venue' }, select),
        el('div', { class: 'row' },
          el('button', { class: 'btn primary', type: 'submit', text: 'Save' }),
          el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: showNormal })),
        error);
      editForm.addEventListener('keydown', (e) => { if (e.key === 'Escape') showNormal(); });
      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (saving) return;
        const problem = setlistNameError(input.value, setlists, setlist.id);
        if (problem) {
          error.textContent = problem;
          input.focus();
          return;
        }
        saving = true;
        await db.put('setlists', updateSetlist(setlist, input.value, venueIdFromValue(select.value)));
        renderSetlists();
      });
      li.replaceChildren(editForm);
      input.focus();
    }

    // Deletes only the setlist record; its songs, sings and venue stay.
    async function remove() {
      if (!confirmAction(describeSetlistDelete(setlist))) return;
      await db.delete('setlists', setlist.id);
      renderSetlists();
    }

    showNormal();
    return li;
  }

  const list = el('ul', { class: 'list', 'aria-label': 'Setlists' }, ...setlists.map(setlistRow));
  const empty = setlists.length
    ? null
    : el('p', { class: 'muted empty', text: 'No setlists yet. Create one above, then add songs to it.' });

  show(el('div', { class: 'card' }, form), list, empty);
}

// ---------- One setlist: its songs (R15) and already-sung flags (R43) ----------

async function renderSetlist(id) {
  const token = ++screen;
  const [found, venues, songs, sings] = await Promise.all([
    db.get('setlists', id), db.getAll('venues'), db.getAll('songs'), db.getAll('sings'),
  ]);
  if (!stillCurrent(token)) return;
  if (!found) {
    closeScreen(() => renderSetlists());
    return;
  }

  // The latest state, updated before each save so quick taps build on each other.
  let setlist = found;
  const songsById = new Map(songs.map((s) => [s.id, s]));

  const count = el('p', { class: 'count' });
  const list = el('ol', { class: 'list setlist-songs', 'aria-label': 'Songs in this setlist' });
  const empty = el('p', { class: 'muted empty', text: 'No songs yet. Add some below.' });

  const search = el('input', {
    type: 'search', placeholder: 'Search title or artist', 'aria-label': 'Find a song to add', autocomplete: 'off',
    oninput: () => drawPicks(),
  });
  const pickCount = el('p', { class: 'count' });
  const picks = el('ul', { class: 'picks', 'aria-label': 'Songs to add' });
  const status = el('p', { class: 'status', role: 'status' });

  function songRow(song, lastSung) {
    return el('li', { class: 'setlist-song', 'data-song-id': song.id },
      el('div', { class: 'text' },
        el('span', { class: 'title', text: song.title }),
        el('span', { class: 'sub', text: song.artist }),
        lastSung
          ? el('span', { class: 'flag' }, 'Sung here · last ', el('span', { class: 'nowrap', text: lastSung }))
          : null),
      el('button', {
        class: 'btn', type: 'button', text: 'Remove', 'aria-label': `Remove ${song.title} by ${song.artist}`,
        onclick: () => removeSong(song),
      }));
  }

  function drawSongs() {
    const inList = setlistSongs(setlist, songsById);
    const flags = sungFlags(setlist, sings); // empty for a general setlist
    count.textContent = plural(inList.length, 'song', 'songs');
    list.replaceChildren(...inList.map((song) => songRow(song, flags.get(song.id))));
    empty.hidden = inList.length > 0;
  }

  function drawPicks() {
    const query = search.value.trim();
    const { shown, total } = pickableSongs(songs, setlist, query, MAX_PICKS);
    const noun = query ? ['match', 'matches'] : ['song', 'songs'];
    if (!songs.length) pickCount.textContent = 'No songs yet. Add some in the Songs tab first.';
    else if (!total) pickCount.textContent = query ? 'No other songs match.' : 'Every song is already in this setlist.';
    else if (total > MAX_PICKS) {
      pickCount.textContent = `Showing ${MAX_PICKS} of ${plural(total, ...noun)}. Type more to narrow the search.`;
    } else pickCount.textContent = plural(total, ...noun);

    picks.replaceChildren(...shown.map((song) =>
      el('li', {},
        el('button', {
          class: 'pick', type: 'button', 'aria-label': `Add ${song.title} by ${song.artist}`,
          onclick: () => addSong(song),
        },
        el('span', { class: 'title', text: song.title }),
        el('span', { class: 'sub', text: song.artist })))));
  }

  async function save() {
    await db.put('setlists', setlist);
    drawSongs();
    drawPicks();
  }

  // Adds to the end; a song already in the setlist is never added twice.
  async function addSong(song) {
    setlist = addSongId(setlist, song.id);
    await save();
    status.textContent = `Added “${song.title}”.`;
  }

  // No confirmation: removing deletes no data and is easy to redo.
  async function removeSong(song) {
    setlist = removeSongId(setlist, song.id);
    status.textContent = '';
    await save();
  }

  show(
    el('button', {
      class: 'btn back', type: 'button', text: '‹ All setlists', onclick: () => closeScreen(() => renderSetlists()),
    }),
    el('h2', { text: setlist.name }),
    el('p', { class: 'muted venue-line', text: venueLine(setlist, venues) }),
    count,
    list,
    empty,
    el('section', { class: 'card stack', 'aria-label': 'Add songs' },
      el('h3', { text: 'Add songs' }),
      search, pickCount, picks, status));
  drawSongs();
  drawPicks();
}
