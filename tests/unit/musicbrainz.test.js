import { describe, it, expect } from 'vitest';
import {
  SEARCH_URL, shouldSuggest, suggestionQuery, suggestionUrl, parseSuggestions,
} from '../../js/lib/musicbrainz.js';

// A recording as the MusicBrainz search answers it, trimmed to what matters.
function recording(title, ...credits) {
  return {
    id: `id-${title}`,
    score: 100,
    title,
    length: 219000,
    'artist-credit': credits.map((name) => ({
      name, joinphrase: '', artist: { id: `id-${name}`, name, 'sort-name': name },
    })),
    'first-release-date': '2007-04-30',
    releases: [{ id: 'r1', title: 'Some album', status: 'Official' }],
  };
}

describe('R35 shouldSuggest', () => {
  it('needs 3 or more characters after trimming', () => {
    expect(shouldSuggest('Val')).toBe(true);
    expect(shouldSuggest('Valerie')).toBe(true);
    expect(shouldSuggest('  abc  ')).toBe(true);
    expect(shouldSuggest('ab')).toBe(false);
    expect(shouldSuggest('  ab  ')).toBe(false);
    expect(shouldSuggest('a b')).toBe(true);
  });

  it('is false for nothing at all', () => {
    for (const title of ['', '   ', null, undefined]) expect(shouldSuggest(title)).toBe(false);
  });

  it('counts an emoji as one character', () => {
    expect(shouldSuggest('🎤🎤')).toBe(false);
    expect(shouldSuggest('🎤🎤🎤')).toBe(true);
  });
});

describe('R35 suggestionQuery', () => {
  it('searches the title as a phrase', () => {
    expect(suggestionQuery('Valerie')).toBe('recording:"Valerie"');
    expect(suggestionQuery('Valerie', '')).toBe('recording:"Valerie"');
    expect(suggestionQuery('Valerie', '   ')).toBe('recording:"Valerie"');
  });

  it('adds the artist when there is one, both trimmed', () => {
    expect(suggestionQuery('  Valerie ', ' Amy Winehouse  ')).toBe('recording:"Valerie" AND artist:"Amy Winehouse"');
  });

  it('escapes quotes and backslashes inside the values', () => {
    expect(suggestionQuery('Say "Hello"', 'The \\ Band')).toBe(
      'recording:"Say \\"Hello\\"" AND artist:"The \\\\ Band"',
    );
  });

  it('leaves other Lucene special characters as written inside the phrase', () => {
    const title = '(I Can\'t Get No) Satisfaction + more: [live] {1965} ^~*?!/&&||-';
    expect(suggestionQuery(title, 'AC/DC')).toBe(`recording:"${title}" AND artist:"AC/DC"`);
  });
});

describe('R35 suggestionUrl', () => {
  it('asks for 5 recordings as JSON with the query encoded', () => {
    const url = suggestionUrl('Valerie', 'Amy Winehouse');
    expect(url).toBe(
      'https://musicbrainz.org/ws/2/recording?fmt=json&limit=5&query='
        + 'recording%3A%22Valerie%22%20AND%20artist%3A%22Amy%20Winehouse%22',
    );
    expect(url.startsWith(`${SEARCH_URL}?`)).toBe(true);
  });

  it('encodes characters that would break the URL, and decodes back to the query', () => {
    const raw = suggestionUrl('Rock & Roll #9 ?100% "live"', 'Beyoncé');
    expect(raw.slice(raw.indexOf('&query=') + '&query='.length)).not.toMatch(/[ "#&?=é]/);

    const url = new URL(raw);
    expect(url.origin).toBe('https://musicbrainz.org');
    expect(url.pathname).toBe('/ws/2/recording');
    expect([...url.searchParams.keys()]).toEqual(['fmt', 'limit', 'query']);
    expect(url.searchParams.get('fmt')).toBe('json');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('query')).toBe(suggestionQuery('Rock & Roll #9 ?100% "live"', 'Beyoncé'));
  });
});

describe('R35 parseSuggestions', () => {
  it('reads title and the first credited artist, in order', () => {
    const json = {
      created: '2026-11-12T10:00:00.000Z',
      count: 2,
      offset: 0,
      recordings: [recording('Valerie', 'Amy Winehouse'), recording('Valerie', 'The Zutons')],
    };
    expect(parseSuggestions(json)).toEqual([
      { title: 'Valerie', artist: 'Amy Winehouse' },
      { title: 'Valerie', artist: 'The Zutons' },
    ]);
  });

  it('uses only the first of several credits', () => {
    const json = { recordings: [recording('Valerie', 'Mark Ronson', 'Amy Winehouse')] };
    json.recordings[0]['artist-credit'][0].joinphrase = ' feat. ';
    expect(parseSuggestions(json)).toEqual([{ title: 'Valerie', artist: 'Mark Ronson' }]);
  });

  it('falls back to the artist name when the credit has none, and trims both', () => {
    const json = {
      recordings: [{ title: '  Africa ', 'artist-credit': [{ artist: { name: ' Toto ' } }] }],
    };
    expect(parseSuggestions(json)).toEqual([{ title: 'Africa', artist: 'Toto' }]);
  });

  it('skips recordings with a missing title or artist', () => {
    const json = {
      recordings: [
        { 'artist-credit': [{ name: 'No Title' }] },
        { title: '', 'artist-credit': [{ name: 'Empty Title' }] },
        { title: 'No credit' },
        { title: 'Empty credits', 'artist-credit': [] },
        { title: 'Odd credit', 'artist-credit': [null] },
        { title: 'Blank name', 'artist-credit': [{ name: '  ' }] },
        null,
        'not a recording',
        recording('Dancing Queen', 'ABBA'),
      ],
    };
    expect(parseSuggestions(json)).toEqual([{ title: 'Dancing Queen', artist: 'ABBA' }]);
  });

  it('keeps one of each title and artist, ignoring case, the first one seen', () => {
    const json = {
      recordings: [
        recording('Valerie', 'Amy Winehouse'),
        recording('VALERIE', 'amy winehouse'),
        recording('Valerie ', ' Amy Winehouse'),
        recording('Valerie', 'Mark Ronson'),
      ],
    };
    expect(parseSuggestions(json)).toEqual([
      { title: 'Valerie', artist: 'Amy Winehouse' },
      { title: 'Valerie', artist: 'Mark Ronson' },
    ]);
  });

  it('returns at most 5, or the limit given, counting after duplicates are dropped', () => {
    const recordings = ['A', 'A', 'B', 'C', 'D', 'E', 'F', 'G'].map((t) => recording(`Song ${t}`, 'Band'));
    expect(parseSuggestions({ recordings }).map((s) => s.title)).toEqual(['Song A', 'Song B', 'Song C', 'Song D', 'Song E']);
    expect(parseSuggestions({ recordings }, 2).map((s) => s.title)).toEqual(['Song A', 'Song B']);
    expect(parseSuggestions({ recordings }, 0)).toEqual([]);
  });

  it('gives nothing for an answer without recordings', () => {
    for (const json of [null, undefined, '', 'text', 42, {}, { recordings: null }, { recordings: {} }, { error: 'Bad' }]) {
      expect(parseSuggestions(json)).toEqual([]);
    }
  });
});
