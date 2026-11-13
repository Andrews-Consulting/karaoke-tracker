// Setlists, Wave 4 J: suggest a set (R45). Tonight mode (R17) was here too
// until the Songs tab's List mode (R49) replaced it; see night.spec.js.
import { test, expect } from '@playwright/test';
import { makeSong } from '../../js/lib/song.js';
import { openApp, putRecords, readStore } from './helpers.js';
import {
  openSetlists, openSetlist, backToSetlists, setlistSongRow, setlistSongRows, setlistSongTitles,
  dragHandle, moveButton, removeFromSetlist, openMix, mixLine, suggestForm, suggest,
} from './helpers-setlists.js';

// Stores songs (partial fields, completed by makeSong) and returns { title: id }.
async function seedSongs(page, songs) {
  const ids = await putRecords(page, 'songs', songs.map((fields) => makeSong(fields)));
  return Object.fromEntries(songs.map((s, i) => [s.title, ids[i]]));
}

async function expectTapTarget(locator) {
  const box = await locator.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

// Three genres, each over at least two decades, plus songs ruled out by the
// setlist or the venue. (Genres matching ignoring case is a unit test; here one
// spelling each keeps the Mix labels the same whatever order the songs come in.)
const LIBRARY = [
  { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 }, // in the setlist
  { title: 'Hotel California', artist: 'Eagles', genre: 'Rock', year: 1976 }, // sung at The Crown
  { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 }, // sung at The Crown
  { title: 'Born to Run', artist: 'Bruce Springsteen', genre: 'Rock', year: 1975 },
  { title: 'Livin\' on a Prayer', artist: 'Bon Jovi', genre: 'Rock', year: 1986 },
  { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 },
  { title: 'Seven Nation Army', artist: 'The White Stripes', genre: 'Rock', year: 2003 },
  { title: 'Billie Jean', artist: 'Michael Jackson', genre: 'Pop', year: 1982 },
  { title: 'Like a Prayer', artist: 'Madonna', genre: 'Pop', year: 1989 },
  { title: 'Toxic', artist: 'Britney Spears', genre: 'Pop', year: 2003 }, // sung, but only at Anchor
  { title: 'Umbrella', artist: 'Rihanna', genre: 'Pop', year: 2007 },
  { title: 'Respect', artist: 'Aretha Franklin', genre: 'Soul', year: 1967 },
  { title: 'My Girl', artist: 'The Temptations', genre: 'Soul', year: 1964 },
  { title: 'Rehab', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 },
  { title: 'Back to Black', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 },
];
const byTitle = new Map(LIBRARY.map((s) => [s.title, s]));
const genreOf = (title) => byTitle.get(title).genre.toLowerCase();
const decadeOf = (title) => Math.floor(byTitle.get(title).year / 10) * 10;

test.describe('Setlists: suggest', () => {
  test('R45: suggests never-sung songs spread across genres and decades', async ({ page }) => {
    await openApp(page);
    const ids = await seedSongs(page, LIBRARY);
    const [crown, anchor] = await putRecords(page, 'venues', [{ name: 'The Crown' }, { name: 'Anchor' }]);
    await putRecords(page, 'sings', [
      { songId: ids['Hotel California'], venueId: crown, date: '2026-10-01' },
      { songId: ids['Dancing Queen'], venueId: crown, date: '2026-10-08' },
      { songId: ids.Toxic, venueId: anchor, date: '2026-10-09' },
    ]);
    await putRecords(page, 'setlists', [{ name: 'Friday', venueId: crown, songIds: [ids.Valerie] }]);
    await openSetlists(page);
    await openSetlist(page, 'Friday');

    const form = suggestForm(page);
    await expect(form.getByLabel('How many')).toHaveValue('10');
    await expectTapTarget(form.getByLabel('How many'));
    await expectTapTarget(form.getByRole('button', { name: 'Suggest songs' }));
    await openMix(page);
    await expect(mixLine(page, 'Genres')).toHaveText('Soul 1');

    await suggest(page, 6, 'Added 6 songs.');
    await expect(setlistSongRows(page)).toHaveCount(7);
    const titles = await setlistSongTitles(page).allTextContents();
    const added = titles.slice(1);
    expect(titles[0]).toBe('Valerie'); // what was there stays first; suggestions go at the end
    expect(new Set(added).size).toBe(6);
    for (const title of ['Valerie', 'Hotel California', 'Dancing Queen']) expect(added).not.toContain(title);

    // One from each genre before any genre comes up again, two of each in all,
    // and a genre's two songs come from different decades.
    expect(new Set(added.slice(0, 3).map(genreOf)).size).toBe(3);
    expect(new Set(added.slice(3).map(genreOf)).size).toBe(3);
    for (const genre of ['rock', 'pop', 'soul']) {
      const inGenre = added.filter((title) => genreOf(title) === genre);
      expect(inGenre).toHaveLength(2);
      expect(decadeOf(inGenre[0])).not.toBe(decadeOf(inGenre[1]));
    }

    // Never sung here, so no sung flags; the mix and the stored setlist follow.
    await expect(setlistSongRows(page).locator('.flag')).toHaveCount(0);
    await expect(mixLine(page, 'Genres')).toHaveText('Soul 3 · Pop 2 · Rock 2');
    await expect.poll(async () => (await readStore(page, 'setlists'))[0].songIds)
      .toEqual(titles.map((title) => ids[title]));

    // The result is a start to edit: songs can be removed and moved as usual.
    const last = added.at(-1);
    await removeFromSetlist(page, { title: last, artist: byTitle.get(last).artist });
    await moveButton(page, added[0], 'up').click();
    await expect(setlistSongTitles(page).first()).toHaveText(added[0]);
    await expect(dragHandle(page, added[0])).toBeVisible();

    // Asking again takes the rest (the removed song is a candidate again); Toxic, sung only at Anchor, is among them.
    await suggest(page, 50, 'Added 7 songs (only 7 never sung here were left).');
    await expect(setlistSongRows(page)).toHaveCount(13);
    await expect(setlistSongRow(page, 'Toxic')).toHaveCount(1);
    await expect(mixLine(page, 'Genres')).toHaveText('Soul 5 · Pop 4 · Rock 4');
  });

  test('R45: says so when fewer songs are left than asked for', async ({ page }) => {
    await openApp(page);
    const ids = await seedSongs(page, LIBRARY.slice(0, 5));
    const [crown, anchor] = await putRecords(page, 'venues', [{ name: 'The Crown' }, { name: 'Anchor' }]);
    await putRecords(page, 'sings', [
      { songId: ids['Hotel California'], venueId: crown, date: '2026-10-01' },
      { songId: ids['Dancing Queen'], venueId: anchor, date: '2026-10-02' },
    ]);
    await putRecords(page, 'setlists', [
      { name: 'Friday', venueId: crown, songIds: [ids.Valerie] },
      { name: 'Anywhere', venueId: null, songIds: [] },
    ]);
    await openSetlists(page);
    await openSetlist(page, 'Friday');

    // A number outside 1 to 50 adds nothing.
    await suggestForm(page).getByLabel('How many').fill('0');
    await suggestForm(page).getByRole('button', { name: 'Suggest songs' }).click();
    await expect(suggestForm(page).getByRole('alert')).toHaveText('Enter how many songs to suggest, from 1 to 50.');
    await expect(setlistSongRows(page)).toHaveCount(1);

    // Ten asked for (the default), three left: Dancing Queen (sung only at Anchor), Born to Run, Livin' on a Prayer.
    await suggestForm(page).getByLabel('How many').fill('10');
    await suggest(page, undefined, 'Added 3 songs (only 3 never sung here were left).');
    await expect(suggestForm(page).locator('.error')).toBeEmpty();
    await expect(setlistSongTitles(page)).toHaveCount(4);
    expect((await setlistSongTitles(page).allTextContents()).slice(1).sort())
      .toEqual(['Born to Run', 'Dancing Queen', 'Livin\' on a Prayer']);

    await suggest(page, undefined, 'Every song has been sung here already, or is in this setlist.');
    await expect(setlistSongRows(page)).toHaveCount(4);
    expect((await readStore(page, 'setlists')).find((s) => s.name === 'Friday').songIds).toHaveLength(4);

    // A general setlist leaves out songs sung at any venue.
    await backToSetlists(page);
    await openSetlist(page, 'Anywhere');
    await expect(suggestForm(page)).toContainText('Songs never sung anywhere');
    await suggest(page, 5, 'Added 3 songs (only 3 never sung were left).');
    expect((await setlistSongTitles(page).allTextContents()).sort())
      .toEqual(['Born to Run', 'Livin\' on a Prayer', 'Valerie']);
    await expect(page.getByText('Sung here')).toHaveCount(0);
  });
});
