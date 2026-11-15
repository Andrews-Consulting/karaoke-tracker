import { test, expect } from '@playwright/test';
import { openApp, addSong } from './helpers.js';
import {
  openVenues, venueRow, venueRows, addVenue, openVenue, openOverall, backToVenues, logSing,
  historyList, historyRow, historyTitles, readStore, addRecords, songRecord,
} from './helpers-venues.js';
import {
  openHistory, historyHeading, historyChip, showHistoryOf, groupHistory, logSingForm, openLogSing, backToHistory,
  historyDate, historyStat, nightSection,
} from './helpers-lists.js';
import { pageToday } from './helpers-setlists.js';

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
    await logSing(page, { ...VALERIE, date: '2026-10-01' });
    await logSing(page, { ...VALERIE, date: '2026-11-01' });
    await backToVenues(page);

    const row = venueRow(page, 'The Crown');
    await row.getByRole('button', { name: 'Delete The Crown' }).click();
    await expect(row.getByRole('alert')).toHaveText(
      'Can\'t delete “The Crown”: 2 sing log entries still use it. Remove those first.');
    expect(dialogs.messages).toEqual([]);

    await page.reload();
    await openVenues(page);
    await expect(venueRow(page, 'The Crown')).toBeVisible();

    // Once its sing log entries are deleted, the venue can go.
    dialogs.accept = true;
    await openVenue(page, 'The Crown');
    const item = historyRow(page, 'Valerie');
    await item.locator('summary').click();
    await item.getByRole('button', { name: `Delete sing of Valerie on ${historyDate('2026-11-01')}` }).click();
    await expect(item.locator('summary .stat')).toHaveText(historyStat(1, '2026-10-01'));
    await item.getByRole('button', { name: `Delete sing of Valerie on ${historyDate('2026-10-01')}` }).click();
    await expect(page.getByText('Nothing sung at The Crown yet.')).toBeVisible();
    await backToVenues(page);

    await venueRow(page, 'The Crown').getByRole('button', { name: 'Delete The Crown' }).click();
    await expect(venueRows(page)).toHaveCount(0);
    expect(dialogs.messages).toHaveLength(3);
    expect(await readStore(page, 'venues')).toEqual([]);
  });

  test('R8: logs a sing with date and venue and shows times sung and last sung at that venue', async ({ page }) => {
    await openApp(page);
    await addSong(page, VALERIE);
    await addSong(page, QUEEN);
    await addSong(page, BRIGHTSIDE);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await openVenue(page, 'The Crown');
    await expect(page.getByText('Nothing sung at The Crown yet.')).toBeVisible();
    await openLogSing(page);

    // The date starts at today's local calendar day, at the venue History showed.
    const today = await pageToday(page);
    const form = logSingForm(page);
    await expect(form.getByLabel('Date', { exact: true })).toHaveValue(today);
    await expect(form.getByLabel('Venue', { exact: true }).locator('option:checked')).toHaveText('The Crown');
    // A blank search lists nothing, just a hint with the library size.
    await expect(form.getByText('Type to find one of 3 songs.', { exact: true })).toBeVisible();
    await expect(form.getByRole('list', { name: 'Matching songs' }).getByRole('button')).toHaveCount(0);

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

    await backToHistory(page);
    await expect(historyChip(page, 'The Crown')).toHaveAttribute('aria-pressed', 'true');
    await expect(historyTitles(page)).toHaveText(['Valerie', 'Dancing Queen']);
    await expect(historyRow(page, 'Valerie').locator('summary .stat')).toHaveText(historyStat(2, '2026-11-01'));
    await expect(historyRow(page, 'Dancing Queen').locator('summary .stat')).toHaveText(historyStat(1, '2026-10-15'));
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

    await openVenues(page);
    await expect(venueRow(page, 'The Crown')).toContainText('3 sings · last 1 Nov');

    await page.reload();
    await openVenue(page, 'The Crown');
    await expect(historyTitles(page)).toHaveText(['Valerie', 'Dancing Queen']);
    await expect(historyRow(page, 'Valerie').locator('summary .stat')).toHaveText(historyStat(2, '2026-11-01'));
  });

  test('R8: shows overall times sung and last sung across venues', async ({ page }) => {
    await openApp(page);
    await addSong(page, VALERIE);
    await addSong(page, QUEEN);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await addVenue(page, 'Anchor');

    await logSing(page, { ...VALERIE, date: '2026-11-01', venue: 'The Crown' });
    await logSing(page, { ...QUEEN, date: '2026-10-01', venue: 'The Crown' });
    await logSing(page, { ...VALERIE, date: '2026-10-20', venue: 'Anchor' });
    await logSing(page, { ...VALERIE, date: '2026-09-01', venue: 'Anchor' });

    // Per venue: only what was sung there.
    await openVenue(page, 'Anchor');
    await expect(historyTitles(page)).toHaveText(['Valerie']);
    await expect(historyRow(page, 'Valerie').locator('summary .stat')).toHaveText(historyStat(2, '2026-10-20'));

    await openVenues(page);
    await expect(venueRow(page, 'Anchor')).toContainText('2 sings · last 20 Oct');

    // All venues: every venue together.
    await openOverall(page);
    await expect(page.getByRole('searchbox', { name: 'Search every venue\'s history' })).toBeVisible();
    await expect(historyTitles(page)).toHaveText(['Valerie', 'Dancing Queen']);
    await expect(historyRow(page, 'Valerie').locator('summary .stat')).toHaveText(historyStat(3, '2026-11-01'));
    await expect(historyRow(page, 'Dancing Queen').locator('summary .stat')).toHaveText(historyStat(1, '2026-10-01'));
    await expect(page.getByText('4 sings of 2 songs')).toBeVisible();

    // Each sing shows where it happened.
    await historyRow(page, 'Valerie').locator('summary').click();
    await expect(historyRow(page, 'Valerie').locator('.entries li')).toHaveText([
      new RegExp(`^${historyDate('2026-11-01')} · The Crown`),
      new RegExp(`^${historyDate('2026-10-20')} · Anchor`),
      new RegExp(`^${historyDate('2026-09-01')} · Anchor`),
    ]);
  });

  test('R8: requires a date', async ({ page }) => {
    await openApp(page);
    await addSong(page, VALERIE);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await openLogSing(page);

    const form = logSingForm(page);
    await form.getByRole('searchbox', { name: 'Find a song to log' }).fill('Valerie');
    await form.getByRole('button', { name: 'Valerie by Amy Winehouse', exact: true }).click();
    await form.getByLabel('Date', { exact: true }).fill('');
    await form.getByRole('button', { name: 'Log sing' }).click();

    // The browser blocks the empty required date (or the view refuses it).
    await expect(form.getByRole('status', { includeHidden: true })).toHaveText('');
    expect(await readStore(page, 'sings')).toEqual([]);
    await openVenue(page, 'The Crown');
    await expect(page.getByText('Nothing sung at The Crown yet.')).toBeVisible();
  });

  test('R8: requires a song to be picked', async ({ page }) => {
    await openApp(page);
    await addSong(page, VALERIE);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await openLogSing(page);

    const form = logSingForm(page);
    await form.getByLabel('Date', { exact: true }).fill('2026-11-01');
    await form.getByRole('button', { name: 'Log sing' }).click();
    await expect(form.getByRole('alert')).toHaveText('Pick a song first.');
    expect(await readStore(page, 'sings')).toEqual([]);
    await openVenue(page, 'The Crown');
    await expect(page.getByText('Nothing sung at The Crown yet.')).toBeVisible();
  });

  test('R8: deletes a single sing entry after confirming', async ({ page }) => {
    const dialogs = answerDialogs(page);
    await openApp(page);
    await addSong(page, VALERIE);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await logSing(page, { ...VALERIE, date: '2026-10-01' });
    await logSing(page, { ...VALERIE, date: '2026-11-01' });
    await openVenue(page, 'The Crown');

    const item = historyRow(page, 'Valerie');
    await item.locator('summary').click();
    const mistake = item.getByRole('button', { name: `Delete sing of Valerie on ${historyDate('2026-11-01')}` });

    // Saying no keeps it.
    await mistake.click();
    await expect.poll(() => dialogs.messages.length).toBe(1);
    expect(dialogs.messages[0]).toContain('Valerie');
    expect(dialogs.messages[0]).toContain(historyDate('2026-11-01'));
    await expect(item.locator('summary .stat')).toHaveText(historyStat(2, '2026-11-01'));

    dialogs.accept = true;
    await mistake.click();
    await expect(item.locator('summary .stat')).toHaveText(historyStat(1, '2026-10-01'));
    // The row stays open on the remaining entry.
    await expect(item.locator('.entries li')).toHaveText([new RegExp(`^${historyDate('2026-10-01')}`)]);
    expect((await readStore(page, 'sings')).map((s) => s.date)).toEqual(['2026-10-01']);
  });

  test('R8: the song picker stays usable with 500 songs', async ({ page }) => {
    await openApp(page);
    const songs = Array.from({ length: 500 }, (_, i) =>
      songRecord(`Track ${String(i + 1).padStart(3, '0')}`, `Band ${i + 1}`));
    await addRecords(page, 'songs', songs);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await openLogSing(page);

    const form = logSingForm(page);
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
    await openVenue(page, 'The Crown');
    await expect(historyTitles(page)).toHaveText(['Track 499']);
  });

  test('R40: tapping History leaves the venue list for the history', async ({ page }) => {
    await openApp(page);
    await openVenues(page);
    await addVenue(page, 'The Crown');
    await openHistory(page);
    await expect(historyChip(page, 'The Crown')).toBeVisible();
    await expect(page.getByRole('form', { name: 'Add a venue' })).toHaveCount(0);
    await expect(historyList(page)).toHaveCount(0); // nothing sung yet
  });
});

