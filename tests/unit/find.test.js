import { describe, it, expect } from 'vitest';
import {
  SUNG_ANY, SUNG_NEVER, SUNG_NOT_SINCE, SORT_OPTIONS, MIN_RATING_OPTIONS,
  defaultFilters, decadeOf, decadeLabel, tagsInUse, genresInUse, decadesInUse, filterChoices, sungOptions,
  countActiveFilters, matchesFilters, sortSongs, applyFind, sungParts,
} from '../../js/lib/find.js';
import { singStats } from '../../js/lib/stats.js';

// A complete song record, like makeSong() builds, with an id.
let nextId = 1;
function song(fields) {
  return {
    id: nextId++, title: '', artist: 'Someone', genre: '', year: null, key: '', notes: '',
    rating: null, status: 'go-to', tags: [], createdAt: '2026-01-01T00:00:00.000Z', ...fields,
  };
}

const titles = (songs) => songs.map((s) => s.title);
const filters = (changes) => ({ ...defaultFilters(), ...changes });

describe('R42 decadeOf and decadeLabel', () => {
  it('rounds a year down to its decade', () => {
    expect(decadeOf(1985)).toBe(1980);
    expect(decadeOf(1980)).toBe(1980);
    expect(decadeOf(1989)).toBe(1980);
    expect(decadeOf(2000)).toBe(2000);
    expect(decadeOf('1976')).toBe(1970);
  });

  it('gives null for a missing or invalid year', () => {
    for (const year of [null, undefined, '', '  ', 'abc', 1985.5, NaN, true, {}]) {
      expect(decadeOf(year)).toBeNull();
    }
  });

  it('labels a decade', () => {
    expect(decadeLabel(1980)).toBe('1980s');
    expect(decadeLabel(2000)).toBe('2000s');
    expect(decadeLabel(null)).toBe('');
  });
});

describe('R11 R42 choices for the filter menus', () => {
  const library = [
    song({ title: 'A', tags: ['duet', 'Slow'], genre: 'Soul', year: 2006 }),
    song({ title: 'B', tags: ['Duet', ' crowd-pleaser '], genre: ' soul ', year: 1985 }),
    song({ title: 'C', tags: [], genre: 'Pop', year: 1982 }),
    song({ title: 'D', genre: '', year: null }),
    song({ title: 'E', tags: undefined, genre: 'rock', year: 1976 }),
  ];

  it('lists each tag in use once, ignoring case, sorted ignoring case', () => {
    expect(tagsInUse(library)).toEqual(['crowd-pleaser', 'duet', 'Slow']);
  });

  it('lists each genre in use once, ignoring case and blanks, sorted', () => {
    expect(genresInUse(library)).toEqual(['Pop', 'rock', 'Soul']);
  });

  it('lists decades in use, oldest first, skipping songs without a year', () => {
    expect(decadesInUse(library)).toEqual([1970, 1980, 2000]);
  });

  it('is empty for an empty library', () => {
    expect(tagsInUse([])).toEqual([]);
    expect(genresInUse([])).toEqual([]);
    expect(decadesInUse([])).toEqual([]);
    expect(filterChoices([])).toEqual({ tags: [], genres: [], decades: [] });
  });

  it('keeps the current selection as a choice even when no song uses it', () => {
    const choices = filterChoices(library, filters({ tag: 'gone', genre: 'Jazz', decade: 1960 }));
    expect(choices.tags).toEqual(['crowd-pleaser', 'duet', 'gone', 'Slow']);
    expect(choices.genres).toEqual(['Jazz', 'Pop', 'rock', 'Soul']);
    expect(choices.decades).toEqual([1960, 1970, 1980, 2000]);
  });

  it('uses the selection\'s spelling for a choice that differs only in case', () => {
    const choices = filterChoices(library, filters({ tag: 'DUET', genre: 'SOUL' }));
    expect(choices.tags).toEqual(['crowd-pleaser', 'DUET', 'Slow']);
    expect(choices.genres).toEqual(['Pop', 'rock', 'SOUL']);
  });

  it('words the "Sung" choices for a venue or overall', () => {
    expect(sungOptions(true)).toEqual([[SUNG_ANY, 'Any'], [SUNG_NEVER, 'Never at this venue'], [SUNG_NOT_SINCE, 'Not since']]);
    expect(sungOptions(false)).toEqual([[SUNG_ANY, 'Any'], [SUNG_NEVER, 'Never'], [SUNG_NOT_SINCE, 'Not since']]);
  });

  it('offers minimum ratings from 5 down and four sort orders, title first', () => {
    expect(MIN_RATING_OPTIONS.map(([, label]) => label)).toEqual(['5', '4+', '3+', '2+', '1+']);
    expect(SORT_OPTIONS.map(([value]) => value)).toEqual(['title', 'genre', 'decade', 'decade-desc']);
  });
});

