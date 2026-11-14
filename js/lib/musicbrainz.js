// Title, artist, year and genre suggestions from MusicBrainz (R35, R63). Pure:
// builds the URLs and reads the answers; js/musicbrainz.js does the fetching.
// https://musicbrainz.org/doc/MusicBrainz_API/Search
import { songKey } from './song.js';

export const SEARCH_URL = 'https://musicbrainz.org/ws/2/recording';
export const ARTIST_URL = 'https://musicbrainz.org/ws/2/artist/';

// How many recordings to ask for: enough to see the same song on several
// releases, so the earliest release year is the song's year (R63).
export const SEARCH_LIMIT = 25;

// How many suggestions to show, and how many genres to offer.
export const SUGGESTION_LIMIT = 5;
export const GENRE_LIMIT = 3;

// The fewest characters of title, after trimming, worth looking up.
export const MIN_TITLE_LENGTH = 3;

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());

// A word as a Lucene term: every character Lucene would read as syntax is
// escaped, so AC/DC, (I Can't Get No) and "Heroes" are searched as written.
function term(word) {
  return word.replace(/([+\-!(){}[\]^"~*?:\\/&|])/g, '\\$1');
}

// `field:(w1 AND w2 AND last*)`: every word must appear, and the last one may
// be unfinished, so "boogie sh" already finds Boogie Shoes (R63).
function wordsQuery(field, value) {
  const words = text(value).split(/\s+/).filter(Boolean).map(term);
  if (!words.length) return '';
  words[words.length - 1] += '*';
  return `${field}:(${words.join(' AND ')})`;
}

// True when the title is long enough to look up: 3 or more characters after
// trimming, counting an emoji as one.
export function shouldSuggest(title) {
  return Array.from(text(title)).length >= MIN_TITLE_LENGTH;
}

// The Lucene query: the title's words, the last as a prefix, and the artist's
// the same way when there is one.
//   recording:(Valerie*) AND artist:(Amy AND Winehouse*)
export function suggestionQuery(title, artist = '') {
  const query = wordsQuery('recording', title);
  const byArtist = wordsQuery('artist', artist);
  return byArtist ? `${query} AND ${byArtist}` : query;
}

export function suggestionUrl(title, artist = '') {
  return `${SEARCH_URL}?fmt=json&limit=${SEARCH_LIMIT}&query=${encodeURIComponent(suggestionQuery(title, artist))}`;
}

// The artist's own record with its genres (R63), one request per tapped suggestion.
export function artistUrl(artistId) {
  return `${ARTIST_URL}${encodeURIComponent(text(artistId))}?fmt=json&inc=genres`;
}

// The first credited artist's name and id, as MusicBrainz credits it.
function firstArtist(recording) {
  const credits = recording['artist-credit'];
  const credit = Array.isArray(credits) ? credits[0] : null;
  if (!credit || typeof credit !== 'object') return { name: '', id: '' };
  const artist = credit.artist && typeof credit.artist === 'object' ? credit.artist : {};
  return { name: text(credit.name) || text(artist.name), id: text(artist.id) };
}

// A recording's release year from its first-release-date ('1975', '1975-05'
// or '1975-05-01'), or null; years outside 1900 to 2100 are treated as junk.
function releaseYear(recording) {
  const match = /^(\d{4})/.exec(text(recording['first-release-date']));
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1900 && year <= 2100 ? year : null;
}

// Reads a recording search answer into [{ title, artist, artistId, year }],
// in MusicBrainz's order: recordings without a title or an artist are skipped,
// the same title and artist (ignoring case) is kept once with the EARLIEST
// release year seen for it (compilations come later than the original, R63),
// and at most `limit` are returned.
export function parseSuggestions(json, limit = SUGGESTION_LIMIT) {
  const recordings = json && Array.isArray(json.recordings) ? json.recordings : [];
  const byKey = new Map();
  for (const recording of recordings) {
    if (!recording || typeof recording !== 'object') continue;
    const artist = firstArtist(recording);
    const suggestion = { title: text(recording.title), artist: artist.name, artistId: artist.id, year: releaseYear(recording) };
    if (!suggestion.title || !suggestion.artist) continue;
    const key = songKey(suggestion);
    const seen = byKey.get(key);
    if (!seen) byKey.set(key, suggestion);
    else {
      if (suggestion.year !== null && (seen.year === null || suggestion.year < seen.year)) seen.year = suggestion.year;
      if (!seen.artistId && suggestion.artistId) seen.artistId = suggestion.artistId;
    }
  }
  return [...byKey.values()].slice(0, limit);
}

// Reads an artist answer into its genre names, most votes first (ties keep
// MusicBrainz's order), blanks and repeats dropped, at most `limit` (R63).
export function parseGenres(json, limit = GENRE_LIMIT) {
  const genres = json && Array.isArray(json.genres) ? json.genres : [];
  const ranked = genres
    .map((g, i) => ({ name: text(g && g.name), count: Number(g && g.count) || 0, i }))
    .filter((g) => g.name)
    .sort((a, b) => b.count - a.count || a.i - b.i);
  const out = [];
  const seen = new Set();
  for (const { name } of ranked) {
    if (out.length >= limit) break;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}
