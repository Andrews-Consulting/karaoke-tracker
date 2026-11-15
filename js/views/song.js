// The song page (Design B, R70): one song, opened from its row in Songs,
// from Pick one, or from Tonight's Details. The header is for the KJ: the
// title and artist large, and the key as a big number with its meaning (R6);
// KJ shows the song full screen (R54, js/views/kj.js). Below it, each tap is
// saved at once: status as three toggles, the chosen one tapped again to
// clear it (R7, R64); rating 1 to 5 the same way (R4); the key a semitone
// down or up (R6); and On set / Add to set for tonight's set (R48, R56).
// Then the notes (R3), tags (R5), the sings here and at every venue (R8),
// genre and year (R36) and whether KaraFun has it (R68). Listen opens a video
// search in a new tab (R38); Edit opens the full form (R2, R3, R36, R5);
// Delete removes the song with its sings and its place in every setlist (R2).
import { db } from '../db.js';
import {
  el, viewEl, confirmAction, openScreen, closeScreen, screenTicket, screenStillShowing, icon, ICONS,
} from '../ui.js';
import {
  updateSong, validateSong, planSongDelete, describeSongDelete, SONG_STATUSES, STATUS_LABELS, NO_STATUS_LABEL,
  RATINGS, normalizeRating, formatTags, normalizeTags,
} from '../lib/song.js';
import { singStats, todayLocalISO } from '../lib/stats.js';
import { addSongId, removeSongId } from '../lib/setlist.js';
import { OVERALL_LIST_NAME } from '../lib/night.js';
import {
  VENUE_KEY, openCurrentSet, startList, deleteSong, showErrors, textField, yearField,
} from './songs.js';
import { renderKj, keyParts } from './kj.js';
import { hereShort } from './tonight.js';

const MINUS_ICON = ['M5 12h14'];
const PENCIL_ICON = ['M4 20h4L19 9l-4-4L4 16z'];

// The stepper's range, in semitones either way.
const KEY_LIMIT = 12;

// Bumped on every song page, so a slow load never paints over a newer one.
let screen = 0;

const pad = (n) => String(n).padStart(2, '0');

// A song's key as semitones for the stepper (R6): no key is 0, '-2' or '−2'
// is -2, '+1' or '1' is 1. Null for a key that is not a number of semitones
// ('Bb', 'capo 2'), which only the edit form changes.
function semitones(key) {
  const text = String(key ?? '').trim();
  if (!text) return 0;
  const match = /^([+\-−]?)\s*(\d{1,2})$/.exec(text);
  if (!match) return null;
  const steps = Number(match[2]);
  return match[1] === '-' || match[1] === '−' ? -steps : steps;
}

// Semitones as the edit form spells a key: '-2', '+1', and no key for 0.
const keyText = (steps) => (steps === 0 ? '' : steps > 0 ? `+${steps}` : String(steps));

