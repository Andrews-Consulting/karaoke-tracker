// R60: the Lists scope (the Setlists view) holds its place for a few minutes;
// R61: Tonight's set has the same drag handle as the setlist screen.
import { test, expect } from '@playwright/test';
import { openApp, putRecords, readStore, expectTab, openScope } from './helpers.js';
import { seed, venueSelect } from './helpers-find.js';
import { openSetlists, openSetlist } from './helpers-setlists.js';
import { listsHeading } from './helpers-lists.js';

const VALERIE = { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 };
const QUEEN = { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 };
const BRIGHTSIDE = { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 };
const AFRICA = { title: 'Africa', artist: 'Toto', genre: 'Rock', year: 1982 };

const showTab = (page, name) => openScope(page, name);
const setlistHeading = (page) => page.getByRole('heading', { level: 2, name: 'Friday', exact: true });

async function seedFriday(page, songs = [VALERIE, QUEEN, BRIGHTSIDE]) {
  const { songIds, venueIds } = await seed(page, { songs, venues: ['The Crown'] });
  const [setlistId] = await putRecords(page, 'setlists', [
    { name: 'Friday', venueId: venueIds['The Crown'], songIds: songs.map((s) => songIds[s.title]) },
  ]);
  return { songIds, venueIds, setlistId };
}

test.describe('Holding a place', () => {
  test('R60: coming back to the Setlists tab within minutes reopens the setlist; later it starts at the list', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-13T20:00:00') });
    await openApp(page);
    await seedFriday(page);

    await openSetlists(page);
    await openSetlist(page, 'Friday');
    await showTab(page, 'History');
    await expectTab(page, 'History');
    await page.clock.fastForward('02:00'); // two minutes later
    await showTab(page, 'Lists');
    await expect(setlistHeading(page)).toBeVisible();

    // The back gesture still reaches the list and does not bounce back into the setlist.
    await page.goBack();
    await expect(listsHeading(page)).toBeVisible();
    await expect(setlistHeading(page)).toHaveCount(0);

    // After an hour away, the scope starts at the list.
    await openSetlist(page, 'Friday');
    await showTab(page, 'Songs');
    await page.clock.fastForward('01:00:00');
    await showTab(page, 'Lists');
    await expect(listsHeading(page)).toBeVisible();
    await expect(setlistHeading(page)).toHaveCount(0);

    // Leaving through "‹ Lists" is a choice: the scope starts at the lists next time.
    await openSetlist(page, 'Friday');
    await page.getByRole('button', { name: 'Back to Lists' }).click();
    await expect(listsHeading(page)).toBeVisible();
    await showTab(page, 'Songs');
    await showTab(page, 'Lists');
    await expect(listsHeading(page)).toBeVisible();
    await expect(setlistHeading(page)).toHaveCount(0);
  });

  test('R61: Tonight\'s set has a drag handle that reorders it, like the setlist screen', async ({ page }) => {
    await openApp(page);
    const songs = [VALERIE, QUEEN, BRIGHTSIDE, AFRICA];
    const { songIds, setlistId } = await seedFriday(page, songs);
    await openScope(page, 'Tonight');
    await venueSelect(page).selectOption({ label: 'The Crown' });
    await page.getByLabel('Set', { exact: true }).selectOption(String(setlistId));

    // Valerie is Up next; the rest follow, each with a handle.
    await expect(page.locator('.up-next .up-title')).toHaveText('Valerie');
    const list = page.getByRole('list', { name: 'The rest of tonight\'s set' });
    const titles = list.locator('li[data-song-id] .title');
    await expect(titles).toHaveText(['Dancing Queen', 'Mr. Brightside', 'Africa']);
    await expect(list.locator('.pos')).toHaveText(['02', '03', '04']);

    // Drag Africa by its handle onto Dancing Queen's row: it takes second place.
    const handle = list.getByRole('button', { name: 'Move Africa', exact: true });
    await expect(handle).toBeVisible();
    const from = await handle.boundingBox();
    const to = await list.locator('li[data-song-id]').first().boundingBox();
    const x = from.x + from.width / 2;
    await page.mouse.move(x, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, to.y + to.height * 0.25, { steps: 10 });
    await page.mouse.up();

    await expect(titles).toHaveText(['Africa', 'Dancing Queen', 'Mr. Brightside']);
    await expect(page.locator('.up-next .up-title')).toHaveText('Valerie'); // the KJ already has Up next
    await expect.poll(async () => (await readStore(page, 'setlists')).find((s) => s.id === setlistId).songIds)
      .toEqual([songIds.Valerie, songIds.Africa, songIds['Dancing Queen'], songIds['Mr. Brightside']]);

    // Arrow keys on the handle move the song too, but never above Up next; the order survives a reload.
    await handle.focus();
    await page.keyboard.press('ArrowUp');
    await expect(titles).toHaveText(['Africa', 'Dancing Queen', 'Mr. Brightside']);
    await page.keyboard.press('ArrowDown');
    await expect(titles).toHaveText(['Dancing Queen', 'Africa', 'Mr. Brightside']);
    await expect(handle).toBeFocused();
    await expect.poll(async () => (await readStore(page, 'setlists')).find((s) => s.id === setlistId).songIds)
      .toEqual([songIds.Valerie, songIds['Dancing Queen'], songIds.Africa, songIds['Mr. Brightside']]);
    await page.reload();
    await expectTab(page, 'Tonight');
    await expect(titles).toHaveText(['Dancing Queen', 'Africa', 'Mr. Brightside']);
  });
});
