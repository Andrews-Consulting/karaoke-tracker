import { describe, it, expect } from 'vitest';
import { parseCsv, csvRows, planImport, importSummary, csvDate, CsvError } from '../../js/lib/csv.js';
import { makeSong } from '../../js/lib/song.js';
import { toCsvField, songsToCsv, csvFileName } from '../../js/lib/csv.js';
import { sortByTitle } from '../../js/lib/search.js';

const now = new Date('2026-11-11T12:00:00.000Z');
const plan = (text, existing = []) => planImport(parseCsv(text), existing, now);

describe('parseCsv (R22)', () => {
  it('returns no rows for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\n\r\n\n')).toEqual([]);
    expect(parseCsv(null)).toEqual([]);
  });

  it('splits simple rows and fields, with or without a final newline', () => {
    expect(parseCsv('a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a,b\nc,d\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('"Hello, Goodbye",The Beatles')).toEqual([['Hello, Goodbye', 'The Beatles']]);
  });

  it('turns doubled quotes into one quote', () => {
    expect(parseCsv('"""Heroes""",David Bowie\n"Say ""hi"", then go",x'))
      .toEqual([['"Heroes"', 'David Bowie'], ['Say "hi", then go', 'x']]);
  });

  it('handles CRLF, LF and CR line endings', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a,b\rc,d')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a\r\nb\nc')).toEqual([['a'], ['b'], ['c']]);
  });

  it('keeps line breaks inside quoted fields', () => {
    expect(parseCsv('"line one\r\nline two",b\nc,d')).toEqual([['line one\r\nline two', 'b'], ['c', 'd']]);
  });

  it('splits on another delimiter when asked, keeping commas as text (R66)', () => {
    expect(parseCsv('Id;Title;"Date Added"\r\n1;"Hello, ""you""; there";a,b\r\n', { delimiter: ';' }))
      .toEqual([['Id', 'Title', 'Date Added'], ['1', 'Hello, "you"; there', 'a,b']]);
  });

  it('keeps text around and after a closed quote, as before the speed-up', () => {
    expect(parseCsv('"ab"cd,e"f"\n,\n""')).toEqual([['abcd', 'e"f"'], ['', '']]);
  });

  it('gives the same rows one at a time through csvRows, throwing at an unclosed quote', () => {
    const rows = csvRows('a;b\r\n\r\n"c;d";e\n"open', { delimiter: ';' });
    expect(rows.next().value).toEqual(['a', 'b']);
    expect(rows.next().value).toEqual(['c;d', 'e']);
    expect(() => rows.next()).toThrow(CsvError);
  });

  it('strips a UTF-8 BOM', () => {
    expect(parseCsv('﻿title,artist\nValerie,Amy Winehouse'))
      .toEqual([['title', 'artist'], ['Valerie', 'Amy Winehouse']]);
  });

  it('skips blank lines but keeps empty fields', () => {
    expect(parseCsv('a,b\n\n\r\n,\nc,')).toEqual([['a', 'b'], ['', ''], ['c', '']]);
  });

  it('keeps a stray quote inside an unquoted field as a character', () => {
    expect(parseCsv('5\'10" tall,x')).toEqual([['5\'10" tall', 'x']]);
  });

  it('throws a readable CsvError for a quote that is never closed', () => {
    expect(() => parseCsv('title,artist\n"Valerie,Amy\nx,y')).toThrow(CsvError);
    expect(() => parseCsv('title,artist\n"Valerie,Amy\nx,y')).toThrow('starting on line 2 is never closed');
  });
});

