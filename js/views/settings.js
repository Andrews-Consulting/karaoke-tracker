// Settings view: persistent storage (R19), CSV import (R22, with sings R46),
// JSON backup (R20) and restore (R21).
import { db, request } from '../db.js';
import { el, viewEl, confirmAction } from '../ui.js';
import { parseCsv, planImport, importSummary } from '../lib/csv.js';
import { songKey } from '../lib/song.js';
import {
  buildBackup, backupFileName, validateBackup, countRecords, formatCounts, restoreMessage,
} from '../lib/backup.js';

export const APP_VERSION = '0.2.0';

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

  // ---- R22, R46: import songs, and sings, from CSV ----
  const importMsg = messageArea();

  // Writes a plan in one transaction: songs, then venues, then the sings that
  // point at them, so a failure part-way leaves nothing half-imported.
  function applyImport(plan, songs, venues) {
    const stores = ['songs', 'venues', 'sings'];
    return db.transaction(stores, 'readwrite', async (s) => {
      const songIds = new Map(songs.map((song) => [songKey(song), song.id]));
      for (const song of plan.toAdd) songIds.set(songKey(song), await request(s.songs.add(song)));
      const venueIds = new Map(venues.map((v) => [v.name.trim().toLowerCase(), v.id]));
      for (const venue of plan.venuesToAdd) {
        venueIds.set(venue.name.toLowerCase(), await request(s.venues.add(venue)));
      }
      for (const sing of plan.sings) {
        s.sings.add({ songId: songIds.get(sing.songKey), venueId: venueIds.get(sing.venue.toLowerCase()), date: sing.date });
      }
    });
  }

  async function importCsv(file) {
    importMsg.show(`Reading ${file.name}…`);
    try {
      const text = await file.text();
      const [songs, venues, sings] = await Promise.all([db.getAll('songs'), db.getAll('venues'), db.getAll('sings')]);
      const plan = planImport(parseCsv(text), songs, new Date(), { venues, sings });
      if (plan.toAdd.length || plan.sings.length) await applyImport(plan, songs, venues);
      importMsg.show(importSummary(plan));
    } catch (err) {
      importMsg.show(`Could not import ${file.name}. ${errorText(err)}`, { error: true });
    }
  }

  // ---- R20: download a JSON backup ----
  const backupMsg = messageArea();

  async function downloadBackup() {
    try {
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
            + 'Songs already in your library are skipped. '
            + 'A venue column logs a sing there for each row, dated by the date column or today when blank.',
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
