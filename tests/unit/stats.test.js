import { describe, it, expect } from 'vitest';
import {
  plural, todayLocalISO, isISODate, singStats, venueStats, totals, statsRows, singsBySong,
  sortVenues, venueNameError, venueInUseMessage, describeVenueDelete,
} from '../../js/lib/stats.js';

const CROWN = 1;
const ANCHOR = 2;

const songs = [
  { id: 10, title: 'Valerie', artist: 'Amy Winehouse' },
  { id: 11, title: 'Dancing Queen', artist: 'ABBA' },
  { id: 12, title: 'Mr. Brightside', artist: 'The Killers' },
  { id: 13, title: 'Never Sung', artist: 'Nobody' },
];

// Deliberately out of date order, with two sings of one song on one day.
const sings = [
  { id: 1, songId: 10, venueId: CROWN, date: '2026-10-01' },
  { id: 2, songId: 11, venueId: CROWN, date: '2026-10-15' },
  { id: 3, songId: 10, venueId: ANCHOR, date: '2026-11-05' },
  { id: 4, songId: 10, venueId: CROWN, date: '2026-09-20' },
  { id: 5, songId: 12, venueId: ANCHOR, date: '2026-10-15' },
  { id: 6, songId: 12, venueId: ANCHOR, date: '2026-10-15' },
];

describe('plural', () => {
  it('uses the singular only for exactly one', () => {
    expect(plural(0, 'sing', 'sings')).toBe('0 sings');
    expect(plural(1, 'sing', 'sings')).toBe('1 sing');
    expect(plural(2, 'sing log entry', 'sing log entries')).toBe('2 sing log entries');
  });
});

