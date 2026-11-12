import { describe, it, expect } from 'vitest';
import {
  setlistNameError, sortSetlists, venueValue, venueIdFromValue, venueOptions, venueLabel, venueLine,
  makeSetlist, updateSetlist, describeSetlistDelete, addSongId, removeSongId, setlistSongs,
  pickableSongs, sungFlags,
} from '../../js/lib/setlist.js';

const CROWN = 1;
const ANCHOR = 2;

const venues = [
  { id: CROWN, name: 'The Crown' },
  { id: ANCHOR, name: 'anchor' },
];

const songs = [
  { id: 10, title: 'Valerie', artist: 'Amy Winehouse' },
  { id: 11, title: 'Dancing Queen', artist: 'ABBA' },
  { id: 12, title: 'Mr. Brightside', artist: 'The Killers' },
  { id: 13, title: 'Back to Black', artist: 'Amy Winehouse' },
];

const friday = { id: 5, name: 'Friday', venueId: CROWN, songIds: [12, 10, 11] };
const general = { id: 6, name: 'Anywhere', venueId: null, songIds: [10, 13] };

describe('R14 setlistNameError', () => {
  const setlists = [friday, general];

  it('refuses an empty or blank name', () => {
    for (const name of ['', '   ', null, undefined]) {
      expect(setlistNameError(name, setlists)).toBe('Enter a setlist name.');
    }
  });

  it('refuses a duplicate name, ignoring case and surrounding spaces', () => {
    expect(setlistNameError('  friDAY ', setlists)).toBe('There is already a setlist called “Friday”.');
    expect(setlistNameError('ANYWHERE', setlists)).toBe('There is already a setlist called “Anywhere”.');
  });

  it('accepts a new name', () => {
    expect(setlistNameError('Saturday', setlists)).toBe('');
    expect(setlistNameError('Saturday', [])).toBe('');
  });

  it('lets a setlist keep its own name or change its case when renamed', () => {
    expect(setlistNameError('Friday', setlists, friday.id)).toBe('');
    expect(setlistNameError(' FRIDAY ', setlists, friday.id)).toBe('');
  });

  it('still refuses another setlist\'s name when renaming', () => {
    expect(setlistNameError('anywhere', setlists, friday.id)).toBe('There is already a setlist called “Anywhere”.');
  });
});

describe('R14 sortSetlists', () => {
  it('sorts by name ignoring case, without changing the input', () => {
    const input = [
      { id: 1, name: 'zebra' }, { id: 2, name: 'Apple' }, { id: 3, name: 'banana' }, { id: 4, name: 'Échelle' },
    ];
    const copy = structuredClone(input);
    expect(sortSetlists(input).map((s) => s.name)).toEqual(['Apple', 'banana', 'Échelle', 'zebra']);
    expect(input).toEqual(copy);
  });

  it('keeps ties in id order', () => {
    expect(sortSetlists([{ id: 9, name: 'Same' }, { id: 3, name: 'same' }]).map((s) => s.id)).toEqual([3, 9]);
  });

  it('handles an empty list', () => {
    expect(sortSetlists([])).toEqual([]);
  });
});

describe('R39 venue values', () => {
  it('maps General to an empty value and back to null', () => {
    expect(venueValue(null)).toBe('');
    expect(venueValue(undefined)).toBe('');
    expect(venueIdFromValue('')).toBe(null);
    expect(venueIdFromValue('  ')).toBe(null);
    expect(venueIdFromValue(null)).toBe(null);
  });

  it('maps a venue id to text and back to a number', () => {
    expect(venueValue(7)).toBe('7');
    expect(venueIdFromValue('7')).toBe(7);
    expect(venueIdFromValue(venueValue(CROWN))).toBe(CROWN);
  });

  it('treats a value that is not a number as General', () => {
    expect(venueIdFromValue('abc')).toBe(null);
  });
});

describe('R39 venueOptions', () => {
  it('lists General first, then venues by name ignoring case', () => {
    expect(venueOptions(venues)).toEqual([
      { value: '', label: 'General' },
      { value: '2', label: 'anchor' },
      { value: '1', label: 'The Crown' },
    ]);
  });

  it('offers only General when there are no venues', () => {
    expect(venueOptions([])).toEqual([{ value: '', label: 'General' }]);
  });

  it('keeps a missing current venue as "Unknown venue"', () => {
    expect(venueOptions(venues, 99).at(-1)).toEqual({ value: '99', label: 'Unknown venue' });
    expect(venueOptions(venues, CROWN)).toHaveLength(3);
    expect(venueOptions(venues, null)).toHaveLength(3);
  });
});

