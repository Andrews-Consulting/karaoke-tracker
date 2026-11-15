// Tonight (Design B): the home scope, for working tonight's set at a venue.
// The header has the venue menu (every venue, Overall and "Manage venues…";
// R37), the date, and the Set menu (every setlist grouped for this venue, any
// venue and other venues, then "New list for tonight…"; R47, R56). Tonight's
// set is the selected setlist, the same list the Lists scope shows; the venue
// and each venue's set are remembered in meta as before.
//   Sung strip (R50): what was sung here today, with Undo last; a tap opens
//     the venue's sings by date with Undo for today's.
//   After that (R49, R61): the rest of the set in order, each with its sings
//     here, a drag handle, and "…" for Park (the venue's Next time list),
//     Remove and Details.
//   Up next, at the head of the set (R49, R54, R74): the first song with its
//     key and sings here, "Sang it" (logs the sing, takes the song off the set
//     and shows the next one to the KJ, all in one tap) and "KJ".
//   Typing in the dock's field lists matching songs above the card, each
//     with + / ✓ for the set (R48), and offers the KaraFun catalog (R67).
// Under Overall there is a set too (R56), with no Sang it, Park or Sung strip.
import { db, request, CATALOG_STORE } from '../db.js';
import {
  el, viewEl, openScreen, closeScreen, screenTicket, screenStillShowing, icon, ICONS,
} from '../ui.js';
import * as dock from '../dock.js';
import { singStats, sortVenues, todayLocalISO, plural } from '../lib/stats.js';
import { titleOrder } from '../lib/find.js';
import { filterSongs } from '../lib/search.js';
import {
  makeSetlist, addSongId, removeSongId, moveSongId, setlistSongs, tonightSing,
} from '../lib/setlist.js';
import {
  currentSetlistKey, nextSetlistKey, tonightListName, uniqueSetlistName, setMenuGroups,
  OVERALL_LIST_NAME, nextSetlistFor, putBackOnTop, groupSingsByDate,
} from '../lib/night.js';
import { dragToReorder } from '../drag.js';
import { swipeToReveal } from '../swipe.js';
import {
  VENUE_KEY, openCurrentSet, startList, openSongScreen, findInSongs,
} from './songs.js';
import { renderKj, keyParts } from './kj.js';
import { renderVenues } from './venues.js';

// At most this many matches list above the card while typing.
const MATCH_LIMIT = 8;
// The venue menu's values for Overall and for "Manage venues…".
const OVERALL = '';
const MANAGE_VENUES = 'manage';
// The Set menu's last option, which starts a new list for tonight (R47), and
// its value for Overall's list before it is first saved (R56).
const NEW_LIST = 'new';
const UNSAVED = '';

// The field's text, kept while the app is open; a reload starts empty.
let query = '';

// Bumped on every Tonight screen, so a slow load never paints over a newer one.
let screen = 0;

function stillCurrent(token, ticket) {
  return token === screen && screenStillShowing(ticket);
}