describe('planImport (R22)', () => {
  it('throws for empty input', () => {
    expect(() => plan('')).toThrow(CsvError);
    expect(() => plan('')).toThrow('The file is empty.');
  });

  it('returns an empty plan for a header with no rows', () => {
    expect(plan('title,artist,genre\r\n')).toEqual({
      toAdd: [], duplicates: [], invalid: [], venuesToAdd: [], sings: [], singsLogged: [], singsBadDate: [],
    });
  });

  it('throws a readable CsvError when the title or artist column is missing', () => {
    expect(() => plan('name,band\nValerie,Amy Winehouse')).toThrow(CsvError);
    expect(() => plan('name,band\nValerie,Amy Winehouse'))
      .toThrow('The first row must name the columns, including "title" and "artist". Columns found: name, band.');
    expect(() => plan('title,genre\nValerie,Soul')).toThrow('Columns found: title, genre.');
  });

  it('builds complete song records with makeSong()', () => {
    const result = plan('title,artist,genre,year,key,tags\nValerie,Amy Winehouse,Soul,2006,-2,"duet; crowd-pleaser, slow"');
    expect(result.toAdd).toEqual([
      makeSong({
        title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006, key: '-2',
        tags: ['duet', 'crowd-pleaser', 'slow'],
      }, now),
    ]);
    expect(result.toAdd[0].createdAt).toBe('2026-11-11T12:00:00.000Z');
  });

  it('accepts missing optional columns', () => {
    const { toAdd } = plan('title,artist\nValerie,Amy Winehouse');
    expect(toAdd).toEqual([makeSong({ title: 'Valerie', artist: 'Amy Winehouse' }, now)]);
    expect(toAdd[0]).toMatchObject({ genre: '', year: null, key: '', tags: [] });
  });

  it('matches columns in any order, ignoring case, spaces and unknown columns', () => {
    const { toAdd } = plan(' Year ,Spotify URI,ARTIST, Title,Genre\n1978,spotify:x,Queen,Don\'t Stop Me Now,Rock');
    expect(toAdd).toHaveLength(1);
    expect(toAdd[0]).toMatchObject({ title: 'Don\'t Stop Me Now', artist: 'Queen', genre: 'Rock', year: 1978 });
  });

  it('treats cells missing from a short row as empty', () => {
    const { toAdd } = plan('title,artist,genre,year\nValerie,Amy Winehouse');
    expect(toAdd[0]).toMatchObject({ title: 'Valerie', artist: 'Amy Winehouse', genre: '', year: null });
  });

  it('skips duplicate songs within the file, keeping the first', () => {
    const result = plan('title,artist,genre\nDancing Queen,ABBA,Pop\n dancing queen , abba ,Disco\nWaterloo,ABBA,Pop');
    expect(result.toAdd.map((s) => s.title)).toEqual(['Dancing Queen', 'Waterloo']);
    expect(result.toAdd[0].genre).toBe('Pop');
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]).toMatchObject({ title: 'dancing queen', genre: 'Disco' });
  });

  it('skips songs already in the library, ignoring case', () => {
    const existing = [{ id: 1, ...makeSong({ title: 'Valerie', artist: 'Amy Winehouse' }) }];
    const result = plan('title,artist\nVALERIE,amy winehouse\nBack to Black,Amy Winehouse', existing);
    expect(result.toAdd.map((s) => s.title)).toEqual(['Back to Black']);
    expect(result.duplicates.map((s) => s.title)).toEqual(['VALERIE']);
  });

  it('counts rows missing a title or artist as invalid', () => {
    const result = plan('title,artist,genre\n,Nobody,Pop\nNo Artist,,Rock\n  ,  ,Jazz\nValerie,Amy Winehouse,Soul');
    expect(result.toAdd.map((s) => s.title)).toEqual(['Valerie']);
    expect(result.invalid).toHaveLength(3);
    expect(result.duplicates).toEqual([]);
  });

  it('ignores rows where every cell is blank', () => {
    const result = plan('title,artist,genre\n,,\n , ,\nValerie,Amy Winehouse,Soul\n,,');
    expect(result.toAdd).toHaveLength(1);
    expect(result.invalid).toEqual([]);
  });

  it('normalises years, including decades and dates', () => {
    const years = (cells) => plan(`title,artist,year\n${cells.map((y, i) => `Song ${i},Artist,${y}`).join('\n')}`)
      .toAdd.map((s) => s.year);
    expect(years(['1984', ' 2001 ', '1980s', '1984-05-01', '1999-1-2', '1984.0']))
      .toEqual([1984, 2001, 1980, 1984, 1999, 1984]);
    expect(years(['', 'abc', '84', '1800', '2200', '1984-05-01T00:00', 'circa 1990']))
      .toEqual([null, null, null, null, null, null, null]);
  });

  it('works end to end on a BOM, CRLF, quoted export', () => {
    const text = '﻿"Title","Artist","Year"\r\n"""Heroes""","David Bowie","1977"\r\n"Hello, Goodbye","The Beatles","1967"\r\n';
    expect(plan(text).toAdd.map((s) => [s.title, s.artist, s.year]))
      .toEqual([['"Heroes"', 'David Bowie', 1977], ['Hello, Goodbye', 'The Beatles', 1967]]);
  });
});

