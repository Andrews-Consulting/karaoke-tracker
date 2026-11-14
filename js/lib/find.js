// Find on the Songs list (R37, R41, R11, R42, R12): filters and sort orders, on
// top of the R10 text search. Pure: no DOM, no IndexedDB, so Vitest can test it.
//
// Filters are a plain object; defaultFilters() lists every field. Sing stats
// come from singStats() in stats.js: Map songId -> { count, lastSung }, for the
// selected venue or overall. Dates are local 'YYYY-MM-DD' strings compared as
// strings, like everywhere else in the app.
import { filterSongs } from './search.js';
import { SONG_STATUSES, normalizeRating } from './song.js';
import { isISODate, plural } from './stats.js';

// The "Sung" filter (R41).
export const SUNG_ANY = 'any';
export const SUNG_NEVER = 'never';
export const SUNG_NOT_SINCE = 'not-since';

// Sort orders (R42) as [value, label]; the first is the default.
export const SORT_OPTIONS = [
  ['title', 'Title'],
  ['genre', 'Genre'],
  ['decade', 'Decade'],
  ['decade-desc', 'Decade, newest first'],
];

// Every sort order the "Sort by" menu offers, in menu order: R42's above plus
// R12's by artist, rating, last sung and date added. Title stays the default.
export const SORT_MENU = [
  ['title', 'Title'],
  ['artist', 'Artist'],
  ['rating', 'Rating, best first'],
  ['last-sung', 'Last sung, most recent first'],
  ['last-sung-oldest', 'Last sung, longest ago first'],
  ['added', 'Date added, newest first'],
  ...SORT_OPTIONS.slice(1),
];

// Minimum rating choices (R11) as [value, label], highest first.
export const MIN_RATING_OPTIONS = [[5, '5'], [4, '4+'], [3, '3+'], [2, '2+'], [1, '1+']];

// No filters, title order. Empty strings and nulls mean "any".
//   sung: SUNG_ANY | SUNG_NEVER | SUNG_NOT_SINCE    since: 'YYYY-MM-DD' or ''
//   tag, genre: '' or a value (matched ignoring case)    status: '' or a SONG_STATUSES value
//   minRating: 1-5 or null    decade: e.g. 1980, or null    sort: a SORT_OPTIONS value
export function defaultFilters() {
  return {
    sung: SUNG_ANY, since: '', tag: '', status: '', minRating: null, genre: '', decade: null, sort: 'title',
  };
}

const fold = (text) => String(text ?? '').trim().toLowerCase();

// Case-insensitive text order, with a fixed tie-break so the result is stable.
const compareText = (a, b) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);

// ---------- Decades (R42) ----------

// 1985 -> 1980. Null for a missing or non-whole year.
export function decadeOf(year) {
  if (typeof year !== 'number' && typeof year !== 'string') return null;
  if (typeof year === 'string' && !year.trim()) return null;
  const value = Number(year);
  return Number.isInteger(value) ? Math.floor(value / 10) * 10 : null;
}

// 1980 -> '1980s'; '' for no decade.
export function decadeLabel(decade) {
  const value = decadeOf(decade);
  return value === null ? '' : `${value}s`;
}

// ---------- Choices for the filter menus ----------

// Distinct non-empty values ignoring case (the first spelling seen wins),
// sorted ignoring case.
function distinctText(values) {
  const byKey = new Map();
  for (const raw of values) {
    const value = String(raw ?? '').trim();
    const key = value.toLowerCase();
    if (value && !byKey.has(key)) byKey.set(key, value);
  }
  return [...byKey.values()].sort(compareText);
}

function distinctDecades(values) {
  const decades = new Set(values.map(decadeOf).filter((d) => d !== null));
  return [...decades].sort((a, b) => a - b);
}

const tagsOf = (song) => (Array.isArray(song.tags) ? song.tags : []);

export function tagsInUse(songs) {
  return distinctText(songs.flatMap(tagsOf));
}

export function genresInUse(songs) {
  return distinctText(songs.map((s) => s.genre));
}

