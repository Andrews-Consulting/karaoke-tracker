// R46: a venue column in the CSV import logs a sing per row.
import { test, expect } from '@playwright/test';
import { openApp, readStore } from './helpers.js';
import { openSettings, openSongs, importCsv } from './helpers-data.js';
import { openVenues, openVenue, historyRow } from './helpers-venues.js';

const songItem = (page, title) => page.getByRole('listitem').filter({ hasText: title });

// The browser's local calendar day, as the app writes it.
const localToday = (page) => page.evaluate(() => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
});

test.describe('CSV import of sings', () => {
  test('R46: a venue column logs a sing per row, dated by the date column or today', async ({ page }) => {
    await openApp(page);
    await openSettings(page);

    const csv = 'artist,title,venue,date\n'
      + 'Redbone,Come and Get Your Love,Viking,2026-10-15\n'
      + 'Incubus,Drive,Viking,\n'
      + 'Chicago,Beginnings,,\n'
      + 'Redbone,Come and Get Your Love,The Crown,10/20/2026\n';
    await importCsv(page, csv);
    await expect(page.getByRole('status')).toHaveText(
      'Imported 3 songs. Logged 3 sings at 2 new venues. Skipped 1 duplicate.');

    const today = await localToday(page);
    const sings = await readStore(page, 'sings');
    expect(sings.map((s) => s.date).sort()).toEqual(['2026-10-15', '2026-10-20', today].sort());

    // The Venues tab shows the venue and its history.
    await openVenues(page);
    await openVenue(page, 'Viking');
    await expect(historyRow(page, 'Come and Get Your Love')).toContainText('2026-10-15');
    await expect(historyRow(page, 'Drive')).toContainText(today);

    // The Songs list, at that venue, shows the stats.
    await openSongs(page);
    await page.getByLabel('Venue', { exact: true }).selectOption({ label: 'Viking' });
    await expect(songItem(page, 'Come and Get Your Love')).toContainText('Sung 1 time · last 2026-10-15');
    await expect(songItem(page, 'Beginnings')).toContainText('Never sung here');

    // Importing the same file again adds nothing.
    await openSettings(page);
    await importCsv(page, csv);
    await expect(page.getByRole('status')).toHaveText('Imported 0 songs. Skipped 4 duplicates and 3 sings already logged.');
    expect(await readStore(page, 'sings')).toHaveLength(3);
    expect(await readStore(page, 'venues')).toHaveLength(2);
  });

  test('R46: an unreadable date skips the sing but keeps the song', async ({ page }) => {
    await openApp(page);
    await openSettings(page);
    await importCsv(page, 'title,artist,venue,date\nDrive,Incubus,Viking,last Friday\n');
    await expect(page.getByRole('status')).toHaveText('Imported 1 song. Skipped 1 sing with an unreadable date.');
    expect(await readStore(page, 'sings')).toEqual([]);
    expect(await readStore(page, 'venues')).toEqual([]);
  });
});
