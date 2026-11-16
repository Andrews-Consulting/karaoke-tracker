// The Lists scope (Design B): building and tidying setlists, each labelled for
// a venue or for any venue (R14, R56). Working one through the night is Tonight.
//   The lists: each with its label and song count, a genre line and a decade
//     line (R44 in miniature), and how many of its songs are in tonight's set
//     (or "Tonight's set" for the one that is). "New list" at the top opens a
//     form for a name and a label. The dock's field filters the lists by name.
//   A list's songs, stacked on top so the back gesture returns (R31): the
//     label and the mix lines, whose "+N more" unfolds every genre or decade
//     in place (R44), and "Make this tonight's set" at the venue chosen on
//     Tonight unless it is (R75); each song with + / ✓ for tonight's set
//     there (the owner's case: open "Crowd pleasers" and drop two songs into
//     tonight), its sings at the list's label venue (R43), a drag handle
//     (R16), and a swipe left for Remove (R15); a tap on the song opens its
//     page (R70). The list's actions: Find songs (R57) beside a "…" holding
//     Rename and label (R14, R56), Merge into… (R59) and Delete. Suggest
//     songs (R45) follows the songs: a preview to trim, then Add these, with
//     Undo. The dock's field filters its songs.
// Coming back to the scope within five minutes reopens the list (R60).
import { db, request } from '../db.js';
import {
  el, viewEl, confirmAction, openScreen, closeScreen, replaceScreen, renderingBack, screenTicket, screenStillShowing, icon, ICONS,
} from '../ui.js';
import * as dock from '../dock.js';
import { dragToReorder } from '../drag.js';
import { swipeToReveal } from '../swipe.js';
import { plural, sortVenues, singStats, todayLocalISO } from '../lib/stats.js';
import { filterSongs } from '../lib/search.js';
import {
  setlistNameError, sortSetlists, venueValue, venueIdFromValue, venueOptions, venueLabel,
  makeSetlist, updateSetlist, describeSetlistDelete, removeSongId, addSongId, setlistSongs,
  moveSongId, moveSongIdBy, mixByGenre, mixByDecade, formatMix,
  SUGGEST_MIN, SUGGEST_MAX, SUGGEST_DEFAULT, SUGGEST_MATCH, SUGGEST_SPREAD, suggestCount, suggestSongs,
  describeSuggestion, genreYear,
  mergePlan, describeMerge, describeMerged,
} from '../lib/setlist.js';
import { setMenuGroups, currentSetlistKey, currentSetlistFor } from '../lib/night.js';
import {
  VENUE_KEY, openCurrentSet, showSetInFind, setWorkingList, openSongScreen,
} from './songs.js';
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
const CROSS = ['M6 6l12 12', 'M18 6L6 18'];

// The "For venue (optional)" <select> (R56): Any venue, then every venue by name.
function venueSelect(venues, venueId) {
  const select = el('select', { name: 'venue' },
    ...venueOptions(venues, venueId).map((o) => el('option', { value: o.value, text: o.label })));
  select.value = venueValue(venueId);
  return select;
}

// The `max` biggest groups of a mix (R44), in the order given (genres most
// first, decades oldest first).
function mixHead(items, max) {
  if (items.length <= max) return items;
  const kept = new Set([...items].sort((a, b) => b.count - a.count).slice(0, max));
  return items.filter((item) => kept.has(item));
}

// A mix line in miniature (R44): the `max` biggest groups, then "+N more".
function mixSummary(items, max) {
  const head = formatMix(mixHead(items, max));
  return items.length > max ? `${head} · +${items.length - max} more` : head;
}

