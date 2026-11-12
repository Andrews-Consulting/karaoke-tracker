import { describe, it, expect } from 'vitest';
import {
  SUNG_ANY, SUNG_NEVER, SUNG_NOT_SINCE, SORT_OPTIONS, MIN_RATING_OPTIONS,
  defaultFilters, decadeOf, decadeLabel, tagsInUse, genresInUse, decadesInUse, filterChoices, sungOptions,
  countActiveFilters, matchesFilters, sortSongs, applyFind, sungParts,
} from '../../js/lib/find.js';
import { singStats } from '../../js/lib/stats.js';
import { SORT_MENU, SORTS_BY_SINGS } from '../../js/lib/find.js';

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

describe('R12 the "Sort by" menu', () => {
  it('offers title first, the R12 orders, then every R42 order', () => {
    expect(SORT_MENU).toEqual([
      ['title', 'Title'],
      ['artist', 'Artist'],
      ['rating', 'Rating, best first'],
      ['last-sung', 'Last sung, most recent first'],
      ['last-sung-oldest', 'Last sung, longest ago first'],
      ['added', 'Date added, newest first'],
      ['genre', 'Genre'],
      ['decade', 'Decade'],
      ['decade-desc', 'Decade, newest first'],
    ]);
    for (const option of SORT_OPTIONS) expect(SORT_MENU).toContainEqual(option);
    expect(defaultFilters().sort).toBe(SORT_MENU[0][0]);
  });

  it('marks only the last-sung orders as needing the sing stats', () => {
    expect(SORTS_BY_SINGS).toEqual(['last-sung', 'last-sung-oldest']);
  });

  it('does not count any sort order as a filter', () => {
    for (const [sort] of SORT_MENU) expect(countActiveFilters(filters({ sort }))).toBe(0);
  });

  it('handles an empty library for every order, with or without stats', () => {
    for (const [key] of SORT_MENU) {
      expect(sortSongs([], key)).toEqual([]);
      expect(sortSongs([], key, new Map())).toEqual([]);
      expect(sortSongs([], key, undefined)).toEqual([]);
    }
  });

  it('never changes its input', () => {
    const library = [song({ title: 'B', rating: 2 }), song({ title: 'A', rating: 5 })];
    const before = [...library];
    for (const [key] of SORT_MENU) sortSongs(library, key, new Map());
    expect(library).toEqual(before);
  });
});

describe('R12 sortSongs by artist', () => {
  it('sorts by artist ignoring case, then title, with no artist last', () => {
    const library = [
      song({ title: 'Valerie', artist: 'Amy Winehouse' }),
      song({ title: 'Take On Me', artist: 'a-ha' }),
      song({ title: 'Mystery', artist: '' }),
      song({ title: 'Africa', artist: 'Toto' }),
      song({ title: 'Back to Black', artist: 'amy winehouse' }),
      song({ title: 'Dancing Queen', artist: 'ABBA' }),
      song({ title: 'Anonymous', artist: '   ' }),
      song({ title: 'Lost', artist: undefined }),
    ];
    expect(titles(sortSongs(library, 'artist'))).toEqual(
      ['Take On Me', 'Dancing Queen', 'Back to Black', 'Valerie', 'Africa', 'Anonymous', 'Lost', 'Mystery']);
  });

  it('breaks ties by title, then by the title order\'s own tie-break', () => {
    const library = [
      song({ title: 'hello', artist: 'Adele', year: 2015 }),
      song({ title: 'Easy on Me', artist: 'ADELE' }),
      song({ title: 'Hello', artist: 'adele', year: 2016 }),
    ];
    const sorted = sortSongs(library, 'artist');
    expect(titles(sorted)).toEqual(['Easy on Me', 'hello', 'Hello']);
    // Same title and artist ignoring case: they keep their order from the input.
    expect(sorted.slice(1).map((s) => s.year)).toEqual([2015, 2016]);
  });
});

describe('R12 sortSongs by rating', () => {
  it('sorts 5 to 1, then title, with unrated (or invalid) last', () => {
    const library = [
      song({ title: 'Three', rating: 3 }),
      song({ title: 'Unrated', rating: null }),
      song({ title: 'Five b', rating: 5 }),
      song({ title: 'One', rating: 1 }),
      song({ title: 'Five a', rating: 5 }),
      song({ title: 'Broken', rating: 9 }),
      song({ title: 'Text four', rating: '4' }),
      song({ title: 'Absent', rating: undefined }),
    ];
    expect(titles(sortSongs(library, 'rating'))).toEqual(
      ['Five a', 'Five b', 'Text four', 'Three', 'One', 'Absent', 'Broken', 'Unrated']);
  });
});

