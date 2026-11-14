// Browsing the KaraFun catalog from Find (R67). Pure: no DOM, no IndexedDB,
// so Vitest can test it.
//
// Catalog rows are as stored in the `catalog` store (js/db.js):
//   { id, title, artist, year, duet, explicit, added, styles[], languages[], key }
// The real catalog has about 100,000 rows, so the view reads it once and
// prepareCatalog() does the per-row work once: the lower-cased search text,
// the title order and the menus' choices. A search then scans plain strings,
// and typing on narrows the previous result (catalogSearcher) instead of the
// whole catalog.
import { queryText, searchText } from './search.js';
import { decadeOf, distinctText, distinctDecades, newestFirst, compareFor } from './find.js';
import { songKey } from './song.js';

// A search lists nothing until it has this many characters, or a filter is on.
export const MIN_QUERY = 2;

// Sort orders as [value, label]; the first is the default.
export const CATALOG_SORT_MENU = [
  ['title', 'Title'],
  ['artist', 'Artist'],
  ['decade', 'Decade'],
  ['decade-desc', 'Decade, newest first'],
  ['added', 'Added to KaraFun, newest first'],
];

export const CATALOG_DUET_OPTIONS = [['any', 'Any'], ['only', 'Duets only'], ['none', 'No duets']];
export const CATALOG_EXPLICIT_OPTIONS = [['any', 'Any'], ['hide', 'Hide explicit']];

// KaraFun lists "Duet" among a song's styles; it is not a genre here, as the
// Duet filter and the duet tag cover it.
const DUET_STYLE = 'duet';

// No filters, title order. Empty strings and nulls mean "any".
//   genre, language: '' or a value (matched ignoring case)    decade: e.g. 1980, or null
//   duet: 'any' | 'only' | 'none'    explicit: 'any' | 'hide'    sort: a CATALOG_SORT_MENU value
export function defaultCatalogFilters() {
  return { genre: '', decade: null, duet: 'any', explicit: 'any', language: '', sort: 'title' };
}

const fold = (text) => String(text ?? '').trim().toLowerCase();
const listOf = (value) => (Array.isArray(value) ? value : []);

// How many filters narrow the list; the sort order does not count.
export function countCatalogFilters(filters = defaultCatalogFilters()) {
  const f = { ...defaultCatalogFilters(), ...filters };
  return [
    fold(f.genre) !== '',
    decadeOf(f.decade) !== null,
    f.duet === 'only' || f.duet === 'none',
    f.explicit === 'hide',
    fold(f.language) !== '',
  ].filter(Boolean).length;
}

// The list stays empty, with a hint, until the search has MIN_QUERY
// characters or a filter is on: 100,000 rows are no use unfiltered.
export function catalogMayList(filters, query) {
  return queryText(query).length >= MIN_QUERY || countCatalogFilters(filters) > 0;
}

// "1,234": counts run to six figures.
export function formatCount(n) {
  return Number(n).toLocaleString('en-US');
}

// ---------- Preparing the rows, once per load ----------

// A sort key from lower-case text: accents dropped where there are any, so
// "Été" sorts with the e's. Comparing these as plain strings gives the
// collator's order (titleOrder() in find.js) for almost every title, in a
// fraction of the time over 100,000 rows.
function sortKey(lowerText) {
  return /[^\x00-\x7f]/.test(lowerText) ? lowerText.normalize('NFD').replace(/[̀-ͯ]/g, '') : lowerText;
}

const byKey = (keys) => (a, b) => (keys[a] < keys[b] ? -1 : keys[a] > keys[b] ? 1 : a - b);

// Each spelling that folds to the same text, e.g. 'rock' -> Set {'Rock'}, so
// matching a row compares the strings it already has instead of folding them.
function spellings(rows, field) {
  const map = new Map();
  for (const row of rows) {
    for (const value of listOf(row[field])) {
      const key = fold(value);
      if (!key) continue;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(value);
    }
  }
  return map;
}

// Everything a search needs, worked out once:
//   rows: the rows in title order (then artist)    texts: each row's search text, in step
//   size: how many rows    genres, languages, decades: the menus' choices
export function prepareCatalog(rows = []) {
  // The search text is "title\0artist" in lower case, which is also the title
  // order's key (title, then artist), so the rows are lower-cased only once.
  const texts = rows.map(searchText);
  const order = rows.map((_, i) => i).sort(byKey(texts.map(sortKey)));
  const ordered = order.map((i) => rows[i]);
  const styleSpellings = spellings(ordered, 'styles');
  const languageSpellings = spellings(ordered, 'languages');
  const firstSpelling = (map) => [...map.values()].map((set) => set.values().next().value);
  return {
    rows: ordered,
    texts: order.map((i) => texts[i]),
    size: ordered.length,
    genres: distinctText(firstSpelling(styleSpellings).filter((style) => fold(style) !== DUET_STYLE)),
    languages: distinctText(firstSpelling(languageSpellings)),
    decades: distinctDecades(ordered.map((row) => row.year)),
    styleSpellings,
    languageSpellings,
    artistRank: null, // filled the first time the artist order is asked for
  };
}

// The menus' choices, plus the current selection even when the loaded
// catalog does not have it (e.g. after it was replaced), as filterChoices()
// does for my songs. The selection's spelling wins.
export function catalogChoices(prepared, filters = defaultCatalogFilters()) {
  return {
    genres: distinctText([filters.genre, ...prepared.genres]),
    languages: distinctText([filters.language, ...prepared.languages]),
    decades: distinctDecades([filters.decade, ...prepared.decades]),
  };
}

