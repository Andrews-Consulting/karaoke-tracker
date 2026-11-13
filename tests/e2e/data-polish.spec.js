// Wave 3 H: CSV export (R23), printing (R24), new-version banner (R30) and the
// iPhone home-screen tags (R29).
import { test, expect } from '@playwright/test';
import { openApp, putRecords, readStore, waitForServiceWorker } from './helpers.js';
import {
  openSettings, openSongs, collectPageErrors, importCsv, restoreBackup, answerNextDialog,
  songRecord, backupFile, downloadSongsCsv,
} from './helpers-data.js';
import { openSetlists, openSetlist, setlistSongRows, setlistSongRow, addArea } from './helpers-setlists.js';
import { openVenues, openVenue, historyRow } from './helpers-venues.js';

// Every awkward value a CSV has to survive: commas, quotes, a line break,
// accents, a sign on the key, and a song with no optional fields at all.
const SONGS = [
  songRecord(1, 'Valerie', 'Amy Winehouse', {
    genre: 'Soul', year: 2006, key: '-2', tags: ['duet', 'crowd-pleaser'], rating: 5, notes: 'starts cold',
  }),
  songRecord(2, 'Hello, Goodbye', 'The Beatles', { genre: 'Pop', year: 1967, tags: ['60s'], status: 'want-to-try' }),
  songRecord(3, '"Heroes"', 'David Bowie', { genre: 'Rock', year: 1977, key: '+1', notes: 'skip the bridge\nslow, then loud' }),
  songRecord(4, 'Déjà Vu', 'Beyoncé', { genre: 'R&B', status: 'retired', rating: 3 }),
  songRecord(5, 'africa', 'Toto'),
];

const songItem = (page, title) => page.getByRole('listitem').filter({ hasText: title });
const tabBar = (page) => page.getByRole('navigation', { name: 'Sections' });

// The styles that make a printout black on white.
function printColours(page) {
  return page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    text: getComputedStyle(document.body).color,
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }));
}

test.describe('CSV export', () => {
  test('R23: downloads a CSV of all songs that imports back without duplicates', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openApp(page);
    await putRecords(page, 'songs', SONGS);
    await openSettings(page);

    const { filename, text } = await downloadSongsCsv(page);
    expect(filename).toMatch(/^mic-jaunt-songs-\d{4}-\d{2}-\d{2}\.csv$/);
    await expect(page.getByText(`Created ${filename} with 5 songs.`)).toBeVisible();
    // BOM, header, rows by title ignoring case (punctuation first), RFC 4180 quoting, CRLF.
    expect(text).toBe('﻿'
      + 'title,artist,genre,year,key,tags,status,rating,notes\r\n'
      + '"""Heroes""",David Bowie,Rock,1977,+1,,go-to,,"skip the bridge\nslow, then loud"\r\n'
      + 'africa,Toto,,,,,go-to,,\r\n'
      + 'Déjà Vu,Beyoncé,R&B,,,,retired,3,\r\n'
      + '"Hello, Goodbye",The Beatles,Pop,1967,,60s,want-to-try,,\r\n'
      + 'Valerie,Amy Winehouse,Soul,2006,-2,duet; crowd-pleaser,go-to,5,starts cold\r\n');

    // Back into the same library: every row is a duplicate.
    await importCsv(page, text, filename);
    await expect(page.getByText('Imported 0 songs. Skipped 5 duplicates.')).toBeVisible();
    expect(await readStore(page, 'songs')).toHaveLength(5);

    // Into an empty library: the songs come back with genre, year, key and tags.
    const dialog = answerNextDialog(page, true);
    await restoreBackup(page, backupFile());
    await dialog;
    await expect(page.getByText(/^Restored 0 songs/)).toBeVisible();
    await importCsv(page, text, filename);
    await expect(page.getByText('Imported 5 songs.')).toBeVisible();
    const pick = ({ title, artist, genre, year, key, tags }) => ({ title, artist, genre, year, key, tags });
    const byTitle = (a, b) => a.title.localeCompare(b.title);
    expect((await readStore(page, 'songs')).map(pick).sort(byTitle)).toEqual(SONGS.map(pick).sort(byTitle));
    expect(errors).toEqual([]);
  });
});

