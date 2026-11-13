// Library polish on the Songs tab (Wave 3 F): more sort orders (R12), a video
// search link on a song (R38) and speed with 1,000 songs (R34).
import { test, expect } from '@playwright/test';
import { filterSongs, sortByTitle } from '../../js/lib/search.js';
import { openApp, openSong } from './helpers.js';
import {
  seed, seedBigLibrary, venueSelect, filtersForm, filtersSummary, openFilters, filter, choose, shownTitles, songRow,
  expectTapTarget,
} from './helpers-find.js';

const search = (page) => page.getByRole('searchbox', { name: 'Search songs' });
const countLine = (page) => page.locator('#view p.count');
const songRows = (page) => page.locator('li.song-item');
const moreButton = (page) => page.getByRole('button', { name: /^Show \d+ more$/ });

async function backToList(page) {
  await page.getByRole('button', { name: 'Back to list' }).click();
  await expect(search(page)).toBeVisible();
}

const VALERIE = { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 };
const QUEEN = { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 };
const BRIGHTSIDE = { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 };
const AFRICA = { title: 'Africa', artist: 'Toto', genre: 'Rock', year: 1982 };

test.describe('Library polish', () => {
  test('R12: sorts by artist, rating and date added', async ({ page }) => {
    await openApp(page);
    await seed(page, {
      songs: [
        { ...VALERIE, rating: 4, createdAt: '2026-03-01T10:00:00.000Z' },
        { ...QUEEN, rating: 5, createdAt: '2026-05-01T09:00:00.000Z' },
        { ...BRIGHTSIDE, rating: null, createdAt: '2026-01-15T12:00:00.000Z' },
        { ...AFRICA, rating: 4, createdAt: '2026-05-01T09:00:00.000Z' },
        { title: 'Rehab', artist: 'amy winehouse', rating: 2, createdAt: '2026-03-01T09:59:59.000Z' },
        { title: 'Mystery Song', artist: '', createdAt: '2025-12-31T23:00:00.000Z' },
      ],
    });
    await openFilters(page);

    await expect(filter(page, 'Sort by').locator('option')).toHaveText([
      'Title', 'Artist', 'Rating, best first', 'Last sung, most recent first', 'Last sung, longest ago first',
      'Date added, newest first', 'Genre', 'Decade', 'Decade, newest first',
    ]);
    await expect(filter(page, 'Sort by')).toHaveValue('title');
    await expectTapTarget(filter(page, 'Sort by'));

    // Artist ignoring case, then title; a song without an artist goes last.
    await choose(page, 'Sort by', 'Artist');
    await expect(shownTitles(page)).toHaveText(
      ['Dancing Queen', 'Rehab', 'Valerie', 'Mr. Brightside', 'Africa', 'Mystery Song']);
    // A sort order is not a filter.
    await expect(filtersSummary(page)).toHaveText('Filters');
    await expect(page.getByText('6 of 6 songs')).toBeVisible();

    // 5 down to 1, ties by title, unrated last.
    await choose(page, 'Sort by', 'Rating, best first');
    await expect(shownTitles(page)).toHaveText(
      ['Dancing Queen', 'Africa', 'Valerie', 'Rehab', 'Mr. Brightside', 'Mystery Song']);

    // Newest first, ties (the same moment) by title.
    await choose(page, 'Sort by', 'Date added, newest first');
    await expect(shownTitles(page)).toHaveText(
      ['Africa', 'Dancing Queen', 'Valerie', 'Rehab', 'Mr. Brightside', 'Mystery Song']);

    // Combines with the search and a filter, and survives a trip to a song.
    await search(page).fill('amy');
    await expect(shownTitles(page)).toHaveText(['Valerie', 'Rehab']);
    await choose(page, 'Sort by', 'Artist');
    await expect(shownTitles(page)).toHaveText(['Rehab', 'Valerie']);
    await choose(page, 'Rating', '4+');
    await expect(shownTitles(page)).toHaveText(['Valerie']);
    await choose(page, 'Rating', 'Any rating');
    await openSong(page, 'Valerie');
    await backToList(page);
    await expect(filter(page, 'Sort by')).toHaveValue('artist');
    await expect(shownTitles(page)).toHaveText(['Rehab', 'Valerie']);

    // Clear filters puts the sort back to Title and keeps the search.
    await filtersForm(page).getByRole('button', { name: 'Clear filters' }).click();
    await expect(filter(page, 'Sort by')).toHaveValue('title');
    await expect(shownTitles(page)).toHaveText(['Rehab', 'Valerie']);
    await search(page).fill('');
    await expect(shownTitles(page)).toHaveText(
      ['Africa', 'Dancing Queen', 'Mr. Brightside', 'Mystery Song', 'Rehab', 'Valerie']);
  });

  test('R12: sorts by last sung at the selected venue', async ({ page }) => {
    await openApp(page);
    await seed(page, {
      songs: [VALERIE, QUEEN, BRIGHTSIDE, AFRICA],
      venues: ['The Crown', 'Anchor'],
      sings: [
        { title: 'Valerie', venue: 'The Crown', date: '2026-10-01' },
        { title: 'Valerie', venue: 'Anchor', date: '2026-11-05' },
        { title: 'Dancing Queen', venue: 'The Crown', date: '2026-09-15' },
        { title: 'Mr. Brightside', venue: 'Anchor', date: '2026-10-20' },
      ],
    });
    await openFilters(page);

    // Overall: across every venue; never sung last.
    await choose(page, 'Sort by', 'Last sung, most recent first');
    await expect(shownTitles(page)).toHaveText(['Valerie', 'Mr. Brightside', 'Dancing Queen', 'Africa']);
    await expect(filtersSummary(page)).toHaveText('Filters');

    // Longest ago first puts never sung first: those are the ones to pick.
    await choose(page, 'Sort by', 'Last sung, longest ago first');
    await expect(shownTitles(page)).toHaveText(['Africa', 'Dancing Queen', 'Mr. Brightside', 'Valerie']);

    // A new venue re-sorts by the sings there, and each row says so.
    await venueSelect(page).selectOption({ label: 'The Crown' });
    await expect(shownTitles(page)).toHaveText(['Africa', 'Mr. Brightside', 'Dancing Queen', 'Valerie']);
    await expect(songRow(page, 'Mr. Brightside').locator('.sung')).toHaveText('Never sung here');
    await expect(filter(page, 'Sort by')).toHaveValue('last-sung-oldest');

    await choose(page, 'Sort by', 'Last sung, most recent first');
    await expect(shownTitles(page)).toHaveText(['Valerie', 'Dancing Queen', 'Africa', 'Mr. Brightside']);

    await venueSelect(page).selectOption({ label: 'Anchor' });
    await expect(shownTitles(page)).toHaveText(['Valerie', 'Mr. Brightside', 'Africa', 'Dancing Queen']);
    await expect(songRow(page, 'Valerie').locator('.sung')).toHaveText('Sung 1 time · last 2026-11-05');

    // With the "never at this venue" filter, the sort still applies to what is left.
    await choose(page, 'Sung', 'Never at this venue');
    await choose(page, 'Sort by', 'Last sung, longest ago first');
    await expect(shownTitles(page)).toHaveText(['Africa', 'Dancing Queen']);
    await expect(filtersSummary(page)).toHaveText('Filters (1)');

    await filtersForm(page).getByRole('button', { name: 'Clear filters' }).click();
    await expect(filter(page, 'Sort by')).toHaveValue('title');
    await expect(shownTitles(page)).toHaveText(['Africa', 'Dancing Queen', 'Mr. Brightside', 'Valerie']);
  });

  test('R38: a song has a video search link for its title and artist', async ({ page }) => {
    const youtube = [];
    page.on('request', (req) => {
      if (/youtube/i.test(req.url())) youtube.push(req.url());
    });
    await openApp(page);
    await seed(page, { songs: [VALERIE, { title: 'Rock & Roll', artist: 'Led Zeppelin' }] });

    // Only on the song's screen, not in the list.
    await expect(page.getByRole('link', { name: 'Search video' })).toHaveCount(0);

    await openSong(page, 'Rock & Roll');
    const link = page.getByRole('link', { name: 'Search video' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href',
      'https://www.youtube.com/results?search_query=Rock%20%26%20Roll%20Led%20Zeppelin');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');
    const box = await link.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);

    // Within thumb reach: just above Edit and Delete at the bottom of the card.
    const edit = await page.getByRole('button', { name: 'Edit' }).boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(edit.y);
    expect(edit.y - (box.y + box.height)).toBeLessThan(24);

    await backToList(page);
    await openSong(page, 'Valerie');
    await expect(page.getByRole('link', { name: 'Search video' })).toHaveAttribute('href',
      `https://www.youtube.com/results?search_query=${encodeURIComponent('Valerie Amy Winehouse')}`);

    // The app itself never fetched anything from the video site.
    expect(youtube).toEqual([]);
  });

  test('R34: opens with 1,000 songs in under 2 seconds and searches instantly', async ({ page }) => {
    test.setTimeout(60_000);
    await openApp(page);
    const { songs } = await seedBigLibrary(page, 1000);

    // Open: from the start of the reload until the whole library is counted.
    // Checked every frame: expect() retries at growing intervals (up to a
    // second), which would add its own wait to the time measured.
    const started = Date.now();
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector('#view p.count')?.textContent === '1000 of 1000 songs',
      null, { polling: 'raf', timeout: 2_000 });
    const openMs = Date.now() - started;
    await expect(countLine(page)).toHaveText('1000 of 1000 songs');
    expect(openMs).toBeLessThan(2_000);
    await expect(shownTitles(page).first()).toHaveText(sortByTitle(songs)[0].title);

    // Search: each keystroke updates the count within 300 ms, typing and deleting.
    // Timed in the page, from the key going down to the first frame drawn
    // after the count changed, which is what the owner sees. The time through
    // Playwright (press, then the count) is logged too; it adds the test
    // runner's own round trips, which stall when the machine is busy.
    const box = search(page);
    await box.focus();
    await page.evaluate(() => {
      const input = document.querySelector('#view input[type="search"]');
      const count = document.querySelector('#view p.count');
      let down = 0;
      window.r34Timings = [];
      input.addEventListener('keydown', () => { down = performance.now(); }, true);
      new MutationObserver(() => {
        const start = down;
        requestAnimationFrame(() => setTimeout(() => window.r34Timings.push(Math.round(performance.now() - start))));
      }).observe(count, { childList: true, characterData: true, subtree: true });
    });
    const inPage = [];
    const wall = [];
    async function keystroke(key, query) {
      const expected = filterSongs(songs, query);
      const before = Date.now();
      await box.press(key);
      await expect(countLine(page)).toHaveText(`${expected.length} of 1000 songs`, { timeout: 300 });
      wall.push(Date.now() - before);
      await expect.poll(() => page.evaluate(() => window.r34Timings.length), { intervals: [20] })
        .toBe(inPage.length + 1);
      const ms = await page.evaluate(() => window.r34Timings.at(-1));
      inPage.push(ms);
      expect(ms, `keystroke "${key}" to "${query}"`).toBeLessThan(300);
      await expect(shownTitles(page).first()).toHaveText(sortByTitle(expected)[0].title);
    }
    const query = 'hart'; // 544, 217, 184 and 125 matches: each keystroke changes the count
    try {
      for (let i = 1; i <= query.length; i += 1) await keystroke(query[i - 1], query.slice(0, i));
      for (let i = query.length - 1; i >= 0; i -= 1) await keystroke('Backspace', query.slice(0, i));
    } finally {
      console.log(`R34 ${test.info().project.name}: open ${openMs} ms; keystrokes in the page ` +
        `${inPage.join(', ')} ms; through Playwright ${wall.join(', ')} ms`);
    }

    // A long list draws 200 rows at a time; the count line still gives every match.
    await box.fill('h');
    const matches = sortByTitle(filterSongs(songs, 'h'));
    expect(matches.length).toBe(544);
    await expect(countLine(page)).toHaveText('544 of 1000 songs');
    await expect(songRows(page)).toHaveCount(200);
    await expect(moreButton(page)).toHaveText('Show 200 more');
    await expectTapTarget(moreButton(page));
    await moreButton(page).click();
    await expect(songRows(page)).toHaveCount(400);
    await expect(songRows(page).nth(200).locator('button.song-row')).toBeFocused(); // the row, not its + (R56)
    await expect(moreButton(page)).toHaveText('Show 144 more');
    await moreButton(page).click();
    await expect(songRows(page)).toHaveCount(544);
    await expect(moreButton(page)).toBeHidden();
    await expect(shownTitles(page)).toHaveText(matches.map((s) => s.title));
    await expect(countLine(page)).toHaveText('544 of 1000 songs');

    // Coming back from a song far down the list shows it again, focused.
    const deep = matches[450].title;
    await songRows(page).nth(450).locator('button.song-row').click();
    await expect(page.getByRole('heading', { level: 2, name: deep })).toBeVisible();
    await backToList(page);
    await expect(countLine(page)).toHaveText('544 of 1000 songs');
    await expect(songRow(page, deep).locator('button.song-row')).toBeFocused();
    await expect(songRow(page, deep)).toBeInViewport();

    // A new search starts again from the first 200.
    await box.fill('');
    await expect(countLine(page)).toHaveText('1000 of 1000 songs');
    await expect(songRows(page)).toHaveCount(200);
    await expect(moreButton(page)).toHaveText('Show 200 more');
  });
});
