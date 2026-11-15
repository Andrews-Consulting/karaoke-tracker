// Steps for the Setlists e2e tests (Wave 2 E), on the Lists scope since
// Design B. openApp, addSong, putRecords and readStore live in helpers.js;
// the newer Lists steps are in helpers-lists.js.
import { expect } from '@playwright/test';
import { openScope, expectTab } from './helpers.js';
import { listsHeading, openSongMenu } from './helpers-lists.js';

// Taps Lists and lands on the lists. Within a few minutes of leaving a list
// the scope reopens it (R60), so this steps back out to the lists.
export async function openSetlists(page) {
  await openScope(page, 'Lists');
  const back = page.getByRole('button', { name: 'Back to Lists' });
  await expect(listsHeading(page).or(back)).toBeVisible();
  if (await back.isVisible()) await back.click();
  await expect(listsHeading(page)).toBeVisible();
}

// The list's card among the lists.
export function setlistRow(page, name) {
  return setlistRows(page)
    .filter({ has: page.locator('.title', { hasText: new RegExp(`^${escapeRegExp(name)}$`) }) });
}

export function setlistRows(page) {
  return page.getByRole('list', { name: 'Your lists' }).locator('li[data-setlist-id]');
}

// Creates a list through "New list". venue is the label option (R56).
export async function createSetlist(page, name, venue = 'Any venue') {
  const form = page.getByRole('form', { name: 'New list' });
  if (!(await form.isVisible())) await page.getByRole('button', { name: 'New list', exact: true }).click();
  await form.getByLabel('Setlist name').fill(name);
  await form.getByLabel('For venue (optional)').selectOption({ label: venue });
  await form.getByRole('button', { name: 'Create list' }).click();
  await expect(setlistRow(page, name.trim())).toBeVisible();
}

// Opens the list (unless it is open) and its "Rename and label" form, and returns the form.
export async function editSetlist(page, name) {
  if (!(await page.getByRole('heading', { level: 2, name, exact: true }).isVisible())) await openSetlist(page, name);
  await page.getByRole('button', { name: 'Rename and label', exact: true }).click();
  const form = page.getByRole('form', { name: `Edit ${name}`, exact: true });
  await expect(form).toBeVisible();
  return form;
}

export async function openSetlist(page, name) {
  await setlistRow(page, name).locator('button.list-open').click();
  await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
}

export async function backToSetlists(page) {
  await page.getByRole('button', { name: 'Back to Lists' }).click();
  await expect(listsHeading(page)).toBeVisible();
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

// Adds songs to the open setlist the R57 way: "Find songs" opens the Songs
// scope with this set as tonight's, + adds each song there (searching for
// it), and the setlist opens again. Songs go to the end in the order given.
// Leaves the search empty, since it persists across scopes (R53).
export async function addToSetlist(page, setlistName, ...songs) {
  await page.getByRole('button', { name: 'Find songs', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search songs' });
  await expectTab(page, 'Songs');
  await expect(page.locator('.find-context')).toContainText(` · ${setlistName} · `);
  for (const { title } of songs) {
    await search.fill(title);
    await page.getByRole('button', { name: `Add ${title} to the set`, exact: true }).click();
    await expect(page.getByRole('button', { name: `Remove ${title} from the set`, exact: true })).toBeVisible();
  }
  await search.fill('');
  await openSetlists(page);
  await openSetlist(page, setlistName);
  for (const { title } of songs) await expect(setlistSongRow(page, title)).toBeVisible();
}

// Removes a song from the open list, through its "…".
export async function removeFromSetlist(page, { title, artist }) {
  await openSongMenu(page, title);
  await setlistSongRow(page, title).getByRole('button', { name: `Remove ${title} by ${artist}`, exact: true }).click();
  await expect(setlistSongRow(page, title)).toHaveCount(0);
}

export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- Reorder (R16) and mix (R44), Wave 3 G ----------

// A song's drag handle in the open setlist.
export function dragHandle(page, title) {
  return page.getByRole('list', { name: 'Songs in this setlist' })
    .getByRole('button', { name: `Move ${title}`, exact: true });
}

// A song's Up or Down button, under its "…" (openSongMenu): direction is 'up' or 'down'.
export function moveButton(page, title, direction) {
  return page.getByRole('list', { name: 'Songs in this setlist' })
    .getByRole('button', { name: `Move ${title} ${direction}`, exact: true });
}

// Drags a song by its handle with the mouse (pointer events) onto the row of
// `targetTitle`, so it takes that song's place, and drops it. `beforeDrop`
// runs while the row is still held.
export async function dragSong(page, title, targetTitle, beforeDrop = null) {
  await page.getByRole('list', { name: 'Songs in this setlist' }).scrollIntoViewIfNeeded();
  const from = await dragHandle(page, title).boundingBox();
  const to = await setlistSongRow(page, targetTitle).boundingBox();
  const x = from.x + from.width / 2;
  // Past the target row's middle, from whichever side the song comes.
  const y = to.y + to.height * (to.y > from.y ? 0.75 : 0.25);
  await page.mouse.move(x, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 10 });
  if (beforeDrop) await beforeDrop();
  await page.mouse.up();
}

// The open setlist's Mix card (R44).
export function mixCard(page) {
  return page.locator('details.mix');
}

// Opens the Mix card when it is closed.
export async function openMix(page) {
  const card = mixCard(page);
  if (!(await card.evaluate((node) => node.open))) await card.locator('summary').click();
  await expect(card).toHaveJSProperty('open', true);
}

// One line of the Mix card: 'Genres' or 'Decades'.
export function mixLine(page, name) {
  return mixCard(page).locator('.mix-lines > div')
    .filter({ has: page.locator('dt', { hasText: name }) }).locator('dd');
}

// ---------- Suggest (R45) and Tonight (R17), Wave 4 J ----------

// The open setlist's "Suggest songs" form.
export function suggestForm(page) {
  return page.getByRole('form', { name: 'Suggest songs' });
}

// Types `howMany` into the form (left as it is when undefined), taps Suggest
// songs and waits for the line saying what happened.
export async function suggest(page, howMany, expected) {
  const form = suggestForm(page);
  if (howMany !== undefined) await form.getByLabel('How many').fill(String(howMany));
  await form.getByRole('button', { name: 'Suggest songs' }).click();
  await expect(form.getByRole('status')).toHaveText(expected);
}

// Today in the page's own time zone, 'YYYY-MM-DD', as the app dates a sing.
export function pageToday(page) {
  return page.evaluate(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
}
