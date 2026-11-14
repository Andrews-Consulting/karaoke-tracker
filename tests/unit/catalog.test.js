import { describe, it, expect } from 'vitest';
import {
  MIN_QUERY, CATALOG_SORT_MENU, CATALOG_DUET_OPTIONS, CATALOG_EXPLICIT_OPTIONS, defaultCatalogFilters,
  countCatalogFilters, catalogMayList, formatCount, prepareCatalog, catalogChoices, searchCatalog, catalogSearcher,
  rowStyles, songFromCatalog, libraryIndex, librarySongFor,
} from '../../js/lib/catalog.js';
import { matchesQuery, queryText, searchText } from '../../js/lib/search.js';
import { makeSong, songKey } from '../../js/lib/song.js';

// A catalog row as the catalog store holds it.
function row(id, title, artist, fields = {}) {
  const r = {
    id, title, artist, year: null, duet: false, explicit: false, added: '2020-01-01',
    styles: [], languages: ['English'], ...fields,
  };
  return { ...r, key: songKey(r) };
}

const ROWS = [
  row(1, 'Bohemian Rhapsody', 'Queen', { year: 1975, styles: ['Rock', 'Classic Rock'], added: '2012-05-01' }),
  row(2, 'Under Pressure', 'Queen & David Bowie', { year: 1981, duet: true, styles: ['Rock', 'Duet'], added: '2014-02-01' }),
  row(3, 'Islands in the Stream', 'Dolly Parton & Kenny Rogers', { year: 1983, duet: true, styles: ['Duet', 'Country'], added: '2019-09-09' }),
  row(4, 'Despacito', 'Luis Fonsi', { year: 2017, styles: ['Latin', 'pop'], languages: ['Spanish'], added: '2017-03-01' }),
  row(5, 'La Bamba', 'Ritchie Valens', { year: 1958, styles: ['Latin', 'Rock'], languages: ['Spanish'], added: '' }),
  row(6, 'Lose Yourself', 'Eminem', { year: 2002, explicit: true, styles: ['Hip Hop'], added: '2021-07-07' }),
  row(7, 'Été indien', 'Joe Dassin', { year: 1975, styles: ['Chanson'], languages: ['French'], added: '2016-01-01' }),
  row(8, 'Africa', 'Toto', { year: 1982, styles: ['Rock', 'Pop'], added: '2015-06-01' }),
  row(9, 'Untitled', '', { year: null, styles: [], languages: [] }),
  row(10, 'Dancing Queen', 'ABBA', { year: 1976, styles: ['Pop', 'Disco'], added: '2013-01-01' }),
];

const titles = (rows) => rows.map((r) => r.title);
const filters = (changes) => ({ ...defaultCatalogFilters(), ...changes });

describe('R67 catalog filters', () => {
  it('start with nothing on and title order', () => {
    expect(defaultCatalogFilters()).toEqual({ genre: '', decade: null, duet: 'any', explicit: 'any', language: '', sort: 'title' });
    expect(CATALOG_SORT_MENU.map(([value]) => value)).toEqual(['title', 'artist', 'decade', 'decade-desc', 'added']);
    expect(CATALOG_DUET_OPTIONS.map(([value]) => value)).toEqual(['any', 'only', 'none']);
    expect(CATALOG_EXPLICIT_OPTIONS.map(([value]) => value)).toEqual(['any', 'hide']);
  });

  it('count each filter that narrows the list, but not the sort', () => {
    expect(countCatalogFilters()).toBe(0);
    expect(countCatalogFilters(filters({ sort: 'added' }))).toBe(0);
    expect(countCatalogFilters(filters({ genre: 'Rock', decade: 1980, duet: 'only', explicit: 'hide', language: 'English' }))).toBe(5);
    expect(countCatalogFilters(filters({ duet: 'none' }))).toBe(1);
    expect(countCatalogFilters(filters({ genre: '  ', decade: '', duet: 'odd', explicit: 'show', language: ' ' }))).toBe(0);
  });

  it('list nothing until two characters or a filter', () => {
    expect(MIN_QUERY).toBe(2);
    expect(catalogMayList(defaultCatalogFilters(), '')).toBe(false);
    expect(catalogMayList(defaultCatalogFilters(), 'q')).toBe(false);
    expect(catalogMayList(defaultCatalogFilters(), ' q  ')).toBe(false);
    expect(catalogMayList(defaultCatalogFilters(), 'qu')).toBe(true);
    expect(catalogMayList(filters({ sort: 'artist' }), '')).toBe(false);
    expect(catalogMayList(filters({ explicit: 'hide' }), '')).toBe(true);
    expect(catalogMayList(filters({ decade: 1970 }), 'q')).toBe(true);
  });

  it('format counts with thousands separators', () => {
    expect(formatCount(7)).toBe('7');
    expect(formatCount(98765)).toBe('98,765');
  });
});

