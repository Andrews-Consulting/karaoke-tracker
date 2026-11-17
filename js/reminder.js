// The banners above the dock at startup, other than the new version's (R30).
//
// Backup reminder (R25): when the last backup is over 30 days old (or there
// has never been one) and there are songs to lose, a banner offers to go to
// Settings. "Later" hides it for a week. The time of the last backup lives in
// the meta store (written by Settings on download); the snooze lives in
// localStorage, because it is about this device's owner and not worth
// backing up.
//
// Getting onto the Home Screen (R65): see below.
import { db } from './db.js';
import { el } from './ui.js';
import { backupReminder, snoozeUntil } from './lib/backup.js';
import {
  installSnoozeUntil, snoozed, moveBannerText, BROWSER_BANNER_TEXT,
} from './lib/install.js';

export const LAST_BACKUP_KEY = 'lastBackupAt';
const SNOOZE_KEY = 'backupReminderSnoozedUntil';

function readItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the banner just comes back next time.
  }
}

// Records a backup download, so the reminder goes quiet for 30 days.
export function recordBackup(now = new Date()) {
  return db.put('meta', { key: LAST_BACKUP_KEY, value: now.toISOString() });
}

// ---- Getting onto the Home Screen (R65) ----
//
// On an iPhone the installed app and Safari keep separate data, and nothing
// can copy between them; Safari also deletes a website's data after seven
// days without a visit. So while the app runs in Safari (navigator.standalone
// is false there and nowhere else) and holds songs, a banner says so, with
// Move my data (Backup), How (the install steps in Help) and Later; the
// installed app's empty Songs tab points at Restore. In any other browser
// (Chrome on Android shares its data with the installed app) the risk is the
// browser clearing it when room runs short, so a softer banner shows only
// while storage is not persistent, at most once every three days.
//
// Each banner's snooze and its count of showings live in localStorage, like
// the backup reminder's: they are about this browser, not worth backing up.
const MOVE_SNOOZE_KEY = 'moveBannerSnoozedUntil';
const MOVE_COUNT_KEY = 'moveBannerShownCount';
const BROWSER_SNOOZE_KEY = 'browserBannerSnoozedUntil';
const BROWSER_COUNT_KEY = 'browserBannerShownCount';

export function runningInSafariOnIphone() {
  return navigator.standalone === false;
}

// Opened from the Home Screen: navigator.standalone on an iPhone, the
// display mode from the manifest (R26) everywhere else.
function runningInstalled() {
  if (navigator.standalone === true) return true;
  try {
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

// Adds one to a banner's count of showings and returns the new count.
function countShowing(key) {
  const shown = (Number.parseInt(readItem(key), 10) || 0) + 1;
  writeItem(key, String(shown));
  return shown;
}

async function hasSongs(what) {
  try {
    return (await db.count('songs')) > 0;
  } catch (err) {
    console.debug(`${what} skipped:`, err);
    return false;
  }
}

// A banner above the dock: the text, then [label, action, primary] buttons.
// Every button closes it before acting.
function showBanner(className, label, text, buttons) {
  const banner = el('div', { class: `update-banner ${className}`, role: 'region', 'aria-label': label },
    el('p', { text }),
    ...buttons.map(([name, act, primary]) => el('button', {
      class: primary ? 'btn primary' : 'btn', type: 'button', text: name,
      onclick: () => {
        banner.remove();
        act();
      },
    })));
  document.body.append(banner);
}

// In Safari on an iPhone with songs. `goToBackup()` opens Settings at Backup;
// `showInstallHelp()` opens Help at its Install card. Resolves true when the
// banner is showing: the backup reminder then stays quiet, since this one
// already says to back up and two banners took a third of the screen.
export async function checkSafariMove(goToBackup, showInstallHelp) {
  if (!runningInSafariOnIphone()) return false;
  if (snoozed(readItem(MOVE_SNOOZE_KEY))) return false;
  if (!(await hasSongs('Move banner'))) return false;

  showBanner('move', 'Add to the Home Screen', moveBannerText(countShowing(MOVE_COUNT_KEY)), [
    ['Move my data', goToBackup, true],
    ['How', showInstallHelp],
    ['Later', () => writeItem(MOVE_SNOOZE_KEY, installSnoozeUntil())],
  ]);
  return true;
}

// In any other browser tab with songs, while storage is not persistent.
// Showing it starts the three days, so it shows at most once in that time;
// Later starts them again from the tap.
export async function checkBrowserInstall(showInstallHelp) {
  if (runningInSafariOnIphone() || runningInstalled()) return;
  if (!navigator.storage || !navigator.storage.persisted) return;
  if (snoozed(readItem(BROWSER_SNOOZE_KEY))) return;
  try {
    if (await navigator.storage.persisted()) return;
  } catch {
    return; // cannot tell: say nothing
  }
  if (!(await hasSongs('Install banner'))) return;

  countShowing(BROWSER_COUNT_KEY);
  writeItem(BROWSER_SNOOZE_KEY, installSnoozeUntil());
  showBanner('install', 'Install the app', BROWSER_BANNER_TEXT, [
    ['How', showInstallHelp, true],
    ['Later', () => writeItem(BROWSER_SNOOZE_KEY, installSnoozeUntil())],
  ]);
}

// Checks once and shows the banner if due. `showView('settings')` opens Settings.
export async function checkBackupReminder(showView, now = new Date()) {
  let message;
  try {
    const [record, songCount] = await Promise.all([db.get('meta', LAST_BACKUP_KEY), db.count('songs')]);
    message = backupReminder({ lastBackupAt: record ? record.value : null, snoozedUntil: readItem(SNOOZE_KEY), songCount }, now);
  } catch (err) {
    console.debug('Backup reminder skipped:', err);
    return;
  }
  if (!message) return;

  showBanner('reminder', 'Backup reminder', message, [
    ['Back up now', () => showView('settings'), true],
    ['Later', () => writeItem(SNOOZE_KEY, snoozeUntil(new Date()))],
  ]);
}