describe('countActiveFilters', () => {
  it('is 0 for the defaults and ignores the sort order', () => {
    expect(countActiveFilters(defaultFilters())).toBe(0);
    expect(countActiveFilters(filters({ sort: 'decade' }))).toBe(0);
    expect(countActiveFilters()).toBe(0);
  });

  it('counts each filter that narrows the list', () => {
    expect(countActiveFilters(filters({
      sung: SUNG_NEVER, tag: 'duet', status: 'go-to', minRating: 4, genre: 'Pop', decade: 1980,
    }))).toBe(6);
    expect(countActiveFilters(filters({ tag: 'duet', decade: 1980 }))).toBe(2);
  });

  it('does not count "not since" until it has a valid date', () => {
    expect(countActiveFilters(filters({ sung: SUNG_NOT_SINCE, since: '' }))).toBe(0);
    expect(countActiveFilters(filters({ sung: SUNG_NOT_SINCE, since: '2026-02-30' }))).toBe(0);
    expect(countActiveFilters(filters({ sung: SUNG_NOT_SINCE, since: '2026-10-01' }))).toBe(1);
  });

  it('does not count blank or unknown values', () => {
    expect(countActiveFilters(filters({ tag: '  ', genre: ' ', status: 'nope', minRating: 9, decade: '' }))).toBe(0);
  });
});

describe('R41 matchesFilters: never sung here, not since a date', () => {
  const s = song({ title: 'Valerie' });
  const sung = { count: 2, lastSung: '2026-10-01' };

  it('"never" keeps only songs with no sings at the venue', () => {
    expect(matchesFilters(s, undefined, filters({ sung: SUNG_NEVER }))).toBe(true);
    expect(matchesFilters(s, { count: 0, lastSung: null }, filters({ sung: SUNG_NEVER }))).toBe(true);
    expect(matchesFilters(s, sung, filters({ sung: SUNG_NEVER }))).toBe(false);
  });

  it('"not since D" keeps songs never sung there or last sung strictly before D', () => {
    const notSince = (since) => filters({ sung: SUNG_NOT_SINCE, since });
    expect(matchesFilters(s, undefined, notSince('2026-10-01'))).toBe(true);
    expect(matchesFilters(s, sung, notSince('2026-10-02'))).toBe(true);
    expect(matchesFilters(s, sung, notSince('2026-10-01'))).toBe(false); // same day: sung since
    expect(matchesFilters(s, sung, notSince('2026-09-30'))).toBe(false);
    expect(matchesFilters(s, sung, notSince('2027-01-01'))).toBe(true);
  });

  it('treats "not since" with no valid date as "any"', () => {
    expect(matchesFilters(s, sung, filters({ sung: SUNG_NOT_SINCE, since: '' }))).toBe(true);
    expect(matchesFilters(s, sung, filters({ sung: SUNG_NOT_SINCE, since: 'yesterday' }))).toBe(true);
  });

  it('"any" keeps every song', () => {
    expect(matchesFilters(s, sung, filters({ sung: SUNG_ANY }))).toBe(true);
    expect(matchesFilters(s, undefined)).toBe(true);
  });
});

describe('R11 matchesFilters: tag, status and rating', () => {
  const valerie = song({ title: 'Valerie', tags: ['Duet', 'slow'], status: 'want-to-try', rating: 4 });
  const bare = song({ title: 'Bare', tags: [], rating: null });

  it('matches a tag ignoring case and surrounding spaces', () => {
    expect(matchesFilters(valerie, undefined, filters({ tag: 'duet' }))).toBe(true);
    expect(matchesFilters(valerie, undefined, filters({ tag: ' SLOW ' }))).toBe(true);
    expect(matchesFilters(valerie, undefined, filters({ tag: 'duets' }))).toBe(false);
    expect(matchesFilters(bare, undefined, filters({ tag: 'duet' }))).toBe(false);
    expect(matchesFilters(song({ tags: undefined }), undefined, filters({ tag: 'duet' }))).toBe(false);
  });

  it('matches a status exactly; an unknown stored status reads as Go-to', () => {
    expect(matchesFilters(valerie, undefined, filters({ status: 'want-to-try' }))).toBe(true);
    expect(matchesFilters(valerie, undefined, filters({ status: 'go-to' }))).toBe(false);
    expect(matchesFilters(song({ status: 'odd' }), undefined, filters({ status: 'go-to' }))).toBe(true);
    expect(matchesFilters(valerie, undefined, filters({ status: 'nonsense' }))).toBe(true); // not a filter
  });

  it('matches a minimum rating; unrated songs only match "any rating"', () => {
    expect(matchesFilters(valerie, undefined, filters({ minRating: 4 }))).toBe(true);
    expect(matchesFilters(valerie, undefined, filters({ minRating: 3 }))).toBe(true);
    expect(matchesFilters(valerie, undefined, filters({ minRating: 5 }))).toBe(false);
    expect(matchesFilters(bare, undefined, filters({ minRating: 1 }))).toBe(false);
    expect(matchesFilters(bare, undefined, filters({ minRating: null }))).toBe(true);
    expect(matchesFilters(valerie, undefined, filters({ minRating: '4' }))).toBe(true);
  });

  it('needs every filter to pass', () => {
    const all = filters({ tag: 'duet', status: 'want-to-try', minRating: 4 });
    expect(matchesFilters(valerie, undefined, all)).toBe(true);
    expect(matchesFilters(valerie, undefined, { ...all, minRating: 5 })).toBe(false);
    expect(matchesFilters(valerie, { count: 1, lastSung: '2026-01-01' }, { ...all, sung: SUNG_NEVER })).toBe(false);
  });
});

