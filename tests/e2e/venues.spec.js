import { test, expect } from '@playwright/test';
import { openApp, addSong } from './helpers.js';
import {
  openVenues, venueRow, venueRows, addVenue, openVenue, openOverall, backToVenues, logSing,
  historyList, historyRow, historyTitles, readStore, addRecords, songRecord,
} from './helpers-venues.js';

const VALERIE = { title: 'Valerie', artist: 'Amy Winehouse' };
const QUEEN = { title: 'Dancing Queen', artist: 'ABBA' };
const BRIGHTSIDE = { title: 'Mr. Brightside', artist: 'The Killers' };

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

test.describe('Venues', () => {
  test('R40: adds, renames and deletes a venue', async ({ page }) => {
    const dialogs = answerDialogs(page);
    await openApp(page);
    await openVenues(page);
    await expect(page.getByText('No venues yet')).toBeVisible();

    await addVenue(page, '  The Crown  ');
    await expect(venueRow(page, 'The Crown')).toContainText('No sings yet');
    await expect(page.getByLabel('Venue name')).toHaveValue('');
    await expect(page.getByText('No venues yet')).toHaveCount(0);

    // Rename, after first cancelling once.
    await venueRow(page, 'The Crown').getByRole('button', { name: 'Rename The Crown' }).click();
    let rename = page.getByRole('form', { name: 'Rename The Crown' });
    await expect(rename.getByRole('textbox')).toHaveValue('The Crown');
    await rename.getByRole('textbox').fill('Something else');
    await rename.getByRole('button', { name: 'Cancel' }).click();
    await expect(venueRow(page, 'The Crown')).toBeVisible();

    await venueRow(page, 'The Crown').getByRole('button', { name: 'Rename The Crown' }).click();
    rename = page.getByRole('form', { name: 'Rename The Crown' });
    await rename.getByRole('textbox').fill(' Crown & Anchor ');
    await rename.getByRole('button', { name: 'Save' }).click();
    await expect(venueRow(page, 'Crown & Anchor')).toBeVisible();
    await expect(venueRow(page, 'The Crown')).toHaveCount(0);

    await page.reload();
    await openVenues(page);
    await expect(venueRows(page)).toHaveCount(1);
    await expect(venueRow(page, 'Crown & Anchor')).toBeVisible();

    // Delete asks first; saying no keeps the venue.
    await venueRow(page, 'Crown & Anchor').getByRole('button', { name: 'Delete Crown & Anchor' }).click();
    await expect.poll(() => dialogs.messages.length).toBe(1);
    expect(dialogs.messages[0]).toContain('Crown & Anchor');
    await expect(venueRow(page, 'Crown & Anchor')).toBeVisible();

    dialogs.accept = true;
    await venueRow(page, 'Crown & Anchor').getByRole('button', { name: 'Delete Crown & Anchor' }).click();
    await expect(venueRows(page)).toHaveCount(0);
    await expect(page.getByText('No venues yet')).toBeVisible();

    await page.reload();
    await openVenues(page);
    await expect(venueRows(page)).toHaveCount(0);
  });

  test('R40: refuses a duplicate venue name', async ({ page }) => {
    await openApp(page);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await addVenue(page, 'Anchor');

    const form = page.getByRole('form', { name: 'Add a venue' });
    await form.getByLabel('Venue name').fill('  the CROWN ');
    await form.getByRole('button', { name: 'Add venue' }).click();
    await expect(form.getByRole('alert')).toHaveText('There is already a venue called “The Crown”.');
    await expect(venueRows(page)).toHaveCount(2);

    await form.getByLabel('Venue name').fill('   ');
    await form.getByRole('button', { name: 'Add venue' }).click();
    await expect(form.getByRole('alert')).toHaveText('Enter a venue name.');
    await expect(venueRows(page)).toHaveCount(2);

    // Renaming onto another venue's name is refused too.
    await venueRow(page, 'Anchor').getByRole('button', { name: 'Rename Anchor' }).click();
    const rename = page.getByRole('form', { name: 'Rename Anchor' });
    await rename.getByRole('textbox').fill('THE CROWN');
    await rename.getByRole('button', { name: 'Save' }).click();
    await expect(rename.getByRole('alert')).toHaveText('There is already a venue called “The Crown”.');
    await rename.getByRole('button', { name: 'Cancel' }).click();
    await expect(venueRow(page, 'Anchor')).toBeVisible();

    // A venue may change the case of its own name.
    await venueRow(page, 'The Crown').getByRole('button', { name: 'Rename The Crown' }).click();
    const own = page.getByRole('form', { name: 'Rename The Crown' });
    await own.getByRole('textbox').fill('THE CROWN');
    await own.getByRole('button', { name: 'Save' }).click();
    await expect(venueRow(page, 'THE CROWN')).toBeVisible();
    await expect(venueRows(page)).toHaveCount(2);
  });

  test('R40: refuses to delete a venue that has sing log entries', async ({ page }) => {
    const dialogs = answerDialogs(page);
    await openApp(page);
    await addSong(page, VALERIE);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await openVenue(page, 'The Crown');
    await logSing(page, { ...VALERIE, date: '2026-10-01' });
    await logSing(page, { ...VALERIE, date: '2026-11-01' });
    await backToVenues(page);

    const row = venueRow(page, 'The Crown');
    await row.getByRole('button', { name: 'Delete The Crown' }).click();
    await expect(row.getByRole('alert')).toHaveText(
      'Can\'t delete “The Crown”: 2 sing log entries and 0 setlists still use it. Remove those first.');
    expect(dialogs.messages).toEqual([]);

    await page.reload();
    await openVenues(page);
    await expect(venueRow(page, 'The Crown')).toBeVisible();

    // Once its sing log entries are deleted, the venue can go.
    dialogs.accept = true;
    await openVenue(page, 'The Crown');
    const item = historyRow(page, 'Valerie');
    await item.locator('summary').click();
    await item.getByRole('button', { name: 'Delete sing of Valerie on 2026-11-01' }).click();
    await expect(item).toContainText('Sung 1 time');
    await item.getByRole('button', { name: 'Delete sing of Valerie on 2026-10-01' }).click();
    await expect(page.getByText('Nothing sung here yet.')).toBeVisible();
    await backToVenues(page);

    await venueRow(page, 'The Crown').getByRole('button', { name: 'Delete The Crown' }).click();
    await expect(venueRows(page)).toHaveCount(0);
    expect(dialogs.messages).toHaveLength(3);
    expect(await readStore(page, 'venues')).toEqual([]);
  });

  test('R40: refuses to delete a venue that has setlists', async ({ page }) => {
    const dialogs = answerDialogs(page);
    await openApp(page);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await addVenue(page, 'Anchor');

    // Setlists have no UI yet (R39, R14), so store them directly.
    const crownId = Number(await venueRow(page, 'The Crown').getAttribute('data-venue-id'));
    await addRecords(page, 'setlists', [
      { name: 'Friday', venueId: crownId, songIds: [] },
      { name: 'Anywhere', venueId: null, songIds: [] },
    ]);
    await openVenues(page);

    await venueRow(page, 'The Crown').getByRole('button', { name: 'Delete The Crown' }).click();
    await expect(venueRow(page, 'The Crown').getByRole('alert')).toHaveText(
      'Can\'t delete “The Crown”: 0 sing log entries and 1 setlist still use it. Remove those first.');
    expect(dialogs.messages).toEqual([]);
    await expect(venueRows(page)).toHaveCount(2);

    // A general setlist does not hold up an unrelated venue.
    dialogs.accept = true;
    await venueRow(page, 'Anchor').getByRole('button', { name: 'Delete Anchor' }).click();
    await expect(venueRows(page)).toHaveCount(1);
    expect(dialogs.messages).toHaveLength(1);
  });

  test('R8: logs a sing with date and venue and shows times sung and last sung at that venue', async ({ page }) => {
    await openApp(page);
    await addSong(page, VALERIE);
    await addSong(page, QUEEN);
    await addSong(page, BRIGHTSIDE);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await openVenue(page, 'The Crown');

    // The date starts at today's local calendar day.
    const today = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const form = page.getByRole('form', { name: 'Log a sing' });
    await expect(form.getByLabel('Date', { exact: true })).toHaveValue(today);
    // A blank search lists nothing, just a hint with the library size.
    await expect(form.getByText('Type to find one of 3 songs.', { exact: true })).toBeVisible();
    await expect(form.getByRole('list', { name: 'Matching songs' }).getByRole('button')).toHaveCount(0);
    await expect(page.getByText('Nothing sung here yet.')).toBeVisible();

    // Searching narrows the picker as I type.
    await form.getByRole('searchbox', { name: 'Find a song to log' }).fill('amy');
    await expect(form.getByRole('list', { name: 'Matching songs' }).getByRole('button')).toHaveCount(1);
    await expect(form.getByText('1 match', { exact: true })).toBeVisible();

    await logSing(page, { ...VALERIE, date: '2026-10-01' });
    await logSing(page, { ...QUEEN, date: '2026-10-15' });
    await logSing(page, { ...VALERIE, date: '2026-11-01' });

    // After logging, the picker is cleared but the date stays for the next song.
    await expect(form.getByRole('searchbox', { name: 'Find a song to log' })).toHaveValue('');
    await expect(form.getByText('No song picked yet.')).toBeVisible();
    await expect(form.getByLabel('Date', { exact: true })).toHaveValue('2026-11-01');

    await expect(historyTitles(page)).toHaveText(['Valerie', 'Dancing Queen']);
    await expect(historyRow(page, 'Valerie')).toContainText('Sung 2 times');
    await expect(historyRow(page, 'Valerie')).toContainText('Last sung 2026-11-01');
    await expect(historyRow(page, 'Dancing Queen')).toContainText('Sung 1 time');
    await expect(historyRow(page, 'Dancing Queen')).toContainText('Last sung 2026-10-15');
    await expect(historyRow(page, 'Mr. Brightside')).toHaveCount(0);
    await expect(page.getByText('3 sings of 2 songs')).toBeVisible();

    // Stored exactly as picked: song, venue and the local 'YYYY-MM-DD' day.
    const sings = await readStore(page, 'sings');
    const venues = await readStore(page, 'venues');
    const songs = await readStore(page, 'songs');
    const idOf = (title) => songs.find((s) => s.title === title).id;
    expect(sings.map(({ songId, venueId, date }) => ({ songId, venueId, date }))).toEqual([
      { songId: idOf('Valerie'), venueId: venues[0].id, date: '2026-10-01' },
      { songId: idOf('Dancing Queen'), venueId: venues[0].id, date: '2026-10-15' },
      { songId: idOf('Valerie'), venueId: venues[0].id, date: '2026-11-01' },
    ]);

    await backToVenues(page);
    await expect(venueRow(page, 'The Crown')).toContainText('3 sings · last 2026-11-01');

    await page.reload();
    await openVenues(page);
    await openVenue(page, 'The Crown');
    await expect(historyTitles(page)).toHaveText(['Valerie', 'Dancing Queen']);
    await expect(historyRow(page, 'Valerie')).toContainText('Sung 2 times');
  });

  test('R8: shows overall times sung and last sung across venues', async ({ page }) => {
    await openApp(page);
    await addSong(page, VALERIE);
    await addSong(page, QUEEN);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await addVenue(page, 'Anchor');

    await openVenue(page, 'The Crown');
    await logSing(page, { ...VALERIE, date: '2026-11-01' });
    await logSing(page, { ...QUEEN, date: '2026-10-01' });
    await backToVenues(page);

    await openVenue(page, 'Anchor');
    await logSing(page, { ...VALERIE, date: '2026-10-20' });
    await logSing(page, { ...VALERIE, date: '2026-09-01' });
    // Per venue: only what was sung here.
    await expect(historyTitles(page)).toHaveText(['Valerie']);
    await expect(historyRow(page, 'Valerie')).toContainText('Sung 2 times');
    await expect(historyRow(page, 'Valerie')).toContainText('Last sung 2026-10-20');
    await backToVenues(page);

    await expect(page.getByRole('button', { name: 'Open overall stats' })).toContainText('All venues · 4 sings · last 2026-11-01');
    await expect(venueRow(page, 'Anchor')).toContainText('2 sings · last 2026-10-20');

    await openOverall(page);
    // Logging needs a venue, so Overall only shows stats.
    await expect(page.getByRole('form', { name: 'Log a sing' })).toHaveCount(0);
    await expect(historyTitles(page)).toHaveText(['Valerie', 'Dancing Queen']);
    await expect(historyRow(page, 'Valerie')).toContainText('Sung 3 times');
    await expect(historyRow(page, 'Valerie')).toContainText('Last sung 2026-11-01');
    await expect(historyRow(page, 'Dancing Queen')).toContainText('Sung 1 time');
    await expect(historyRow(page, 'Dancing Queen')).toContainText('Last sung 2026-10-01');
    await expect(page.getByText('4 sings of 2 songs')).toBeVisible();

    // Each sing shows where it happened.
    await historyRow(page, 'Valerie').locator('summary').click();
    await expect(historyRow(page, 'Valerie').locator('.entries li')).toHaveText([
      /2026-11-01 at The Crown/, /2026-10-20 at Anchor/, /2026-09-01 at Anchor/,
    ]);
  });

  test('R8: requires a date', async ({ page }) => {
    await openApp(page);
    await addSong(page, VALERIE);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await openVenue(page, 'The Crown');

    const form = page.getByRole('form', { name: 'Log a sing' });
    await form.getByRole('searchbox', { name: 'Find a song to log' }).fill('Valerie');
    await form.getByRole('button', { name: 'Valerie by Amy Winehouse', exact: true }).click();
    await form.getByLabel('Date', { exact: true }).fill('');
    await form.getByRole('button', { name: 'Log sing' }).click();

    // The browser blocks the empty required date (or the view refuses it).
    await expect(form.getByRole('status', { includeHidden: true })).toHaveText('');
    await expect(page.getByText('Nothing sung here yet.')).toBeVisible();
    expect(await readStore(page, 'sings')).toEqual([]);
  });

  test('R8: requires a song to be picked', async ({ page }) => {
    await openApp(page);
    await addSong(page, VALERIE);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await openVenue(page, 'The Crown');

    const form = page.getByRole('form', { name: 'Log a sing' });
    await form.getByLabel('Date', { exact: true }).fill('2026-11-01');
    await form.getByRole('button', { name: 'Log sing' }).click();
    await expect(form.getByRole('alert')).toHaveText('Pick a song first.');
    await expect(page.getByText('Nothing sung here yet.')).toBeVisible();
    expect(await readStore(page, 'sings')).toEqual([]);
  });

  test('R8: deletes a single sing entry after confirming', async ({ page }) => {
    const dialogs = answerDialogs(page);
    await openApp(page);
    await addSong(page, VALERIE);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await openVenue(page, 'The Crown');
    await logSing(page, { ...VALERIE, date: '2026-10-01' });
    await logSing(page, { ...VALERIE, date: '2026-11-01' });

    const item = historyRow(page, 'Valerie');
    await item.locator('summary').click();
    const mistake = item.getByRole('button', { name: 'Delete sing of Valerie on 2026-11-01' });

    // Saying no keeps it.
    await mistake.click();
    await expect.poll(() => dialogs.messages.length).toBe(1);
    expect(dialogs.messages[0]).toContain('Valerie');
    expect(dialogs.messages[0]).toContain('2026-11-01');
    await expect(item).toContainText('Sung 2 times');

    dialogs.accept = true;
    await mistake.click();
    await expect(item).toContainText('Sung 1 time');
    await expect(item).toContainText('Last sung 2026-10-01');
    // The row stays open on the remaining entry.
    await expect(item.locator('.entries li')).toHaveText([/2026-10-01/]);
    expect((await readStore(page, 'sings')).map((s) => s.date)).toEqual(['2026-10-01']);
  });

  test('R8: the song picker stays usable with 500 songs', async ({ page }) => {
    await openApp(page);
    const songs = Array.from({ length: 500 }, (_, i) =>
      songRecord(`Track ${String(i + 1).padStart(3, '0')}`, `Band ${i + 1}`));
    await addRecords(page, 'songs', songs);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await openVenue(page, 'The Crown');

    const form = page.getByRole('form', { name: 'Log a sing' });
    const picks = form.getByRole('list', { name: 'Matching songs' }).getByRole('button');
    await expect(form.getByText('Type to find one of 500 songs.', { exact: true })).toBeVisible();
    await expect(picks).toHaveCount(0);

    const search = form.getByRole('searchbox', { name: 'Find a song to log' });
    await search.fill('track'); // every song: capped at 20
    await expect(form.getByText('Showing 20 of 500 matches. Type more to narrow the search.')).toBeVisible();
    await expect(picks).toHaveCount(20);
    await search.fill('track 49'); // Track 490 to Track 499
    await expect(form.getByText('10 matches', { exact: true })).toBeVisible();
    await expect(picks).toHaveCount(10);

    await logSing(page, { title: 'Track 499', artist: 'Band 499', date: '2026-11-01' });
    await expect(historyTitles(page)).toHaveText(['Track 499']);
  });

  test('R40: the Venues tab returns to the venue list', async ({ page }) => {
    await openApp(page);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await openVenue(page, 'The Crown');
    await openVenues(page);
    await expect(venueRow(page, 'The Crown')).toBeVisible();
    await expect(historyList(page)).toHaveCount(0);
  });
});
