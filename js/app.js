// Navigation and startup only. Each section lives in js/views/.
import { renderSongs } from './views/songs.js';
import { renderSetlists } from './views/setlists.js';
import { renderVenues } from './views/venues.js';
import { renderSettings } from './views/settings.js';
import { rootScreen, setViewSwitcher } from './ui.js';
import { initTheme } from './theme.js';
import { checkBackupReminder } from './reminder.js';

initTheme(); // R32: dark by default, light or the phone's setting when chosen

const titleEl = document.getElementById('view-title');
const tabButtons = document.querySelectorAll('.tabs button');

const views = {
  songs: { title: 'Songs', render: renderSongs },
  setlists: { title: 'Setlists', render: renderSetlists },
  venues: { title: 'Venues', render: renderVenues },
  settings: { title: 'Settings', render: renderSettings },
};

export function show(name) {
  const view = views[name] || views.songs;
  titleEl.textContent = view.title;
  for (const button of tabButtons) {
    if (button.dataset.view === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  rootScreen(name, view.render); // R31: detail screens stack on top of this one
}

for (const button of tabButtons) {
  button.addEventListener('click', () => show(button.dataset.view));
}
setViewSwitcher(show);

// ---------- Startup ----------

// R19: ask once at startup. Browsers may grant this silently or ignore it.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// R27: offline support, and R30: offer to reload when a new version is ready.
// Service workers need HTTPS or http://localhost. Loaded on its own so that
// startup never waits on it, and a failure here cannot stop the app.
import('./update.js')
  .then(({ watchForUpdates }) => watchForUpdates('sw.js'))
  .catch((err) => console.warn('Update check unavailable:', err));

show('songs');

// R25: a reminder above the tabs when the last backup is over 30 days old.
checkBackupReminder(show);
