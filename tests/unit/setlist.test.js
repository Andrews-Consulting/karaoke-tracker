import { describe, it, expect } from 'vitest';
import {
  setlistNameError, sortSetlists, venueValue, venueIdFromValue, venueOptions, venueLabel,
  makeSetlist, updateSetlist, describeSetlistDelete, addSongId, removeSongId, setlistSongs,
  sungFlags, mergePlan, describeMerge, describeMerged,
} from '../../js/lib/setlist.js';
import { moveSongId, moveSongIdBy, mixByGenre, mixByDecade, formatMix } from '../../js/lib/setlist.js';
import {
  suggestCount, roundRobin, suggestCandidates, suggestSongs, describeSuggestion,
  tonightSing, findTonightSing, sungOn,
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

describe('R56 venue values', () => {
  it('maps any venue to an empty value and back to null', () => {
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

  it('treats a value that is not a number as any venue', () => {
    expect(venueIdFromValue('abc')).toBe(null);
  });
});

describe('R56 venueOptions', () => {
  it('lists Any venue first, then venues by name ignoring case', () => {
    expect(venueOptions(venues)).toEqual([
      { value: '', label: 'Any venue' },
      { value: '2', label: 'anchor' },
      { value: '1', label: 'The Crown' },
    ]);
  });

  it('offers only Any venue when there are no venues', () => {
    expect(venueOptions([])).toEqual([{ value: '', label: 'Any venue' }]);
  });

  it('keeps a missing current venue as "Unknown venue"', () => {
    expect(venueOptions(venues, 99).at(-1)).toEqual({ value: '99', label: 'Unknown venue' });
    expect(venueOptions(venues, CROWN)).toHaveLength(3);
    expect(venueOptions(venues, null)).toHaveLength(3);
  });
});

describe('R56 venueLabel', () => {
  it('says Any venue for a setlist without a label', () => {
    expect(venueLabel(general, venues)).toBe('Any venue');
  });

  it('says which venue a labelled setlist is for', () => {
    expect(venueLabel(friday, venues)).toBe('For The Crown');
    expect(venueLabel({ ...friday, venueId: ANCHOR }, venues)).toBe('For anchor');
  });

  it('says when the venue no longer exists', () => {
    const orphan = { ...friday, venueId: 99 };
    expect(venueLabel(orphan, venues)).toBe('For an unknown venue');
    expect(venueLabel(orphan, [])).toBe('For an unknown venue');
  });

  it('treats an undefined venueId as any venue', () => {
    expect(venueLabel({ name: 'x', songIds: [] }, venues)).toBe('Any venue');
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

describe('R59 mergePlan', () => {
  const nextTime = { id: 7, name: 'Next time', venueId: ANCHOR, songIds: [13, 11] };

  it('appends the source\'s songs to the target\'s end, in order, and empties the source', () => {
    const source = { id: 8, name: 'Saturday', venueId: null, songIds: [12, 10] };
    expect(mergePlan(source, nextTime)).toEqual({
      target: { ...nextTime, songIds: [13, 11, 12, 10] },
      source: { ...source, songIds: [] },
      moved: 2,
      skipped: 0,
    });
  });

  it('skips songs already in the target and counts them', () => {
    const plan = mergePlan(friday, nextTime); // friday is [12, 10, 11]; 11 is already there
    expect(plan.target.songIds).toEqual([13, 11, 12, 10]);
    expect(plan.source.songIds).toEqual([]);
    expect([plan.moved, plan.skipped]).toEqual([2, 1]);
  });

  it('keeps everything else about both setlists, including their labels', () => {
    const plan = mergePlan(friday, nextTime);
    expect(plan.target).toMatchObject({ id: 7, name: 'Next time', venueId: ANCHOR });
    expect(plan.source).toMatchObject({ id: 5, name: 'Friday', venueId: CROWN });
  });

  it('moves nothing from an empty source', () => {
    const plan = mergePlan({ id: 8, name: 'Empty', venueId: null, songIds: [] }, nextTime);
    expect(plan.target.songIds).toEqual([13, 11]);
    expect(plan.source.songIds).toEqual([]);
    expect([plan.moved, plan.skipped]).toEqual([0, 0]);
    expect(mergePlan({ id: 8, name: 'No ids' }, nextTime).moved).toBe(0);
  });

  it('with songsById, drops ids of songs that no longer exist instead of moving them', () => {
    const source = { id: 8, name: 'Saturday', venueId: null, songIds: [99, 12, 98] };
    const plan = mergePlan(source, nextTime, songs);
    expect(plan.target.songIds).toEqual([13, 11, 12]);
    expect(plan.source.songIds).toEqual([]);
    expect([plan.moved, plan.skipped]).toEqual([1, 0]);
  });

  it('changes nothing when a setlist is merged into itself', () => {
    const plan = mergePlan(friday, { ...friday });
    expect(plan.target.songIds).toEqual([12, 10, 11]);
    expect(plan.source.songIds).toEqual([12, 10, 11]);
    expect([plan.moved, plan.skipped]).toEqual([0, 0]);
  });

  it('does not change its inputs', () => {
    const source = structuredClone(friday);
    const target = structuredClone(nextTime);
    mergePlan(source, target);
    expect(source).toEqual(friday);
    expect(target).toEqual(nextTime);
  });
});

describe('R59 describeMerge and describeMerged', () => {
  const source = { id: 8, name: 'Friday', songIds: [] };
  const target = { id: 7, name: 'Next time', songIds: [] };

  it('asks before moving the songs, saying the source will be left empty', () => {
    expect(describeMerge(source, target, { moved: 3, skipped: 0 }))
      .toBe('Move 3 songs from “Friday” to the end of “Next time”? “Friday” will be left empty.');
    expect(describeMerge(source, target, { moved: 1, skipped: 0 }))
      .toBe('Move 1 song from “Friday” to the end of “Next time”? “Friday” will be left empty.');
  });

  it('mentions songs already in the target', () => {
    expect(describeMerge(source, target, { moved: 2, skipped: 1 }))
      .toBe('Move 2 songs from “Friday” to the end of “Next time”? 1 song is already there. “Friday” will be left empty.');
    expect(describeMerge(source, target, { moved: 2, skipped: 3 })).toContain(' 3 songs are already there.');
  });

  it('says so when every song is already in the target', () => {
    expect(describeMerge(source, target, { moved: 0, skipped: 2 }))
      .toBe('All 2 songs in “Friday” are already in “Next time”. Empty “Friday”?');
    expect(describeMerge(source, target, { moved: 0, skipped: 1 }))
      .toBe('The song in “Friday” is already in “Next time”. Empty “Friday”?');
  });

  it('reports what moved on the target\'s screen', () => {
    expect(describeMerged(source, { moved: 3, skipped: 0 })).toBe('Moved 3 songs from “Friday”.');
    expect(describeMerged(source, { moved: 1, skipped: 2 })).toBe('Moved 1 song from “Friday”. 2 were already here.');
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

describe('R16 moveSongId', () => {
  const four = { id: 7, name: 'Four', venueId: null, songIds: [1, 2, 3, 4] };

  it('moves a song to a new position, keeping the others in order, without changing the input', () => {
    const next = moveSongId(four, 4, 1);
    expect(next.songIds).toEqual([1, 4, 2, 3]);
    expect(next).not.toBe(four);
    expect(next).toMatchObject({ id: 7, name: 'Four', venueId: null });
    expect(four.songIds).toEqual([1, 2, 3, 4]);
    expect(moveSongId(four, 1, 2).songIds).toEqual([2, 3, 1, 4]);
  });

  it('moves to either end', () => {
    expect(moveSongId(four, 3, 0).songIds).toEqual([3, 1, 2, 4]);
    expect(moveSongId(four, 2, 3).songIds).toEqual([1, 3, 4, 2]);
  });

  it('clamps an index past either end to that end', () => {
    expect(moveSongId(four, 3, -5).songIds).toEqual([3, 1, 2, 4]);
    expect(moveSongId(four, 2, 99).songIds).toEqual([1, 3, 4, 2]);
    expect(moveSongId(four, 2, Infinity).songIds).toEqual([1, 3, 4, 2]);
  });

  it('is a no-op for an unknown id, the same index or an index that is not a number', () => {
    expect(moveSongId(four, 99, 0).songIds).toEqual([1, 2, 3, 4]);
    expect(moveSongId(four, 2, 1).songIds).toEqual([1, 2, 3, 4]);
    expect(moveSongId(four, 2, NaN).songIds).toEqual([1, 2, 3, 4]);
    expect(moveSongId(four, 2, '0').songIds).toEqual([1, 2, 3, 4]);
    expect(moveSongId({ name: 'x' }, 1, 0).songIds).toEqual([]);
  });

  it('never creates a repeated id, and drops one already there', () => {
    expect(moveSongId({ songIds: [1, 2, 1, 3] }, 3, 0).songIds).toEqual([3, 1, 2]);
    expect(moveSongId({ songIds: [1, 2, 1, 3] }, 1, 2).songIds).toEqual([2, 3, 1]);
    for (let to = 0; to < 4; to += 1) {
      const ids = moveSongId(four, 2, to).songIds;
      expect(new Set(ids).size).toBe(4);
      expect([...ids].sort()).toEqual([1, 2, 3, 4]);
    }
  });

  it('with songsById, counts only songs that still exist, as the list on screen does', () => {
    const byId = new Map([1, 2, 3].map((id) => [id, { id, title: `Song ${id}` }]));
    const withGone = { songIds: [9, 1, 2, 8, 3] }; // 9 and 8 were deleted
    expect(moveSongId(withGone, 3, 0, byId).songIds).toEqual([9, 3, 1, 2, 8]);
    expect(moveSongId(withGone, 1, 1, byId).songIds).toEqual([9, 2, 1, 8, 3]);
    expect(moveSongId(withGone, 1, 99, byId).songIds).toEqual([9, 2, 8, 3, 1]);
    expect(moveSongId(withGone, 9, 0, byId).songIds).toEqual([9, 1, 2, 8, 3]); // not shown, so not moved
    expect(moveSongId(withGone, 3, 0, [...byId.values()]).songIds).toEqual([9, 3, 1, 2, 8]);
  });
});

describe('R16 moveSongIdBy', () => {
  const four = { id: 7, name: 'Four', venueId: null, songIds: [1, 2, 3, 4] };

  it('moves a song up or down one place, without changing the input', () => {
    expect(moveSongIdBy(four, 3, -1).songIds).toEqual([1, 3, 2, 4]);
    expect(moveSongIdBy(four, 1, 1).songIds).toEqual([2, 1, 3, 4]);
    expect(four.songIds).toEqual([1, 2, 3, 4]);
  });

  it('moves several places and stops at the ends', () => {
    expect(moveSongIdBy(four, 4, -2).songIds).toEqual([1, 4, 2, 3]);
    expect(moveSongIdBy(four, 3, -10).songIds).toEqual([3, 1, 2, 4]);
    expect(moveSongIdBy(four, 2, 10).songIds).toEqual([1, 3, 4, 2]);
  });

  it('is a no-op for the first song up, the last song down, delta 0 and an unknown id', () => {
    expect(moveSongIdBy(four, 1, -1).songIds).toEqual([1, 2, 3, 4]);
    expect(moveSongIdBy(four, 4, 1).songIds).toEqual([1, 2, 3, 4]);
    expect(moveSongIdBy(four, 2, 0).songIds).toEqual([1, 2, 3, 4]);
    expect(moveSongIdBy(four, 99, -1).songIds).toEqual([1, 2, 3, 4]);
    expect(moveSongIdBy(four, 2, NaN).songIds).toEqual([1, 2, 3, 4]);
    expect(moveSongIdBy({ name: 'x' }, 1, 1)).toEqual({ name: 'x', songIds: [] });
  });

  it('never creates a repeated id', () => {
    let list = four;
    for (const [id, delta] of [[1, 1], [1, 1], [4, -3], [2, 2], [3, -1]]) list = moveSongIdBy(list, id, delta);
    expect(list.songIds).toHaveLength(4);
    expect(new Set(list.songIds).size).toBe(4);
    expect(moveSongIdBy({ songIds: [1, 2, 1] }, 2, -1).songIds).toEqual([2, 1]);
  });

  it('with songsById, steps over ids of songs that no longer exist', () => {
    const byId = new Map([1, 2].map((id) => [id, { id }]));
    const withGone = { songIds: [1, 9, 2] };
    expect(moveSongIdBy(withGone, 2, -1, byId).songIds).toEqual([2, 1, 9]);
    expect(moveSongIdBy(withGone, 1, 1, byId).songIds).toEqual([9, 2, 1]);
    // Without it the deleted id takes a place, so one step up moves past it only.
    expect(moveSongIdBy(withGone, 2, -1).songIds).toEqual([1, 2, 9]);
  });
});

describe('R44 mix by genre and decade', () => {
  const mixSongs = [
    { id: 1, title: 'Hotel California', genre: 'Rock', year: 1976 },
    { id: 2, title: 'Dancing Queen', genre: 'Pop', year: 1976 },
    { id: 3, title: 'Livin\' on a Prayer', genre: ' rock ', year: 1986 },
    { id: 4, title: 'Valerie', genre: 'Soul', year: 2006 },
    { id: 5, title: 'Untitled', genre: '', year: null },
    { id: 6, title: 'Mr. Brightside', genre: 'ROCK', year: 2004 },
    { id: 7, title: 'Back to Black', genre: 'soul', year: 1980 },
    { id: 8, title: 'No fields' },
  ];

  it('counts genres ignoring case, keeping the first spelling, most first and then by name', () => {
    expect(mixByGenre(mixSongs)).toEqual([
      { label: 'Rock', count: 3 },
      { label: 'Soul', count: 2 },
      { label: 'Pop', count: 1 },
      { label: 'No genre', count: 2 },
    ]);
  });

  it('breaks count ties by name ignoring case, and puts No genre last whatever its count', () => {
    const songs = [{ genre: 'soul' }, { genre: 'Funk' }, { genre: '' }, { genre: null }, { genre: '   ' }, { genre: 'disco' }];
    expect(mixByGenre(songs).map((g) => g.label)).toEqual(['disco', 'Funk', 'soul', 'No genre']);
    expect(mixByGenre(songs).at(-1)).toEqual({ label: 'No genre', count: 3 });
  });

  it('counts decades oldest first, with No year last', () => {
    expect(mixByDecade(mixSongs)).toEqual([
      { label: '1970s', count: 2 },
      { label: '1980s', count: 2 },
      { label: '2000s', count: 2 },
      { label: 'No year', count: 2 },
    ]);
    expect(mixByDecade([{ year: 2019 }, { year: 1959 }, { year: 2010 }, { year: '' }]).map((d) => d.label))
      .toEqual(['1950s', '2010s', 'No year']);
  });

  it('leaves out No genre and No year when every song has one', () => {
    const songs = [{ genre: 'Rock', year: 1979 }, { genre: 'Rock', year: 1971 }];
    expect(mixByGenre(songs)).toEqual([{ label: 'Rock', count: 2 }]);
    expect(mixByDecade(songs)).toEqual([{ label: '1970s', count: 2 }]);
  });

  it('is empty for an empty or missing list', () => {
    expect(mixByGenre([])).toEqual([]);
    expect(mixByDecade([])).toEqual([]);
    expect(mixByGenre(undefined)).toEqual([]);
    expect(mixByDecade(null)).toEqual([]);
  });

  it('formats the counts as one line', () => {
    expect(formatMix(mixByGenre(mixSongs))).toBe('Rock 3 · Soul 2 · Pop 1 · No genre 2');
    expect(formatMix(mixByDecade(mixSongs))).toBe('1970s 2 · 1980s 2 · 2000s 2 · No year 2');
    expect(formatMix([{ label: 'Rock', count: 1 }])).toBe('Rock 1');
    expect(formatMix([])).toBe('');
  });

  it('does not change its input', () => {
    const copy = structuredClone(mixSongs);
    mixByGenre(mixSongs);
    mixByDecade(mixSongs);
    expect(mixSongs).toEqual(copy);
  });
});

// ---------- Suggest a set (R45), Wave 4 J ----------

// Swaps nothing in a Fisher-Yates shuffle, so groups and songs keep the order first seen.
const NO_SHUFFLE = () => 0.9999;

// A small seeded generator (mulberry32), so shuffled results repeat run to run.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDS = [1, 2, 3, 7, 42, 99, 1234, 2026];

// Four genres (one of them none) over several decades; spellings of a genre vary.
const pool = [
  { id: 101, title: 'Rock 70s a', genre: 'Rock', year: 1975 },
  { id: 102, title: 'Rock 70s b', genre: 'rock', year: 1972 },
  { id: 103, title: 'Rock 00s a', genre: ' Rock ', year: 2004 },
  { id: 104, title: 'Rock 00s b', genre: 'ROCK', year: 2001 },
  { id: 201, title: 'Pop 70s', genre: 'Pop', year: 1976 },
  { id: 202, title: 'Pop 80s a', genre: 'Pop', year: 1984 },
  { id: 203, title: 'Pop 80s b', genre: 'pop', year: 1989 },
  { id: 301, title: 'Soul 00s', genre: 'Soul', year: 2006 },
  { id: 302, title: 'Soul 60s', genre: 'Soul', year: 1966 },
  { id: 303, title: 'Soul no year', genre: 'Soul', year: null },
  { id: 401, title: 'No genre a', genre: '', year: 1999 },
  { id: 402, title: 'No genre b', year: 1995 },
];
const genreOf = (id) => String(pool.find((s) => s.id === id).genre ?? '').trim().toLowerCase();
const ids = (songs) => songs.map((s) => s.id);
const emptyAt = (venueId) => ({ id: 9, name: 'Tonight', venueId, songIds: [] });

describe('R45 suggestCount', () => {
  it('accepts whole numbers from 1 to 50', () => {
    expect(suggestCount('1')).toBe(1);
    expect(suggestCount(' 10 ')).toBe(10);
    expect(suggestCount(50)).toBe(50);
  });

  it('refuses empty, fractional and out-of-range values', () => {
    for (const value of ['', '  ', null, undefined, '0', '-3', '51', '2.5', 'ten', 'NaN']) {
      expect(suggestCount(value)).toBeNull();
    }
  });
});

describe('R45 roundRobin', () => {
  it('takes one from each list in turn, dropping lists that run out', () => {
    expect(roundRobin([['a1', 'a2', 'a3'], ['b1'], ['c1', 'c2']])).toEqual(['a1', 'b1', 'c1', 'a2', 'c2', 'a3']);
  });

  it('is empty for no lists and skips empty ones', () => {
    expect(roundRobin([])).toEqual([]);
    expect(roundRobin(undefined)).toEqual([]);
    expect(roundRobin([[], ['x'], null])).toEqual(['x']);
  });
});

describe('R45 suggestCandidates', () => {
  const sings = [
    { id: 1, songId: 102, venueId: CROWN, date: '2026-10-01' },
    { id: 2, songId: 301, venueId: ANCHOR, date: '2026-10-02' },
  ];

  it('leaves out songs in the setlist and songs sung at its venue, not at other venues', () => {
    const setlist = { ...emptyAt(CROWN), songIds: [101, 201] };
    const out = ids(suggestCandidates(pool, sings, setlist));
    expect(out).not.toContain(101);
    expect(out).not.toContain(201);
    expect(out).not.toContain(102);
    expect(out).toContain(301); // sung, but at Anchor
    expect(out).toHaveLength(pool.length - 3);
  });

  it('for a general setlist leaves out songs sung anywhere', () => {
    const out = ids(suggestCandidates(pool, sings, { ...emptyAt(null), songIds: [101] }));
    expect(out).not.toContain(101);
    expect(out).not.toContain(102);
    expect(out).not.toContain(301);
    expect(out).toHaveLength(pool.length - 3);
  });

  it('leaves out Retired songs, since they are not to be sung', () => {
    const withRetired = pool.map((song) => (song.id === 401 ? { ...song, status: 'retired' } : song));
    const out = ids(suggestCandidates(withRetired, [], emptyAt(CROWN)));
    expect(out).not.toContain(401);
    expect(out).toHaveLength(pool.length - 1);
    expect(ids(suggestCandidates(pool, [], emptyAt(CROWN)))).toContain(401);
  });
});

describe('R45 suggestSongs', () => {
  const sings = [
    { id: 1, songId: 102, venueId: CROWN, date: '2026-10-01' },
    { id: 2, songId: 202, venueId: CROWN, date: '2026-09-01' },
    { id: 3, songId: 301, venueId: ANCHOR, date: '2026-10-02' },
  ];

  it('never suggests a song in the setlist or one sung at its venue', () => {
    const setlist = { ...emptyAt(CROWN), songIds: [101, 401] };
    for (const seed of SEEDS) {
      const out = ids(suggestSongs(pool, sings, setlist, 50, seeded(seed)));
      expect(out).toHaveLength(pool.length - 4);
      for (const id of [101, 401, 102, 202]) expect(out).not.toContain(id);
      expect(out).toContain(301); // sung only at Anchor
    }
  });

  it('for a general setlist never suggests a song sung anywhere', () => {
    for (const seed of SEEDS) {
      const out = ids(suggestSongs(pool, sings, emptyAt(null), 50, seeded(seed)));
      expect(out).toHaveLength(pool.length - 3);
      for (const id of [102, 202, 301]) expect(out).not.toContain(id);
    }
  });

  it('spreads 6 songs from 3 genres 2 per genre, the first three from three different genres', () => {
    const three = pool.filter((s) => [101, 102, 103, 104, 201, 202, 203, 301, 302, 303].includes(s.id));
    for (const seed of SEEDS) {
      const out = ids(suggestSongs(three, [], emptyAt(CROWN), 6, seeded(seed)));
      expect(out).toHaveLength(6);
      const genres = out.map(genreOf);
      expect(new Set(genres.slice(0, 3)).size).toBe(3);
      expect(new Set(genres.slice(3, 6)).size).toBe(3);
      for (const genre of ['rock', 'pop', 'soul']) expect(genres.filter((g) => g === genre)).toHaveLength(2);
    }
  });

  it('takes a genre\'s songs from each of its decades before repeating one', () => {
    for (const seed of SEEDS) {
      const out = suggestSongs(pool, [], emptyAt(CROWN), 50, seeded(seed));
      const decadesOf = (genre) => out.filter((s) => genreOf(s.id) === genre).map((s) => (s.year == null ? null : Math.floor(s.year / 10)));
      // Rock: two decades, two songs each, so the first two differ and the last two differ.
      const rock = decadesOf('rock');
      expect(rock[0]).not.toBe(rock[1]);
      expect(rock[2]).not.toBe(rock[3]);
      // Soul: three decades (one is "no year"), one song each.
      expect(new Set(decadesOf('soul')).size).toBe(3);
    }
  });

  it('cycles genres, and decades within each genre, in the order first seen when nothing is shuffled', () => {
    expect(ids(suggestSongs(pool, [], emptyAt(CROWN), 50, NO_SHUFFLE))).toEqual([
      101, 201, 301, 401, // rock 70s, pop 70s, soul 00s, no genre 90s
      103, 202, 302, 402, // rock 00s, pop 80s, soul 60s, no genre 90s
      102, 203, 303, // rock 70s, pop 80s, soul no year
      104, // rock 00s
    ]);
    expect(ids(suggestSongs(pool, [], emptyAt(CROWN), 5, NO_SHUFFLE))).toEqual([101, 201, 301, 401, 103]);
  });

  it('gives every candidate once when fewer are left than asked for', () => {
    const setlist = { ...emptyAt(CROWN), songIds: pool.slice(3).map((s) => s.id) };
    for (const seed of SEEDS) {
      const out = ids(suggestSongs(pool, [], setlist, 10, seeded(seed)));
      expect([...out].sort()).toEqual([101, 102, 103]);
    }
    expect(suggestSongs(pool, [], { ...setlist, songIds: ids(pool) }, 10, seeded(1))).toEqual([]);
  });

  it('gives nothing for n of 0 or less, or not a number, and drops a fraction', () => {
    for (const n of [0, -1, NaN, undefined, null, '', 'ten']) {
      expect(suggestSongs(pool, [], emptyAt(CROWN), n, seeded(1))).toEqual([]);
    }
    expect(suggestSongs(pool, [], emptyAt(CROWN), 2.7, seeded(1))).toHaveLength(2);
    expect(suggestSongs(pool, [], emptyAt(CROWN), '3', seeded(1))).toHaveLength(3);
  });

  it('never suggests a song twice, even when the library lists it twice', () => {
    const doubled = [...pool, ...pool.map((s) => ({ ...s }))];
    for (const seed of SEEDS) {
      const out = ids(suggestSongs(doubled, [], emptyAt(CROWN), 50, seeded(seed)));
      expect(out).toHaveLength(pool.length);
      expect(new Set(out).size).toBe(out.length);
    }
  });

  it('works with Math.random by default and does not change its inputs', () => {
    const setlist = { ...emptyAt(CROWN), songIds: [101] };
    const copies = structuredClone({ pool, sings, setlist });
    const out = suggestSongs(pool, sings, setlist, 4);
    expect(out).toHaveLength(4);
    expect(new Set(ids(out).map(genreOf)).size).toBe(4);
    expect({ pool, sings, setlist }).toEqual(copies);
  });
});

describe('R45 describeSuggestion', () => {
  it('says how many were added', () => {
    expect(describeSuggestion(10, 10)).toBe('Added 10 songs.');
    expect(describeSuggestion(1, 1)).toBe('Added 1 song.');
  });

  it('says so when fewer were left than asked for', () => {
    expect(describeSuggestion(7, 10)).toBe('Added 7 songs (only 7 never sung here were left).');
    expect(describeSuggestion(1, 5)).toBe('Added 1 song (only 1 never sung here was left).');
    expect(describeSuggestion(3, 10, true)).toBe('Added 3 songs (only 3 never sung were left).');
  });

  it('says so when none were left', () => {
    expect(describeSuggestion(0, 10)).toBe('Every song has been sung here already, or is in this setlist.');
    expect(describeSuggestion(0, 10, true)).toBe('Every song has been sung already, or is in this setlist.');
  });
});

// ---------- Tonight (R17), Wave 4 J ----------

describe('R17 Tonight sings', () => {
  const today = '2026-11-12';
  const sings = [
    { id: 1, songId: 10, venueId: CROWN, date: today },
    { id: 2, songId: 10, venueId: CROWN, date: '2026-11-11' },
    { id: 3, songId: 11, venueId: ANCHOR, date: today },
    { id: 4, songId: 12, venueId: CROWN, date: today },
    { id: 5, songId: 12, venueId: CROWN, date: today },
  ];

  it('builds the sing a check logs', () => {
    expect(tonightSing(10, CROWN, today)).toEqual({ songId: 10, venueId: CROWN, date: today });
  });

  it('finds the sing an uncheck removes: same song, venue and day', () => {
    expect(findTonightSing(sings, 10, CROWN, today)).toEqual(sings[0]);
    expect(findTonightSing(sings, 10, CROWN, '2026-11-10')).toBeNull();
    expect(findTonightSing(sings, 11, CROWN, today)).toBeNull(); // sung today, but at Anchor
    expect(findTonightSing(sings, 13, CROWN, today)).toBeNull();
    expect(findTonightSing([], 10, CROWN, today)).toBeNull();
  });

  it('removes the most recently logged when a song was logged twice that day', () => {
    expect(findTonightSing(sings, 12, CROWN, today).id).toBe(5);
    expect(findTonightSing([...sings].reverse(), 12, CROWN, today).id).toBe(5);
  });

  it('lists the songs sung at a venue on a day', () => {
    expect(sungOn(sings, CROWN, today)).toEqual(new Set([10, 12]));
    expect(sungOn(sings, ANCHOR, today)).toEqual(new Set([11]));
    expect(sungOn(sings, CROWN, '2026-01-01')).toEqual(new Set());
    expect(sungOn(undefined, CROWN, today)).toEqual(new Set());
  });
});