describe('R67 prepareCatalog', () => {
  const prepared = prepareCatalog(ROWS);

  it('orders the rows by title then artist, ignoring case and accents', () => {
    expect(titles(prepared.rows)).toEqual([
      'Africa', 'Bohemian Rhapsody', 'Dancing Queen', 'Despacito', 'Été indien', 'Islands in the Stream',
      'La Bamba', 'Lose Yourself', 'Under Pressure', 'Untitled']);
    expect(prepared.size).toBe(ROWS.length);
    expect(prepared.texts[0]).toBe(searchText(prepared.rows[0]));
    const twins = prepareCatalog([row(1, 'hello', 'Lionel Richie'), row(2, 'Hello', 'Adele'), row(3, 'Hello World', 'X')]);
    expect(twins.rows.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it('offers each style as a genre once, without Duet, and each language and decade', () => {
    // "pop" and "Pop" are one genre; the first spelling in title order wins (Africa's).
    expect(prepared.genres).toEqual(['Chanson', 'Classic Rock', 'Country', 'Disco', 'Hip Hop', 'Latin', 'Pop', 'Rock']);
    expect(prepared.languages).toEqual(['English', 'French', 'Spanish']);
    expect(prepared.decades).toEqual([1950, 1970, 1980, 2000, 2010]);
  });

  it('keeps the current selection among the choices', () => {
    const choices = catalogChoices(prepared, filters({ genre: 'Polka', language: 'Welsh', decade: 1990 }));
    expect(choices.genres).toContain('Polka');
    expect(choices.languages).toEqual(['English', 'French', 'Spanish', 'Welsh']);
    expect(choices.decades).toEqual([1950, 1970, 1980, 1990, 2000, 2010]);
    expect(catalogChoices({ genres: [], languages: [], decades: [] }, defaultCatalogFilters()))
      .toEqual({ genres: [], languages: [], decades: [] });
  });

  it('copes with an empty catalog', () => {
    const empty = prepareCatalog([]);
    expect(empty.size).toBe(0);
    expect(searchCatalog(empty, filters({ genre: 'Rock' }), 'qu')).toEqual([]);
  });
});

describe('R67 searchCatalog', () => {
  const prepared = prepareCatalog(ROWS);
  const find = (changes, query = '') => titles(searchCatalog(prepared, filters(changes), query));

  it('searches title and artist like my songs do', () => {
    expect(find({}, 'qu')).toEqual(['Bohemian Rhapsody', 'Dancing Queen', 'Under Pressure']);
    expect(find({}, '  QUEEN ')).toEqual(['Bohemian Rhapsody', 'Dancing Queen', 'Under Pressure']);
    expect(find({}, 'zz')).toEqual([]);
    for (const query of ['qu', 'ba', 'é', 'n & k', 'toto']) {
      expect(find({}, query)).toEqual(titles(prepared.rows.filter((r) => matchesQuery(r, query))));
    }
  });

  it('filters by genre and language ignoring case, and by decade', () => {
    expect(find({ genre: 'rock' })).toEqual(['Africa', 'Bohemian Rhapsody', 'La Bamba', 'Under Pressure']);
    expect(find({ genre: 'Pop' })).toEqual(['Africa', 'Dancing Queen', 'Despacito']);
    expect(find({ genre: 'Polka' })).toEqual([]);
    expect(find({ language: 'spanish' })).toEqual(['Despacito', 'La Bamba']);
    expect(find({ decade: 1970 })).toEqual(['Bohemian Rhapsody', 'Dancing Queen', 'Été indien']);
    expect(find({ decade: '1980' })).toEqual(['Africa', 'Islands in the Stream', 'Under Pressure']);
  });

  it('keeps duets only, or no duets, and hides explicit songs', () => {
    expect(find({ duet: 'only' })).toEqual(['Islands in the Stream', 'Under Pressure']);
    expect(find({ duet: 'none' })).not.toContain('Under Pressure');
    expect(find({ duet: 'none' })).toHaveLength(ROWS.length - 2);
    expect(find({ explicit: 'hide' })).not.toContain('Lose Yourself');
    expect(find({ explicit: 'hide' })).toHaveLength(ROWS.length - 1);
  });

  it('combines the filters with each other and the search', () => {
    expect(find({ genre: 'Rock', decade: 1980 })).toEqual(['Africa', 'Under Pressure']);
    expect(find({ genre: 'Rock', duet: 'only' }, 'bowie')).toEqual(['Under Pressure']);
    expect(find({ language: 'Spanish' }, 'z')).toEqual([]);
  });

  it('sorts by artist, decade either way and date added, ties in title order', () => {
    expect(find({ genre: 'Rock', sort: 'artist' })).toEqual(['Bohemian Rhapsody', 'Under Pressure', 'La Bamba', 'Africa']);
    expect(find({ duet: 'any', sort: 'artist' }).at(-1)).toBe('Untitled'); // no artist last
    expect(find({ explicit: 'hide', sort: 'decade' })).toEqual([
      'La Bamba', 'Bohemian Rhapsody', 'Dancing Queen', 'Été indien', 'Africa', 'Islands in the Stream',
      'Under Pressure', 'Despacito', 'Untitled']);
    expect(find({ explicit: 'hide', sort: 'decade-desc' })).toEqual([
      'Despacito', 'Africa', 'Islands in the Stream', 'Under Pressure', 'Bohemian Rhapsody', 'Dancing Queen',
      'Été indien', 'La Bamba', 'Untitled']);
    expect(find({ genre: 'Rock', sort: 'added' })).toEqual(['Africa', 'Under Pressure', 'Bohemian Rhapsody', 'La Bamba']);
    expect(find({ genre: 'Rock', sort: 'nonsense' })).toEqual(find({ genre: 'Rock' }));
  });

  it('never changes the prepared rows', () => {
    const before = titles(prepared.rows);
    find({ genre: 'Rock', sort: 'artist' });
    find({ sort: 'decade-desc' }, 'a');
    expect(titles(prepared.rows)).toEqual(before);
  });
});

describe('R67 catalogSearcher narrows as the search grows', () => {
  it('gives the same answers as searchCatalog, typing on, back and with new filters', () => {
    const prepared = prepareCatalog(ROWS);
    const search = catalogSearcher(prepared);
    const steps = [
      [{}, 'q'], [{}, 'qu'], [{}, 'que'], [{}, 'queen'], [{}, 'que'], [{}, 'a'], [{}, 'an'],
      [{ genre: 'Pop' }, 'an'], [{ genre: 'Pop', sort: 'decade' }, 'an'], [{ genre: 'Pop' }, 'dan'],
      [{ genre: 'Rock' }, 'dan'], [{}, ''], [{ duet: 'only' }, ''], [{ duet: 'only' }, 'kenny'],
    ];
    for (const [changes, query] of steps) {
      expect(titles(search(filters(changes), query))).toEqual(titles(searchCatalog(prepared, filters(changes), query)));
    }
  });

  it('splits the search like matchesQuery()', () => {
    expect(queryText('  QUeen ')).toBe('queen');
    expect(queryText(undefined)).toBe('');
    expect(searchText({ title: 'Valerie', artist: 'Amy Winehouse' })).toBe('valerie\u0000amy winehouse');
    expect(searchText({})).toBe('\u0000');
    // A query never spans the title and the artist.
    expect(searchText({ title: 'ab', artist: 'cd' }).includes(queryText('bc'))).toBe(false);
  });
});

describe('R67 a row and my songs', () => {
  it('shows every style but Duet when the Duet mark is there', () => {
    expect(rowStyles(ROWS[1])).toEqual(['Rock']);
    expect(rowStyles(ROWS[0])).toEqual(['Rock', 'Classic Rock']);
    expect(rowStyles(row(20, 'X', 'Y', { duet: false, styles: ['Duet', 'Pop', ' '] }))).toEqual(['Duet', 'Pop']);
    expect(rowStyles(row(21, 'X', 'Y', { styles: undefined }))).toEqual([]);
  });

  it('makes a song from a row: title, artist, year, first non-Duet style, catalog id and the duet tag', () => {
    expect(songFromCatalog(ROWS[2])).toEqual({
      title: 'Islands in the Stream', artist: 'Dolly Parton & Kenny Rogers', year: 1983, genre: 'Country',
      karafunId: 3, tags: ['duet'],
    });
    expect(songFromCatalog(ROWS[0])).toEqual({
      title: 'Bohemian Rhapsody', artist: 'Queen', year: 1975, genre: 'Rock', karafunId: 1, tags: [],
    });
    expect(songFromCatalog(ROWS[8]).genre).toBe('');
    expect(songFromCatalog(row(22, 'X', 'Y', { styles: ['Duet'] })).genre).toBe('');

    const song = makeSong(songFromCatalog(ROWS[2]), new Date('2026-11-14T10:00:00Z'));
    expect(song).toEqual({
      title: 'Islands in the Stream', artist: 'Dolly Parton & Kenny Rogers', genre: 'Country', year: 1983,
      key: '', notes: '', rating: null, status: '', tags: ['duet'], createdAt: '2026-11-14T10:00:00.000Z', karafunId: 3,
    });
  });

  it('finds the song in my songs by catalog id, else by title and artist ignoring case', () => {
    const songs = [
      { id: 11, ...makeSong({ title: 'BOHEMIAN RHAPSODY', artist: 'queen' }) },
      { id: 12, ...makeSong({ title: 'Something Else', artist: 'Someone', karafunId: 8 }) },
      { id: 13, ...makeSong({ title: 'Africa', artist: 'Toto' }) },
    ];
    const index = libraryIndex(songs);
    expect(librarySongFor(index, ROWS[0]).id).toBe(11);
    expect(librarySongFor(index, ROWS[7]).id).toBe(12); // the id wins over the title and artist
    expect(librarySongFor(index, ROWS[3])).toBeNull();
    const { key, ...noKey } = ROWS[0];
    expect(key).toBeTruthy();
    expect(librarySongFor(index, noKey).id).toBe(11);
    expect(librarySongFor(libraryIndex([]), ROWS[0])).toBeNull();
  });
});
