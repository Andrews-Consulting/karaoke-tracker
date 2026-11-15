// Search as you type (R10). Pure: no DOM, no IndexedDB, so Vitest can test it.
//
// A query matches anywhere in the title or the artist, ignoring case and
// leading spaces. A space typed at the END turns it into a whole-word search:
// "i " finds "I Sang Dixie" and not every title with an i in it, "love " finds
// "Love Will Tear Us Apart" and not "Glove". Letters and digits (any script)
// count as word characters; everything else is a boundary.

const WORD_CHAR = /[\p{L}\p{N}]/u;

// What a query asks for: its lower-cased text without surrounding spaces, and
// whether a trailing space asked for whole words. An empty query matches all.
export function queryMatcher(query) {
  const raw = query || '';
  const q = raw.trim().toLowerCase();
  return { q, whole: q.length > 0 && /\s$/.test(raw) };
}

// True when `text` (already lower case) has `q` as a whole word.
function includesWord(text, q) {
  let from = 0;
  for (;;) {
    const at = text.indexOf(q, from);
    if (at === -1) return false;
    const before = at === 0 ? '' : text[at - 1];
    const after = text[at + q.length] || '';
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
    from = at + 1;
  }
}

// True when lower-cased `text` satisfies the matcher.
export function textMatches(text, { q, whole }) {
  if (!q) return true;
  return whole ? includesWord(text, q) : text.includes(q);
}

// The song's searchable text, lower case: title, a separator no one can type,
// artist. A query never matches across the two.
export function searchText(song) {
  return `${(song.title || '').toLowerCase()}\u0000${(song.artist || '').toLowerCase()}`;
}

// The query's text alone, for callers that only need its length.
export function queryText(query) {
  return queryMatcher(query).q;
}

// True when the query matches the song's title or artist.
export function matchesQuery(song, query) {
  return textMatches(searchText(song), queryMatcher(query));
}

export function filterSongs(songs, query) {
  const matcher = queryMatcher(query);
  if (!matcher.q) return songs.slice();
  return songs.filter((song) => textMatches(searchText(song), matcher));
}

// Default list order: by title, then artist, case-insensitive.
export function sortByTitle(songs) {
  return [...songs].sort(
    (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) ||
      a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' })
  );
}