test.describe('History', () => {
  test('R71: Log a sing finds the song by typing, with today as the default date', async ({ page }) => {
    await openApp(page);
    const songIds = await addRecords(page, 'songs', Array.from({ length: 25 }, (_, i) =>
      songRecord(`Song ${String(i + 1).padStart(2, '0')}`, `Band ${i + 1}`)));
    const [crown, anchor] = await addRecords(page, 'venues', [{ name: 'The Crown' }, { name: 'Anchor' }]);
    await addRecords(page, 'meta', [{ key: 'findVenueId', value: anchor }]); // Tonight is at Anchor
    const today = await pageToday(page);

    // History starts at Tonight's venue, with the button and its caption at the top.
    await openHistory(page);
    await expect(historyChip(page, 'Anchor')).toHaveAttribute('aria-pressed', 'true');
    const logButton = page.getByRole('button', { name: 'Log a sing', exact: true });
    await expect(logButton).toHaveAccessibleDescription('Log a sing you forgot, or one from another night');
    await openLogSing(page);

    // The form starts at that venue and today, and lists nothing until I type.
    const form = logSingForm(page);
    await expect(form.getByLabel('Venue', { exact: true }).locator('option:checked')).toHaveText('Anchor');
    await expect(form.getByLabel('Date', { exact: true })).toHaveValue(today);
    await expect(form.getByText('Type to find one of 25 songs.', { exact: true })).toBeVisible();
    const picks = form.getByRole('list', { name: 'Matching songs' }).getByRole('button');
    await expect(picks).toHaveCount(0);

    // A long match list shows 20 and asks me to narrow it; typing more does.
    const search = form.getByRole('searchbox', { name: 'Find a song to log' });
    await search.fill('song');
    await expect(form.getByText('Showing 20 of 25 matches. Type more to narrow the search.')).toBeVisible();
    await expect(picks).toHaveCount(20);
    await search.fill('band 2'); // Band 2 and Band 20 to 25, by artist
    await expect(form.getByText('7 matches', { exact: true })).toBeVisible();
    await form.getByRole('button', { name: 'Song 02 by Band 2', exact: true }).click();
    await expect(form.getByText('Song: Song 02 — Band 2')).toBeVisible();

    // Logged today at Anchor, as the form started; then one from another night elsewhere.
    await form.getByRole('button', { name: 'Log sing' }).click();
    await expect(form.getByRole('status')).toHaveText(`Logged “Song 02” at Anchor on ${historyDate(today)}.`);
    await logSing(page, { title: 'Song 25', artist: 'Band 25', date: '2026-10-03', venue: 'The Crown' });
    expect((await readStore(page, 'sings')).map(({ songId, venueId, date }) => ({ songId, venueId, date }))).toEqual([
      { songId: songIds[1], venueId: anchor, date: today },
      { songId: songIds[24], venueId: crown, date: '2026-10-03' },
    ]);

    // Back in History, each shows at its own venue; today's says so.
    await backToHistory(page);
    await expect(historyTitles(page)).toHaveText(['Song 02']);
    await historyRow(page, 'Song 02').locator('summary').click();
    await expect(historyRow(page, 'Song 02').locator('.entries li')).toHaveText([new RegExp(`^${historyDate(today)} · tonight`)]);
    await showHistoryOf(page, 'The Crown');
    await expect(historyTitles(page)).toHaveText(['Song 25']);
  });

  test('R72: a song\'s history opens to its sings and one can be deleted', async ({ page }) => {
    const dialogs = answerDialogs(page);
    await openApp(page);
    const [valerie, queen, jolene] = await addRecords(page, 'songs', [
      songRecord('Valerie', 'Amy Winehouse'), songRecord('Dancing Queen', 'ABBA'), songRecord('Jolene', 'Dolly Parton'),
    ]);
    const [crown, anchor] = await addRecords(page, 'venues', [{ name: 'The Crown' }, { name: 'Anchor' }]);
    await addRecords(page, 'sings', [
      { songId: valerie, venueId: crown, date: '2026-09-12' },
      { songId: valerie, venueId: crown, date: '2026-10-17' },
      { songId: queen, venueId: crown, date: '2026-10-17' },
      { songId: jolene, venueId: anchor, date: '2026-11-01' },
    ]);
    await openVenue(page, 'The Crown');
    await expect(page.getByRole('searchbox', { name: 'Search The Crown\'s history' })).toBeVisible();

    // By song: each song with its times and last sung here, closed.
    await expect(historyTitles(page)).toHaveText(['Valerie', 'Dancing Queen']);
    const item = historyRow(page, 'Valerie');
    await expect(item.locator('summary .stat')).toHaveText(historyStat(2, '2026-10-17'));
    await expect(item.locator('details')).toHaveJSProperty('open', false);

    // Opened: each sing there, newest first, with Delete, which asks first.
    await item.locator('summary').click();
    await expect(item.locator('.entries .date')).toHaveText([historyDate('2026-10-17'), historyDate('2026-09-12')]);
    const mistake = item.getByRole('button', { name: `Delete sing of Valerie on ${historyDate('2026-09-12')}` });
    await mistake.click();
    await expect.poll(() => dialogs.messages).toEqual([`Delete this sing of “Valerie” on ${historyDate('2026-09-12')}?`]);
    await expect(item.locator('.entries li')).toHaveCount(2);
    dialogs.accept = true;
    await mistake.click();
    await expect(item.locator('.entries .date')).toHaveText([historyDate('2026-10-17')]);
    await expect(item.locator('summary .stat')).toHaveText(historyStat(1, '2026-10-17'));
    await expect.poll(async () => (await readStore(page, 'sings')).length).toBe(3);

    // By night: the same sings by date, the latest logged first, each with Delete.
    await groupHistory(page, 'By night');
    await expect(page.locator('.history-night h3')).toHaveText([historyDate('2026-10-17')]);
    const night = nightSection(page, '2026-10-17');
    await expect(night.locator('.title')).toHaveText(['Dancing Queen', 'Valerie']);
    await night.getByRole('button', { name: `Delete sing of Dancing Queen on ${historyDate('2026-10-17')}` }).click();
    await expect(night.locator('.title')).toHaveText(['Valerie']);
    expect(dialogs.messages.at(-1)).toBe(`Delete this sing of “Dancing Queen” on ${historyDate('2026-10-17')}?`);

    // All venues: every venue's nights, each sing saying where.
    await showHistoryOf(page, 'All venues');
    await expect(page.locator('.history-night h3')).toHaveText([historyDate('2026-11-01'), historyDate('2026-10-17')]);
    await expect(nightSection(page, '2026-11-01').locator('.sub')).toHaveText(['Dolly Parton · Anchor']);
    await groupHistory(page, 'By song');
    await expect(historyTitles(page)).toHaveText(['Jolene', 'Valerie']);

    // The field searches the history by title or artist.
    const field = page.getByRole('searchbox', { name: 'Search every venue\'s history' });
    await field.fill('dolly');
    await expect(historyTitles(page)).toHaveText(['Jolene']);
    await field.fill('abba'); // sung, but deleted just now
    await expect(page.getByText('Nothing in this history matches “abba”.')).toBeVisible();
    await field.fill('');
    await expect(historyTitles(page)).toHaveText(['Jolene', 'Valerie']);
    await expect(historyHeading(page)).toBeVisible();
  });
});
