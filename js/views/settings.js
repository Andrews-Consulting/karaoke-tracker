// Settings view (R19 so far). Wave 1 B adds backup, restore and CSV import.
import { el, viewEl } from '../ui.js';

export const APP_VERSION = '0.2.0';

export async function renderSettings() {
  const status = el('p', { class: 'muted' });

  async function refresh() {
    if (!navigator.storage || !navigator.storage.persisted) {
      status.textContent = 'This browser does not report storage persistence.';
      return;
    }
    const persisted = await navigator.storage.persisted();
    status.textContent = persisted
      ? 'Storage is persistent: the browser will not clear it on its own.'
      : 'Storage is not persistent yet. Installing the app to the home screen usually fixes this.';
  }

  const ask = el('button', {
    class: 'btn', type: 'button', text: 'Ask for persistent storage',
    onclick: async () => {
      if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
      refresh();
    },
  });

  viewEl.replaceChildren(
    el('div', { class: 'stack' },
      el('div', { class: 'card stack' }, el('strong', { text: 'Storage' }), status, ask),
      el('div', { class: 'card stack' },
        el('strong', { text: 'Backup' }),
        el('p', { class: 'muted', text: 'Not built yet: JSON backup and restore (R20, R21), CSV import (R22).' })),
      el('p', { class: 'count', text: `Version ${APP_VERSION}` })));
  refresh();
}