describe('R39 venueLabel and venueLine', () => {
  it('names a general setlist', () => {
    expect(venueLabel(general, venues)).toBe('General');
    expect(venueLine(general, venues)).toBe('General setlist');
  });

  it('names a venue setlist after its venue', () => {
    expect(venueLabel(friday, venues)).toBe('The Crown');
    expect(venueLine(friday, venues)).toBe('At The Crown');
  });

  it('says when the venue no longer exists', () => {
    const orphan = { ...friday, venueId: 99 };
    expect(venueLabel(orphan, venues)).toBe('Unknown venue');
    expect(venueLine(orphan, venues)).toBe('At a venue that no longer exists');
    expect(venueLabel(orphan, [])).toBe('Unknown venue');
  });

  it('treats an undefined venueId as general', () => {
    expect(venueLabel({ name: 'x', songIds: [] }, venues)).toBe('General');
  });
});

describe('R14 R39 makeSetlist and updateSetlist', () => {
  it('builds a trimmed, empty setlist', () => {
    expect(makeSetlist('  Friday  ', CROWN)).toEqual({ name: 'Friday', venueId: CROWN, songIds: [] });
    expect(makeSetlist('Anywhere')).toEqual({ name: 'Anywhere', venueId: null, songIds: [] });
    expect(makeSetlist('Anywhere', undefined)).toEqual({ name: 'Anywhere', venueId: null, songIds: [] });
  });

  it('changes name and venue, keeping id and songs', () => {
    const updated = updateSetlist(friday, ' Late Friday ', null);
    expect(updated).toEqual({ id: 5, name: 'Late Friday', venueId: null, songIds: [12, 10, 11] });
    expect(updateSetlist(general, 'Anywhere', ANCHOR).venueId).toBe(ANCHOR);
    expect(friday.name).toBe('Friday');
  });

  it('drops repeated song ids from a damaged record', () => {
    expect(updateSetlist({ id: 1, name: 'x', venueId: null, songIds: [3, 3, 4] }, 'x').songIds).toEqual([3, 4]);
  });
});

describe('R14 describeSetlistDelete', () => {
  it('says how many songs the setlist has, with the right plural', () => {
    expect(describeSetlistDelete(friday))
      .toBe('Delete the setlist “Friday”? It has 3 songs. Your song library is not changed.');
    expect(describeSetlistDelete({ ...friday, songIds: [10] }))
      .toBe('Delete the setlist “Friday”? It has 1 song. Your song library is not changed.');
  });

  it('says when it is empty', () => {
    expect(describeSetlistDelete({ ...friday, songIds: [] })).toBe('Delete the setlist “Friday”? It has no songs.');
    expect(describeSetlistDelete({ name: 'Bare' })).toBe('Delete the setlist “Bare”? It has no songs.');
  });

  it('does not count a repeated id twice', () => {
    expect(describeSetlistDelete({ name: 'X', songIds: [1, 1] })).toContain('It has 1 song.');
  });
});

describe('R15 addSongId', () => {
  it('adds to the end, keeping the order, without changing the input', () => {
    const next = addSongId(friday, 13);
    expect(next.songIds).toEqual([12, 10, 11, 13]);
    expect(next).not.toBe(friday);
    expect(next.id).toBe(friday.id);
    expect(friday.songIds).toEqual([12, 10, 11]);
  });

  it('is a no-op for a song already in the setlist', () => {
    expect(addSongId(friday, 10).songIds).toEqual([12, 10, 11]);
  });

  it('adds to an empty or missing songIds list', () => {
    expect(addSongId({ name: 'x', venueId: null, songIds: [] }, 4).songIds).toEqual([4]);
    expect(addSongId({ name: 'x', venueId: null }, 4).songIds).toEqual([4]);
  });

  it('never leaves a repeated id behind', () => {
    expect(addSongId({ songIds: [1, 2, 1] }, 3).songIds).toEqual([1, 2, 3]);
  });
});

describe('R15 removeSongId', () => {
  it('removes the song and keeps the rest in order', () => {
    expect(removeSongId(friday, 10).songIds).toEqual([12, 11]);
    expect(removeSongId(friday, 12).songIds).toEqual([10, 11]);
    expect(friday.songIds).toEqual([12, 10, 11]);
  });

  it('is a no-op for a song not in the setlist', () => {
    expect(removeSongId(friday, 99).songIds).toEqual([12, 10, 11]);
    expect(removeSongId({ name: 'x' }, 1).songIds).toEqual([]);
  });

  it('keeps order across adds and removes', () => {
    let list = makeSetlist('x');
    for (const id of [1, 2, 3, 4]) list = addSongId(list, id);
    list = removeSongId(list, 2);
    list = addSongId(list, 2);
    list = addSongId(list, 3);
    expect(list.songIds).toEqual([1, 3, 4, 2]);
  });
});

