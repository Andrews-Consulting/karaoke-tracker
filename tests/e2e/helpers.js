// Shared steps for the e2e tests. Each test runs in a fresh browser context,
// so IndexedDB is empty when it starts.
import { expect } from '@playwright/test';

// Opens the app and waits until the Songs view has rendered.
export async function openApp(page) {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Songs' })).toBeVisible();
  await expect(page.getByText(/of \d+ songs/)).toBeVisible();
}

// Adds a song through the form the way a user would.
export async function addSong(page, { title, artist, genre, year } = {}) {
  const form = page.getByRole('form', { name: 'Add a song' });
  if (!(await form.isVisible())) await page.getByText('Add a song', { exact: true }).click();
  await form.getByLabel('Title').fill(title);
  await form.getByLabel('Artist').fill(artist);
  if (genre) await form.getByLabel('Genre').fill(genre);
  if (year) await form.getByLabel('Year').fill(String(year));
  await form.getByRole('button', { name: 'Add song' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible();
}

// Waits until the service worker controls the page, so the shell is cached.
export async function waitForServiceWorker(page) {
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active && !!navigator.serviceWorker.controller;
  }, null, { timeout: 15_000 });
}
