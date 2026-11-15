// The song page (R70): detail, edit and delete (R2), notes (R3), genre and
// year (R36), and the fields the edit form holds too: tags (R5), key (R6),
// status (R7), rating (R4); key, status, rating and tonight's set also
// change in place.
import { test, expect } from '@playwright/test';
import { openApp, addSong, openSong, putRecords, readStore } from './helpers.js';
import {
  seed, chooseVenue, songRow, songSearch, backToSongs, songPage, songField, statusToggle, rateToggle, keyValue,
  tagChips, hereText,
} from './helpers-find.js';

const details = songPage;
const editForm = (page) => page.getByRole('form', { name: 'Edit song' });
const listRow = (page, title) => page.getByRole('listitem').filter({ hasText: title });
const button = (page, name) => page.getByRole('button', { name, exact: true });

async function startEditing(page, title) {
  await openSong(page, title);
  await button(page, 'Edit').click();
  await expect(editForm(page)).toBeVisible();
}

async function save(page) {
  await editForm(page).getByRole('button', { name: 'Save' }).click();
  await expect(details(page)).toBeVisible();
}

const backToList = backToSongs;

async function expectTapTarget(locator) {
  const box = await locator.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
}

// Every visible control on the page under 44 px either way (R31), as in ux.spec.js.
async function expectAllTapTargets(page, screen) {
  const small = await page.evaluate(() => [...document.querySelectorAll('button, input, select, textarea, a[href]')]
    .map((node) => {
      const r = node.getBoundingClientRect();
      return { name: (node.getAttribute('aria-label') || node.textContent).trim(), width: r.width, height: r.height };
    })
    .filter((b) => b.width > 0 && b.height > 0 && (b.width < 44 || b.height < 44)));
  expect(small, `${screen}: controls under 44 px`).toEqual([]);
}

// None of the status toggles is pressed, or only `label`.
async function expectStatus(page, label) {
  for (const name of ['Active', 'Want to try', 'Retired']) {
    await expect(statusToggle(page, name)).toHaveAttribute('aria-pressed', String(name === label));
  }
}

// None of the rating toggles is pressed, or only `n`.
async function expectRating(page, n) {
  for (let i = 1; i <= 5; i += 1) await expect(rateToggle(page, i)).toHaveAttribute('aria-pressed', String(i === n));
}

const storedSong = async (page, title) => (await readStore(page, 'songs')).find((s) => s.title === title);

