// Design pass 1 (R52, R53, R54): hidden "never sung" lines under a sung
// filter, filters that persist across tabs and reloads, and the song shown
// full screen for the KJ.
import { test, expect } from '@playwright/test';
import { openApp, openSong } from './helpers.js';
import {
  seed, venueSelect, songRow, sungLine, openFilters, filter, choose, filtersSummary,
} from './helpers-find.js';

const VALERIE = { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006, tags: ['duet'], key: '-2' };
const QUEEN = { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 };
const BRIGHTSIDE = { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 };

const search = (page) => page.getByRole('searchbox', { name: 'Search songs' });
const tab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const tabs = (page) => page.getByRole('navigation', { name: 'Sections' });
const showTab = (page, name) => tabs(page).getByRole('button', { name }).click();
const kjCard = (page) => page.getByRole('dialog', { name: 'Show to the KJ' });

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
    await venueSelect(page).selectOption({ label: 'The Crown' });
    await expect(sungLine(page, 'Dancing Queen')).toBeVisible();
    await expect(sungLine(page, 'Dancing Queen')).toHaveText('Never sung here');

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
    await expect(sungLine(page, 'Valerie')).toHaveText('Sung 1 time · last 2026-10-01');
    await expect(sungLine(page, 'Dancing Queen')).toBeHidden();

    await choose(page, 'Sung', 'Any');
    await expect(sungLine(page, 'Dancing Queen')).toBeVisible();
  });

  test('R53: filters survive another tab and a reload; the search survives the tab but not the reload', async ({ page }) => {
    await openApp(page);
    await seedCrown(page);
    await openFilters(page);
    await choose(page, 'Genre', 'Rock');
    await search(page).fill('bright');
    await expect(page.getByText('1 of 3 songs')).toBeVisible();

    await showTab(page, 'Venues');
    await showTab(page, 'Songs');
    await expect(filtersSummary(page)).toHaveText('Filters (1)');
    await expect(search(page)).toHaveValue('bright');
    await expect(page.getByText('1 of 3 songs')).toBeVisible();

    await page.reload(); // the filter is still on, so one of three shows
    await expect(page.getByText('1 of 3 songs')).toBeVisible();
    await expect(filtersSummary(page)).toHaveText('Filters (1)');
    await expect(search(page)).toHaveValue('');
    await openFilters(page);
    await expect(filter(page, 'Genre')).toHaveValue('Rock');

    await filter(page, 'Genre').selectOption(''); // back to any genre
    await page.reload();
    await expect(page.getByText('3 of 3 songs')).toBeVisible();
    await expect(filtersSummary(page)).toHaveText('Filters');
  });

  test('R54: tapping a song in List mode shows it full screen for the KJ, portrait and landscape', async ({ page }) => {
    await openApp(page);
    await seedCrown(page);
    await venueSelect(page).selectOption({ label: 'The Crown' });
    await songRow(page, 'Valerie').locator('.set-toggle').click();
    await tab(page, 'List').click();
    await page.getByRole('button', { name: 'Show Valerie to the KJ' }).click();

    await expect(kjCard(page)).toBeVisible();
    await expect(kjCard(page)).toContainText('Valerie');
    await expect(kjCard(page)).toContainText('Amy Winehouse');
    await expect(kjCard(page)).toContainText('Key -2');
    await expect(tabs(page)).toBeHidden();
    const titleSize = () => page.locator('.kj-title').evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
    expect(await titleSize()).toBeGreaterThanOrEqual(36);

    // Landscape: still fills the screen, bigger type, nothing scrolls sideways.
    const portrait = page.viewportSize();
    await page.setViewportSize({ width: portrait.height, height: portrait.width });
    await expect(kjCard(page)).toBeVisible();
    expect(await titleSize()).toBeGreaterThanOrEqual(36);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.setViewportSize(portrait);

    // Close returns to List mode with the tabs back.
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(kjCard(page)).toHaveCount(0);
    await expect(tabs(page)).toBeVisible();
    await expect(tab(page, 'List')).toHaveAttribute('aria-selected', 'true');

    // The back gesture closes it too, and the song screen has the same button.
    await page.getByRole('button', { name: 'Show Valerie to the KJ' }).click();
    await expect(kjCard(page)).toBeVisible();
    await page.goBack();
    await expect(kjCard(page)).toHaveCount(0);
    await expect(tabs(page)).toBeVisible();

    await tab(page, 'Find').click();
    await openSong(page, 'Valerie');
    await page.getByRole('button', { name: 'Show to the KJ' }).click();
    await expect(kjCard(page)).toBeVisible();
    await page.getByRole('button', { name: 'Details' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Valerie' })).toBeVisible();
    await expect(tabs(page)).toBeVisible();
  });
});
