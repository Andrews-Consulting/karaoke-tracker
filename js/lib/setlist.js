// Setlist logic for the Setlists tab (R56, R14, R15, R43, R16, R44, R45, R59, R17).
// Pure: no DOM, no IndexedDB.
//
// A setlist is { id, name, venueId|null, songIds[] } (see js/db.js). venueId is
// a label, not a binding (R56): "For The Crown", or null for any venue; any
// setlist can be opened at any venue. songIds are in setlist order and never
// repeat within one setlist; a song may appear in any number of setlists (R15).
// Functions here never change their inputs; they return new objects.
import { plural, singStats } from './stats.js';
import { decadeOf, decadeLabel } from './find.js';

const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });

// Case-insensitive text order, with a fixed tie-break so the result is stable.
const compareText = (a, b) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);

// songIds in order with repeats dropped, so a stored setlist never lists a song twice.
function uniqueIds(ids) {
  return [...new Set(Array.isArray(ids) ? ids : [])];
}

// ---------- Names and venue labels (R14, R56) ----------

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

// The "For venue" <select> value for a venueId: '' for any venue, else the id as text.
export function venueValue(venueId) {
  return venueId == null ? '' : String(venueId);
}

// Turns a "For venue" <select> value back into a venueId: null for any venue ('').
// Venue ids are IndexedDB auto-increment numbers, so the result is a number.
export function venueIdFromValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const id = Number(text);
  return Number.isFinite(id) ? id : null;
}

// Options for the "For venue (optional)" <select>: "Any venue" first, then
// every venue by name. When `currentVenueId` points to a venue that no longer
// exists, it is kept as an "Unknown venue" option, so saving a rename does not
// quietly change it.
export function venueOptions(venues, currentVenueId = null) {
  const options = [{ value: '', label: 'Any venue' }];
  for (const venue of [...venues].sort(byName)) options.push({ value: venueValue(venue.id), label: venue.name });
  if (currentVenueId != null && !venues.some((v) => v.id === currentVenueId)) {
    options.push({ value: venueValue(currentVenueId), label: 'Unknown venue' });
  }
  return options;
}