// ---------- Dates and sings, as Tonight words them ----------

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'Sat 14 Nov 2026' (shown in capitals).
function longDate(now) {
  return `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

// A sing date ('YYYY-MM-DD') short: 'tonight', '17 Oct', or '17 Oct 2025' in another year.
export function shortDate(iso, today) {
  if (iso === today) return 'tonight';
  const [year, month, day] = iso.split('-').map(Number);
  const base = `${day} ${MONTHS[month - 1]}`;
  return String(year) === today.slice(0, 4) ? base : `${base} ${year}`;
}

// A row's sings here: '2× · 17 Oct', or 'New here' (under Overall, across every
// venue). The Songs and Lists scopes' rows use it too (R43).
export function hereShort(stat, atVenue, today) {
  if (stat && stat.count) return `${stat.count}× · ${shortDate(stat.lastSung, today)}`;
  return atVenue ? 'New here' : 'Never sung';
}

// The Up next card's: 'Here 2× · last 17 Oct', or 'Never sung here'.
function hereLong(stat, atVenue, today) {
  if (stat && stat.count) return `${atVenue ? 'Here ' : ''}${stat.count}× · last ${shortDate(stat.lastSung, today)}`;
  return atVenue ? 'Never sung here' : 'Never sung';
}

const pad = (n) => String(n).padStart(2, '0');

// Songs matching the field: titles that start with it first, then the rest,
// each in title order.
function rankMatches(songs, query) {
  const lower = (query || '').trim().toLowerCase();
  if (!lower) return [];
  const found = filterSongs(songs, query); // untrimmed: a trailing space asks for whole words (R10)
  const starts = (s) => s.title.toLowerCase().startsWith(lower);
  return [...found.filter(starts), ...found.filter((s) => !starts(s))];
}

// The title with the matched part marked.
function highlighted(title, text) {
  const at = title.toLowerCase().indexOf(text.toLowerCase());
  if (!text || at === -1) return [title];
  return [title.slice(0, at), el('span', { class: 'hit', text: title.slice(at, at + text.length) }), title.slice(at + text.length)];
}

// ---------- Saves, each in one transaction ----------

// "Park" (R49): saves `from` (the set without the song) and appends the song
// to the venue's Next time list, creating that list on first use or when the
// remembered one is gone. Resolves with { target, setlists }.
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

// "Sang it" (R49, R74): logs the sing and saves the set without the song,
// together. Resolves with the sing as stored, id included.
function logSing(sing, set) {
  return db.transaction(['sings', 'setlists'], 'readwrite', async (stores) => {
    const id = await request(stores.sings.add(sing));
    stores.setlists.put(set);
    return { ...sing, id };
  });
}

// Undo (R50, R74): deletes the sing and puts its song back on top of setlist
// `setId` as stored, together. Resolves with { sing, set } (set null when
// there is no such setlist), or null when the sing was already gone.
function undoSing(singId, setId) {
  return db.transaction(['sings', 'setlists'], 'readwrite', async (stores) => {
    const sing = await request(stores.sings.get(singId));
    if (!sing) return null;
    stores.sings.delete(singId);
    const stored = setId == null ? null : await request(stores.setlists.get(setId));
    const set = stored ? putBackOnTop(stored, sing.songId) : null;
    if (set) stores.setlists.put(set);
    return { sing, set };
  });
}

// The KJ view's Undo after "Sang it": the song goes back on top and Tonight shows again.
async function undoFromKj(singId, setId, title) {
  let message = `Put “${title}” back at the top of the set.`;
  try {
    await undoSing(singId, setId);
  } catch (err) {
    message = `Could not undo: ${err.message}`;
  }
  closeScreen(() => renderTonight({ message }));
}

// ---------- Tonight ----------

// `message` is a line for the status; `focusId` a song in the set to bring
// into view (coming back from its Details).
export async function renderTonight({ message = '', focusId = null } = {}) {
  const token = ++screen;
  const ticket = screenTicket();
  const [songRecords, venueRecords, singRecords, setlistRecords, metaRecords, catalogCount] = await Promise.all([
    db.getAll('songs'),
    db.getAll('venues'),
    db.getAll('sings'),
    db.getAll('setlists'),
    db.getAll('meta'),
    db.count(CATALOG_STORE),
  ]);
  if (!stillCurrent(token, ticket)) return;
  const songs = titleOrder(songRecords);
  const songsById = new Map(songs.map((s) => [s.id, s]));
  const venues = sortVenues(venueRecords);
  const meta = new Map(metaRecords.map((r) => [r.key, r.value])); // kept in step with what is saved
  const hasCatalog = catalogCount > 0;
  // Kept in step with every sing and setlist this screen saves.
  let sings = singRecords;
  let setlists = setlistRecords;
  const today = todayLocalISO();

  // A remembered venue that has since been deleted falls back to Overall.
  const wanted = meta.has(VENUE_KEY) ? meta.get(VENUE_KEY) : null;
  const state = {
    venueId: venues.some((v) => v.id === wanted) ? wanted : null,
    set: null, // tonight's set (R47, R56); id null while Overall's is unsaved
    open: null, // the song whose "…" row is open
  };
  const currentVenue = () => venues.find((v) => v.id === state.venueId) || null;
  {
    const opened = await openCurrentSet(currentVenue(), setlists, meta);
    if (!stillCurrent(token, ticket)) return;
    ({ set: state.set, setlists } = opened);
    if (state.set.id != null) meta.set(currentSetlistKey(state.venueId), state.set.id);
  }
  let stats = singStats(sings, state.venueId);
  let busy = false; // one Sang it or Undo at a time

  const setSongs = () => setlistSongs(state.set, songsById);
  const short = (song) => hereShort(stats.get(song.id), state.venueId != null, today);

  // The line that says what a tap did, or why it failed.
  const status = el('p', { class: 'notice tonight-status', role: 'status', text: message });
  const say = (text) => { status.textContent = text; };

  // A save that failed leaves the screen out of step, so it is drawn again
  // from what is stored, unless another screen has taken its place meanwhile.
  function failed(err) {
    console.warn('Tonight could not save:', err);
    if (root.isConnected) renderTonight({ message: `Could not save: ${err.message}` });
  }

  // ---- Venue (R37) ----

  const venueText = el('span', { class: 'menu-text' });
  const venueSelect = el('select', { name: 'venue', 'aria-label': 'Venue' });
  function fillVenueSelect() {
    venueSelect.replaceChildren(
      ...venues.map((v) => el('option', { value: String(v.id), text: v.name })),
      el('option', { value: OVERALL, text: 'Overall' }),
      el('option', { value: MANAGE_VENUES, text: venues.length ? 'Manage venues…' : 'Add a venue…' }));
    venueSelect.value = state.venueId == null ? OVERALL : String(state.venueId);
    venueText.textContent = currentVenue()?.name ?? 'Overall';
  }

  let venueChange = 0; // the newest venue choice, so a slow one never wins
  venueSelect.addEventListener('change', async () => {
    if (venueSelect.value === MANAGE_VENUES) {
      fillVenueSelect();
      openScreen(() => renderVenues()); // the venue list, with add, rename and delete (R40)
      return;
    }
    const ticket2 = ++venueChange;
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
    if (ticket2 !== venueChange || !root.isConnected) return;
    if (set.id != null) meta.set(currentSetlistKey(state.venueId), set.id);
    state.set = set;
    state.open = null;
    stats = singStats(sings, state.venueId);
    say('');
    drawAll();
  });

  // ---- Set (R47, R56) ----

  // Every setlist by name, grouped "For <venue>", "Any venue" and "Other
  // venues" (under Overall: "Any venue" and "For a venue"), then "New list for
  // tonight…" (under Overall "New list…", for any venue). Overall's unsaved
  // "My list" shows first until its first song saves it.
  const setText = el('span', { class: 'menu-text' });
  const setSelect = el('select', { name: 'set', 'aria-label': 'Set' });
  function fillSetSelect() {
    const options = setMenuGroups(setlists, venues, state.venueId).map((group) => el('optgroup', { label: group.label },
      ...group.items.map((item) => el('option', { value: String(item.id), text: item.text }))));
    if (state.set.id == null) options.unshift(el('option', { value: UNSAVED, text: state.set.name }));
    options.push(el('option', { value: NEW_LIST, text: state.venueId == null ? 'New list…' : 'New list for tonight…' }));
    setSelect.replaceChildren(...options);
    setSelect.value = state.set.id == null ? UNSAVED : String(state.set.id);
    setSelect.disabled = false;
    setText.textContent = state.set.name;
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
    state.open = null;
    meta.set(currentSetlistKey(state.venueId), set.id);
    drawAll();
  }

  // The set with new contents, before it is saved.
  function changeSet(next) {
    state.set = next;
    setlists = setlists.map((s) => (s.id === next.id ? next : s));
  }

  async function saveSet(next) {
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

  // + adds the song to the end of the set; ✓ takes it out (R48).
  async function toggleInSet(song) {
    if (state.set.id == null) {
      const venueId = state.venueId;
      if (!(await saveOverallList()) || state.venueId !== venueId) return;
    }
    const has = state.set.songIds.includes(song.id);
    const next = has ? removeSongId(state.set, song.id) : addSongId(state.set, song.id);
    changeSet(next);
    drawSet();
    drawDock();
    await saveSet(next);
  }

  // ---- Sung strip (R50) ----

  const strip = el('div', { class: 'sung-strip', hidden: '' });

  // Today's sings here, in the order they were logged.
  function sungTonight() {
    if (state.venueId == null) return [];
    return sings
      .filter((s) => s.venueId === state.venueId && s.date === today && songsById.has(s.songId))
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  }

  function drawStrip() {
    const tonight = sungTonight();
    strip.hidden = tonight.length === 0;
    if (!tonight.length) {
      strip.replaceChildren();
      return;
    }
    const last = tonight[tonight.length - 1];
    const lastSong = songsById.get(last.songId);
    const venueId = state.venueId;
    strip.replaceChildren(
      el('button', {
        type: 'button', class: 'sung-open', onclick: () => openScreen(() => renderSung(venueId)),
      },
        el('span', { class: 'cap', text: `Sung · ${tonight.length}` }),
        el('span', { class: 'sung-titles', text: tonight.map((s) => songsById.get(s.songId).title).join(', ') })),
      el('button', {
        type: 'button', class: 'undo-last', 'aria-label': `Undo last: ${lastSong.title} goes back to the top of the set`,
        onclick: () => undoLast(last),
      }, icon(ICONS.undo, { size: 16 }), 'Undo last'));
  }

  // Deletes the last sing and puts its song back on top of the set (R50).
  async function undoLast(sing) {
    if (busy) return;
    busy = true;
    let done;
    try {
      done = await undoSing(sing.id, state.set.id);
    } catch (err) {
      failed(err);
      return;
    }
    busy = false;
    if (!root.isConnected) return;
    sings = sings.filter((s) => s.id !== sing.id);
    stats = singStats(sings, state.venueId);
    if (done && done.set) changeSet(done.set);
    say(`Put “${songsById.get(sing.songId).title}” back at the top of the set.`);
    drawAll();
  }

  // ---- After that (R49, R61) ----

  const afterHead = el('p', { class: 'cap after-head' });
  const afterList = el('ol', { class: 'list after-list', 'aria-label': 'The rest of tonight\'s set' });
  const empty = el('div', { class: 'tonight-empty' },
    el('p', { text: 'Nothing in tonight\'s set yet. Type a song below, or open Lists.' }),
    el('button', { type: 'button', class: 'btn', text: 'Open Lists', onclick: () => dock.scope('lists') }));

  // Up next heads the set in the page, so it reads 01, 02, 03 from the top and
  // sits where a thumb rests after unlocking the phone; the field stays docked.
  const upBox = el('div', { class: 'up-box' });

  function drawSet() {
    const all = setSongs();
    const rest = all.slice(1);
    upBox.replaceChildren(...(all[0] ? [upNextCard(all[0])] : []));
    afterHead.textContent = `After that · ${rest.length}`;
    afterHead.hidden = rest.length === 0;
    afterList.hidden = rest.length === 0;
    afterList.replaceChildren(...rest.map((song, i) => afterRow(song, i + 2)));
    empty.hidden = all.length > 0;
  }

  // A song after the first: a drag handle at the far left, its place, title
  // and artist (which open its Details) and its sings here. Swipe the row left
  // for Park and Remove, which wait behind it (js/swipe.js).
  function afterRow(song, position) {
    const open = state.open === song.id;
    const canPark = state.venueId != null && !(nextTimeList() && nextTimeList().id === state.set.id);
    const handle = el('button', {
      type: 'button', class: 'handle', 'aria-label': `Move ${song.title}`,
      onkeydown: (e) => {
        const delta = { ArrowUp: -1, ArrowDown: 1 }[e.key];
        if (!delta) return;
        e.preventDefault();
        moveTo(song, setSongs().findIndex((s) => s.id === song.id) + delta, true);
      },
    }, icon(ICONS.grip, { width: 3 }));
    // The handle sits at the far left, away from where a thumb scrolls the page.
    const surface = el('div', { class: 'after-main' },
      handle,
      el('span', { class: 'pos', text: pad(position) }),
      el('button', { type: 'button', class: 'after-open', onclick: () => details(song) },
        el('span', { class: 'title', text: song.title }),
        el('span', { class: 'sub', text: song.artist })),
      el('span', { class: 'here', text: short(song) }));
    const panel = actionRow(song, canPark);
    const li = el('li', {
      class: `after-row${open ? ' open' : ''}`, 'data-song-id': song.id, style: `--reveal: ${canPark ? 180 : 110}px`,
    }, surface, panel);
    dragToReorder({
      list: afterList, li, handle,
      onDrop: (index, hadFocus) => moveTo(song, index + 1, hadFocus),
      onCancel: drawSet,
    });
    swipeToReveal({
      li, surface, panel,
      isOpen: () => state.open === song.id,
      onOpen: () => setOpen(song.id),
      onClose: () => setOpen(null),
    });
    return li;
  }

  // The row swiped open, if any; one at a time.
  function setOpen(songId) {
    if (state.open === songId) return;
    state.open = songId;
    drawSet();
  }

  // The venue's Next time list, when it has one (R49).
  function nextTimeList() {
    return nextSetlistFor(setlists, state.venueId, meta.get(nextSetlistKey(state.venueId)));
  }

  // Park (never onto the Next time list itself) and Remove, behind the row.
  function actionRow(song, canPark) {
    return el('div', { class: 'after-actions', role: 'group', 'aria-label': `Actions for ${song.title}` },
      canPark
        ? el('button', {
          type: 'button', class: 'btn park', text: 'Park', 'aria-label': `Park ${song.title} for next time`,
          onclick: () => park(song),
        })
        : null,
      el('button', {
        type: 'button', class: 'btn danger remove', text: 'Remove', 'aria-label': `Remove ${song.title} from tonight`,
        onclick: () => remove(song),
      }));
  }

  // A drop or an arrow key (R61): the song goes to `index` in the set, but
  // never above Up next, which the KJ already has. Drawn at once, then saved.
  async function moveTo(song, index, refocus) {
    if (index < 1) return;
    const next = moveSongId(state.set, song.id, index, songsById);
    const same = next.songIds.every((id, i) => id === state.set.songIds[i]);
    if (!same) changeSet(next);
    drawSet();
    drawDock();
    if (refocus) afterList.querySelector(`[data-song-id="${song.id}"] .handle`)?.focus();
    if (!same) await saveSet(next);
  }

  // Takes a song off tonight's set, with no confirmation: + puts it back.
  async function remove(song) {
    if (!state.set.songIds.includes(song.id)) return; // a second tap finds it gone
    const next = removeSongId(state.set, song.id);
    changeSet(next);
    state.open = null;
    say(`Removed “${song.title}” from tonight's set.`);
    drawSet();
    drawDock();
    await saveSet(next);
  }

  // Moves the song from the set to the end of the venue's Next time list (R49).
  async function park(song) {
    const venue = currentVenue();
    if (!venue || !state.set.songIds.includes(song.id)) return;
    const from = removeSongId(state.set, song.id);
    changeSet(from);
    state.open = null;
    drawSet();
    drawDock();
    try {
      const moved = await moveToNextTime(venue, from, song.id);
      setlists = moved.setlists;
      meta.set(nextSetlistKey(venue.id), moved.target.id);
    } catch (err) {
      failed(err);
      return;
    }
    fillSetSelect(); // a Next time list made just now joins the Set menu
    say(`Parked “${song.title}” for next time.`);
  }

  // The song's screen; Back returns here with the song in view.
  function details(song) {
    openSongScreen(song.id, { label: 'Back to Tonight', render: (extra) => renderTonight(extra) });
  }

  // ---- Up next, at the head of the set (R49, R54, R74) ----

  function upNextCard(song) {
    const key = keyParts(song.key);
    const atVenue = state.venueId != null;
    return el('section', { class: 'up-next', 'aria-labelledby': 'up-next-head' },
      el('div', { class: 'up-head' },
        el('h2', { id: 'up-next-head', class: 'cap', text: 'Up next · 01' }),
        key ? el('span', { class: 'key-badge', text: `Key ${key.big}` }) : null),
      el('p', { class: 'up-title', text: song.title }),
      el('p', { class: 'up-sub' },
        `${song.artist} · `,
        el('span', { class: 'here', text: hereLong(stats.get(song.id), atVenue, today) })),
      el('div', { class: `up-actions${atVenue ? '' : ' kj-only'}` },
        atVenue
          ? el('button', {
            type: 'button', class: 'btn sang', 'aria-label': `Sang it: ${song.title}`, onclick: sangIt,
          }, icon(ICONS.check, { width: 2.8 }), 'Sang it')
          : null,
        el('button', {
          type: 'button', class: 'btn kj', text: 'KJ', 'aria-label': `Show ${song.title} to the KJ`,
          onclick: () => openScreen(() => renderKj(song.id, { label: 'Up next for the KJ' })),
        })));
  }

  // Logs the sing here today and takes the song off the set, with no
  // confirmation, then shows the next song to the KJ at once (R74). Undo is
  // on the KJ view and on the Sung strip (R50).
  async function sangIt() {
    const venue = currentVenue();
    const song = setSongs()[0];
    if (busy || !venue || !song) return;
    busy = true;
    const next = removeSongId(state.set, song.id);
    let sing;
    try {
      sing = await logSing(tonightSing(song.id, venue.id, todayLocalISO()), next);
    } catch (err) {
      failed(err);
      return;
    }
    busy = false;
    if (!root.isConnected) return;
    changeSet(next);
    sings = [...sings, sing];
    stats = singStats(sings, state.venueId);
    const after = setSongs()[0];
    if (!after) {
      say(`Logged “${song.title}” at ${venue.name}. That was the last song in the set.`);
      drawAll();
      return;
    }
    query = ''; // on to the next song
    drawAll();
    const setId = next.id;
    openScreen(() => renderKj(after.id, {
      label: 'Up next for the KJ',
      logged: { title: song.title, venue: venue.name, undo: () => undoFromKj(sing.id, setId, song.title) },
    }));
  }

  // ---- Typing in the field (R48, R67) ----

  // A match: the title (the typed part marked), the artist, its sings here,
  // and + / ✓ for the set. Its buttons keep the field focused, so the
  // keyboard stays up while adding several.
  function matchRow(song, text) {
    const has = state.set.songIds.includes(song.id);
    return el('li', { class: 'match', 'data-song-id': song.id },
      el('div', { class: 'match-text' },
        el('span', { class: 'title' }, ...highlighted(song.title, text)),
        el('span', { class: 'sub', text: song.artist })),
      el('span', { class: 'here', text: short(song) }),
      el('button', {
        type: 'button', class: `btn set-toggle${has ? ' in-set' : ''}`, text: has ? '✓' : '+',
        'aria-label': has ? `Remove ${song.title} from the set` : `Add ${song.title} to the set`,
        onmousedown: (e) => e.preventDefault(),
        onclick: () => toggleInSet(song),
      }));
  }

  function matchesPanel() {
    const text = query.trim();
    const all = rankMatches(songs, query);
    const head = all.length
      ? `Add to tonight · ${plural(all.length, 'match', 'matches')}${all.length > MATCH_LIMIT ? ` · top ${MATCH_LIMIT}` : ''}`
      : 'No songs match';
    return el('section', { class: 'matches', 'aria-label': 'Add to tonight' },
      el('p', { class: 'cap', text: head }),
      all.length ? el('ul', { class: 'match-list' }, ...all.slice(0, MATCH_LIMIT).map((song) => matchRow(song, text))) : null,
      // Fewer than three of mine: the catalog may have it (R67); none: add it as a new song.
      all.length < 3 && hasCatalog
        ? el('button', {
          type: 'button', class: 'match-more', onclick: () => findInSongs(text, { catalog: true }),
        }, icon(ICONS.search, { size: 16 }), `Search the KaraFun catalog for “${text}”`)
        : null,
      all.length === 0
        ? el('button', {
          type: 'button', class: 'match-more', onclick: () => findInSongs(text),
        }, icon(ICONS.plus, { size: 16 }), `Add “${text}” as a new song`)
        : null);
  }

  // The slot above the field: the matches while typing, right above the field
  // where the keyboard leaves room (the prototype's B1); nothing otherwise.
  const dockBox = el('div', { class: 'tonight-dock' });
  function drawDock() {
    if (query.trim()) {
      dockBox.replaceChildren(matchesPanel());
      dock.slot(dockBox);
    } else {
      dockBox.replaceChildren();
      dock.slot(null);
    }
  }

  function drawAll() {
    fillVenueSelect();
    fillSetSelect();
    drawStrip();
    drawSet();
    drawDock();
    if (dock.searchValue() !== query) dock.search({ ...searchOptions, value: query });
  }

  const searchOptions = {
    placeholder: 'Add a song to tonight',
    label: 'Add a song to tonight\'s set',
    value: query,
    onInput: (value) => {
      if (!root.isConnected) return;
      query = value;
      drawDock();
    },
  };

  // ---- The screen ----

  const header = el('header', { class: 'tonight-head' },
    el('div', { class: 'tonight-where' },
      el('div', { class: 'menu venue-menu' },
        el('span', { class: 'menu-face', 'aria-hidden': 'true' }, venueText, icon(ICONS.chevron, { size: 20 })),
        venueSelect),
      el('p', { class: 'tonight-date', text: longDate(new Date()) })),
    el('div', { class: 'menu set-menu' },
      el('span', { class: 'menu-face', 'aria-hidden': 'true' },
        el('span', { class: 'cap', text: 'Set' }),
        el('span', { class: 'menu-line' }, setText, icon(ICONS.chevron, { size: 16 }))),
      setSelect));
  const root = el('div', { class: 'tonight' }, header, status, strip, upBox, afterHead, afterList, empty);

  viewEl.replaceChildren(root);
  dock.search(searchOptions);
  drawAll();
  viewEl.scrollTop = 0;
  if (focusId != null) {
    const row = afterList.querySelector(`[data-song-id="${focusId}"] .after-open`);
    if (row) {
      row.scrollIntoView({ block: 'center' });
      row.focus({ preventScroll: true });
    }
  }
}