describe('R12 sortSongs by last sung', () => {
  const CROWN = 1;
  const ANCHOR = 2;
  const valerie = song({ title: 'Valerie' });
  const queen = song({ title: 'Dancing Queen' });
  const africa = song({ title: 'Africa' });
  const rehab = song({ title: 'Rehab' });
  const toxic = song({ title: 'Toxic' });
  const library = [valerie, queen, africa, rehab, toxic];
  const sings = [
    { id: 1, songId: valerie.id, venueId: CROWN, date: '2026-10-01' },
    { id: 2, songId: valerie.id, venueId: ANCHOR, date: '2026-11-05' },
    { id: 3, songId: queen.id, venueId: CROWN, date: '2026-09-15' },
    { id: 4, songId: rehab.id, venueId: ANCHOR, date: '2026-10-01' },
    { id: 5, songId: toxic.id, venueId: CROWN, date: '2026-10-01' },
  ];

  it('most recent first, with never sung last and ties by title', () => {
    expect(titles(sortSongs(library, 'last-sung', singStats(sings)))).toEqual(
      ['Valerie', 'Rehab', 'Toxic', 'Dancing Queen', 'Africa']);
  });

  it('longest ago first, with never sung first and ties by title', () => {
    expect(titles(sortSongs(library, 'last-sung-oldest', singStats(sings)))).toEqual(
      ['Africa', 'Dancing Queen', 'Rehab', 'Toxic', 'Valerie']);
  });

  it('uses the stats for the selected venue', () => {
    const crown = singStats(sings, CROWN);
    expect(titles(sortSongs(library, 'last-sung', crown))).toEqual(
      ['Toxic', 'Valerie', 'Dancing Queen', 'Africa', 'Rehab']);
    expect(titles(sortSongs(library, 'last-sung-oldest', crown))).toEqual(
      ['Africa', 'Rehab', 'Dancing Queen', 'Toxic', 'Valerie']);
    const anchor = singStats(sings, ANCHOR);
    expect(titles(sortSongs(library, 'last-sung', anchor))).toEqual(
      ['Valerie', 'Rehab', 'Africa', 'Dancing Queen', 'Toxic']);
    expect(titles(sortSongs(library, 'last-sung-oldest', anchor))).toEqual(
      ['Africa', 'Dancing Queen', 'Toxic', 'Rehab', 'Valerie']);
  });

  it('treats a zero count or a missing date as never sung', () => {
    const stats = new Map([
      [valerie.id, { count: 0, lastSung: null }],
      [queen.id, { count: 1, lastSung: '2026-01-01' }],
      [rehab.id, { count: 2, lastSung: '' }],
    ]);
    expect(titles(sortSongs(library, 'last-sung', stats))).toEqual(
      ['Dancing Queen', 'Africa', 'Rehab', 'Toxic', 'Valerie']);
    expect(titles(sortSongs(library, 'last-sung-oldest', stats))).toEqual(
      ['Africa', 'Rehab', 'Toxic', 'Valerie', 'Dancing Queen']);
  });

  it('without stats, every song is never sung and the order is by title', () => {
    const byTitle = ['Africa', 'Dancing Queen', 'Rehab', 'Toxic', 'Valerie'];
    for (const key of ['last-sung', 'last-sung-oldest']) {
      expect(titles(sortSongs(library, key))).toEqual(byTitle);
      expect(titles(sortSongs(library, key, new Map()))).toEqual(byTitle);
      expect(titles(sortSongs(library, key, null))).toEqual(byTitle);
    }
  });
});

describe('R12 sortSongs by date added', () => {
  it('sorts newest first by the createdAt string, with missing last and ties by title', () => {
    const library = [
      song({ title: 'Old', createdAt: '2025-03-01T10:00:00.000Z' }),
      song({ title: 'Missing', createdAt: undefined }),
      song({ title: 'Newest', createdAt: '2026-11-01T09:30:00.000Z' }),
      song({ title: 'Same time b', createdAt: '2026-06-01T12:00:00.000Z' }),
      song({ title: 'Blank', createdAt: '' }),
      song({ title: 'Same time a', createdAt: '2026-06-01T12:00:00.000Z' }),
      song({ title: 'Not text', createdAt: 12345 }),
      song({ title: 'Same day, earlier', createdAt: '2026-06-01T08:00:00.000Z' }),
    ];
    expect(titles(sortSongs(library, 'added'))).toEqual(
      ['Newest', 'Same time a', 'Same time b', 'Same day, earlier', 'Old', 'Blank', 'Missing', 'Not text']);
  });
});

describe('R12 applyFind sorts with the stats it is given', () => {
  const CROWN = 1;
  const valerie = song({ title: 'Valerie', artist: 'Amy Winehouse', rating: 4, createdAt: '2026-01-02T00:00:00.000Z' });
  const queen = song({ title: 'Dancing Queen', artist: 'ABBA', rating: 5, createdAt: '2026-01-03T00:00:00.000Z' });
  const africa = song({ title: 'Africa', artist: 'Toto', rating: 4, createdAt: '2026-01-01T00:00:00.000Z' });
  const library = [valerie, queen, africa];
  const sings = [
    { id: 1, songId: valerie.id, venueId: CROWN, date: '2026-10-01' },
    { id: 2, songId: queen.id, venueId: 2, date: '2026-11-01' },
  ];

  it('passes the venue\'s stats to the last-sung sorts', () => {
    const recent = filters({ sort: 'last-sung' });
    expect(titles(applyFind(library, singStats(sings), recent))).toEqual(['Dancing Queen', 'Valerie', 'Africa']);
    expect(titles(applyFind(library, singStats(sings, CROWN), recent))).toEqual(['Valerie', 'Africa', 'Dancing Queen']);
    const oldest = filters({ sort: 'last-sung-oldest' });
    expect(titles(applyFind(library, singStats(sings, CROWN), oldest))).toEqual(['Africa', 'Dancing Queen', 'Valerie']);
    expect(titles(applyFind(library, undefined, oldest))).toEqual(['Africa', 'Dancing Queen', 'Valerie']);
  });

  it('combines the new orders with the search and the filters', () => {
    expect(titles(applyFind(library, singStats(sings), filters({ sort: 'artist' }))))
      .toEqual(['Dancing Queen', 'Valerie', 'Africa']);
    expect(titles(applyFind(library, singStats(sings), filters({ sort: 'rating', minRating: 4 }), 'a')))
      .toEqual(['Dancing Queen', 'Africa', 'Valerie']);
    expect(titles(applyFind(library, singStats(sings), filters({ sort: 'added', sung: SUNG_NEVER }))))
      .toEqual(['Africa']);
    expect(titles(applyFind(library, singStats(sings, CROWN), filters({ sort: 'added', sung: SUNG_NEVER }))))
      .toEqual(['Dancing Queen', 'Africa']);
  });
});
