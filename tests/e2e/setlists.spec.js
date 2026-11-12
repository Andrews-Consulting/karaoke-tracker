import { test, expect } from '@playwright/test';
import { openApp, addSong, putRecords, readStore } from './helpers.js';
import { openVenues, venueRow, venueRows, songRecord } from './helpers-venues.js';
import {
  openSetlists, setlistRow, setlistRows, createSetlist, editSetlist, openSetlist, backToSetlists,
  setlistSongRows, setlistSongTitles, setlistSongRow, addArea, addToSetlist, removeFromSetlist,
} from './helpers-setlists.js';

const VALERIE = { title: 'Valerie', artist: 'Amy Winehouse' };
const QUEEN = { title: 'Dancing Queen', artist: 'ABBA' };
const BRIGHTSIDE = { title: 'Mr. Brightside', artist: 'The Killers' };
const BLACK = { title: 'Back to Black', artist: 'Amy Winehouse' };

// Records every confirm() and answers it with whatever `answer.accept` says at the time.
function answerDialogs(page) {
  const answer = { accept: false, messages: [] };
  page.on('dialog', (dialog) => {
    answer.messages.push(dialog.message());
    if (answer.accept) dialog.accept();
    else dialog.dismiss();
  });
  return answer;
}

// Stores songs directly and returns { title: id }.
async function seedSongs(page, songs) {
  const ids = await putRecords(page, 'songs', songs.map((s) => songRecord(s.title, s.artist)));
  return Object.fromEntries(songs.map((s, i) => [s.title, ids[i]]));
}