describe('R8 todayLocalISO', () => {
  it('formats the local calendar day with zero padding', () => {
    expect(todayLocalISO(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(todayLocalISO(new Date(2026, 10, 1, 0, 0, 1))).toBe('2026-11-01');
  });

  it('keeps the local day late in the evening (no UTC shift)', () => {
    expect(todayLocalISO(new Date(2026, 10, 30, 23, 59, 59))).toBe('2026-11-30');
    expect(todayLocalISO(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('pads years below 1000 to four digits', () => {
    const d = new Date(2026, 0, 1);
    d.setFullYear(999);
    expect(todayLocalISO(d)).toBe('0999-01-01');
  });

  it('defaults to now', () => {
    expect(todayLocalISO()).toBe(todayLocalISO(new Date()));
    expect(isISODate(todayLocalISO())).toBe(true);
  });
});

describe('R8 isISODate', () => {
  it('accepts real days in YYYY-MM-DD form', () => {
    expect(isISODate('2026-11-01')).toBe(true);
    expect(isISODate('2024-02-29')).toBe(true);
    expect(isISODate('2000-02-29')).toBe(true);
    expect(isISODate('2026-12-31')).toBe(true);
  });

  it('rejects impossible days', () => {
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('1900-02-29')).toBe(false);
    expect(isISODate('2026-04-31')).toBe(false);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('2026-00-10')).toBe(false);
    expect(isISODate('2026-11-00')).toBe(false);
  });

  it('rejects other formats and non-strings', () => {
    for (const value of ['', ' 2026-11-01', '2026-11-01 ', '2026-1-5', '01/11/2026', '2026-11-01T00:00', null, undefined, 20261101]) {
      expect(isISODate(value)).toBe(false);
    }
  });
});

describe('R8 singStats', () => {
  it('returns an empty map when nothing has been sung', () => {
    expect(singStats([])).toEqual(new Map());
    expect(singStats([], CROWN)).toEqual(new Map());
  });

  it('counts every venue when venueId is null or omitted', () => {
    const overall = singStats(sings);
    expect(overall.get(10)).toEqual({ count: 3, lastSung: '2026-11-05' });
    expect(overall.get(11)).toEqual({ count: 1, lastSung: '2026-10-15' });
    expect(overall.get(12)).toEqual({ count: 2, lastSung: '2026-10-15' });
    expect(singStats(sings, null)).toEqual(overall);
    expect(singStats(sings, undefined)).toEqual(overall);
  });

  it('only counts the given venue', () => {
    const crown = singStats(sings, CROWN);
    expect(crown.get(10)).toEqual({ count: 2, lastSung: '2026-10-01' });
    expect(crown.get(11)).toEqual({ count: 1, lastSung: '2026-10-15' });
    expect(crown.has(12)).toBe(false);
    expect(singStats(sings, 99)).toEqual(new Map());
  });

  it('counts several sings on one day separately', () => {
    expect(singStats(sings, ANCHOR).get(12)).toEqual({ count: 2, lastSung: '2026-10-15' });
  });

  it('finds the latest date whatever order the sings come in', () => {
    const reversed = [...sings].reverse();
    expect(singStats(reversed).get(10)).toEqual({ count: 3, lastSung: '2026-11-05' });
  });

  it('leaves songs that were never sung out', () => {
    expect(singStats(sings).has(13)).toBe(false);
  });

  it('does not change the input', () => {
    const copy = structuredClone(sings);
    singStats(sings, CROWN);
    expect(sings).toEqual(copy);
  });
});

describe('R8 venueStats and totals', () => {
  it('counts sings and the last sung date per venue', () => {
    const stats = venueStats(sings);
    expect(stats.get(CROWN)).toEqual({ count: 3, lastSung: '2026-10-15' });
    expect(stats.get(ANCHOR)).toEqual({ count: 3, lastSung: '2026-11-05' });
    expect(venueStats([])).toEqual(new Map());
  });

  it('totals every sing', () => {
    expect(totals(sings)).toEqual({ count: 6, lastSung: '2026-11-05' });
    expect(totals([])).toEqual({ count: 0, lastSung: null });
  });
});

describe('R8 statsRows', () => {
  it('lists sung songs most recently sung first', () => {
    const rows = statsRows(songs, singStats(sings));
    expect(rows.map((r) => r.song.title)).toEqual(['Valerie', 'Mr. Brightside', 'Dancing Queen']);
    expect(rows[0]).toEqual({ songId: 10, song: songs[0], count: 3, lastSung: '2026-11-05' });
  });

  it('breaks a last-sung tie by times sung, then by title', () => {
    // Mr. Brightside (2) and Dancing Queen (1) were both last sung 2026-10-15.
    const rows = statsRows(songs, singStats(sings));
    expect(rows[1].count).toBe(2);
    expect(rows[2].count).toBe(1);

    const sameDay = [
      { id: 1, songId: 11, venueId: CROWN, date: '2026-11-01' },
      { id: 2, songId: 10, venueId: CROWN, date: '2026-11-01' },
    ];
    expect(statsRows(songs, singStats(sameDay)).map((r) => r.song.title)).toEqual(['Dancing Queen', 'Valerie']);
  });

  it('uses only the venue the stats were built for', () => {
    const rows = statsRows(songs, singStats(sings, CROWN));
    expect(rows.map((r) => [r.song.title, r.count, r.lastSung])).toEqual([
      ['Dancing Queen', 1, '2026-10-15'],
      ['Valerie', 2, '2026-10-01'],
    ]);
  });

  it('is empty when nothing was sung, and leaves out songs never sung', () => {
    expect(statsRows(songs, singStats([]))).toEqual([]);
    expect(statsRows(songs, singStats(sings)).some((r) => r.songId === 13)).toBe(false);
  });

  it('keeps a row with song null for a sing whose song no longer exists', () => {
    const withOrphan = [...sings, { id: 7, songId: 404, venueId: CROWN, date: '2026-11-02' }];
    const rows = statsRows(songs, singStats(withOrphan, CROWN));
    expect(rows[0]).toEqual({ songId: 404, song: null, count: 1, lastSung: '2026-11-02' });
    expect(rows).toHaveLength(3);
  });
});

describe('R8 singsBySong', () => {
  it('groups sings by song, newest first, latest logged first on the same day', () => {
    const extra = [...sings, { id: 9, songId: 12, venueId: CROWN, date: '2026-10-15' }];
    const all = singsBySong(extra);
    expect(all.get(10).map((s) => s.id)).toEqual([3, 1, 4]);
    expect(all.get(12).map((s) => s.id)).toEqual([9, 6, 5]);
    expect(all.has(13)).toBe(false);
  });

  it('filters to one venue', () => {
    const crown = singsBySong(sings, CROWN);
    expect(crown.get(10).map((s) => s.date)).toEqual(['2026-10-01', '2026-09-20']);
    expect(crown.has(12)).toBe(false);
    expect(singsBySong([], CROWN)).toEqual(new Map());
  });

  it('does not reorder the input', () => {
    const copy = structuredClone(sings);
    singsBySong(sings);
    expect(sings).toEqual(copy);
  });
});

describe('R40 sortVenues', () => {
  it('sorts by name ignoring case, without changing the input', () => {
    const input = [{ id: 1, name: 'the Crown' }, { id: 2, name: 'Anchor' }, { id: 3, name: 'Bar 7' }];
    const copy = structuredClone(input);
    expect(sortVenues(input).map((v) => v.name)).toEqual(['Anchor', 'Bar 7', 'the Crown']);
    expect(input).toEqual(copy);
  });
});

describe('R40 venueNameError', () => {
  const venues = [{ id: 1, name: 'The Crown' }, { id: 2, name: 'Anchor' }];

  it('accepts a new name', () => {
    expect(venueNameError('Bar 7', venues)).toBe('');
    expect(venueNameError('  Bar 7  ', [])).toBe('');
  });

  it('requires a name after trimming', () => {
    expect(venueNameError('', venues)).toBe('Enter a venue name.');
    expect(venueNameError('   ', venues)).toBe('Enter a venue name.');
    expect(venueNameError(null, venues)).toBe('Enter a venue name.');
  });

  it('refuses a name that matches another venue, ignoring case and spaces', () => {
    expect(venueNameError('the crown', venues)).toBe('There is already a venue called “The Crown”.');
    expect(venueNameError('  ANCHOR ', venues)).toBe('There is already a venue called “Anchor”.');
  });

  it('lets a venue keep its own name or change its case when renamed', () => {
    expect(venueNameError('The Crown', venues, 1)).toBe('');
    expect(venueNameError('THE CROWN', venues, 1)).toBe('');
    expect(venueNameError('Anchor', venues, 1)).toBe('There is already a venue called “Anchor”.');
  });
});

describe('R40 R56 venueInUseMessage', () => {
  it('is empty when no sing references the venue', () => {
    expect(venueInUseMessage('The Crown', 0)).toBe('');
  });

  it('gives the number of sings with the right plurals', () => {
    expect(venueInUseMessage('The Crown', 1)).toBe(
      'Can\'t delete “The Crown”: 1 sing log entry still uses it. Remove those first.');
    expect(venueInUseMessage('The Crown', 3)).toBe(
      'Can\'t delete “The Crown”: 3 sing log entries still use it. Remove those first.');
  });

  it('ignores setlists labelled for the venue, which no longer hold it up (R56)', () => {
    expect(venueInUseMessage('The Crown', 0, 2)).toBe('');
    expect(venueInUseMessage('The Crown', 2, 5)).not.toContain('setlist');
  });
});

describe('R56 describeVenueDelete', () => {
  it('asks plainly when no setlist is labelled for the venue', () => {
    expect(describeVenueDelete('The Crown', 0)).toBe('Delete the venue “The Crown”?');
    expect(describeVenueDelete('The Crown')).toBe('Delete the venue “The Crown”?');
  });

  it('says the labelled setlists will become Any venue', () => {
    expect(describeVenueDelete('The Crown', 1))
      .toBe('Delete the venue “The Crown”? 1 setlist is labelled for it; it will become Any venue.');
    expect(describeVenueDelete('The Crown', 3))
      .toBe('Delete the venue “The Crown”? 3 setlists are labelled for it; they will become Any venue.');
  });
});