describe('R42 matchesFilters: genre and decade', () => {
  const pop85 = song({ title: 'Take On Me', genre: 'Pop', year: 1985 });
  const noYear = song({ title: 'Mystery', genre: '', year: null });

  it('matches a genre ignoring case and surrounding spaces', () => {
    expect(matchesFilters(pop85, undefined, filters({ genre: 'pop' }))).toBe(true);
    expect(matchesFilters(song({ genre: ' POP ' }), undefined, filters({ genre: 'Pop' }))).toBe(true);
    expect(matchesFilters(pop85, undefined, filters({ genre: 'Pop rock' }))).toBe(false);
    expect(matchesFilters(noYear, undefined, filters({ genre: 'Pop' }))).toBe(false);
  });

  it('matches a decade and excludes songs without a year', () => {
    expect(matchesFilters(pop85, undefined, filters({ decade: 1980 }))).toBe(true);
    expect(matchesFilters(pop85, undefined, filters({ decade: '1980' }))).toBe(true);
    expect(matchesFilters(pop85, undefined, filters({ decade: 1990 }))).toBe(false);
    expect(matchesFilters(noYear, undefined, filters({ decade: 1980 }))).toBe(false);
    expect(matchesFilters(noYear, undefined, filters({ decade: null }))).toBe(true);
  });
});

describe('R42 sortSongs', () => {
  const library = [
    song({ title: 'Valerie', genre: 'Soul', year: 2006 }),
    song({ title: 'Rehab', genre: 'soul', year: 2006 }),
    song({ title: 'Mystery', genre: '', year: null }),
    song({ title: 'Africa', genre: 'Rock', year: 1982 }),
    song({ title: 'Take On Me', genre: 'Pop', year: 1985 }),
    song({ title: 'Dancing Queen', genre: 'Pop', year: 1976 }),
    song({ title: 'Anonymous', genre: '', year: null }),
  ];

  it('sorts by title by default and for an unknown key, without changing the input', () => {
    const before = titles(library);
    const expected = ['Africa', 'Anonymous', 'Dancing Queen', 'Mystery', 'Rehab', 'Take On Me', 'Valerie'];
    expect(titles(sortSongs(library))).toEqual(expected);
    expect(titles(sortSongs(library, 'title'))).toEqual(expected);
    expect(titles(sortSongs(library, 'nope'))).toEqual(expected);
    expect(titles(library)).toEqual(before);
  });

  it('sorts by genre ignoring case, then title, with no genre last', () => {
    expect(titles(sortSongs(library, 'genre'))).toEqual(
      ['Dancing Queen', 'Take On Me', 'Africa', 'Rehab', 'Valerie', 'Anonymous', 'Mystery']);
  });

  it('sorts by decade oldest first, then title, with no year last', () => {
    expect(titles(sortSongs(library, 'decade'))).toEqual(
      ['Dancing Queen', 'Africa', 'Take On Me', 'Rehab', 'Valerie', 'Anonymous', 'Mystery']);
  });

  it('sorts by decade newest first, then title, with no year still last', () => {
    expect(titles(sortSongs(library, 'decade-desc'))).toEqual(
      ['Rehab', 'Valerie', 'Africa', 'Take On Me', 'Dancing Queen', 'Anonymous', 'Mystery']);
  });

  it('breaks title ties by artist, as the title order does', () => {
    const twins = [song({ title: 'Hello', artist: 'Lionel Richie', year: 1983 }), song({ title: 'Hello', artist: 'Adele', year: 2015 })];
    expect(sortSongs(twins, 'genre').map((s) => s.artist)).toEqual(['Adele', 'Lionel Richie']);
    expect(sortSongs(twins, 'decade').map((s) => s.artist)).toEqual(['Lionel Richie', 'Adele']);
  });

  it('handles an empty library', () => {
    for (const [key] of SORT_OPTIONS) expect(sortSongs([], key)).toEqual([]);
  });
});

