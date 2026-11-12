// Song detail, edit and delete (R2), notes (R3), genre and year (R36), and the
// extra fields the edit form holds: tags (R5), key (R6), status (R7), rating (R4).
import { test, expect } from '@playwright/test';
import { openApp, addSong, openSong, putRecords, readStore } from './helpers.js';

const details = (page) => page.getByRole('region', { name: 'Song details' });
const editForm = (page) => page.getByRole('form', { name: 'Edit song' });
const listRow = (page, title) => page.getByRole('listitem').filter({ hasText: title });

// The value shown next to a label in the song's details, e.g. Key → "-2".
const shown = (page, label) =>
  details(page).getByText(label, { exact: true }).locator('xpath=following-sibling::dd[1]');

async function startEditing(page, title) {
  await openSong(page, title);
  await details(page).getByRole('button', { name: 'Edit' }).click();
  await expect(editForm(page)).toBeVisible();
}

async function save(page) {
  await editForm(page).getByRole('button', { name: 'Save' }).click();
  await expect(details(page)).toBeVisible();
}

async function backToList(page) {
  await page.getByRole('button', { name: 'Back to list' }).click();
  await expect(page.getByRole('searchbox', { name: 'Search songs' })).toBeVisible();
}

async function expectTapTarget(locator) {
  const box = await locator.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
}

test.describe('Library', () => {
  test('R2: opens a song from the list and goes back to the same search', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 });
    await addSong(page, { title: 'Dancing Queen', artist: 'ABBA' });

    await page.getByRole('searchbox', { name: 'Search songs' }).fill('amy');
    await expect(page.getByText('1 of 2 songs')).toBeVisible();
    await expectTapTarget(listRow(page, 'Valerie').getByRole('button'));

    await openSong(page, 'Valerie');
    await expect(details(page)).toContainText('Amy Winehouse');
    await expect(shown(page, 'Genre')).toHaveText('Soul');
    await expect(shown(page, 'Year')).toHaveText('2006');
    await expect(shown(page, 'Status')).toHaveText('Go-to');
    await expect(shown(page, 'Rating')).toHaveText('—');
    await expect(shown(page, 'Key')).toHaveText('—');
    for (const name of ['Back to list', 'Edit', 'Delete']) {
      await expectTapTarget(page.getByRole('button', { name }));
    }

    await backToList(page);
    await expect(page.getByRole('searchbox', { name: 'Search songs' })).toHaveValue('amy');
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
    await expect(shown(page, 'Genre')).toHaveText('Soul');

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
    await page.getByRole('button', { name: 'Delete' }).click();

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
    await page.getByRole('button', { name: 'Delete' }).click();
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
    await page.getByRole('button', { name: 'Delete' }).click();
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
    await details(page).getByRole('button', { name: 'Edit' }).click();
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
    await details(page).getByRole('button', { name: 'Edit' }).click();
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
    await expect(shown(page, 'Genre')).toHaveText('Pop');
    await expect(shown(page, 'Year')).toHaveText('1985');

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
    await expect(shown(page, 'Year')).toHaveText('1985');

    // Both can be cleared.
    await details(page).getByRole('button', { name: 'Edit' }).click();
    await editForm(page).getByLabel('Genre').fill('');
    await editForm(page).getByLabel('Year').fill('');
    await save(page);
    await expect(shown(page, 'Genre')).toHaveText('—');
    await expect(shown(page, 'Year')).toHaveText('—');
    await backToList(page);
    await expect(listRow(page, 'Valerie').locator('.sub')).toHaveText('Amy Winehouse');
    const [song] = await readStore(page, 'songs');
    expect(song).toMatchObject({ genre: '', year: null });
  });

  test('R2: edits tags (R5), key (R6), status (R7) and rating (R4), and they survive a reload', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });

    await startEditing(page, 'Valerie');
    await expect(editForm(page).getByLabel('Status')).toHaveValue('go-to');
    await expect(editForm(page).getByLabel('Rating')).toHaveValue('');
    await editForm(page).getByLabel('Tags').fill('duet, Crowd-pleaser, DUET, ');
    await editForm(page).getByLabel('Key').fill('-2');
    await editForm(page).getByLabel('Status').selectOption({ label: 'Want to try' });
    await editForm(page).getByLabel('Rating').selectOption({ label: '4' });
    await save(page);

    const expectShown = async () => {
      await expect(shown(page, 'Tags')).toHaveText('duet, Crowd-pleaser');
      await expect(shown(page, 'Key')).toHaveText('-2');
      await expect(shown(page, 'Status')).toHaveText('Want to try');
      await expect(shown(page, 'Rating')).toHaveText('4 of 5');
    };
    await expectShown();

    await page.reload();
    await openSong(page, 'Valerie');
    await expectShown();

    await details(page).getByRole('button', { name: 'Edit' }).click();
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
    await expect(shown(page, 'Status')).toHaveText('Retired');
    await expect(shown(page, 'Rating')).toHaveText('—');
    await expect(shown(page, 'Tags')).toHaveText('—');
    await expect(shown(page, 'Key')).toHaveText('—');

    await page.reload();
    await openSong(page, 'Valerie');
    await expect(shown(page, 'Status')).toHaveText('Retired');
    await expect(shown(page, 'Rating')).toHaveText('—');
    const [cleared] = await readStore(page, 'songs');
    expect(cleared).toMatchObject({ tags: [], key: '', status: 'retired', rating: null });
  });

  test('R1: will not add a song whose title or artist is only spaces', async ({ page }) => {
    await openApp(page);
    await page.getByText('Add a song', { exact: true }).click();
    const form = page.getByRole('form', { name: 'Add a song' });
    await form.getByLabel('Title').fill('   ');
    await form.getByLabel('Artist').fill('Amy Winehouse');
    await form.getByRole('button', { name: 'Add song' }).click();
    await expect(form.getByRole('alert')).toHaveText('Enter a title.');
    await expect(page.getByText('0 of 0 songs')).toBeVisible();
  });
});
