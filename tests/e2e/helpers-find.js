// Steps for the Find e2e tests (Wave 2 D). openApp, putRecords and readStore live in helpers.js.
import { expect } from '@playwright/test';
import { makeSong } from '../../js/lib/song.js';
import { putRecords, readStore } from './helpers.js';

// Reloads and waits for the Songs list to show all `total` songs.
export async function reloadList(page, total) {
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Songs' })).toBeVisible();
  await expect(page.getByText(`${total} of ${total} songs`)).toBeVisible();
}

// Writes songs (partial fields, completed by makeSong), venues (names) and
// sings ({ title, venue, date }), then reloads so the list picks them up.
// Resolves with ids by title and by venue name.
export async function seed(page, { songs = [], venues = [], sings = [] }) {
  const songIdList = songs.length ? await putRecords(page, 'songs', songs.map((fields) => makeSong(fields))) : [];
  const venueIdList = venues.length ? await putRecords(page, 'venues', venues.map((name) => ({ name }))) : [];
  const songIds = Object.fromEntries(songs.map((s, i) => [s.title, songIdList[i]]));
  const venueIds = Object.fromEntries(venues.map((name, i) => [name, venueIdList[i]]));
  if (sings.length) {
    await putRecords(page, 'sings', sings.map(({ title, venue, date }) => ({
      songId: songIds[title], venueId: venueIds[venue], date,
    })));
  }
  await reloadList(page, songs.length);
  return { songIds, venueIds };
}

export function venueSelect(page) {
  return page.getByLabel('Venue', { exact: true });
}

// Waits until the venue choice is saved, so a reload sees it.
export async function expectRememberedVenue(page, venueId) {
  await expect.poll(async () => {
    const record = (await readStore(page, 'meta')).find((r) => r.key === 'findVenueId');
    return record ? record.value : undefined;
  }).toBe(venueId);
}

export function filtersForm(page) {
  return page.getByRole('form', { name: 'Filters' });
}

export function filtersSummary(page) {
  return page.locator('details.find-filters > summary');
}

// Opens the collapsed Filters card.
export async function openFilters(page) {
  if (!(await filtersForm(page).isVisible())) await filtersSummary(page).click();
  await expect(filtersForm(page)).toBeVisible();
}

// A menu in the Filters card, by its label: Sung, Since, Tag, Status, Rating, Genre, Decade, Sort by.
export function filter(page, label) {
  return filtersForm(page).getByLabel(label, { exact: true });
}

export async function choose(page, label, option) {
  await filter(page, label).selectOption({ label: option });
}

// The titles in the list, in order.
export function shownTitles(page) {
  return page.locator('li.song-item .title');
}

export function songRow(page, title) {
  return page.locator('li.song-item').filter({ has: page.locator('.title').getByText(title, { exact: true }) });
}

// A row's "Sung N times · last D" / "Never sung here" line.
export function sungLine(page, title) {
  return songRow(page, title).locator('.sung');
}

export async function expectTapTarget(locator) {
  const box = await locator.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
}
