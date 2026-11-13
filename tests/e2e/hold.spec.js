// R60: the Setlists tab holds its place for a few minutes; R61: List mode on
// the Songs tab has the same drag handle as the setlist screen.
import { test, expect } from '@playwright/test';
import { openApp, putRecords, readStore, expectTab } from './helpers.js';
import { seed, venueSelect } from './helpers-find.js';
import { openSetlists, openSetlist } from './helpers-setlists.js';

const VALERIE = { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 };
const QUEEN = { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 };
const BRIGHTSIDE = { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 };

const tabs = (page) => page.getByRole('navigation', { name: 'Sections' });
const showTab = (page, name) => tabs(page).getByRole('button', { name, exact: true }).click();
const setlistHeading = (page) => page.getByRole('heading', { level: 2, name: 'Friday', exact: true });
const newSetlistForm = (page) => page.getByRole('form', { name: 'New setlist' });

async function seedFriday(page) {
  const { songIds, venueIds } = await seed(page, { songs: [VALERIE, QUEEN, BRIGHTSIDE], venues: ['The Crown'] });
  const [setlistId] = await putRecords(page, 'setlists', [
    { name: 'Friday', venueId: venueIds['The Crown'], songIds: [songIds.Valerie, songIds['Dancing Queen'], songIds['Mr. Brightside']] },
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
    await showTab(page, 'Venues');
    await expectTab(page, 'Venues');
    await page.clock.fastForward('02:00'); // two minutes later
    await showTab(page, 'Setlists');
    await expect(setlistHeading(page)).toBeVisible();

    // The back gesture still reaches the list and does not bounce back into the setlist.
    await page.goBack();
    await expect(newSetlistForm(page)).toBeVisible();
    await expect(setlistHeading(page)).toHaveCount(0);

    // After an hour away, the tab starts at the list.
    await openSetlist(page, 'Friday');
    await showTab(page, 'Songs');
    await page.clock.fastForward('01:00:00');
    await showTab(page, 'Setlists');
    await expect(newSetlistForm(page)).toBeVisible();
    await expect(setlistHeading(page)).toHaveCount(0);

    // Leaving through "All setlists" is a choice: the tab starts at the list next time.
    await openSetlist(page, 'Friday');
    await page.getByRole('button', { name: '‹ All setlists' }).click();
    await expect(newSetlistForm(page)).toBeVisible();
    await showTab(page, 'Songs');
    await showTab(page, 'Setlists');
    await expect(newSetlistForm(page)).toBeVisible();
    await expect(setlistHeading(page)).toHaveCount(0);
  });

  test('R61: List mode has a drag handle that reorders the set, like the setlist screen', async ({ page }) => {
    await openApp(page);
    const { songIds, setlistId } = await seedFriday(page);
    await venueSelect(page).selectOption({ label: 'The Crown' });
    await page.getByLabel('Set', { exact: true }).selectOption(String(setlistId));
    await page.getByRole('tab', { name: /^List/ }).click();

    const list = page.getByRole('list', { name: 'Songs in the set' });
    const titles = list.locator('li[data-song-id] .title');
    await expect(titles).toHaveText(['Valerie', 'Dancing Queen', 'Mr. Brightside']);

    // Drag Mr. Brightside by its handle onto Valerie's row: it takes first place.
    const handle = list.getByRole('button', { name: 'Move Mr. Brightside', exact: true });
    await expect(handle).toBeVisible();
    const from = await handle.boundingBox();
    const to = await list.locator('li[data-song-id]').first().boundingBox();
    const x = from.x + from.width / 2;
    await page.mouse.move(x, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, to.y + to.height * 0.25, { steps: 10 });
    await page.mouse.up();

    await expect(titles).toHaveText(['Mr. Brightside', 'Valerie', 'Dancing Queen']);
    await expect.poll(async () => (await readStore(page, 'setlists')).find((s) => s.id === setlistId).songIds)
      .toEqual([songIds['Mr. Brightside'], songIds.Valerie, songIds['Dancing Queen']]);

    // Arrow keys on the handle move the song too, and the order survives a reload.
    await handle.focus();
    await page.keyboard.press('ArrowDown');
    await expect(titles).toHaveText(['Valerie', 'Mr. Brightside', 'Dancing Queen']);
    await page.reload();
    await expectTab(page, 'Songs');
    await page.getByRole('tab', { name: /^List/ }).click();
    await expect(titles).toHaveText(['Valerie', 'Mr. Brightside', 'Dancing Queen']);
  });
});
