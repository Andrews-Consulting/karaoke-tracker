// The banners above the dock. R25: a reminder to back up when the last export
// is over 30 days old. R65: getting the app onto the Home Screen, a blunt
// banner in Safari on an iPhone and a softer one in other browsers while
// storage is not persistent.
import { test, expect } from '@playwright/test';
import {
  openApp, addSong, putRecords, readStore, expectTab, openScope, fakePersisted,
} from './helpers.js';
import { openSettings, downloadBackup } from './helpers-data.js';

const banner = (page) => page.getByRole('region', { name: 'Backup reminder' });
const moveBanner = (page) => page.getByRole('region', { name: 'Add to the Home Screen' });
const installBanner = (page) => page.getByRole('region', { name: 'Install the app' });

async function reload(page) {
  await page.reload();
  await expectTab(page, 'Songs');
  await expect(page.getByText(/of \d+ songs/)).toBeVisible();
}

// Reloads with songs and no backup. The backup reminder showing means the
// startup checks are done: an install banner that is snoozed, or in an
// installed app, bows out before the checks first wait on anything.
async function reloadWithSongs(page) {
  await reload(page);
  await expect(banner(page)).toBeVisible();
}

// navigator.standalone as each browser has it: false in Safari on an iPhone,
// true in its Home Screen app, missing everywhere else (Chrome among them).
function fakeStandalone(page, value) {
  return page.addInitScript((fake) => {
    Object.defineProperty(navigator, 'standalone', { value: fake.value, configurable: true });
  }, { value });
}

// Days from now until the time stored under `key`.
async function snoozedDays(page, key) {
  const [until, now] = await page.evaluate((k) => [localStorage.getItem(k), Date.now()], key);
  return (Date.parse(until) - now) / 86_400_000;
}

// As if the snooze under `key` had run out.
function endSnooze(page, key) {
  return page.evaluate((k) => localStorage.setItem(k, new Date(Date.now() - 60_000).toISOString()), key);
}

// A banner's How: Help, on top of Settings, scrolled to the install steps.
async function expectInstallHelp(page) {
  await expect(page.getByRole('heading', { level: 3, name: 'Put it on your Home Screen' })).toBeInViewport();
  await expect(page.getByRole('heading', { level: 2, name: 'Help' })).not.toBeInViewport();
  await expect(page.locator('#view-title')).toHaveText('Help');
  await expectTab(page, 'Settings'); // the gear, as when Help opens from Settings
  await page.getByRole('button', { name: 'Back to Settings' }).click();
  await expect(page.getByText('Appearance', { exact: true })).toBeVisible();
}

const SAFARI_FIRST = 'You are using Mic Jaunt in Safari. Safari deletes a website\'s data after seven days without a visit. '
  + 'Use Safari\'s “Add to Home Screen”; your songs don\'t move over by themselves.';
const SAFARI_AGAIN = 'Still in Safari. Safari can delete everything here after seven days away, and a backup is the only other copy. '
  + 'Use “Add to Home Screen” now, or back up today.';
const BROWSER = 'Mic Jaunt is running in the browser. '
  + 'Install it for offline use and so the phone cannot clear its data when room runs short.';

test.describe('Backup reminder', () => {
  test('R25: reminds once there are songs and no backup, and goes quiet after a backup', async ({ page }) => {
    await openApp(page);
    await expect(banner(page)).toHaveCount(0); // nothing to lose yet

    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await reload(page);
    await expect(banner(page)).toContainText('You have not backed up yet');

    await banner(page).getByRole('button', { name: 'Back up now' }).click();
    await expectTab(page, 'Settings');
    await expect(banner(page)).toHaveCount(0);

    await downloadBackup(page);
    const meta = await readStore(page, 'meta');
    expect(meta.find((r) => r.key === 'lastBackupAt').value).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    await reload(page);
    await expect(banner(page)).toHaveCount(0);
  });

  test('R25: reminds when the last backup is over 30 days old, and Later hides it for a week', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    const fortyDaysAgo = new Date(Date.now() - 40 * 86_400_000).toISOString();
    await putRecords(page, 'meta', [{ key: 'lastBackupAt', value: fortyDaysAgo }]);
    await reload(page);
    await expect(banner(page)).toContainText('Your last backup was 40 days ago');

    await banner(page).getByRole('button', { name: 'Later' }).click();
    await expect(banner(page)).toHaveCount(0);
    await reload(page);
    await expect(banner(page)).toHaveCount(0);

    // A recent backup needs no reminder at all.
    await putRecords(page, 'meta', [{ key: 'lastBackupAt', value: new Date().toISOString() }]);
    await page.evaluate(() => localStorage.removeItem('backupReminderSnoozedUntil'));
    await reload(page);
    await expect(banner(page)).toHaveCount(0);
    await openSettings(page); // the screen still works with the banner gone
  });
});

