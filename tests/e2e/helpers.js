// Shared steps for the e2e tests. Each test runs in a fresh browser context,
// so IndexedDB is empty when it starts.
import { expect } from '@playwright/test';

// Pages whose test answers MusicBrainz itself (see mockMusicBrainz in
// helpers-find.js). openApp() lets those requests through to that mock.
export const mockedMusicBrainz = new WeakSet();

// Opens the app, which starts on Tonight, then the Songs scope, where most
// tests begin, and waits until its list has rendered. A reload keeps the
// scope. No test may reach the real MusicBrainz (R35): every lookup is
// refused here, unless the test registered its own answer with
// mockMusicBrainz(), which then gets it.
//
// Storage reads as persistent unless `persisted: false`: a browser tab with
// songs and storage not persistent shows the install banner (R65), which
// only its own tests want. A test context is never an installed app.
export async function openApp(page, { persisted = true } = {}) {
  await page.route('https://musicbrainz.org/**', (route) =>
    (mockedMusicBrainz.has(page) ? route.fallback() : route.abort('internetdisconnected')));
  await fakePersisted(page, persisted);
  await page.goto('./');
  await expectTab(page, 'Tonight');
  await openScope(page, 'Songs');
  await expect(page.getByText(/of \d+ songs/)).toBeVisible();
}

// From the next page load on, navigator.storage.persisted() resolves with
// `value`. A later call wins: init scripts run in the order they were added.
export function fakePersisted(page, value) {
  return page.addInitScript((answer) => {
    if (!navigator.storage) return;
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => answer });
  }, value);
}

// The dock's scope bar: Tonight, Songs, Lists, History and the Settings gear.
export function scopeBar(page) {
  return page.getByRole('navigation', { name: 'Scopes' });
}

// The tests' older names for the scopes: the Setlists tab is Lists, Venues is History.
const SCOPE_NAMES = { Setlists: 'Lists', Venues: 'History' };

function scopeButton(page, name) {
  return scopeBar(page).getByRole('button', { name: SCOPE_NAMES[name] ?? name, exact: true });
}

// Checks that the scope named `name` is the selected one, or for 'Settings'
// that Settings is showing (its gear is then the selected one). There is no
// title bar (R58): the scope bar says where you are, and the page title is
// for screen readers.
export async function expectTab(page, name) {
  await expect(scopeButton(page, name)).toHaveAttribute('aria-current', 'page');
}

// Taps a scope in the dock: 'Tonight', 'Songs', 'Lists' (or 'Setlists'), 'History' (or 'Venues').
export async function openScope(page, name) {
  await scopeButton(page, name).click();
  await expectTab(page, name);
}

// Opens Settings from the gear.
export async function openSettings(page) {
  await scopeButton(page, 'Settings').click();
  await expectTab(page, 'Settings');
  await expect(page.getByText('Appearance', { exact: true })).toBeVisible();
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

// Taps a song in the list and waits for its details to open. At a venue a
// row has a + beside it too (R48), so this taps the row itself.
export async function openSong(page, title) {
  await page.getByRole('listitem').filter({ hasText: title }).locator('button.song-row').click();
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