// A setlist's label (R56), in its row and under its heading: "Any venue", or
// "For The Crown" ("For an unknown venue" when the venue is gone, which only a
// hand-edited backup could cause, since deleting a venue clears its labels).
export function venueLabel(setlist, venues) {
  if (setlist.venueId == null) return 'Any venue';
  const venue = venues.find((v) => v.id === setlist.venueId);
  return venue ? `For ${venue.name}` : 'For an unknown venue';
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

// ---------- Merge into another setlist (R59) ----------

// Merging `source` into `target`: every song of the source not already in the
// target goes to the target's end, in the source's order, and the source is
// left empty. With `songsById` (a Map or an array of songs), ids of songs that
// no longer exist are dropped from the source and neither moved nor counted.
// Returns { target, source, moved, skipped }: the two setlists as they are to
// be saved, how many songs move and how many were already in the target.
// Merging a setlist into itself changes nothing.
export function mergePlan(source, target, songsById = null) {
  if (source.id != null && source.id === target.id) {
    const same = { ...target, songIds: uniqueIds(target.songIds) };
    return { target: same, source: same, moved: 0, skipped: 0 };
  }
  const songIds = uniqueIds(target.songIds);
  const there = new Set(songIds);
  const incoming = songsById ? setlistSongs(source, songsById).map((s) => s.id) : uniqueIds(source.songIds);
  let moved = 0;
  let skipped = 0;
  for (const id of incoming) {
    if (there.has(id)) skipped += 1;
    else {
      songIds.push(id);
      there.add(id);
      moved += 1;
    }
  }
  return { target: { ...target, songIds }, source: { ...source, songIds: [] }, moved, skipped };
}

// The confirmation before a merge (R59), from mergePlan()'s counts.
export function describeMerge(source, target, { moved, skipped }) {
  const from = `“${String(source.name).trim()}”`;
  const to = `“${String(target.name).trim()}”`;
  if (!moved) {
    return `${skipped === 1 ? 'The song' : `All ${skipped} songs`} in ${from} ${skipped === 1 ? 'is' : 'are'} already in ${to}. `
      + `Empty ${from}?`;
  }
  const already = skipped ? ` ${plural(skipped, 'song is', 'songs are')} already there.` : '';
  return `Move ${plural(moved, 'song', 'songs')} from ${from} to the end of ${to}?${already} ${from} will be left empty.`;
}

// The line on the target's screen after a merge (R59).
export function describeMerged(source, { moved, skipped }) {
  const from = `“${String(source.name).trim()}”`;
  const already = skipped ? ` ${plural(skipped, 'was', 'were')} already here.` : '';
  return `Moved ${plural(moved, 'song', 'songs')} from ${from}.${already}`;
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

// For a setlist labelled for a venue: Map songId -> the last date
// ('YYYY-MM-DD') each of its songs was sung at that venue, for songs sung there
// at least once. A setlist for any venue has no venue, so it gets an empty Map.
// (The Songs tab's List mode passes the setlist with the venue it is open at.)
export function sungFlags(setlist, sings) {
  const out = new Map();
  if (setlist.venueId == null) return out;
  const stats = singStats(sings, setlist.venueId);
  for (const id of uniqueIds(setlist.songIds)) {
    if (stats.has(id)) out.set(id, stats.get(id).lastSung);
  }
  return out;
}

// ---------- Suggest a set (R45) ----------

export const SUGGEST_MIN = 1;
export const SUGGEST_MAX = 50;
export const SUGGEST_DEFAULT = 10;

// The "How many" box's value as a whole number from SUGGEST_MIN to
// SUGGEST_MAX, or null when it is empty, not a whole number or out of range.
export function suggestCount(value) {
  const text = String(value ?? '').trim();
  const n = Number(text);
  return text && Number.isInteger(n) && n >= SUGGEST_MIN && n <= SUGGEST_MAX ? n : null;
}

// Interleaves lists: the first item of each, then the second of each, and so
// on; a list that runs out drops out. [[a1, a2, a3], [b1], [c1, c2]] gives
// [a1, b1, c1, a2, c2, a3].
export function roundRobin(groups) {
  const lists = (Array.isArray(groups) ? groups : []).filter((g) => Array.isArray(g) && g.length);
  const longest = Math.max(0, ...lists.map((g) => g.length));
  const out = [];
  for (let i = 0; i < longest; i += 1) {
    for (const list of lists) if (i < list.length) out.push(list[i]);
  }
  return out;
}

// A shuffled copy (Fisher-Yates). `random` returns a number in [0, 1), as Math.random does.
function shuffled(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Map key -> items with that key, keys in the order first seen.
function groupBy(items, keyOf) {
  const out = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

// Genre ignoring case and spaces; '' is the "No genre" group.
const genreKey = (song) => String(song?.genre ?? '').trim().toLowerCase();

// Songs a suggestion can choose from: not in the setlist already, not Retired,
// and never sung at its label venue (for a setlist for any venue, never sung anywhere).
export function suggestCandidates(songs, sings, setlist) {
  const inList = new Set(uniqueIds(setlist.songIds));
  const sung = singStats(Array.isArray(sings) ? sings : [], setlist.venueId ?? null);
  const seen = new Set();
  return (Array.isArray(songs) ? songs : []).filter((song) => {
    if (!song || song.status === 'retired') return false;
    if (inList.has(song.id) || sung.has(song.id) || seen.has(song.id)) return false;
    seen.add(song.id);
    return true;
  });
}

// Up to `n` songs to add to a setlist (R45), in the order to add them. Chosen
// from suggestCandidates() and spread across genres and decades: the songs are
// grouped by genre (ignoring case; no genre is a group of its own) and, within
// a genre, by decade (no year is a group too). The pick takes one song from
// each genre in turn, and each genre takes its songs from each of its decades
// in turn, so every genre comes up once before any comes up twice. The order
// of the genres, of the decades within a genre and of the songs within a
// decade is random; pass `random` (like Math.random) to make it repeatable.
export function suggestSongs(songs, sings, setlist, n, random = Math.random) {
  const count = Math.trunc(Number(n));
  if (!(count > 0)) return [];
  const byGenre = groupBy(suggestCandidates(songs, sings, setlist), genreKey);
  const perGenre = [...byGenre.values()].map((genreSongs) => {
    const byDecade = [...groupBy(genreSongs, (song) => decadeOf(song.year)).values()];
    return roundRobin(shuffled(byDecade, random).map((decadeSongs) => shuffled(decadeSongs, random)));
  });
  return roundRobin(shuffled(perGenre, random)).slice(0, count);
}

// The line shown after a suggestion: `added` songs were added of `asked`.
// `general` is true for a setlist for any venue, whose songs count as sung when
// sung anywhere.
export function describeSuggestion(added, asked, general = false) {
  const sung = general ? 'sung' : 'sung here';
  if (!added) return `Every song has been ${sung} already, or is in this setlist.`;
  if (added < asked) return `Added ${plural(added, 'song', 'songs')} (only ${added} never ${sung} ${added === 1 ? 'was' : 'were'} left).`;
  return `Added ${plural(added, 'song', 'songs')}.`;
}

// ---------- Tonight (R17) ----------

// The sing Tonight mode logs when a song is checked off: that song, at that
// venue, on `date` ('YYYY-MM-DD'). Ready for db.add('sings', ...).
export function tonightSing(songId, venueId, date) {
  return { songId, venueId, date };
}

// The sing unchecking removes: the song's sing at that venue on `date`, the
// most recently logged when there are several. null when there is none.
export function findTonightSing(sings, songId, venueId, date) {
  let found = null;
  for (const sing of Array.isArray(sings) ? sings : []) {
    if (sing.songId !== songId || sing.venueId !== venueId || sing.date !== date) continue;
    if (!found || (sing.id ?? 0) > (found.id ?? 0)) found = sing;
  }
  return found;
}

// Ids of the songs sung at a venue on `date`: those Tonight mode shows checked.
export function sungOn(sings, venueId, date) {
  const out = new Set();
  for (const sing of Array.isArray(sings) ? sings : []) {
    if (sing.venueId === venueId && sing.date === date) out.add(sing.songId);
  }
  return out;
}
