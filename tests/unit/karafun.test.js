import { describe, it, expect } from 'vitest';
import {
  parseCatalog, catalogReader, countLines, catalogIndex, catalogIdFor, matchSongs, formatCount, catalogStatusText,
  loadProgressText, loadResultMessage, NOT_CATALOG_MESSAGE, NO_SONGS_MESSAGE, CATALOG_HEADER_LINE, KARAFUN_LIST_URL,
} from '../../js/lib/karafun.js';
import { CsvError } from '../../js/lib/csv.js';
import { songKey } from '../../js/lib/song.js';

const HEADER = 'Id;Title;Artist;Year;Duo;Explicit;"Date Added";Styles;Languages';
const SAMPLE = [
  HEADER,
  '12543;Creep;Radiohead;1992;0;1;2008-03-07;Rock,Alternative;English',
  '49375;"Tennessee Whiskey";"Chris Stapleton";2015;0;0;2015-07-21;Blues,Country,Soul,Rock;English',
  '56442;Shallow;"A Star is Born (2018 film)";2018;1;0;2018-10-15;Soundtrack,Pop,Duet;English',
].join('\r\n');

const parse = (...rows) => parseCatalog([HEADER, ...rows].join('\n'));

describe('parseCatalog (R66)', () => {
  it('reads the sample rows into catalog records', () => {
    const { records, skipped } = parseCatalog(`${SAMPLE}\r\n`);
    expect(skipped).toBe(0);
    expect(records).toEqual([
      {
        id: 12543, title: 'Creep', artist: 'Radiohead', year: 1992, duet: false, explicit: true,
        added: '2008-03-07', styles: ['Rock', 'Alternative'], languages: ['English'], key: songKey({ title: 'Creep', artist: 'Radiohead' }),
      },
      {
        id: 49375, title: 'Tennessee Whiskey', artist: 'Chris Stapleton', year: 2015, duet: false, explicit: false,
        added: '2015-07-21', styles: ['Blues', 'Country', 'Soul', 'Rock'], languages: ['English'],
        key: songKey({ title: 'Tennessee Whiskey', artist: 'Chris Stapleton' }),
      },
      {
        id: 56442, title: 'Shallow', artist: 'A Star is Born (2018 film)', year: 2018, duet: true, explicit: false,
        added: '2018-10-15', styles: ['Soundtrack', 'Pop', 'Duet'], languages: ['English'],
        key: songKey({ title: 'Shallow', artist: 'A Star is Born (2018 film)' }),
      },
    ]);
  });

  it('drops a BOM and reads LF, CRLF and a missing final newline alike', () => {
    const lf = parseCatalog(`﻿${SAMPLE.replace(/\r\n/g, '\n')}\n`);
    const crlf = parseCatalog(`﻿${SAMPLE}`);
    expect(lf.records).toHaveLength(3);
    expect(crlf.records).toEqual(lf.records);
  });

  it('reads quoted fields with semicolons, commas and doubled quotes', () => {
    const { records } = parse('7;"Don\'t Stop; Believin\'";"Journey, The";1981;0;0;2010-01-01;"Rock,Pop";English',
      '8;"""Heroes""";"David Bowie";1977;0;0;2010-01-01;Rock;"English,German"');
    expect(records[0].title).toBe('Don\'t Stop; Believin\'');
    expect(records[0].artist).toBe('Journey, The');
    expect(records[1].title).toBe('"Heroes"');
    expect(records[1].languages).toEqual(['English', 'German']);
  });

  it('keeps accents and other UTF-8 text as it is', () => {
    const { records } = parse('9;"Je veux";Zaz;2010;0;0;2011-02-03;"Pop,Chanson française";Français');
    expect(records[0].styles).toEqual(['Pop', 'Chanson française']);
    expect(records[0].languages).toEqual(['Français']);
  });

  it('reads Duo and Explicit flags as booleans', () => {
    const { records } = parse('1;A;X;2000;1;1;;;', '2;B;X;2000;0;0;;;', '3;C;X;2000;;;;;', '4;D;X;2000;true;yes;;;');
    expect(records.map((r) => [r.duet, r.explicit])).toEqual([[true, true], [false, false], [false, false], [true, true]]);
  });

  it('turns blank or odd values into empty ones instead of failing', () => {
    const { records, skipped } = parse(
      '1;"Blank everything";;;;;;;',
      '2;"Odd values";"  Someone  ";abc;2;x;someday;" Rock , ,Pop ";" "',
      '3;"Year zero";X;0;0;0;2020-02-30;;',
      '4;"Date with time";X;1999;0;0;2020-02-03 10:11:12;;',
      '5;"Short row";X',
    );
    expect(skipped).toBe(0);
    expect(records[0]).toMatchObject({ artist: '', year: null, duet: false, explicit: false, added: '', styles: [], languages: [] });
    expect(records[1]).toMatchObject({ artist: 'Someone', year: null, duet: false, explicit: false, added: '', styles: ['Rock', 'Pop'], languages: [] });
    expect(records[2]).toMatchObject({ year: null, added: '' });
    expect(records[3]).toMatchObject({ year: 1999, added: '2020-02-03' });
    expect(records[4]).toMatchObject({ id: 5, title: 'Short row', artist: 'X', year: null, styles: [] });
  });

  it('skips rows without a positive whole Id or a title, and repeated Ids, and counts them', () => {
    const { records, skipped } = parse(
      '10;Keep;X;2000;0;0;;;',
      ';"No id";X;2000;0;0;;;',
      '0;"Zero id";X;2000;0;0;;;',
      '-3;"Negative id";X;2000;0;0;;;',
      '2.5;"Fraction id";X;2000;0;0;;;',
      'abc;"Word id";X;2000;0;0;;;',
      '11;;X;2000;0;0;;;',
      '12;"   ";X;2000;0;0;;;',
      '10;"Same id again";X;2000;0;0;;;',
      'garbage',
      '',
      '13;"Also kept";Y;2001;0;0;;;',
    );
    expect(records.map((r) => r.id)).toEqual([10, 13]);
    expect(records[0].title).toBe('Keep');
    expect(skipped).toBe(9);
  });

  it('finds columns by name, so a reordered or extended file still loads', () => {
    const { records } = parseCatalog('title;ID;artist;Extra\nCreep;12543;Radiohead;whatever\n');
    expect(records).toEqual([{
      id: 12543, title: 'Creep', artist: 'Radiohead', year: null, duet: false, explicit: false,
      added: '', styles: [], languages: [], key: songKey({ title: 'Creep', artist: 'Radiohead' }),
    }]);
  });

  it('refuses a file that is not the catalog with a clear message', () => {
    expect(NOT_CATALOG_MESSAGE).toBe(`This is not the KaraFun catalog CSV. Its first line should be ${CATALOG_HEADER_LINE}.`);
    expect(CATALOG_HEADER_LINE).toBe(HEADER);
    const songsExport = '﻿title,artist,genre,year\r\nCreep,Radiohead,Rock,1992\r\n';
    for (const text of [songsExport, 'hello world', '{"app":"mic-jaunt"}', 'Id;Title\n1;Creep']) {
      expect(() => parseCatalog(text)).toThrow(CsvError);
      expect(() => parseCatalog(text)).toThrow(NOT_CATALOG_MESSAGE);
    }
  });

  it('refuses an empty file, and a header with no usable rows, so nothing is replaced', () => {
    expect(() => parseCatalog('')).toThrow('The file is empty.');
    expect(() => parseCatalog('﻿\r\n\r\n')).toThrow('The file is empty.');
    expect(() => parseCatalog(`${HEADER}\r\n`)).toThrow(NO_SONGS_MESSAGE);
    expect(NO_SONGS_MESSAGE).toBe('The file has the KaraFun header but no songs.');
    expect(() => parse(';"No id";X;;;;;;')).toThrow(CsvError);
  });

  it('reports a quoted value that is never closed', () => {
    expect(() => parse('1;"Unclosed;X;2000;0;0;;;')).toThrow(/never closed/);
  });

  it('parses a 100,000-row catalog quickly', () => {
    const lines = [HEADER];
    for (let i = 1; i <= 100_000; i += 1) {
      lines.push(`${i};"Song number ${i}";"Artist ${i % 5000}";${1950 + (i % 70)};${i % 9 === 0 ? 1 : 0};0;`
        + `2015-07-21;"Pop,Rock,Soul";English`);
    }
    const text = `﻿${lines.join('\r\n')}\r\n`;
    const started = performance.now();
    const { records, skipped } = parseCatalog(text);
    const elapsed = performance.now() - started;
    expect(records).toHaveLength(100_000);
    expect(skipped).toBe(0);
    expect(records[99_999]).toMatchObject({ id: 100_000, title: 'Song number 100000', artist: 'Artist 0', duet: false });
    // Well under a second on a desktop; the bound only catches a slow rewrite
    // (the old one-character-at-a-time parser took over a second) on a busy machine.
    expect(elapsed).toBeLessThan(5000);
  }, 30_000);

  it('reads a chunk at a time, counting rows read and skipped, after checking the header first', () => {
    expect(() => catalogReader('title,artist\nCreep,Radiohead')).toThrow(NOT_CATALOG_MESSAGE);
    expect(() => catalogReader('')).toThrow('The file is empty.');

    const reader = catalogReader([HEADER, '1;A;X;;;;;;', ';"No id";X;;;;;;', '2;B;X;;;;;;', '', '3;C;X;;;;;;', '4;D;X;;;;;;'].join('\r\n'));
    expect(reader).toMatchObject({ estimate: 5, read: 0, skipped: 0, done: false });
    expect(reader.next(2).map((r) => r.id)).toEqual([1, 2]);
    expect(reader).toMatchObject({ read: 3, skipped: 1, done: false });
    expect(reader.next(2).map((r) => r.id)).toEqual([3, 4]);
    expect(reader.done).toBe(false);
    expect(reader.next(2)).toEqual([]);
    expect(reader).toMatchObject({ read: 5, skipped: 1, done: true });
    expect(reader.next(2)).toEqual([]);
  });

  it('estimates the rows from the lines that are not empty', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a\r\nb\r\n\r\nc')).toBe(3);
    expect(countLines('a\nb\n\n')).toBe(2);
    expect(countLines('a\rb\r')).toBe(2);
    expect(countLines(`﻿${SAMPLE}\r\n`)).toBe(4);
  });

  it('links to KaraFun\'s song list page', () => {
    expect(KARAFUN_LIST_URL).toBe('https://www.karafun.com/karaoke-song-list.html');
  });
});

