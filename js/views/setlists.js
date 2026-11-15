// The Lists scope (Design B): building and tidying setlists, each labelled for
// a venue or for any venue (R14, R56). Working one through the night is Tonight.
//   The lists: each with its label and song count, a genre line and a decade
//     line (R44 in miniature), and how many of its songs are in tonight's set
//     (or "Tonight's set" for the one that is). "New list" at the top opens a
//     form for a name and a label. The dock's field filters the lists by name.
//   A list's songs, stacked on top so the back gesture returns (R31): the
//     label and mix lines; each song with + / ✓ for tonight's set at the venue
//     chosen on Tonight (the owner's case: open "Crowd pleasers" and drop two
//     songs into tonight), its sings at the list's label venue (R43), a drag
//     handle, and "…" for Up, Down and Remove (R16, R15). The list's actions:
//     Find songs (R57), Rename and label (R14, R56), Merge into… (R59) and
//     Delete; the Mix card (R44) and Suggest songs (R45) follow the songs.
//     The dock's field filters its songs.
// Coming back to the scope within five minutes reopens the list (R60).
import { db, request } from '../db.js';
import {
  el, viewEl, confirmAction, openScreen, closeScreen, renderingBack, screenTicket, screenStillShowing, icon, ICONS,
} from '../ui.js';
import * as dock from '../dock.js';
import { dragToReorder } from '../drag.js';
import { plural, sortVenues, singStats, todayLocalISO } from '../lib/stats.js';
import { filterSongs } from '../lib/search.js';
import {
  setlistNameError, sortSetlists, venueValue, venueIdFromValue, venueOptions, venueLabel,
  makeSetlist, updateSetlist, describeSetlistDelete, removeSongId, addSongId, setlistSongs,
  moveSongId, moveSongIdBy, mixByGenre, mixByDecade, formatMix,
  SUGGEST_MIN, SUGGEST_MAX, SUGGEST_DEFAULT, suggestCount, suggestSongs, describeSuggestion,
  mergePlan, describeMerge, describeMerged,
} from '../lib/setlist.js';
import { setMenuGroups, currentSetlistKey, currentSetlistFor } from '../lib/night.js';
import { VENUE_KEY, openCurrentSet, showSetInFind } from './songs.js';
import { hereShort } from './tonight.js';

// Bumped on every screen change, so a slow load never paints over a newer screen.
let screen = 0;

// The list last open and when (R60): coming back to the scope within HOLD_MS
// reopens it; later, or after leaving it with "‹ Lists", the scope starts at
// the lists.
const HOLD_MS = 5 * 60 * 1000;
let lastOpen = null; // { id, at } or null

// What the dock's field holds, kept while the app is open: the filter on the
// lists, and on one list's songs (cleared when another list opens).
let listsQuery = '';
let songsQuery = { id: null, text: '' };

// True while a load started with `token` and screen `ticket` should still be
// shown: no newer Lists screen has started and no other screen has been drawn.
function stillCurrent(token, ticket) {
  return token === screen && screenStillShowing(ticket);
}

const CHEVRON_RIGHT = ['M9 6l6 6-6 6'];
const CHEVRON_LEFT = ['M15 6l-6 6 6 6'];

// The "For venue (optional)" <select> (R56): Any venue, then every venue by name.
function venueSelect(venues, venueId) {
  const select = el('select', { name: 'venue' },
    ...venueOptions(venues, venueId).map((o) => el('option', { value: o.value, text: o.label })));
  select.value = venueValue(venueId);
  return select;
}

// A mix line in miniature (R44): the `max` biggest groups in the order given
// (genres most first, decades oldest first), then "+N more".
function mixSummary(items, max) {
  if (items.length <= max) return formatMix(items);
  const kept = new Set([...items].sort((a, b) => b.count - a.count).slice(0, max));
  return `${formatMix(items.filter((item) => kept.has(item)))} · +${items.length - max} more`;
}

// "For The Crown · 12 songs": the label and the count, each its own span.
function metaLine(setlist, venues, count) {
  return el('span', { class: 'list-meta' },
    el('span', { class: 'label', text: venueLabel(setlist, venues) }),
    ' · ',
    el('span', { class: 'list-count', text: plural(count, 'song', 'songs') }));
}

