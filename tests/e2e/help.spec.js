// R76: a short Help screen behind a button at the top of Settings, with a link
// to the full guide on the site (help/index.html), and Back to Settings.
import { test, expect } from '@playwright/test';
import { openApp, openSettings, expectTab } from './helpers.js';

const settingsShowing = (page) => expect(page.getByText('Appearance', { exact: true })).toBeVisible();

test.describe('Help', () => {
  test('R76: Help opens from the top of Settings, names the screens, gives the install steps for iPhone and Android, links to the full guide, and Back returns to Settings', async ({ page }) => {
    await openApp(page);
    await openSettings(page);

    // The first thing in Settings, above Appearance.
    const help = page.getByRole('button', { name: 'Help', exact: true });
    const [helpBox, appearanceBox] = [await help.boundingBox(), await page.getByText('Appearance', { exact: true }).boundingBox()];
    expect(helpBox.y + helpBox.height).toBeLessThanOrEqual(appearanceBox.y);
    expect(helpBox.height).toBeGreaterThanOrEqual(44);
    await help.click();

    await expect(page.getByRole('heading', { level: 2, name: 'Help' })).toBeVisible();
    await expect(page.locator('#view-title')).toHaveText('Help');
    await expectTab(page, 'Settings'); // Help is part of Settings: the gear stays selected
    await expect(page.locator('.help-view h3')).toHaveText([
      'What it\'s for', 'Put it on your Home Screen', 'The screens', 'Tonight, step by step', 'First time here', 'Tips',
    ]);
    await expect(page.getByRole('heading', { level: 2, name: 'Help' })).toBeInViewport(); // opened at the top

    // Installing: why, then three steps for each phone (R65).
    const install = page.getByRole('region', { name: 'Put it on your Home Screen' });
    await expect(install).toContainText('Safari on an iPhone deletes a website\'s data after seven days without a visit');
    await expect(install.locator('h4')).toHaveText(['iPhone', 'Android']);
    await expect(install.locator('ol').first().locator('li')).toHaveText([
      'Open micjaunt.app in Safari.', /^Tap Share/, /Add to Home Screen.*then tap Add\.$/,
    ]);
    await expect(install.locator('ol').nth(1).locator('li')).toHaveText([
      'Open micjaunt.app in Chrome.', 'Tap the three-dot menu.', /^Tap “Add to home screen” \(or “Install app”\), then Install\.$/,
    ]);
    await expect(install).toContainText('Restore from backup in the installed app');
    await expect(install).toContainText('share their data, so nothing needs moving');
    const screens = page.getByRole('region', { name: 'The screens' });
    await expect(screens.locator('li > strong')).toHaveText(['Tonight', 'Songs', 'Lists', 'History', 'Settings (the gear)']);
    await expect(page.getByRole('region', { name: 'Tonight, step by step' }).locator('ol > li')).toHaveCount(5);

    // The full guide opens in the browser, beside the app.
    const guide = page.getByRole('link', { name: 'Full guide' });
    await expect(guide).toHaveAttribute('href', 'help/');
    await expect(guide).toHaveAttribute('target', '_blank');
    await expect(guide).toHaveAttribute('rel', 'noopener');
    const [popup] = await Promise.all([page.waitForEvent('popup'), guide.click()]);
    await popup.waitForLoadState('load');
    await expect(popup.getByRole('heading', { level: 1 })).toHaveText(/Mic Jaunt/);
    await expect(popup.getByRole('heading', { level: 2, name: 'Getting started' })).toBeVisible();
    await expect(popup.getByRole('link', { name: 'Open Mic Jaunt' }).first()).toHaveAttribute('href', '../');
    // Every picture loads, and the page fits a phone without sideways scrolling.
    const images = popup.locator('img');
    expect(await images.count()).toBeGreaterThan(0);
    for (const img of await images.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((node) => node.complete && node.naturalWidth)).toBeGreaterThan(0);
    }
    expect(await popup.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await popup.close();

    // Back returns to Settings, with the history in step.
    await page.getByRole('button', { name: 'Back to Settings' }).click();
    await settingsShowing(page);
    await expect(page.locator('#view-title')).toHaveText('Settings');
    await expectTab(page, 'Settings');

    // So does the back gesture; one more leaves Settings for the scope below.
    await help.click();
    await expect(page.getByRole('heading', { level: 2, name: 'Help' })).toBeVisible();
    await page.goBack();
    await settingsShowing(page);
    await page.goBack();
    await expectTab(page, 'Songs');
    await expect(help).toHaveCount(0);
  });

  test('R79: the Contact card at the foot of Settings links to chris@micjaunt.app with the version and device in the email', async ({ page, browserName }) => {
    await openApp(page);
    await openSettings(page);

    const card = page.locator('#contact-card');
    await card.scrollIntoViewIfNeeded();
    await expect(card).toContainText('To report defects or request enhancements, please email:');
    // The last card, above only the version line.
    const cards = page.locator('#view .card');
    expect(await cards.last().getAttribute('id')).toBe('contact-card');
    const [cardBox, versionBox] = [await card.boundingBox(), await page.getByText(/^Version \d/).boundingBox()];
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(versionBox.y);

    // The link is a tap target (R31) that opens Mail on the address, subject and body filled in.
    const link = card.getByRole('link', { name: 'chris@micjaunt.app' });
    expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
    const url = new URL(await link.getAttribute('href'));
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe('chris@micjaunt.app');
    const version = await page.evaluate(() => import('./js/version.js').then((m) => m.APP_VERSION));
    expect(url.searchParams.get('subject')).toBe(`Mic Jaunt ${version}`);
    const body = url.searchParams.get('body');
    expect(body.startsWith('What happened:\n')).toBe(true);
    expect(body).toContain(`\nMic Jaunt ${version}\n`);
    // The device line: the phone the test runs as, in a browser tab, and its screen.
    const device = body.split('\n').at(-1);
    expect(device).toMatch(browserName === 'webkit' ? /^iPhone, iOS \d+\.\d+, Safari, browser, \d+×\d+$/ : /^Android \d+, Pixel 7, Chrome, browser, \d+×\d+$/);
    await expect(card).toContainText(`your device (${device})`);
  });
});
