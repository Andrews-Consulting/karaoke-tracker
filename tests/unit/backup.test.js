import { describe, it, expect } from 'vitest';
import {
  buildBackup, backupFileName, validateBackup, countRecords, formatCounts, restoreMessage,
  daysSince, backupReminder, snoozeUntil, BACKUP_REMINDER_DAYS, BACKUP_SNOOZE_DAYS,
} from '../../js/lib/backup.js';
import { DB_VERSION } from '../../js/db.js';
import { makeSong } from '../../js/lib/song.js';

const now = new Date('2026-11-11T12:00:00.000Z');

const sampleData = () => ({
  songs: [
    { id: 7, ...makeSong({ title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 }, now) },
    { id: 9, ...makeSong({ title: 'Waterloo', artist: 'ABBA' }, now) },
  ],
  venues: [{ id: 3, name: 'The Crown' }],
  sings: [{ id: 1, songId: 7, venueId: 3, date: '2026-11-01' }],
  setlists: [{ id: 2, name: 'Friday', venueId: 3, songIds: [9, 7] }],
  meta: [{ key: 'lastBackupAt', value: '2026-10-01T00:00:00.000Z' }],
});

const validFile = () => JSON.parse(JSON.stringify(buildBackup(sampleData(), now)));

describe('buildBackup (R20)', () => {
  it('wraps every store with the app name, format, db version and time', () => {
    expect(buildBackup(sampleData(), now)).toEqual({
      app: 'karaoke-tracker',
      format: 1,
      dbVersion: DB_VERSION,
      exportedAt: '2026-11-11T12:00:00.000Z',
      data: sampleData(),
    });
  });

  it('fills stores missing from the input with empty lists', () => {
    expect(buildBackup({ songs: [] }, now).data)
      .toEqual({ songs: [], venues: [], sings: [], setlists: [], meta: [] });
  });
});

describe('backupFileName (R20)', () => {
  it('uses the local calendar day', () => {
    expect(backupFileName(new Date(2026, 10, 11, 23, 59))).toBe('karaoke-backup-2026-11-11.json');
    expect(backupFileName(new Date(2027, 0, 5, 0, 1))).toBe('karaoke-backup-2027-01-05.json');
  });
});

describe('validateBackup (R21)', () => {
  it('accepts a valid file and returns its data, ids intact', () => {
    const result = validateBackup(validFile(), now);
    expect(result).toEqual({ ok: true, data: sampleData() });
  });

  it('survives a JSON round trip of an exported backup', () => {
    const file = JSON.parse(JSON.stringify(buildBackup(sampleData(), now)));
    expect(validateBackup(file, now).data).toEqual(sampleData());
  });

  it('rejects files from another app or that are not objects', () => {
    const notOurs = { ok: false, problems: ['This file is not a Mic Jaunt backup.'] };
    expect(validateBackup({ ...validFile(), app: 'other-app' })).toEqual(notOurs);
    expect(validateBackup({ ...validFile(), app: undefined })).toEqual(notOurs);
    expect(validateBackup(null)).toEqual(notOurs);
    expect(validateBackup([validFile()])).toEqual(notOurs);
    expect(validateBackup('karaoke-tracker')).toEqual(notOurs);
  });

  it('rejects an unknown or missing format number', () => {
    expect(validateBackup({ ...validFile(), format: 2 })).toEqual({
      ok: false,
      problems: ['The backup uses format 2, but this version of the app reads format 1.'],
    });
    expect(validateBackup({ ...validFile(), format: undefined }).problems)
      .toEqual(['The backup does not say which format it uses.']);
  });

  it('rejects a backup from a newer database version, or with none', () => {
    expect(validateBackup({ ...validFile(), dbVersion: DB_VERSION + 1 }).problems[0])
      .toMatch(/newer version of the app/);
    expect(validateBackup({ ...validFile(), dbVersion: 'one' }).problems)
      .toEqual(['The backup does not say which database version it came from.']);
  });

  it('lists every missing store', () => {
    const file = validFile();
    delete file.data.sings;
    delete file.data.meta;
    expect(validateBackup(file)).toEqual({
      ok: false,
      problems: ['The backup has no sing log section.', 'The backup has no app settings section.'],
    });
    expect(validateBackup({ ...validFile(), data: undefined }).problems).toEqual(['The backup has no data in it.']);
  });

  it('rejects a store that is not a list', () => {
    const file = validFile();
    file.data.venues = { id: 3, name: 'The Crown' };
    expect(validateBackup(file)).toEqual({ ok: false, problems: ['The venues section is not a list.'] });
  });

  it('rejects records without a usable id or key', () => {
    const file = validFile();
    file.data.songs.push({ title: 'No id', artist: 'x' }, 'not a record');
    file.data.sings[0].id = 'abc';
    file.data.meta.push({ value: 1 });
    expect(validateBackup(file).problems).toEqual([
      '2 of the 4 songs records have no valid id.',
      '1 of the 1 sing log records has no valid id.',
      '1 of the 2 app settings records has no valid key.',
    ]);
  });

  it('fills in missing song fields with makeSong defaults, keeping the id', () => {
    const file = validFile();
    file.data.songs = [{ id: 4, title: ' Valerie ', artist: 'Amy Winehouse', createdAt: '2020-01-01T00:00:00.000Z' }];
    expect(validateBackup(file, now).data.songs).toEqual([
      { id: 4, ...makeSong({ title: 'Valerie', artist: 'Amy Winehouse', createdAt: '2020-01-01T00:00:00.000Z' }, now) },
    ]);
  });

  it('accepts a backup with every store empty', () => {
    const file = buildBackup({}, now);
    expect(validateBackup(file)).toEqual({
      ok: true, data: { songs: [], venues: [], sings: [], setlists: [], meta: [] },
    });
  });
});

