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
    // The browser blocks submit on the empty required Artist field.
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
});