describe('matching my songs (R68)', () => {
  const records = parse(
    '12543;Creep;Radiohead;1992;0;1;;;',
    '49375;"Tennessee Whiskey";"Chris Stapleton";2015;0;0;;;',
    '60001;Creep;Radiohead;1992;0;0;;;',
    '50000;Creep;Radiohead;1992;0;0;;;',
  ).records;
  const index = catalogIndex(records);
  const song = (id, title, artist, karafunId) => ({ id, title, artist, genre: '', karafunId });

  it('indexes catalog ids by title and artist, ignoring case', () => {
    expect(index.get(songKey({ title: 'CREEP ', artist: 'radiohead' }))).toEqual([12543, 60001, 50000]);
    expect(index.get(songKey({ title: 'Tennessee Whiskey', artist: 'Chris Stapleton' }))).toEqual([49375]);
    expect(index.size).toBe(2);
  });

  it('flags songs KaraFun has, ignoring case, and leaves unchanged songs out', () => {
    const songs = [
      song(1, 'tennessee whiskey', 'CHRIS STAPLETON', null),
      song(2, 'Valerie', 'Amy Winehouse', null),
      song(3, 'Tennessee Whiskey', 'Chris Stapleton', 49375),
    ];
    expect(matchSongs(songs, index)).toEqual([{ ...songs[0], karafunId: 49375 }]);
  });

  it('clears a flag that no longer matches', () => {
    const songs = [song(1, 'Valerie', 'Amy Winehouse', 777), song(2, 'Tennessee Whiskey', 'Chris Stapleton', 1)];
    expect(matchSongs(songs, index)).toEqual([
      { ...songs[0], karafunId: null },
      { ...songs[1], karafunId: 49375 },
    ]);
  });

  it('keeps the version a song already carries, else takes the lowest id', () => {
    expect(catalogIdFor(song(1, 'Creep', 'Radiohead', 60001), index)).toBe(60001);
    expect(catalogIdFor(song(1, 'Creep', 'Radiohead', null), index)).toBe(12543);
    expect(catalogIdFor(song(1, 'Creep', 'Radiohead', 99), index)).toBe(12543);
    expect(matchSongs([song(1, 'Creep', 'Radiohead', 60001)], index)).toEqual([]);
  });

  it('leaves alone songs from before the flag existed that KaraFun does not have', () => {
    const old = { id: 4, title: 'Valerie', artist: 'Amy Winehouse' }; // no karafunId field
    expect(matchSongs([old], index)).toEqual([]);
    expect(matchSongs([{ id: 5, title: 'Creep', artist: 'Radiohead' }], index))
      .toEqual([{ id: 5, title: 'Creep', artist: 'Radiohead', karafunId: 12543 }]);
  });

  it('accepts a plain Map of key to id, and does not change its inputs', () => {
    const simple = new Map([[songKey({ title: 'Creep', artist: 'Radiohead' }), 12543]]);
    const songs = [song(1, 'Creep', 'Radiohead', null)];
    const copy = structuredClone(songs);
    expect(matchSongs(songs, simple)).toEqual([{ ...songs[0], karafunId: 12543 }]);
    expect(songs).toEqual(copy);
    expect(matchSongs(songs, new Map())).toEqual([]);
  });
});

