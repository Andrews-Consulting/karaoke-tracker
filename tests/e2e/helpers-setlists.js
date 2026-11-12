// Steps for the Setlists e2e tests (Wave 2 E). openApp, addSong, putRecords and
// readStore live in helpers.js.
import { expect } from '@playwright/test';

// Taps the Setlists tab and waits for the setlist list.
export async function openSetlists(page) {
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Setlists' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Setlists' })).toBeVisible();
  await expect(page.getByRole('form', { name: 'New setlist' })).toBeVisible();
}

// The setlist's row in the list (not while it is being edited).
export function setlistRow(page, name) {
  return page.getByRole('list', { name: 'Setlists' }).getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) });
}

export function setlistRows(page) {
  return page.getByRole('list', { name: 'Setlists' }).locator('li[data-setlist-id]');
}

// Creates a setlist through the "New setlist" form. venue is the option label.
export async function createSetlist(page, name, venue = 'General') {
  const form = page.getByRole('form', { name: 'New setlist' });
  await form.getByLabel('Setlist name').fill(name);
  await form.getByLabel('Venue').selectOption({ label: venue });
  await form.getByRole('button', { name: 'Create setlist' }).click();
  await expect(setlistRow(page, name.trim())).toBeVisible();
}

// Opens the edit form for a setlist and returns it.
export async function editSetlist(page, name) {
  await setlistRow(page, name).getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  const form = page.getByRole('form', { name: `Edit ${name}`, exact: true });
  await expect(form).toBeVisible();
  return form;
}

export async function openSetlist(page, name) {
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
}

export async function backToSetlists(page) {
  await page.getByRole('button', { name: '‹ All setlists' }).click();
  await expect(page.getByRole('form', { name: 'New setlist' })).toBeVisible();
}

// Rows of the open setlist's songs, in setlist order.
export function setlistSongRows(page) {
  return page.getByRole('list', { name: 'Songs in this setlist' }).locator('li[data-song-id]');
}

export function setlistSongTitles(page) {
  return setlistSongRows(page).locator('.title');
}

export function setlistSongRow(page, title) {
  return setlistSongRows(page)
    .filter({ has: page.locator('.title', { hasText: new RegExp(`^${escapeRegExp(title)}$`) }) });
}

// The "Add songs" area of the open setlist.
export function addArea(page) {
  return page.getByRole('region', { name: 'Add songs' });
}

// Searches for a song in the open setlist's picker and adds it.
export async function addToSetlist(page, { title, artist }) {
  const area = addArea(page);
  await area.getByRole('searchbox', { name: 'Find a song to add' }).fill(title);
  await area.getByRole('button', { name: `Add ${title} by ${artist}`, exact: true }).click();
  await expect(area.getByRole('status')).toHaveText(`Added “${title}”.`);
  await expect(setlistSongRow(page, title)).toBeVisible();
}

export async function removeFromSetlist(page, { title, artist }) {
  await setlistSongRow(page, title).getByRole('button', { name: `Remove ${title} by ${artist}`, exact: true }).click();
  await expect(setlistSongRow(page, title)).toHaveCount(0);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
