// R63: MusicBrainz fills year and genre too and matches word prefixes;
// R64: a new song's status starts blank; R65: moving data from Safari to the
// installed app is pointed out at both ends.
import { test, expect } from '@playwright/test';
import { openApp, addSong, openSong, expectTab, readStore } from './helpers.js';
import { mockMusicBrainz, mbRecording, openAddForm, suggestionList, openFilters, choose } from './helpers-find.js';

const QUIET_MS = 700; // longer than the 400 ms typing pause

test.describe('MusicBrainz year and genre (R63)', () => {
  // With a service worker in control, WebKit sends cross-origin fetches past
  // page.route(); blocking it keeps every MusicBrainz request inside the test.
  test.use({ serviceWorkers: 'block' });

  test('R63: a tapped suggestion fills the earliest release year and the artist\'s top genre, with the others as chips', async ({ page }) => {
    const requests = await mockMusicBrainz(page, (url) => {
      if (url.pathname.startsWith('/ws/2/artist/')) {
        return { json: { name: 'KC and the Sunshine Band', genres: [{ name: 'pop soul', count: 1 }, { name: 'disco', count: 3 }, { name: 'funk', count: 2 }] } };
      }
      return {
        json: {
          recordings: [
            mbRecording('Boogie Shoes', 'KC and the Sunshine Band', { 'first-release-date': '2006' }),
            mbRecording('Boogie Shoes', 'KC and the Sunshine Band', { 'first-release-date': '1975-05-01' }),
            mbRecording('Boogie Shoes', 'KC and the Sunshine Band', { 'first-release-date': '1998-10' }),
            mbRecording('Boogie Woogie Shoes', 'Someone Else'),
          ],
        },
      };
    });
    await openApp(page);
    const form = await openAddForm(page);
    await form.getByLabel('Title').pressSequentially('boogie sh', { delay: 30 });

    const buttons = suggestionList(page).getByRole('button');
    await expect(buttons).toHaveText(['Boogie Shoes — KC and the Sunshine Band (1975)', 'Boogie Woogie Shoes — Someone Else']);
    expect(new URL(requests[0].url).searchParams.get('query')).toBe('recording:(boogie AND sh*)');

    await form.getByRole('button', { name: 'Use Boogie Shoes by KC and the Sunshine Band' }).click();
    await expect(form.getByLabel('Title')).toHaveValue('Boogie Shoes');
    await expect(form.getByLabel('Artist')).toHaveValue('KC and the Sunshine Band');
    await expect(form.getByLabel('Year')).toHaveValue('1975');
    await expect(form.getByLabel('Genre')).toHaveValue('disco');
    const chips = form.getByRole('group', { name: 'From MusicBrainz' }).getByRole('button');
    await expect(chips).toHaveText(['disco', 'funk', 'pop soul']);
    await chips.nth(1).click();
    await expect(form.getByLabel('Genre')).toHaveValue('funk');
    expect(new URL(requests[1].url).pathname).toBe('/ws/2/artist/test-KC%20and%20the%20Sunshine%20Band');

    await form.getByRole('button', { name: 'Add song' }).click();
    await expect(page.locator('li.song-item').filter({ hasText: 'Boogie Shoes' })).toContainText('KC and the Sunshine Band · funk · 1975');
  });

  test('R63: typing in Artist narrows the search, and typed genre and year are never overwritten', async ({ page }) => {
    const requests = await mockMusicBrainz(page, (url) => (url.pathname.startsWith('/ws/2/artist/')
      ? { json: { genres: [{ name: 'soul', count: 2 }] } }
      : { json: { recordings: [mbRecording('Valerie', 'Amy Winehouse', { 'first-release-date': '2006-10-02' })] } }));
    await openApp(page);
    const form = await openAddForm(page);
    await form.getByLabel('Genre').fill('Northern soul');
    await form.getByLabel('Year').fill('2007');
    await form.getByLabel('Title').fill('Valerie');
    await expect(suggestionList(page).getByRole('button')).toHaveCount(1);
    expect(requests).toHaveLength(1);

    await form.getByLabel('Artist').pressSequentially('Amy', { delay: 30 });
    await page.waitForTimeout(QUIET_MS);
    expect(requests).toHaveLength(2);
    expect(new URL(requests[1].url).searchParams.get('query')).toBe('recording:(Valerie*) AND artist:(Amy*)');

    await form.getByRole('button', { name: 'Use Valerie by Amy Winehouse' }).click();
    await expect(form.getByRole('group', { name: 'From MusicBrainz' }).getByRole('button')).toHaveText(['soul']);
    await expect(form.getByLabel('Genre')).toHaveValue('Northern soul');
    await expect(form.getByLabel('Year')).toHaveValue('2007');
  });
});

