// Setlist logic for the Setlists tab (R39, R14, R15, R43, R16, R44). Pure: no
// DOM, no IndexedDB.
//
// A setlist is { id, name, venueId|null, songIds[] } (see js/db.js). venueId null
// is a general setlist (R39). songIds are in setlist order and never repeat
// within one setlist; a song may appear in any number of setlists (R15).
// Functions here never change their inputs; they return new objects.
import { plural, singStats } from './stats.js';
import { filterSongs, sortByTitle } from './search.js';
import { decadeOf, decadeLabel } from './find.js';

const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });

// Case-insensitive text order, with a fixed tie-break so the result is stable.
const compareText = (a, b) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);

// songIds in order with repeats dropped, so a stored setlist never lists a song twice.
function uniqueIds(ids) {
  return [...new Set(Array.isArray(ids) ? ids : [])];
}

// ---------- Names and venues (R14, R39) ----------

// Checks a new or changed setlist name: trimmed, not empty, and not the name of
// another setlist ignoring case. `exceptId` is the setlist being edited, so it
// can keep its name or change its case. Returns an error message, or ''.
export function setlistNameError(name, setlists, exceptId = null) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return 'Enter a setlist name.';
  const key = trimmed.toLowerCase();
  const clash = setlists.find((s) => s.id !== exceptId && String(s.name).trim().toLowerCase() === key);
  return clash ? `There is already a setlist called “${clash.name}”.` : '';
}

// Setlist list order: by name ignoring case, then by id so ties stay put.
export function sortSetlists(setlists) {
  return [...setlists].sort((a, b) => byName(a, b) || (a.id ?? 0) - (b.id ?? 0));
}

// The venue <select> value for a venueId: '' for General, else the id as text.
export function venueValue(venueId) {
  return venueId == null ? '' : String(venueId);
}

// Turns a venue <select> value back into a venueId: null for General ('').
// Venue ids are IndexedDB auto-increment numbers, so the result is a number.
export function venueIdFromValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const id = Number(text);
  return Number.isFinite(id) ? id : null;
}

// Options for the venue <select>: General first, then every venue by name.
// When `currentVenueId` points to a venue that no longer exists, it is kept as
// an "Unknown venue" option, so saving a rename does not quietly change it.
export function venueOptions(venues, currentVenueId = null) {
  const options = [{ value: '', label: 'General' }];
  for (const venue of [...venues].sort(byName)) options.push({ value: venueValue(venue.id), label: venue.name });
  if (currentVenueId != null && !venues.some((v) => v.id === currentVenueId)) {
    options.push({ value: venueValue(currentVenueId), label: 'Unknown venue' });
  }
  return options;
}

// "General" for a general setlist, else its venue's name ("Unknown venue" when
// the venue is gone, which only a hand-edited backup could cause).
export function venueLabel(setlist, venues) {
  if (setlist.venueId == null) return 'General';
  const venue = venues.find((v) => v.id === setlist.venueId);
  return venue ? venue.name : 'Unknown venue';
}

// The line under a setlist's heading: "General setlist" or "At The Crown".
export function venueLine(setlist, venues) {
  if (setlist.venueId == null) return 'General setlist';
  const venue = venues.find((v) => v.id === setlist.venueId);
  return venue ? `At ${venue.name}` : 'At a venue that no longer exists';
}

// A new setlist record, ready for db.add() (which assigns the id).
export function makeSetlist(name, venueId = null) {
  return { name: String(name ?? '').trim(), venueId: venueId ?? null, songIds: [] };
}

// A setlist with a new name and venue (R14, R39); id and songs are kept.
export function updateSetlist(setlist, name, venueId = null) {
  return { ...setlist, name: String(name ?? '').trim(), venueId: venueId ?? null, songIds: uniqueIds(setlist.songIds) };
}

// The delete confirmation (R14), saying how many songs the setlist holds.
export function describeSetlistDelete(setlist) {
  const count = uniqueIds(setlist.songIds).length;
  const songs = count
    ? `It has ${plural(count, 'song', 'songs')}. Your song library is not changed.`
    : 'It has no songs.';
  return `Delete the setlist “${String(setlist.name).trim()}”? ${songs}`;
}

// ---------- Songs in a setlist (R15) ----------

// Adds a song to the end of the setlist. A song already in it stays where it is.
export function addSongId(setlist, songId) {
  const songIds = uniqueIds(setlist.songIds);
  if (!songIds.includes(songId)) songIds.push(songId);
  return { ...setlist, songIds };
}

// Removes a song from the setlist; the rest keep their order.
export function removeSongId(setlist, songId) {
  return { ...setlist, songIds: uniqueIds(setlist.songIds).filter((id) => id !== songId) };
}

// The setlist's songs in setlist order. Ids of songs that no longer exist are
// skipped. `songsById` is a Map of id -> song (an array of songs works too).
export function setlistSongs(setlist, songsById) {
  const byId = songsById instanceof Map ? songsById : new Map(songsById.map((s) => [s.id, s]));
  return uniqueIds(setlist.songIds).filter((id) => byId.has(id)).map((id) => byId.get(id));
}

