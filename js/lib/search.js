// Search as you type (R10). Pure: no DOM, no IndexedDB, so Vitest can test it.

// True when the query matches the song's title or artist, ignoring case and
// surrounding whitespace. An empty query matches everything.
export function matchesQuery(song, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  return (
    (song.title || '').toLowerCase().includes(q) ||
    (song.artist || '').toLowerCase().includes(q)
  );
}

export function filterSongs(songs, query) {
  return songs.filter((song) => matchesQuery(song, query));
}

// The same search split in two, for a list too big to lower-case on every
// keystroke (the KaraFun catalog, R67): searchText() once per song, queryText()
// once per search, then searchText(song).includes(queryText(query)) gives what
// matchesQuery(song, query) gives. The separator cannot be typed, so a query
// never matches across the title and the artist.
export function queryText(query) {
  return (query || '').trim().toLowerCase();
}

export function searchText(song) {
  return `${(song.title || '').toLowerCase()}\u0000${(song.artist || '').toLowerCase()}`;
}

// Default list order: by title, then artist, case-insensitive.
export function sortByTitle(songs) {
  return [...songs].sort(
    (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) ||
      a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' })
  );
}
