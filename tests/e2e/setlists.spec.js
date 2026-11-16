import { test, expect } from '@playwright/test';
import { openApp, addSong, putRecords, readStore, openScope } from './helpers.js';
import { openVenues, venueRow, venueRows, songRecord } from './helpers-venues.js';
import {
  openSetlists, setlistRow, setlistRows, createSetlist, editSetlist, openSetlist, backToSetlists,
  setlistSongRows, setlistSongTitles, setlistSongRow, addToSetlist, removeFromSetlist,
} from './helpers-setlists.js';
import { listsHeading, openSongMenu, deleteOpenList, tonightToggle, inSetLine } from './helpers-lists.js';

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
    await expect(page.getByText('No lists yet.')).toBeVisible();

    // New list opens the form; making the list closes it again.
    await createSetlist(page, '  Friday night  ');
    await expect(setlistRow(page, 'Friday night')).toContainText('Any venue · 0 songs');
    await expect(page.getByRole('form', { name: 'New list' })).toBeHidden();
    await expect(page.locator('.lists-view').getByRole('status')).toHaveText('Made “Friday night”. Open it to find songs for it.');
    await expect(page.getByText('No lists yet.')).toHaveCount(0);
    expect(await readStore(page, 'setlists')).toEqual([
      { id: expect.any(Number), name: 'Friday night', venueId: null, songIds: [] },
    ]);

    // Rename on the list's screen, after first cancelling once.
    let edit = await editSetlist(page, 'Friday night');
    await expect(edit.getByLabel('Setlist name')).toHaveValue('Friday night');
    await edit.getByLabel('Setlist name').fill('Something else');
    await edit.getByRole('button', { name: 'Cancel' }).click();
    await expect(edit).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Friday night', exact: true })).toBeVisible();

    edit = await editSetlist(page, 'Friday night');
    await edit.getByLabel('Setlist name').fill(' Saturday ');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Saturday', exact: true })).toBeVisible();
    await backToSetlists(page);
    await expect(setlistRow(page, 'Saturday')).toBeVisible();
    await expect(setlistRow(page, 'Friday night')).toHaveCount(0);

    await page.reload();
    await openSetlists(page);
    await expect(setlistRows(page)).toHaveCount(1);
    await expect(setlistRow(page, 'Saturday')).toContainText('Any venue · 0 songs');

    // Delete is on the list's screen; afterwards the lists show again.
    dialogs.accept = true;
    await openSetlist(page, 'Saturday');
    await deleteOpenList(page, 'Saturday');
    await expect(listsHeading(page)).toBeVisible();
    await expect(setlistRows(page)).toHaveCount(0);
    await expect(page.getByText('No lists yet.')).toBeVisible();
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
    await expect(setlistRow(page, 'Friday')).toContainText('For The Crown · 2 songs');

    await openSetlist(page, 'Friday');
    await deleteOpenList(page, 'Friday');
    await expect.poll(() => dialogs.messages).toEqual([
      'Delete the setlist “Friday”? It has 2 songs. Your song library is not changed.',
    ]);
    await expect(page.getByRole('heading', { level: 2, name: 'Friday', exact: true })).toBeVisible();
    await backToSetlists(page);
    await expect(setlistRow(page, 'Friday')).toContainText('For The Crown · 2 songs');

    await page.reload();
    await openSetlists(page);
    await expect(setlistRows(page)).toHaveCount(1);
    expect((await readStore(page, 'setlists'))[0].songIds).toEqual([ids.Valerie, ids['Dancing Queen']]);

    // Saying yes deletes only the setlist: songs, sings and the venue stay.
    dialogs.accept = true;
    await openSetlist(page, 'Friday');
    await deleteOpenList(page, 'Friday');
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

    // The dock's field filters the lists by name, with the songs' whole-word rule (R10):
    // "ig" matches inside a word, "night " only the whole word, "nigh " nothing.
    const search = page.getByRole('searchbox', { name: 'Search lists' });
    await search.fill('ig');
    await expect(setlistRows(page).locator('.title')).toHaveText(['Big night']);
    await search.fill('night ');
    await expect(setlistRows(page).locator('.title')).toHaveText(['Big night']);
    await search.fill('nigh ');
    await expect(setlistRows(page)).toHaveCount(0);
    await expect(page.locator('.lists-view .empty')).toHaveText('No lists match “nigh”.');
    await search.fill('');
    await expect(setlistRows(page)).toHaveCount(3);

    const form = page.getByRole('form', { name: 'New list' });
    await page.getByRole('button', { name: 'New list', exact: true }).click();
    await form.getByLabel('Setlist name').fill('  FRIDAY ');
    await form.getByRole('button', { name: 'Create list' }).click();
    await expect(form.getByRole('alert')).toHaveText('There is already a setlist called “friday”.');

    await form.getByLabel('Setlist name').fill('');
    await form.getByRole('button', { name: 'Create list' }).click();
    await expect(form.getByRole('alert')).toHaveText('Enter a setlist name.');

    await form.getByLabel('Setlist name').fill('   ');
    await form.getByRole('button', { name: 'Create list' }).click();
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
    await expect(page.getByRole('heading', { level: 2, name: 'Anywhere', exact: true })).toBeVisible();
    await backToSetlists(page);

    // A setlist may change the case of its own name.
    const own = await editSetlist(page, 'friday');
    await own.getByLabel('Setlist name').fill('Friday');
    await own.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Friday', exact: true })).toBeVisible();
    expect((await readStore(page, 'setlists')).map((s) => s.name).sort()).toEqual(['Anywhere', 'Big night', 'Friday']);
  });

  test('R56: a setlist is labelled for a venue or any venue, and the label can be changed', async ({ page }) => {
    const dialogs = answerDialogs(page);
    await openApp(page);
    const [crown, anchor] = await putRecords(page, 'venues', [{ name: 'The Crown' }, { name: 'Anchor' }]);
    await openSetlists(page);

    // Any venue is the default, then every venue by name.
    await page.getByRole('button', { name: 'New list', exact: true }).click();
    const venue = page.getByRole('form', { name: 'New list' }).getByLabel('For venue (optional)');
    await expect(venue).toHaveValue('');
    await expect(venue.locator('option')).toHaveText(['Any venue', 'Anchor', 'The Crown']);

    await createSetlist(page, 'Crown Friday', 'The Crown');
    await createSetlist(page, 'Anywhere');
    await expect(setlistRow(page, 'Crown Friday')).toContainText('For The Crown · 0 songs');
    await expect(setlistRow(page, 'Anywhere')).toContainText('Any venue · 0 songs');
    const stored = async () => Object.fromEntries((await readStore(page, 'setlists')).map((s) => [s.name, s.venueId]));
    expect(await stored()).toEqual({ 'Crown Friday': crown, Anywhere: null });

    await openSetlist(page, 'Crown Friday');
    await expect(page.getByText('For The Crown', { exact: true })).toBeVisible();
    await backToSetlists(page);
    await openSetlist(page, 'Anywhere');
    await expect(page.getByText('Any venue', { exact: true })).toBeVisible();
    await backToSetlists(page);

    // Clear a label, and label a list for any venue with a venue.
    let edit = await editSetlist(page, 'Crown Friday');
    const editVenue = () => edit.getByLabel('For venue (optional)');
    await expect(editVenue()).toHaveValue(String(crown));
    await editVenue().selectOption({ label: 'Any venue' });
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Any venue', { exact: true })).toBeVisible();
    await backToSetlists(page);
    await expect(setlistRow(page, 'Crown Friday')).toContainText('Any venue · 0 songs');

    edit = await editSetlist(page, 'Anywhere');
    await expect(editVenue()).toHaveValue('');
    await editVenue().selectOption({ label: 'Anchor' });
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('For Anchor', { exact: true })).toBeVisible();
    await backToSetlists(page);
    await expect(setlistRow(page, 'Anywhere')).toContainText('For Anchor · 0 songs');
    expect(await stored()).toEqual({ 'Crown Friday': null, Anywhere: anchor });

    await page.reload();
    await openSetlists(page);
    await openSetlist(page, 'Anywhere');
    await expect(page.getByText('For Anchor', { exact: true })).toBeVisible();

    // History's venue list sees the change: deleting Anchor says its setlist
    // will become Any venue; The Crown has none now.
    await openVenues(page);
    await venueRow(page, 'Anchor').getByRole('button', { name: 'Delete Anchor' }).click();
    await expect.poll(() => dialogs.messages).toEqual([
      'Delete the venue “Anchor”? 1 setlist is labelled for it; it will become Any venue.',
    ]);
    await expect(venueRows(page)).toHaveCount(2);
    dialogs.accept = true;
    await venueRow(page, 'The Crown').getByRole('button', { name: 'Delete The Crown' }).click();
    await expect(venueRows(page)).toHaveCount(1);
    expect(dialogs.messages.at(-1)).toBe('Delete the venue “The Crown”?');
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
    await expect(page.getByText('No songs yet. Find songs to add some, or let Suggest songs pick a few.')).toBeVisible();
    // The setlist screen has no picker of its own now (R57): Find songs goes to
    // the Songs scope. The only search is the dock's, which filters the list.
    await expect(page.getByRole('region', { name: 'Add songs' })).toHaveCount(0);
    await expect(page.getByRole('searchbox')).toHaveCount(1);
    await expect(page.getByRole('searchbox')).toHaveAccessibleName('Search Friday');

    await addToSetlist(page, 'Friday', VALERIE, BRIGHTSIDE, QUEEN);
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Mr. Brightside', 'Dancing Queen']);
    await expect(setlistSongRow(page, 'Valerie')).toContainText('Amy Winehouse');
    await expect(page.getByText('3 songs', { exact: true })).toBeVisible();
    await expect(page.getByText('No songs yet. Find songs to add some, or let Suggest songs pick a few.')).toBeHidden();

    // Songs already in the setlist show ✓ in Find rather than + (R48).
    await page.getByRole('button', { name: 'Find songs', exact: true }).click();
    for (const title of ['Valerie', 'Mr. Brightside', 'Dancing Queen']) {
      await expect(page.getByRole('button', { name: `Remove ${title} from the set`, exact: true })).toHaveText('✓');
    }
    await openSetlists(page);
    await openSetlist(page, 'Friday');

    // Remove keeps the others in order; adding back puts the song at the end.
    await removeFromSetlist(page, BRIGHTSIDE);
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Dancing Queen']);
    await expect(page.getByText('2 songs', { exact: true })).toBeVisible();
    await addToSetlist(page, 'Friday', BRIGHTSIDE);
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Dancing Queen', 'Mr. Brightside']);

    // Tap targets are at least 44 px (R31).
    await openSongMenu(page, 'Valerie');
    const remove = setlistSongRow(page, 'Valerie').getByRole('button', { name: 'Remove Valerie by Amy Winehouse' });
    expect((await remove.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect((await page.getByRole('button', { name: 'Find songs', exact: true }).boundingBox()).height).toBeGreaterThanOrEqual(44);

    await backToSetlists(page);
    await expect(setlistRow(page, 'Friday')).toContainText('Any venue · 3 songs');

    // The same song goes into a second setlist too.
    await openSetlist(page, 'Saturday');
    await addToSetlist(page, 'Saturday', VALERIE);
    await expect(setlistSongTitles(page)).toHaveText(['Valerie']);
    await backToSetlists(page);
    await expect(setlistRow(page, 'Saturday')).toContainText('Any venue · 1 song');
    await expect(setlistRow(page, 'Friday')).toContainText('Any venue · 3 songs');

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

  test('R15: skips songs that no longer exist and finds songs in a large library', async ({ page }) => {
    await openApp(page);
    const many = Array.from({ length: 60 }, (_, i) => ({ title: `Track ${String(i + 1).padStart(2, '0')}`, artist: `Band ${i + 1}` }));
    const ids = await seedSongs(page, [VALERIE, ...many]);
    await putRecords(page, 'setlists', [{ name: 'Friday', venueId: null, songIds: [9999, ids.Valerie] }]);
    await openSetlists(page);
    await expect(setlistRow(page, 'Friday')).toContainText('Any venue · 1 song');

    await openSetlist(page, 'Friday');
    await expect(setlistSongTitles(page)).toHaveText(['Valerie']);
    await expect(page.getByText('1 song', { exact: true })).toBeVisible();

    // Found with the Songs tab's search (R57), which narrows the whole library.
    await page.getByRole('button', { name: 'Find songs', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search songs' }).fill('track 5');
    await expect(page.getByText('10 of 61 songs')).toBeVisible();
    await openSetlists(page);
    await openSetlist(page, 'Friday');
    await addToSetlist(page, 'Friday', { title: 'Track 57', artist: 'Band 57' });
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Track 57']);
    expect((await readStore(page, 'setlists'))[0].songIds).toEqual([9999, ids.Valerie, ids['Track 57']]);
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

    // Sings there as Tonight shows them: times and the latest date, or "New here".
    const here = (title) => setlistSongRow(page, title).locator('.here');
    await expect(here('Valerie')).toHaveText(/^2× · 3 Nov( 2026)?$/);
    await expect(here('Valerie')).toHaveClass(/\bsung\b/);
    // Sung only at another venue, or never sung: new here.
    await expect(here('Dancing Queen')).toHaveText('New here');
    await expect(here('Mr. Brightside')).toHaveText('New here');
    await expect(setlistSongRows(page).locator('.here.sung')).toHaveCount(1);

    // A song added later is flagged straight away when it has been sung here.
    await addToSetlist(page, 'Crown Friday', BLACK);
    await expect(here('Back to Black')).toHaveText(/^1× · 9 Sep( 2026)?$/);

    // Labelling the setlist for another venue moves the flags with it.
    const edit = await editSetlist(page, 'Crown Friday');
    await edit.getByLabel('For venue (optional)').selectOption({ label: 'Anchor' });
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('For Anchor', { exact: true })).toBeVisible();
    await expect(here('Valerie')).toHaveText(/^1× · 11 Nov( 2026)?$/);
    await expect(here('Dancing Queen')).toHaveText(/^1× · 10 Nov( 2026)?$/);
    await expect(here('Mr. Brightside')).toHaveText('New here');
    await expect(here('Back to Black')).toHaveText('New here');
    await expect(setlistSongRows(page).locator('.here.sung')).toHaveCount(2);
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

    await expect(page.getByText('Any venue', { exact: true })).toBeVisible();
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Dancing Queen']);
    await expect(setlistSongRows(page).locator('.here')).toHaveCount(0);
    await expect(page.getByText('New here')).toHaveCount(0);
  });

  test('R15: a song is added to tonight\'s set from another list with +', async ({ page }) => {
    await openApp(page);
    const ids = await seedSongs(page, [VALERIE, QUEEN, BRIGHTSIDE, BLACK]);
    const [crown] = await putRecords(page, 'venues', [{ name: 'The Crown' }]);
    const [crownSat, crowd] = await putRecords(page, 'setlists', [
      { name: 'Crown Saturdays', venueId: crown, songIds: [ids.Valerie] },
      { name: 'Crowd pleasers', venueId: null, songIds: [ids['Dancing Queen'], ids['Mr. Brightside'], ids['Back to Black']] },
    ]);
    // Tonight is at The Crown, with Crown Saturdays as the set.
    await putRecords(page, 'meta', [
      { key: 'findVenueId', value: crown },
      { key: `currentSetlist:${crown}`, value: crownSat },
    ]);
    const stored = async (id) => (await readStore(page, 'setlists')).find((s) => s.id === id).songIds;
    await openSetlists(page);
    await expect(setlistRow(page, 'Crown Saturdays').locator('.list-in-set')).toHaveText('Tonight\'s set');
    await expect(setlistRow(page, 'Crowd pleasers').locator('.list-in-set')).toHaveCount(0);

    // Open Crowd pleasers and drop two songs into tonight.
    await openSetlist(page, 'Crowd pleasers');
    await expect(page.getByText('= in tonight\'s set')).toBeVisible();
    await expect(inSetLine(page)).toHaveText('0 of 3 in tonight\'s set');
    await expect(tonightToggle(page, 'Dancing Queen')).toHaveText('+');
    await tonightToggle(page, 'Dancing Queen').click();
    await tonightToggle(page, 'Back to Black').click();
    await expect(tonightToggle(page, 'Dancing Queen')).toHaveText('✓');
    await expect(tonightToggle(page, 'Back to Black')).toHaveText('✓');
    await expect(tonightToggle(page, 'Mr. Brightside')).toHaveText('+');
    await expect(inSetLine(page)).toHaveText('2 of 3 in tonight\'s set');
    await expect.poll(() => stored(crownSat)).toEqual([ids.Valerie, ids['Dancing Queen'], ids['Back to Black']]);
    expect(await stored(crowd)).toEqual([ids['Dancing Queen'], ids['Mr. Brightside'], ids['Back to Black']]);

    // ✓ takes one out again.
    await tonightToggle(page, 'Back to Black').click();
    await expect(tonightToggle(page, 'Back to Black')).toHaveText('+');
    await expect(inSetLine(page)).toHaveText('1 of 3 in tonight\'s set');
    await expect.poll(() => stored(crownSat)).toEqual([ids.Valerie, ids['Dancing Queen']]);

    // The lists say so, and Tonight has the song after Up next.
    await backToSetlists(page);
    await expect(setlistRow(page, 'Crowd pleasers').locator('.list-in-set')).toHaveText('1 of 3 in tonight\'s set');
    await openScope(page, 'Tonight');
    await expect(page.locator('.up-next .up-title')).toHaveText('Valerie');
    await expect(page.getByRole('list', { name: 'The rest of tonight\'s set' }).locator('li[data-song-id] .title'))
      .toHaveText(['Dancing Queen']);

    // Tonight's set itself has no + or ✓: every song in it is in it.
    await openSetlists(page);
    await openSetlist(page, 'Crown Saturdays');
    await expect(inSetLine(page)).toHaveText('This is tonight\'s set');
    await expect(tonightToggle(page, 'Valerie')).toHaveCount(0);
    await expect(page.getByText('= in tonight\'s set')).toBeHidden();
  });

  test('R75: Make this tonight\'s set on a list\'s screen designates it for the venue', async ({ page }) => {
    await openApp(page);
    const ids = await seedSongs(page, [VALERIE, QUEEN, BRIGHTSIDE]);
    const [crown] = await putRecords(page, 'venues', [{ name: 'The Crown' }]);
    const [crownSat, crowd, empty] = await putRecords(page, 'setlists', [
      { name: 'Crown Saturdays', venueId: crown, songIds: [ids.Valerie] },
      { name: 'Crowd pleasers', venueId: null, songIds: [ids['Dancing Queen'], ids['Mr. Brightside']] },
      { name: 'Empty one', venueId: null, songIds: [] },
    ]);
    await putRecords(page, 'meta', [
      { key: 'findVenueId', value: crown },
      { key: `currentSetlist:${crown}`, value: crownSat },
    ]);
    const meta = async (key) => (await readStore(page, 'meta')).find((r) => r.key === key)?.value;
    const make = page.getByRole('button', { name: 'Make this tonight\'s set', exact: true });
    await openSetlists(page);

    // Tonight's set itself has no button.
    await openSetlist(page, 'Crown Saturdays');
    await expect(inSetLine(page)).toHaveText('This is tonight\'s set');
    await expect(make).toHaveCount(0);
    await backToSetlists(page);

    // Another list has it near the top; it designates the list at The Crown.
    await openSetlist(page, 'Crowd pleasers');
    await expect(inSetLine(page)).toHaveText('0 of 2 in tonight\'s set');
    await expect(tonightToggle(page, 'Dancing Queen')).toHaveText('+');
    const box = await make.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y).toBeLessThan((await page.getByRole('button', { name: 'Find songs', exact: true }).boundingBox()).y);
    await make.click();
    await expect(page.getByRole('status').filter({ hasText: 'tonight\'s set' }))
      .toHaveText('“Crowd pleasers” is tonight\'s set at The Crown.');
    await expect(inSetLine(page)).toHaveText('This is tonight\'s set');
    await expect(make).toHaveCount(0);
    await expect(tonightToggle(page, 'Dancing Queen')).toHaveCount(0); // the + / ✓ give way
    await expect(page.getByText('= in tonight\'s set')).toBeHidden();
    await expect.poll(() => meta(`currentSetlist:${crown}`)).toBe(crowd);

    // The cards and Tonight follow.
    await backToSetlists(page);
    await expect(setlistRow(page, 'Crowd pleasers').locator('.list-in-set')).toHaveText('Tonight\'s set');
    await expect(setlistRow(page, 'Crown Saturdays').locator('.list-in-set')).toHaveCount(0);
    await openScope(page, 'Tonight');
    await expect(page.getByLabel('Set', { exact: true }).locator('option:checked')).toHaveText('Crowd pleasers');
    await expect(page.locator('.up-next .up-title')).toHaveText('Dancing Queen');

    // Under Overall it designates Overall's set, even an empty list, and leaves The Crown's.
    await page.getByLabel('Venue', { exact: true }).selectOption({ label: 'Overall' });
    await expect(page.locator('.venue-menu .menu-text')).toHaveText('Overall');
    await openSetlists(page);
    await openSetlist(page, 'Empty one');
    await make.click();
    await expect(inSetLine(page)).toHaveText('This is tonight\'s set');
    await expect.poll(() => meta('currentSetlist:overall')).toBe(empty);
    expect(await meta(`currentSetlist:${crown}`)).toBe(crowd);
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
