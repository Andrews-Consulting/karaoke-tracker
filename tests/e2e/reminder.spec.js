// R25: a reminder to back up when the last export is over 30 days old.
import { test, expect } from '@playwright/test';
import { openApp, addSong, putRecords, readStore } from './helpers.js';
import { openSettings, downloadBackup } from './helpers-data.js';

const banner = (page) => page.getByRole('region', { name: 'Backup reminder' });

async function reload(page) {
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Songs' })).toBeVisible();
  await expect(page.getByText(/of \d+ songs/)).toBeVisible();
}

test.describe('Backup reminder', () => {
  test('R25: reminds once there are songs and no backup, and goes quiet after a backup', async ({ page }) => {
    await openApp(page);
    await expect(banner(page)).toHaveCount(0); // nothing to lose yet

    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await reload(page);
    await expect(banner(page)).toContainText('You have not backed up yet');

    await banner(page).getByRole('button', { name: 'Back up now' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
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