describe('R15 setlistSongs', () => {
  const byId = new Map(songs.map((s) => [s.id, s]));

  it('returns the songs in setlist order', () => {
    expect(setlistSongs(friday, byId).map((s) => s.id)).toEqual([12, 10, 11]);
  });

  it('skips ids of songs that no longer exist', () => {
    expect(setlistSongs({ songIds: [99, 10, 98, 11] }, byId).map((s) => s.id)).toEqual([10, 11]);
  });

  it('accepts an array of songs as well as a Map', () => {
    expect(setlistSongs(general, songs).map((s) => s.title)).toEqual(['Valerie', 'Back to Black']);
  });

  it('handles an empty setlist', () => {
    expect(setlistSongs({ songIds: [] }, byId)).toEqual([]);
    expect(setlistSongs({}, byId)).toEqual([]);
  });
});

describe('R15 pickableSongs', () => {
  it('lists every song not already in the setlist, by title', () => {
    const { shown, total } = pickableSongs(songs, friday, '');
    expect(shown.map((s) => s.title)).toEqual(['Back to Black']);
    expect(total).toBe(1);
  });

  it('lists everything for an empty setlist, sorted by title', () => {
    expect(pickableSongs(songs, makeSetlist('x')).shown.map((s) => s.id)).toEqual([13, 11, 12, 10]);
  });

  it('filters by title or artist, ignoring case', () => {
    const empty = makeSetlist('x');
    expect(pickableSongs(songs, empty, 'AMY').shown.map((s) => s.title)).toEqual(['Back to Black', 'Valerie']);
    expect(pickableSongs(songs, empty, 'queen').shown.map((s) => s.id)).toEqual([11]);
    expect(pickableSongs(songs, general, 'amy')).toEqual({ shown: [], total: 0 });
  });

  it('caps the list but reports how many matched', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, title: `Track ${String(i + 1).padStart(2, '0')}`, artist: 'Band' }));
    const { shown, total } = pickableSongs(many, { songIds: [1] }, 'track');
    expect(shown).toHaveLength(20);
    expect(total).toBe(29);
    expect(shown[0].title).toBe('Track 02');
    expect(pickableSongs(many, { songIds: [] }, '', 5).shown).toHaveLength(5);
  });

  it('handles no songs at all', () => {
    expect(pickableSongs([], friday, 'x')).toEqual({ shown: [], total: 0 });
  });
});

describe('R43 sungFlags', () => {
  const sings = [
    { id: 1, songId: 10, venueId: CROWN, date: '2026-10-01' },
    { id: 2, songId: 10, venueId: CROWN, date: '2026-11-03' },
    { id: 3, songId: 10, venueId: CROWN, date: '2026-09-20' },
    { id: 4, songId: 11, venueId: ANCHOR, date: '2026-11-10' },
    { id: 5, songId: 13, venueId: CROWN, date: '2026-08-01' },
  ];

  it('gives the last date each setlist song was sung at its venue', () => {
    expect(sungFlags(friday, sings)).toEqual(new Map([[10, '2026-11-03']]));
  });

  it('ignores sings at other venues and songs not in the setlist', () => {
    const flags = sungFlags(friday, sings);
    expect(flags.has(11)).toBe(false); // sung, but at Anchor
    expect(flags.has(13)).toBe(false); // sung at The Crown, but not in this setlist
    expect(flags.has(12)).toBe(false); // never sung
  });

  it('is empty for a general setlist', () => {
    expect(sungFlags(general, sings)).toEqual(new Map());
  });

  it('is empty when nothing has been sung at the venue', () => {
    expect(sungFlags({ ...friday, venueId: 42 }, sings)).toEqual(new Map());
    expect(sungFlags(friday, [])).toEqual(new Map());
  });

  it('picks the latest of two dates whatever order they were logged in', () => {
    const two = [
      { id: 1, songId: 12, venueId: CROWN, date: '2026-11-01' },
      { id: 2, songId: 12, venueId: CROWN, date: '2025-12-31' },
    ];
    expect(sungFlags(friday, two).get(12)).toBe('2026-11-01');
    expect(sungFlags(friday, [...two].reverse()).get(12)).toBe('2026-11-01');
  });
});
