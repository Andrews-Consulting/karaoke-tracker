import { describe, it, expect } from 'vitest';
import {
  currentSetlistKey, nextSetlistKey, tonightListName, uniqueSetlistName, venueSetlists, currentSetlistFor,
  setMenuGroups, nextSetlistFor, putBackOnTop, dateLabel, groupSingsByDate,
} from '../../js/lib/night.js';

const VIKING = 1;
const CROWN = 2;

const setlists = [
  { id: 5, name: 'viking', venueId: VIKING, songIds: [] },
  { id: 6, name: 'Next time', venueId: VIKING, songIds: [12] },
  { id: 7, name: 'Abba night', venueId: VIKING, songIds: [10, 11] },
  { id: 8, name: 'The Crown', venueId: CROWN, songIds: [] },
  { id: 9, name: 'Anywhere', venueId: null, songIds: [10] },
];

describe('R47 R49 R56 meta keys', () => {
  it('names the current set and Next time records per venue', () => {
    expect(currentSetlistKey(VIKING)).toBe('currentSetlist:1');
    expect(nextSetlistKey(CROWN)).toBe('nextTimeSetlist:2');
  });

  it('names Overall\'s current set record', () => {
    expect(currentSetlistKey(null)).toBe('currentSetlist:overall');
    expect(currentSetlistKey(undefined)).toBe('currentSetlist:overall');
  });
});

describe('R47 tonightListName', () => {
  it('is the local day, date and month', () => {
    expect(tonightListName(new Date(2025, 10, 14, 21, 30))).toBe('Fri 14 Nov');
    expect(tonightListName(new Date(2026, 10, 12, 0, 0))).toBe('Thu 12 Nov');
    expect(tonightListName(new Date(2027, 0, 3, 23, 59))).toBe('Sun 3 Jan');
  });

  it('uses the local day late in the evening, not the UTC one', () => {
    const late = new Date(2026, 4, 31, 23, 45);
    expect(tonightListName(late)).toBe('Sun 31 May');
  });
});

describe('R47 uniqueSetlistName', () => {
  it('keeps a name nobody uses, trimmed', () => {
    expect(uniqueSetlistName('Fri 14 Nov', setlists)).toBe('Fri 14 Nov');
    expect(uniqueSetlistName('  Friday  ', setlists)).toBe('Friday');
    expect(uniqueSetlistName('Viking', [])).toBe('Viking');
    expect(uniqueSetlistName('Viking', undefined)).toBe('Viking');
  });

  it('adds (2) when the name is taken, ignoring case', () => {
    expect(uniqueSetlistName('Viking', setlists)).toBe('Viking (2)');
    expect(uniqueSetlistName('NEXT TIME', setlists)).toBe('NEXT TIME (2)');
  });

  it('counts on past the numbers already taken', () => {
    const taken = [
      { id: 1, name: 'Fri 14 Nov' },
      { id: 2, name: 'Fri 14 Nov (2)' },
      { id: 3, name: 'fri 14 nov (3)' },
    ];
    expect(uniqueSetlistName('Fri 14 Nov', taken)).toBe('Fri 14 Nov (4)');
    expect(uniqueSetlistName('Fri 14 Nov', taken.slice(0, 2))).toBe('Fri 14 Nov (3)');
    // A gap is filled first.
    expect(uniqueSetlistName('Fri 14 Nov', [taken[0], taken[2]])).toBe('Fri 14 Nov (2)');
  });
});

describe('R47 venueSetlists', () => {
  it('lists only the setlists labelled for the venue, by name', () => {
    expect(venueSetlists(setlists, VIKING).map((s) => s.id)).toEqual([7, 6, 5]);
    expect(venueSetlists(setlists, CROWN).map((s) => s.id)).toEqual([8]);
    expect(venueSetlists(setlists, 99)).toEqual([]);
  });

  it('lists the setlists for any venue when given no venue', () => {
    expect(venueSetlists(setlists, null).map((s) => s.id)).toEqual([9]);
    expect(venueSetlists([{ id: 1, name: 'x', songIds: [] }], null).map((s) => s.id)).toEqual([1]);
  });
});

