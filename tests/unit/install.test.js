import { describe, it, expect } from 'vitest';
import {
  INSTALL_SNOOZE_DAYS, installSnoozeUntil, snoozed, moveBannerText, BROWSER_BANNER_TEXT,
} from '../../js/lib/install.js';
import { BACKUP_SNOOZE_DAYS, daysSince } from '../../js/lib/backup.js';

const now = new Date('2026-11-16T20:00:00.000Z');

describe('install banners: Later (R65)', () => {
  it('hides a banner for three days, apart from the backup reminder\'s week', () => {
    expect(INSTALL_SNOOZE_DAYS).toBe(3);
    expect(BACKUP_SNOOZE_DAYS).toBe(7);
    expect(installSnoozeUntil(now)).toBe('2026-11-19T20:00:00.000Z');
    expect(daysSince(now.toISOString(), new Date(installSnoozeUntil(now)))).toBe(3);
  });

  it('is snoozed until that time and not after', () => {
    const until = installSnoozeUntil(now);
    expect(snoozed(until, now)).toBe(true);
    expect(snoozed(until, new Date('2026-11-19T19:59:59.000Z'))).toBe(true);
    expect(snoozed(until, new Date('2026-11-19T20:00:00.000Z'))).toBe(false);
    expect(snoozed(until, new Date('2026-11-25T00:00:00.000Z'))).toBe(false);
  });

  it('is not snoozed with no time or an unreadable one', () => {
    expect(snoozed(null, now)).toBe(false);
    expect(snoozed(undefined, now)).toBe(false);
    expect(snoozed('', now)).toBe(false);
    expect(snoozed('next week', now)).toBe(false);
  });
});

describe('install banners: words (R65)', () => {
  it('the Safari banner says what Safari does the first time', () => {
    const first = 'You are using Mic Jaunt in Safari. Safari deletes a website\'s data after seven days without a visit. '
      + 'Use Safari\'s “Add to Home Screen”; your songs don\'t move over by themselves.';
    expect(moveBannerText(1)).toBe(first);
    expect(moveBannerText(0)).toBe(first); // no count stored yet reads as the first
  });

  it('is sterner from the second showing on', () => {
    const stern = 'Still in Safari. Safari can delete everything here after seven days away, and a backup is the only other copy. '
      + 'Use “Add to Home Screen” now, or back up today.';
    expect(moveBannerText(2)).toBe(stern);
    expect(moveBannerText(9)).toBe(stern);
  });

  it('the browser banner is the softer one', () => {
    expect(BROWSER_BANNER_TEXT).toBe('Mic Jaunt is running in the browser. '
      + 'Install it for offline use and so the phone cannot clear its data when room runs short.');
  });
});
