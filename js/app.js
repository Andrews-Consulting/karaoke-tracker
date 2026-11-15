// Navigation and startup only. Each scope lives in js/views/; the dock that
// switches between them is js/dock.js.
import { renderTonight } from './views/tonight.js';
import { renderSongs, goToBackup } from './views/songs.js';
import { renderSetlists } from './views/setlists.js';
import { renderVenues } from './views/venues.js';
import { renderSettings } from './views/settings.js';
import { rootScreen, openScreen, setViewSwitcher, onDraw, viewInHistory } from './ui.js';
import * as dock from './dock.js';
import { initTheme } from './theme.js';
import { checkBackupReminder, checkSafariMove } from './reminder.js';

initTheme(); // R32: dark by default, light or the phone's setting when chosen

const titleEl = document.getElementById('view-title');

// Lists and History wrap the Setlists and Venues views until they get the
// Design B treatment.
const scopes = {
  tonight: { title: 'Tonight', render: renderTonight },
  songs: { title: 'Songs', render: renderSongs },
  lists: { title: 'Lists', render: renderSetlists },
  history: { title: 'History', render: renderVenues },
};

// The page title (for screen readers and printouts, R58) follows the scope;
// Settings sets its own as it renders.
onDraw(({ view }) => {
  titleEl.textContent = (scopes[view] || scopes.tonight).title;
});

// Settings, from the gear: a screen on top of the scope showing, so the back
// gesture returns to it (R31). A second tap while it shows does nothing.
function openSettings() {
  if (dock.settingsShowing()) return;
  openScreen(() => {
    titleEl.textContent = 'Settings';
    dock.showingSettings(true);
    return renderSettings();
  });
}

dock.onScope((name) => {
  if (name === 'settings') {
    openSettings();
    return;
  }
  rootScreen(name, scopes[name].render); // R31: detail screens stack on top of this one
});
setViewSwitcher((name) => dock.scope(name));

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

// Tonight is home. A reload (the new-version banner's Reload, say) keeps the
// scope its history entry names.
const reloaded = viewInHistory();
dock.scope(scopes[reloaded] ? reloaded : 'tonight');

// R25: a reminder above the dock when the last backup is over 30 days old.
checkBackupReminder((name) => dock.scope(name));
// R65: in Safari on an iPhone, a nudge to move the data to the installed app.
checkSafariMove(goToBackup);
