import { test, expect } from '@playwright/test';
import { openApp, addSong } from './helpers.js';

test.describe('Songs', () => {
  test('R1: adds a song with title and artist', async ({ page }) => {
    await openApp(page);
    await expect(page.getByText('No songs yet')).toBeVisible();
    await expect(page.getByText('0 of 0 songs')).toBeVisible();

    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 });

    const item = page.getByRole('listitem').filter({ hasText: 'Valerie' });
    await expect(item).toContainText('Amy Winehouse');
    await expect(item).toContainText('Soul');
    await expect(item).toContainText('2006');
    await expect(page.getByText('1 of 1 songs')).toBeVisible();
    await expect(page.getByText('No songs yet')).toHaveCount(0);
  });

  test('R1: title and artist are required', async ({ page }) => {
    await openApp(page);
    await page.getByText('Add a song', { exact: true }).click();
    const form = page.getByRole('form', { name: 'Add a song' });
    await form.getByLabel('Title').fill('Only a title');
    await form.getByRole('button', { name: 'Add song' }).click();
    // The browser blocks submit on the empty required Artist field; Cancel adds nothing.
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('0 of 0 songs')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Only a title' })).toHaveCount(0);
  });

  test('R10: searches by title or artist as I type', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Dancing Queen', artist: 'ABBA' });
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await addSong(page, { title: 'Back to Black', artist: 'Amy Winehouse' });
    await expect(page.getByText('3 of 3 songs')).toBeVisible();

    const search = page.getByRole('searchbox', { name: 'Search songs' });

    await search.fill('amy');
    await expect(page.getByText('2 of 3 songs')).toBeVisible();
    // The field shows its focus on the dock's frame, with no second ring inside it.
    await expect(search).toBeFocused();
    await expect(search).toHaveCSS('outline-style', 'none');
    await expect(page.getByRole('listitem').filter({ hasText: 'Dancing Queen' })).toHaveCount(0);
    await expect(page.getByRole('listitem').filter({ hasText: 'Valerie' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Back to Black' })).toBeVisible();

    await search.fill('QUEEN');
    await expect(page.getByText('1 of 3 songs')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Dancing Queen' })).toBeVisible();

    await search.fill('zzz');
    await expect(page.getByText('0 of 3 songs')).toBeVisible();

    await search.fill('');
    await expect(page.getByText('3 of 3 songs')).toBeVisible();
  });

  test('R18: data survives a reload', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });

    await page.reload();
    await expect(page.getByText('1 of 1 songs')).toBeVisible();
    const item = page.getByRole('listitem').filter({ hasText: 'Valerie' });
    await expect(item).toContainText('Amy Winehouse');
  });

  test('R31: with the keyboard taking half the screen, the first match and the field are both in view', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await addSong(page, { title: 'Rehab', artist: 'Amy Winehouse' });
    await addSong(page, { title: 'Dancing Queen', artist: 'ABBA' });

    // A phone keyboard leaves about this much of the screen; the page must fit
    // it, with the dock at its bottom and the list scrolled to its top.
    await page.setViewportSize({ width: 390, height: 420 });
    const field = page.getByRole('searchbox', { name: 'Search songs' });
    await field.fill('amy');
    await expect(page.getByText('2 of 3 songs')).toBeVisible();

    const first = page.locator('li.song-item').first();
    const row = await first.boundingBox();
    const box = await field.boundingBox();
    expect(row.y).toBeGreaterThanOrEqual(0);
    expect(row.y + row.height).toBeLessThanOrEqual(420);
    expect(box.y + box.height).toBeLessThanOrEqual(420);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // A phone also reports the keyboard through the visual viewport, which the
    // dock turns into html[data-kb]; the Songs header then folds away so the
    // matches get the room. Simulated here, since a desktop browser has no keyboard.
    await page.evaluate(() => document.documentElement.setAttribute('data-kb', ''));
    await expect(page.locator('.songs-view > .find-context')).toBeHidden();
    await expect(page.locator('.songs-view > .filter-line')).toBeHidden();
    await expect(page.getByText('2 of 3 songs')).toBeVisible();
    await expect(first).toBeVisible();
    await page.evaluate(() => document.documentElement.removeAttribute('data-kb'));
    await expect(page.locator('.songs-view > .find-context')).toBeVisible();
  });
});