describe('KaraFun wording (R66)', () => {
  it('formats counts with thousands separators', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1000)).toBe('1,000');
    expect(formatCount(101234)).toBe('101,234');
    expect(formatCount(1234567)).toBe('1,234,567');
  });

  it('says when the catalog was loaded and how many songs it holds', () => {
    const loadedAt = new Date(2026, 10, 14, 21, 30).toISOString();
    expect(catalogStatusText({ count: 101234, loadedAt })).toBe('Loaded 14 Nov 2026 · 101,234 songs');
    expect(catalogStatusText({ count: 1, loadedAt })).toBe('Loaded 14 Nov 2026 · 1 song');
  });

  it('says when a load stopped part-way: rows but no load time', () => {
    expect(catalogStatusText({ count: 37500, loadedAt: null }))
      .toBe('The last load did not finish (37,500 songs stored). Load the file again.');
    expect(catalogStatusText({ count: 1, loadedAt: 'garbage' }))
      .toBe('The last load did not finish (1 song stored). Load the file again.');
  });

  it('says no catalog is loaded when the store is empty, whatever the meta says', () => {
    expect(catalogStatusText({ count: 0, loadedAt: '2026-11-14T10:00:00.000Z' })).toBe('No catalog loaded');
    expect(catalogStatusText()).toBe('No catalog loaded');
  });

  it('shows progress while storing', () => {
    expect(loadProgressText(40000, 101234)).toBe('Loading… 40,000 of 101,234');
  });

  it('sums up a load', () => {
    expect(loadResultMessage({ count: 101234, skipped: 0, songs: 480, matched: 312 }))
      .toBe('Loaded 101,234 songs from KaraFun; 312 of your 480 songs are in it.');
    expect(loadResultMessage({ count: 101234, skipped: 3, songs: 480, matched: 312 }))
      .toBe('Loaded 101,234 songs from KaraFun; 312 of your 480 songs are in it; 3 rows skipped.');
    expect(loadResultMessage({ count: 3, skipped: 1, songs: 2, matched: 1 }))
      .toBe('Loaded 3 songs from KaraFun; 1 of your 2 songs is in it; 1 row skipped.');
    expect(loadResultMessage({ count: 1, songs: 1, matched: 1 })).toBe('Loaded 1 song from KaraFun; your 1 song is in it.');
    expect(loadResultMessage({ count: 1, songs: 1, matched: 0 })).toBe('Loaded 1 song from KaraFun; your 1 song is not in it.');
    expect(loadResultMessage({ count: 3, songs: 0, matched: 0 })).toBe('Loaded 3 songs from KaraFun.');
  });
});
