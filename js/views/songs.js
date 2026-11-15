// What the Songs scope (js/views/find.js), the song page (js/views/song.js)
// and Tonight share: the venue and tonight's set at it (R37, R47, R56),
// "Find songs" on a setlist (R57), deleting a song with its sings (R2), the
// song forms' fields, and the Add a song sheet (R1) with suggestions from
// MusicBrainz (R35, R63), a warning about a song already there (R9) and the
// status left unset (R64).
// The Songs scope and the song page are re-exported from here, so the
// modules that open them (app.js, tonight.js, setlists.js) import from one place.
import { db, request } from '../db.js';
import {
  el, viewEl, closeScreen, screenTicket, screenStillShowing,
} from '../ui.js';
import * as dock from '../dock.js';
import {
  makeSong, validateSong, planSongDelete, songKey, SONG_STATUSES, STATUS_LABELS, NO_STATUS_LABEL,
} from '../lib/song.js';
import { createSuggester, fetchArtistGenres } from '../musicbrainz.js';
import { makeSetlist } from '../lib/setlist.js';
import { currentSetlistKey, uniqueSetlistName, currentSetlistFor, OVERALL_LIST_NAME } from '../lib/night.js';

export { renderSongs, findInSongs } from './find.js';
export { openSongScreen } from './song.js';

// The meta record that remembers the venue across visits and reloads (R37).
// Tonight's venue menu sets it; the Songs scope and the song page read it.
export const VENUE_KEY = 'findVenueId';

