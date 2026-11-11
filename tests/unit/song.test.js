import { describe, it, expect } from 'vitest';
import { makeSong, normalizeYear, normalizeTags, songKey, SONG_STATUSES } from '../../js/lib/song.js';

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
