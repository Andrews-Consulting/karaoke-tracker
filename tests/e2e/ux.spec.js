// R31: mobile-first, usable one-handed. Tap targets of at least 44 px on every
// screen, and the phone's back gesture returns from a detail screen instead of
// leaving the installed app.
import { test, expect } from '@playwright/test';
import {
  openApp, addSong, openSong, putRecords, expectTab, openScope, openSettings, scopeBar,
} from './helpers.js';
import { seed, chooseVenue } from './helpers-find.js';
import { openVenues, openVenue, openOverall } from './helpers-venues.js';
import { openSetlists, openSetlist } from './helpers-setlists.js';
import { swipeOpen } from './helpers-tonight.js';
import {
  listsHeading, historyHeading, openLogSing, groupHistory, openSongMenu,
} from './helpers-lists.js';

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
    await expectTab(page, 'Songs');
    await expect(page.getByText('1 of 1 songs')).toBeVisible();
    expect(page.url()).not.toBe('about:blank');
  });

  test('R31: the back gesture returns from Venues, Log a sing and a list to their scope', async ({ page }) => {
    await openApp(page);
    await seedEverything(page);

    await openVenues(page);
    await page.goBack();
    await expect(historyHeading(page)).toBeVisible();
    await expect(page.getByRole('form', { name: 'Add a venue' })).toHaveCount(0);
    await openLogSing(page);
    await page.goBack();
    await expect(historyHeading(page)).toBeVisible();
    await expect(page.getByRole('form', { name: 'Log a sing' })).toHaveCount(0);

    await openSetlists(page);
    await openSetlist(page, 'Friday');
    await page.goBack();
    await expect(listsHeading(page)).toBeVisible();
    expect(page.url()).not.toBe('about:blank');
  });

  test('R31: the in-page Back button keeps the history in step with the screens', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await openSong(page, 'Valerie');
    await page.getByRole('button', { name: 'Back to Songs' }).click();
    await expect(page.getByText('1 of 1 songs')).toBeVisible();

    // The list is the only screen again, so one more back leaves the page.
    await page.goBack();
    expect(page.url()).toBe('about:blank');
  });

  test('R31: every control on every screen is at least 44 px tall and wide', async ({ page }) => {
    await openApp(page);
    await seedEverything(page);

    // The Songs list, then with the Filters sheet open and every filter showing,
    // then the Add a song sheet.
    await expectTapTargets(page, 'Songs list');
    await page.locator('#dock .dock-filter').click();
    await page.getByRole('form', { name: 'Filters' }).getByLabel('Sung', { exact: true }).selectOption('not-since');
    await expect(page.getByLabel('Since', { exact: true })).toBeVisible();
    await expectTapTargets(page, 'Songs with the Filters sheet');
    await page.getByRole('form', { name: 'Filters' }).getByLabel('Sung', { exact: true }).selectOption('any');
    await page.goBack();
    await page.getByText('Add a song', { exact: true }).click();
    await expect(page.getByRole('form', { name: 'Add a song' })).toBeVisible();
    await expectTapTargets(page, 'Add a song');
    await page.getByRole('button', { name: 'Cancel' }).click();

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
    for (const summary of await page.locator('.history details > summary').all()) await summary.click();
    await expectTapTargets(page, 'History by song');
    await groupHistory(page, 'By night');
    await expectTapTargets(page, 'History by night');
    await openOverall(page);
    await expectTapTargets(page, 'History, all venues');
    await openLogSing(page);
    await page.getByRole('searchbox', { name: 'Find a song to log' }).fill('a');
    await expectTapTargets(page, 'Log a sing');

    await openSetlists(page);
    await expectTapTargets(page, 'Lists');
    await page.getByRole('button', { name: 'New list', exact: true }).click();
    await expectTapTargets(page, 'Lists, new list');
    await openSetlist(page, 'Friday');
    await expectTapTargets(page, 'A list');
    await page.getByRole('button', { name: 'Rename and label', exact: true }).click();
    await openSongMenu(page, 'Valerie');
    await expectTapTargets(page, 'A list, renaming, with a song\'s actions');

    await openSettings(page);
    await expectTapTargets(page, 'Settings');

    // Tonight at the venue: the menus, the Sung strip, a row's "…" actions,
    // the Up next card, the field with matches, and the KJ view.
    await putRecords(page, 'songs', [{
      title: 'Africa', artist: 'Toto', genre: 'Rock', year: 1982, key: '-1', notes: '', rating: null, status: '', tags: [],
      createdAt: new Date().toISOString(), karafunId: null,
    }]);
    await openScope(page, 'Songs');
    await chooseVenue(page, 'The Crown');
    await page.getByRole('button', { name: 'Add Africa to the set' }).click();
    await page.getByRole('button', { name: 'Add Dancing Queen to the set' }).click();
    await openScope(page, 'Tonight');
    await swipeOpen(page, page.getByRole('list', { name: 'The rest of tonight\'s set' }).locator('li[data-song-id]').filter({ hasText: 'Africa' }));
    await page.getByRole('searchbox', { name: 'Add a song to tonight\'s set' }).fill('a');
    await expectTapTargets(page, 'Tonight');
    await page.getByRole('searchbox', { name: 'Add a song to tonight\'s set' }).fill('');
    await page.getByRole('button', { name: /^Sang it/ }).click();
    await expect(page.getByRole('region', { name: 'For the KJ' })).toBeVisible();
    await expectTapTargets(page, 'KJ view');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: /^Sung · 1/ })).toBeVisible();
    await expectTapTargets(page, 'Tonight with the Sung strip');
  });
});

