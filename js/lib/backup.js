// JSON backup (R20) and restore (R21). Pure: no DOM, no IndexedDB access.
//
// A backup file is one JSON object:
//   { app: 'karaoke-tracker', format: 1, dbVersion, exportedAt,
//     data: { songs: [...], venues: [...], sings: [...], setlists: [...], meta: [...] } }
// `format` is the layout of this wrapper; `dbVersion` is DB_VERSION from js/db.js
// when the file was made, i.e. the shape of the records. When DB_VERSION is bumped,
// validateBackup() is where older records get upgraded before a restore.

import { DB_VERSION, STORES } from '../db.js';
import { makeSong } from './song.js';

export const BACKUP_APP = 'karaoke-tracker';
export const BACKUP_FORMAT = 1;

const LABELS = { songs: 'songs', venues: 'venues', sings: 'sing log', setlists: 'setlists', meta: 'app settings' };

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Wraps db.exportAll() output in the backup format.
export function buildBackup(data, now = new Date()) {
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    dbVersion: DB_VERSION,
    exportedAt: now.toISOString(),
    data: Object.fromEntries(STORES.map((name) => [name, (data && data[name]) || []])),
  };
}

// karaoke-backup-YYYY-MM-DD.json, using the local calendar day.
export function backupFileName(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `karaoke-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

function validKey(store, record) {
  if (!isObject(record)) return false;
  if (store === 'meta') return typeof record.key === 'string' && record.key !== '';
  return Number.isInteger(record.id) && record.id > 0;
}

// Checks a parsed backup file. Returns { ok: true, data } with data ready for
// db.replaceAll(), or { ok: false, problems: [messages for the user] }.
// Songs are rebuilt through makeSong() (keeping their ids) so missing fields get
// the same defaults as everywhere else; other records are kept as they are.
export function validateBackup(parsed, now = new Date()) {
  if (!isObject(parsed) || parsed.app !== BACKUP_APP) {
    return { ok: false, problems: ['This file is not a Karaoke Tracker backup.'] };
  }

  const problems = [];
  if (parsed.format === undefined) {
    problems.push('The backup does not say which format it uses.');
  } else if (parsed.format !== BACKUP_FORMAT) {
    problems.push(`The backup uses format ${parsed.format}, but this version of the app reads format ${BACKUP_FORMAT}.`);
  }

  if (!Number.isInteger(parsed.dbVersion) || parsed.dbVersion < 1) {
    problems.push('The backup does not say which database version it came from.');
  } else if (parsed.dbVersion > DB_VERSION) {
    problems.push(`The backup was made by a newer version of the app (database version ${parsed.dbVersion}). Update the app, then restore it.`);
  }

  if (!isObject(parsed.data)) {
    problems.push('The backup has no data in it.');
    return { ok: false, problems };
  }

  const data = {};
  for (const name of STORES) {
    const records = parsed.data[name];
    if (records === undefined) {
      problems.push(`The backup has no ${LABELS[name]} section.`);
    } else if (!Array.isArray(records)) {
      problems.push(`The ${LABELS[name]} section is not a list.`);
    } else {
      const bad = records.filter((record) => !validKey(name, record)).length;
      if (bad) {
        const field = name === 'meta' ? 'key' : 'id';
        problems.push(`${bad} of the ${records.length} ${LABELS[name]} records ${bad === 1 ? 'has' : 'have'} no valid ${field}.`);
      }
      data[name] = records;
    }
  }
  if (problems.length) return { ok: false, problems };

  data.songs = data.songs.map((song) => ({ id: song.id, ...makeSong(song, now) }));
  return { ok: true, data };
}

// Record counts for messages: { songs, venues, sings, setlists }.
export function countRecords(data) {
  const count = (name) => (Array.isArray(data && data[name]) ? data[name].length : 0);
  return { songs: count('songs'), venues: count('venues'), sings: count('sings'), setlists: count('setlists') };
}

// "12 songs, 2 venues, 5 sing log entries and 1 setlist"
export function formatCounts({ songs, venues, sings, setlists }) {
  return `${plural(songs, 'song')}, ${plural(venues, 'venue')}, `
    + `${plural(sings, 'sing log entry', 'sing log entries')} and ${plural(setlists, 'setlist')}`;
}

// The confirmation shown before a restore replaces everything on the device.
// ---------- Backup reminder (R25) ----------

export const BACKUP_REMINDER_DAYS = 30;
export const BACKUP_SNOOZE_DAYS = 7;

// Whole days from an ISO timestamp to `now`; null when the timestamp is unreadable.
export function daysSince(iso, now = new Date()) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

// The reminder to show, or null for none. `lastBackupAt` is the ISO time of the
// last backup download (null when there has never been one), `snoozedUntil` an
// ISO time before which the owner asked not to be reminded, `songCount` how
// many songs there are to lose. Nothing to say while the library is empty.
export function backupReminder({ lastBackupAt = null, snoozedUntil = null, songCount = 0 }, now = new Date()) {
  if (!(songCount > 0)) return null;
  const snoozed = Date.parse(snoozedUntil);
  if (!Number.isNaN(snoozed) && snoozed > now.getTime()) return null;
  const days = lastBackupAt ? daysSince(lastBackupAt, now) : null;
  if (days === null) return 'You have not backed up yet. A backup is the only copy of your songs and sing log.';
  if (days < BACKUP_REMINDER_DAYS) return null;
  return `Your last backup was ${days} days ago. Download a fresh one to be safe.`;
}

// When a snoozed reminder may show again: BACKUP_SNOOZE_DAYS from now, as ISO.
export function snoozeUntil(now = new Date()) {
  return new Date(now.getTime() + BACKUP_SNOOZE_DAYS * 86_400_000).toISOString();
}

export function restoreMessage(current, incoming) {
  const total = current.songs + current.venues + current.sings + current.setlists;
  if (total === 0) return `Restore ${formatCounts(incoming)} from the backup?`;
  return `Replace the ${formatCounts(current)} on this device with ${formatCounts(incoming)} `
    + 'from the backup? This cannot be undone.';
}
