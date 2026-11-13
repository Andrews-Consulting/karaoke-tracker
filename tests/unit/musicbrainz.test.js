import { describe, it, expect } from 'vitest';
import {
  SEARCH_URL, ARTIST_URL, shouldSuggest, suggestionQuery, suggestionUrl, artistUrl, parseSuggestions, parseGenres,
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

const dated = (title, artist, date) => ({ ...recording(title, artist), 'first-release-date': date });

describe('R35 shouldSuggest', () => {
  it('needs 3 or more characters after trimming', () => {
    expect(shouldSuggest('Val')).toBe(true);
    expect(shouldSuggest('  Val  ')).toBe(true);
    expect(shouldSuggest('Va')).toBe(false);
    expect(shouldSuggest(' V a ')).toBe(true);
    expect(shouldSuggest('   ')).toBe(false);
  });

  it('is false for nothing at all', () => {
    for (const bad of ['', null, undefined]) expect(shouldSuggest(bad)).toBe(false);
  });

  it('counts an emoji as one character', () => {
    expect(shouldSuggest('🎤🎤')).toBe(false);
    expect(shouldSuggest('🎤🎤🎤')).toBe(true);
  });
});

describe('R35, R63 suggestionQuery', () => {
  it('searches every word of the title, the last as a prefix', () => {
    expect(suggestionQuery('Valerie')).toBe('recording:(Valerie*)');
    expect(suggestionQuery('boogie sh')).toBe('recording:(boogie AND sh*)');
    expect(suggestionQuery('Valerie', '')).toBe('recording:(Valerie*)');
    expect(suggestionQuery('Valerie', '   ')).toBe('recording:(Valerie*)');
  });

  it('adds the artist the same way when there is one, both trimmed', () => {
    expect(suggestionQuery('  Valerie ', ' Amy  Winehouse  ')).toBe('recording:(Valerie*) AND artist:(Amy AND Winehouse*)');
  });

  it('escapes every character Lucene would read as syntax', () => {
    expect(suggestionQuery('Say "Hello"', 'The \\ Band')).toBe(
      'recording:(Say AND \\"Hello\\"*) AND artist:(The AND \\\\ AND Band*)',
    );
    expect(suggestionQuery('(I Can\'t Get No) Satisfaction', 'AC/DC'))
      .toBe('recording:(\\(I AND Can\'t AND Get AND No\\) AND Satisfaction*) AND artist:(AC\\/DC*)');
    expect(suggestionQuery('+ more: [live] {1965} ^~*?!/&&||-'))
      .toBe('recording:(\\+ AND more\\: AND \\[live\\] AND \\{1965\\} AND \\^\\~\\*\\?\\!\\/\\&\\&\\|\\|\\-*)');
  });
});

describe('R35, R63 suggestionUrl and artistUrl', () => {
  it('asks for 25 recordings as JSON with the query encoded', () => {
    const url = suggestionUrl('Valerie', 'Amy Winehouse');
    expect(url).toBe(
      'https://musicbrainz.org/ws/2/recording?fmt=json&limit=25&query='
        + 'recording%3A(Valerie*)%20AND%20artist%3A(Amy%20AND%20Winehouse*)',
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
    expect(url.searchParams.get('limit')).toBe('25');
    expect(url.searchParams.get('query')).toBe(suggestionQuery('Rock & Roll #9 ?100% "live"', 'Beyoncé'));
  });

  it('asks for an artist with its genres', () => {
    expect(artistUrl('76a5a114-ed6a-4eb6-8a81-ad5768d4b41c'))
      .toBe(`${ARTIST_URL}76a5a114-ed6a-4eb6-8a81-ad5768d4b41c?fmt=json&inc=genres`);
    expect(artistUrl(' odd/id ')).toBe(`${ARTIST_URL}odd%2Fid?fmt=json&inc=genres`);
  });
});

describe('R35, R63 parseSuggestions', () => {
  it('reads title, the first credited artist, its id and the release year, in order', () => {
    const json = {
      created: '2026-11-12T10:00:00.000Z',
      count: 2,
      offset: 0,
      recordings: [recording('Valerie', 'Amy Winehouse'), recording('Valerie', 'The Zutons')],
    };
    expect(parseSuggestions(json)).toEqual([
      { title: 'Valerie', artist: 'Amy Winehouse', artistId: 'id-Amy Winehouse', year: 2007 },
      { title: 'Valerie', artist: 'The Zutons', artistId: 'id-The Zutons', year: 2007 },
    ]);
  });

  it('uses only the first of several credits', () => {
    const json = { recordings: [recording('Valerie', 'Mark Ronson', 'Amy Winehouse')] };
    json.recordings[0]['artist-credit'][0].joinphrase = ' feat. ';
    expect(parseSuggestions(json)).toMatchObject([{ title: 'Valerie', artist: 'Mark Ronson', artistId: 'id-Mark Ronson' }]);
  });

  it('falls back to the artist name when the credit has none, trims both, and copes with no id or date', () => {
    const json = {
      recordings: [{ title: '  Africa ', 'artist-credit': [{ artist: { name: ' Toto ' } }] }],
    };
    expect(parseSuggestions(json)).toEqual([{ title: 'Africa', artist: 'Toto', artistId: '', year: null }]);
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
    expect(parseSuggestions(json)).toMatchObject([{ title: 'Dancing Queen', artist: 'ABBA' }]);
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
    expect(parseSuggestions(json).map((s) => [s.title, s.artist])).toEqual([
      ['Valerie', 'Amy Winehouse'],
      ['Valerie', 'Mark Ronson'],
    ]);
  });

  it('takes the earliest release year across the same song, ignoring junk dates (R63)', () => {
    const json = {
      recordings: [
        dated('Boogie Shoes', 'KC', '2006'),
        dated('Boogie Shoes', 'KC', '1975-05-01'),
        dated('boogie shoes', 'kc', '1998-10'),
        dated('Boogie Shoes', 'KC', ''),
        dated('Boogie Shoes', 'KC', '0000'),
        dated('Boogie Shoes', 'KC', 'unknown'),
      ],
    };
    expect(parseSuggestions(json)).toEqual([{ title: 'Boogie Shoes', artist: 'KC', artistId: 'id-KC', year: 1975 }]);
    expect(parseSuggestions({ recordings: [dated('X', 'Y', ''), dated('X', 'Y', 'n/a')] })[0].year).toBeNull();
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

describe('R63 parseGenres', () => {
  it('ranks by votes, keeps ties in order, drops blanks and repeats, at most 3', () => {
    const json = {
      name: 'KC and the Sunshine Band',
      genres: [
        { name: 'pop soul', count: 1 }, { name: 'disco', count: 3 }, { name: 'funk', count: 2 },
        { name: 'Disco', count: 1 }, { name: '  ', count: 9 }, { name: 'dance-pop', count: 1 },
      ],
    };
    expect(parseGenres(json)).toEqual(['disco', 'funk', 'pop soul']);
    expect(parseGenres(json, 5)).toEqual(['disco', 'funk', 'pop soul', 'dance-pop']);
    expect(parseGenres(json, 0)).toEqual([]);
  });

  it('gives nothing for an answer without genres', () => {
    for (const json of [null, undefined, {}, { genres: null }, { genres: 'rock' }, { error: 'Not Found' }]) {
      expect(parseGenres(json)).toEqual([]);
    }
  });
});
