// Steps for the Venues e2e tests (Wave 1 C), on the History scope since
// Design B: the venue list is its "Venues" screen, a venue's history is a chip
// at the top, and Overall is "All venues". openApp and addSong live in
// helpers.js; the newer History steps are in helpers-lists.js.
import { expect } from '@playwright/test';
import { openScope } from './helpers.js';
import { openHistory, showHistoryOf, logSingForm, openLogSing, historyDate } from './helpers-lists.js';

// Opens the venue list: History, then its Venues button.
export async function openVenues(page) {
  await openHistory(page);
  await page.getByRole('button', { name: 'Venues', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Add a venue' })).toBeVisible();
}

// The venue's row in the venue list (not while it is being renamed).
export function venueRow(page, name) {
  return page.getByRole('list', { name: 'Venues' }).getByRole('listitem')
    .filter({ has: page.locator('.title', { hasText: new RegExp(`^${escapeRegExp(name)}$`) }) });
}

export function venueRows(page) {
  return page.getByRole('list', { name: 'Venues' }).locator('li[data-venue-id]');
}

export async function addVenue(page, name) {
  const form = page.getByRole('form', { name: 'Add a venue' });
  await form.getByLabel('Venue name').fill(name);
  await form.getByRole('button', { name: 'Add venue' }).click();
  await expect(venueRow(page, name.trim())).toBeVisible();
}

// Shows the venue's history: History with its chip chosen.
export async function openVenue(page, name) {
  await openScope(page, 'History');
  await showHistoryOf(page, name);
}

// Shows the history of every venue: the All venues chip.
export async function openOverall(page) {
  await openVenue(page, 'All venues');
}

// Back to the venue list from anywhere in History.
export async function backToVenues(page) {
  await openVenues(page);
}

// Logs a sing on the Log a sing screen (opening it from History unless it
// shows): the venue when given, search, tap the song, set the date, log it.
// Stays on the screen, for the next one.
export async function logSing(page, { title, artist, date, venue }) {
  if (!(await logSingForm(page).isVisible())) await openLogSing(page);
  const form = logSingForm(page);
  const where = form.getByLabel('Venue', { exact: true });
  if (venue) await where.selectOption({ label: venue });
  const venueName = (await where.locator('option:checked').textContent()).trim();
  await form.getByRole('searchbox', { name: 'Find a song to log' }).fill(title);
  await form.getByRole('button', { name: `${title} by ${artist}`, exact: true }).click();
  await expect(form.getByText(`Song: ${title} — ${artist}`)).toBeVisible();
  await form.getByLabel('Date', { exact: true }).fill(date);
  await form.getByRole('button', { name: 'Log sing' }).click();
  await expect(form.getByRole('status')).toHaveText(`Logged “${title}” at ${venueName} on ${historyDate(date)}.`);
}

// History's By song list: one row per song.
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