// Tonight's set as Tonight would open it (R47, R56): at the venue chosen
// there (a deleted one means Overall), the remembered set, else the venue's
// first. Read without creating anything; null when Tonight would make one.
function tonightContext(venues, setlists, metaRecords) {
  const meta = new Map(metaRecords.map((r) => [r.key, r.value]));
  const wanted = meta.has(VENUE_KEY) ? meta.get(VENUE_KEY) : null;
  const venue = venues.find((v) => v.id === wanted) || null;
  const venueId = venue ? venue.id : null;
  return { venue, venueId, meta, set: currentSetlistFor(setlists, venueId, meta.get(currentSetlistKey(venueId))) };
}

// How many of the list's songs are in tonight's set: n of the list's songs.
function inTonight(listSongs, tonight) {
  if (!tonight) return 0;
  const ids = new Set(tonight.songIds || []);
  return listSongs.filter((song) => ids.has(song.id)).length;
}

// ---------- The lists (R14, R56) ----------

// `message` is a line for the status, e.g. after a delete.
export async function renderSetlists({ message = '' } = {}) {
  const token = ++screen;
  const ticket = screenTicket();
  // Arriving by the scope (not by going back) within HOLD_MS of leaving a list
  // reopens it on top of the lists, so the back gesture still reaches them (R60).
  const held = !renderingBack() && lastOpen && Date.now() - lastOpen.at < HOLD_MS ? lastOpen.id : null;
  lastOpen = null;
  const [setlistRecords, venueRecords, songs, metaRecords] = await Promise.all([
    db.getAll('setlists'), db.getAll('venues'), db.getAll('songs'), db.getAll('meta'),
  ]);
  if (!stillCurrent(token, ticket)) return;
  if (held != null && setlistRecords.some((s) => s.id === held)) {
    openScreen(() => renderSetlist(held));
    return;
  }
  const setlists = sortSetlists(setlistRecords);
  const venues = sortVenues(venueRecords);
  const songsById = new Map(songs.map((s) => [s.id, s]));
  const { set: tonight } = tonightContext(venues, setlistRecords, metaRecords);
  let saving = false; // stops a double tap from saving twice

  // New list (R14, R56): the button opens a form for the name and the label.
  const newButton = el('button', {
    class: 'btn new-list', type: 'button', 'aria-expanded': 'false', onclick: () => showForm(form.hidden),
  }, icon(ICONS.plus, { size: 16, width: 2.6 }), 'New list');
  const nameInput = el('input', { name: 'name', required: '', autocomplete: 'off' });
  const venueInput = venueSelect(venues, null);
  const addError = el('p', { class: 'error', role: 'alert' });
  // novalidate: an empty name gets the same inline error as a blank one.
  const form = el('form', { class: 'card stack new-list-form', 'aria-label': 'New list', novalidate: '', hidden: '' },
    el('label', { text: 'Setlist name' }, nameInput),
    el('label', { text: 'For venue (optional)' }, venueInput),
    venues.length ? null : el('p', { class: 'count', text: 'Add venues under History to label a list with one.' }),
    el('div', { class: 'row' },
      el('button', { class: 'btn primary', type: 'submit', text: 'Create list' }),
      el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => showForm(false) })),
    addError);

  function showForm(open) {
    form.hidden = !open;
    newButton.setAttribute('aria-expanded', String(open));
    addError.textContent = '';
    if (open) nameInput.focus();
    else newButton.focus({ preventScroll: true });
  }

  form.addEventListener('keydown', (e) => { if (e.key === 'Escape') showForm(false); });
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
    const fresh = makeSetlist(nameInput.value, venueIdFromValue(venueInput.value));
    await db.add('setlists', fresh);
    renderSetlists({ message: `Made “${fresh.name}”. Open it to find songs for it.` });
  });

  // A list: name, label and count, the genre and decade lines, and its share of tonight's set.
  function listRow(setlist) {
    const inList = setlistSongs(setlist, songsById);
    const genres = mixSummary(mixByGenre(inList), 3);
    const decades = mixSummary(mixByDecade(inList), 4);
    const isTonight = !!tonight && tonight.id === setlist.id;
    const n = inTonight(inList, tonight);
    const inSet = isTonight ? 'Tonight\'s set' : n ? `${n} of ${inList.length} in tonight's set` : '';
    return el('li', { class: 'list-card', 'data-setlist-id': setlist.id },
      el('button', { class: 'list-open', type: 'button', onclick: () => openScreen(() => renderSetlist(setlist.id)) },
        el('span', { class: 'list-text' },
          el('span', { class: 'title', text: setlist.name }),
          metaLine(setlist, venues, inList.length),
          inList.length ? el('span', { class: 'list-mix', text: genres }) : null,
          inList.length ? el('span', { class: 'list-mix', text: decades }) : null,
          inSet ? el('span', { class: 'list-in-set', text: inSet }) : null),
        icon(CHEVRON_RIGHT, { size: 20 })));
  }

  const list = el('ul', { class: 'list-cards', 'aria-label': 'Your lists' });
  const empty = el('p', { class: 'muted empty' });

  function drawRows() {
    const text = listsQuery.trim().toLowerCase();
    const shown = text ? setlists.filter((s) => String(s.name).toLowerCase().includes(text)) : setlists;
    list.replaceChildren(...shown.map(listRow));
    list.hidden = shown.length === 0;
    empty.textContent = !setlists.length
      ? 'No lists yet. Start one with New list, then find songs for it.'
      : shown.length ? '' : `No lists match “${listsQuery.trim()}”.`;
    empty.hidden = !empty.textContent;
  }

  const root = el('div', { class: 'stack lists-view' },
    el('header', { class: 'scope-head' }, el('h2', { text: 'Lists' }), newButton),
    form,
    el('p', { class: 'status', role: 'status', text: message }),
    list,
    empty);
  viewEl.replaceChildren(root);
  viewEl.scrollTop = 0;
  drawRows();
  dock.filters(null);
  dock.search({
    placeholder: 'Search lists',
    value: listsQuery,
    onInput: (value) => {
      if (!root.isConnected) return;
      listsQuery = value;
      drawRows();
    },
  });
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