describe('restore messages (R21)', () => {
  it('counts the user-facing stores', () => {
    expect(countRecords(sampleData())).toEqual({ songs: 2, venues: 1, sings: 1, setlists: 1 });
    expect(countRecords({})).toEqual({ songs: 0, venues: 0, sings: 0, setlists: 0 });
  });

  it('formats counts with correct plurals', () => {
    expect(formatCounts({ songs: 1, venues: 1, sings: 1, setlists: 1 }))
      .toBe('1 song, 1 venue, 1 sing log entry and 1 setlist');
    expect(formatCounts({ songs: 412, venues: 0, sings: 40, setlists: 2 }))
      .toBe('412 songs, 0 venues, 40 sing log entries and 2 setlists');
  });

  it('says what will be replaced and what will be restored', () => {
    expect(restoreMessage({ songs: 12, venues: 2, sings: 5, setlists: 1 }, { songs: 412, venues: 3, sings: 40, setlists: 2 }))
      .toBe('Replace the 12 songs, 2 venues, 5 sing log entries and 1 setlist on this device with '
        + '412 songs, 3 venues, 40 sing log entries and 2 setlists from the backup? This cannot be undone.');
  });

  it('only mentions the backup when the device is empty', () => {
    expect(restoreMessage({ songs: 0, venues: 0, sings: 0, setlists: 0 }, { songs: 2, venues: 1, sings: 1, setlists: 1 }))
      .toBe('Restore 2 songs, 1 venue, 1 sing log entry and 1 setlist from the backup?');
  });
});

describe('backup reminder (R25)', () => {
  const daysAgo = (n) => new Date(now.getTime() - n * 86_400_000).toISOString();

  it('counts whole days, never negative, and null for junk', () => {
    expect(daysSince(daysAgo(0), now)).toBe(0);
    expect(daysSince(daysAgo(29.9), now)).toBe(29);
    expect(daysSince(daysAgo(30), now)).toBe(30);
    expect(daysSince(new Date(now.getTime() + 86_400_000).toISOString(), now)).toBe(0);
    expect(daysSince('not a date', now)).toBeNull();
    expect(daysSince(null, now)).toBeNull();
  });

  it('says nothing while the library is empty', () => {
    expect(backupReminder({ lastBackupAt: null, songCount: 0 }, now)).toBeNull();
    expect(backupReminder({ lastBackupAt: daysAgo(90), songCount: 0 }, now)).toBeNull();
  });

  it('asks for a first backup when there has never been one', () => {
    expect(backupReminder({ lastBackupAt: null, songCount: 3 }, now)).toMatch(/not backed up yet/);
    expect(backupReminder({ lastBackupAt: 'garbage', songCount: 3 }, now)).toMatch(/not backed up yet/);
  });

  it('reminds after 30 days and not before', () => {
    expect(BACKUP_REMINDER_DAYS).toBe(30);
    expect(backupReminder({ lastBackupAt: daysAgo(29), songCount: 3 }, now)).toBeNull();
    expect(backupReminder({ lastBackupAt: daysAgo(30), songCount: 3 }, now)).toBe('Your last backup was 30 days ago. Download a fresh one to be safe.');
    expect(backupReminder({ lastBackupAt: daysAgo(45), songCount: 1 }, now)).toMatch(/45 days ago/);
  });

  it('stays quiet while snoozed, and wakes when the snooze has passed', () => {
    const due = { lastBackupAt: daysAgo(40), songCount: 3 };
    expect(backupReminder({ ...due, snoozedUntil: snoozeUntil(now) }, now)).toBeNull();
    expect(backupReminder({ ...due, snoozedUntil: daysAgo(1) }, now)).not.toBeNull();
    expect(backupReminder({ ...due, snoozedUntil: 'junk' }, now)).not.toBeNull();
    expect(BACKUP_SNOOZE_DAYS).toBe(7);
    expect(daysSince(now.toISOString(), new Date(snoozeUntil(now)))).toBe(7);
  });
});