describe('R37 applyFind: search, venue stats, filters and sort together', () => {
  const CROWN = 1;
  const ANCHOR = 2;
  const valerie = song({ title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006, tags: ['duet'], rating: 5 });
  const rehab = song({ title: 'Rehab', artist: 'Amy Winehouse', genre: 'Soul', year: 2006, rating: 3 });
  const queen = song({ title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976, tags: ['Duet'] });
  const africa = song({ title: 'Africa', artist: 'Toto', genre: 'Rock', year: 1982, status: 'retired' });
  const library = [valerie, rehab, queen, africa];
  const sings = [
    { id: 1, songId: valerie.id, venueId: CROWN, date: '2026-10-01' },
    { id: 2, songId: valerie.id, venueId: ANCHOR, date: '2026-11-05' },
    { id: 3, songId: queen.id, venueId: CROWN, date: '2026-09-15' },
  ];

  it('shows everything in title order with no search or filters', () => {
    expect(titles(applyFind(library))).toEqual(['Africa', 'Dancing Queen', 'Rehab', 'Valerie']);
    expect(titles(applyFind(library, singStats(sings), defaultFilters(), ''))).toEqual(['Africa', 'Dancing Queen', 'Rehab', 'Valerie']);
    expect(applyFind([], new Map(), filters({ sung: SUNG_NEVER }), 'x')).toEqual([]);
  });

  it('uses the stats it is given: per venue or overall', () => {
    const never = filters({ sung: SUNG_NEVER });
    expect(titles(applyFind(library, singStats(sings, CROWN), never))).toEqual(['Africa', 'Rehab']);
    expect(titles(applyFind(library, singStats(sings, ANCHOR), never))).toEqual(['Africa', 'Dancing Queen', 'Rehab']);
    expect(titles(applyFind(library, singStats(sings), never))).toEqual(['Africa', 'Rehab']);

    const notSince = filters({ sung: SUNG_NOT_SINCE, since: '2026-10-01' });
    expect(titles(applyFind(library, singStats(sings, CROWN), notSince))).toEqual(['Africa', 'Dancing Queen', 'Rehab']);
    expect(titles(applyFind(library, singStats(sings), notSince))).toEqual(['Africa', 'Dancing Queen', 'Rehab']);
  });

  it('combines the text search with the filters and the sort', () => {
    expect(titles(applyFind(library, singStats(sings), filters({ tag: 'DUET' }), ''))).toEqual(['Dancing Queen', 'Valerie']);
    expect(titles(applyFind(library, singStats(sings), filters({ tag: 'duet' }), 'amy'))).toEqual(['Valerie']);
    expect(titles(applyFind(library, singStats(sings), filters({ genre: 'soul', minRating: 4 }), 'amy'))).toEqual(['Valerie']);
    expect(titles(applyFind(library, singStats(sings), filters({ status: 'go-to', sort: 'decade-desc' }), '')))
      .toEqual(['Rehab', 'Valerie', 'Dancing Queen']);
    expect(titles(applyFind(library, singStats(sings, CROWN), filters({ sung: SUNG_NEVER, decade: 1980 }), 'toto')))
      .toEqual(['Africa']);
  });

  it('works without a stats map', () => {
    expect(titles(applyFind(library, undefined, filters({ sung: SUNG_NEVER })))).toEqual(['Africa', 'Dancing Queen', 'Rehab', 'Valerie']);
  });
});

describe('R8 R37 sungParts', () => {
  it('shows times sung and the last date', () => {
    expect(sungParts({ count: 3, lastSung: '2026-11-05' }, true)).toEqual(['Sung 3 times', 'last 2026-11-05']);
    expect(sungParts({ count: 1, lastSung: '2026-10-15' }, false)).toEqual(['Sung 1 time', 'last 2026-10-15']);
  });

  it('says never sung, at the venue or at all', () => {
    expect(sungParts(undefined, true)).toEqual(['Never sung here']);
    expect(sungParts(undefined, false)).toEqual(['Never sung']);
    expect(sungParts({ count: 0, lastSung: null }, true)).toEqual(['Never sung here']);
  });
});