test.describe('Blank status (R64)', () => {
  test('R64: a new song has no status until one is chosen, and "Not set" can be filtered', async ({ page }) => {
    await openApp(page);
    const form = await openAddForm(page);
    await expect(form.getByLabel('Status')).toHaveValue('');
    await expect(form.getByLabel('Status').locator('option')).toHaveText(['Not set', 'Go-to', 'Want to try', 'Retired']);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });

    await openSong(page, 'Valerie');
    await expect(page.locator('.song-fields .field').filter({ hasText: 'Status' })).toContainText('—');
    await page.getByRole('button', { name: 'Back to list' }).click();

    await openFilters(page);
    await choose(page, 'Status', 'Not set');
    await expect(page.getByText('1 of 1 songs')).toBeVisible();
    await choose(page, 'Status', 'Go-to');
    await expect(page.getByText('0 of 1 songs')).toBeVisible();
    await choose(page, 'Status', 'Any status');

    // Choosing a status on the form stores it.
    const again = await openAddForm(page);
    await again.getByLabel('Title').fill('Rehab');
    await again.getByLabel('Artist').fill('Amy Winehouse');
    await again.getByLabel('Status').selectOption('want-to-try');
    await again.getByRole('button', { name: 'Add song' }).click();
    await expect(page.getByText('2 of 2 songs')).toBeVisible();
    const stored = await readStore(page, 'songs');
    expect(stored.find((s) => s.title === 'Valerie').status).toBe('');
    expect(stored.find((s) => s.title === 'Rehab').status).toBe('want-to-try');
  });
});

test.describe('Moving from Safari (R65)', () => {
  const banner = (page) => page.getByRole('region', { name: 'Move to the Home Screen' });

  test('R65: in Safari on an iPhone with songs, a banner points at Share backup; Later hides it for a week', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: false, configurable: true }); });
    await openApp(page);
    await expect(banner(page)).toHaveCount(0); // nothing to move yet

    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await page.reload();
    await expectTab(page, 'Songs');
    await expect(banner(page)).toContainText('Songs entered here do not move over by themselves');

    await banner(page).getByRole('button', { name: 'Move my data' }).click();
    await expectTab(page, 'Settings');
    await expect(page.getByRole('button', { name: 'Share backup' }).or(page.getByRole('button', { name: 'Download backup' })).first()).toBeVisible();
    await expect(banner(page)).toHaveCount(0);

    await page.reload();
    await expectTab(page, 'Songs');
    await banner(page).getByRole('button', { name: 'Later' }).click();
    await expect(banner(page)).toHaveCount(0);
    await page.reload();
    await expectTab(page, 'Songs');
    await expect(banner(page)).toHaveCount(0);
  });

  test('R65: the installed app shows no banner, and an empty library offers to restore a backup', async ({ page }) => {
    await openApp(page);
    await expect(banner(page)).toHaveCount(0);
    const card = page.locator('.starting-fresh');
    await expect(card).toContainText('Starting fresh?');
    await card.getByRole('button', { name: 'Restore a backup' }).click();
    await expectTab(page, 'Settings');
    await expect(page.getByText('Restore from backup', { exact: true })).toBeVisible();

    await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Songs' }).click();
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await expect(card).toHaveCount(0);
  });
});