test.describe('Setlists', () => {
  test('R14: creates, renames and deletes a setlist', async ({ page }) => {
    const dialogs = answerDialogs(page);
    await openApp(page);
    await openSetlists(page);
    await expect(page.getByText('No setlists yet.')).toBeVisible();

    await createSetlist(page, '  Friday night  ');
    await expect(setlistRow(page, 'Friday night')).toContainText('General · 0 songs');
    await expect(page.getByRole('form', { name: 'New setlist' }).getByLabel('Setlist name')).toHaveValue('');
    await expect(page.getByText('No setlists yet.')).toHaveCount(0);
    expect(await readStore(page, 'setlists')).toEqual([
      { id: expect.any(Number), name: 'Friday night', venueId: null, songIds: [] },
    ]);

    // Rename, after first cancelling once.
    let edit = await editSetlist(page, 'Friday night');
    await expect(edit.getByLabel('Setlist name')).toHaveValue('Friday night');
    await edit.getByLabel('Setlist name').fill('Something else');
    await edit.getByRole('button', { name: 'Cancel' }).click();
    await expect(setlistRow(page, 'Friday night')).toBeVisible();

    edit = await editSetlist(page, 'Friday night');
    await edit.getByLabel('Setlist name').fill(' Saturday ');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(setlistRow(page, 'Saturday')).toBeVisible();
    await expect(setlistRow(page, 'Friday night')).toHaveCount(0);

    await page.reload();
    await openSetlists(page);
    await expect(setlistRows(page)).toHaveCount(1);
    await expect(setlistRow(page, 'Saturday')).toContainText('General · 0 songs');

    dialogs.accept = true;
    await setlistRow(page, 'Saturday').getByRole('button', { name: 'Delete Saturday' }).click();
    await expect(setlistRows(page)).toHaveCount(0);
    await expect(page.getByText('No setlists yet.')).toBeVisible();
    expect(dialogs.messages).toEqual(['Delete the setlist “Saturday”? It has no songs.']);

    await page.reload();
    await openSetlists(page);
    await expect(setlistRows(page)).toHaveCount(0);
    expect(await readStore(page, 'setlists')).toEqual([]);
  });

  test('R14: keeps the setlist when the delete confirmation is dismissed', async ({ page }) => {
    const dialogs = answerDialogs(page);
    await openApp(page);
    const ids = await seedSongs(page, [VALERIE, QUEEN]);
    const [crown] = await putRecords(page, 'venues', [{ name: 'The Crown' }]);
    await putRecords(page, 'sings', [{ songId: ids.Valerie, venueId: crown, date: '2026-10-01' }]);
    await putRecords(page, 'setlists', [{ name: 'Friday', venueId: crown, songIds: [ids.Valerie, ids['Dancing Queen']] }]);
    await openSetlists(page);
    await expect(setlistRow(page, 'Friday')).toContainText('The Crown · 2 songs');

    await setlistRow(page, 'Friday').getByRole('button', { name: 'Delete Friday' }).click();
    await expect.poll(() => dialogs.messages).toEqual([
      'Delete the setlist “Friday”? It has 2 songs. Your song library is not changed.',
    ]);
    await expect(setlistRow(page, 'Friday')).toContainText('The Crown · 2 songs');

    await page.reload();
    await openSetlists(page);
    await expect(setlistRows(page)).toHaveCount(1);
    expect((await readStore(page, 'setlists'))[0].songIds).toEqual([ids.Valerie, ids['Dancing Queen']]);

    // Saying yes deletes only the setlist: songs, sings and the venue stay.
    dialogs.accept = true;
    await setlistRow(page, 'Friday').getByRole('button', { name: 'Delete Friday' }).click();
    await expect(setlistRows(page)).toHaveCount(0);
    expect(await readStore(page, 'setlists')).toEqual([]);
    expect(await readStore(page, 'songs')).toHaveLength(2);
    expect(await readStore(page, 'sings')).toHaveLength(1);
    expect(await readStore(page, 'venues')).toHaveLength(1);
  });

  test('R14: lists setlists by name and refuses empty and duplicate names', async ({ page }) => {
    await openApp(page);
    await openSetlists(page);
    await createSetlist(page, 'friday');
    await createSetlist(page, 'Anywhere');
    await createSetlist(page, 'Big night');
    await expect(setlistRows(page).locator('.title')).toHaveText(['Anywhere', 'Big night', 'friday']);

    const form = page.getByRole('form', { name: 'New setlist' });
    await form.getByLabel('Setlist name').fill('  FRIDAY ');
    await form.getByRole('button', { name: 'Create setlist' }).click();
    await expect(form.getByRole('alert')).toHaveText('There is already a setlist called “friday”.');

    await form.getByLabel('Setlist name').fill('');
    await form.getByRole('button', { name: 'Create setlist' }).click();
    await expect(form.getByRole('alert')).toHaveText('Enter a setlist name.');

    await form.getByLabel('Setlist name').fill('   ');
    await form.getByRole('button', { name: 'Create setlist' }).click();
    await expect(form.getByRole('alert')).toHaveText('Enter a setlist name.');
    await expect(setlistRows(page)).toHaveCount(3);

    // Renaming onto another setlist's name is refused, and so is a blank name.
    const edit = await editSetlist(page, 'Anywhere');
    await edit.getByLabel('Setlist name').fill('big NIGHT');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit.getByRole('alert')).toHaveText('There is already a setlist called “Big night”.');
    await edit.getByLabel('Setlist name').fill(' ');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit.getByRole('alert')).toHaveText('Enter a setlist name.');
    await edit.getByRole('button', { name: 'Cancel' }).click();
    await expect(setlistRow(page, 'Anywhere')).toBeVisible();

    // A setlist may change the case of its own name.
    const own = await editSetlist(page, 'friday');
    await own.getByLabel('Setlist name').fill('Friday');
    await own.getByRole('button', { name: 'Save' }).click();
    await expect(setlistRow(page, 'Friday')).toBeVisible();
    expect((await readStore(page, 'setlists')).map((s) => s.name).sort()).toEqual(['Anywhere', 'Big night', 'Friday']);
  });

  test('R39: a setlist is general or tied to a venue, and the venue can be changed', async ({ page }) => {
    const dialogs = answerDialogs(page);
    await openApp(page);
    const [crown, anchor] = await putRecords(page, 'venues', [{ name: 'The Crown' }, { name: 'Anchor' }]);
    await openSetlists(page);

    // General is the default, then every venue by name.
    const venue = page.getByRole('form', { name: 'New setlist' }).getByLabel('Venue');
    await expect(venue).toHaveValue('');
    await expect(venue.locator('option')).toHaveText(['General', 'Anchor', 'The Crown']);

    await createSetlist(page, 'Crown Friday', 'The Crown');
    await createSetlist(page, 'Anywhere');
    await expect(setlistRow(page, 'Crown Friday')).toContainText('The Crown · 0 songs');
    await expect(setlistRow(page, 'Anywhere')).toContainText('General · 0 songs');
    const stored = async () => Object.fromEntries((await readStore(page, 'setlists')).map((s) => [s.name, s.venueId]));
    expect(await stored()).toEqual({ 'Crown Friday': crown, Anywhere: null });

    await openSetlist(page, 'Crown Friday');
    await expect(page.getByText('At The Crown', { exact: true })).toBeVisible();
    await backToSetlists(page);
    await openSetlist(page, 'Anywhere');
    await expect(page.getByText('General setlist', { exact: true })).toBeVisible();
    await backToSetlists(page);

    // Change a venue setlist to general, and a general one to a venue.
    let edit = await editSetlist(page, 'Crown Friday');
    await expect(edit.getByLabel('Venue')).toHaveValue(String(crown));
    await edit.getByLabel('Venue').selectOption({ label: 'General' });
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(setlistRow(page, 'Crown Friday')).toContainText('General · 0 songs');

    edit = await editSetlist(page, 'Anywhere');
    await expect(edit.getByLabel('Venue')).toHaveValue('');
    await edit.getByLabel('Venue').selectOption({ label: 'Anchor' });
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(setlistRow(page, 'Anywhere')).toContainText('Anchor · 0 songs');
    expect(await stored()).toEqual({ 'Crown Friday': null, Anywhere: anchor });

    await page.reload();
    await openSetlists(page);
    await openSetlist(page, 'Anywhere');
    await expect(page.getByText('At Anchor', { exact: true })).toBeVisible();

    // The Venues tab sees the change: Anchor is now in use, The Crown is free.
    await openVenues(page);
    await venueRow(page, 'Anchor').getByRole('button', { name: 'Delete Anchor' }).click();
    await expect(venueRow(page, 'Anchor').getByRole('alert')).toHaveText(
      'Can\'t delete “Anchor”: 0 sing log entries and 1 setlist still use it. Remove those first.');
    dialogs.accept = true;
    await venueRow(page, 'The Crown').getByRole('button', { name: 'Delete The Crown' }).click();
    await expect(venueRows(page)).toHaveCount(1);
  });

  test('R15: adds and removes songs, and a song can be in two setlists', async ({ page }) => {
    await openApp(page);
    await addSong(page, VALERIE);
    await addSong(page, QUEEN);
    await addSong(page, BRIGHTSIDE);
    await openSetlists(page);
    await createSetlist(page, 'Friday');
    await createSetlist(page, 'Saturday');

    await openSetlist(page, 'Friday');
    await expect(page.getByText('0 songs', { exact: true })).toBeVisible();
    await expect(page.getByText('No songs yet. Add some below.')).toBeVisible();
    const area = addArea(page);
    await expect(area.getByText('3 songs', { exact: true })).toBeVisible();
    await expect(area.getByRole('list', { name: 'Songs to add' }).getByRole('button')).toHaveCount(3);

    await addToSetlist(page, VALERIE);
    await addToSetlist(page, BRIGHTSIDE);
    await addToSetlist(page, QUEEN);
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Mr. Brightside', 'Dancing Queen']);
    await expect(setlistSongRow(page, 'Valerie')).toContainText('Amy Winehouse');
    await expect(page.getByText('3 songs', { exact: true })).toBeVisible();
    await expect(page.getByText('No songs yet. Add some below.')).toBeHidden();

    // Songs already in the setlist are not offered again.
    const search = area.getByRole('searchbox', { name: 'Find a song to add' });
    await search.fill('');
    await expect(area.getByText('Every song is already in this setlist.')).toBeVisible();
    await search.fill('amy');
    await expect(area.getByText('No other songs match.')).toBeVisible();
    await expect(area.getByRole('list', { name: 'Songs to add' }).getByRole('button')).toHaveCount(0);

    // Remove keeps the others in order; adding back puts the song at the end.
    await removeFromSetlist(page, BRIGHTSIDE);
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Dancing Queen']);
    await expect(page.getByText('2 songs', { exact: true })).toBeVisible();
    await addToSetlist(page, BRIGHTSIDE);
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Dancing Queen', 'Mr. Brightside']);

    // Tap targets are at least 44 px (R31).
    const remove = setlistSongRow(page, 'Valerie').getByRole('button', { name: 'Remove Valerie by Amy Winehouse' });
    expect((await remove.boundingBox()).height).toBeGreaterThanOrEqual(44);

    await backToSetlists(page);
    await expect(setlistRow(page, 'Friday')).toContainText('General · 3 songs');

    // The same song goes into a second setlist too.
    await openSetlist(page, 'Saturday');
    await expect(area.getByRole('list', { name: 'Songs to add' }).getByRole('button')).toHaveCount(3);
    const pick = area.getByRole('button', { name: 'Add Valerie by Amy Winehouse' });
    expect((await pick.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await addToSetlist(page, VALERIE);
    await expect(setlistSongTitles(page)).toHaveText(['Valerie']);
    await backToSetlists(page);
    await expect(setlistRow(page, 'Saturday')).toContainText('General · 1 song');
    await expect(setlistRow(page, 'Friday')).toContainText('General · 3 songs');

    const songs = await readStore(page, 'songs');
    const idOf = (title) => songs.find((s) => s.title === title).id;
    const setlists = Object.fromEntries((await readStore(page, 'setlists')).map((s) => [s.name, s.songIds]));
    expect(setlists).toEqual({
      Friday: [idOf('Valerie'), idOf('Dancing Queen'), idOf('Mr. Brightside')],
      Saturday: [idOf('Valerie')],
    });
    expect(songs).toHaveLength(3);

    await page.reload();
    await openSetlists(page);
    await openSetlist(page, 'Friday');
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Dancing Queen', 'Mr. Brightside']);
  });

  test('R15: a quick double tap adds a song only once', async ({ page }) => {
    await openApp(page);
    const ids = await seedSongs(page, [VALERIE]);
    await putRecords(page, 'setlists', [{ name: 'Friday', venueId: null, songIds: [] }]);
    await openSetlists(page);
    await openSetlist(page, 'Friday');

    await addArea(page).getByRole('button', { name: 'Add Valerie by Amy Winehouse' }).dblclick();
    await expect(setlistSongRows(page)).toHaveCount(1);
    await expect.poll(async () => (await readStore(page, 'setlists'))[0].songIds).toEqual([ids.Valerie]);
  });

  test('R15: skips songs that no longer exist and finds songs in a large library', async ({ page }) => {
    await openApp(page);
    const many = Array.from({ length: 60 }, (_, i) => ({ title: `Track ${String(i + 1).padStart(2, '0')}`, artist: `Band ${i + 1}` }));
    const ids = await seedSongs(page, [VALERIE, ...many]);
    await putRecords(page, 'setlists', [{ name: 'Friday', venueId: null, songIds: [9999, ids.Valerie] }]);
    await openSetlists(page);
    await expect(setlistRow(page, 'Friday')).toContainText('General · 1 song');

    await openSetlist(page, 'Friday');
    await expect(setlistSongTitles(page)).toHaveText(['Valerie']);
    await expect(page.getByText('1 song', { exact: true })).toBeVisible();

    const area = addArea(page);
    const picks = area.getByRole('list', { name: 'Songs to add' }).getByRole('button');
    await expect(area.getByText('Showing 20 of 60 songs. Type more to narrow the search.')).toBeVisible();
    await expect(picks).toHaveCount(20);
    await area.getByRole('searchbox', { name: 'Find a song to add' }).fill('track 5');
    await expect(area.getByText('10 matches', { exact: true })).toBeVisible();
    await addToSetlist(page, { title: 'Track 57', artist: 'Band 57' });
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Track 57']);
  });

  test('R43: flags songs already sung at the setlist\'s venue with the last date', async ({ page }) => {
    await openApp(page);
    const ids = await seedSongs(page, [VALERIE, QUEEN, BRIGHTSIDE, BLACK]);
    const [crown, anchor] = await putRecords(page, 'venues', [{ name: 'The Crown' }, { name: 'Anchor' }]);
    await putRecords(page, 'sings', [
      // Logged out of date order: the flag must show the latest date, not the last logged.
      { songId: ids.Valerie, venueId: crown, date: '2026-11-03' },
      { songId: ids.Valerie, venueId: crown, date: '2026-10-01' },
      { songId: ids.Valerie, venueId: anchor, date: '2026-11-11' },
      { songId: ids['Dancing Queen'], venueId: anchor, date: '2026-11-10' },
      { songId: ids['Back to Black'], venueId: crown, date: '2026-09-09' },
    ]);
    await putRecords(page, 'setlists', [{
      name: 'Crown Friday', venueId: crown, songIds: [ids.Valerie, ids['Dancing Queen'], ids['Mr. Brightside']],
    }]);
    await openSetlists(page);
    await openSetlist(page, 'Crown Friday');

    await expect(setlistSongRow(page, 'Valerie').locator('.flag')).toHaveText('Sung here · last 2026-11-03');
    // Sung only at another venue, or never sung: no flag.
    await expect(setlistSongRow(page, 'Dancing Queen')).not.toContainText('Sung here');
    await expect(setlistSongRow(page, 'Mr. Brightside')).not.toContainText('Sung here');
    await expect(setlistSongRows(page).locator('.flag')).toHaveCount(1);

    // A song added later is flagged straight away when it has been sung here.
    await addToSetlist(page, BLACK);
    await expect(setlistSongRow(page, 'Back to Black').locator('.flag')).toHaveText('Sung here · last 2026-09-09');

    // Moving the setlist to another venue moves the flags with it.
    await backToSetlists(page);
    const edit = await editSetlist(page, 'Crown Friday');
    await edit.getByLabel('Venue').selectOption({ label: 'Anchor' });
    await edit.getByRole('button', { name: 'Save' }).click();
    await openSetlist(page, 'Crown Friday');
    await expect(page.getByText('At Anchor', { exact: true })).toBeVisible();
    await expect(setlistSongRow(page, 'Valerie').locator('.flag')).toHaveText('Sung here · last 2026-11-11');
    await expect(setlistSongRow(page, 'Dancing Queen').locator('.flag')).toHaveText('Sung here · last 2026-11-10');
    await expect(setlistSongRow(page, 'Mr. Brightside').locator('.flag')).toHaveCount(0);
    await expect(setlistSongRow(page, 'Back to Black').locator('.flag')).toHaveCount(0);
  });

  test('R43: a general setlist shows no sung flags', async ({ page }) => {
    await openApp(page);
    const ids = await seedSongs(page, [VALERIE, QUEEN]);
    const [crown] = await putRecords(page, 'venues', [{ name: 'The Crown' }]);
    await putRecords(page, 'sings', [
      { songId: ids.Valerie, venueId: crown, date: '2026-11-03' },
      { songId: ids['Dancing Queen'], venueId: crown, date: '2026-10-01' },
    ]);
    await putRecords(page, 'setlists', [{ name: 'Anywhere', venueId: null, songIds: [ids.Valerie, ids['Dancing Queen']] }]);
    await openSetlists(page);
    await openSetlist(page, 'Anywhere');

    await expect(page.getByText('General setlist', { exact: true })).toBeVisible();
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Dancing Queen']);
    await expect(setlistSongRows(page).locator('.flag')).toHaveCount(0);
    await expect(page.getByText('Sung here')).toHaveCount(0);
  });

  test('R14: the Setlists tab returns to the setlist list', async ({ page }) => {
    await openApp(page);
    await putRecords(page, 'setlists', [{ name: 'Friday', venueId: null, songIds: [] }]);
    await openSetlists(page);
    await openSetlist(page, 'Friday');
    await openSetlists(page);
    await expect(setlistRow(page, 'Friday')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Songs in this setlist' })).toHaveCount(0);
  });
});