// ---------- What was sung here, by date (R50) ----------

// Every sing at the venue grouped by date, newest first, with Undo for
// today's: it deletes the sing and puts the song back on top of tonight's set.
async function renderSung(venueId, message = '') {
  const ticket = screenTicket();
  const [songs, venue, sings, current] = await Promise.all([
    db.getAll('songs'), db.get('venues', venueId), db.getAll('sings'), db.get('meta', currentSetlistKey(venueId)),
  ]);
  if (!screenStillShowing(ticket)) return;
  if (!venue) {
    closeScreen();
    return;
  }
  const today = todayLocalISO();
  const groups = groupSingsByDate(sings, songs, venueId, today);
  const setId = current ? current.value : null;
  let undoing = false;

  async function undo(sing, song) {
    if (undoing) return;
    undoing = true;
    let text = `Put “${song.title}” back at the top of the set.`;
    try {
      const done = await undoSing(sing.id, setId);
      if (!done) text = '';
    } catch (err) {
      text = `Could not undo: ${err.message}`;
    }
    if (screenStillShowing(ticket)) renderSung(venueId, text);
  }

  const row = (sing, song, isToday) => el('li', { class: 'sung-row', 'data-song-id': song.id, 'data-sing-id': sing.id },
    el('span', { class: 'sung-song' },
      el('span', { class: 'title', text: song.title }),
      el('span', { class: 'sub', text: song.artist })),
    isToday
      ? el('button', {
        type: 'button', class: 'btn', text: 'Undo', 'aria-label': `Undo ${song.title}`, onclick: () => undo(sing, song),
      })
      : null);

  viewEl.replaceChildren(
    el('div', { class: 'stack sung-view' },
      el('button', { type: 'button', class: 'btn back', onclick: () => closeScreen() },
        el('span', { 'aria-hidden': 'true', text: '‹ ' }), 'Back to Tonight'),
      el('h2', { text: `Sung at ${venue.name}` }),
      el('p', { class: 'notice tonight-status', role: 'status', text: message }),
      groups.length
        ? el('div', { class: 'stack' }, ...groups.map((group) => el('section', { class: 'sung-day', 'aria-label': group.label },
          el('h3', { text: group.label }),
          el('ul', { class: 'list' }, ...group.entries.map(({ sing, song }) => row(sing, song, group.date === today))))))
        : el('p', { class: 'muted', text: 'Nothing sung here yet.' })));
  viewEl.scrollTop = 0;
}