describe('importSummary (R22)', () => {
  const songs = (n) => Array.from({ length: n }, () => ({}));

  it('reports imports and skips with correct plurals', () => {
    expect(importSummary({ toAdd: songs(412), duplicates: songs(3), invalid: songs(1) }))
      .toBe('Imported 412 songs. Skipped 3 duplicates and 1 row without a title or artist.');
    expect(importSummary({ toAdd: songs(1), duplicates: songs(1), invalid: songs(2) }))
      .toBe('Imported 1 song. Skipped 1 duplicate and 2 rows without a title or artist.');
  });

  it('leaves out skip counts that are zero', () => {
    expect(importSummary({ toAdd: songs(5), duplicates: [], invalid: [] })).toBe('Imported 5 songs.');
    expect(importSummary({ toAdd: [], duplicates: songs(2), invalid: [] })).toBe('Imported 0 songs. Skipped 2 duplicates.');
  });

  it('says so when the file has no songs', () => {
    expect(importSummary({ toAdd: [], duplicates: [], invalid: [] }))
      .toBe('The file has a header row but no songs, so nothing was imported.');
  });

  it('reports sings, new venues and skipped sings (R46)', () => {
    expect(importSummary({ toAdd: songs(4), duplicates: [], invalid: [], venuesToAdd: [{}], sings: songs(3) }))
      .toBe('Imported 4 songs. Logged 3 sings at 1 new venue.');
    expect(importSummary({ toAdd: [], duplicates: songs(2), invalid: [], venuesToAdd: [], sings: songs(1) }))
      .toBe('Imported 0 songs. Logged 1 sing. Skipped 2 duplicates.');
    expect(importSummary({
      toAdd: songs(1), duplicates: songs(1), invalid: songs(1), venuesToAdd: [{}, {}], sings: songs(2),
      singsLogged: songs(1), singsBadDate: songs(2),
    })).toBe('Imported 1 song. Logged 2 sings at 2 new venues. '
      + 'Skipped 1 duplicate, 1 row without a title or artist, 1 sing already logged and 2 sings with an unreadable date.');
  });
});

describe('csvDate (R46)', () => {
  // `now` is 2026-11-11 at noon UTC; the local day is the same everywhere but the far Pacific.
  const today = csvDate('', now);

  it('uses the import day for a blank cell', () => {
    expect(today).toMatch(/^2026-11-1[01]$/);
    expect(csvDate(null, now)).toBe(today);
    expect(csvDate('   ', now)).toBe(today);
  });

  it('reads full dates, months, years and US dates', () => {
    expect(csvDate('2026-10-15')).toBe('2026-10-15');
    expect(csvDate(' 2026-9-5 ')).toBe('2026-09-05');
    expect(csvDate('2026-09')).toBe('2026-09-01');
    expect(csvDate('2025')).toBe('2025-01-01');
    expect(csvDate('10/15/2026')).toBe('2026-10-15');
    expect(csvDate('1/5/2026')).toBe('2026-01-05');
  });

  it('returns null for anything else', () => {
    for (const bad of ['yesterday', '2026-13-01', '2026-02-30', '15/10/2026', '10-15-2026', '2026-10-15T20:00', '20261015']) {
      expect(csvDate(bad), bad).toBeNull();
    }
  });
});

