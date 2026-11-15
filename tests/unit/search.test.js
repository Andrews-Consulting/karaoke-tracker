import { describe, it, expect } from 'vitest';
import { matchesQuery, filterSongs, sortByTitle, queryMatcher, textMatches } from '../../js/lib/search.js';

const songs = [
  { title: 'Dancing Queen', artist: 'ABBA' },
  { title: 'Mr. Brightside', artist: 'The Killers' },
  { title: 'Valerie', artist: 'Amy Winehouse' },
  { title: 'Back to Black', artist: 'Amy Winehouse' },
];

describe('R10 matchesQuery', () => {
  it('matches everything on an empty or whitespace query', () => {
    expect(matchesQuery(songs[0], '')).toBe(true);
    expect(matchesQuery(songs[0], '   ')).toBe(true);
    expect(matchesQuery(songs[0], undefined)).toBe(true);
  });

  it('matches title and artist, ignoring case and surrounding spaces', () => {
    expect(matchesQuery(songs[0], 'dancing')).toBe(true);
    expect(matchesQuery(songs[0], '  abba ')).toBe(true);
    expect(matchesQuery(songs[0], 'QUEEN')).toBe(true);
    expect(matchesQuery(songs[0], 'killers')).toBe(false);
  });

  it('matches partial words anywhere in the text', () => {
    expect(matchesQuery(songs[1], 'bright')).toBe(true);
    expect(matchesQuery(songs[1], 'r. b')).toBe(true);
  });

  it('copes with songs missing a title or artist', () => {
    expect(matchesQuery({ title: 'Only Title' }, 'only')).toBe(true);
    expect(matchesQuery({ artist: 'Only Artist' }, 'only')).toBe(true);
    expect(matchesQuery({}, 'x')).toBe(false);
  });

  it('a trailing space asks for whole words; a leading one is ignored', () => {
    const dixie = { title: 'I Sang Dixie', artist: 'Dwight Yoakam' };
    const fire = { title: 'Ring of Fire', artist: 'Johnny Cash' };
    const hi = { title: 'Hi There', artist: 'Someone' };
    expect(matchesQuery(dixie, 'i')).toBe(true);
    expect(matchesQuery(fire, 'i')).toBe(true);
    expect(matchesQuery(dixie, 'i ')).toBe(true);
    expect(matchesQuery(fire, 'i ')).toBe(false);
    expect(matchesQuery(hi, 'i ')).toBe(false); // "Hi" is not the word "I"
    expect(matchesQuery(dixie, ' i ')).toBe(true);
    expect(matchesQuery({ title: 'Love Will Tear Us Apart', artist: 'Joy Division' }, 'love ')).toBe(true);
    expect(matchesQuery({ title: 'Glove', artist: 'X' }, 'love ')).toBe(false);
    expect(matchesQuery({ title: 'Glove', artist: 'X' }, 'love')).toBe(true);
    // The word may end the title or the artist, and may be more than one word.
    expect(matchesQuery(fire, 'fire ')).toBe(true);
    expect(matchesQuery(fire, 'johnny cash ')).toBe(true);
    expect(matchesQuery(fire, 'of fire ')).toBe(true);
    expect(matchesQuery({ title: 'Café', artist: 'X' }, 'caf ')).toBe(false); // é is a letter
  });
});

describe('R10 queryMatcher and textMatches', () => {
  it('reads the text and the whole-word flag from the query', () => {
    expect(queryMatcher('  Val ')).toEqual({ q: 'val', whole: true });
    expect(queryMatcher('Val')).toEqual({ q: 'val', whole: false });
    expect(queryMatcher('   ')).toEqual({ q: '', whole: false });
    expect(queryMatcher(undefined)).toEqual({ q: '', whole: false });
  });

  it('matches lower-cased text the same way the song search does', () => {
    expect(textMatches('i sang dixie\u0000dwight yoakam', queryMatcher('i '))).toBe(true);
    expect(textMatches('ring of fire\u0000johnny cash', queryMatcher('i '))).toBe(false);
    expect(textMatches('anything', queryMatcher(''))).toBe(true);
  });
});

describe('R10 filterSongs', () => {
  it('returns all songs for an empty query and the matches otherwise', () => {
    expect(filterSongs(songs, '')).toHaveLength(4);
    expect(filterSongs(songs, 'amy').map((s) => s.title)).toEqual(['Valerie', 'Back to Black']);
    expect(filterSongs(songs, 'zzz')).toEqual([]);
    expect(filterSongs([], 'a')).toEqual([]);
  });
});

describe('sortByTitle', () => {
  it('sorts by title then artist, case-insensitively, without mutating the input', () => {
    const input = [
      { title: 'b song', artist: 'Z' },
      { title: 'A Song', artist: 'Y' },
      { title: 'B Song', artist: 'A' },
    ];
    const copy = [...input];
    const sorted = sortByTitle(input);
    expect(sorted.map((s) => `${s.title}/${s.artist}`)).toEqual(['A Song/Y', 'B Song/A', 'b song/Z']);
    expect(input).toEqual(copy);
  });
});
