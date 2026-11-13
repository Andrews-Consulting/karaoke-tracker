// Shared steps for the e2e tests. Each test runs in a fresh browser context,
// so IndexedDB is empty when it starts.
import { expect } from '@playwright/test';

// Pages whose test answers MusicBrainz itself (see mockMusicBrainz in
// helpers-find.js). openApp() lets those requests through to that mock.
export const mockedMusicBrainz = new WeakSet();

// Opens the app and waits until the Songs view has rendered. No test may reach
// the real MusicBrainz (R35): every lookup is refused here, unless the test
// registered its own answer with mockMusicBrainz(), which then gets it.
export async function openApp(page) {
  await page.route('https://musicbrainz.org/**', (route) =>
    (mockedMusicBrainz.has(page) ? route.fallback() : route.abort('internetdisconnected')));
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

// Taps a song in the list and waits for its details to open.
export async function openSong(page, title) {
  await page.getByRole('listitem').filter({ hasText: title }).getByRole('button').click();
  await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
}

// Writes records straight into an IndexedDB store, for data no screen creates
// yet (e.g. sings and setlists). Call after openApp(), which creates the
// database. Records without an id get one; resolves with the ids, in order.
export async function putRecords(page, store, records) {
  return page.evaluate(async ({ store, records }) => {
    const conn = await new Promise((resolve, reject) => {
      const req = indexedDB.open('mic-jaunt');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      if (!conn.objectStoreNames.contains(store)) throw new Error(`No "${store}" store; call openApp() first`);
      return await new Promise((resolve, reject) => {
        const tx = conn.transaction(store, 'readwrite');
        const reqs = records.map((record) => tx.objectStore(store).put(record));
        tx.oncomplete = () => resolve(reqs.map((req) => req.result));
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      conn.close();
    }
  }, { store, records });
}

// Reads every record in an IndexedDB store, in id order.
export async function readStore(page, store) {
  return page.evaluate(async (store) => {
    const conn = await new Promise((resolve, reject) => {
      const req = indexedDB.open('mic-jaunt');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      if (!conn.objectStoreNames.contains(store)) throw new Error(`No "${store}" store; call openApp() first`);
      return await new Promise((resolve, reject) => {
        const req = conn.transaction(store, 'readonly').objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      conn.close();
    }
  }, store);
}

// Waits until the service worker controls the page, so the shell is cached.
export async function waitForServiceWorker(page) {
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active && !!navigator.serviceWorker.controller;
  }, null, { timeout: 15_000 });
}
