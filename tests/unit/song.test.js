import { describe, it, expect } from 'vitest';
import {
  makeSong, normalizeYear, normalizeTags, songKey, SONG_STATUSES,
  STATUS_LABELS, RATINGS, statusLabel, normalizeRating, formatRating, formatTags,
  validateSong, updateSong, planSongDelete, describeSongDelete,
} from '../../js/lib/song.js';

describe('normalizeYear (R36)', () => {
  it('accepts years as numbers or strings', () => {
    expect(normalizeYear(1984)).toBe(1984);
    expect(normalizeYear('1984')).toBe(1984);
    expect(normalizeYear(' 2001 ')).toBe(2001);
  });

  it('returns null for missing, blank or invalid values', () => {
    expect(normalizeYear(null)).toBeNull();
    expect(normalizeYear(undefined)).toBeNull();
    expect(normalizeYear('')).toBeNull();
    expect(normalizeYear('abc')).toBeNull();
    expect(normalizeYear('1984.5')).toBeNull();
    expect(normalizeYear(1800)).toBeNull();
    expect(normalizeYear(2200)).toBeNull();
    expect(normalizeYear(0)).toBeNull();
  });
});

describe('normalizeTags', () => {
  it('splits a string on commas or semicolons and trims', () => {
    expect(normalizeTags('duet, slow;80s')).toEqual(['duet', 'slow', '80s']);
  });

  it('drops empties and case-insensitive duplicates, keeping the first spelling', () => {
    expect(normalizeTags(['Duet', '', ' duet ', 'DUET', 'slow'])).toEqual(['Duet', 'slow']);
    expect(normalizeTags('')).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
  });
});

describe('makeSong', () => {
  const now = new Date('2026-11-11T12:00:00.000Z');

  it('builds the full record with safe defaults from title and artist alone', () => {
    expect(makeSong({ title: ' Valerie ', artist: ' Amy Winehouse ' }, now)).toEqual({
      title: 'Valerie',
      artist: 'Amy Winehouse',
      genre: '',
      year: null,
      key: '',
      notes: '',
      rating: null,
      status: 'go-to',
      tags: [],
      createdAt: '2026-11-11T12:00:00.000Z',
    });
  });

  it('keeps valid optional fields and normalises the rest', () => {
    const song = makeSong({
      title: 'Valerie', artist: 'Amy Winehouse', genre: ' Soul ', year: '2006',
      key: '-2', notes: 'starts cold', rating: '4', status: 'retired', tags: 'duet,duet',
      createdAt: '2020-01-01T00:00:00.000Z',
    }, now);
    expect(song).toMatchObject({
      genre: 'Soul', year: 2006, key: '-2', notes: 'starts cold', rating: 4,
      status: 'retired', tags: ['duet'], createdAt: '2020-01-01T00:00:00.000Z',
    });
  });

  it('rejects out-of-range ratings and unknown statuses', () => {
    expect(makeSong({ rating: 7 }).rating).toBeNull();
    expect(makeSong({ rating: 0 }).rating).toBeNull();
    expect(makeSong({ rating: 'x' }).rating).toBeNull();
    expect(makeSong({ status: 'banger' }).status).toBe('go-to');
    expect(SONG_STATUSES).toContain('want-to-try');
  });

  it('does not set an id (IndexedDB assigns it)', () => {
    expect('id' in makeSong({ title: 'a', artist: 'b', id: 7 })).toBe(false);
  });
});

describe('songKey', () => {
  it('treats the same title and artist as equal regardless of case and spacing', () => {
    expect(songKey({ title: 'Valerie ', artist: 'AMY WINEHOUSE' }))
      .toBe(songKey({ title: 'valerie', artist: ' Amy Winehouse' }));
    expect(songKey({ title: 'Valerie', artist: 'Amy Winehouse' }))
      .not.toBe(songKey({ title: 'Valerie', artist: 'Steve Winwood' }));
  });
});

describe('statusLabel (R7)', () => {
  it('labels every status', () => {
    expect(statusLabel('go-to')).toBe('Go-to');
    expect(statusLabel('want-to-try')).toBe('Want to try');
    expect(statusLabel('retired')).toBe('Retired');
    expect(Object.keys(STATUS_LABELS)).toEqual(SONG_STATUSES);
  });

  it('reads unknown or missing statuses as the default, like makeSong', () => {
    expect(statusLabel('banger')).toBe('Go-to');
    expect(statusLabel(undefined)).toBe('Go-to');
    expect(statusLabel('')).toBe('Go-to');
  });
});

