// Steps for the Setlists e2e tests (Wave 2 E), on the Lists scope since
// Design B. openApp, addSong, putRecords and readStore live in helpers.js;
// the newer Lists steps are in helpers-lists.js.
import { expect } from '@playwright/test';
import { openScope, expectTab } from './helpers.js';
import { listsHeading, openSongMenu, openListMenu } from './helpers-lists.js';

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

// Opens the list (unless it is open) and its Rename form, and returns the form.
export async function editSetlist(page, name) {
  if (!(await page.getByRole('heading', { level: 2, name, exact: true }).isVisible())) await openSetlist(page, name);
  await openListMenu(page);
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
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
// scope with this set as the working list (R75), + adds each song there
// (searching for it), and the setlist opens again. Songs go to the end in
// the order given. Leaves the search empty, since it persists across scopes
// (R53). The list stays the working list, so Tonight shows it afterwards.
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

// Removes a song from the open list: a swipe, then Remove.
export async function removeFromSetlist(page, { title, artist }) {
  await openSongMenu(page, title);
  await setlistSongRow(page, title).getByRole('button', { name: `Remove ${title} by ${artist}`, exact: true }).click();
  await expect(setlistSongRow(page, title)).toHaveCount(0);
}

export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- Reorder (R16) and mix (R44), Wave 3 G; the song page (R70) ----------

// Taps a song's title on the open list, which opens its page (R70).
export async function openListSong(page, title) {
  await setlistSongRow(page, title).locator('.song-open').click();
  await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
}

// A song's drag handle in the open setlist.
export function dragHandle(page, title) {
  return page.getByRole('list', { name: 'Songs in this setlist' })
    .getByRole('button', { name: `Move ${title}`, exact: true });
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

// One of the mix lines at the top of the open list (R44): 'genre' or 'decade'.
export function mixLine(page, which) {
  return page.locator('.list-head .mix-line').nth(which === 'genre' ? 0 : 1);
}

// The counts a mix line shows, folded or unfolded.
export function mixText(page, which) {
  return mixLine(page, which).locator('.mix-text');
}

// A mix line's "+N more" (or, unfolded, "fewer") button.
export function mixToggle(page, which) {
  return mixLine(page, which).getByRole('button');
}

// ---------- Suggest (R45) and Tonight (R17), Wave 4 J ----------

// The open setlist's "Suggest songs" form.
export function suggestForm(page) {
  return page.getByRole('form', { name: 'Suggest songs' });
}

// The form's line saying why nothing was suggested.
export function suggestNote(page) {
  return suggestForm(page).locator('.suggest-note');
}

// The form's line after Add these: "Added 3 songs. Undo", then "Undone."
export function suggestDone(page) {
  return suggestForm(page).locator('.suggest-done');
}

// The preview of suggested songs under the form: "Suggested · N".
export function suggestPreview(page) {
  return page.getByRole('region', { name: /^Suggested · \d+$/ });
}

// The titles in the preview, in order.
export function previewTitles(page) {
  return suggestPreview(page).getByRole('list', { name: 'Suggested songs' }).locator('.title');
}

// Picks 'Match this list' or 'Mix it up'.
export async function suggestMode(page, name) {
  const choice = suggestForm(page).getByRole('radio', { name, exact: true });
  await choice.check();
  await expect(choice).toBeChecked();
}

// Types `howMany` into the form (left as it is when undefined), taps Suggest
// songs and waits for a preview of `count` songs. Returns their titles.
export async function suggest(page, howMany, count) {
  const form = suggestForm(page);
  if (howMany !== undefined) await form.getByLabel('How many').fill(String(howMany));
  await form.getByRole('button', { name: 'Suggest songs' }).click();
  await expect(suggestPreview(page).getByRole('heading')).toHaveText(`Suggested · ${count}`);
  await expect(previewTitles(page)).toHaveCount(count);
  return previewTitles(page).allTextContents();
}

// Taps Add these under the preview and waits for "Added N songs. Undo".
export async function addSuggested(page, count) {
  await suggestPreview(page).getByRole('button', { name: 'Add these', exact: true }).click();
  await expect(suggestPreview(page)).toBeHidden();
  await expect(suggestDone(page)).toHaveText(`Added ${count} ${count === 1 ? 'song' : 'songs'}. Undo`);
}

// Today in the page's own time zone, 'YYYY-MM-DD', as the app dates a sing.
export function pageToday(page) {
  return page.evaluate(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
}