test.describe('Printing', () => {
  test('R24: prints the song list without the tabs and forms', async ({ page }) => {
    await openApp(page);
    await putRecords(page, 'songs', SONGS);
    await openSongs(page);
    await page.getByText('Add a song', { exact: true }).click();
    const addForm = page.getByRole('form', { name: 'Add a song' });
    await expect(addForm).toBeVisible();

    await page.emulateMedia({ media: 'print' });
    await expect(tabBar(page)).toBeHidden();
    await expect(addForm).toBeHidden();
    await expect(page.getByRole('searchbox', { name: 'Search songs' })).toBeHidden();
    await expect(page.locator('details.find-filters')).toBeHidden();
    await expect(page.getByLabel('Venue')).toBeHidden();

    await expect(page.getByRole('heading', { level: 1, name: 'Songs' })).toBeVisible();
    await expect(page.getByText('5 of 5 songs')).toBeVisible();
    for (const song of SONGS) await expect(songItem(page, song.title)).toBeVisible();
    await expect(songItem(page, 'Valerie').locator('.sub')).toHaveText('Amy Winehouse · Soul · 2006');
    await expect(songItem(page, 'Valerie').locator('.sub')).toBeVisible();

    expect(await printColours(page)).toEqual({ background: 'rgb(255, 255, 255)', text: 'rgb(0, 0, 0)', scheme: 'light' });
    const row = await page.locator('.song-row').first().evaluate((node) => ({
      color: getComputedStyle(node).color,
      fontSize: parseFloat(getComputedStyle(node.querySelector('.title')).fontSize),
      mainOverflow: getComputedStyle(document.querySelector('main')).overflowY,
    }));
    expect(row.color).toBe('rgb(0, 0, 0)');
    expect(row.fontSize).toBeGreaterThanOrEqual(14.6); // 11 pt
    expect(row.fontSize).toBeLessThanOrEqual(16); // 12 pt
    expect(row.mainOverflow).toBe('visible'); // a scrolling <main> would print only its first screen

    // Back on screen, everything returns.
    await page.emulateMedia({ media: 'screen' });
    await expect(tabBar(page)).toBeVisible();
    await expect(addForm).toBeVisible();
  });

  test("R24: prints a setlist's songs", async ({ page }) => {
    await openApp(page);
    await putRecords(page, 'songs', SONGS);
    await putRecords(page, 'venues', [{ id: 1, name: 'The Crown' }]);
    await putRecords(page, 'sings', [{ id: 1, songId: 1, venueId: 1, date: '2026-10-30' }]);
    await putRecords(page, 'setlists', [{ id: 1, name: 'Friday', venueId: 1, songIds: [3, 1] }]);
    await openSetlists(page);
    await openSetlist(page, 'Friday');

    await page.emulateMedia({ media: 'print' });
    await expect(tabBar(page)).toBeHidden();
    await expect(page.getByRole('button', { name: '‹ All setlists' })).toBeHidden();
    await expect(addArea(page)).toBeHidden();

    await expect(page.getByRole('heading', { level: 2, name: 'Friday' })).toBeVisible();
    await expect(page.getByText('At The Crown')).toBeVisible();
    await expect(setlistSongRows(page)).toHaveCount(2);
    const valerie = setlistSongRow(page, 'Valerie');
    await expect(setlistSongRow(page, '"Heroes"')).toBeVisible();
    await expect(valerie).toBeVisible();
    await expect(valerie.locator('.sub')).toBeVisible();
    await expect(valerie.locator('.flag')).toBeVisible();
    await expect(valerie.locator('.flag')).toHaveText('Sung here · last 2026-10-30');
    await expect(valerie.getByRole('button', { name: 'Remove Valerie by Amy Winehouse' })).toBeHidden();

    expect(await printColours(page)).toEqual({ background: 'rgb(255, 255, 255)', text: 'rgb(0, 0, 0)', scheme: 'light' });
  });

  test("R24: prints a venue's history with every date", async ({ page }) => {
    await openApp(page);
    await putRecords(page, 'songs', SONGS);
    await putRecords(page, 'venues', [{ id: 1, name: 'The Crown' }]);
    await putRecords(page, 'sings', [
      { id: 1, songId: 1, venueId: 1, date: '2026-10-02' },
      { id: 2, songId: 1, venueId: 1, date: '2026-10-30' },
    ]);
    await openVenues(page);
    await openVenue(page, 'The Crown');
    const valerie = historyRow(page, 'Valerie');
    await expect(valerie.getByText('2026-10-02', { exact: true })).toBeHidden(); // closed on screen

    await page.emulateMedia({ media: 'print' });
    await expect(tabBar(page)).toBeHidden();
    await expect(page.getByRole('form', { name: 'Log a sing' })).toBeHidden();
    await expect(page.getByRole('heading', { level: 2, name: 'The Crown' })).toBeVisible();
    await expect(valerie).toBeVisible();
    await expect(valerie.locator('summary .sub')).toContainText('Sung 2 times');
    await expect(valerie.getByText('2026-10-02', { exact: true })).toBeVisible();
    await expect(valerie.getByText('2026-10-30', { exact: true })).toBeVisible();
    await expect(valerie.getByRole('button', { name: /^Delete sing/ }).first()).toBeHidden();
    expect(await printColours(page)).toEqual({ background: 'rgb(255, 255, 255)', text: 'rgb(0, 0, 0)', scheme: 'light' });
  });
});