export function decadesInUse(songs) {
  return distinctDecades(songs.map((s) => s.year));
}

// The menus' choices: what is in use, plus the current selection even when no
// song uses it any more (e.g. its last song was just edited), so the menu
// always shows what the list is filtered by. The selection's spelling wins.
export function filterChoices(songs, filters = defaultFilters()) {
  return {
    tags: distinctText([filters.tag, ...songs.flatMap(tagsOf)]),
    genres: distinctText([filters.genre, ...songs.map((s) => s.genre)]),
    decades: distinctDecades([filters.decade, ...songs.map((s) => s.year)]),
  };
}

// The "Sung" menu's choices; the wording depends on whether a venue is picked.
export function sungOptions(atVenue) {
  return [
    [SUNG_ANY, 'Any'],
    [SUNG_NEVER, atVenue ? 'Never at this venue' : 'Never'],
    [SUNG_NOT_SINCE, 'Not since'],
  ];
}

// ---------- Matching (R41, R11, R42) ----------

// "Not since" without a valid date filters nothing, like "Any".
export function sungFilterActive(filters) {
  return filters.sung === SUNG_NEVER || (filters.sung === SUNG_NOT_SINCE && isISODate(filters.since));
}

// A song's status, '' when not set or unknown (R64). The Status filter's
// "Not set" choice is the value NO_STATUS_FILTER, since '' means "any" there.
const statusOf = (song) => (SONG_STATUSES.includes(song.status) ? song.status : '');
export const NO_STATUS_FILTER = 'none';
const statusFilterActive = (status) => SONG_STATUSES.includes(status) || status === NO_STATUS_FILTER;

// How many filters narrow the list; the sort order does not count.
export function countActiveFilters(filters = defaultFilters()) {
  const f = { ...defaultFilters(), ...filters };
  return [
    sungFilterActive(f),
    fold(f.tag) !== '',
    statusFilterActive(f.status),
    normalizeRating(f.minRating) !== null,
    fold(f.genre) !== '',
    decadeOf(f.decade) !== null,
  ].filter(Boolean).length;
}

// True when the song passes every filter. `stats` is the song's
// { count, lastSung } at the selected venue (or overall), or undefined when
// it has never been sung there.
export function matchesFilters(song, stats, filters = defaultFilters()) {
  const f = { ...defaultFilters(), ...filters };

  if (sungFilterActive(f) && stats && stats.count > 0) {
    // Sung there: "never" rules it out, "not since D" keeps it only when the
    // last sing there is strictly before D.
    if (f.sung === SUNG_NEVER || !(stats.lastSung < f.since)) return false;
  }

  const tag = fold(f.tag);
  if (tag && !tagsOf(song).some((t) => fold(t) === tag)) return false;

  if (f.status === NO_STATUS_FILTER ? statusOf(song) !== '' : SONG_STATUSES.includes(f.status) && statusOf(song) !== f.status) {
    return false;
  }

  const minRating = normalizeRating(f.minRating);
  if (minRating !== null) {
    const rating = normalizeRating(song.rating);
    if (rating === null || rating < minRating) return false;
  }

  const genre = fold(f.genre);
  if (genre && fold(song.genre) !== genre) return false;

  const decade = decadeOf(f.decade);
  if (decade !== null && decadeOf(song.year) !== decade) return false;

  return true;
}

// ---------- Sorting (R42, R12) ----------

// Missing values (null) sort last, whichever way the rest goes.
const missingLast = (a, b) => (a === null) - (b === null);

// The same order as localeCompare(b, undefined, { sensitivity: 'base' }), which
// is defined in terms of this collator, but built once rather than per call.
const baseCollator = new Intl.Collator(undefined, { sensitivity: 'base' });

// Text where blank sorts last, otherwise ignoring case.
function textBlankLast(ta, tb) {
  if (!ta || !tb) return !ta - !tb;
  return baseCollator.compare(ta, tb);
}