const bodyBackground = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const themeColor = (page) => page.locator('meta[name="theme-color"]').getAttribute('content');
const DARK_BG = 'rgb(12, 16, 21)';
const LIGHT_BG = 'rgb(244, 247, 250)';

test.describe('Theme', () => {
  test('R32: is dark by default and a light option survives a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' }); // the phone prefers light, the app still starts dark
    await openApp(page);
    expect(await bodyBackground(page)).toBe(DARK_BG);
    expect(await themeColor(page)).toBe('#0c1015');

    await openSettings(page);
    await page.getByLabel('Theme', { exact: true }).selectOption('light');
    await expect.poll(() => bodyBackground(page)).toBe(LIGHT_BG);
    expect(await themeColor(page)).toBe('#f4f7fa');

    await page.reload();
    await expectTab(page, 'Songs');
    expect(await bodyBackground(page)).toBe(LIGHT_BG);
    await openSettings(page);
    await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('light');

    await page.getByLabel('Theme', { exact: true }).selectOption('dark');
    await expect.poll(() => bodyBackground(page)).toBe(DARK_BG);
  });

  test('R32: "Match the phone" follows the phone\'s setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openApp(page);
    await openSettings(page);
    await page.getByLabel('Theme', { exact: true }).selectOption('system');
    expect(await bodyBackground(page)).toBe(DARK_BG);

    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => bodyBackground(page)).toBe(LIGHT_BG);

    await page.reload();
    await expectTab(page, 'Songs');
    expect(await bodyBackground(page)).toBe(LIGHT_BG);
  });
});

test.describe('Accent', () => {
  // The selected scope (or the gear, while Settings shows) is filled with the accent (R58).
  const activeTabColor = (page) => page.evaluate(() =>
    getComputedStyle(document.querySelector('.scopes button[aria-current="page"]')).backgroundColor);

  test('R55: the accent colour can be changed in Settings and survives a reload', async ({ page }) => {
    await openApp(page);
    expect(await activeTabColor(page)).toBe('rgb(108, 196, 255)'); // sky by default

    await openSettings(page);
    await page.getByLabel('Accent colour', { exact: true }).selectOption('pink');
    await expect.poll(() => activeTabColor(page)).toBe('rgb(255, 93, 143)');

    await page.reload();
    await expectTab(page, 'Songs');
    expect(await activeTabColor(page)).toBe('rgb(255, 93, 143)');

    // Each accent has a partner for the light theme.
    await openSettings(page);
    await page.getByLabel('Theme', { exact: true }).selectOption('light');
    await page.getByLabel('Accent colour', { exact: true }).selectOption('amber');
    await expect.poll(() => activeTabColor(page)).toBe('rgb(158, 79, 0)');

    await page.getByLabel('Theme', { exact: true }).selectOption('dark');
    await page.getByLabel('Accent colour', { exact: true }).selectOption('green'); // the old default stays a choice
    await expect.poll(() => activeTabColor(page)).toBe('rgb(19, 184, 106)');
    await page.getByLabel('Accent colour', { exact: true }).selectOption('sky');
    await expect.poll(() => activeTabColor(page)).toBe('rgb(108, 196, 255)');
    expect(await page.evaluate(() => document.documentElement.dataset.accent)).toBeUndefined();
  });
});

