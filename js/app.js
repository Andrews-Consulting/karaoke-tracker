// Navigation and startup only. Each section lives in js/views/.
import { renderSongs } from './views/songs.js';
import { renderSetlists } from './views/setlists.js';
import { renderVenues } from './views/venues.js';
import { renderSettings } from './views/settings.js';
import { rootScreen, setViewSwitcher } from './ui.js';

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

// R27: offline support. Service workers need HTTPS or http://localhost.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => {
    console.warn('Service worker registration failed:', err);
  });
}

show('songs');
