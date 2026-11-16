// Setlists polish (Wave 3 G): reorder songs (R16), swipe for Remove (R15),
// the mix by genre and decade (R44), and a song opening its page (R70).
import { test, expect } from '@playwright/test';
import { makeSong } from '../../js/lib/song.js';
import { openApp, putRecords, readStore } from './helpers.js';
import {
  openSetlists, openSetlist, backToSetlists, setlistRow, setlistSongRow, setlistSongTitles, addToSetlist,
  removeFromSetlist, dragHandle, dragSong, mixLine, mixText, mixToggle, openListSong, editSetlist,
} from './helpers-setlists.js';
import { openSongMenu, tonightToggle } from './helpers-lists.js';
import { swipeClosed } from './helpers-tonight.js';

async function expectTapTarget(locator) {
  const box = await locator.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

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
  test('R78: a form field on the screen stays in view with the keyboard up, and the dock gives way', async ({ page }) => {
    await openApp(page);
    const ids = await seedSongs(page, SONGS);
    const [crown] = await putRecords(page, 'venues', [{ name: 'The Crown' }]);
    await putRecords(page, 'setlists', [{
      name: 'Friday', venueId: crown, songIds: [ids.Valerie, ids['Dancing Queen'], ids['Mr. Brightside'], ids.Jolene],
    }]);
    await openSetlists(page);
    const form = await editSetlist(page, 'Friday');
    const name = form.getByLabel('Setlist name');
    await name.focus();

    // The keyboard comes up: the window shrinks to what is left above it. The
    // header and the dock would leave the rename form under a one-line window,
    // so the dock gives way and the field is scrolled into view.
    await page.setViewportSize({ width: 390, height: 420 });
    await expect(page.locator('html[data-kb]')).toHaveCount(1);
    await expect(page.locator('html[data-kb-form]')).toHaveCount(1);
    await expect(page.locator('#dock')).toBeHidden();
    const box = await name.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(420);
    await expect(form.getByRole('button', { name: 'Save' })).toBeVisible();

    // Moving to the next field keeps the dock away; leaving the form brings it back.
    await form.getByLabel('For venue (optional)').focus();
    await expect(page.locator('html[data-kb-form]')).toHaveCount(1);
    await form.getByRole('button', { name: 'Cancel' }).focus();
    await expect(page.locator('html[data-kb-form]')).toHaveCount(0);
    await expect(page.locator('#dock')).toBeVisible();

    // The keyboard goes: everything is as it was.
    await name.focus();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('html[data-kb]')).toHaveCount(0);
    await expect(page.locator('html[data-kb-form]')).toHaveCount(0);
    await expect(page.locator('#dock')).toBeVisible();
  });

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
    test.slow(); // the drag scrolls a few pixels a frame, and frames are slow on a loaded machine
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
    await expect(setlistSongTitles(page).last()).toHaveText('Song 01', { timeout: 40_000 });
    expect(await main.evaluate((m) => m.scrollTop)).toBeGreaterThan(0);
    // It scrolls on a little past that, until the end of the list is clear of
    // the edge zone, then stops there: two reads 300 ms apart agree. Polled,
    // because on a loaded machine those last frames can take longer than that.
    let settled = await main.evaluate((m) => m.scrollTop);
    await expect.poll(async () => {
      await page.waitForTimeout(300);
      const now = await main.evaluate((m) => m.scrollTop);
      const still = now === settled;
      settled = now;
      return still;
    }, { timeout: 20_000 }).toBe(true);
    await page.mouse.up();

    // It lands at the end of the list, and the order is saved.
    await expect(setlistSongRow(page, 'Song 01')).not.toHaveClass(/\bdragging\b/);
    await expect(setlistSongTitles(page).last()).toHaveText('Song 01');
    await expect.poll(async () => (await storedOrder(page)).at(-1)).toBe(ids['Song 01']);
    expect((await storedOrder(page)).slice(0, 2)).toEqual([ids['Song 02'], ids['Song 03']]);
  });

  test('R16: a song dragged to the top edge reaches first place even when the finger cannot touch the very top', async ({ page }) => {
    test.slow(); // the drag scrolls a few pixels a frame, and frames are slow on a loaded machine
    await openApp(page);
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `Song ${String(i + 1).padStart(2, '0')}`, artist: 'The Band' }));
    const ids = await seedSongs(page, many);
    await putRecords(page, 'setlists', [{ name: 'Long', venueId: null, songIds: many.map((s) => ids[s.title]) }]);
    await openSetlists(page);
    await openSetlist(page, 'Long');
    const main = page.locator('main');
    await setlistSongRow(page, 'Song 20').scrollIntoViewIfNeeded();
    expect(await main.evaluate((m) => m.scrollTop)).toBeGreaterThan(0);

    // Up from the bottom and held 44 px below the screen's top edge: an iPhone
    // finger cannot reach under the status bar, so the drag must scroll on
    // until the first row sits clear of that strip.
    const from = await dragHandle(page, 'Song 20').boundingBox();
    const screen = await main.boundingBox();
    const x = from.x + from.width / 2;
    await page.mouse.move(x, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, screen.y + 44, { steps: 12 });
    await expect(setlistSongRow(page, 'Song 20')).toHaveClass(/\bdragging\b/);
    await expect(setlistSongTitles(page).first()).toHaveText('Song 20', { timeout: 40_000 });
    await page.mouse.up();

    await expect(setlistSongTitles(page).first()).toHaveText('Song 20');
    await expect.poll(async () => (await storedOrder(page))[0]).toBe(ids['Song 20']);
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
      { title: 'Respect', artist: 'Aretha Franklin', genre: 'soul', year: 1967 },
      { title: 'Wonderwall', artist: 'Oasis', genre: 'Rock', year: 1995 },
      { title: 'Back to Black', artist: 'Amy Winehouse', genre: 'soul', year: 2006 },
    ]);
    await putRecords(page, 'setlists', [
      {
        name: 'Friday',
        venueId: null,
        songIds: ['Hotel California', 'Dancing Queen', 'Livin\' on a Prayer', 'Valerie', 'Mr. Brightside', 'Mystery Song',
          'Respect', 'Wonderwall'].map((title) => ids[title]),
      },
      { name: 'Small', venueId: null, songIds: [ids.Valerie, ids['Dancing Queen']] },
      { name: 'Empty', venueId: null, songIds: [] },
    ]);
    await openSetlists(page);
    await openSetlist(page, 'Friday');

    // One mix, at the top: no Mix card under the songs.
    await expect(page.locator('details.mix')).toHaveCount(0);
    await expect(page.getByText('Mix', { exact: true })).toHaveCount(0);

    // The biggest groups, then "+N more": genres most first then by name, matching
    // ignoring case; decades oldest first.
    await expect(mixText(page, 'genre')).toHaveText('Rock 4 · Soul 2 · Pop 1');
    await expect(mixText(page, 'decade')).toHaveText('1960s 1 · 1970s 2 · 1980s 1 · 2000s 2');
    const genres = mixToggle(page, 'genre');
    const decades = mixToggle(page, 'decade');
    await expect(genres).toHaveText('+1 more genre'); // "genre" for screen readers only
    await expect(genres).toHaveAccessibleName('+1 more genre');
    await expect(genres).toHaveAttribute('aria-expanded', 'false');
    await expect(decades).toHaveAccessibleName('+2 more decades');
    await expectTapTarget(genres);
    await expectTapTarget(decades);

    // "+N more" unfolds every group in place, "No genre" and "No year" last; tapped again it folds back.
    await genres.click();
    await expect(mixText(page, 'genre')).toHaveText('Rock 4 · Soul 2 · Pop 1 · No genre 1');
    await expect(genres).toHaveAccessibleName('fewer genres');
    await expect(genres).toHaveAttribute('aria-expanded', 'true');
    await expect(mixText(page, 'decade')).toHaveText('1960s 1 · 1970s 2 · 1980s 1 · 2000s 2'); // still folded
    await decades.click();
    await expect(mixText(page, 'decade')).toHaveText('1960s 1 · 1970s 2 · 1980s 1 · 1990s 1 · 2000s 2 · No year 1');
    await expectTapTarget(decades);
    await decades.click();
    await expect(mixText(page, 'decade')).toHaveText('1960s 1 · 1970s 2 · 1980s 1 · 2000s 2');
    await expect(decades).toHaveAccessibleName('+2 more decades');

    // Removing a song updates both lines, each staying folded or unfolded.
    await removeFromSetlist(page, { title: 'Livin\' on a Prayer', artist: 'Bon Jovi' });
    await expect(mixText(page, 'genre')).toHaveText('Rock 3 · Soul 2 · Pop 1 · No genre 1');
    await expect(mixText(page, 'decade')).toHaveText('1960s 1 · 1970s 2 · 1990s 1 · 2000s 2');
    await expect(decades).toHaveAccessibleName('+1 more decade');

    // Adding a song (with Find songs, R57) updates them too; reordering changes no count.
    await addToSetlist(page, 'Friday', { title: 'Back to Black', artist: 'Amy Winehouse' });
    await expect(mixText(page, 'genre')).toHaveText('Rock 3 · Soul 3 · Pop 1');
    await expect(mixText(page, 'decade')).toHaveText('1960s 1 · 1970s 2 · 1990s 1 · 2000s 3');
    await dragHandle(page, 'Back to Black').focus();
    await page.keyboard.press('ArrowUp');
    await expect(setlistSongTitles(page).last()).toHaveText('Wonderwall');
    await expect(mixText(page, 'genre')).toHaveText('Rock 3 · Soul 3 · Pop 1');
    await mixToggle(page, 'decade').click();
    await expect(mixText(page, 'decade')).toHaveText('1960s 1 · 1970s 2 · 1990s 1 · 2000s 3 · No year 1');

    // The list's card among the lists keeps the miniature.
    await backToSetlists(page);
    await expect(setlistRow(page, 'Friday')).toContainText('Rock 3 · Soul 3 · Pop 1 · +1 more');

    // A list with few groups shows them all, with nothing to unfold.
    await openSetlist(page, 'Small');
    await expect(mixText(page, 'genre')).toHaveText('Pop 1 · Soul 1');
    await expect(mixText(page, 'decade')).toHaveText('1970s 1 · 2000s 1');
    await expect(page.locator('.list-head').getByRole('button')).toHaveCount(0);

    // An empty list has no mix lines.
    await backToSetlists(page);
    await openSetlist(page, 'Empty');
    await expect(mixLine(page, 'genre')).toBeHidden();
    await expect(mixLine(page, 'decade')).toBeHidden();
  });

  test('R70: tapping a song on a list opens it, and Back returns to the list', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await openApp(page);
    const ids = await seedSongs(page, SONGS);
    // "Anytime" sorts first, so it is tonight's set under Overall, and Friday has + / ✓.
    await putRecords(page, 'setlists', [
      { name: 'Friday', venueId: null, songIds: [ids.Valerie, ids['Dancing Queen'], ids['Mr. Brightside'], ids.Jolene] },
      { name: 'Anytime', venueId: null, songIds: [] },
    ]);
    const friday = page.getByRole('heading', { level: 2, name: 'Friday', exact: true });
    const songPage = page.getByRole('region', { name: 'Song details' });
    await openSetlists(page);
    await openSetlist(page, 'Friday');

    // A tap on the title opens the song page, whose Back names the list and
    // returns to it with the song in view.
    await expectTapTarget(setlistSongRow(page, 'Jolene').locator('.song-open'));
    await openListSong(page, 'Jolene');
    await expect(songPage.getByText('Dolly Parton', { exact: true })).toBeVisible();
    const back = page.getByRole('button', { name: 'Back to Friday', exact: true });
    await expect(back).toContainText('Friday');
    await back.click();
    await expect(friday).toBeVisible();
    await expect(setlistSongRow(page, 'Jolene').locator('.song-open')).toBeFocused();
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Dancing Queen', 'Mr. Brightside', 'Jolene']);

    // The phone's back gesture returns to the list as well.
    await openListSong(page, 'Valerie');
    await page.goBack();
    await expect(friday).toBeVisible();

    // A swipe that ends on the title opens the row, not the song; a tap on
    // the open row closes it; so does a swipe back that starts and ends on the title.
    const queen = setlistSongRow(page, 'Dancing Queen');
    const title = await queen.locator('.song-open').boundingBox();
    const y = title.y + title.height / 2;
    await page.mouse.move(title.x + title.width - 8, y);
    await page.mouse.down();
    await page.mouse.move(title.x + title.width - 48, y, { steps: 4 });
    await page.mouse.move(title.x + title.width - 168, y, { steps: 6 });
    await page.mouse.up();
    await expect(queen).toHaveClass(/\bopen\b/);
    await expect(friday).toBeVisible();
    await expect(songPage).toHaveCount(0);
    await queen.locator('.song-open').click({ position: { x: 8, y: 8 } });
    await expect(queen).not.toHaveClass(/\bopen\b/);
    await expect(songPage).toHaveCount(0);
    await openSongMenu(page, 'Dancing Queen');
    await swipeClosed(page, queen);
    await expect(friday).toBeVisible();
    await expect(songPage).toHaveCount(0);

    // Neither the handle nor + opens it.
    await dragHandle(page, 'Valerie').click();
    await tonightToggle(page, 'Valerie').click();
    await expect(tonightToggle(page, 'Valerie')).toHaveText('✓');
    await expect(friday).toBeVisible();
    await expect(songPage).toHaveCount(0);

    // What changes on the song page shows on the way back: a song deleted there is gone from the list.
    await openListSong(page, 'Mr. Brightside');
    await songPage.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(friday).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Deleted “Mr. Brightside”.' })).toBeVisible();
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Dancing Queen', 'Jolene']);
  });
});
