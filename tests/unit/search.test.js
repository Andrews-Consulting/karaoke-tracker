import { describe, it, expect } from 'vitest';
import { matchesQuery, filterSongs, sortByTitle } from '../../js/lib/search.js';

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