// Opens Settings at the Backup card (R65).
export function goToBackup() {
  dock.scope('settings');
  setTimeout(() => document.getElementById('backup-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
}

// ---------- Sets at a venue (R47, R56), each change in one transaction ----------

// Overall's list before anything is in it (R56): shown, but saved only when
// the first song goes in, so opening the app never creates a setlist.
const unsavedOverallList = () => ({ id: null, ...makeSetlist(OVERALL_LIST_NAME, null) });

// The current set at a venue, or under Overall when `venue` is null (R47,
// R56): the remembered one, whatever its label; else the first by name
// labelled for the venue, then the first for any venue (under Overall, the
// first for any venue, then the first of all); else at a venue a new one
// named after it, and under Overall an unsaved "My list". Read and written in
// one transaction, so two quick visits never create two. Resolves with
// { set, setlists }, where setlists is every setlist as stored afterwards.
// Skips the transaction when `setlists` and `meta` (key -> value) already
// hold the remembered set.
export function openCurrentSet(venue, setlists, meta) {
  const venueId = venue ? venue.id : null;
  const key = currentSetlistKey(venueId);
  const known = currentSetlistFor(setlists, venueId, meta.get(key));
  if (known && known.id === meta.get(key)) return Promise.resolve({ set: known, setlists });
  if (!venue && !known) return Promise.resolve({ set: unsavedOverallList(), setlists });
  return db.transaction(['setlists', 'meta'], 'readwrite', async (stores) => {
    const all = await request(stores.setlists.getAll());
    const saved = await request(stores.meta.get(key));
    let set = currentSetlistFor(all, venueId, saved ? saved.value : undefined);
    let stored = all;
    if (!set && !venue) return { set: unsavedOverallList(), setlists: all };
    if (!set) {
      const fresh = makeSetlist(uniqueSetlistName(venue.name, all), venue.id);
      set = { ...fresh, id: await request(stores.setlists.add(fresh)) };
      stored = [...all, set];
    }
    if (!saved || saved.value !== set.id) stores.meta.put({ key, value: set.id });
    return { set, setlists: stored };
  });
}

// A new list named `name`, made unique, which becomes the current set at the
// venue (labelled for it), or under Overall when `venue` is null (for any
// venue). "New list for tonight" (R47) names it for today; Overall's first
// list is "My list" (R56). Resolves with { set, setlists }.
export function startList(venue, name) {
  const venueId = venue ? venue.id : null;
  return db.transaction(['setlists', 'meta'], 'readwrite', async (stores) => {
    const all = await request(stores.setlists.getAll());
    const fresh = makeSetlist(uniqueSetlistName(name, all), venueId);
    const set = { ...fresh, id: await request(stores.setlists.add(fresh)) };
    stores.meta.put({ key: currentSetlistKey(venueId), value: set.id });
    return { set, setlists: [...all, set] };
  });
}

// "Find songs" on a setlist (R57): makes it tonight's set at the remembered
// venue (or under Overall), then shows the Songs scope. The venue stays as it is.
export async function showSetInFind(setlistId) {
  const [saved, venues] = await Promise.all([db.get('meta', VENUE_KEY), db.getAll('venues')]);
  const wanted = saved ? saved.value : null;
  const venueId = venues.some((v) => v.id === wanted) ? wanted : null; // a deleted venue means Overall
  await db.put('meta', { key: currentSetlistKey(venueId), value: setlistId });
  dock.scope('songs');
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

// ---------- The song forms' fields ----------

// Shows validateSong() errors on a form. Returns true when there were any.
export function showErrors(form, errorBox, errors) {
  for (const field of form.elements) field.removeAttribute('aria-invalid');
  const names = Object.keys(errors);
  errorBox.hidden = names.length === 0;
  errorBox.textContent = names.map((name) => errors[name]).join(' ');
  for (const name of names) form.elements[name]?.setAttribute('aria-invalid', 'true');
  if (names.length) form.elements[names[0]]?.focus();
  return names.length > 0;
}

export function textField(label, props) {
  return el('label', { text: label }, el('input', { autocomplete: 'off', ...props }));
}

export function yearField() {
  return textField('Year', { name: 'year', type: 'number', min: '1900', max: '2100', inputmode: 'numeric' });
}

// ---------- Add a song, as a sheet (R1, R9, R35, R63, R64) ----------

// The add form on its own screen above the scope. `title` fills the Title
// field (from a search that found nothing, R48) and the focus goes to Artist.
// `done(extra)` draws the screen below once the song is added; `open(id)`
// shows a song already in the library (R9's Open it) in place of the form.
// Cancel and the back gesture return to the screen below as it was.
export async function renderAddSong({ title = '', done, open }) {
  const ticket = screenTicket();
  const songs = await db.getAll('songs');
  if (!screenStillShowing(ticket)) return;

  const errorBox = el('p', { class: 'error', role: 'alert', hidden: '' });
  const suggestionList = el('ul', { class: 'suggestions', 'aria-label': 'Suggestions from MusicBrainz', hidden: '' });
  const duplicateText = el('p', { role: 'status' });
  const duplicateBox = el('div', { class: 'duplicate', hidden: '' },
    duplicateText,
    el('button', { type: 'button', class: 'btn', text: 'Open it', onclick: openDuplicate }));
  const submitButton = el('button', { class: 'btn primary', type: 'submit', text: 'Add song' });
  // Genres MusicBrainz knows for the artist, offered as one-tap chips (R63).
  // (Its labels avoid the word "genre", so the Genre field's label stays unique.)
  const genreChips = el('div', { class: 'genre-chips', role: 'group', 'aria-label': 'From MusicBrainz', hidden: '' });
  const addStatus = el('select', { name: 'status' },
    ...[['', NO_STATUS_LABEL], ...SONG_STATUSES.map((s) => [s, STATUS_LABELS[s]])]
      .map(([value, text]) => el('option', { value, text })));
  const form = el('form', { class: 'stack add-form', 'aria-label': 'Add a song' },
    textField('Title', { name: 'title', required: '' }),
    suggestionList,
    textField('Artist', { name: 'artist', required: '' }),
    el('div', { class: 'row' }, textField('Genre', { name: 'genre' }), yearField()),
    genreChips,
    el('label', { text: 'Status' }, addStatus), // not set by default (R64)
    errorBox,
    duplicateBox,
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => closeScreen() }),
      submitButton));
  const titleInput = form.elements.namedItem('title');
  const artistInput = form.elements.namedItem('artist');
  const genreInput = form.elements.namedItem('genre');
  const yearInput = form.elements.namedItem('year');

  // R9: the first song in the library with the typed title and artist, ignoring case.
  const songsByKey = new Map();
  for (const s of songs) {
    if (!songsByKey.has(songKey(s))) songsByKey.set(songKey(s), s);
  }
  let duplicate = null;

  function checkDuplicate() {
    const typedTitle = titleInput.value.trim();
    const artist = artistInput.value.trim();
    duplicate = (typedTitle && artist && songsByKey.get(songKey({ title: typedTitle, artist }))) || null;
    const warning = duplicate ? `Already in your library: “${duplicate.title}” by ${duplicate.artist}.` : '';
    // Only a change is written, so a screen reader announces the warning once.
    if (duplicateText.textContent !== warning) duplicateText.textContent = warning;
    duplicateBox.hidden = !duplicate;
    submitButton.textContent = duplicate ? 'Add anyway' : 'Add song';
  }

  function openDuplicate() {
    if (!duplicate) return;
    const { id } = duplicate;
    suggester.cancel();
    closeScreen(() => open(id));
  }

  // R35: suggestions under the title; taking one fills title and artist, and
  // the year and genre MusicBrainz knows (R63). The list scrolls into view so
  // the keyboard does not hide it.
  function showSuggestions(suggestions) {
    if (!form.isConnected) return;
    suggestionList.replaceChildren(...suggestions.map((s) => el('li', {},
      el('button', {
        type: 'button', class: 'suggestion', 'aria-label': `Use ${s.title} by ${s.artist}`,
        onclick: () => useSuggestion(s),
      }, s.title, el('span', { class: 'by', text: ` — ${s.artist}` }),
      s.year ? el('span', { class: 'by', text: ` (${s.year})` }) : null))));
    suggestionList.hidden = suggestions.length === 0;
    if (suggestions.length) suggestionList.scrollIntoView({ block: 'nearest' });
  }

  function showGenreChips(genres) {
    genreChips.replaceChildren(...genres.map((g) => el('button', {
      type: 'button', class: 'btn chip', text: g, 'aria-label': `Use ${g}`,
      onclick: () => { genreInput.value = g; },
    })));
    genreChips.hidden = genres.length === 0;
  }

  const suggester = createSuggester(showSuggestions, () => form.isConnected);

  async function useSuggestion(s) {
    suggester.cancel();
    titleInput.value = s.title;
    artistInput.value = s.artist;
    if (!yearInput.value && s.year) yearInput.value = String(s.year); // earliest release (R63)
    showSuggestions([]);
    checkDuplicate();
    submitButton.focus({ preventScroll: true });
    const genres = await fetchArtistGenres(s.artistId);
    if (!form.isConnected || titleInput.value !== s.title) return; // moved on meanwhile
    if (!genreInput.value && genres.length) genreInput.value = genres[0];
    showGenreChips(genres);
  }

  titleInput.addEventListener('input', () => {
    suggester.update(titleInput.value, artistInput.value);
    if (!titleInput.value.trim()) showGenreChips([]);
    checkDuplicate();
  });
  artistInput.addEventListener('input', () => {
    suggester.update(titleInput.value, artistInput.value); // the artist narrows the search (R63)
    checkDuplicate();
  });

  let saving = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    suggester.cancel();
    showSuggestions([]);
    showGenreChips([]);
    const data = new FormData(form);
    const fields = {
      title: data.get('title'),
      artist: data.get('artist'),
      genre: data.get('genre'),
      year: data.get('year'),
      status: data.get('status'), // '' = not set (R64)
    };
    if (showErrors(form, errorBox, validateSong(fields))) return;
    saving = true;
    try {
      await db.add('songs', makeSong(fields));
    } catch (err) {
      saving = false;
      errorBox.hidden = false;
      errorBox.textContent = `Could not save the song: ${err.message}`;
      return;
    }
    closeScreen(() => done({ query: '' })); // the search clears so the new song shows; filters stay (R53)
  });

  viewEl.replaceChildren(el('div', { class: 'stack add-song' }, el('h2', { text: 'Add a song' }), form));
  viewEl.scrollTop = 0;

  // "Add “xyz”" under a search that found nothing: the title is filled in, ready for the artist (R48).
  if (title) {
    titleInput.value = title;
    suggester.update(titleInput.value, artistInput.value);
    checkDuplicate();
    artistInput.focus();
  } else {
    titleInput.focus();
  }
}
