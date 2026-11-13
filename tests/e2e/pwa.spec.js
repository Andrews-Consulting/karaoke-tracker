import { test, expect } from '@playwright/test';
import { openApp, addSong, waitForServiceWorker, expectTab } from './helpers.js';

test.describe('PWA', () => {
  test('R27: loads offline after the service worker is installed', async ({ page, context }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await waitForServiceWorker(page);

    await context.setOffline(true);
    try {
      await page.reload();
      await expectTab(page, 'Songs');
      await expect(page.getByText('1 of 1 songs')).toBeVisible();
      await expect(page.getByRole('listitem').filter({ hasText: 'Valerie' })).toBeVisible();

      // Other views come from the cache too.
      await page.getByRole('button', { name: 'Settings' }).click();
      await expectTab(page, 'Settings');
    } finally {
      await context.setOffline(false);
    }
  });

  test('R26: has an installable web app manifest', async ({ page, request }) => {
    await openApp(page);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();

    const res = await request.get(new URL(href, page.url()).toString());
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest.name).toBe('Mic Jaunt');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12); // fits under an iOS icon
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toMatch(/^#/);
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512')).toBe(true);
  });

  test('R19: asks for persistent storage at startup', async ({ page }) => {
    await page.addInitScript(() => {
      window.__persistCalls = 0;
      const storage = navigator.storage;
      if (storage) {
        const original = storage.persist ? storage.persist.bind(storage) : async () => false;
        Object.defineProperty(storage, 'persist', {
          configurable: true,
          value: async () => { window.__persistCalls += 1; return original(); },
        });
      }
    });
    await openApp(page);
    await expect.poll(() => page.evaluate(() => window.__persistCalls)).toBeGreaterThanOrEqual(1);
  });
});
