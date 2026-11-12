// Backup reminder (R25): at startup, when the last backup is over 30 days old
// (or there has never been one) and there are songs to lose, a banner above
// the tabs offers to go to Settings. "Later" hides it for a week. The time of
// the last backup lives in the meta store (written by Settings on download);
// the snooze lives in localStorage, because it is about this device's owner
// and not worth backing up.
import { db } from './db.js';
import { el } from './ui.js';
import { backupReminder, snoozeUntil } from './lib/backup.js';

export const LAST_BACKUP_KEY = 'lastBackupAt';
const SNOOZE_KEY = 'backupReminderSnoozedUntil';

function readSnooze() {
  try {
    return localStorage.getItem(SNOOZE_KEY);
  } catch {
    return null;
  }
}

function writeSnooze(iso) {
  try {
    localStorage.setItem(SNOOZE_KEY, iso);
  } catch {
    // Storage blocked: the banner just comes back next time.
  }
}

// Records a backup download, so the reminder goes quiet for 30 days.
export function recordBackup(now = new Date()) {
  return db.put('meta', { key: LAST_BACKUP_KEY, value: now.toISOString() });
}

// Checks once and shows the banner if due. `showView('settings')` opens Settings.
export async function checkBackupReminder(showView, now = new Date()) {
  let message;
  try {
    const [record, songCount] = await Promise.all([db.get('meta', LAST_BACKUP_KEY), db.count('songs')]);
    message = backupReminder({ lastBackupAt: record ? record.value : null, snoozedUntil: readSnooze(), songCount }, now);
  } catch (err) {
    console.debug('Backup reminder skipped:', err);
    return;
  }
  if (!message) return;

  const banner = el('div', { class: 'update-banner reminder', role: 'region', 'aria-label': 'Backup reminder' },
    el('p', { text: message }),
    el('button', {
      class: 'btn primary', type: 'button', text: 'Back up now',
      onclick: () => {
        banner.remove();
        showView('settings');
      },
    }),
    el('button', {
      class: 'btn', type: 'button', text: 'Later',
      onclick: () => {
        writeSnooze(snoozeUntil(new Date()));
        banner.remove();
      },
    }));
  document.body.append(banner);
}