describe('planImport sings (R46)', () => {
  const CROWN = { id: 7, name: 'The Crown' };
  const existingSongs = [{ id: 1, ...makeSong({ title: 'Valerie', artist: 'Amy Winehouse' }) }];
  const planWith = (text, existing = {}) =>
    planImport(parseCsv(text), existing.songs || [], now, { venues: existing.venues || [], sings: existing.sings || [] });

  it('logs a sing per row with a venue, creating the venue once', () => {
    const result = planWith('title,artist,venue,date\n'
      + 'Valerie,Amy Winehouse,Viking,2026-10-15\n'
      + 'Drive,Incubus,viking,\n'
      + 'Beginnings,Chicago,,\n');
    expect(result.toAdd.map((s) => s.title)).toEqual(['Valerie', 'Drive', 'Beginnings']);
    expect(result.venuesToAdd).toEqual([{ name: 'Viking' }]);
    expect(result.sings).toEqual([
      { songKey: 'valerie\u0000amy winehouse', venue: 'Viking', date: '2026-10-15' },
      { songKey: 'drive\u0000incubus', venue: 'Viking', date: csvDate('', now) },
    ]);
  });

  it('logs sings for songs already in the library and venues that already exist', () => {
    const result = planWith('title,artist,venue,date\nVALERIE,amy winehouse,the crown,2026-10-15\nValerie,Amy Winehouse,Viking,2026-10-16',
      { songs: existingSongs, venues: [CROWN] });
    expect(result.toAdd).toEqual([]);
    expect(result.duplicates).toHaveLength(2);
    expect(result.venuesToAdd).toEqual([{ name: 'Viking' }]);
    expect(result.sings.map((s) => [s.venue, s.date])).toEqual([['The Crown', '2026-10-15'], ['Viking', '2026-10-16']]);
  });

  it('skips sings already logged on the device or earlier in the file', () => {
    const sings = [{ id: 1, songId: 1, venueId: 7, date: '2026-10-15' }];
    const result = planWith('title,artist,venue,date\n'
      + 'Valerie,Amy Winehouse,The Crown,2026-10-15\n' // already on the device
      + 'Valerie,Amy Winehouse,The Crown,2026-10-20\n'
      + 'Valerie,Amy Winehouse,THE CROWN,2026-10-20\n', // earlier in the file
    { songs: existingSongs, venues: [CROWN], sings });
    expect(result.sings.map((s) => s.date)).toEqual(['2026-10-20']);
    expect(result.singsLogged).toHaveLength(2);
    expect(result.venuesToAdd).toEqual([]);
  });

  it('skips sings with an unreadable date and rows without a song', () => {
    const result = planWith('title,artist,venue,date\nDrive,Incubus,Viking,last week\n,Nobody,Viking,2026-10-15\n');
    expect(result.toAdd).toHaveLength(1);
    expect(result.sings).toEqual([]);
    expect(result.singsBadDate).toEqual([{ song: expect.objectContaining({ title: 'Drive' }), venue: 'Viking', date: 'last week' }]);
    expect(result.venuesToAdd).toEqual([]);
    expect(result.invalid).toHaveLength(1);
  });

  it('has empty sing fields when the file has no venue column', () => {
    const result = planWith('title,artist\nDrive,Incubus');
    expect(result).toMatchObject({ venuesToAdd: [], sings: [], singsLogged: [], singsBadDate: [] });
  });
});

// ---------- Export (R23) ----------

const HEADER = 'title,artist,genre,year,key,tags,status,rating,notes';
const BOM = '﻿';
const stored = (id, fields) => ({ id, ...makeSong(fields, now) });
// The data rows of an export, without the BOM, header or final CRLF.
const exportRows = (songs) => songsToCsv(songs).slice(BOM.length).split('\r\n').slice(1, -1);

describe('toCsvField (R23)', () => {
  it('leaves plain text and numbers alone', () => {
    expect(toCsvField('Valerie')).toBe('Valerie');
    expect(toCsvField('-2')).toBe('-2');
    expect(toCsvField(2006)).toBe('2006');
    expect(toCsvField(0)).toBe('0');
  });

  it('writes null, undefined and empty text as an empty field', () => {
    expect(toCsvField(null)).toBe('');
    expect(toCsvField(undefined)).toBe('');
    expect(toCsvField('')).toBe('');
  });

  it('quotes a field holding a comma, quote, CR or LF, doubling inner quotes', () => {
    expect(toCsvField('Hello, Goodbye')).toBe('"Hello, Goodbye"');
    expect(toCsvField('"Heroes"')).toBe('"""Heroes"""');
    expect(toCsvField('Say "hi"')).toBe('"Say ""hi"""');
    expect(toCsvField('line one\nline two')).toBe('"line one\nline two"');
    expect(toCsvField('line one\r\nline two')).toBe('"line one\r\nline two"');
    expect(toCsvField('a\rb')).toBe('"a\rb"');
  });

  it('leaves semicolons, spaces and unicode unquoted', () => {
    expect(toCsvField('duet; slow')).toBe('duet; slow');
    expect(toCsvField('Beyoncé ♫ 99 Luftballons 🎤')).toBe('Beyoncé ♫ 99 Luftballons 🎤');
  });
});