// ---------- One list's songs: + / ✓ for tonight (R48), here stats (R43),
// order (R16), remove (R15), find (R57), rename and label (R14, R56),
// merge (R59), delete (R14), mix (R44) and suggest (R45) ----------

// `message` is a line to show at the top, e.g. after a merge.
async function renderSetlist(id, message = '') {
  const token = ++screen;
  const ticket = screenTicket();
  const [found, venueRecords, songs, sings, setlistRecords, metaRecords] = await Promise.all([
    db.get('setlists', id), db.getAll('venues'), db.getAll('songs'), db.getAll('sings'),
    db.getAll('setlists'), db.getAll('meta'),
  ]);
  if (!stillCurrent(token, ticket)) return;
  if (!found) {
    closeScreen(() => renderSetlists());
    return;
  }
  lastOpen = { id, at: Date.now() }; // refreshed on every redraw of this screen (R60)
  if (songsQuery.id !== id) songsQuery = { id, text: '' };

  // The latest state, updated before each save so quick taps build on each other.
  let setlist = found;
  const venues = sortVenues(venueRecords);
  const songsById = new Map(songs.map((s) => [s.id, s]));
  let allSetlists = setlistRecords;
  const others = setlistRecords.filter((s) => s.id !== setlist.id);
  const today = todayLocalISO();
  // Sings at the list's label venue (R43); a list for any venue has none.
  const here = setlist.venueId == null ? null : singStats(sings, setlist.venueId);
  // Tonight's set, where + and ✓ work; null until the first + makes it.
  const night = tonightContext(venues, setlistRecords, metaRecords);
  let tonight = night.set;
  const isTonight = () => !!tonight && tonight.id === setlist.id;
  let openRow = null; // the song whose "…" row is open

  const status = el('p', { class: 'status', role: 'status', text: message });
  const list = el('ol', { class: 'list setlist-songs', 'aria-label': 'Songs in this setlist' });
  const genreLine = el('p', { class: 'list-mix' });
  const decadeLine = el('p', { class: 'list-mix' });
  const countText = el('span', { class: 'list-count' });
  const inSetLine = el('p', { class: 'list-in-set' });
  const legend = el('p', { class: 'set-legend' },
    el('span', { class: 'tick', 'aria-hidden': 'true' }, icon(ICONS.check, { size: 14, width: 3 })),
    el('span', { class: 'visually-hidden', text: 'Tick' }),
    ' = in tonight\'s set');

  // "Find songs" (R57): the Songs scope with this list as tonight's set at the
  // venue chosen on Tonight, where + adds songs. With the actions, and in
  // place of the songs while there are none, so only one shows at a time.
  const findSongs = () => showSetInFind(setlist.id);
  const findButton = el('button', { class: 'btn', type: 'button', text: 'Find songs', onclick: findSongs });
  const empty = el('div', { class: 'empty setlist-empty' },
    el('p', { class: 'muted', text: 'No songs yet. Find songs to add some, or let Suggest songs pick a few.' }),
    el('button', { class: 'btn primary', type: 'button', text: 'Find songs', onclick: findSongs }));

  // ---- Rename and label (R14, R56): a form under the actions, made when opened ----

  const renameButton = el('button', {
    class: 'btn', type: 'button', text: 'Rename and label', 'aria-expanded': 'false', onclick: () => showEditForm(!editSlot.firstChild),
  });
  const editSlot = el('div', { class: 'edit-slot' });
  let renaming = false;

  function editForm() {
    const nameInput = el('input', { name: 'name', required: '', autocomplete: 'off', value: setlist.name });
    const labelSelect = venueSelect(venues, setlist.venueId);
    const editError = el('p', { class: 'error', role: 'alert' });
    const form = el('form', { class: 'card stack edit-form', 'aria-label': `Edit ${setlist.name}`, novalidate: '' },
      el('label', { text: 'Setlist name' }, nameInput),
      el('label', { text: 'For venue (optional)' }, labelSelect),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', type: 'submit', text: 'Save' }),
        el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => showEditForm(false) })),
      editError);
    form.addEventListener('keydown', (e) => { if (e.key === 'Escape') showEditForm(false); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (renaming) return;
      const problem = setlistNameError(nameInput.value, allSetlists, setlist.id);
      if (problem) {
        editError.textContent = problem;
        nameInput.focus();
        return;
      }
      renaming = true;
      try {
        await db.put('setlists', updateSetlist(setlist, nameInput.value, venueIdFromValue(labelSelect.value)));
      } catch (err) {
        renaming = false;
        editError.textContent = `Could not save: ${err.message}`;
        return;
      }
      renderSetlist(setlist.id, 'Saved the name and label.');
    });
    return { form, nameInput };
  }

  function showEditForm(open) {
    if (open) {
      showMergeForm(false, false);
      const { form, nameInput } = editForm();
      editSlot.replaceChildren(form);
      nameInput.focus();
    } else {
      editSlot.replaceChildren();
      renameButton.focus({ preventScroll: true });
    }
    renameButton.setAttribute('aria-expanded', String(open));
  }

  // ---- Merge into another list (R59) ----

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

  function showMergeForm(open, refocus = true) {
    if (open && editSlot.firstChild) {
      editSlot.replaceChildren();
      renameButton.setAttribute('aria-expanded', 'false');
    }
    mergeForm.hidden = !open;
    mergeButton.setAttribute('aria-expanded', String(open));
    mergeError.textContent = '';
    if (open) mergeSelect.focus();
    else if (refocus) mergeButton.focus({ preventScroll: true });
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
    // The target's screen takes this one's place, so Back still goes to the lists.
    renderSetlist(target.id, describeMerged(setlist, plan));
  });

  // ---- Delete (R14) ----

  // Deletes only the setlist record; its songs, sings and venue stay.
  async function removeList() {
    if (!confirmAction(describeSetlistDelete(setlist))) return;
    try {
      await db.delete('setlists', setlist.id);
    } catch (err) {
      status.textContent = `Could not delete: ${err.message}`;
      return;
    }
    lastOpen = null; // the scope starts at the lists next time
    closeScreen(() => renderSetlists({ message: `Deleted “${setlist.name}”.` }));
  }
  const deleteButton = el('button', {
    class: 'btn danger', type: 'button', text: 'Delete', 'aria-label': `Delete ${setlist.name}`, onclick: removeList,
  });

  // ---- The mix (R44): closed by default, a reading aid so gaps and repeats stand out ----

  const mixGenres = el('dd');
  const mixDecades = el('dd');
  const mixEmpty = el('p', { class: 'muted mix-empty', text: 'No songs yet.' });
  const mixLines = el('dl', { class: 'mix-lines' },
    el('div', {}, el('dt', { text: 'Genres' }), mixGenres),
    el('div', {}, el('dt', { text: 'Decades' }), mixDecades));
  const mix = el('details', { class: 'card mix' }, el('summary', { text: 'Mix' }), mixEmpty, mixLines);

  // ---- Suggest songs (R45): adds songs never sung here to the end, as a start to edit ----

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

  // ---- Tonight's set (R47, R48, R56) ----

  // The first + or ✓ opens tonight's set the way Tonight would, remembering
  // it, and making one only when the venue has none to open. Quick taps share it.
  let ensuring = null;
  function ensureTonight() {
    ensuring ||= openCurrentSet(night.venue, allSetlists, night.meta).then((opened) => {
      allSetlists = opened.setlists;
      if (opened.set.id != null) night.meta.set(currentSetlistKey(night.venueId), opened.set.id);
      if (!tonight || tonight.id !== opened.set.id) tonight = opened.set;
      return tonight.id != null;
    }, (err) => {
      ensuring = null;
      throw err;
    });
    return ensuring;
  }

  // + adds the song to the end of tonight's set; ✓ takes it out. Drawn at once, then saved.
  async function toggleTonight(song) {
    clearStatus();
    try {
      if (!(await ensureTonight())) return;
    } catch (err) {
      if (root.isConnected) status.textContent = `Could not save: ${err.message}`;
      return;
    }
    if (!root.isConnected) return;
    if (isTonight()) {
      drawSongs(); // this list turned out to be tonight's set: no + / ✓ on it
      return;
    }
    const has = tonight.songIds.includes(song.id);
    tonight = has ? removeSongId(tonight, song.id) : addSongId(tonight, song.id);
    drawSongs();
    try {
      await db.put('setlists', tonight);
    } catch (err) {
      if (root.isConnected) status.textContent = `Could not save: ${err.message}`;
    }
  }

  function toggleButton(song) {
    const has = !!tonight && tonight.songIds.includes(song.id);
    return el('button', {
      type: 'button', class: `btn set-toggle${has ? ' in-set' : ''}`, text: has ? '✓' : '+',
      'aria-label': has ? `Remove ${song.title} from tonight's set` : `Add ${song.title} to tonight's set`,
      onmousedown: (e) => e.preventDefault(), // the field keeps focus, so the keyboard stays up
      onclick: () => toggleTonight(song),
    });
  }

  // ---- The songs ----

  // Each row's handle and Up and Down buttons by song id, so focus can go back
  // to the moved song's control after the list is redrawn.
  const controls = new Map();

  // A song row: drag handle, the song with its sings here, + / ✓, and "…"
  // for Up, Down and Remove. `index` is its place in the whole list, `total`
  // the list's length; `filtered` while the dock's field narrows the rows,
  // when there is nothing to drag among.
  function songRow(song, index, total, filtered) {
    const open = openRow === song.id;
    // True when the tapped control had focus (a keyboard, or a desktop click),
    // so focus follows the song; phones do not focus buttons on a tap.
    const focused = (e) => document.activeElement === e.currentTarget;
    const handle = filtered ? null : el('button', {
      class: 'handle', type: 'button', 'aria-label': `Move ${song.title}`,
      onkeydown: (e) => {
        const delta = { ArrowUp: -1, ArrowDown: 1 }[e.key];
        if (!delta) return;
        e.preventDefault();
        moveSongBy(song, delta, 'handle');
      },
    }, icon(ICONS.grip, { width: 3 }));
    const stat = here ? hereShort(here.get(song.id), true, today) : '';
    let actions = null;
    const row = { handle, up: null, down: null };
    if (open) {
      row.up = el('button', {
        class: 'btn move', type: 'button', text: '↑', 'aria-label': `Move ${song.title} up`,
        onclick: (e) => moveSongBy(song, -1, focused(e) ? 'up' : null),
      });
      row.down = el('button', {
        class: 'btn move', type: 'button', text: '↓', 'aria-label': `Move ${song.title} down`,
        onclick: (e) => moveSongBy(song, 1, focused(e) ? 'down' : null),
      });
      row.up.disabled = index === 0;
      row.down.disabled = index === total - 1;
      actions = el('div', { class: 'song-actions' },
        row.up,
        row.down,
        el('button', {
          class: 'btn', type: 'button', text: 'Remove', 'aria-label': `Remove ${song.title} by ${song.artist}`,
          onclick: () => removeSong(song),
        }));
    }
    controls.set(song.id, row);

    const li = el('li', { class: `setlist-song${open ? ' open' : ''}`, 'data-song-id': song.id },
      el('div', { class: 'song-main' },
        handle,
        el('div', { class: 'text' },
          el('span', { class: 'title', text: song.title }),
          el('span', { class: 'sub', text: song.artist }),
          stat ? el('span', { class: `here${here.has(song.id) ? ' sung' : ''}`, text: stat }) : null),
        isTonight() ? null : toggleButton(song),
        el('button', {
          class: 'row-more', type: 'button', 'aria-label': `More for ${song.title}`, 'aria-expanded': String(open),
          onclick: (e) => toggleRow(song, focused(e)),
        }, icon(ICONS.more, { width: 3.2 }))),
      actions);
    if (handle) {
      // Drag to reorder (R16): shared with Tonight's set (js/drag.js).
      dragToReorder({
        list, li, handle,
        onDrop: (to, hadFocus) =>
          reorder(moveSongId(setlist, song.id, to, songsById), hadFocus ? { songId: song.id, which: 'handle' } : null),
        onCancel: drawSongs,
      });
    }
    return li;
  }

  function toggleRow(song, refocus) {
    openRow = openRow === song.id ? null : song.id;
    drawSongs();
    const li = list.querySelector(`[data-song-id="${song.id}"]`);
    if (openRow != null) li?.scrollIntoView({ block: 'nearest' });
    if (refocus) li?.querySelector('.row-more')?.focus();
  }

  // The header's lines and the songs, from the latest state.
  function drawSongs() {
    const inList = setlistSongs(setlist, songsById);
    const text = songsQuery.text.trim();
    const shown = text ? filterSongs(inList, songsQuery.text) : inList; // untrimmed: a trailing space asks for whole words
    countText.textContent = plural(inList.length, 'song', 'songs');
    genreLine.textContent = inList.length ? mixSummary(mixByGenre(inList), 3) : '';
    decadeLine.textContent = inList.length ? mixSummary(mixByDecade(inList), 4) : '';
    inSetLine.textContent = !inList.length ? ''
      : isTonight() ? 'This is tonight\'s set' : `${inTonight(inList, tonight)} of ${inList.length} in tonight's set`;
    legend.hidden = !inList.length || isTonight();
    controls.clear();
    list.replaceChildren(...shown.map((song) => songRow(song, inList.indexOf(song), inList.length, !!text)));
    if (inList.length && !shown.length) list.append(el('li', { class: 'muted no-match', text: `No songs in this list match “${text}”.` }));
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
    const name = order.find((key) => row[key] && !row[key].disabled) || 'handle';
    row[name]?.focus();
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
      suggestStatus.textContent = 'No songs yet. Add some under Songs first.';
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

  // Up (-1) or Down (1), from the row's "…" or the arrow keys on the handle.
  function moveSongBy(song, delta, which = null) {
    return reorder(moveSongIdBy(setlist, song.id, delta, songsById), which ? { songId: song.id, which } : null);
  }

  // No confirmation: removing deletes no data and is easy to redo.
  async function removeSong(song) {
    setlist = removeSongId(setlist, song.id);
    if (openRow === song.id) openRow = null;
    clearStatus();
    await save();
  }

  const root = el('div', { class: 'stack setlists-view' },
    el('button', {
      class: 'back', type: 'button', 'aria-label': 'Back to Lists',
      onclick: () => {
        lastOpen = null; // chosen on purpose: the scope starts at the lists next time (R60)
        closeScreen(() => renderSetlists());
      },
    }, icon(CHEVRON_LEFT, { size: 20 }), 'Lists'),
    el('header', { class: 'list-head' },
      el('h2', { text: setlist.name }),
      el('p', { class: 'list-meta' },
        el('span', { class: 'label', text: venueLabel(setlist, venues) }), ' · ', countText),
      genreLine,
      decadeLine,
      inSetLine),
    el('div', { class: 'setlist-actions' }, findButton, renameButton, mergeButton, deleteButton, mergeNote),
    editSlot,
    mergeForm,
    status,
    legend,
    list,
    empty,
    mix,
    suggestForm);
  viewEl.replaceChildren(root);
  viewEl.scrollTop = 0;
  drawSongs();
  dock.filters(null);
  dock.search({
    placeholder: `Search ${setlist.name}`,
    value: songsQuery.text,
    detail: true, // the field stays up on this screen
    onInput: (value) => {
      if (!root.isConnected) return;
      songsQuery = { id, text: value };
      drawSongs();
    },
  });
}