describe('R47 R56 currentSetlistFor', () => {
  const ANCHOR = 3; // a venue with no setlists labelled for it
  const noAnyVenue = setlists.filter((s) => s.venueId != null);

  it('opens the remembered set', () => {
    expect(currentSetlistFor(setlists, VIKING, 5).id).toBe(5);
    expect(currentSetlistFor(setlists, VIKING, 6).id).toBe(6);
  });

  it('opens a remembered set labelled for another venue or for any venue (R56)', () => {
    expect(currentSetlistFor(setlists, CROWN, 7).id).toBe(7);
    expect(currentSetlistFor(setlists, VIKING, 9).id).toBe(9);
    expect(currentSetlistFor(setlists, ANCHOR, 8).id).toBe(8);
  });

  it('falls back to the first set by name labelled for the venue when the remembered one is gone', () => {
    expect(currentSetlistFor(setlists, VIKING, 42).id).toBe(7);
    expect(currentSetlistFor(setlists, VIKING, undefined).id).toBe(7);
    expect(currentSetlistFor(setlists, VIKING, null).id).toBe(7);
    expect(currentSetlistFor(setlists, CROWN, 42).id).toBe(8);
  });

  it('then to the first set by name for any venue', () => {
    expect(currentSetlistFor(setlists, ANCHOR, undefined).id).toBe(9);
    const two = [...setlists, { id: 10, name: 'aardvark', venueId: null, songIds: [] }];
    expect(currentSetlistFor(two, ANCHOR, 42).id).toBe(10);
  });

  it('never falls back to a set labelled for another venue: null, so one is created', () => {
    expect(currentSetlistFor(noAnyVenue, ANCHOR, undefined)).toBeNull();
    expect(currentSetlistFor(noAnyVenue, ANCHOR, 42)).toBeNull();
    expect(currentSetlistFor([], VIKING, undefined)).toBeNull();
    expect(currentSetlistFor(undefined, VIKING, undefined)).toBeNull();
  });

  it('under Overall opens the remembered set, whatever its label', () => {
    expect(currentSetlistFor(setlists, null, 6).id).toBe(6);
    expect(currentSetlistFor(setlists, null, 9).id).toBe(9);
  });

  it('under Overall falls back to the first for any venue, then the first of all', () => {
    expect(currentSetlistFor(setlists, null, undefined).id).toBe(9);
    expect(currentSetlistFor(setlists, null, 42).id).toBe(9);
    expect(currentSetlistFor(noAnyVenue, null, undefined).id).toBe(7); // 'Abba night' first by name
  });

  it('under Overall is null when there are no setlists at all', () => {
    expect(currentSetlistFor([], null, undefined)).toBeNull();
    expect(currentSetlistFor([], null, 9)).toBeNull();
  });
});

describe('R56 setMenuGroups', () => {
  const venues = [{ id: VIKING, name: 'Viking' }, { id: CROWN, name: 'The Crown' }, { id: 3, name: 'Anchor' }];
  const withMore = [...setlists, { id: 10, name: 'Best of', venueId: null, songIds: [] }];

  it('at a venue: for this venue, any venue, then other venues, each by name', () => {
    expect(setMenuGroups(withMore, venues, VIKING)).toEqual([
      { label: 'For Viking', items: [{ id: 7, text: 'Abba night' }, { id: 6, text: 'Next time' }, { id: 5, text: 'viking' }] },
      { label: 'Any venue', items: [{ id: 9, text: 'Anywhere' }, { id: 10, text: 'Best of' }] },
      { label: 'Other venues', items: [{ id: 8, text: 'The Crown · The Crown' }] },
    ]);
  });

  it('leaves out empty groups', () => {
    expect(setMenuGroups(setlists, venues, 3).map((g) => g.label)).toEqual(['Any venue', 'Other venues']);
    expect(setMenuGroups(setlists.filter((s) => s.venueId === CROWN), venues, CROWN)).toEqual([
      { label: 'For The Crown', items: [{ id: 8, text: 'The Crown' }] },
    ]);
    expect(setMenuGroups([], venues, VIKING)).toEqual([]);
  });

  it('under Overall: any venue, then every labelled list with its venue', () => {
    expect(setMenuGroups(setlists, venues, null)).toEqual([
      { label: 'Any venue', items: [{ id: 9, text: 'Anywhere' }] },
      {
        label: 'For a venue',
        items: [
          { id: 7, text: 'Abba night · Viking' },
          { id: 6, text: 'Next time · Viking' },
          { id: 8, text: 'The Crown · The Crown' },
          { id: 5, text: 'viking · Viking' },
        ],
      },
    ]);
  });

  it('names a venue that no longer exists as unknown', () => {
    const orphan = [{ id: 1, name: 'Lost', venueId: 99, songIds: [] }];
    expect(setMenuGroups(orphan, venues, VIKING)).toEqual([{ label: 'Other venues', items: [{ id: 1, text: 'Lost · Unknown venue' }] }]);
    expect(setMenuGroups(orphan, [], 99)[0].label).toBe('For this venue');
  });
});

describe('R49 nextSetlistFor', () => {
  it('finds the remembered Next time list, whatever it is called now', () => {
    expect(nextSetlistFor(setlists, VIKING, 6).id).toBe(6);
    const renamed = setlists.map((s) => (s.id === 6 ? { ...s, name: 'Maybe later' } : s));
    expect(nextSetlistFor(renamed, VIKING, 6).name).toBe('Maybe later');
  });

  it('is null on first use', () => {
    expect(nextSetlistFor(setlists, VIKING, undefined)).toBeNull();
    expect(nextSetlistFor(setlists, VIKING, null)).toBeNull();
  });

  it('is null when the remembered list was deleted', () => {
    expect(nextSetlistFor(setlists, VIKING, 42)).toBeNull();
    expect(nextSetlistFor([], VIKING, 6)).toBeNull();
  });

  it('is null when the remembered list now belongs to another venue', () => {
    expect(nextSetlistFor(setlists, CROWN, 6)).toBeNull();
  });

  it('never picks a list by its name alone', () => {
    expect(nextSetlistFor(setlists, VIKING, 5).id).toBe(5);
    expect(nextSetlistFor(setlists, null, 6)).toBeNull();
  });
});

