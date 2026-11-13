// Find on the Songs list: a venue or "overall" with times sung per song (R37,
// R8), never sung here or not since a date (R41), tag, status and rating
// (R11), genre and decade (R42). Every filter combines with the search (R10).
import { test, expect } from '@playwright/test';
import { openApp, openSong } from './helpers.js';
import { openVenues, venueRow, venueRows } from './helpers-venues.js';
import { openSetlists, setlistRow, setlistRows } from './helpers-setlists.js';
import {
  seed, reloadList, venueSelect, expectRememberedVenue, filtersForm, filtersSummary, openFilters, filter, choose,
  shownTitles, songRow, sungLine, expectTapTarget,
} from './helpers-find.js';

const VALERIE = { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 };
const QUEEN = { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 };
const BRIGHTSIDE = { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 };
const AFRICA = { title: 'Africa', artist: 'Toto', genre: 'Rock', year: 1982 };

const search = (page) => page.getByRole('searchbox', { name: 'Search songs' });

async function backToList(page) {
  await page.getByRole('button', { name: 'Back to list' }).click();
  await expect(search(page)).toBeVisible();
}

async function showTab(page, name) {
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name }).click();
}

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

    // Overall by default, then every venue by name.
    await expect(venueSelect(page)).toHaveValue('');
    await expect(venueSelect(page).locator('option')).toHaveText(['Overall', 'Anchor', 'The Crown']);
    await expectTapTarget(venueSelect(page));
    await expect(sungLine(page, 'Valerie')).toHaveText('Sung 3 times · last 2026-11-05');
    await expect(sungLine(page, 'Dancing Queen')).toHaveText('Sung 1 time · last 2026-10-15');
    await expect(sungLine(page, 'Mr. Brightside')).toHaveText('Never sung');
    // The artist line is unchanged.
    await expect(songRow(page, 'Valerie').locator('.sub')).toHaveText('Amy Winehouse · Soul · 2006');

    await venueSelect(page).selectOption({ label: 'The Crown' });
    await expect(sungLine(page, 'Valerie')).toHaveText('Sung 2 times · last 2026-10-01');
    await expect(sungLine(page, 'Dancing Queen')).toHaveText('Sung 1 time · last 2026-10-15');
    await expect(sungLine(page, 'Mr. Brightside')).toHaveText('Never sung here');
    await expect(page.getByText('3 of 3 songs')).toBeVisible();

    await venueSelect(page).selectOption({ label: 'Anchor' });
    await expect(sungLine(page, 'Valerie')).toHaveText('Sung 1 time · last 2026-11-05');
    await expect(sungLine(page, 'Dancing Queen')).toHaveText('Never sung here');

    // Opening a song and coming back keeps the venue, and so does another tab.
    await openSong(page, 'Valerie');
    await backToList(page);
    await expect(venueSelect(page)).toHaveValue(String(venueIds.Anchor));
    await expect(sungLine(page, 'Valerie')).toHaveText('Sung 1 time · last 2026-11-05');

    await openVenues(page);
    await showTab(page, 'Songs');
    await expect(venueSelect(page)).toHaveValue(String(venueIds.Anchor));
    await expect(sungLine(page, 'Dancing Queen')).toHaveText('Never sung here');
  });

  test('R37: the venue selection survives a reload', async ({ page }) => {
    await openApp(page);
    const { venueIds } = await seed(page, {
      songs: [VALERIE],
      venues: ['The Crown', 'Spare room'],
      sings: [{ title: 'Valerie', venue: 'The Crown', date: '2026-10-01' }],
    });

    await venueSelect(page).selectOption({ label: 'The Crown' });
    await expectRememberedVenue(page, venueIds['The Crown']);
    await reloadList(page, 1);
    await expect(venueSelect(page)).toHaveValue(String(venueIds['The Crown']));
    await expect(sungLine(page, 'Valerie')).toHaveText('Sung 1 time · last 2026-10-01');

    await venueSelect(page).selectOption({ label: 'Spare room' });
    await expectRememberedVenue(page, venueIds['Spare room']);
    await reloadList(page, 1);
    await expect(venueSelect(page)).toHaveValue(String(venueIds['Spare room']));
    await expect(sungLine(page, 'Valerie')).toHaveText('Never sung here');

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
    await showTab(page, 'Songs');
    await expect(venueSelect(page)).toHaveValue('');
    await expect(venueSelect(page).locator('option')).toHaveText(['Overall', 'The Crown']);
    await expect(sungLine(page, 'Valerie')).toHaveText('Sung 1 time · last 2026-10-01');
    await reloadList(page, 1);
    await expect(venueSelect(page)).toHaveValue('');

    // Overall is remembered too.
    await venueSelect(page).selectOption({ label: 'The Crown' });
    await expectRememberedVenue(page, venueIds['The Crown']);
    await venueSelect(page).selectOption({ label: 'Overall' });
    await expectRememberedVenue(page, null);
    await reloadList(page, 1);
    await expect(venueSelect(page)).toHaveValue('');
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

    // The filters start collapsed.
    await expect(filtersSummary(page)).toHaveText('Filters');
    await expect(filtersForm(page)).toBeHidden();

    await venueSelect(page).selectOption({ label: 'The Crown' });
    await openFilters(page);
    await choose(page, 'Sung', 'Never at this venue');
    await expect(shownTitles(page)).toHaveText(['Dancing Queen', 'Mr. Brightside']);
    await expect(page.getByText('2 of 3 songs')).toBeVisible();
    await expect(filtersSummary(page)).toHaveText('Filters (1)');

    await venueSelect(page).selectOption({ label: 'Anchor' });
    await expect(shownTitles(page)).toHaveText(['Mr. Brightside', 'Valerie']);
    await expect(filter(page, 'Sung').locator('option:checked')).toHaveText('Never at this venue');

    // Overall: never sung anywhere.
    await venueSelect(page).selectOption({ label: 'Overall' });
    await expect(filter(page, 'Sung').locator('option:checked')).toHaveText('Never');
    await expect(shownTitles(page)).toHaveText(['Mr. Brightside']);
    await expect(sungLine(page, 'Mr. Brightside')).toHaveText('Never sung');

    // Combines with the search.
    await search(page).fill('valerie');
    await expect(page.getByText('0 of 3 songs')).toBeVisible();
    await expect(page.getByText('No songs match the search and filters.')).toBeVisible();
    await search(page).fill('');
    await choose(page, 'Sung', 'Any');
    await expect(page.getByText('3 of 3 songs')).toBeVisible();
    await expect(filtersSummary(page)).toHaveText('Filters');
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

    await venueSelect(page).selectOption({ label: 'The Crown' });
    await openFilters(page);
    await expect(filter(page, 'Since')).toBeHidden();
    await choose(page, 'Sung', 'Not since');
    // No date yet: nothing is filtered.
    await expect(filter(page, 'Since')).toBeVisible();
    await expectTapTarget(filter(page, 'Since'));
    await expect(page.getByText('4 of 4 songs')).toBeVisible();
    await expect(filtersSummary(page)).toHaveText('Filters');

    // Last sung there on the day itself counts as sung since.
    await filter(page, 'Since').fill('2026-10-01');
    await expect(shownTitles(page)).toHaveText(['Africa', 'Dancing Queen', 'Mr. Brightside']);
    await expect(filtersSummary(page)).toHaveText('Filters (1)');

    await filter(page, 'Since').fill('2026-10-02');
    await expect(shownTitles(page)).toHaveText(['Africa', 'Dancing Queen', 'Mr. Brightside', 'Valerie']);

    await filter(page, 'Since').fill('2026-09-15');
    await expect(shownTitles(page)).toHaveText(['Africa', 'Mr. Brightside']);

    // Overall looks at every venue.
    await filter(page, 'Since').fill('2026-10-15');
    await expect(shownTitles(page)).toHaveText(['Africa', 'Dancing Queen', 'Mr. Brightside', 'Valerie']);
    await venueSelect(page).selectOption({ label: 'Overall' });
    await expect(shownTitles(page)).toHaveText(['Africa', 'Dancing Queen', 'Valerie']);
    await expect(page.getByText('3 of 4 songs')).toBeVisible();

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
    await expect(filtersSummary(page)).toHaveText('Filters (2)');

    await choose(page, 'Status', 'Any status');
    await choose(page, 'Rating', '4+');
    await expect(shownTitles(page)).toHaveText(['Islands in the Stream', 'Valerie']);
    await choose(page, 'Rating', '5');
    await expect(shownTitles(page)).toHaveText(['Valerie']);
    await choose(page, 'Rating', '4+');

    // With the search too; then a trip to the song and its edit form keeps it all.
    await search(page).fill('islands');
    await expect(shownTitles(page)).toHaveText(['Islands in the Stream']);
    await expect(page.getByText('1 of 4 songs')).toBeVisible();
    await openSong(page, 'Islands in the Stream');
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('form', { name: 'Edit song' }).getByRole('button', { name: 'Cancel' }).click();
    await backToList(page);
    await expect(search(page)).toHaveValue('islands');
    await expect(filtersForm(page)).toBeVisible();
    await expect(filter(page, 'Tag')).toHaveValue('Duet');
    await expect(filter(page, 'Rating')).toHaveValue('4');
    await expect(filtersSummary(page)).toHaveText('Filters (2)');
    await expect(page.getByText('1 of 4 songs')).toBeVisible();

    // Clear filters keeps the search.
    await expectTapTarget(filtersForm(page).getByRole('button', { name: 'Clear filters' }));
    await filtersForm(page).getByRole('button', { name: 'Clear filters' }).click();
    await expect(filter(page, 'Tag')).toHaveValue('');
    await expect(filter(page, 'Rating')).toHaveValue('');
    await expect(filtersSummary(page)).toHaveText('Filters');
    await expect(search(page)).toHaveValue('islands');
    await expect(page.getByText('1 of 4 songs')).toBeVisible();
    await search(page).fill('');

    // Unrated songs only match "Any rating".
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
    await expect(filtersSummary(page)).toHaveText('Filters (2)');

    await filtersForm(page).getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByText('6 of 6 songs')).toBeVisible();

    // Sorts: songs without a year or genre go last; ties go by title.
    await choose(page, 'Sort by', 'Decade');
    await expect(shownTitles(page)).toHaveText(
      ['Dancing Queen', 'Africa', 'Take On Me', 'Rehab', 'Valerie', 'Mystery Song']);
    await expect(filtersSummary(page)).toHaveText('Filters');

    await choose(page, 'Sort by', 'Decade, newest first');
    await expect(shownTitles(page)).toHaveText(
      ['Rehab', 'Valerie', 'Africa', 'Take On Me', 'Dancing Queen', 'Mystery Song']);

    await choose(page, 'Sort by', 'Genre');
    await expect(shownTitles(page)).toHaveText(
      ['Dancing Queen', 'Take On Me', 'Africa', 'Rehab', 'Valerie', 'Mystery Song']);

    // Sorting combines with the filters and the search.
    await choose(page, 'Decade', '2000s');
    await expect(shownTitles(page)).toHaveText(['Rehab', 'Valerie']);
    await search(page).fill('rehab');
    await expect(shownTitles(page)).toHaveText(['Rehab']);

    // Clear filters resets the sort too.
    await search(page).fill('');
    await filtersForm(page).getByRole('button', { name: 'Clear filters' }).click();
    await expect(filter(page, 'Sort by')).toHaveValue('title');
    await expect(shownTitles(page)).toHaveText(
      ['Africa', 'Dancing Queen', 'Mystery Song', 'Rehab', 'Take On Me', 'Valerie']);
  });
});