// Songs that can be added: matching the query, not already in the setlist, by
// title. Returns { shown, total }: at most `limit` songs, and how many matched.
export function pickableSongs(songs, setlist, query = '', limit = 20) {
  const inList = new Set(setlist.songIds || []);
  const matches = sortByTitle(filterSongs(songs, query)).filter((song) => !inList.has(song.id));
  return { shown: matches.slice(0, limit), total: matches.length };
}

// ---------- Order (R16) ----------

// The ids in the order the list shows them: every id, or with `songsById` only
// the songs that still exist, as setlistSongs() lists them.
function shownIds(setlist, songsById) {
  return songsById ? setlistSongs(setlist, songsById).map((s) => s.id) : uniqueIds(setlist.songIds);
}

const notANumber = (value) => typeof value !== 'number' || Number.isNaN(value);

// Moves a song to position `newIndex` (0 is first); the others keep their
// order. An index past either end moves it to that end. An unknown id or an
// index that is not a number leaves the order as it was. With `songsById` (a
// Map or an array of songs), positions count only songs that still exist, so
// they match the list on screen; ids of deleted songs keep their places.
export function moveSongId(setlist, songId, newIndex, songsById = null) {
  const songIds = uniqueIds(setlist.songIds);
  const shown = shownIds({ songIds }, songsById);
  const from = shown.indexOf(songId);
  if (from === -1 || notANumber(newIndex)) return { ...setlist, songIds };
  const to = Math.min(Math.max(Math.trunc(newIndex), 0), shown.length - 1);
  if (to === from) return { ...setlist, songIds };
  // Just before the song now at `to` when moving up, just after it when moving down.
  const rest = songIds.filter((id) => id !== songId);
  rest.splice(rest.indexOf(shown[to]) + (to > from ? 1 : 0), 0, songId);
  return { ...setlist, songIds: rest };
}

// Moves a song `delta` places: -1 is up one, 1 is down one. Stops at the ends,
// so moving the first song up or the last song down changes nothing.
// `songsById` works as in moveSongId().
export function moveSongIdBy(setlist, songId, delta, songsById = null) {
  const from = shownIds(setlist, songsById).indexOf(songId);
  if (from === -1 || notANumber(delta)) return { ...setlist, songIds: uniqueIds(setlist.songIds) };
  return moveSongId(setlist, songId, from + Math.trunc(delta), songsById);
}

// ---------- Mix by genre and decade (R44) ----------

export const NO_GENRE = 'No genre';
export const NO_YEAR = 'No year';

// Songs per genre as [{ label, count }]: most first, then by name. Genres match
// ignoring case and keep the first spelling seen. Songs without a genre are
// counted as "No genre", always last.
export function mixByGenre(songs) {
  const groups = new Map(); // lowercased genre -> { label, count }
  let none = 0;
  for (const song of Array.isArray(songs) ? songs : []) {
    const genre = String(song?.genre ?? '').trim();
    if (!genre) {
      none += 1;
      continue;
    }
    const group = groups.get(genre.toLowerCase());
    if (group) group.count += 1;
    else groups.set(genre.toLowerCase(), { label: genre, count: 1 });
  }
  const out = [...groups.values()].sort((a, b) => b.count - a.count || compareText(a.label, b.label));
  if (none) out.push({ label: NO_GENRE, count: none });
  return out;
}

// Songs per decade as [{ label: '1980s', count }], oldest first. Songs without
// a year are counted as "No year", always last.
export function mixByDecade(songs) {
  const counts = new Map(); // decade -> count
  let none = 0;
  for (const song of Array.isArray(songs) ? songs : []) {
    const decade = decadeOf(song?.year);
    if (decade === null) none += 1;
    else counts.set(decade, (counts.get(decade) || 0) + 1);
  }
  const out = [...counts].sort((a, b) => a[0] - b[0]).map(([decade, count]) => ({ label: decadeLabel(decade), count }));
  if (none) out.push({ label: NO_YEAR, count: none });
  return out;
}

// 'Rock 4 · Soul 2' from mixByGenre() or mixByDecade(); '' for no items.
export function formatMix(items) {
  return (Array.isArray(items) ? items : []).map(({ label, count }) => `${label} ${count}`).join(' · ');
}

// ---------- Already sung at the venue (R43) ----------

// For a venue setlist: Map songId -> the last date ('YYYY-MM-DD') each of its
// songs was sung at that venue, for songs sung there at least once. General
// setlists have no venue, so they get an empty Map.
export function sungFlags(setlist, sings) {
  const out = new Map();
  if (setlist.venueId == null) return out;
  const stats = singStats(sings, setlist.venueId);
  for (const id of uniqueIds(setlist.songIds)) {
    if (stats.has(id)) out.set(id, stats.get(id).lastSung);
  }
  return out;
}
