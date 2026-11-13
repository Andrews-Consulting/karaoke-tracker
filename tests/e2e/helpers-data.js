// Steps for the CSV import, backup and restore tests (R20, R21, R22).
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { expectTab } from './helpers.js';

async function openTab(page, name) {
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name }).click();
  await expectTab(page, name);
}

export async function openSettings(page) {
  await openTab(page, 'Settings');
  await expect(page.getByRole('button', { name: 'Download backup' })).toBeVisible();
}

export async function openSongs(page) {
  await openTab(page, 'Songs');
  await expect(page.getByText(/of \d+ songs/)).toBeVisible();
}

// Collects uncaught exceptions so a test can check there were none.
export function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

// Taps a file button in Settings and picks a file in the chooser, like the owner would.
async function chooseFile(page, buttonText, { name, mimeType, contents }) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByText(buttonText, { exact: true }).click();
  await (await chooser).setFiles({ name, mimeType, buffer: Buffer.from(contents, 'utf8') });
}

export function importCsv(page, csv, name = 'songs.csv') {
  return chooseFile(page, 'Import songs from CSV', { name, mimeType: 'text/csv', contents: csv });
}

// `backup` is a string (sent as is) or an object (sent as JSON).
export function restoreBackup(page, backup, name = 'mic-jaunt-backup.json') {
  const contents = typeof backup === 'string' ? backup : JSON.stringify(backup);
  return chooseFile(page, 'Restore from backup', { name, mimeType: 'application/json', contents });
}

// Hands a file to "Check a backup file" (R62), which reports on it without restoring.
export function checkBackupFile(page, backup, name = 'mic-jaunt-backup.json') {
  const contents = typeof backup === 'string' ? backup : JSON.stringify(backup);
  return chooseFile(page, 'Check a backup file', { name, mimeType: 'application/json', contents });
}

// Pretends the browser has a share sheet that accepts files (R62). `outcome`
// is 'shared' (the sheet reports success), 'cancelled' (the owner dismissed
// it) or 'failed'. What was shared is kept on window.__shared for the test.
export function fakeShareSheet(page, outcome = 'shared') {
  return page.addInitScript((how) => {
    window.__shared = [];
    navigator.canShare = (data) => !!(data && data.files && data.files.length);
    navigator.share = async (data) => {
      window.__shared.push({ names: data.files.map((f) => f.name), title: data.title, size: data.files[0].size });
      if (how === 'cancelled') throw new DOMException('Share canceled', 'AbortError');
      if (how === 'failed') throw new Error('Sharing is unavailable right now');
    };
  }, outcome);
}

// Taps "Download backup" and returns the file name, raw text and parsed JSON.
export async function downloadBackup(page) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).click();
  const download = await downloading;
  const text = await readFile(await download.path(), 'utf8');
  return { filename: download.suggestedFilename(), text, json: JSON.parse(text) };
}

// Taps "Download songs as CSV" (R23) and returns the file name and raw text,
// BOM included.
export async function downloadSongsCsv(page) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download songs as CSV' }).click();
  const download = await downloading;
  const text = await readFile(await download.path(), 'utf8');
  return { filename: download.suggestedFilename(), text };
}

// Answers the next confirm() dialog and resolves with its message.
export function answerNextDialog(page, accept) {
  return new Promise((resolve) => {
    page.once('dialog', async (dialog) => {
      const message = dialog.message();
      if (accept) await dialog.accept();
      else await dialog.dismiss();
      resolve(message);
    });
  });
}

// A complete song record as stored in IndexedDB.
export function songRecord(id, title, artist, extra = {}) {
  return {
    id, title, artist, genre: '', year: null, key: '', notes: '', rating: null,
    status: 'go-to', tags: [], createdAt: '2026-10-01T19:00:00.000Z', ...extra,
  };
}

// A backup file in the app's format, with every store present.
export function backupFile(data = {}, overrides = {}) {
  return {
    app: 'mic-jaunt',
    format: 1,
    dbVersion: 1,
    exportedAt: '2026-11-01T20:00:00.000Z',
    data: { songs: [], venues: [], sings: [], setlists: [], meta: [], ...data },
    ...overrides,
  };
}