// A mix line at the top of a list's screen (R44): the `max` biggest groups,
// then "+N more", a button that unfolds every group in place (genres most
// first, decades oldest first, "No genre" and "No year" last) and, tapped
// again, folds them back. `noun` ('genre', 'decade') ends the button's name
// for screen readers: "+2 more genres", "fewer genres". Folded or not stays
// put while the list changes under it. set(items) draws it from a mix.
function foldingMix(max, noun) {
  const text = el('span', { class: 'mix-text' });
  const sep = el('span', { class: 'mix-sep', 'aria-hidden': 'true', text: ' · ' });
  const label = el('span');
  const named = el('span', { class: 'visually-hidden' });
  const more = el('button', { type: 'button', class: 'mix-more', 'aria-expanded': 'false' }, label, named);
  const line = el('p', { class: 'list-mix mix-line' }, text, sep, more);
  let items = [];
  let open = false;
  function draw() {
    const extra = items.length - max;
    text.textContent = formatMix(open ? items : mixHead(items, max));
    line.hidden = !items.length;
    line.classList.toggle('folds', extra > 0);
    sep.hidden = extra <= 0;
    more.hidden = extra <= 0;
    label.textContent = open ? 'fewer' : `+${extra} more`;
    named.textContent = ` ${!open && extra === 1 ? noun : `${noun}s`}`;
    more.setAttribute('aria-expanded', String(open));
  }
  more.addEventListener('click', () => {
    open = !open;
    draw();
  });
  return {
    line,
    set(next) {
      items = next;
      draw();
    },
  };
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
// order (R16), remove (R15), the song page (R70), find (R57), rename and
// label (R14, R56), merge (R59), delete (R14), mix (R44) and suggest (R45) ----------

// `message` is a line to show at the top, e.g. after a merge; `focusId` a
// song to bring into view and focus, e.g. coming back from its page.
async function renderSetlist(id, message = '', focusId = null) {
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
  let openRow = null; // the song whose row is swiped open

  const status = el('p', { class: 'status', role: 'status', text: message });
  const list = el('ol', { class: 'list setlist-songs', 'aria-label': 'Songs in this setlist' });
  const genreMix = foldingMix(3, 'genre');
  const decadeMix = foldingMix(4, 'decade');
  const countText = el('span', { class: 'list-count' });
  const inSetLine = el('p', { class: 'list-in-set' });
  const legend = el('p', { class: 'set-legend' },
    el('span', { class: 'tick', 'aria-hidden': 'true' }, icon(ICONS.check, { size: 14, width: 3 })),
    el('span', { class: 'visually-hidden', text: 'Tick' }),
    ' = in tonight\'s set');

  // "Find songs" (R57, R75): the Songs scope with this list as the working
  // list at the venue chosen on Tonight, where + adds songs to it; tonight's
  // set stays as it is. With the actions, and in place of the songs while
  // there are none, so only one shows at a time.
  const findSongs = () => showSetInFind(setlist.id);

  // "Make this tonight's set" (R75): designates the list at the venue chosen
  // on Tonight (or under Overall), where Sang it, Park and Up next work.
  const makeTonightButton = el('button', {
    class: 'btn make-tonight', type: 'button', text: 'Make this tonight\'s set', onclick: makeTonight,
  });
  let designating = false;
  async function makeTonight() {
    if (designating || isTonight()) return;
    designating = true;
    clearStatus();
    const key = currentSetlistKey(night.venueId);
    try {
      await db.put('meta', { key, value: setlist.id });
    } catch (err) {
      designating = false;
      if (root.isConnected) status.textContent = `Could not save: ${err.message}`;
      return;
    }
    designating = false;
    night.meta.set(key, setlist.id);
    tonight = setlist;
    setWorkingList(null); // Tonight shows it, and the Songs scope's + adds to it
    if (!root.isConnected) return;
    status.textContent = `“${setlist.name}” is tonight's set ${night.venue ? `at ${night.venue.name}` : 'under Overall'}.`;
    drawSongs();
  }
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
    // The target's screen takes this one's place in the history too, so Back
    // still goes to the lists, and back from a song opened on the merged list
    // returns to it, not to the emptied source. The note shows once.
    let note = describeMerged(setlist, plan);
    replaceScreen(() => {
      const message = note;
      note = '';
      return renderSetlist(target.id, message);
    });
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

  // ---- Suggest songs (R45): songs never sung here, in the list's own mix or
  // across every genre, shown first as a preview to trim; "Add these" puts
  // what is left on the end, and Undo takes them off again ----

  const general = setlist.venueId == null;
  const howMany = el('input', {
    type: 'number', name: 'how-many', min: String(SUGGEST_MIN), max: String(SUGGEST_MAX), step: '1',
    value: String(SUGGEST_DEFAULT), inputmode: 'numeric', required: '',
  });
  // Match this list or Mix it up; an empty list has no mix to match, so the switch hides.
  const matchChoice = el('input', { type: 'radio', name: 'suggest-mode', value: SUGGEST_MATCH });
  const spreadChoice = el('input', { type: 'radio', name: 'suggest-mode', value: SUGGEST_SPREAD });
  const modeSwitch = el('div', { class: 'suggest-mode', role: 'radiogroup', 'aria-label': 'Which songs' },
    el('label', {}, matchChoice, el('span', { text: 'Match this list' })),
    el('label', {}, spreadChoice, el('span', { text: 'Mix it up' })));
  const suggestHint = el('p', { class: 'muted hint' });
  const suggestButton = el('button', { class: 'btn primary', type: 'submit', text: 'Suggest songs' });
  const suggestError = el('p', { class: 'error', role: 'alert' });
  const suggestStatus = el('p', { class: 'status suggest-note', role: 'status' });
  // "Added 5 songs. Undo": stays until the list changes some other way.
  const doneLine = el('p', { class: 'status suggest-done', role: 'status' });
  const undoButton = el('button', { class: 'btn undo-add', type: 'button', text: 'Undo', onclick: undoAdd });
  // novalidate: an empty or out-of-range number gets an inline error instead of a bubble.
  const suggestForm = el('form', { class: 'card stack suggest', 'aria-label': 'Suggest songs', novalidate: '' },
    el('h3', { text: 'Suggest songs' }),
    suggestHint,
    modeSwitch,
    el('div', { class: 'suggest-row' }, el('label', { text: 'How many' }, howMany), suggestButton),
    suggestError,
    suggestStatus,
    doneLine);

  // The preview, under the card: "Suggested · 5", each song with × to drop it, then Add these or Cancel.
  const previewHead = el('h3', { id: 'suggest-preview-head', tabindex: '-1' });
  const previewNote = el('p', { class: 'muted hint' });
  const previewList = el('ul', { class: 'list suggest-picks', 'aria-label': 'Suggested songs' });
  const addButton = el('button', { class: 'btn primary', type: 'button', text: 'Add these', onclick: addPicks });
  const preview = el('section', { class: 'card stack suggest-preview', 'aria-labelledby': 'suggest-preview-head', hidden: '' },
    previewHead,
    previewNote,
    previewList,
    el('div', { class: 'row' },
      addButton,
      el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => closePreview(true) })));
  let picks = []; // the songs in the preview, in the order they would be added
  let undoIds = null; // the songs the last Add these put on the end, while Undo can take them off
  let adding = false; // stops a double tap from adding or undoing twice
  let hadSongs = null; // whether the list had songs at the last draw, for the switch's default

  function suggestMode() {
    return !modeSwitch.hidden && matchChoice.checked ? SUGGEST_MATCH : SUGGEST_SPREAD;
  }

  function drawHint() {
    const where = general ? 'anywhere' : 'here';
    suggestHint.textContent = suggestMode() === SUGGEST_MATCH
      ? `Songs never sung ${where}, in this list's mix of genres and decades.`
      : `Songs never sung ${where}, spread across genres and decades.`;
  }
  modeSwitch.addEventListener('change', drawHint);

  // Match this list once the list has songs (and whenever it gets its first
  // ones); Mix it up, with no switch, while it has none.
  function syncSuggest(count) {
    if ((count > 0) !== hadSongs) {
      hadSongs = count > 0;
      modeSwitch.hidden = !hadSongs;
      (hadSongs ? matchChoice : spreadChoice).checked = true;
    }
    drawHint();
  }

  function pickRow(song) {
    return el('li', { class: 'suggest-pick', 'data-song-id': song.id },
      el('span', { class: 'text' },
        el('span', { class: 'title', text: song.title }),
        el('span', { class: 'sub', text: song.artist }),
        el('span', { class: 'pick-mix', text: genreYear(song) })),
      el('button', {
        class: 'btn icon-btn drop-pick', type: 'button', 'aria-label': `Drop ${song.title}`, onclick: () => dropPick(song),
      }, icon(CROSS, { size: 18, width: 2.6 })));
  }

  function drawPreview() {
    previewHead.textContent = `Suggested · ${picks.length}`;
    previewList.replaceChildren(...picks.map(pickRow));
  }

  function showPreview(chosen, note) {
    picks = chosen;
    drawPreview();
    previewNote.textContent = note;
    preview.hidden = false;
    previewHead.focus(); // brings it into view, and a screen reader reads it
  }

  function closePreview(refocus) {
    picks = [];
    preview.hidden = true;
    previewList.replaceChildren();
    previewNote.textContent = '';
    if (refocus) suggestButton.focus({ preventScroll: true });
  }

  // × on a suggestion: out of the preview, with focus on the next ×; the last one closes it.
  function dropPick(song) {
    const at = picks.findIndex((s) => s.id === song.id);
    picks = picks.filter((s) => s.id !== song.id);
    if (!picks.length) {
      closePreview(true);
      return;
    }
    drawPreview();
    const drops = previewList.querySelectorAll('.drop-pick');
    drops[Math.min(at, drops.length - 1)].focus({ preventScroll: true });
  }

  // The line under the card after Add these or Undo; `undo` shows the Undo button.
  function showDone(text, undo) {
    doneLine.replaceChildren(text, undo ? ' ' : '', undo ? undoButton : '');
  }

  // Any other change to the list's songs ends what Undo would take back.
  function forgetUndo() {
    undoIds = null;
    doneLine.replaceChildren();
  }

  // Add these: what is left of the preview goes on the end, in the preview's
  // order; nothing already there moves or goes.
  async function addPicks() {
    if (adding || !picks.length) return;
    const there = new Set(setlist.songIds || []);
    const added = picks.map((s) => s.id).filter((songId) => !there.has(songId));
    closePreview(false);
    clearStatus();
    if (!added.length) return;
    const previous = setlist;
    for (const songId of added) setlist = addSongId(setlist, songId);
    adding = true;
    try {
      await save();
    } catch (err) {
      setlist = previous;
      drawSongs();
      showDone(`Could not save: ${err.message}`, false);
      return;
    } finally {
      adding = false;
    }
    undoIds = new Set(added);
    showDone(`Added ${plural(added.length, 'song', 'songs')}.`, true);
    undoButton.focus();
  }

  // Undo: the songs Add these put on the end come off again. Nothing else
  // has changed since (or Undo would be gone), so the list is as it was.
  async function undoAdd() {
    if (adding || !undoIds) return;
    const ids = undoIds;
    const previous = setlist;
    undoIds = null;
    for (const songId of ids) setlist = removeSongId(setlist, songId);
    if (ids.has(openRow)) openRow = null;
    suggestButton.focus({ preventScroll: true }); // Undo is about to go
    adding = true;
    try {
      await save();
    } catch (err) {
      setlist = previous;
      undoIds = ids;
      drawSongs();
      showDone(`Could not undo: ${err.message}`, true);
      return;
    } finally {
      adding = false;
    }
    showDone('Undone.', false);
  }

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

  // The song's page (R70); its Back returns to this list, with the song in view.
  function openSong(song) {
    openSongScreen(song.id, {
      label: `Back to ${setlist.name}`,
      render: ({ message: line = '', focusId: songId = null } = {}) => renderSetlist(setlist.id, line, songId),
    });
  }

  // A song row: drag handle at the far left, the song with its sings here
  // (a tap opens its page, R70), and + / ✓. Swiped left (js/swipe.js, as on
  // Tonight), Remove slides in over the row's end; it is in the page all the
  // time, so a keyboard reaches it and focusing it opens the row. A swipe,
  // or a tap that closes an open row, never opens the song. `filtered` while
  // the dock's field narrows the rows, when there is nothing to drag among.
  function songRow(song, filtered) {
    const open = openRow === song.id;
    const handle = filtered ? null : el('button', {
      class: 'handle', type: 'button', 'aria-label': `Move ${song.title}`,
      onkeydown: (e) => {
        const delta = { ArrowUp: -1, ArrowDown: 1 }[e.key];
        if (!delta) return;
        e.preventDefault();
        moveSongBy(song, delta);
      },
    }, icon(ICONS.grip, { width: 3 }));
    const stat = here ? hereShort(here.get(song.id), true, today) : '';
    const surface = el('div', { class: 'song-main' },
      handle,
      el('button', { type: 'button', class: 'text song-open', onclick: () => openSong(song) },
        el('span', { class: 'title', text: song.title }),
        el('span', { class: 'sub', text: song.artist }),
        stat ? el('span', { class: `here${here.has(song.id) ? ' sung' : ''}`, text: stat }) : null),
      isTonight() ? null : toggleButton(song));
    const panel = el('div', { class: 'song-actions', role: 'group', 'aria-label': `Actions for ${song.title}` },
      el('button', {
        class: 'btn danger', type: 'button', text: 'Remove', 'aria-label': `Remove ${song.title} by ${song.artist}`,
        onclick: () => removeSong(song),
      }));
    const li = el('li', { class: `setlist-song${open ? ' open' : ''}`, 'data-song-id': song.id }, surface, panel);
    if (handle) {
      // Drag to reorder (R16): shared with Tonight's set (js/drag.js).
      dragToReorder({
        list, li, handle,
        onDrop: (to, hadFocus) => reorder(moveSongId(setlist, song.id, to, songsById), hadFocus ? song.id : null),
        onCancel: drawSongs,
      });
    }
    swipeToReveal({
      li, surface, panel,
      isOpen: () => openRow === song.id,
      onOpen: () => setOpenRow(song.id),
      onClose: () => setOpenRow(null),
    });
    return li;
  }

  // The row swiped open, if any; one at a time. Only the classes change, so
  // focus stays where it is.
  function setOpenRow(songId) {
    openRow = songId;
    for (const li of list.querySelectorAll('li.setlist-song')) {
      li.classList.toggle('open', songId != null && li.dataset.songId === String(songId));
    }
  }

  // The header's lines and the songs, from the latest state.
  function drawSongs() {
    const inList = setlistSongs(setlist, songsById);
    const text = songsQuery.text.trim();
    const shown = text ? filterSongs(inList, songsQuery.text) : inList; // untrimmed: a trailing space asks for whole words
    countText.textContent = plural(inList.length, 'song', 'songs');
    genreMix.set(mixByGenre(inList));
    decadeMix.set(mixByDecade(inList));
    inSetLine.textContent = isTonight() ? 'This is tonight\'s set'
      : inList.length ? `${inTonight(inList, tonight)} of ${inList.length} in tonight's set` : '';
    makeTonightButton.hidden = isTonight();
    legend.hidden = !inList.length || isTonight();
    list.replaceChildren(...shown.map((song) => songRow(song, !!text)));
    if (inList.length && !shown.length) list.append(el('li', { class: 'muted no-match', text: `No songs in this list match “${text}”.` }));
    empty.hidden = inList.length > 0;
    findButton.hidden = inList.length === 0; // the empty state has its own
    syncMerge(inList.length);
    syncSuggest(inList.length);
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

  // Suggest songs (R45): a new preview in place of any open one; nothing is added yet.
  suggestForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearStatus();
    const n = suggestCount(howMany.value);
    if (n === null) {
      suggestError.textContent = `Enter how many songs to suggest, from ${SUGGEST_MIN} to ${SUGGEST_MAX}.`;
      howMany.focus();
      return;
    }
    if (!songs.length) {
      closePreview(false);
      suggestStatus.textContent = 'No songs yet. Add some under Songs first.';
      return;
    }
    const mode = suggestMode();
    const chosen = suggestSongs(songs, sings, setlist, n, { mode });
    const note = describeSuggestion(chosen.length, n, { general, match: mode === SUGGEST_MATCH });
    if (!chosen.length) {
      closePreview(false);
      suggestStatus.textContent = note;
      return;
    }
    showPreview(chosen, note);
  });

  // Saves a new order at once (R16). `refocus` (a song id) puts focus back on
  // that song's handle once the list is redrawn.
  async function reorder(next, refocus = null) {
    if (sameOrder(next.songIds, setlist.songIds || [])) return;
    setlist = next;
    clearStatus();
    forgetUndo();
    await save();
    if (refocus != null) list.querySelector(`[data-song-id="${refocus}"] .handle`)?.focus();
  }

  // Up (-1) or Down (1), from the arrow keys on the handle; focus stays with the song.
  function moveSongBy(song, delta) {
    return reorder(moveSongIdBy(setlist, song.id, delta, songsById), song.id);
  }

  // No confirmation: removing deletes no data and is easy to redo.
  async function removeSong(song) {
    setlist = removeSongId(setlist, song.id);
    if (openRow === song.id) openRow = null;
    clearStatus();
    forgetUndo();
    await save();
  }

  // Rename and label, Merge into… and Delete are occasional, so they wait
  // behind a "…" beside Find songs; choosing one closes the menu.
  const moreMenu = el('div', { class: 'list-more-menu', role: 'group', 'aria-label': 'List actions', hidden: '' },
    renameButton, mergeButton, deleteButton);
  const moreButton = el('button', {
    class: 'btn icon-btn list-more', type: 'button', 'aria-label': 'List actions', 'aria-expanded': 'false',
    onclick: () => showMore(moreMenu.hidden),
  }, icon(ICONS.more, { width: 3.2 }));
  function showMore(open) {
    moreMenu.hidden = !open;
    moreButton.setAttribute('aria-expanded', String(open));
    moreButton.classList.toggle('on', open);
  }
  moreMenu.addEventListener('click', (e) => { if (e.target.closest('button')) showMore(false); });

  const root = el('div', { class: 'stack setlists-view' },
    // The top line: back at the left, "Make this tonight's set" at the right.
    el('div', { class: 'list-topbar' },
      el('button', {
        class: 'back', type: 'button', 'aria-label': 'Back to Lists',
        onclick: () => {
          lastOpen = null; // chosen on purpose: the scope starts at the lists next time (R60)
          closeScreen(() => renderSetlists());
        },
      }, icon(CHEVRON_LEFT, { size: 20 }), 'Lists'),
      makeTonightButton),
    el('header', { class: 'list-head' },
      el('h2', { text: setlist.name }),
      el('p', { class: 'list-meta' },
        el('span', { class: 'label', text: venueLabel(setlist, venues) }), ' · ', countText),
      genreMix.line,
      decadeMix.line,
      inSetLine),
    el('div', { class: 'setlist-actions' }, findButton, moreButton, mergeNote),
    moreMenu,
    editSlot,
    mergeForm,
    status,
    legend,
    list,
    empty,
    suggestForm,
    preview);
  viewEl.replaceChildren(root);
  viewEl.scrollTop = 0;
  drawSongs();
  if (focusId != null) {
    const opener = list.querySelector(`[data-song-id="${focusId}"] .song-open`);
    if (opener) {
      opener.scrollIntoView({ block: 'center' });
      opener.focus({ preventScroll: true });
    }
  }
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