// A date-like string (a 'YYYY-MM-DD' sing date or an ISO createdAt), newest
// first, compared as strings; null and blanks are missing and sort last.
function newestFirst(a, b) {
  if (!a || !b) return !a - !b;
  return a < b ? 1 : a > b ? -1 : 0;
}

// The song's last sing at the selected venue (or overall), or null if never.
function lastSungOf(song, stats) {
  const entry = stats ? stats.get(song.id) : undefined;
  return entry && entry.count > 0 && entry.lastSung ? entry.lastSung : null;
}

// Each comparator gets two songs and the stats map; ties return 0 and are
// left in title order by the stable sort.
const COMPARE = {
  artist: (a, b) => textBlankLast(fold(a.artist), fold(b.artist)),
  rating: (a, b) => {
    const ra = normalizeRating(a.rating);
    const rb = normalizeRating(b.rating);
    return ra === null || rb === null ? missingLast(ra, rb) : rb - ra;
  },
  // Most recently sung first; never sung last.
  'last-sung': (a, b, stats) => newestFirst(lastSungOf(a, stats), lastSungOf(b, stats)),
  // Never sung first (the ones to pick), then the longest ago.
  'last-sung-oldest': (a, b, stats) => {
    const la = lastSungOf(a, stats);
    const lb = lastSungOf(b, stats);
    if (la === null || lb === null) return (lb === null) - (la === null);
    return la < lb ? -1 : la > lb ? 1 : 0;
  },
  added: (a, b) => newestFirst(
    typeof a.createdAt === 'string' ? a.createdAt : null,
    typeof b.createdAt === 'string' ? b.createdAt : null),
  genre: (a, b) => textBlankLast(fold(a.genre), fold(b.genre)),
  decade: (a, b) => {
    const da = decadeOf(a.year);
    const db = decadeOf(b.year);
    return da === null || db === null ? missingLast(da, db) : da - db;
  },
  'decade-desc': (a, b) => {
    const da = decadeOf(a.year);
    const db = decadeOf(b.year);
    return da === null || db === null ? missingLast(da, db) : db - da;
  },
};

// A copy in title order: the same order as sortByTitle() in search.js (title,
// then artist, ignoring case), but compared with one collator built up front.
// localeCompare() with options builds a new collator on every call, which
// adds up to tens of milliseconds over 1,000 songs (R34).
const compareTitles = (a, b) =>
  baseCollator.compare(a.title, b.title) || baseCollator.compare(a.artist, b.artist);

export function titleOrder(songs) {
  return [...songs].sort(compareTitles);
}

// A sorted copy. Title order is the default and breaks every tie, because
// the sort is stable and starts from title order. `stats` is singStats() for
// the selected venue or overall; only the last-sung orders read it, and
// without it every song counts as never sung.
export function sortSongs(songs, sortKey = 'title', stats = new Map()) {
  const byTitle = titleOrder(songs);
  const compare = Object.hasOwn(COMPARE, sortKey) ? COMPARE[sortKey] : null;
  return compare ? byTitle.sort((a, b) => compare(a, b, stats)) : byTitle;
}

// ---------- Together ----------

// The songs to show: the text search (R10), then the filters, then the sort.
// `statsBySong` is singStats() for the selected venue or overall; the sing
// filters and the last-sung sorts both use it.
export function applyFind(songs, statsBySong = new Map(), filters = defaultFilters(), query = '') {
  const f = { ...defaultFilters(), ...filters };
  const shown = filterSongs(songs, query)
    .filter((song) => matchesFilters(song, statsBySong ? statsBySong.get(song.id) : undefined, f));
  return sortSongs(shown, f.sort, statsBySong);
}

// A song row's sing line (R8, R37) in parts that each stay on one line:
// ['Sung 2 times', 'last 2026-10-15'], or ['Never sung here'] / ['Never sung'].
export function sungParts(stats, atVenue) {
  if (stats && stats.count > 0) return [`Sung ${plural(stats.count, 'time', 'times')}`, `last ${stats.lastSung}`];
  return [atVenue ? 'Never sung here' : 'Never sung'];
}
