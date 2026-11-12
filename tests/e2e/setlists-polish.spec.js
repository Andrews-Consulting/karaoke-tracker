// Setlists polish (Wave 3 G): reorder songs (R16) and the mix by genre and decade (R44).
import { test, expect } from '@playwright/test';
import { makeSong } from '../../js/lib/song.js';
import { openApp, putRecords, readStore } from './helpers.js';
import {
  openSetlists, openSetlist, backToSetlists, setlistSongRow, setlistSongTitles, addToSetlist, removeFromSetlist,
  dragHandle, moveButton, dragSong, mixCard, openMix, mixLine,
} from './helpers-setlists.js';

const SONGS = [
  { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 },
  { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 },
  { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 },
  { title: 'Jolene', artist: 'Dolly Parton', genre: 'Country', year: 1973 },
];

// Stores songs (partial fields, completed by makeSong) and returns { title: id }.
async function seedSongs(page, songs) {
  const ids = await putRecords(page, 'songs', songs.map((fields) => makeSong(fields)));
  return Object.fromEntries(songs.map((s, i) => [s.title, ids[i]]));
}

// The stored songIds of the first setlist.
async function storedOrder(page) {
  return (await readStore(page, 'setlists'))[0].songIds;
}

test.describe('Setlists polish', () => {
  test('R16: moves a song up and down with the buttons and the order survives a reload', async ({ page }) => {
    await openApp(page);
    const ids = await seedSongs(page, SONGS);
    const [crown] = await putRecords(page, 'venues', [{ name: 'The Crown' }]);
    await putRecords(page, 'sings', [{ songId: ids['Mr. Brightside'], venueId: crown, date: '2026-10-15' }]);
    await putRecords(page, 'setlists', [{
      name: 'Friday', venueId: crown, songIds: [ids.Valerie, ids['Dancing Queen'], ids['Mr. Brightside'], ids.Jolene],
    }]);
    const idsOf = (titles) => titles.map((title) => ids[title]);
    await openSetlists(page);
    await openSetlist(page, 'Friday');
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Dancing Queen', 'Mr. Brightside', 'Jolene']);

    // Up is off on the first song and Down on the last.
    await expect(moveButton(page, 'Valerie', 'up')).toBeDisabled();
    await expect(moveButton(page, 'Valerie', 'down')).toBeEnabled();
    await expect(moveButton(page, 'Jolene', 'up')).toBeEnabled();
    await expect(moveButton(page, 'Jolene', 'down')).toBeDisabled();
    for (const control of [dragHandle(page, 'Valerie'), moveButton(page, 'Valerie', 'up'), moveButton(page, 'Valerie', 'down')]) {
      const box = await control.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await moveButton(page, 'Mr. Brightside', 'up').click();
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Mr. Brightside', 'Dancing Queen', 'Jolene']);
    await expect.poll(() => storedOrder(page)).toEqual(idsOf(['Valerie', 'Mr. Brightside', 'Dancing Queen', 'Jolene']));

    // Two quick taps move two places; the new first song's Up turns off.
    await moveButton(page, 'Valerie', 'down').click();
    await moveButton(page, 'Valerie', 'down').click();
    await expect(setlistSongTitles(page)).toHaveText(['Mr. Brightside', 'Dancing Queen', 'Valerie', 'Jolene']);
    await expect(moveButton(page, 'Mr. Brightside', 'up')).toBeDisabled();
    await expect(moveButton(page, 'Valerie', 'down')).toBeEnabled();

    // The arrow keys on the handle move a song too, and focus stays with it.
    await dragHandle(page, 'Jolene').focus();
    await page.keyboard.press('ArrowUp');
    await expect(setlistSongTitles(page)).toHaveText(['Mr. Brightside', 'Dancing Queen', 'Jolene', 'Valerie']);
    await expect(dragHandle(page, 'Jolene')).toBeFocused();

    // The sung flag (R43) stays with its song.
    await expect(setlistSongRow(page, 'Mr. Brightside').locator('.flag')).toHaveText('Sung here · last 2026-10-15');
    await expect.poll(() => storedOrder(page)).toEqual(idsOf(['Mr. Brightside', 'Dancing Queen', 'Jolene', 'Valerie']));

    await page.reload();
    await openSetlists(page);
    await openSetlist(page, 'Friday');
    await expect(setlistSongTitles(page)).toHaveText(['Mr. Brightside', 'Dancing Queen', 'Jolene', 'Valerie']);

    // Remove still works on a reordered list, and Up and Down follow the new ends.
    await removeFromSetlist(page, { title: 'Mr. Brightside', artist: 'The Killers' });
    await expect(setlistSongTitles(page)).toHaveText(['Dancing Queen', 'Jolene', 'Valerie']);
    await expect(moveButton(page, 'Dancing Queen', 'up')).toBeDisabled();
    await expect.poll(() => storedOrder(page)).toEqual(idsOf(['Dancing Queen', 'Jolene', 'Valerie']));
  });

  test('R16: drags a song to a new position', async ({ page }) => {
    await openApp(page);
    const ids = await seedSongs(page, SONGS);
    await putRecords(page, 'setlists', [{
      name: 'Friday', venueId: null, songIds: [ids.Valerie, ids['Dancing Queen'], ids['Mr. Brightside'], ids.Jolene],
    }]);
    const idsOf = (titles) => titles.map((title) => ids[title]);
    await openSetlists(page);
    await openSetlist(page, 'Friday');
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Dancing Queen', 'Mr. Brightside', 'Jolene']);

    // Last to first. While held, the row is lifted and the others make room.
    await dragSong(page, 'Jolene', 'Valerie', async () => {
      await expect(setlistSongRow(page, 'Jolene')).toHaveClass(/\bdragging\b/);
      await expect(setlistSongTitles(page)).toHaveText(['Jolene', 'Valerie', 'Dancing Queen', 'Mr. Brightside']);
    });
    await expect(setlistSongTitles(page)).toHaveText(['Jolene', 'Valerie', 'Dancing Queen', 'Mr. Brightside']);
    await expect(page.locator('li.setlist-song.dragging')).toHaveCount(0);
    await expect(moveButton(page, 'Jolene', 'up')).toBeDisabled();
    await expect.poll(() => storedOrder(page)).toEqual(idsOf(['Jolene', 'Valerie', 'Dancing Queen', 'Mr. Brightside']));

    // Down two places.
    await dragSong(page, 'Valerie', 'Mr. Brightside');
    await expect(setlistSongTitles(page)).toHaveText(['Jolene', 'Dancing Queen', 'Mr. Brightside', 'Valerie']);
    await expect.poll(() => storedOrder(page)).toEqual(idsOf(['Jolene', 'Dancing Queen', 'Mr. Brightside', 'Valerie']));

    await page.reload();
    await openSetlists(page);
    await openSetlist(page, 'Friday');
    await expect(setlistSongTitles(page)).toHaveText(['Jolene', 'Dancing Queen', 'Mr. Brightside', 'Valerie']);
  });

  test('R44: shows the mix by genre and decade and updates when a song is removed', async ({ page }) => {
    await openApp(page);
    const ids = await seedSongs(page, [
      { title: 'Hotel California', artist: 'Eagles', genre: 'Rock', year: 1976 },
      { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 },
      { title: 'Livin\' on a Prayer', artist: 'Bon Jovi', genre: 'rock', year: 1986 },
      { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 },
      { title: 'Mr. Brightside', artist: 'The Killers', genre: 'ROCK', year: 2004 },
      { title: 'Mystery Song', artist: 'Nobody' }, // no genre, no year
      { title: 'Back to Black', artist: 'Amy Winehouse', genre: 'soul', year: 2006 },
    ]);
    await putRecords(page, 'setlists', [
      {
        name: 'Friday',
        venueId: null,
        songIds: ['Hotel California', 'Dancing Queen', 'Livin\' on a Prayer', 'Valerie', 'Mr. Brightside', 'Mystery Song']
          .map((title) => ids[title]),
      },
      { name: 'Empty', venueId: null, songIds: [] },
    ]);
    await openSetlists(page);
    await openSetlist(page, 'Friday');

    // Closed by default, with a 44 px summary.
    const card = mixCard(page);
    await expect(card).toBeVisible();
    await expect(card).toHaveJSProperty('open', false);
    await expect(mixLine(page, 'Genres')).toBeHidden();
    expect((await card.locator('summary').boundingBox()).height).toBeGreaterThanOrEqual(44);

    // Genres match ignoring case, most first then by name; decades oldest first; gaps last.
    await openMix(page);
    await expect(mixLine(page, 'Genres')).toHaveText('Rock 3 · Pop 1 · Soul 1 · No genre 1');
    await expect(mixLine(page, 'Decades')).toHaveText('1970s 2 · 1980s 1 · 2000s 2 · No year 1');

    await removeFromSetlist(page, { title: 'Livin\' on a Prayer', artist: 'Bon Jovi' });
    await expect(card).toHaveJSProperty('open', true);
    await expect(mixLine(page, 'Genres')).toHaveText('Rock 2 · Pop 1 · Soul 1 · No genre 1');
    await expect(mixLine(page, 'Decades')).toHaveText('1970s 2 · 2000s 2 · No year 1');

    // Adding a song updates it too; reordering changes no count.
    await addToSetlist(page, { title: 'Back to Black', artist: 'Amy Winehouse' });
    await expect(mixLine(page, 'Genres')).toHaveText('Rock 2 · Soul 2 · Pop 1 · No genre 1');
    await expect(mixLine(page, 'Decades')).toHaveText('1970s 2 · 2000s 3 · No year 1');
    await moveButton(page, 'Back to Black', 'up').click();
    await expect(setlistSongTitles(page).last()).toHaveText('Mystery Song');
    await expect(mixLine(page, 'Genres')).toHaveText('Rock 2 · Soul 2 · Pop 1 · No genre 1');
    await expect(mixLine(page, 'Decades')).toHaveText('1970s 2 · 2000s 3 · No year 1');

    // An empty setlist says so.
    await backToSetlists(page);
    await openSetlist(page, 'Empty');
    await openMix(page);
    await expect(mixCard(page)).toContainText('No songs yet.');
    await expect(mixLine(page, 'Genres')).toBeHidden();
  });
});
