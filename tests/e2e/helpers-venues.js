// Steps for the Venues e2e tests (Wave 1 C). openApp and addSong live in helpers.js.
import { expect } from '@playwright/test';

// Taps the Venues tab and waits for the venue list.
export async function openVenues(page) {
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Venues' }).click();
  await expect(page.getByRole('heading', { name: 'Venues' })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Add a venue' })).toBeVisible();
}

// The venue's row in the venue list (not while it is being renamed).
export function venueRow(page, name) {
  return page.getByRole('list', { name: 'Venues' }).getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) });
}

// Rows for real venues only (the "Overall" row has no venue id).
export function venueRows(page) {
  return page.getByRole('list', { name: 'Venues' }).locator('li[data-venue-id]');
}

export async function addVenue(page, name) {
  const form = page.getByRole('form', { name: 'Add a venue' });
  await form.getByLabel('Venue name').fill(name);
  await form.getByRole('button', { name: 'Add venue' }).click();
  await expect(venueRow(page, name.trim())).toBeVisible();
}

export async function openVenue(page, name) {
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

export async function openOverall(page) {
  await page.getByRole('button', { name: 'Open overall stats' }).click();
  await expect(page.getByRole('heading', { name: 'Overall', exact: true })).toBeVisible();
}

export async function backToVenues(page) {
  await page.getByRole('button', { name: '‹ All venues' }).click();
  await expect(page.getByRole('form', { name: 'Add a venue' })).toBeVisible();
}

// Logs a sing at the open venue: search, tap the song, set the date, log it.
export async function logSing(page, { title, artist, date }) {
  const form = page.getByRole('form', { name: 'Log a sing' });
  await form.getByRole('searchbox', { name: 'Find a song to log' }).fill(title);
  await form.getByRole('button', { name: `${title} by ${artist}`, exact: true }).click();
  await expect(form.getByText(`Song: ${title} — ${artist}`)).toBeVisible();
  await form.getByLabel('Date', { exact: true }).fill(date);
  await form.getByRole('button', { name: 'Log sing' }).click();
  await expect(form.getByRole('status')).toHaveText(`Logged “${title}” on ${date}.`);
}

// The open screen's sing history: one row per song.
export function historyList(page) {
  return page.getByRole('list', { name: 'Sing history' });
}

export function historyRow(page, title) {
  return historyList(page).locator('li[data-song-id]')
    .filter({ has: page.locator('.title', { hasText: new RegExp(`^${escapeRegExp(title)}$`) }) });
}

export function historyTitles(page) {
  return historyList(page).locator('li[data-song-id] .title');
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Reads or writes IndexedDB directly, for setup the UI cannot do yet (setlists)
// or would be slow at (hundreds of songs), and to check stored records.
export async function readStore(page, store) {
  return page.evaluate((store) => new Promise((resolve, reject) => {
    const req = indexedDB.open('mic-jaunt');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const conn = req.result;
      const get = conn.transaction(store).objectStore(store).getAll();
      get.onsuccess = () => { conn.close(); resolve(get.result); };
      get.onerror = () => reject(get.error);
    };
  }), store);
}

export async function addRecords(page, store, records) {
  return page.evaluate(({ store, records }) => new Promise((resolve, reject) => {
    const req = indexedDB.open('mic-jaunt');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const conn = req.result;
      const tx = conn.transaction(store, 'readwrite');
      const ids = [];
      for (const record of records) {
        const add = tx.objectStore(store).add(record);
        add.onsuccess = () => ids.push(add.result);
      }
      tx.oncomplete = () => { conn.close(); resolve(ids); };
      tx.onerror = () => reject(tx.error);
    };
  }), { store, records });
}

// A complete song record, as makeSong() would build it.
export function songRecord(title, artist) {
  return {
    title, artist, genre: '', year: null, key: '', notes: '', rating: null,
    status: 'go-to', tags: [], createdAt: new Date().toISOString(),
  };
}
