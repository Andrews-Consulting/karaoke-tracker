// Steps for the Lists and History scopes (Design B, wave 2b). The older steps,
// moved onto these screens, are in helpers-setlists.js and helpers-venues.js.
import { expect } from '@playwright/test';
import { openScope } from './helpers.js';
import { swipeOpen } from './helpers-tonight.js';

export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- Lists ----------

// The heading of the lists, which shows only there.
export function listsHeading(page) {
  return page.getByRole('heading', { level: 2, name: 'Lists', exact: true });
}

// The open list's songs.
export function listSongs(page) {
  return page.getByRole('list', { name: 'Songs in this setlist' });
}

// A song's row in the open list.
export function listSongRow(page, title) {
  return listSongs(page).locator('li[data-song-id]')
    .filter({ has: page.locator('.title').getByText(title, { exact: true }) });
}

// Swipes a song's row in the open list open, for its Remove, unless it is open.
export async function openSongMenu(page, title) {
  const row = listSongRow(page, title);
  if (!/\bopen\b/.test((await row.getAttribute('class')) || '')) await swipeOpen(page, row, '.song-main');
  await expect(row).toHaveClass(/\bopen\b/);
}

// A song's + / ✓ in the open list, which adds it to tonight's set or takes it out.
export function tonightToggle(page, title) {
  return listSongs(page)
    .getByRole('button', { name: new RegExp(`^(Add|Remove) ${escapeRegExp(title)} (to|from) tonight's set$`) });
}

// The open list's line saying how much of it is in tonight's set.
export function inSetLine(page) {
  return page.locator('.list-head .list-in-set');
}

// Taps Delete on the open list; the test answers the confirmation.
export async function deleteOpenList(page, name) {
  await page.getByRole('button', { name: `Delete ${name}`, exact: true }).click();
}

// ---------- History ----------

export function historyHeading(page) {
  return page.getByRole('heading', { level: 2, name: 'History', exact: true });
}

// Taps History and waits for it.
export async function openHistory(page) {
  await openScope(page, 'History');
  await expect(historyHeading(page)).toBeVisible();
}

// A venue chip at the top of History, or 'All venues'.
export function historyChip(page, name) {
  return page.getByRole('group', { name: 'Show the history of' }).getByRole('button', { name, exact: true });
}

// Shows the history of a venue, or of 'All venues'.
export async function showHistoryOf(page, name) {
  const chip = historyChip(page, name);
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
}

// 'By song' or 'By night'.
export async function groupHistory(page, by) {
  const button = page.getByRole('group', { name: 'Group the history' }).getByRole('button', { name: by, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

export function logSingForm(page) {
  return page.getByRole('form', { name: 'Log a sing' });
}

// Opens Log a sing from History (tapping History first unless it shows).
export async function openLogSing(page) {
  if (!(await historyHeading(page).isVisible())) await openHistory(page);
  await page.getByRole('button', { name: 'Log a sing', exact: true }).click();
  await expect(logSingForm(page)).toBeVisible();
}

export async function backToHistory(page) {
  await page.getByRole('button', { name: 'Back to History', exact: true }).click();
  await expect(historyHeading(page)).toBeVisible();
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A sing's date as History shows it: '2026-11-01' -> 'Sun 1 Nov 2026'.
export function historyDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return `${DAYS[new Date(year, month - 1, day).getDay()]} ${day} ${MONTHS[month - 1]} ${year}`;
}

// A song's times and last sung in History, '2× · 1 Nov' (with the year when
// it is not this year's), as a pattern that holds in any year.
export function historyStat(count, iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new RegExp(`^${count}× · ${day} ${MONTHS[month - 1]}( ${year})?$`);
}

// The sings of one night in History's By night.
export function nightSection(page, iso) {
  return page.getByRole('region', { name: historyDate(iso), exact: true });
}
