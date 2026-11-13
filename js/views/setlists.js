// Setlists view: create, edit and delete setlists, each labelled for a venue
// or for any venue (R14, R56); remove songs (R15), and "Find songs" to add
// them on the Songs tab (R57); flag songs already sung at the label venue,
// with the date last sung there (R43); reorder songs by dragging or with Up
// and Down buttons (R16); show the mix by genre and decade (R44); suggest
// songs never sung at the label venue, spread across genres and decades
// (R45); merge a setlist into another (R59). This tab is for building and
// tidying lists; working one through the night is the Songs tab's List mode
// (R49), which replaced Tonight mode (R17).
//
// Two screens in one tab: the setlist list and one setlist. renderSetlists()
// always shows the list, so tapping the Setlists tab is a way back as well.
import { db, request } from '../db.js';
import { el, viewEl, confirmAction, openScreen, closeScreen } from '../ui.js';
import { plural, sortVenues } from '../lib/stats.js';
import {
  setlistNameError, sortSetlists, venueValue, venueIdFromValue, venueOptions, venueLabel,
  makeSetlist, updateSetlist, describeSetlistDelete, removeSongId, addSongId, setlistSongs,
  sungFlags, moveSongId, moveSongIdBy, mixByGenre, mixByDecade, formatMix,
  SUGGEST_MIN, SUGGEST_MAX, SUGGEST_DEFAULT, suggestCount, suggestSongs, describeSuggestion,
  mergePlan, describeMerge, describeMerged,
} from '../lib/setlist.js';
import { setMenuGroups } from '../lib/night.js';
import { showSetInFind } from './songs.js';

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

// The "For venue (optional)" <select> (R56): Any venue, then every venue by name.
function venueSelect(venues, venueId) {
  const select = el('select', { name: 'venue' },
    ...venueOptions(venues, venueId).map((o) => el('option', { value: o.value, text: o.label })));
  select.value = venueValue(venueId);
  return select;
}

