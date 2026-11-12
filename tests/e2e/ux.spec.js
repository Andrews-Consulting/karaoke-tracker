// R31: mobile-first, usable one-handed. Tap targets of at least 44 px on every
// screen, and the phone's back gesture returns from a detail screen instead of
// leaving the installed app.
import { test, expect } from '@playwright/test';
import { openApp, addSong, openSong, putRecords } from './helpers.js';
import { seed } from './helpers-find.js';
import { openVenues, openVenue, openOverall, backToVenues } from './helpers-venues.js';
import { openSetlists, openSetlist } from './helpers-setlists.js';

const MIN = 44;

// Every visible control on the screen with its size. Hidden controls (closed
// <details>, [hidden], the visually hidden file inputs) have no box and are left out.
async function controlBoxes(page) {
  return page.evaluate((min) => {
    const nodes = document.querySelectorAll('button, input, select, textarea, summary, a[href], label.file-btn');
    return [...nodes]
      .filter((node) => !node.classList.contains('file-input') && node.type !== 'hidden')
      .map((node) => {
        const r = node.getBoundingClientRect();
        const name = (node.getAttribute('aria-label') || node.textContent || node.name || '').trim().slice(0, 40);
        return { tag: node.tagName.toLowerCase(), name, width: Math.round(r.width), height: Math.round(r.height) };
      })
      .filter((box) => box.width > 0 && box.height > 0)
      .filter((box) => box.width < min || box.height < min);
  }, MIN);
}

async function expectTapTargets(page, screen) {
  const small = await controlBoxes(page);
  expect(small, `${screen}: controls under ${MIN} px`).toEqual([]);
}

// A library with a venue, a sing and a setlist, so every screen has content.
async function seedEverything(page) {
  const { songIds, venueIds } = await seed(page, {
    songs: [
      { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006, tags: ['crowd-pleaser'], rating: 4 },
      { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 },
    ],
    venues: ['The Crown'],
    sings: [{ title: 'Valerie', venue: 'The Crown', date: '2026-10-15' }],
  });
  await putRecords(page, 'setlists', [{ name: 'Friday', venueId: venueIds['The Crown'], songIds: [songIds.Valerie] }]);
  return { songIds, venueIds };
}

test.describe('UX', () => {
  test('R31: the back gesture returns from a song and its edit form instead of leaving the app', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await openSong(page, 'Valerie');
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('heading', { level: 2, name: 'Valerie' })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Songs' })).toBeVisible();
    await expect(page.getByText('1 of 1 songs')).toBeVisible();
    expect(page.url()).not.toBe('about:blank');
  });

  test('R31: the back gesture returns from a venue, overall and a setlist to their lists', async ({ page }) => {
    await openApp(page);
    await seedEverything(page);

    await openVenues(page);
    await openVenue(page, 'The Crown');
    await page.goBack();
    await expect(page.getByRole('form', { name: 'Add a venue' })).toBeVisible();
    await openOverall(page);
    await page.goBack();
    await expect(page.getByRole('form', { name: 'Add a venue' })).toBeVisible();

    await openSetlists(page);
    await openSetlist(page, 'Friday');
    await page.goBack();
    await expect(page.getByRole('form', { name: 'New setlist' })).toBeVisible();
    expect(page.url()).not.toBe('about:blank');
  });

  test('R31: the in-page Back button keeps the history in step with the screens', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await openSong(page, 'Valerie');
    await page.getByRole('button', { name: 'Back to list' }).click();
    await expect(page.getByText('1 of 1 songs')).toBeVisible();

    // The list is the only screen again, so one more back leaves the page.
    await page.goBack();
    expect(page.url()).toBe('about:blank');
  });

  test('R31: every control on every screen is at least 44 px tall and wide', async ({ page }) => {
    await openApp(page);
    await seedEverything(page);

    // Songs list with the add form and all filters showing.
    await page.getByText('Add a song', { exact: true }).click();
    await page.locator('details.find-filters > summary').click();
    await page.getByRole('form', { name: 'Filters' }).getByLabel('Sung', { exact: true }).selectOption('not-since');
    await expect(page.getByLabel('Since', { exact: true })).toBeVisible();
    await expectTapTargets(page, 'Songs list');

    await openSong(page, 'Valerie');
    await expectTapTargets(page, 'Song detail');
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expectTapTargets(page, 'Edit song');

    await openVenues(page);
    await expectTapTargets(page, 'Venues list');
    await page.getByRole('button', { name: 'Rename The Crown' }).click();
    await expectTapTargets(page, 'Venues list, renaming');
    await page.getByRole('form', { name: 'Rename The Crown' }).getByRole('button', { name: 'Cancel' }).click();
    await openVenue(page, 'The Crown');
    await page.getByRole('searchbox', { name: 'Find a song to log' }).fill('a');
    for (const summary of await page.locator('.history details > summary').all()) await summary.click();
    await expectTapTargets(page, 'Venue detail');
    await backToVenues(page);
    await openOverall(page);
    await expectTapTargets(page, 'Overall');

    await openSetlists(page);
    await expectTapTargets(page, 'Setlists list');
    await page.getByRole('button', { name: 'Edit Friday' }).click();
    await expectTapTargets(page, 'Setlists list, editing');
    await page.getByRole('form', { name: 'Edit Friday' }).getByRole('button', { name: 'Cancel' }).click();
    await openSetlist(page, 'Friday');
    await expectTapTargets(page, 'Setlist detail');

    await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expectTapTargets(page, 'Settings');
  });
});