describe('R50 putBackOnTop', () => {
  const set = { id: 5, name: 'Viking', venueId: VIKING, songIds: [10, 11, 12] };

  it('puts the song first and keeps the rest in order', () => {
    expect(putBackOnTop(set, 13)).toEqual({ ...set, songIds: [13, 10, 11, 12] });
  });

  it('moves a song already in the set to the top rather than adding it twice', () => {
    expect(putBackOnTop(set, 12).songIds).toEqual([12, 10, 11]);
    expect(putBackOnTop(set, 10).songIds).toEqual([10, 11, 12]);
  });

  it('works on an empty set and does not change its input', () => {
    expect(putBackOnTop({ ...set, songIds: [] }, 10).songIds).toEqual([10]);
    expect(putBackOnTop({ id: 1, name: 'x', venueId: VIKING }, 10).songIds).toEqual([10]);
    putBackOnTop(set, 13);
    expect(set.songIds).toEqual([10, 11, 12]);
  });
});

describe('R50 dateLabel', () => {
  it('says Today for today and the date otherwise', () => {
    expect(dateLabel('2026-11-12', '2026-11-12')).toBe('Today');
    expect(dateLabel('2026-11-11', '2026-11-12')).toBe('2026-11-11');
    expect(dateLabel('2026-11-13', '2026-11-12')).toBe('2026-11-13');
  });
});

describe('R50 groupSingsByDate', () => {
  const today = '2026-11-12';
  const songs = [
    { id: 10, title: 'Valerie', artist: 'Amy Winehouse' },
    { id: 11, title: 'Dancing Queen', artist: 'ABBA' },
    { id: 12, title: 'Mr. Brightside', artist: 'The Killers' },
  ];
  const songsById = new Map(songs.map((s) => [s.id, s]));
  const sings = [
    { id: 1, songId: 10, venueId: VIKING, date: '2026-10-01' },
    { id: 2, songId: 11, venueId: VIKING, date: today },
    { id: 3, songId: 12, venueId: CROWN, date: today }, // another venue
    { id: 4, songId: 99, venueId: VIKING, date: today }, // the song is gone
    { id: 5, songId: 10, venueId: VIKING, date: today },
    { id: 6, songId: 12, venueId: VIKING, date: '2026-10-24' },
    { id: 7, songId: 11, venueId: VIKING, date: '2026-10-01' },
  ];

  it('groups the venue\'s sings by date, newest first, labelling today', () => {
    const groups = groupSingsByDate(sings, songsById, VIKING, today);
    expect(groups.map((g) => [g.date, g.label])).toEqual([
      [today, 'Today'],
      ['2026-10-24', '2026-10-24'],
      ['2026-10-01', '2026-10-01'],
    ]);
  });

  it('lists the most recently logged first within a day, with the song', () => {
    const [todayGroup, , oldGroup] = groupSingsByDate(sings, songsById, VIKING, today);
    expect(todayGroup.entries.map((e) => e.sing.id)).toEqual([5, 2]);
    expect(todayGroup.entries[0].song).toBe(songsById.get(10));
    expect(oldGroup.entries.map((e) => [e.sing.id, e.song.title])).toEqual([[7, 'Dancing Queen'], [1, 'Valerie']]);
  });

  it('leaves out sings whose song no longer exists, and other venues', () => {
    const all = groupSingsByDate(sings, songsById, VIKING, today).flatMap((g) => g.entries.map((e) => e.sing.id));
    expect(all).not.toContain(4);
    expect(all).not.toContain(3);
    expect(all).toHaveLength(5);
    expect(groupSingsByDate(sings, songsById, CROWN, today)).toEqual([
      { date: today, label: 'Today', entries: [{ sing: sings[2], song: songsById.get(12) }] },
    ]);
  });

  it('drops a date whose only sings are of deleted songs', () => {
    const groups = groupSingsByDate([{ id: 1, songId: 99, venueId: VIKING, date: today }], songsById, VIKING, today);
    expect(groups).toEqual([]);
  });

  it('takes an array of songs too, and copes with nothing', () => {
    expect(groupSingsByDate(sings, songs, VIKING, today)).toEqual(groupSingsByDate(sings, songsById, VIKING, today));
    expect(groupSingsByDate([], songsById, VIKING, today)).toEqual([]);
    expect(groupSingsByDate(undefined, undefined, VIKING, today)).toEqual([]);
  });

  it('does not reorder its input', () => {
    const copy = [...sings];
    groupSingsByDate(sings, songsById, VIKING, today);
    expect(sings).toEqual(copy);
  });
});
