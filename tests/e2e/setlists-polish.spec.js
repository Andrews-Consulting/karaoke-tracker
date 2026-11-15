// Setlists polish (Wave 3 G): reorder songs (R16), swipe for Remove (R15),
// and the mix by genre and decade (R44).
import { test, expect } from '@playwright/test';
import { makeSong } from '../../js/lib/song.js';
import { openApp, putRecords, readStore } from './helpers.js';
import {
  openSetlists, openSetlist, backToSetlists, setlistSongRow, setlistSongTitles, addToSetlist, removeFromSetlist,
  dragHandle, dragSong, mixCard, openMix, mixLine,
} from './helpers-setlists.js';
import { openSongMenu } from './helpers-lists.js';
import { swipeClosed } from './helpers-tonight.js';

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
  test('R16: the arrow keys on a song\'s handle move it, and the order survives a reload', async ({ page }) => {
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

    // No Up or Down buttons: the handle reorders, by finger or by the arrow keys.
    await expect(page.getByRole('button', { name: /^Move .* (up|down)$/ })).toHaveCount(0);
    const box = await dragHandle(page, 'Valerie').boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    // Focus stays with the moving song, so presses move it on.
    await dragHandle(page, 'Mr. Brightside').focus();
    await page.keyboard.press('ArrowUp');
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Mr. Brightside', 'Dancing Queen', 'Jolene']);
    await expect(dragHandle(page, 'Mr. Brightside')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(setlistSongTitles(page)).toHaveText(['Mr. Brightside', 'Valerie', 'Dancing Queen', 'Jolene']);
    await page.keyboard.press('ArrowUp'); // already first: nothing moves
    await expect(setlistSongTitles(page)).toHaveText(['Mr. Brightside', 'Valerie', 'Dancing Queen', 'Jolene']);
    await dragHandle(page, 'Valerie').focus();
    await page.keyboard.press('ArrowDown');
    await expect(setlistSongTitles(page)).toHaveText(['Mr. Brightside', 'Dancing Queen', 'Valerie', 'Jolene']);
    await dragHandle(page, 'Jolene').focus();
    await page.keyboard.press('ArrowUp');
    await expect(setlistSongTitles(page)).toHaveText(['Mr. Brightside', 'Dancing Queen', 'Jolene', 'Valerie']);
    await expect(dragHandle(page, 'Jolene')).toBeFocused();

    // The sung flag (R43) stays with its song.
    await expect(setlistSongRow(page, 'Mr. Brightside').locator('.here')).toHaveText(/^1× · 15 Oct( 2026)?$/);
    await expect.poll(() => storedOrder(page)).toEqual(idsOf(['Mr. Brightside', 'Dancing Queen', 'Jolene', 'Valerie']));

    await page.reload();
    await openSetlists(page);
    await openSetlist(page, 'Friday');
    await expect(setlistSongTitles(page)).toHaveText(['Mr. Brightside', 'Dancing Queen', 'Jolene', 'Valerie']);

    // Remove still works on a reordered list.
    await removeFromSetlist(page, { title: 'Mr. Brightside', artist: 'The Killers' });
    await expect(setlistSongTitles(page)).toHaveText(['Dancing Queen', 'Jolene', 'Valerie']);
    await expect.poll(() => storedOrder(page)).toEqual(idsOf(['Dancing Queen', 'Jolene', 'Valerie']));
  });

  test('R15: a list\'s songs swipe open for Remove, one at a time, and the keyboard reaches it', async ({ page }) => {
    await openApp(page);
    const ids = await seedSongs(page, SONGS);
    await putRecords(page, 'setlists', [{
      name: 'Friday', venueId: null, songIds: [ids.Valerie, ids['Dancing Queen'], ids['Mr. Brightside'], ids.Jolene],
    }]);
    const idsOf = (titles) => titles.map((title) => ids[title]);
    await openSetlists(page);
    await openSetlist(page, 'Friday');

    // No "…": a swipe left reveals Remove alone, over the row's end.
    await expect(page.getByRole('button', { name: /^More for / })).toHaveCount(0);
    const queen = setlistSongRow(page, 'Dancing Queen');
    await expect(queen).not.toHaveClass(/\bopen\b/);
    await openSongMenu(page, 'Dancing Queen');
    await expect(queen.locator('.song-actions').getByRole('button')).toHaveText(['Remove']);
    const remove = await queen.getByRole('button', { name: 'Remove Dancing Queen by ABBA' }).boundingBox();
    expect(remove.width).toBeGreaterThanOrEqual(44);
    expect(remove.height).toBeGreaterThanOrEqual(44);
    expect((await dragHandle(page, 'Dancing Queen').boundingBox()).x).toBeLessThan(remove.x); // the handle stays at the left

    // Opening another row closes the first; a tap on an open row closes it; so does a swipe back.
    await openSongMenu(page, 'Jolene');
    await expect(queen).not.toHaveClass(/\bopen\b/);
    await setlistSongRow(page, 'Jolene').locator('.text').click({ position: { x: 8, y: 8 } });
    await expect(setlistSongRow(page, 'Jolene')).not.toHaveClass(/\bopen\b/);
    await openSongMenu(page, 'Valerie');
    await swipeClosed(page, setlistSongRow(page, 'Valerie'));
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Dancing Queen', 'Mr. Brightside', 'Jolene']);

    // Keyboard and screen readers reach Remove without the gesture: focus opens the row.
    const brightside = setlistSongRow(page, 'Mr. Brightside');
    await brightside.getByRole('button', { name: 'Remove Mr. Brightside by The Killers' }).focus();
    await expect(brightside).toHaveClass(/\bopen\b/);
    await page.keyboard.press('Enter');
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Dancing Queen', 'Jolene']);
    await expect.poll(() => storedOrder(page)).toEqual(idsOf(['Valerie', 'Dancing Queen', 'Jolene']));
  });

  test('R16: a song dragged to the bottom edge scrolls the list, so a long move needs no buttons', async ({ page }) => {
    await openApp(page);
    const many = Array.from({ length: 30 }, (_, i) => ({ title: `Song ${String(i + 1).padStart(2, '0')}`, artist: 'The Band' }));
    const ids = await seedSongs(page, many);
    await putRecords(page, 'setlists', [{ name: 'Long', venueId: null, songIds: many.map((s) => ids[s.title]) }]);
    await openSetlists(page);
    await openSetlist(page, 'Long');
    const main = page.locator('main');
    expect(await main.evaluate((m) => m.scrollHeight > m.clientHeight * 1.5)).toBe(true);

    // Down from the top to just above the screen's bottom edge, and held there.
    const from = await dragHandle(page, 'Song 01').boundingBox();
    const screen = await main.boundingBox();
    const x = from.x + from.width / 2;
    await page.mouse.move(x, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, screen.y + screen.height - 12, { steps: 12 });
    await expect(setlistSongRow(page, 'Song 01')).toHaveClass(/\bdragging\b/);
    // The screen scrolls by itself, the others making room, until the end of the list is in view.
    await expect(setlistSongTitles(page).last()).toHaveText('Song 01', { timeout: 15_000 });
    expect(await main.evaluate((m) => m.scrollTop)).toBeGreaterThan(0);
    const settled = await main.evaluate((m) => m.scrollTop);
    await page.waitForTimeout(300);
    expect(await main.evaluate((m) => m.scrollTop)).toBe(settled); // it stops there
    await page.mouse.up();

    // It lands at the end of the list, and the order is saved.
    await expect(setlistSongRow(page, 'Song 01')).not.toHaveClass(/\bdragging\b/);
    await expect(setlistSongTitles(page).last()).toHaveText('Song 01');
    await expect.poll(async () => (await storedOrder(page)).at(-1)).toBe(ids['Song 01']);
    expect((await storedOrder(page)).slice(0, 2)).toEqual([ids['Song 02'], ids['Song 03']]);
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

    // Adding a song (with Find songs, R57) updates it too; reordering changes no count.
    await addToSetlist(page, 'Friday', { title: 'Back to Black', artist: 'Amy Winehouse' });
    await openMix(page);
    await expect(mixLine(page, 'Genres')).toHaveText('Rock 2 · Soul 2 · Pop 1 · No genre 1');
    await expect(mixLine(page, 'Decades')).toHaveText('1970s 2 · 2000s 3 · No year 1');
    await dragHandle(page, 'Back to Black').focus();
    await page.keyboard.press('ArrowUp');
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
