// The Songs scope: a venue or "overall" with times sung per song (R37, R8),
// never sung here or not since a date (R41), tag, status and rating (R11),
// genre and decade (R42), in the Filters sheet, with the filters on as
// tokens (R69). Every filter combines with the search (R10).
import { test, expect } from '@playwright/test';
import { openApp, openSong, openScope } from './helpers.js';
import { openVenues, venueRow, venueRows } from './helpers-venues.js';
import { openSetlists, setlistRow, setlistRows } from './helpers-setlists.js';
import {
  seed, reloadList, venueSelect, expectRememberedVenue, filtersForm, openFilters, closeFilters, filtersSheet, filter,
  choose, shownTitles, songRow, sungLine, expectTapTarget, chooseVenue, findContext, songSearch, backToSongs,
  expectFilterCount, filterTokens, removeToken, hereText,
} from './helpers-find.js';

const VALERIE = { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 };
const QUEEN = { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 };
const BRIGHTSIDE = { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 };
const AFRICA = { title: 'Africa', artist: 'Toto', genre: 'Rock', year: 1982 };

const search = songSearch;

// The venue the Songs scope works at, from its line at the top.
const atVenue = (page, name) => expect(findContext(page)).toHaveText(new RegExp(`^${name} · `));

test.describe('Find', () => {
  test('R37: selecting a venue shows times sung and last sung there in the list', async ({ page }) => {
    await openApp(page);
    const { venueIds } = await seed(page, {
      songs: [VALERIE, QUEEN, BRIGHTSIDE],
      venues: ['The Crown', 'Anchor'],
      sings: [
        { title: 'Valerie', venue: 'The Crown', date: '2026-10-01' },
        { title: 'Valerie', venue: 'The Crown', date: '2026-09-20' },
        { title: 'Valerie', venue: 'Anchor', date: '2026-11-05' },
        { title: 'Dancing Queen', venue: 'The Crown', date: '2026-10-15' },
      ],
    });

    // Overall by default. The venue is picked on Tonight: every venue by name, then Overall.
    await atVenue(page, 'Overall');
    await openScope(page, 'Tonight');
    await expect(venueSelect(page)).toHaveValue('');
    await expect(venueSelect(page).locator('option')).toHaveText(['Anchor', 'The Crown', 'Overall', 'Manage venues…']);
    await expectTapTarget(venueSelect(page));
    await openScope(page, 'Songs');
    await expect(sungLine(page, 'Valerie')).toHaveText(hereText(3, '5 Nov'));
    await expect(sungLine(page, 'Dancing Queen')).toHaveText(hereText(1, '15 Oct'));
    await expect(sungLine(page, 'Mr. Brightside')).toHaveText('Never sung');
    // The artist line is unchanged.
    await expect(songRow(page, 'Valerie').locator('.sub')).toHaveText('Amy Winehouse · Soul · 2006');

    await chooseVenue(page, 'The Crown');
    await expect(sungLine(page, 'Valerie')).toHaveText(hereText(2, '1 Oct'));
    await expect(sungLine(page, 'Dancing Queen')).toHaveText(hereText(1, '15 Oct'));
    await expect(sungLine(page, 'Mr. Brightside')).toHaveText('New here');
    await expect(page.getByText('3 of 3 songs')).toBeVisible();

    await chooseVenue(page, 'Anchor');
    await expect(sungLine(page, 'Valerie')).toHaveText(hereText(1, '5 Nov'));
    await expect(sungLine(page, 'Dancing Queen')).toHaveText('New here');

    // Opening a song and coming back keeps the venue, and so does another scope.
    await openSong(page, 'Valerie');
    await backToSongs(page);
    await atVenue(page, 'Anchor');
    await expect(sungLine(page, 'Valerie')).toHaveText(hereText(1, '5 Nov'));

    await openVenues(page);
    await openScope(page, 'Songs');
    await atVenue(page, 'Anchor');
    await expect(sungLine(page, 'Dancing Queen')).toHaveText('New here');
    await openScope(page, 'Tonight');
    await expect(venueSelect(page)).toHaveValue(String(venueIds.Anchor));
  });

  test('R37: the venue selection survives a reload', async ({ page }) => {
    await openApp(page);
    const { venueIds } = await seed(page, {
      songs: [VALERIE],
      venues: ['The Crown', 'Spare room'],
      sings: [{ title: 'Valerie', venue: 'The Crown', date: '2026-10-01' }],
    });

    await chooseVenue(page, 'The Crown');
    await expectRememberedVenue(page, venueIds['The Crown']);
    await reloadList(page, 1);
    await atVenue(page, 'The Crown');
    await expect(sungLine(page, 'Valerie')).toHaveText(hereText(1, '1 Oct'));

    await chooseVenue(page, 'Spare room');
    await expectRememberedVenue(page, venueIds['Spare room']);
    await reloadList(page, 1);
    await atVenue(page, 'Spare room');
    await expect(sungLine(page, 'Valerie')).toHaveText('New here');

    // Once the remembered venue is deleted, the list falls back to Overall.
    // Picking it opened a set labelled for it (R47), which does not hold up
    // the delete: the set becomes a list for any venue (R56).
    await openSetlists(page);
    await expect(setlistRows(page)).toHaveCount(2);
    await openVenues(page);
    page.once('dialog', (dialog) => dialog.accept());
    await venueRow(page, 'Spare room').getByRole('button', { name: 'Delete Spare room' }).click();
    await expect(venueRows(page)).toHaveCount(1);
    await openSetlists(page);
    await expect(setlistRow(page, 'Spare room')).toContainText('Any venue');
    await openScope(page, 'Songs');
    await atVenue(page, 'Overall');
    await expect(sungLine(page, 'Valerie')).toHaveText(hereText(1, '1 Oct'));
    await openScope(page, 'Tonight');
    await expect(venueSelect(page)).toHaveValue('');
    await expect(venueSelect(page).locator('option')).toHaveText(['The Crown', 'Overall', 'Manage venues…']);
    await openScope(page, 'Songs');
    await reloadList(page, 1);
    await atVenue(page, 'Overall');

    // Overall is remembered too.
    await chooseVenue(page, 'The Crown');
    await expectRememberedVenue(page, venueIds['The Crown']);
    await chooseVenue(page, 'Overall');
    await expectRememberedVenue(page, null);
    await reloadList(page, 1);
    await atVenue(page, 'Overall');
  });

  test('R41: filters to songs never sung at the selected venue', async ({ page }) => {
    await openApp(page);
    await seed(page, {
      songs: [VALERIE, QUEEN, BRIGHTSIDE],
      venues: ['The Crown', 'Anchor'],
      sings: [
        { title: 'Valerie', venue: 'The Crown', date: '2026-10-01' },
        { title: 'Dancing Queen', venue: 'Anchor', date: '2026-10-08' },
      ],
    });

    // The filters are put away in a sheet behind the dock's filter button.
    await expectFilterCount(page, 0);
    await expect(filtersForm(page)).toBeHidden();

    await chooseVenue(page, 'The Crown');
    await openFilters(page);
    await choose(page, 'Sung', 'Never at this venue');
    await expect(shownTitles(page)).toHaveText(['Dancing Queen', 'Mr. Brightside']);
    await expect(page.getByText('2 of 3 songs')).toBeVisible();
    await expectFilterCount(page, 1);

    await chooseVenue(page, 'Anchor');
    await expect(shownTitles(page)).toHaveText(['Mr. Brightside', 'Valerie']);
    await openFilters(page);
    await expect(filter(page, 'Sung').locator('option:checked')).toHaveText('Never at this venue');

    // Overall: never sung anywhere.
    await chooseVenue(page, 'Overall');
    await openFilters(page);
    await expect(filter(page, 'Sung').locator('option:checked')).toHaveText('Never');
    await expect(shownTitles(page)).toHaveText(['Mr. Brightside']);
    await expect(sungLine(page, 'Mr. Brightside')).toHaveText('Never sung');

    // Combines with the search.
    await closeFilters(page);
    await search(page).fill('valerie');
    await expect(page.getByText('0 of 3 songs')).toBeVisible();
    await expect(page.getByText('No songs match the search and filters.')).toBeVisible();
    await search(page).fill('');
    await openFilters(page);
    await choose(page, 'Sung', 'Any');
    await expect(page.getByText('3 of 3 songs')).toBeVisible();
    await expectFilterCount(page, 0);
  });

  test('R41: filters to songs not sung since a date', async ({ page }) => {
    await openApp(page);
    await seed(page, {
      songs: [VALERIE, QUEEN, BRIGHTSIDE, AFRICA],
      venues: ['The Crown', 'Anchor'],
      sings: [
        { title: 'Valerie', venue: 'The Crown', date: '2026-08-01' },
        { title: 'Valerie', venue: 'The Crown', date: '2026-10-01' },
        { title: 'Dancing Queen', venue: 'The Crown', date: '2026-09-15' },
        { title: 'Mr. Brightside', venue: 'Anchor', date: '2026-11-01' },
      ],
    });

    await chooseVenue(page, 'The Crown');
    await openFilters(page);
    await expect(filter(page, 'Since')).toBeHidden();
    await choose(page, 'Sung', 'Not since');
    // No date yet: nothing is filtered.
    await expect(filter(page, 'Since')).toBeVisible();
    await expectTapTarget(filter(page, 'Since'));
    await expect(page.getByText('4 of 4 songs')).toBeVisible();
    await expectFilterCount(page, 0);

    // Last sung there on the day itself counts as sung since.
    await filter(page, 'Since').fill('2026-10-01');
    await expect(shownTitles(page)).toHaveText(['Africa', 'Dancing Queen', 'Mr. Brightside']);
    await expectFilterCount(page, 1);
    await expect(filterTokens(page)).toHaveText([/^not here since 1 Oct( 2026)?$/]);

    await filter(page, 'Since').fill('2026-10-02');
    await expect(shownTitles(page)).toHaveText(['Africa', 'Dancing Queen', 'Mr. Brightside', 'Valerie']);

    await filter(page, 'Since').fill('2026-09-15');
    await expect(shownTitles(page)).toHaveText(['Africa', 'Mr. Brightside']);

    // Overall looks at every venue.
    await filter(page, 'Since').fill('2026-10-15');
    await expect(shownTitles(page)).toHaveText(['Africa', 'Dancing Queen', 'Mr. Brightside', 'Valerie']);
    await chooseVenue(page, 'Overall');
    await expect(shownTitles(page)).toHaveText(['Africa', 'Dancing Queen', 'Valerie']);
    await expect(page.getByText('3 of 4 songs')).toBeVisible();
    await expect(filterTokens(page)).toHaveText([/^not sung since 15 Oct( 2026)?$/]);

    await openFilters(page);
    await choose(page, 'Sung', 'Any');
    await expect(filter(page, 'Since')).toBeHidden();
    await expect(page.getByText('4 of 4 songs')).toBeVisible();
  });

  test('R11: tag, status and rating filters combine', async ({ page }) => {
    await openApp(page);
    await seed(page, {
      songs: [
        { ...VALERIE, tags: ['duet', 'Crowd-pleaser'], status: 'go-to', rating: 5 },
        { ...QUEEN, tags: ['crowd-pleaser'], status: 'go-to', rating: 3 },
        { title: 'Islands in the Stream', artist: 'Dolly Parton', tags: ['Duet'], status: 'want-to-try', rating: 4 },
        { ...BRIGHTSIDE, tags: [], status: 'retired', rating: null },
      ],
    });
    await openFilters(page);

    // Each tag once, whatever its case.
    await expect(filter(page, 'Tag').locator('option')).toHaveText(['Any tag', 'crowd-pleaser', 'Duet']);
    await expect(filter(page, 'Status').locator('option')).toHaveText(['Any status', 'Go-to', 'Want to try', 'Retired', 'Not set']);
    await expect(filter(page, 'Rating').locator('option')).toHaveText(['Any rating', '5', '4+', '3+', '2+', '1+']);
    for (const label of ['Tag', 'Status', 'Rating']) await expectTapTarget(filter(page, label));

    await choose(page, 'Tag', 'Duet');
    await expect(shownTitles(page)).toHaveText(['Islands in the Stream', 'Valerie']);
    await expect(page.getByText('2 of 4 songs')).toBeVisible();

    await choose(page, 'Status', 'Go-to');
    await expect(shownTitles(page)).toHaveText(['Valerie']);
    await expectFilterCount(page, 2);

    await choose(page, 'Status', 'Any status');
    await choose(page, 'Rating', '4+');
    await expect(shownTitles(page)).toHaveText(['Islands in the Stream', 'Valerie']);
    await choose(page, 'Rating', '5');
    await expect(shownTitles(page)).toHaveText(['Valerie']);
    await choose(page, 'Rating', '4+');

    // With the search too; then a trip to the song and its edit form keeps it all.
    await closeFilters(page);
    await search(page).fill('islands');
    await expect(shownTitles(page)).toHaveText(['Islands in the Stream']);
    await expect(page.getByText('1 of 4 songs')).toBeVisible();
    await openSong(page, 'Islands in the Stream');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('form', { name: 'Edit song' }).getByRole('button', { name: 'Cancel' }).click();
    await backToSongs(page);
    await expect(search(page)).toHaveValue('islands');
    await expect(filterTokens(page)).toHaveText(['Duet', 'rated 4+']);
    await expectFilterCount(page, 2);
    await expect(page.getByText('1 of 4 songs')).toBeVisible();
    await openFilters(page);
    await expect(filter(page, 'Tag')).toHaveValue('Duet');
    await expect(filter(page, 'Rating')).toHaveValue('4');

    // Clear filters keeps the search.
    await expectTapTarget(filtersForm(page).getByRole('button', { name: 'Clear filters' }));
    await filtersForm(page).getByRole('button', { name: 'Clear filters' }).click();
    await expect(filter(page, 'Tag')).toHaveValue('');
    await expect(filter(page, 'Rating')).toHaveValue('');
    await closeFilters(page);
    await expectFilterCount(page, 0);
    await expect(search(page)).toHaveValue('islands');
    await expect(page.getByText('1 of 4 songs')).toBeVisible();
    await search(page).fill('');

    // Unrated songs only match "Any rating".
    await openFilters(page);
    await choose(page, 'Rating', '1+');
    await expect(shownTitles(page)).toHaveText(['Dancing Queen', 'Islands in the Stream', 'Valerie']);
    await choose(page, 'Rating', 'Any rating');
    await choose(page, 'Status', 'Retired');
    await expect(shownTitles(page)).toHaveText(['Mr. Brightside']);
  });

  test('R42: filters by genre and decade and sorts by decade', async ({ page }) => {
    await openApp(page);
    await seed(page, {
      songs: [
        VALERIE,
        { title: 'Rehab', artist: 'Amy Winehouse', genre: 'soul', year: 2006 },
        QUEEN,
        { title: 'Take On Me', artist: 'a-ha', genre: 'Pop', year: 1985 },
        AFRICA,
        { title: 'Mystery Song', artist: 'Nobody' },
      ],
    });
    await openFilters(page);

    // Each genre once, whatever its case; decades from the years in use.
    await expect(filter(page, 'Genre').locator('option')).toHaveText(['Any genre', 'Pop', 'Rock', 'soul']);
    await expect(filter(page, 'Decade').locator('option')).toHaveText(['Any decade', '1970s', '1980s', '2000s']);
    for (const label of ['Genre', 'Decade', 'Sort by']) await expectTapTarget(filter(page, label));

    await choose(page, 'Genre', 'soul');
    await expect(shownTitles(page)).toHaveText(['Rehab', 'Valerie']);

    await choose(page, 'Genre', 'Any genre');
    await choose(page, 'Decade', '1980s');
    await expect(shownTitles(page)).toHaveText(['Africa', 'Take On Me']);

    await choose(page, 'Genre', 'Pop');
    await expect(shownTitles(page)).toHaveText(['Take On Me']);
    await expectFilterCount(page, 2);

    await filtersForm(page).getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByText('6 of 6 songs')).toBeVisible();

    // Sorts: songs without a year or genre go last; ties go by title.
    await choose(page, 'Sort by', 'Decade');
    await expect(shownTitles(page)).toHaveText(
      ['Dancing Queen', 'Africa', 'Take On Me', 'Rehab', 'Valerie', 'Mystery Song']);
    await expectFilterCount(page, 0);

    await choose(page, 'Sort by', 'Decade, newest first');
    await expect(shownTitles(page)).toHaveText(
      ['Rehab', 'Valerie', 'Africa', 'Take On Me', 'Dancing Queen', 'Mystery Song']);

    await choose(page, 'Sort by', 'Genre');
    await expect(shownTitles(page)).toHaveText(
      ['Dancing Queen', 'Take On Me', 'Africa', 'Rehab', 'Valerie', 'Mystery Song']);

    // Sorting combines with the filters and the search.
    await choose(page, 'Decade', '2000s');
    await expect(shownTitles(page)).toHaveText(['Rehab', 'Valerie']);
    await closeFilters(page);
    await search(page).fill('rehab');
    await expect(shownTitles(page)).toHaveText(['Rehab']);

    // Clear filters resets the sort too.
    await search(page).fill('');
    await openFilters(page);
    await filtersForm(page).getByRole('button', { name: 'Clear filters' }).click();
    await expect(filter(page, 'Sort by')).toHaveValue('title');
    await expect(shownTitles(page)).toHaveText(
      ['Africa', 'Dancing Queen', 'Mystery Song', 'Rehab', 'Take On Me', 'Valerie']);
  });

  test('R69: active filters show as tokens that remove one at a time, and Clear all resets them', async ({ page }) => {
    await openApp(page);
    await seed(page, {
      songs: [
        { ...VALERIE, tags: ['duet'], rating: 5 },
        { ...QUEEN, rating: 4 },
        { ...BRIGHTSIDE, rating: 4 },
        { ...AFRICA, rating: 2 },
      ],
      venues: ['The Crown'],
      sings: [{ title: 'Mr. Brightside', venue: 'The Crown', date: '2026-10-01' }],
    });
    await chooseVenue(page, 'The Crown');
    const clearAll = page.getByRole('button', { name: 'Clear all', exact: true });

    // No filters: no tokens and no Clear all; the sort shows as a token that opens the sheet.
    await expect(page.getByText('No filters', { exact: true })).toBeVisible();
    await expect(filterTokens(page)).toHaveCount(0);
    await expect(clearAll).toHaveCount(0);
    const sort = page.getByRole('button', { name: 'Sort: Title. Change sort' });
    await expectTapTarget(sort);
    await sort.click();
    await expect(filtersSheet(page)).toBeVisible();

    // The list behind the sheet follows each choice, and Done says how many it shows.
    await choose(page, 'Genre', 'Rock');
    await expect(filtersSheet(page).locator('.sheet-done')).toHaveText('Show 2 songs');
    await choose(page, 'Sung', 'Never at this venue');
    await expect(filtersSheet(page).locator('.sheet-done')).toHaveText('Show 1 song');
    await choose(page, 'Rating', '4+');
    await expect(filtersSheet(page).locator('.sheet-done')).toHaveText('Done');
    await choose(page, 'Sort by', 'Artist');
    await closeFilters(page);

    await expect(filterTokens(page)).toHaveText(['never here', 'rated 4+', 'Rock']);
    await expect(page.getByText('3 filters on', { exact: true })).toBeVisible();
    await expectFilterCount(page, 3);
    await expect(page.getByText('0 of 4 songs')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sort: Artist. Change sort' })).toBeVisible();
    for (const token of await filterTokens(page).all()) await expectTapTarget(token);
    await expectTapTarget(clearAll);

    // Each × turns one filter off.
    await removeToken(page, 'rated 4+').click();
    await expect(filterTokens(page)).toHaveText(['never here', 'Rock']);
    await expect(shownTitles(page)).toHaveText(['Africa']);
    await expectFilterCount(page, 2);
    await removeToken(page, 'never here').click();
    await expect(filterTokens(page)).toHaveText(['Rock']);
    await expect(page.getByText('1 filter on', { exact: true })).toBeVisible();
    await expect(shownTitles(page)).toHaveText(['Mr. Brightside', 'Africa']); // by artist: The Killers, Toto
    await expect(page.getByText('2 of 4 songs')).toBeVisible();

    // The sheet shows them off too, and what is left survives a reload (R53).
    await openFilters(page);
    await expect(filter(page, 'Sung')).toHaveValue('any');
    await expect(filter(page, 'Rating')).toHaveValue('');
    await choose(page, 'Tag', 'duet');
    await closeFilters(page);
    await expect(filterTokens(page)).toHaveText(['duet', 'Rock']);
    await page.reload(); // nothing matches both, so the count is 0 of 4
    await expect(page.getByText('0 of 4 songs')).toBeVisible();
    await expect(filterTokens(page)).toHaveText(['duet', 'Rock']);
    await expect(page.getByRole('button', { name: 'Remove filter: tag duet' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove filter: genre Rock' })).toBeVisible();

    // Clear all turns every filter off and puts the sort back to Title, as Clear filters does.
    await clearAll.click();
    await expect(filterTokens(page)).toHaveCount(0);
    await expect(clearAll).toHaveCount(0);
    await expect(page.getByText('No filters', { exact: true })).toBeVisible();
    await expectFilterCount(page, 0);
    await expect(page.getByText('4 of 4 songs')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sort: Title. Change sort' })).toBeFocused();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('findFilters')).genre)).toBe('');
  });

  test('R69: the back gesture closes the Filters sheet and keeps what was chosen', async ({ page }) => {
    await openApp(page);
    await seed(page, { songs: [VALERIE, QUEEN, BRIGHTSIDE, AFRICA] });
    await openFilters(page);
    await choose(page, 'Genre', 'Rock');
    await page.goBack();
    await expect(filtersForm(page)).toBeHidden();
    await expect(search(page)).toBeVisible();
    await expect(filterTokens(page)).toHaveText(['Rock']);
    await expect(page.getByText('2 of 4 songs')).toBeVisible();

    // Tapping outside the sheet closes it too; the Songs scope is the only screen again.
    await openFilters(page);
    await page.locator('.sheet-backdrop').click({ position: { x: 8, y: 8 } });
    await expect(filtersForm(page)).toBeHidden();
    await page.goBack();
    expect(page.url()).toBe('about:blank');
  });
});