// ---------- Matching and sorting ----------

const NONE = new Set();

// The indexes (into prepared.rows) of the rows that match, in title order.
// `from` limits the scan to an earlier result that is known to hold every match.
function matchIndexes(prepared, filters, query, from = null) {
  const f = { ...defaultCatalogFilters(), ...filters };
  const { rows, texts } = prepared;
  const q = queryText(query);
  const genre = fold(f.genre) ? prepared.styleSpellings.get(fold(f.genre)) || NONE : null;
  const language = fold(f.language) ? prepared.languageSpellings.get(fold(f.language)) || NONE : null;
  const decade = decadeOf(f.decade);
  const hideExplicit = f.explicit === 'hide';
  const has = (values, wanted) => listOf(values).some((v) => wanted.has(v));

  const matches = (i) => {
    if (q && !texts[i].includes(q)) return false;
    const row = rows[i];
    if (f.duet === 'only' && !row.duet) return false;
    if (f.duet === 'none' && row.duet) return false;
    if (hideExplicit && row.explicit) return false;
    if (decade !== null && decadeOf(row.year) !== decade) return false;
    if (genre && !has(row.styles, genre)) return false;
    if (language && !has(row.languages, language)) return false;
    return true;
  };

  const out = [];
  if (from) {
    for (const i of from) if (matches(i)) out.push(i);
  } else {
    for (let i = 0; i < rows.length; i++) if (matches(i)) out.push(i);
  }
  return out;
}

// Each row's place in artist order (then title), worked out the first time.
function artistRanks(prepared) {
  if (!prepared.artistRank) {
    const keys = prepared.rows.map((row) => sortKey(fold(row.artist)));
    const inOrder = byKey(keys);
    const blankLast = (a, b) => (!keys[a] || !keys[b] ? !keys[a] - !keys[b] : 0);
    const order = keys.map((_, i) => i).sort((a, b) => blankLast(a, b) || inOrder(a, b));
    const rank = new Int32Array(keys.length);
    order.forEach((i, place) => { rank[i] = place; });
    prepared.artistRank = rank;
  }
  return prepared.artistRank;
}

// The matched rows in the chosen order. Ties stay in title order, as the
// indexes start in it and the sort is stable.
function sortedRows(prepared, indexes, sort) {
  const { rows } = prepared;
  let compare = null;
  if (sort === 'artist') {
    const rank = artistRanks(prepared);
    compare = (a, b) => rank[a] - rank[b];
  } else if (sort === 'decade' || sort === 'decade-desc') {
    const byDecade = compareFor(sort); // no year sorts last either way, as for my songs
    compare = (a, b) => byDecade(rows[a], rows[b]);
  } else if (sort === 'added') {
    compare = (a, b) => newestFirst(rows[a].added, rows[b].added);
  }
  return (compare ? [...indexes].sort(compare) : indexes).map((i) => rows[i]);
}

// The rows to show for the search and filters, sorted. Lists everything that
// matches; catalogMayList() decides whether to call it at all.
export function searchCatalog(prepared, filters = defaultCatalogFilters(), query = '') {
  const f = { ...defaultCatalogFilters(), ...filters };
  return sortedRows(prepared, matchIndexes(prepared, f, query), f.sort);
}

// searchCatalog() for one prepared catalog that remembers its last result:
// while the filters stay the same and the new search contains the last one
// (typing on), only the last result is scanned. Same answers, fewer rows.
export function catalogSearcher(prepared) {
  let last = null; // { q, narrowing, indexes }
  return (filters = defaultCatalogFilters(), query = '') => {
    const f = { ...defaultCatalogFilters(), ...filters };
    const q = queryText(query);
    const narrowing = JSON.stringify([fold(f.genre), decadeOf(f.decade), f.duet, f.explicit, fold(f.language)]);
    const from = last && last.narrowing === narrowing && q.includes(last.q) ? last.indexes : null;
    const indexes = matchIndexes(prepared, f, q, from);
    last = { q, narrowing, indexes };
    return sortedRows(prepared, indexes, f.sort);
  };
}

// ---------- A row and my songs ----------

// The styles a row shows: all of them, less "Duet" when the Duet mark says so.
export function rowStyles(row) {
  return listOf(row.styles).filter((style) => String(style).trim() && !(row.duet && fold(style) === DUET_STYLE));
}

// The fields for makeSong() when a catalog row is added to my songs (R67):
// title, artist and year as KaraFun has them, the first style that is not
// "Duet" as the genre, the catalog id (R68), and the duet tag for a duet.
export function songFromCatalog(row) {
  const genre = listOf(row.styles).map((s) => String(s).trim()).find((s) => s && fold(s) !== DUET_STYLE) || '';
  return {
    title: row.title,
    artist: row.artist,
    year: row.year,
    genre,
    karafunId: row.id,
    tags: row.duet ? ['duet'] : [],
  };
}

// My songs by catalog id and by songKey(), so a catalog row can say whether
// it is already in my songs. The first song wins either way.
export function libraryIndex(songs = []) {
  const byId = new Map();
  const byKey = new Map();
  for (const song of songs) {
    if (song.karafunId != null && !byId.has(song.karafunId)) byId.set(song.karafunId, song);
    const key = songKey(song);
    if (!byKey.has(key)) byKey.set(key, song);
  }
  return { byId, byKey };
}

// The song in my songs for a catalog row: the one carrying its id, else one
// with the same title and artist ignoring case; null when there is none.
export function librarySongFor(index, row) {
  return index.byId.get(row.id) || index.byKey.get(row.key || songKey(row)) || null;
}