describe('normalizeRating (R4)', () => {
  it('accepts whole ratings 1 to 5 as numbers or strings', () => {
    expect(RATINGS.map(normalizeRating)).toEqual([1, 2, 3, 4, 5]);
    expect(normalizeRating('4')).toBe(4);
    expect(normalizeRating(' 3 ')).toBe(3);
  });

  it('returns null for missing, blank or invalid values', () => {
    for (const value of [null, undefined, '', '   ', 0, 6, -1, 2.5, '2.5', 'x', '4 stars', true, false, NaN]) {
      expect(normalizeRating(value)).toBeNull();
    }
  });
});

describe('formatRating (R4)', () => {
  it('shows a rating out of 5, or nothing when unrated', () => {
    expect(formatRating(4)).toBe('4 of 5');
    expect(formatRating('1')).toBe('1 of 5');
    expect(formatRating(null)).toBe('');
    expect(formatRating(9)).toBe('');
  });
});

describe('formatTags (R5)', () => {
  it('joins tags with a comma and space', () => {
    expect(formatTags(['duet', 'slow'])).toBe('duet, slow');
    expect(formatTags([])).toBe('');
    expect(formatTags(undefined)).toBe('');
  });

  it('round-trips through normalizeTags', () => {
    const tags = ['Duet', 'crowd-pleaser', '80s'];
    expect(normalizeTags(formatTags(tags))).toEqual(tags);
  });
});

describe('validateSong (R2)', () => {
  const ok = { title: 'Valerie', artist: 'Amy Winehouse' };

  it('accepts title and artist with every optional field blank or missing', () => {
    expect(validateSong(ok)).toEqual({});
    expect(validateSong({ ...ok, genre: '', year: '', key: '', rating: '', status: '', tags: '', notes: '' }))
      .toEqual({});
  });

  it('accepts valid optional fields from the form', () => {
    expect(validateSong({ ...ok, year: '2006', rating: '5', status: 'want-to-try', key: '-2' })).toEqual({});
    expect(validateSong({ ...ok, year: 2006, rating: 5 })).toEqual({});
  });

  it('requires a title and an artist, ignoring whitespace', () => {
    expect(validateSong({})).toEqual({ title: 'Enter a title.', artist: 'Enter an artist.' });
    expect(Object.keys(validateSong({ title: '   ', artist: '\t\n' }))).toEqual(['title', 'artist']);
    expect(Object.keys(validateSong({ title: null, artist: 'Amy' }))).toEqual(['title']);
  });

  it('rejects a year that makeSong would drop', () => {
    for (const year of ['1899', '2101', '1984.5', 'eighties', 0]) {
      expect(Object.keys(validateSong({ ...ok, year }))).toEqual(['year']);
    }
    expect(validateSong({ ...ok, year: '   ' })).toEqual({});
  });

  it('rejects a rating outside 1 to 5 and an unknown status', () => {
    expect(Object.keys(validateSong({ ...ok, rating: '6' }))).toEqual(['rating']);
    expect(Object.keys(validateSong({ ...ok, rating: '0' }))).toEqual(['rating']);
    expect(Object.keys(validateSong({ ...ok, status: 'banger' }))).toEqual(['status']);
  });

  it('copes with no input at all', () => {
    expect(Object.keys(validateSong())).toEqual(['title', 'artist']);
  });
});

