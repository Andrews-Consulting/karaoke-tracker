// R62: share a backup through the share sheet, which works from an installed
// iPhone app, and check a backup file without restoring it.
import { test, expect } from '@playwright/test';
import { openApp, addSong, readStore } from './helpers.js';
import { openSettings, checkBackupFile, fakeShareSheet, backupFile, songRecord } from './helpers-data.js';

const status = (page) => page.getByRole('status');
const lastBackup = async (page) => (await readStore(page, 'meta')).find((r) => r.key === 'lastBackupAt');

test.describe('Backup sharing and checking', () => {
  test('R62: Share backup hands the file to the share sheet and counts as a backup only when it goes through', async ({ page }) => {
    await fakeShareSheet(page, 'shared');
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await openSettings(page);

    const share = page.getByRole('button', { name: 'Share backup' });
    await expect(share).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download backup' })).toBeVisible();
    await share.click();
    await expect(status(page)).toContainText(/^Shared mic-jaunt-backup-\d{4}-\d{2}-\d{2}\.json with 1 song/);

    const shared = await page.evaluate(() => window.__shared);
    expect(shared).toHaveLength(1);
    expect(shared[0].names[0]).toMatch(/^mic-jaunt-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(shared[0].size).toBeGreaterThan(100);
    expect((await lastBackup(page)).value).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('R62: a cancelled share is not counted as a backup', async ({ page }) => {
    await fakeShareSheet(page, 'cancelled');
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await openSettings(page);
    await page.getByRole('button', { name: 'Share backup' }).click();
    await expect(status(page)).toHaveText('Share cancelled. No backup was made.');
    expect(await lastBackup(page)).toBeUndefined();
  });

  test('R62: without a share sheet only Download backup shows', async ({ page }) => {
    await page.addInitScript(() => { delete navigator.share; delete navigator.canShare; });
    await openApp(page);
    await openSettings(page);
    await expect(page.getByRole('button', { name: 'Download backup' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Share backup' })).toHaveCount(0);
  });

  test('R62: Check a backup file reports what it holds and compares it with the phone, without restoring', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await addSong(page, { title: 'Dancing Queen', artist: 'ABBA' });
    await openSettings(page);

    const file = backupFile({
      songs: [songRecord(1, 'Valerie', 'Amy Winehouse')],
      venues: [{ id: 1, name: 'The Crown' }],
    }, { exportedAt: '2026-11-13T20:04:00.000Z' });
    await checkBackupFile(page, file, 'mic-jaunt-backup-2026-11-13.json');
    await expect(status(page)).toContainText('mic-jaunt-backup-2026-11-13.json is a Mic Jaunt backup made');
    await expect(status(page)).toContainText('with 1 song, 1 venue, 0 sing log entries and 0 setlists.');
    await expect(status(page)).toContainText('This phone has 1 more song, 1 fewer venue than the file.');

    // Nothing changed on the phone.
    expect(await readStore(page, 'songs')).toHaveLength(2);
    expect(await readStore(page, 'venues')).toHaveLength(0);

    // A file that is not a backup says so.
    await checkBackupFile(page, '{"hello": "world"}', 'notes.json');
    await expect(status(page)).toContainText('notes.json is not a usable backup.');
    await expect(status(page)).toContainText('This file is not a Mic Jaunt backup.');
  });
});