test.describe('Library', () => {
  test('R2: opens a song from the list and goes back to the same search', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 });
    await addSong(page, { title: 'Dancing Queen', artist: 'ABBA' });

    await songSearch(page).fill('amy');
    await expect(page.getByText('1 of 2 songs')).toBeVisible();
    await expectTapTarget(listRow(page, 'Valerie').locator('button.song-row')); // the row, not its + (R56)

    await openSong(page, 'Valerie');
    await expect(details(page)).toContainText('Amy Winehouse');
    await expect(songField(page, 'Genre')).toHaveText('Soul');
    await expect(songField(page, 'Year')).toHaveText('2006');
    await expectStatus(page, null); // not set until chosen (R64)
    await expectRating(page, null);
    await expect(keyValue(page)).toHaveText('0');
    for (const name of ['Back to Songs', 'Edit', 'Delete']) await expectTapTarget(button(page, name));

    await backToList(page);
    await expect(songSearch(page)).toHaveValue('amy');
    await expect(page.getByText('1 of 2 songs')).toBeVisible();
  });

  test('R2: edits a song', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehous' });
    const [before] = await readStore(page, 'songs');

    await startEditing(page, 'Valerie');
    await expect(editForm(page).getByLabel('Title')).toHaveValue('Valerie');
    await expect(editForm(page).getByLabel('Artist')).toHaveValue('Amy Winehous');
    await editForm(page).getByLabel('Title').fill('Valerie (live)');
    await editForm(page).getByLabel('Artist').fill('Amy Winehouse');
    await save(page);

    await expect(page.getByRole('heading', { level: 2 })).toHaveText('Valerie (live)');
    await expect(details(page)).toContainText('Amy Winehouse');

    await backToList(page);
    await expect(page.getByText('1 of 1 songs')).toBeVisible();
    await expect(listRow(page, 'Valerie (live)')).toContainText('Amy Winehouse');
    await expect(page.getByText('Amy Winehous', { exact: true })).toHaveCount(0);

    // Same record, edited in place.
    const [after] = await readStore(page, 'songs');
    expect(after).toMatchObject({ id: before.id, createdAt: before.createdAt, title: 'Valerie (live)', artist: 'Amy Winehouse' });

    await page.reload();
    await expect(page.getByText('1 of 1 songs')).toBeVisible();
    await expect(listRow(page, 'Valerie (live)')).toContainText('Amy Winehouse');
  });

  test('R2: cancelling an edit leaves the song unchanged', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul' });

    await startEditing(page, 'Valerie');
    await editForm(page).getByLabel('Title').fill('Something else');
    await editForm(page).getByLabel('Genre').fill('Polka');
    await editForm(page).getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('heading', { level: 2 })).toHaveText('Valerie');
    await expect(songField(page, 'Genre')).toHaveText('Soul');

    await page.reload();
    await expect(listRow(page, 'Valerie')).toContainText('Soul');
    await expect(page.getByText('Something else')).toHaveCount(0);
  });

  test('R2: will not save a song without a title or artist', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });

    await startEditing(page, 'Valerie');
    await editForm(page).getByLabel('Title').fill('   ');
    await editForm(page).getByLabel('Artist').fill('  ');
    await editForm(page).getByRole('button', { name: 'Save' }).click();
    await expect(editForm(page).getByRole('alert')).toHaveText('Enter a title. Enter an artist.');
    await expect(editForm(page).getByLabel('Title')).toHaveAttribute('aria-invalid', 'true');

    // An emptied field is blocked by the browser before the form submits.
    await editForm(page).getByLabel('Title').fill('');
    await editForm(page).getByLabel('Artist').fill('Amy Winehouse');
    await editForm(page).getByRole('button', { name: 'Save' }).click();
    await expect(editForm(page)).toBeVisible();

    await editForm(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('Valerie');
    const [song] = await readStore(page, 'songs');
    expect(song).toMatchObject({ title: 'Valerie', artist: 'Amy Winehouse' });
  });

  test('R2: deletes a song after confirming', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await addSong(page, { title: 'Dancing Queen', artist: 'ABBA' });

    await openSong(page, 'Valerie');
    let message;
    page.once('dialog', async (dialog) => {
      message = dialog.message();
      await dialog.accept();
    });
    await button(page, 'Delete').click();

    await expect(page.getByRole('status')).toHaveText('Deleted “Valerie”.');
    expect(message).toBe('Delete “Valerie” by Amy Winehouse? This cannot be undone.');
    await expect(page.getByText('1 of 1 songs')).toBeVisible();
    await expect(listRow(page, 'Valerie')).toHaveCount(0);
    await expect(listRow(page, 'Dancing Queen')).toBeVisible();

    await page.reload();
    await expect(page.getByText('1 of 1 songs')).toBeVisible();
    await expect(listRow(page, 'Valerie')).toHaveCount(0);
  });

  test('R2: keeps the song when the delete confirmation is dismissed', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    const [song] = await readStore(page, 'songs');
    const [venueId] = await putRecords(page, 'venues', [{ name: 'The Crown' }]);
    await putRecords(page, 'sings', [{ songId: song.id, venueId, date: '2026-10-01' }]);
    await putRecords(page, 'setlists', [{ name: 'Friday', venueId, songIds: [song.id] }]);

    await openSong(page, 'Valerie');
    let message;
    page.once('dialog', async (dialog) => {
      message = dialog.message();
      await dialog.dismiss();
    });
    await button(page, 'Delete').click();
    await expect.poll(() => message).toBe(
      'Delete “Valerie” by Amy Winehouse? It has been sung once; that history will be deleted too. ' +
      'It will be removed from 1 setlist. This cannot be undone.');

    await expect(details(page)).toBeVisible();
    await backToList(page);
    await expect(page.getByText('1 of 1 songs')).toBeVisible();

    await page.reload();
    await expect(listRow(page, 'Valerie')).toBeVisible();
    expect(await readStore(page, 'songs')).toHaveLength(1);
    expect(await readStore(page, 'sings')).toHaveLength(1);
    expect((await readStore(page, 'setlists'))[0].songIds).toEqual([song.id]);
  });

  test('R2: deleting a song also deletes its sings and removes it from setlists', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await addSong(page, { title: 'Dancing Queen', artist: 'ABBA' });
    const songs = await readStore(page, 'songs');
    const valerie = songs.find((s) => s.title === 'Valerie').id;
    const queen = songs.find((s) => s.title === 'Dancing Queen').id;

    const [crown, lucky] = await putRecords(page, 'venues', [{ name: 'The Crown' }, { name: 'Lucky Voice' }]);
    await putRecords(page, 'sings', [
      { songId: valerie, venueId: crown, date: '2026-10-01' },
      { songId: queen, venueId: crown, date: '2026-10-01' },
      { songId: valerie, venueId: lucky, date: '2026-10-08' },
    ]);
    await putRecords(page, 'setlists', [
      { name: 'Friday', venueId: crown, songIds: [queen, valerie] },
      { name: 'Anywhere', venueId: null, songIds: [valerie] },
      { name: 'ABBA night', venueId: lucky, songIds: [queen] },
    ]);

    await openSong(page, 'Valerie');
    let message;
    page.once('dialog', async (dialog) => {
      message = dialog.message();
      await dialog.accept();
    });
    await button(page, 'Delete').click();
    await expect(page.getByRole('status')).toHaveText('Deleted “Valerie”.');
    expect(message).toContain('It has been sung 2 times; that history will be deleted too.');
    expect(message).toContain('It will be removed from 2 setlists.');

    expect((await readStore(page, 'songs')).map((s) => s.title)).toEqual(['Dancing Queen']);
    expect((await readStore(page, 'sings')).map(({ songId, venueId }) => ({ songId, venueId })))
      .toEqual([{ songId: queen, venueId: crown }]);
    expect((await readStore(page, 'setlists')).map(({ name, songIds }) => ({ name, songIds }))).toEqual([
      { name: 'Friday', songIds: [queen] },
      { name: 'Anywhere', songIds: [] },
      { name: 'ABBA night', songIds: [queen] },
    ]);
    expect(await readStore(page, 'venues')).toHaveLength(2);
  });

  test('R3: saves free-text notes on a song', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 });

    await openSong(page, 'Valerie');
    await expect(details(page)).toContainText('No notes yet.');
    // The pencil beside the notes opens the edit form at the Notes field.
    await button(page, 'Change notes').click();
    await expect(editForm(page).getByLabel('Notes')).toBeFocused();
    await editForm(page).getByLabel('Notes').fill('Skip the bridge\nStarts cold, count in 4');
    await save(page);

    const notes = details(page).getByText('Skip the bridge');
    await expect(notes).toHaveText('Skip the bridge\nStarts cold, count in 4');
    await expect(details(page)).not.toContainText('No notes yet.');

    // The list keeps its "artist · genre · year" second line.
    await backToList(page);
    await expect(listRow(page, 'Valerie').locator('.sub')).toHaveText('Amy Winehouse · Soul · 2006');
    await expect(listRow(page, 'Valerie')).not.toContainText('Skip the bridge');

    await page.reload();
    await openSong(page, 'Valerie');
    await expect(details(page).getByText('Skip the bridge')).toHaveText('Skip the bridge\nStarts cold, count in 4');
    await button(page, 'Edit').click();
    await expect(editForm(page).getByLabel('Notes')).toHaveValue('Skip the bridge\nStarts cold, count in 4');
  });

  test('R36: edits genre and year', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 });

    await startEditing(page, 'Valerie');
    await expect(editForm(page).getByLabel('Genre')).toHaveValue('Soul');
    await expect(editForm(page).getByLabel('Year')).toHaveValue('2006');
    await editForm(page).getByLabel('Genre').fill('Pop');
    await editForm(page).getByLabel('Year').fill('1985');
    await save(page);
    await expect(songField(page, 'Genre')).toHaveText('Pop');
    await expect(songField(page, 'Year')).toHaveText('1985');

    await backToList(page);
    await expect(listRow(page, 'Valerie').locator('.sub')).toHaveText('Amy Winehouse · Pop · 1985');
    await page.reload();
    await expect(listRow(page, 'Valerie').locator('.sub')).toHaveText('Amy Winehouse · Pop · 1985');

    // A year outside 1900-2100 is not saved.
    await startEditing(page, 'Valerie');
    await editForm(page).getByLabel('Year').fill('1800');
    await editForm(page).getByRole('button', { name: 'Save' }).click();
    await expect(editForm(page)).toBeVisible();
    await editForm(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(songField(page, 'Year')).toHaveText('1985');

    // Both can be cleared.
    await button(page, 'Edit').click();
    await editForm(page).getByLabel('Genre').fill('');
    await editForm(page).getByLabel('Year').fill('');
    await save(page);
    await expect(songField(page, 'Genre')).toHaveText('—');
    await expect(songField(page, 'Year')).toHaveText('—');
    await backToList(page);
    await expect(listRow(page, 'Valerie').locator('.sub')).toHaveText('Amy Winehouse');
    const [song] = await readStore(page, 'songs');
    expect(song).toMatchObject({ genre: '', year: null });
  });

  test('R2: edits tags (R5), key (R6), status (R7) and rating (R4), and they survive a reload', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });

    await startEditing(page, 'Valerie');
    await expect(editForm(page).getByLabel('Status')).toHaveValue(''); // not set (R64)
    await expect(editForm(page).getByLabel('Rating')).toHaveValue('');
    await editForm(page).getByLabel('Tags').fill('duet, Crowd-pleaser, DUET, ');
    await editForm(page).getByLabel('Key').fill('-2');
    await editForm(page).getByLabel('Status').selectOption({ label: 'Want to try' });
    await editForm(page).getByLabel('Rating').selectOption({ label: '4' });
    await save(page);

    const expectShown = async () => {
      await expect(tagChips(page)).toHaveText(['duet', 'Crowd-pleaser']);
      await expect(keyValue(page)).toHaveText('−2');
      await expect(page.locator('.song-key-big')).toHaveText('−2');
      await expectStatus(page, 'Want to try');
      await expectRating(page, 4);
    };
    await expectShown();

    await page.reload();
    await openSong(page, 'Valerie');
    await expectShown();

    await button(page, 'Edit').click();
    await expect(editForm(page).getByLabel('Tags')).toHaveValue('duet, Crowd-pleaser');
    await expect(editForm(page).getByLabel('Key')).toHaveValue('-2');
    await expect(editForm(page).getByLabel('Status')).toHaveValue('want-to-try');
    await expect(editForm(page).getByLabel('Rating')).toHaveValue('4');

    const [song] = await readStore(page, 'songs');
    expect(song).toMatchObject({ tags: ['duet', 'Crowd-pleaser'], key: '-2', status: 'want-to-try', rating: 4 });

    // Every status can be chosen, and the optional fields can be cleared.
    await editForm(page).getByLabel('Status').selectOption({ label: 'Retired' });
    await editForm(page).getByLabel('Rating').selectOption({ label: 'No rating' });
    await editForm(page).getByLabel('Tags').fill('');
    await editForm(page).getByLabel('Key').fill('');
    await save(page);
    await expectStatus(page, 'Retired');
    await expectRating(page, null);
    await expect(tagChips(page)).toHaveCount(0);
    await expect(keyValue(page)).toHaveText('0');
    await expect(page.locator('.song-key')).toBeHidden(); // no key, so the header shows none

    await page.reload();
    await openSong(page, 'Valerie');
    await expectStatus(page, 'Retired');
    await expectRating(page, null);
    const [cleared] = await readStore(page, 'songs');
    expect(cleared).toMatchObject({ tags: [], key: '', status: 'retired', rating: null });
  });

  test('R70: the song page edits key, status and rating in place and toggles the song on tonight\'s set', async ({ page }) => {
    await openApp(page);
    const { songIds } = await seed(page, {
      songs: [
        { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006, key: '-1', notes: 'Starts cold', tags: ['duet'] },
        { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 },
      ],
      venues: ['The Crown', 'Anchor'],
      sings: [
        { title: 'Valerie', venue: 'The Crown', date: '2026-10-01' },
        { title: 'Valerie', venue: 'Anchor', date: '2026-11-05' },
      ],
    });
    await chooseVenue(page, 'The Crown');
    await songRow(page, 'Dancing Queen').locator('.set-toggle').click();
    await expect(songRow(page, 'Dancing Queen').locator('.set-toggle')).toHaveText('✓');
    await openSong(page, 'Valerie');

    // The header is for the KJ: title, artist and the key with its meaning.
    await expect(details(page).locator('.song-artist')).toHaveText('Amy Winehouse');
    await expect(page.locator('.song-key-big')).toHaveText('−1');
    await expect(page.locator('.song-key-words')).toHaveText('one semitone down');
    await expect(details(page).locator('.song-notes')).toHaveText('Starts cold');
    await expect(tagChips(page)).toHaveText(['duet']);
    await expect(songField(page, 'Here')).toHaveText(hereText(1, '1 Oct'));
    await expect(songField(page, 'All venues')).toHaveText(hereText(2, '5 Nov'));
    await expect(songField(page, 'Genre')).toHaveText('Soul');
    await expect(songField(page, 'Year')).toHaveText('2006');
    await expect(songField(page, 'KaraFun')).toHaveText('No');
    await expectAllTapTargets(page, 'Song page');

    // The key steps a semitone at a time and saves each tap; 0 is no key.
    await expect(keyValue(page)).toHaveText('−1');
    await button(page, 'Key up a semitone').click();
    await expect(keyValue(page)).toHaveText('0');
    await expect(page.locator('.song-key')).toBeHidden();
    await expect.poll(async () => (await storedSong(page, 'Valerie')).key).toBe('');
    await button(page, 'Key up a semitone').click();
    await expect(keyValue(page)).toHaveText('+1');
    await expect(page.locator('.song-key-words')).toHaveText('one semitone up');
    await expect.poll(async () => (await storedSong(page, 'Valerie')).key).toBe('+1');
    await button(page, 'Key down a semitone').click();
    await button(page, 'Key down a semitone').click();
    await button(page, 'Key down a semitone').click();
    await expect(keyValue(page)).toHaveText('−2');
    await expect.poll(async () => (await storedSong(page, 'Valerie')).key).toBe('-2');

    // Status: one of three; tapping the chosen one again clears it (R64).
    await expectStatus(page, null);
    await statusToggle(page, 'Active').click();
    await expectStatus(page, 'Active');
    await expect.poll(async () => (await storedSong(page, 'Valerie')).status).toBe('go-to');
    await statusToggle(page, 'Retired').click();
    await expectStatus(page, 'Retired');
    await expect.poll(async () => (await storedSong(page, 'Valerie')).status).toBe('retired');
    await statusToggle(page, 'Retired').click();
    await expectStatus(page, null);
    await expect.poll(async () => (await storedSong(page, 'Valerie')).status).toBe('');

    // Rating: 1 to 5, the numbers up to it lit; tapping it again clears it.
    await rateToggle(page, 4).click();
    await expectRating(page, 4);
    await expect(details(page).locator('.rate.lit')).toHaveText(['1', '2', '3', '4']);
    await expect.poll(async () => (await storedSong(page, 'Valerie')).rating).toBe(4);
    await rateToggle(page, 4).click();
    await expectRating(page, null);
    await expect.poll(async () => (await storedSong(page, 'Valerie')).rating).toBe(null);
    await rateToggle(page, 2).click();
    await expect.poll(async () => (await storedSong(page, 'Valerie')).rating).toBe(2);

    // Tonight's set: Add to set puts it at the end, and On set takes it out.
    const crownSet = async () => (await readStore(page, 'setlists')).find((s) => s.name === 'The Crown').songIds;
    const toggle = button(page, 'Add Valerie to the set');
    await expect(toggle).toHaveText('Add to set');
    await expectTapTarget(toggle);
    await toggle.click();
    await expect(button(page, 'Remove Valerie from the set')).toHaveText('On set · 02');
    await expect.poll(crownSet).toEqual([songIds['Dancing Queen'], songIds.Valerie]);
    await button(page, 'Remove Valerie from the set').click();
    await expect(button(page, 'Add Valerie to the set')).toHaveText('Add to set');
    await expect.poll(crownSet).toEqual([songIds['Dancing Queen']]);
    await button(page, 'Add Valerie to the set').click();
    await expect.poll(crownSet).toEqual([songIds['Dancing Queen'], songIds.Valerie]);

    // Back in the list the + shows it; a reload keeps every change.
    await backToSongs(page);
    await expect(songRow(page, 'Valerie').locator('.set-toggle')).toHaveText('✓');
    await page.reload();
    await openSong(page, 'Valerie');
    await expect(keyValue(page)).toHaveText('−2');
    await expectStatus(page, null);
    await expectRating(page, 2);
    await expect(button(page, 'Remove Valerie from the set')).toHaveText('On set · 02');

    // Under Overall there is no "here": the sings are across every venue, and
    // tonight's set is Overall's (R56), here the first list of all.
    await backToSongs(page);
    await chooseVenue(page, 'Overall');
    await openSong(page, 'Valerie');
    await expect(songField(page, 'Here')).toHaveCount(0);
    await expect(songField(page, 'All venues')).toHaveText(hereText(2, '5 Nov'));
    await expect(button(page, 'Remove Valerie from the set')).toHaveText('On set · 02');
  });

  test('R1: will not add a song whose title or artist is only spaces', async ({ page }) => {
    await openApp(page);
    await page.getByText('Add a song', { exact: true }).click();
    const form = page.getByRole('form', { name: 'Add a song' });
    await form.getByLabel('Title').fill('   ');
    await form.getByLabel('Artist').fill('Amy Winehouse');
    await form.getByRole('button', { name: 'Add song' }).click();
    await expect(form.getByRole('alert')).toHaveText('Enter a title.');
    await form.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('0 of 0 songs')).toBeVisible();
  });
});