test.describe('Tabs', () => {
  test('R58: there is no title bar; the dock\'s selected scope is filled with the accent and larger', async ({ page }) => {
    await openApp(page);
    await openVenues(page);

    // Nothing above the screen: no header box, and <main> starts at the top.
    const topHeight = await page.evaluate(() => {
      const top = document.querySelector('.top');
      return top ? top.getBoundingClientRect().height : 0;
    });
    expect(topHeight).toBe(0);
    expect((await page.locator('main').boundingBox()).y).toBeLessThanOrEqual(20);
    expect(await page.evaluate(() => !!document.elementFromPoint(innerWidth / 2, 4).closest('main'))).toBe(true);

    // The page title stays for screen readers, taking no space.
    const title = page.locator('#view-title');
    await expect(title).toHaveText('History');
    await expect(page.getByRole('heading', { level: 1, name: 'History' })).toHaveCount(1);
    expect((await title.boundingBox()).height).toBeLessThanOrEqual(1);

    // The dock sits at the bottom, under <main>: the four scopes and the gear,
    // with the search field on Tonight just above them.
    const viewport = page.viewportSize();
    const dock = await page.locator('#dock').boundingBox();
    expect(dock.y + dock.height).toBeGreaterThanOrEqual(viewport.height - 1);
    expect((await page.locator('main').boundingBox()).y + (await page.locator('main').boundingBox()).height)
      .toBeLessThanOrEqual(dock.y + 1);
    await expect(scopeBar(page).getByRole('button')).toHaveText(['Tonight', 'Songs', 'Lists', 'History', '']);
    await expect(scopeBar(page).getByRole('button').last()).toHaveAccessibleName('Settings');
    await expect(page.getByRole('searchbox', { name: 'Add a song to tonight\'s set' })).toBeHidden();
    await openScope(page, 'Tonight');
    const field = await page.getByRole('searchbox', { name: 'Add a song to tonight\'s set' }).boundingBox();
    expect(field.y).toBeGreaterThan((await page.locator('#dock').boundingBox()).y);
    expect(field.y + field.height).toBeLessThanOrEqual((await scopeBar(page).boundingBox()).y);
    await openScope(page, 'History');

    // The selected scope: its label on the accent, a pill, and larger than the others.
    const tabStyle = (name) => scopeBar(page)
      .getByRole('button', { name, exact: true })
      .evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          background: style.backgroundColor, color: style.color, fontSize: parseFloat(style.fontSize),
          radius: parseFloat(style.borderTopLeftRadius), height: node.getBoundingClientRect().height,
        };
      });
    const selected = await tabStyle('History');
    const other = await tabStyle('Songs');
    expect(selected.background).toBe('rgb(108, 196, 255)');
    expect(selected.color).toBe('rgb(4, 18, 29)'); // --accent-text
    expect(selected.radius).toBeGreaterThanOrEqual(selected.height / 2);
    expect(selected.fontSize).toBeGreaterThan(other.fontSize);
    expect(other.background).toBe('rgba(0, 0, 0, 0)');
  });
});

test.describe('Desktop', () => {
  test('R33: works at a desktop width with readable line lengths and no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await seedEverything(page);

    const main = page.locator('main');
    const box = await main.boundingBox();
    expect(box.width).toBeLessThanOrEqual(720);
    expect(box.x).toBeGreaterThan(200); // centred, not stuck to the left edge

    const tabs = await scopeBar(page).getByRole('button').all();
    for (const tab of tabs) expect((await tab.boundingBox()).width).toBeLessThanOrEqual(180);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);

    await openSong(page, 'Valerie');
    await expect(page.getByRole('heading', { level: 2, name: 'Valerie' })).toBeVisible();
    await openSetlists(page);
    await openSetlist(page, 'Friday');
    await expect(page.getByRole('list', { name: 'Songs in this setlist' })).toBeVisible();
  });
});
