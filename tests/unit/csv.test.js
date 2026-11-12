import { describe, it, expect } from 'vitest';
import { parseCsv, planImport, importSummary, CsvError } from '../../js/lib/csv.js';
import { makeSong } from '../../js/lib/song.js';

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
    expect(plan('title,artist,genre\r\n')).toEqual({ toAdd: [], duplicates: [], invalid: [] });
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
});
