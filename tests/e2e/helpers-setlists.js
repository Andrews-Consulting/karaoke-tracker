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

// Creates a setlist through the "New setlist" form. venue is the label option (R56).
export async function createSetlist(page, name, venue = 'Any venue') {
  const form = page.getByRole('form', { name: 'New setlist' });
  await form.getByLabel('Setlist name').fill(name);
  await form.getByLabel('For venue (optional)').selectOption({ label: venue });
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

// Adds songs to the open setlist the R57 way: "Find songs" opens the Songs
// tab in Find with this set, + adds each song there (searching for it), and
// the setlist opens again. Songs go to the end in the order given. Leaves the
// search empty, since it persists across tabs (R53).
export async function addToSetlist(page, setlistName, ...songs) {
  await page.getByRole('button', { name: 'Find songs', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search songs' });
  await expect(page.getByRole('tab', { name: 'Find' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Set', { exact: true }).locator('option:checked')).toHaveText(new RegExp(`^${escapeRegExp(setlistName)}( · |$)`));
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

export async function removeFromSetlist(page, { title, artist }) {
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

// A song's Up or Down button: direction is 'up' or 'down'.
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