describe('songsToCsv (R23)', () => {
  it('starts with a UTF-8 BOM and the header, and ends every record with CRLF', () => {
    const text = songsToCsv([stored(1, { title: 'Valerie', artist: 'Amy Winehouse' })]);
    expect(text.startsWith(`${BOM}${HEADER}\r\n`)).toBe(true);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('writes only the header for an empty library', () => {
    expect(songsToCsv([])).toBe(`${BOM}${HEADER}\r\n`);
    expect(songsToCsv()).toBe(`${BOM}${HEADER}\r\n`);
  });

  it('writes every field in column order, tags joined with "; "', () => {
    const song = stored(1, {
      title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006, key: '-2',
      tags: ['duet', 'crowd-pleaser'], status: 'want-to-try', rating: 4, notes: 'starts cold',
    });
    expect(exportRows([song])).toEqual(['Valerie,Amy Winehouse,Soul,2006,-2,duet; crowd-pleaser,want-to-try,4,starts cold']);
  });

  it('writes empty fields for no genre, year, key, tags, rating or notes', () => {
    expect(exportRows([stored(1, { title: 'Waterloo', artist: 'ABBA' })])).toEqual(['Waterloo,ABBA,,,,,,,']); // status not set (R64)
  });

  it('quotes titles, artists and notes with commas, quotes and line breaks', () => {
    const song = stored(1, {
      title: 'Hello, Goodbye', artist: 'The "Fab" Four', notes: 'skip the bridge\nstarts cold, slow',
    });
    expect(exportRows([song])).toEqual([
      '"Hello, Goodbye","The ""Fab"" Four",,,,,,,"skip the bridge\nstarts cold, slow"',
    ]);
  });

  it('sorts by title ignoring case, then by artist', () => {
    const songs = [
      stored(1, { title: 'waterloo', artist: 'ABBA' }),
      stored(2, { title: 'Valerie', artist: 'The Zutons' }),
      stored(3, { title: 'Africa', artist: 'Toto' }),
      stored(4, { title: 'valerie', artist: 'Amy Winehouse' }),
    ];
    expect(exportRows(songs).map((row) => row.split(',').slice(0, 2).join(' / ')))
      .toEqual(['Africa / Toto', 'valerie / Amy Winehouse', 'Valerie / The Zutons', 'waterloo / ABBA']);
  });

  it('does not change or reorder the songs it is given', () => {
    const songs = [stored(1, { title: 'Waterloo', artist: 'ABBA' }), stored(2, { title: 'Africa', artist: 'Toto' })];
    const copy = structuredClone(songs);
    songsToCsv(songs);
    expect(songs).toEqual(copy);
  });

  it('keeps unicode as it is', () => {
    expect(exportRows([stored(1, { title: 'Déjà Vu', artist: 'Beyoncé', tags: ['français', '🎤'] })]))
      .toEqual(['Déjà Vu,Beyoncé,,,,français; 🎤,,,']);
  });
});

describe('csvFileName (R23)', () => {
  it('uses the local calendar day', () => {
    expect(csvFileName(new Date(2026, 10, 11, 23, 59))).toBe('mic-jaunt-songs-2026-11-11.csv');
    expect(csvFileName(new Date(2027, 0, 5, 0, 1))).toBe('mic-jaunt-songs-2027-01-05.csv');
  });
});

describe('CSV export round trip (R23)', () => {
  const library = [
    stored(1, {
      title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006, key: '-2',
      tags: ['duet', 'crowd-pleaser'], status: 'go-to', rating: 5, notes: 'starts cold',
    }),
    stored(2, { title: 'Hello, Goodbye', artist: 'The Beatles', genre: 'Pop', year: 1967, tags: ['60s'] }),
    stored(3, { title: '"Heroes"', artist: 'David Bowie', key: '+1', notes: 'line one\r\nline two, "quoted"' }),
    stored(4, { title: 'Déjà Vu', artist: 'Beyoncé', genre: 'R&B', year: null, rating: null }),
    stored(5, { title: 'Waterloo', artist: 'ABBA', status: 'retired', rating: 3 }),
  ];

  it('parses back to the same cells', () => {
    const rows = parseCsv(songsToCsv(library));
    expect(rows[0]).toEqual(HEADER.split(','));
    expect(rows).toHaveLength(library.length + 1);
    const heroes = rows.find((row) => row[0] === '"Heroes"');
    expect(heroes).toEqual(['"Heroes"', 'David Bowie', '', '', '+1', '', '', '', 'line one\r\nline two, "quoted"']);
  });

  it('imports into the same library as duplicates only', () => {
    const result = planImport(parseCsv(songsToCsv(library)), library, now);
    expect(result.toAdd).toEqual([]);
    expect(result.invalid).toEqual([]);
    expect(result.duplicates).toHaveLength(library.length);
    expect(importSummary(result)).toBe('Imported 0 songs. Skipped 5 duplicates.');
  });

  it('keeps title, artist, genre, year, key and tags when imported into an empty library', () => {
    const result = planImport(parseCsv(songsToCsv(library)), [], now);
    const pick = ({ title, artist, genre, year, key, tags }) => ({ title, artist, genre, year, key, tags });
    expect(result.toAdd.map(pick)).toEqual(sortByTitle(library).map(pick));
  });
});
