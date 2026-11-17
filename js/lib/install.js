// Getting the app onto the Home Screen (R65): the words of the banners that
// say so while it runs in a browser tab, and how long Later hides them. Pure:
// no DOM, no storage; js/reminder.js shows the banners.
//
// In Safari on an iPhone a website's data is deleted after seven days without
// a visit, and the Home Screen app keeps its own data apart from Safari's, so
// that banner is blunt and gets blunter from its second showing. Elsewhere
// (Chrome on Android, a computer) the installed app shares the browser's data
// and the risk is the browser clearing it when room runs short, so that
// banner is softer and shows only while storage is not persistent (R19).

// Later hides either banner for this long. The backup reminder's snooze
// (BACKUP_SNOOZE_DAYS in js/lib/backup.js) is a week; this is shorter because
// Safari's seven days are the deadline.
export const INSTALL_SNOOZE_DAYS = 3;

// When a hidden banner may show again: INSTALL_SNOOZE_DAYS from `now`, as ISO.
export function installSnoozeUntil(now = new Date()) {
  return new Date(now.getTime() + INSTALL_SNOOZE_DAYS * 86_400_000).toISOString();
}

// True while `until` (an ISO time from installSnoozeUntil) is after `now`.
// Missing or unreadable means not snoozed, so the banner shows.
export function snoozed(until, now = new Date()) {
  const time = Date.parse(until);
  return !Number.isNaN(time) && time > now.getTime();
}

// The Safari banner for its `showings`-th showing on this phone (1 for the
// first). From the second it says plainly what is at stake.
export function moveBannerText(showings) {
  if (showings > 1) {
    return 'Still in Safari. Safari can delete everything here after seven days away, and a backup is the only other copy. '
      + 'Use “Add to Home Screen” now, or back up today.';
  }
  return 'You are using Mic Jaunt in Safari. Safari deletes a website\'s data after seven days without a visit. '
    + 'Use Safari\'s “Add to Home Screen”; your songs don\'t move over by themselves.';
}

// The softer banner, in any other browser tab while storage is not persistent.
export const BROWSER_BANNER_TEXT = 'Mic Jaunt is running in the browser. '
  + 'Install it for offline use and so the phone cannot clear its data when room runs short.';
