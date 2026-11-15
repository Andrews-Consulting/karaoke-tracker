// Design pass 1 (R52, R53, R54): hidden "never sung" lines under a sung
// filter, filters that persist across scopes and reloads, and the song shown
// full screen for the KJ.
import { test, expect } from '@playwright/test';
import { openApp, openSong, openScope, expectTab, scopeBar } from './helpers.js';
import {
  seed, songRow, sungLine, openFilters, closeFilters, filter, choose, expectFilterCount, chooseVenue, hereText,
} from './helpers-find.js';

const VALERIE = { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006, tags: ['duet'], key: '-2' };
const QUEEN = { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 };
const BRIGHTSIDE = { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 };

const search = (page) => page.getByRole('searchbox', { name: 'Search songs' });
const kjView = (page) => page.getByRole('region', { name: 'For the KJ' });

async function seedCrown(page) {
  return seed(page, {
    songs: [VALERIE, QUEEN, BRIGHTSIDE],
    venues: ['The Crown'],
    sings: [{ title: 'Valerie', venue: 'The Crown', date: '2026-10-01' }],
  });
}

test.describe('Design pass 1', () => {
  test('R52: a sung filter hides the "never sung here" lines, and clearing it brings them back', async ({ page }) => {
    await openApp(page);
    await seedCrown(page);
    await chooseVenue(page, 'The Crown');
    await expect(sungLine(page, 'Dancing Queen')).toBeVisible();
    await expect(sungLine(page, 'Dancing Queen')).toHaveText('New here');

    await openFilters(page);
    await choose(page, 'Sung', 'Never at this venue');
    await expect(page.getByText('2 of 3 songs')).toBeVisible();
    await expect(sungLine(page, 'Dancing Queen')).toBeHidden();
    await expect(sungLine(page, 'Mr. Brightside')).toBeHidden();

    // "Not since" keeps the lines that carry a date and hides the empty ones.
    await choose(page, 'Sung', 'Not since');
    await filter(page, 'Since').fill('2026-11-01');
    await expect(page.getByText('3 of 3 songs')).toBeVisible();
    await expect(sungLine(page, 'Valerie')).toBeVisible();
    await expect(sungLine(page, 'Valerie')).toHaveText(hereText(1, '1 Oct'));
    await expect(sungLine(page, 'Dancing Queen')).toBeHidden();

    await choose(page, 'Sung', 'Any');
    await expect(sungLine(page, 'Dancing Queen')).toBeVisible();
  });

  test('R53: filters survive another tab and a reload; the search survives the tab but not the reload', async ({ page }) => {
    await openApp(page);
    await seedCrown(page);
    await openFilters(page);
    await choose(page, 'Genre', 'Rock');
    await closeFilters(page);
    await search(page).fill('bright');
    await expect(page.getByText('1 of 3 songs')).toBeVisible();

    await openScope(page, 'History');
    await openScope(page, 'Songs');
    await expectFilterCount(page, 1);
    await expect(search(page)).toHaveValue('bright');
    await expect(page.getByText('1 of 3 songs')).toBeVisible();

    await page.reload(); // the filter is still on, so one of three shows
    await expect(page.getByText('1 of 3 songs')).toBeVisible();
    await expectFilterCount(page, 1);
    await expect(search(page)).toHaveValue('');
    await openFilters(page);
    await expect(filter(page, 'Genre')).toHaveValue('Rock');

    await filter(page, 'Genre').selectOption(''); // back to any genre
    await page.reload();
    await expect(page.getByText('3 of 3 songs')).toBeVisible();
    await expectFilterCount(page, 0);
  });

  test('R54: KJ shows a song full screen, from the Up next card and from the song screen', async ({ page }) => {
    await openApp(page);
    await seedCrown(page);
    await chooseVenue(page, 'The Crown');
    await songRow(page, 'Valerie').locator('.set-toggle').click();
    await openScope(page, 'Tonight');
    await page.getByRole('button', { name: 'Show Valerie to the KJ' }).click();

    // Title, artist and the key as a big number with its meaning; the dock hides.
    await expect(kjView(page)).toBeVisible();
    await expect(kjView(page).locator('.kj-label')).toHaveText('Up next for the KJ');
    await expect(kjView(page).locator('.kj-title')).toHaveText('Valerie');
    await expect(kjView(page).locator('.kj-artist')).toHaveText('Amy Winehouse');
    await expect(kjView(page).locator('.kj-key-big')).toHaveText('−2');
    await expect(kjView(page).locator('.kj-key-words')).toHaveText('two semitones down');
    await expect(kjView(page).locator('.kj-logged')).toHaveCount(0); // nothing was logged on the way
    await expect(scopeBar(page)).toBeHidden();
    const titleSize = () => page.locator('.kj-title').evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
    expect(await titleSize()).toBeGreaterThanOrEqual(36);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    // Done returns to Tonight with the dock back.
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(kjView(page)).toHaveCount(0);
    await expect(scopeBar(page)).toBeVisible();
    await expectTab(page, 'Tonight');

    // The back gesture closes it too.
    await page.getByRole('button', { name: 'Show Valerie to the KJ' }).click();
    await expect(kjView(page)).toBeVisible();
    await page.goBack();
    await expect(kjView(page)).toHaveCount(0);
    await expect(page.locator('.up-next .up-title')).toHaveText('Valerie');

    // The song screen has a KJ button; Done comes back to the song.
    await openScope(page, 'Songs');
    await openSong(page, 'Valerie');
    await page.getByRole('button', { name: 'Show to the KJ' }).click();
    await expect(kjView(page)).toBeVisible();
    await expect(kjView(page).locator('.kj-label')).toHaveText('For the KJ');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Valerie' })).toBeVisible();
    await expect(scopeBar(page)).toBeVisible();
  });
});