test.describe('Getting onto the Home Screen (R65)', () => {
  test('R65: in Safari on an iPhone with songs, a banner says Safari deletes the data; Move my data opens Backup and How the install steps', async ({ page }) => {
    await fakeStandalone(page, false);
    await openApp(page, { persisted: false }); // Safari gets its own banner, never the softer one too
    await expect(moveBanner(page)).toHaveCount(0); // nothing to move yet

    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await reloadWithSongs(page);
    await expect(moveBanner(page).locator('p')).toHaveText(SAFARI_FIRST);
    await expect(moveBanner(page).getByRole('button')).toHaveText(['Move my data', 'How', 'Later']);
    await expect(installBanner(page)).toHaveCount(0);

    await moveBanner(page).getByRole('button', { name: 'Move my data' }).click();
    await expectTab(page, 'Settings');
    await expect(page.getByRole('button', { name: 'Share backup' }).or(page.getByRole('button', { name: 'Download backup' })).first()).toBeVisible();
    await expect(moveBanner(page)).toHaveCount(0);

    await reloadWithSongs(page);
    await moveBanner(page).getByRole('button', { name: 'How' }).click();
    await expect(moveBanner(page)).toHaveCount(0);
    await expectInstallHelp(page);
    await expect(installBanner(page)).toHaveCount(0);
  });

  test('R65: the second showing of the Safari banner is sterner and Later hides it for three days', async ({ page }) => {
    await fakeStandalone(page, false);
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await reloadWithSongs(page);
    await expect(moveBanner(page).locator('p')).toHaveText(SAFARI_FIRST);

    // Ignored, it comes back at the next start, blunter.
    await reloadWithSongs(page);
    await expect(moveBanner(page).locator('p')).toHaveText(SAFARI_AGAIN);
    expect(await page.evaluate(() => localStorage.getItem('moveBannerShownCount'))).toBe('2');

    await moveBanner(page).getByRole('button', { name: 'Later' }).click();
    await expect(moveBanner(page)).toHaveCount(0);
    const days = await snoozedDays(page, 'moveBannerSnoozedUntil');
    expect(days).toBeGreaterThan(2.99);
    expect(days).toBeLessThanOrEqual(3);
    await reloadWithSongs(page);
    await expect(moveBanner(page)).toHaveCount(0);

    // Three days on it is back, and stays stern.
    await endSnooze(page, 'moveBannerSnoozedUntil');
    await reloadWithSongs(page);
    await expect(moveBanner(page).locator('p')).toHaveText(SAFARI_AGAIN);
  });

  test('R65: in a browser with storage not persistent, a softer banner offers the install steps, and Later hides it', async ({ page }) => {
    await fakeStandalone(page, undefined); // as in Chrome
    await openApp(page, { persisted: false });
    await expect(installBanner(page)).toHaveCount(0); // nothing to lose yet

    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await reloadWithSongs(page);
    await expect(installBanner(page).locator('p')).toHaveText(BROWSER);
    await expect(installBanner(page).getByRole('button')).toHaveText(['How', 'Later']);
    await expect(moveBanner(page)).toHaveCount(0);
    await installBanner(page).getByRole('button', { name: 'How' }).click();
    await expect(installBanner(page)).toHaveCount(0);
    await expectInstallHelp(page);

    // Once every three days at most, Later or not.
    await reloadWithSongs(page);
    await expect(installBanner(page)).toHaveCount(0);

    await endSnooze(page, 'browserBannerSnoozedUntil');
    await reloadWithSongs(page);
    await installBanner(page).getByRole('button', { name: 'Later' }).click();
    await expect(installBanner(page)).toHaveCount(0);
    const days = await snoozedDays(page, 'browserBannerSnoozedUntil');
    expect(days).toBeGreaterThan(2.99);
    expect(days).toBeLessThanOrEqual(3);
    await reloadWithSongs(page);
    await expect(installBanner(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('browserBannerShownCount'))).toBe('2');

    // Nothing once the browser keeps the data for good.
    await fakePersisted(page, true);
    await endSnooze(page, 'browserBannerSnoozedUntil');
    await reloadWithSongs(page);
    await expect(installBanner(page)).toHaveCount(0);
  });

  test('R65: the installed app shows no banner, and an empty library offers to restore a backup', async ({ page }) => {
    await fakeStandalone(page, true); // the Home Screen app on an iPhone
    await openApp(page, { persisted: false }); // installed, it needs no nudge either way
    await expect(moveBanner(page)).toHaveCount(0);
    const card = page.locator('.starting-fresh');
    await expect(card).toContainText('Starting fresh?');
    await card.getByRole('button', { name: 'Restore a backup' }).click();
    await expectTab(page, 'Settings');
    await expect(page.getByText('Restore from backup', { exact: true })).toBeVisible();

    await openScope(page, 'Songs');
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await expect(card).toHaveCount(0);
    await reloadWithSongs(page);
    await expect(moveBanner(page)).toHaveCount(0);
    await expect(installBanner(page)).toHaveCount(0);

    // Installed from Chrome on Android: no navigator.standalone, the manifest's display mode.
    await fakeStandalone(page, undefined);
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (query) => (query === '(display-mode: standalone)' ? { matches: true, media: query } : real(query));
    });
    await reloadWithSongs(page);
    await expect(moveBanner(page)).toHaveCount(0);
    await expect(installBanner(page)).toHaveCount(0);
  });
});