test.describe('Updates', () => {
  // Neither page.route() nor context.route() sees the browser's own fetch of
  // sw.js during an update check, so a test cannot serve changed bytes. A new
  // script URL installs a new worker just the same (the server ignores the
  // query), and sw.js's skipWaiting() and clients.claim() then hand it this page.
  const installNewVersion = (page, scriptUrl) =>
    page.evaluate((url) => navigator.serviceWorker.register(url).then(() => {}), scriptUrl);

  test('R30: offers to reload when a new version is installed', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.addInitScript(() => {
      window.controllerChanges = 0;
      window.updateChecks = 0;
      if (!('serviceWorker' in navigator)) return;
      // Added before the app's own listener, so the app has handled each change once this counts it.
      navigator.serviceWorker.addEventListener('controllerchange', () => { window.controllerChanges += 1; });
      const update = ServiceWorkerRegistration.prototype.update;
      ServiceWorkerRegistration.prototype.update = function countedUpdate(...args) {
        window.updateChecks += 1;
        return update.apply(this, args);
      };
    });
    const count = (name) => page.evaluate((key) => window[key], name);
    const banner = page.getByRole('region', { name: 'New version' });

    // The very first install takes control of the page without a banner.
    await openApp(page);
    await waitForServiceWorker(page);
    await expect.poll(() => count('controllerChanges')).toBe(1);
    await expect(banner).toHaveCount(0);

    // A new version installs while the app is open.
    await installNewVersion(page, 'sw.js?r30=1');
    await expect(banner).toBeVisible();
    await expect(banner.getByText('A new version is ready.')).toBeVisible();
    const reload = banner.getByRole('button', { name: 'Reload' });
    const later = banner.getByRole('button', { name: 'Later' });
    for (const button of [reload, later]) {
      const box = await button.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    // Above the tabs, within thumb reach.
    const [bannerBox, tabsBox] = [await banner.boundingBox(), await tabBar(page).boundingBox()];
    expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(tabsBox.y + 1);
    await later.click();
    await expect(banner).toBeHidden();

    // Coming back to the foreground checks for a new version.
    const checks = await count('updateChecks');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => count('updateChecks')).toBe(checks + 1);

    // Another version; Reload loads it.
    await installNewVersion(page, 'sw.js');
    await expect(banner).toBeVisible();
    await page.evaluate(() => { window.beforeReload = true; });
    await Promise.all([page.waitForEvent('load'), reload.click()]);
    expect(await page.evaluate(() => window.beforeReload)).toBeUndefined();
    await expect(page.getByRole('heading', { level: 1, name: 'Songs' })).toBeVisible();
    await waitForServiceWorker(page);
    await expect(banner).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('iPhone home screen', () => {
  test('R29: has iPhone home-screen icon and status-bar meta tags', async ({ page, request }) => {
    await openApp(page);
    const meta = (name) => page.locator(`meta[name="${name}"]`);
    await expect(meta('apple-mobile-web-app-capable')).toHaveAttribute('content', 'yes');
    await expect(meta('mobile-web-app-capable')).toHaveAttribute('content', 'yes');
    await expect(meta('apple-mobile-web-app-title')).toHaveAttribute('content', 'Mic Jaunt');
    await expect(meta('apple-mobile-web-app-status-bar-style')).toHaveAttribute('content', 'black-translucent');
    // black-translucent draws the app under the status bar; viewport-fit=cover lets
    // the header's safe-area padding keep the title clear of it.
    await expect(meta('viewport')).toHaveAttribute('content', /viewport-fit=cover/);

    const icon = page.locator('link[rel="apple-touch-icon"]');
    await expect(icon).toHaveCount(1);
    const url = new URL(await icon.getAttribute('href'), page.url());
    expect(url.origin).toBe(new URL(page.url()).origin);
    const res = await request.get(url.toString());
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/^image\/png\b/);
    const png = await res.body();
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // 180 x 180 px is the size iPhones use on the home screen.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
  });
});