describe('updateSong (R2)', () => {
  const existing = {
    id: 7, title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006, key: '',
    notes: '', rating: null, status: 'go-to', tags: [], createdAt: '2020-01-01T00:00:00.000Z',
  };

  it('keeps the id and createdAt and normalises edited fields from the form', () => {
    const updated = updateSong(existing, {
      title: ' Valerie (live) ', artist: 'Amy Winehouse', genre: ' Pop ', year: '2007', key: '+1',
      notes: ' skip the bridge\nstarts cold ', rating: '4', status: 'retired', tags: 'duet, Slow, duet',
    });
    expect(updated).toEqual({
      id: 7, title: 'Valerie (live)', artist: 'Amy Winehouse', genre: 'Pop', year: 2007, key: '+1',
      notes: 'skip the bridge\nstarts cold', rating: 4, status: 'retired', tags: ['duet', 'Slow'],
      createdAt: '2020-01-01T00:00:00.000Z',
    });
  });

  it('clears optional fields that the form sends back blank', () => {
    const rated = { ...existing, key: '-2', rating: 3, tags: ['duet'], notes: 'x', genre: 'Soul', year: 2006 };
    expect(updateSong(rated, { genre: '', year: '', key: '', rating: '', tags: '', notes: '' })).toMatchObject({
      genre: '', year: null, key: '', rating: null, tags: [], notes: '',
    });
  });

  it('keeps fields that are not part of the change', () => {
    expect(updateSong(existing, { status: 'want-to-try' })).toEqual({ ...existing, status: 'want-to-try' });
  });

  it('ignores an id or createdAt in the changes', () => {
    const updated = updateSong(existing, { id: 99, createdAt: '1999-01-01T00:00:00.000Z' });
    expect(updated.id).toBe(7);
    expect(updated.createdAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('does not change the stored record it was given', () => {
    const copy = structuredClone(existing);
    updateSong(existing, { title: 'Other' });
    expect(existing).toEqual(copy);
  });
});

describe('planSongDelete (R2)', () => {
  const sings = [
    { id: 1, songId: 5, venueId: 1, date: '2026-01-01' },
    { id: 2, songId: 6, venueId: 1, date: '2026-01-01' },
    { id: 3, songId: 5, venueId: 2, date: '2026-02-01' },
  ];
  const setlists = [
    { id: 10, name: 'Friday', venueId: 1, songIds: [6, 5, 8] },
    { id: 11, name: 'General', venueId: null, songIds: [6, 8] },
    { id: 12, name: 'Only this', venueId: null, songIds: [5] },
  ];

  it('lists the song’s sings and the setlists that hold it, with the song removed', () => {
    expect(planSongDelete(5, sings, setlists)).toEqual({
      singIds: [1, 3],
      setlists: [
        { id: 10, name: 'Friday', venueId: 1, songIds: [6, 8] },
        { id: 12, name: 'Only this', venueId: null, songIds: [] },
      ],
    });
  });

  it('touches nothing when the song was never sung or listed', () => {
    expect(planSongDelete(99, sings, setlists)).toEqual({ singIds: [], setlists: [] });
    expect(planSongDelete(5, [], [])).toEqual({ singIds: [], setlists: [] });
    expect(planSongDelete(5)).toEqual({ singIds: [], setlists: [] });
  });

  it('copes with a setlist that has no songIds', () => {
    expect(planSongDelete(5, [], [{ id: 1, name: 'Broken', venueId: null }])).toEqual({ singIds: [], setlists: [] });
  });

  it('matches ids exactly, as IndexedDB keys do', () => {
    expect(planSongDelete('5', sings, setlists)).toEqual({ singIds: [], setlists: [] });
  });

  it('does not change the setlists it was given', () => {
    const copy = structuredClone(setlists);
    planSongDelete(5, sings, setlists);
    expect(setlists).toEqual(copy);
  });
});

describe('describeSongDelete (R2)', () => {
  const song = { title: 'Valerie', artist: 'Amy Winehouse' };

  it('names the song and warns it cannot be undone', () => {
    expect(describeSongDelete(song, { singIds: [], setlists: [] }))
      .toBe('Delete “Valerie” by Amy Winehouse? This cannot be undone.');
    expect(describeSongDelete(song)).toBe('Delete “Valerie” by Amy Winehouse? This cannot be undone.');
  });

  it('says what else is deleted, in the singular', () => {
    expect(describeSongDelete(song, { singIds: [1], setlists: [{}] })).toBe(
      'Delete “Valerie” by Amy Winehouse? It has been sung once; that history will be deleted too. ' +
      'It will be removed from 1 setlist. This cannot be undone.');
  });

  it('says what else is deleted, in the plural', () => {
    const message = describeSongDelete(song, { singIds: [1, 2, 3], setlists: [{}, {}] });
    expect(message).toContain('It has been sung 3 times; that history will be deleted too.');
    expect(message).toContain('It will be removed from 2 setlists.');
  });

  it('leaves out a missing artist', () => {
    expect(describeSongDelete({ title: 'Mystery' })).toBe('Delete “Mystery”? This cannot be undone.');
  });
});
