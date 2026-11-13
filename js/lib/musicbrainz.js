// Title and artist suggestions from MusicBrainz (R35). Pure: builds the
// search URL and reads the answer; js/musicbrainz.js does the fetching.
// https://musicbrainz.org/doc/MusicBrainz_API/Search
import { songKey } from './song.js';

export const SEARCH_URL = 'https://musicbrainz.org/ws/2/recording';

// How many suggestions to ask for and show.
export const SUGGESTION_LIMIT = 5;

// The fewest characters of title, after trimming, worth looking up.
export const MIN_TITLE_LENGTH = 3;

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());

// A value inside a quoted Lucene phrase. Only the quote and the backslash
// mean anything there; every other character (AC/DC, (I Can't Get No), ...)
// is searched as written.
function quoted(value) {
  return `"${text(value).replace(/[\\"]/g, '\\$&')}"`;
}

// True when the title is long enough to look up: 3 or more characters after
// trimming, counting an emoji as one.
export function shouldSuggest(title) {
  return Array.from(text(title)).length >= MIN_TITLE_LENGTH;
}

// The Lucene query: the title as a phrase, and the artist when there is one.
//   recording:"Valerie" AND artist:"Amy Winehouse"
export function suggestionQuery(title, artist = '') {
  const query = `recording:${quoted(title)}`;
  return text(artist) ? `${query} AND artist:${quoted(artist)}` : query;
}

export function suggestionUrl(title, artist = '') {
  return `${SEARCH_URL}?fmt=json&limit=${SUGGESTION_LIMIT}&query=${encodeURIComponent(suggestionQuery(title, artist))}`;
}

// The first credited artist's name, as MusicBrainz credits it.
function firstArtist(recording) {
  const credits = recording['artist-credit'];
  const credit = Array.isArray(credits) ? credits[0] : null;
  if (!credit || typeof credit !== 'object') return '';
  return text(credit.name) || text(credit.artist && credit.artist.name);
}

// Reads a recording search answer into [{ title, artist }], in MusicBrainz's
// order: recordings without a title or an artist are skipped, the same title
// and artist (ignoring case) is kept once, and at most `limit` are returned.
export function parseSuggestions(json, limit = SUGGESTION_LIMIT) {
  const recordings = json && Array.isArray(json.recordings) ? json.recordings : [];
  const seen = new Set();
  const out = [];
  for (const recording of recordings) {
    if (out.length >= limit) break;
    if (!recording || typeof recording !== 'object') continue;
    const suggestion = { title: text(recording.title), artist: firstArtist(recording) };
    const key = songKey(suggestion);
    if (!suggestion.title || !suggestion.artist || seen.has(key)) continue;
    seen.add(key);
    out.push(suggestion);
  }
  return out;
}
