// Settings view: persistent storage (R19), CSV import (R22), JSON backup (R20)
// and restore (R21).
import { db } from '../db.js';
import { el, viewEl, confirmAction } from '../ui.js';

export const APP_VERSION = '0.2.0';

// The CSV and backup helpers load on first use, so starting the app (online or
// from the service worker cache) never depends on them.
const loadCsv = () => import('../lib/csv.js');
const loadBackup = () => import('../lib/backup.js');

const errorText = (err) => (err && err.message) || String(err);

// A live region for results and errors. It stays until the view is re-rendered.
function messageArea() {
  const node = el('div', { class: 'message', role: 'status' });
  return {
    node,
    show(text, { error = false, items = [] } = {}) {
      node.classList.toggle('error', error);
      const children = [el('p', { text })];
      if (items.length) children.push(el('ul', {}, ...items.map((item) => el('li', { text: item }))));
      node.replaceChildren(...children);
    },
  };
}

// A 44 px button that opens the file picker. A <label> around the input opens
// it natively, which also works on iOS where scripted clicks can be ignored.
function filePicker(text, accept, onFile) {
  const input = el('input', { type: 'file', accept, class: 'file-input' });
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.value = ''; // so choosing the same file again still fires `change`
    if (file) onFile(file);
  });
  return el('label', { class: 'btn file-btn' }, text, input);
}

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

  // ---- R22: import songs from CSV ----
  const importMsg = messageArea();

  async function importCsv(file) {
    importMsg.show(`Reading ${file.name}…`);
    try {
      const text = await file.text();
      const { parseCsv, planImport, importSummary } = await loadCsv();
      const plan = planImport(parseCsv(text), await db.getAll('songs'));
      if (plan.toAdd.length) await db.addAll('songs', plan.toAdd);
      importMsg.show(importSummary(plan));
    } catch (err) {
      importMsg.show(`Could not import ${file.name}. ${errorText(err)}`, { error: true });
    }
  }

  // ---- R20: download a JSON backup ----
  const backupMsg = messageArea();

  async function downloadBackup() {
    try {
      const { buildBackup, backupFileName, countRecords, formatCounts } = await loadBackup();
      const now = new Date();
      const backup = buildBackup(await db.exportAll(), now);
      const name = backupFileName(now);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = el('a', { href: url, download: name, hidden: '' });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      backupMsg.show(`Created ${name} with ${formatCounts(countRecords(backup.data))}.`);
    } catch (err) {
      backupMsg.show(`Could not create a backup. ${errorText(err)}`, { error: true });
    }
  }

  // ---- R21: restore from a JSON backup ----
  async function restoreBackup(file) {
    backupMsg.show(`Reading ${file.name}…`);
    try {
      const text = await file.text();
      const { validateBackup, countRecords, formatCounts, restoreMessage } = await loadBackup();

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        backupMsg.show(`${file.name} is not a backup: it is not valid JSON. Nothing was changed.`, { error: true });
        return;
      }
      const result = validateBackup(parsed);
      if (!result.ok) {
        backupMsg.show(`${file.name} cannot be restored. Nothing was changed.`, { error: true, items: result.problems });
        return;
      }

      const incoming = countRecords(result.data);
      const current = countRecords(await db.exportAll());
      if (!confirmAction(restoreMessage(current, incoming))) {
        backupMsg.show('Restore cancelled. Nothing was changed.');
        return;
      }
      await db.replaceAll(result.data);
      backupMsg.show(`Restored ${formatCounts(incoming)} from ${file.name}.`);
    } catch (err) {
      backupMsg.show(`Could not restore ${file.name}. ${errorText(err)} Nothing was changed.`, { error: true });
    }
  }

  viewEl.replaceChildren(
    el('div', { class: 'stack' },
      el('div', { class: 'card stack' }, el('strong', { text: 'Storage' }), status, ask),
      el('div', { class: 'card stack' },
        el('strong', { text: 'Import songs' }),
        el('p', {
          class: 'muted',
          text: 'Choose a CSV file with a header row. Title and artist columns are required; '
            + 'genre, year, key and tags are optional (separate tags with ; or ,). '
            + 'Songs already in your library are skipped.',
        }),
        filePicker('Import songs from CSV', '.csv,text/csv', importCsv),
        importMsg.node),
      el('div', { class: 'card stack' },
        el('strong', { text: 'Backup' }),
        el('p', {
          class: 'muted',
          text: 'Save songs, venues, the sing log and setlists to one JSON file. '
            + 'Keep a copy somewhere other than this device.',
        }),
        el('button', { class: 'btn', type: 'button', text: 'Download backup', onclick: downloadBackup }),
        el('p', {
          class: 'muted',
          text: 'Restoring replaces everything on this device with the contents of a backup file. '
            + 'You will be asked to confirm first.',
        }),
        filePicker('Restore from backup', '.json,application/json', restoreBackup),
        backupMsg.node),
      el('p', { class: 'count', text: `Version ${APP_VERSION}` })));
  refresh();
}
