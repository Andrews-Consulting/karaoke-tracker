// Service worker registration (R27) and new-version banner (R30).
//
// sw.js calls skipWaiting() and clients.claim(), so a new version takes control
// of this page as soon as it has installed, but the page keeps running the old
// modules until it reloads. The moment control passes to a new worker
// (`controllerchange`) is when a newer version is ready: show a banner that
// offers to reload. The very first install also fires `controllerchange`, with
// no previous controller, and must not show the banner.
//
// An installed PWA can stay open for days, so the app also checks for a new
// version whenever it comes back to the foreground.
import { el } from './ui.js';

let banner = null;

function showBanner() {
  if (banner && banner.isConnected) return;
  banner = el('div', { class: 'update-banner', role: 'region', 'aria-label': 'New version' },
    el('p', { text: 'A new version is ready.' }),
    el('button', { class: 'btn primary', type: 'button', text: 'Reload', onclick: () => location.reload() }),
    el('button', { class: 'btn', type: 'button', text: 'Later', onclick: () => banner.remove() }));
  document.body.append(banner);
}

// Registers the service worker and watches for new versions. Does nothing in
// browsers without service workers; a failed registration only logs a warning.
export function watchForUpdates(scriptUrl = 'sw.js') {
  if (!('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;

  let hadController = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (hadController) showBanner();
    hadController = !!sw.controller;
  });

  sw.register(scriptUrl)
    .then((registration) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    })
    .catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
}
