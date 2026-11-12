// Setlists view: create, edit and delete setlists, each general or tied to one
// venue (R14, R39); add and remove songs (R15); flag songs already sung at the
// setlist's venue, with the date last sung there (R43); reorder songs by
// dragging or with Up and Down buttons (R16); show the mix by genre and decade (R44);
// suggest songs never sung at the venue, spread across genres and decades (R45);
// Tonight mode, where checking off a song logs a sing (R17).
//
// Two screens in one tab: the setlist list and one setlist. renderSetlists()
// always shows the list, so tapping the Setlists tab is a way back as well.
import { db } from '../db.js';
import { el, viewEl, confirmAction, openScreen, closeScreen } from '../ui.js';
import { plural, sortVenues, todayLocalISO } from '../lib/stats.js';
import {
  setlistNameError, sortSetlists, venueValue, venueIdFromValue, venueOptions, venueLabel, venueLine,
  makeSetlist, updateSetlist, describeSetlistDelete, addSongId, removeSongId, setlistSongs,
  pickableSongs, sungFlags, moveSongId, moveSongIdBy, mixByGenre, mixByDecade, formatMix,
  SUGGEST_MIN, SUGGEST_MAX, SUGGEST_DEFAULT, suggestCount, suggestSongs, describeSuggestion,
  tonightSing, findTonightSing, sungOn,
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

// The vertical middle of a list row on screen, for working out where a drag is.
function middleOf(node) {
  const box = node.getBoundingClientRect();
  return box.top + box.height / 2;
}

const sameOrder = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

// ---------- One setlist: songs (R15), sung flags (R43), order (R16), mix (R44),
// suggest (R45) and Tonight (R17) ----------

async function renderSetlist(id) {
  const token = ++screen;
  const [found, venues, songs, singRecords] = await Promise.all([
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
  // Every sing, kept in step with the ones Tonight mode logs and removes, so
  // the sung flags (R43) and suggestions (R45) see them straight away.
  let sings = singRecords;

  const count = el('p', { class: 'count' });
  const list = el('ol', { class: 'list setlist-songs', 'aria-label': 'Songs in this setlist' });
  const empty = el('p', { class: 'muted empty', text: 'No songs yet. Add some below.' });

  // The mix (R44): closed by default, a reading aid so gaps and repeats stand out.
  const mixGenres = el('dd');
  const mixDecades = el('dd');
  const mixEmpty = el('p', { class: 'muted mix-empty', text: 'No songs yet.' });
  const mixLines = el('dl', { class: 'mix-lines' },
    el('div', {}, el('dt', { text: 'Genres' }), mixGenres),
    el('div', {}, el('dt', { text: 'Decades' }), mixDecades));
  const mix = el('details', { class: 'card mix' }, el('summary', { text: 'Mix' }), mixEmpty, mixLines);

  // Each row's handle and Up and Down buttons by song id, so focus can go back
  // to the moved song's control after the list is redrawn.
  const controls = new Map();

  const search = el('input', {
    type: 'search', placeholder: 'Search title or artist', 'aria-label': 'Find a song to add', autocomplete: 'off',
    oninput: () => drawPicks(),
  });
  const pickCount = el('p', { class: 'count' });
  const picks = el('ul', { class: 'picks', 'aria-label': 'Songs to add' });
  const status = el('p', { class: 'status', role: 'status' });

  // Suggest songs (R45): adds songs never sung here to the end, as a start to edit.
  const general = setlist.venueId == null;
  const howMany = el('input', {
    type: 'number', name: 'how-many', min: String(SUGGEST_MIN), max: String(SUGGEST_MAX), step: '1',
    value: String(SUGGEST_DEFAULT), inputmode: 'numeric', required: '',
  });
  const suggestError = el('p', { class: 'error', role: 'alert' });
  const suggestStatus = el('p', { class: 'status', role: 'status' });
  // novalidate: an empty or out-of-range number gets an inline error instead of a bubble.
  const suggestForm = el('form', { class: 'card stack suggest', 'aria-label': 'Suggest songs', novalidate: '' },
    el('h3', { text: 'Suggest songs' }),
    el('p', {
      class: 'muted hint',
      text: `Songs never sung ${general ? 'anywhere' : 'here'}, spread across genres and decades.`,
    }),
    el('div', { class: 'suggest-row' },
      el('label', { text: 'How many' }, howMany),
      el('button', { class: 'btn primary', type: 'submit', text: 'Suggest songs' })),
    suggestError,
    suggestStatus);
  let suggesting = false; // stops a double tap from adding two batches

  // Tonight mode (R17): off whenever the screen opens, and never saved.
  let tonight = false;
  let tonightDate = null; // the day sings are logged on, fixed when Tonight is turned on
  let pickedVenueId = null; // a general setlist's venue for tonight, kept while the screen is open
  const pending = new Set(); // songs whose check or uncheck is still saving
  const checks = new Map(); // each row's checkbox by song id, so focus can go back after a redraw
  const sortedVenues = sortVenues(venues);
  // A setlist whose venue is gone (only a hand-edited backup could do that) asks like a general one.
  const ownVenueId = venues.some((v) => v.id === setlist.venueId) ? setlist.venueId : null;
  const tonightVenueId = () => ownVenueId ?? pickedVenueId;

  const tonightButton = el('button', {
    class: 'btn tonight-toggle', type: 'button', text: 'Tonight', 'aria-pressed': 'false', onclick: toggleTonight,
  });
  // A label beside the select, not around it, so its name is just "Venue".
  const tonightVenue = el('select', {
    id: 'tonight-venue', name: 'tonight-venue', required: '',
    onchange: () => {
      pickedVenueId = venueIdFromValue(tonightVenue.value);
      drawTonight();
      drawSongs();
    },
  },
  el('option', { value: '', text: 'Choose a venue' }),
  ...sortedVenues.map((v) => el('option', { value: venueValue(v.id), text: v.name })));
  const tonightVenueField = el('div', { class: 'tonight-venue' },
    el('label', { for: 'tonight-venue', text: 'Venue' }), tonightVenue);
  const tonightLine = el('p', { class: 'muted tonight-line' });
  const tonightBar = el('div', { class: 'tonight-bar' }, tonightButton, tonightVenueField, tonightLine);

  // The song's title and artist, its sung flag (R43) when it has been sung at
  // the setlist's venue, and in Tonight mode a mark once it is sung tonight (R17).
  function songText(song, lastSung, sangTonight = false) {
    return el('div', { class: 'text' },
      el('span', { class: 'title', text: song.title }),
      el('span', { class: 'sub', text: song.artist }),
      lastSung
        ? el('span', { class: 'flag' }, 'Sung here · last ', el('span', { class: 'nowrap', text: lastSung }))
        : null,
      sangTonight ? el('span', { class: 'tonight-mark', text: 'Sang tonight' }) : null);
  }

  // A row in Tonight mode (R17): a checkbox that logs tonight's sing or takes
  // it back, then the song. No handle, Up, Down or Remove while singing.
  function tonightRow(song, lastSung, sang, canCheck) {
    const check = el('button', {
      class: 'btn check', type: 'button', role: 'checkbox', 'aria-checked': String(sang),
      'aria-label': `Sang ${song.title}`, text: sang ? '✓' : '',
      onclick: (e) => toggleSung(song, document.activeElement === e.currentTarget),
    });
    check.disabled = !canCheck;
    checks.set(song.id, check);
    return el('li', { class: 'setlist-song tonight', 'data-song-id': song.id }, check, songText(song, lastSung, sang));
  }

  // A song row: drag handle, the song, then Up, Down and Remove. `index` is its
  // place in the list and `total` the number of rows.
  function songRow(song, lastSung, index, total) {
    // True when the tapped control had focus (a keyboard, or a desktop click),
    // so focus follows the song; phones do not focus buttons on a tap.
    const focused = (e) => document.activeElement === e.currentTarget;
    const handle = el('button', {
      class: 'btn handle', type: 'button', text: '≡', 'aria-label': `Move ${song.title}`,
      onkeydown: (e) => {
        const delta = { ArrowUp: -1, ArrowDown: 1 }[e.key];
        if (!delta) return;
        e.preventDefault();
        moveSongBy(song, delta, 'handle');
      },
    });
    const up = el('button', {
      class: 'btn move', type: 'button', text: '↑', 'aria-label': `Move ${song.title} up`,
      onclick: (e) => moveSongBy(song, -1, focused(e) ? 'up' : null),
    });
    const down = el('button', {
      class: 'btn move', type: 'button', text: '↓', 'aria-label': `Move ${song.title} down`,
      onclick: (e) => moveSongBy(song, 1, focused(e) ? 'down' : null),
    });
    up.disabled = index === 0;
    down.disabled = index === total - 1;
    controls.set(song.id, { handle, up, down });

    const li = el('li', { class: 'setlist-song', 'data-song-id': song.id },
      handle,
      songText(song, lastSung),
      el('div', { class: 'moves' },
        up,
        down,
        el('button', {
          class: 'btn', type: 'button', text: 'Remove', 'aria-label': `Remove ${song.title} by ${song.artist}`,
          onclick: () => removeSong(song),
        })));
    dragToReorder(li, handle, song);
    return li;
  }

  // Drag to reorder (R16) with pointer events, which work for touch, pen and
  // mouse alike; native HTML5 drag and drop does not work in mobile browsers.
  // The handle captures the pointer, so moves keep arriving wherever the finger
  // goes, and its touch-action: none (app.css) stops the page scrolling. The
  // dragged row is never taken out of the list, since that would drop the
  // capture; its neighbours are moved past it instead.
  function dragToReorder(li, handle, song) {
    let drag = null; // { pointerId, grabY, shift } while dragging

    handle.addEventListener('pointerdown', (e) => {
      if (drag || !e.isPrimary || e.button !== 0) return;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        return; // the pointer is already gone
      }
      e.preventDefault(); // no text selection while dragging
      drag = { pointerId: e.pointerId, grabY: e.clientY - li.getBoundingClientRect().top, shift: 0 };
      li.classList.add('dragging');
    });

    handle.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const y = e.clientY;
      // Past the middle of the row below (or above), that row moves to the other side.
      for (let guard = list.children.length; guard > 0; guard -= 1) {
        const next = li.nextElementSibling;
        const prev = li.previousElementSibling;
        if (next && y > middleOf(next)) list.insertBefore(next, li);
        else if (prev && y < middleOf(prev)) list.insertBefore(prev, li.nextElementSibling);
        else break;
      }
      // The lifted row follows the pointer from wherever it now sits in the list.
      const top = li.getBoundingClientRect().top - drag.shift;
      drag.shift = e.clientY - drag.grabY - top;
      li.style.transform = `translateY(${drag.shift}px)`;
    });

    // Dropping saves the new order at once; a cancelled drag puts the rows back.
    function end(e, drop) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      drag = null;
      li.classList.remove('dragging');
      li.style.transform = '';
      const index = [...list.children].indexOf(li);
      if (drop && index !== -1) {
        const refocus = document.activeElement === handle ? { songId: song.id, which: 'handle' } : null;
        reorder(moveSongId(setlist, song.id, index, songsById), refocus);
      } else drawSongs();
    }
    handle.addEventListener('pointerup', (e) => end(e, true));
    handle.addEventListener('pointercancel', (e) => end(e, false));
    handle.addEventListener('lostpointercapture', (e) => end(e, false));
  }

  function drawSongs() {
    const inList = setlistSongs(setlist, songsById);
    const flags = sungFlags(setlist, sings); // empty for a general setlist
    const venueId = tonight ? tonightVenueId() : null;
    const sang = venueId == null ? new Set() : sungOn(sings, venueId, tonightDate);
    count.textContent = plural(inList.length, 'song', 'songs');
    if (venueId != null) count.textContent += ` · ${inList.filter((s) => sang.has(s.id)).length} sung tonight`;
    controls.clear();
    checks.clear();
    list.replaceChildren(...inList.map((song, i) => (tonight
      ? tonightRow(song, flags.get(song.id), sang.has(song.id), venueId != null)
      : songRow(song, flags.get(song.id), i, inList.length))));
    empty.hidden = inList.length > 0;
    drawMix(inList);
  }

  // The Tonight button and, while it is on, the venue sings are logged at:
  // the setlist's own, or one picked here for a general setlist (R17).
  function drawTonight() {
    tonightButton.setAttribute('aria-pressed', String(tonight));
    tonightVenueField.hidden = !tonight || ownVenueId != null;
    tonightLine.hidden = !tonight;
    const venue = sortedVenues.find((v) => v.id === tonightVenueId());
    if (!tonight) tonightLine.textContent = '';
    else if (!venue) {
      tonightLine.textContent = venues.length ? 'Pick a venue first.' : 'Add a venue in the Venues tab first.';
    } else {
      tonightLine.replaceChildren(`Check off each song as you sing it. Logged: ${venue.name}, `,
        el('span', { class: 'nowrap', text: tonightDate }), '.');
    }
  }

  function toggleTonight() {
    tonight = !tonight;
    if (tonight) tonightDate = todayLocalISO();
    drawTonight();
    drawSongs();
  }

  // Checking a song logs a sing at tonight's venue; unchecking removes that
  // sing again without asking, since it is easy to log again (R17).
  async function toggleSung(song, refocus) {
    const venueId = tonightVenueId();
    if (!tonight || venueId == null || pending.has(song.id)) return;
    pending.add(song.id);
    try {
      const logged = findTonightSing(sings, song.id, venueId, tonightDate);
      if (logged) {
        await db.delete('sings', logged.id);
        sings = sings.filter((s) => s.id !== logged.id);
      } else {
        const sing = tonightSing(song.id, venueId, tonightDate);
        const singId = await db.add('sings', sing);
        sings = [...sings, { ...sing, id: singId }];
      }
    } finally {
      pending.delete(song.id);
    }
    drawSongs();
    if (refocus) checks.get(song.id)?.focus();
  }

  function drawMix(inList) {
    mixGenres.textContent = formatMix(mixByGenre(inList));
    mixDecades.textContent = formatMix(mixByDecade(inList));
    mixEmpty.hidden = inList.length > 0;
    mixLines.hidden = inList.length === 0;
  }

  // Focus `which` ('handle', 'up' or 'down') of a song's row; when that button
  // is now disabled (the song reached an end), the other one or the handle.
  function focusControl(songId, which) {
    const row = controls.get(songId);
    if (!row) return;
    const order = which === 'up' ? ['up', 'down'] : which === 'down' ? ['down', 'up'] : [];
    const name = order.find((key) => !row[key].disabled) || 'handle';
    row[name].focus();
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

  // The lines under Add songs and Suggest songs, which go stale once the list changes again.
  function clearStatus() {
    status.textContent = '';
    suggestStatus.textContent = '';
    suggestError.textContent = '';
  }

  // Adds to the end; a song already in the setlist is never added twice.
  async function addSong(song) {
    setlist = addSongId(setlist, song.id);
    clearStatus();
    await save();
    status.textContent = `Added “${song.title}”.`;
  }

  // Adds the suggested songs to the end (R45); nothing already there moves or goes.
  suggestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (suggesting) return;
    clearStatus();
    const n = suggestCount(howMany.value);
    if (n === null) {
      suggestError.textContent = `Enter how many songs to suggest, from ${SUGGEST_MIN} to ${SUGGEST_MAX}.`;
      howMany.focus();
      return;
    }
    if (!songs.length) {
      suggestStatus.textContent = 'No songs yet. Add some in the Songs tab first.';
      return;
    }
    const chosen = suggestSongs(songs, sings, setlist, n);
    if (chosen.length) {
      suggesting = true;
      for (const song of chosen) setlist = addSongId(setlist, song.id);
      try {
        await save();
      } finally {
        suggesting = false;
      }
    }
    suggestStatus.textContent = describeSuggestion(chosen.length, n, general);
  });

  // Saves a new order at once (R16). `refocus` ({ songId, which }) puts focus
  // back on that control of the moved song once the list is redrawn.
  async function reorder(next, refocus = null) {
    if (sameOrder(next.songIds, setlist.songIds || [])) return;
    setlist = next;
    clearStatus();
    await save();
    if (refocus) focusControl(refocus.songId, refocus.which);
  }

  // Up (-1) or Down (1), from the Up and Down buttons or the arrow keys on the handle.
  function moveSongBy(song, delta, which = null) {
    return reorder(moveSongIdBy(setlist, song.id, delta, songsById), which ? { songId: song.id, which } : null);
  }

  // No confirmation: removing deletes no data and is easy to redo.
  async function removeSong(song) {
    setlist = removeSongId(setlist, song.id);
    clearStatus();
    await save();
  }

  show(
    el('button', {
      class: 'btn back', type: 'button', text: '‹ All setlists', onclick: () => closeScreen(() => renderSetlists()),
    }),
    el('h2', { text: setlist.name }),
    el('p', { class: 'muted venue-line', text: venueLine(setlist, venues) }),
    count,
    mix,
    tonightBar,
    list,
    empty,
    suggestForm,
    el('section', { class: 'card stack', 'aria-label': 'Add songs' },
      el('h3', { text: 'Add songs' }),
      search, pickCount, picks, status));
  drawTonight();
  drawSongs();
  drawPicks();
}