// ---------- Setlist list (R14, R56) ----------

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
    el('label', { text: 'For venue (optional)' }, venueInput),
    venues.length ? null : el('p', { class: 'count', text: 'Add venues in the Venues tab to label a setlist with one.' }),
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

    // Name and label in one inline form (R14 rename, R56 change the venue label or clear it).
    function showEdit() {
      const input = el('input', { name: 'name', required: '', autocomplete: 'off', value: setlist.name });
      const select = venueSelect(venues, setlist.venueId);
      const error = el('p', { class: 'error', role: 'alert' });
      const editForm = el('form', { class: 'stack', 'aria-label': `Edit ${setlist.name}`, novalidate: '' },
        el('label', { text: 'Setlist name' }, input),
        el('label', { text: 'For venue (optional)' }, select),
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
    : el('p', { class: 'muted empty', text: 'No setlists yet. Create one above, then find songs for it.' });

  show(el('div', { class: 'card' }, form), list, empty);
}

// The vertical middle of a list row on screen, for working out where a drag is.
function middleOf(node) {
  const box = node.getBoundingClientRect();
  return box.top + box.height / 2;
}

const sameOrder = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

// Merges one setlist into another in one transaction (R59), from what is
// stored, so a list changed elsewhere meanwhile is merged as it is now.
// Resolves with mergePlan()'s result, or null when either setlist is gone.
function mergeSetlists(sourceId, targetId, songsById) {
  return db.transaction('setlists', 'readwrite', async (stores) => {
    const source = await request(stores.setlists.get(sourceId));
    const target = await request(stores.setlists.get(targetId));
    if (!source || !target || source.id === target.id) return null;
    const plan = mergePlan(source, target, songsById);
    stores.setlists.put(plan.target);
    stores.setlists.put(plan.source);
    return plan;
  });
}

// ---------- One setlist: songs (R15), find songs (R57), sung flags (R43),
// order (R16), mix (R44), suggest (R45) and merge (R59) ----------

// `message` is a line to show at the top, e.g. after a merge.
async function renderSetlist(id, message = '') {
  const token = ++screen;
  const [found, venues, songs, sings, allSetlists] = await Promise.all([
    db.get('setlists', id), db.getAll('venues'), db.getAll('songs'), db.getAll('sings'), db.getAll('setlists'),
  ]);
  if (!stillCurrent(token)) return;
  if (!found) {
    closeScreen(() => renderSetlists());
    return;
  }

  // The latest state, updated before each save so quick taps build on each other.
  let setlist = found;
  const songsById = new Map(songs.map((s) => [s.id, s]));
  const others = allSetlists.filter((s) => s.id !== setlist.id);

  const count = el('p', { class: 'count' });
  const list = el('ol', { class: 'list setlist-songs', 'aria-label': 'Songs in this setlist' });

  // "Find songs" (R57): the Songs tab, in Find, with this set open at the
  // venue it is on, where + adds songs. At the top, and in place of the list
  // while there is nothing in it, so only one shows at a time.
  const findSongs = () => showSetInFind(setlist.id);
  const findButton = el('button', { class: 'btn', type: 'button', text: 'Find songs', onclick: findSongs });
  const empty = el('div', { class: 'empty setlist-empty' },
    el('p', { class: 'muted', text: 'No songs yet. Find songs to add some, or let Suggest songs pick a few.' }),
    el('button', { class: 'btn primary', type: 'button', text: 'Find songs', onclick: findSongs }));
  const status = el('p', { class: 'status', role: 'status', text: message });

  // Merge into another setlist (R59): an inline form under the buttons.
  const mergeButton = el('button', {
    class: 'btn', type: 'button', text: 'Merge into…', 'aria-expanded': 'false', onclick: () => showMergeForm(true),
  });
  const mergeNote = el('p', { class: 'muted merge-note' });
  const mergeSelect = el('select', { name: 'merge-target', id: 'merge-target' },
    ...setMenuGroups(others, venues, setlist.venueId).map((group) => el('optgroup', { label: group.label },
      ...group.items.map((item) => el('option', { value: String(item.id), text: item.text })))));
  const mergeError = el('p', { class: 'error', role: 'alert' });
  const mergeForm = el('form', { class: 'card stack merge-form', 'aria-label': 'Merge into another setlist', hidden: '' },
    // The label beside the menu rather than around it, so the menu's name is just "Merge into".
    el('div', { class: 'merge-field' }, el('label', { for: 'merge-target', text: 'Merge into' }), mergeSelect),
    el('p', { class: 'muted hint', text: 'Every song not already there goes to its end, and this list is left empty.' }),
    el('div', { class: 'row' },
      el('button', { class: 'btn primary', type: 'submit', text: 'Merge' }),
      el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => showMergeForm(false) })),
    mergeError);
  let merging = false; // stops a double tap from merging twice

  function showMergeForm(open) {
    mergeForm.hidden = !open;
    mergeButton.setAttribute('aria-expanded', String(open));
    mergeError.textContent = '';
    if (open) mergeSelect.focus();
    else mergeButton.focus({ preventScroll: true });
  }

  // Off, with a note, while there is nothing to merge or nowhere to merge it.
  function syncMerge(songCount) {
    const why = !songCount ? 'Nothing to merge.' : !others.length ? 'No other setlist to merge into.' : '';
    mergeButton.disabled = !!why;
    mergeNote.textContent = why;
    if (why && !mergeForm.hidden) showMergeForm(false);
  }

  mergeForm.addEventListener('keydown', (e) => { if (e.key === 'Escape') showMergeForm(false); });
  mergeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (merging) return;
    const target = others.find((s) => String(s.id) === mergeSelect.value);
    if (!target) {
      mergeError.textContent = 'Pick a setlist to merge into.';
      return;
    }
    const preview = mergePlan(setlist, target, songsById);
    if (!confirmAction(describeMerge(setlist, target, preview))) return;
    merging = true;
    let plan;
    try {
      plan = await mergeSetlists(setlist.id, target.id, songsById);
    } catch (err) {
      merging = false;
      mergeError.textContent = `Could not merge: ${err.message}`;
      return;
    }
    if (!plan) {
      renderSetlist(setlist.id, 'Could not merge: that setlist is no longer there.');
      return;
    }
    // The target's screen takes this one's place, so Back still goes to the list.
    renderSetlist(target.id, describeMerged(setlist, plan));
  });

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

  // The song's title and artist, and its sung flag (R43) when it has been
  // sung at the setlist's venue.
  function songText(song, lastSung) {
    return el('div', { class: 'text' },
      el('span', { class: 'title', text: song.title }),
      el('span', { class: 'sub', text: song.artist }),
      lastSung
        ? el('span', { class: 'flag' }, 'Sung here · last ', el('span', { class: 'nowrap', text: lastSung }))
        : null);
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
    const flags = sungFlags(setlist, sings); // empty for a setlist for any venue
    count.textContent = plural(inList.length, 'song', 'songs');
    controls.clear();
    list.replaceChildren(...inList.map((song, i) => songRow(song, flags.get(song.id), i, inList.length)));
    empty.hidden = inList.length > 0;
    findButton.hidden = inList.length === 0; // the empty state has its own
    syncMerge(inList.length);
    drawMix(inList);
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

  async function save() {
    await db.put('setlists', setlist);
    drawSongs();
  }

  // The lines at the top and under Suggest songs, which go stale once the list changes again.
  function clearStatus() {
    status.textContent = '';
    suggestStatus.textContent = '';
    suggestError.textContent = '';
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
    el('p', { class: 'muted venue-line', text: venueLabel(setlist, venues) }),
    el('div', { class: 'setlist-actions' }, findButton, mergeButton, mergeNote),
    mergeForm,
    status,
    count,
    mix,
    list,
    empty,
    suggestForm);
  drawSongs();
}