// A video search for the song, opened by the owner in a new tab (R38).
function videoSearchUrl(song) {
  const terms = [song.title, song.artist].map((t) => String(t ?? '').trim()).filter(Boolean).join(' ');
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(terms)}`;
}

// "‹ Songs": the way back, named in full for screen readers ('Back to Songs').
function backButton(label, onclick) {
  return el('button', { type: 'button', class: 'back-link', 'aria-label': label, onclick },
    el('span', { class: 'back-mark', 'aria-hidden': 'true', text: '‹' }), label.replace(/^Back to /, ''));
}

// Opens a song's page on top of the screen showing. `back` is { label,
// render }: the Back button's name ('Back to Songs', 'Back to Tonight') and
// the render that returns there, given { focusId } or { message }.
export function openSongScreen(songId, back) {
  openScreen(() => renderSong(songId, back));
}

async function renderSong(id, back) {
  const token = ++screen;
  const ticket = screenTicket();
  const stillCurrent = () => token === screen && screenStillShowing(ticket);
  const [found, venues, sings, setlistRecords, metaRecords] = await Promise.all([
    db.get('songs', id),
    db.getAll('venues'),
    db.getAllByIndex('sings', 'songId', id),
    db.getAll('setlists'),
    db.getAll('meta'),
  ]);
  if (!stillCurrent()) return;
  if (!found) {
    closeScreen(() => back.render({ message: 'That song is no longer in your library.' }));
    return;
  }
  let song = found;
  const meta = new Map(metaRecords.map((r) => [r.key, r.value]));
  const venue = venues.find((v) => v.id === meta.get(VENUE_KEY)) || null;
  // Tonight's set at the venue chosen on Tonight, or under Overall (R47, R56).
  let set = null;
  try {
    ({ set } = await openCurrentSet(venue, setlistRecords, meta));
  } catch (err) {
    console.warn('Could not open tonight\'s set:', err);
  }
  if (!stillCurrent()) return;
  const today = todayLocalISO();

  const errorBox = el('p', { class: 'error', role: 'alert', hidden: '' });
  const showError = (text) => {
    errorBox.hidden = !text;
    errorBox.textContent = text;
  };

  // Saves a change made on the page at once, and shows it.
  async function save(changes) {
    const next = updateSong(song, changes);
    song = next;
    draw();
    try {
      await db.put('songs', next);
      showError('');
    } catch (err) {
      showError(`Could not save the song: ${err.message}`);
    }
  }

  const edit = (focus = null) => openScreen(() => renderEditSong(song.id, back, focus));

  // ---- The header, for the KJ ----

  const keyBig = el('span', { class: 'song-key-big' });
  const keyWords = el('span', { class: 'song-key-words' });
  const headKey = el('p', { class: 'song-key' }, el('span', { class: 'cap', text: 'Key' }), keyBig, keyWords);
  const length = song.title.length <= 12 ? 'short' : song.title.length <= 20 ? 'medium' : 'long';
  const header = el('header', { class: `song-head song-${length}` },
    el('div', { class: 'song-bar' },
      backButton(back.label || 'Back to Songs', () => closeScreen(() => back.render({ focusId: song.id }))),
      // The song full screen for the KJ (R54); Done comes back here.
      el('button', {
        type: 'button', class: 'btn kj-button', text: 'KJ', 'aria-label': 'Show to the KJ',
        onclick: () => openScreen(() => renderKj(song.id, { label: 'For the KJ' })),
      })),
    el('p', { class: 'cap song-for', text: 'For the KJ' }),
    el('h2', { class: 'song-title', text: song.title }),
    el('p', { class: 'song-artist', text: song.artist }),
    headKey);

  // ---- Changed in place ----

  // A labelled line: "STATUS  [Go-to] [Want to try] [Retired]".
  const line = (label, ...content) => el('div', { class: 'song-line' },
    el('p', { class: 'cap song-label', text: label }), ...content);

  const statusButtons = SONG_STATUSES.map((value) => el('button', {
    type: 'button', class: 'toggle', text: STATUS_LABELS[value],
    onclick: () => save({ status: song.status === value ? '' : value }),
  }));
  const ratingButtons = RATINGS.map((n) => el('button', {
    type: 'button', class: 'toggle rate', text: String(n), 'aria-label': `Rate ${n} of 5`,
    onclick: () => save({ rating: normalizeRating(song.rating) === n ? null : n }),
  }));

  const keyValue = el('span', { class: 'key-value', 'aria-live': 'polite' });
  const stepKey = (delta) => {
    const now = semitones(song.key);
    if (now === null) return;
    const next = Math.max(-KEY_LIMIT, Math.min(KEY_LIMIT, now + delta));
    if (next !== now) save({ key: keyText(next) });
  };
  const keyDown = el('button', {
    type: 'button', class: 'step', 'aria-label': 'Key down a semitone', onclick: () => stepKey(-1),
  }, icon(MINUS_ICON, { size: 18, width: 2.6 }));
  const keyUp = el('button', {
    type: 'button', class: 'step', 'aria-label': 'Key up a semitone', onclick: () => stepKey(1),
  }, icon(ICONS.plus, { size: 18, width: 2.6 }));

  // Tonight's set: "On set · 03", or "Add to set". Under Overall the first
  // song saves "My list" (R56).
  const setButton = el('button', { type: 'button', class: 'toggle set-button', onclick: toggleSet });
  let setBusy = false;
  async function toggleSet() {
    if (setBusy || !set) return;
    setBusy = true;
    try {
      if (set.id == null) set = (await startList(null, OVERALL_LIST_NAME)).set;
      set = set.songIds.includes(song.id) ? removeSongId(set, song.id) : addSongId(set, song.id);
      drawSet();
      await db.put('setlists', set);
      showError('');
    } catch (err) {
      showError(`Could not save: ${err.message}`);
    } finally {
      setBusy = false;
    }
  }

  function drawSet() {
    setButton.hidden = !set;
    if (!set) return;
    const at = set.songIds.indexOf(song.id);
    setButton.classList.toggle('on', at >= 0);
    setButton.replaceChildren(...(at >= 0
      ? [icon(ICONS.check, { size: 16, width: 2.8 }), `On set · ${pad(at + 1)}`]
      : ['Add to set']));
    setButton.setAttribute('aria-label', at >= 0 ? `Remove ${song.title} from the set` : `Add ${song.title} to the set`);
  }

  function draw() {
    SONG_STATUSES.forEach((value, i) => statusButtons[i].setAttribute('aria-pressed', String(song.status === value)));
    const rating = normalizeRating(song.rating);
    ratingButtons.forEach((button, i) => {
      button.setAttribute('aria-pressed', String(rating === i + 1));
      button.classList.toggle('lit', rating !== null && i + 1 <= rating);
    });
    const steps = semitones(song.key);
    keyValue.textContent = steps === null ? song.key : steps === 0 ? '0' : keyParts(keyText(steps)).big;
    keyDown.disabled = steps === null || steps <= -KEY_LIMIT;
    keyUp.disabled = steps === null || steps >= KEY_LIMIT;
    const key = keyParts(song.key);
    headKey.hidden = !key;
    keyBig.textContent = key ? key.big : '';
    keyWords.textContent = key ? key.words : '';
    drawSet();
  }

  // ---- The rest ----

  const field = (label, value) => el('div', { class: 'field' },
    el('dt', { text: label }),
    el('dd', { class: value ? '' : 'muted', text: value || '—' }));
  const tags = normalizeTags(song.tags);

  async function remove() {
    const [allSings, setlists] = await Promise.all([
      db.getAllByIndex('sings', 'songId', song.id),
      db.getAll('setlists'),
    ]);
    if (!confirmAction(describeSongDelete(song, planSongDelete(song.id, allSings, setlists)))) return;
    try {
      await deleteSong(song.id);
    } catch (err) {
      showError(`Could not delete the song: ${err.message}`);
      return;
    }
    closeScreen(() => back.render({ message: `Deleted “${song.title}”.` }));
  }

  viewEl.replaceChildren(el('section', { class: 'song-page', 'aria-label': 'Song details' },
    header,
    el('div', { class: 'song-body' },
      line('Status', el('div', { class: 'toggles', role: 'group', 'aria-label': 'Status' }, ...statusButtons)),
      line('Rating', el('div', { class: 'toggles rates', role: 'group', 'aria-label': 'Rating' }, ...ratingButtons)),
      line('Key', el('div', { class: 'stepper' }, keyDown, keyValue, keyUp), setButton),
      line('Notes',
        song.notes
          ? el('p', { class: 'song-notes', text: song.notes })
          : el('p', { class: 'song-notes muted', text: 'No notes yet.' }),
        el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Change notes', onclick: () => edit('notes') },
          icon(PENCIL_ICON, { size: 18, width: 2.2 }))),
      line('Tags', el('div', { class: 'song-tags' },
        ...tags.map((tag) => el('span', { class: 'tag-chip', text: tag })),
        el('button', { type: 'button', class: 'icon-btn add-tag', 'aria-label': 'Add a tag', onclick: () => edit('tags') },
          icon(ICONS.plus, { size: 16, width: 2.6 })))),
      el('dl', { class: 'song-fields' },
        venue ? field('Here', hereShort(singStats(sings, venue.id).get(song.id), true, today)) : null,
        field('All venues', hereShort(singStats(sings).get(song.id), false, today)),
        field('Genre', song.genre),
        field('Year', song.year == null ? '' : String(song.year)),
        field('KaraFun', song.karafunId != null ? 'Yes' : 'No')), // R68
      errorBox,
      el('div', { class: 'song-actions' },
        // Opens in a new tab, so the app stays where it was; nothing is fetched or saved (R38).
        el('a', { class: 'btn video-link', href: videoSearchUrl(song), target: '_blank', rel: 'noopener' },
          'Listen', el('span', { 'aria-hidden': 'true', text: ' ↗' })),
        el('button', { type: 'button', class: 'btn', text: 'Edit', onclick: () => edit() }),
        el('button', { type: 'button', class: 'btn danger', text: 'Delete', onclick: remove })))));
  draw();
  viewEl.scrollTop = 0;
}

// Every field of a song (R2, R3, R36, plus tags, key, status and rating).
// `focus` names the field to start in ('notes', 'tags').
async function renderEditSong(id, back, focus = null) {
  const ticket = screenTicket();
  const song = await db.get('songs', id);
  if (!screenStillShowing(ticket)) return;
  if (!song) {
    closeScreen(() => back.render({ message: 'That song is no longer in your library.' }));
    return;
  }
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
      el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => closeScreen() }),
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

  viewEl.replaceChildren(el('div', { class: 'song-edit' }, form));
  viewEl.scrollTop = 0;
  if (focus) form.elements.namedItem(focus)?.focus();
}
