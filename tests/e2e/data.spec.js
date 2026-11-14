import { test, expect } from '@playwright/test';
import { DB_VERSION } from '../../js/db.js';
import { openApp, addSong } from './helpers.js';
import {
  openSettings, openSongs, collectPageErrors, importCsv, restoreBackup, downloadBackup,
  answerNextDialog, songRecord, backupFile,
} from './helpers-data.js';

const songItem = (page, title) => page.getByRole('listitem').filter({ hasText: title });

test.describe('CSV import', () => {
  test('R22: imports a CSV of songs', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openApp(page);
    await openSettings(page);

    // A spreadsheet export: BOM, CRLF, columns in another order, an unknown
    // column, quoted commas and doubled quotes.
    const csv = '﻿Artist,Title,Year,Genre,Key,Tags,Spotify URI\r\n'
      + 'Amy Winehouse,Valerie,2006,Soul,-2,"duet; crowd-pleaser",spotify:1\r\n'
      + 'The Beatles,"Hello, Goodbye",1967,Pop,,,spotify:2\r\n'
      + 'David Bowie,"""Heroes""",1977,Rock,,,\r\n'
      + 'ABBA,Waterloo,1970s,,,,\r\n';
    await importCsv(page, csv);
    await expect(page.getByRole('status')).toHaveText('Imported 4 songs.');

    await openSongs(page);
    await expect(page.getByText('4 of 4 songs')).toBeVisible();
    await expect(songItem(page, 'Hello, Goodbye')).toContainText('The Beatles · Pop · 1967');
    await expect(songItem(page, '"Heroes"')).toContainText('David Bowie · Rock · 1977');
    await expect(songItem(page, 'Waterloo')).toContainText('ABBA · 1970');

    // Key and tags are not shown in the list yet, so check the stored record.
    await openSettings(page);
    const { json } = await downloadBackup(page);
    expect(json.data.songs.find((s) => s.title === 'Valerie'))
      .toMatchObject({ artist: 'Amy Winehouse', genre: 'Soul', year: 2006, key: '-2', tags: ['duet', 'crowd-pleaser'] });
    expect(errors).toEqual([]);
  });

  test('R22: skips duplicate and invalid rows and says so', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await openSettings(page);

    const csv = 'title,artist\n'
      + 'VALERIE,amy winehouse\n' // already in the library
      + 'Dancing Queen,ABBA\n'
      + 'dancing queen,Abba\n' // earlier in this file
      + ',Nobody\n' // no title
      + 'No Artist Here,\n' // no artist
      + '\n'
      + 'Waterloo,ABBA\n';
    await importCsv(page, csv);
    await expect(page.getByText('Imported 2 songs. Skipped 2 duplicates and 2 rows without a title or artist.'))
      .toBeVisible();

    await openSongs(page);
    await expect(page.getByText('3 of 3 songs')).toBeVisible();
    await expect(songItem(page, 'Valerie')).toHaveCount(1);
    await expect(songItem(page, 'Dancing Queen')).toHaveCount(1);
    await expect(songItem(page, 'Waterloo')).toBeVisible();
    await expect(songItem(page, 'No Artist Here')).toHaveCount(0);
  });

  test('R22: explains a file it cannot import and adds nothing', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openApp(page);
    await openSettings(page);

    await importCsv(page, 'name,band\nValerie,Amy Winehouse\n', 'wrong-columns.csv');
    await expect(page.getByText('Could not import wrong-columns.csv. The first row must name the columns, '
      + 'including "title" and "artist". Columns found: name, band.')).toBeVisible();

    await importCsv(page, 'title,artist\n"Valerie,Amy Winehouse\n', 'broken.csv');
    await expect(page.getByText('Could not import broken.csv. A quoted value starting on line 2 is never closed.'))
      .toBeVisible();

    await importCsv(page, '', 'empty.csv');
    await expect(page.getByText('Could not import empty.csv. The file is empty.')).toBeVisible();

    await openSongs(page);
    await expect(page.getByText('0 of 0 songs')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('Backup and restore', () => {
  test('R20: downloads a JSON backup containing all songs', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 });
    await addSong(page, { title: 'Dancing Queen', artist: 'ABBA' });
    await openSettings(page);

    const { filename, json } = await downloadBackup(page);
    expect(filename).toMatch(/^mic-jaunt-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(json).toMatchObject({ app: 'mic-jaunt', format: 1, dbVersion: DB_VERSION });
    expect(Number.isNaN(Date.parse(json.exportedAt))).toBe(false);
    expect(Object.keys(json.data).sort()).toEqual(['meta', 'setlists', 'sings', 'songs', 'venues']);
    expect(json.data.songs.map((s) => s.title).sort()).toEqual(['Dancing Queen', 'Valerie']);
    expect(json.data.songs.find((s) => s.title === 'Valerie'))
      .toMatchObject({ artist: 'Amy Winehouse', genre: 'Soul', year: 2006 });
    expect(json.data.songs.every((s) => Number.isInteger(s.id))).toBe(true);

    await expect(page.getByText(`Created ${filename} with 2 songs, 0 venues, 0 sing log entries and 0 setlists.`))
      .toBeVisible();
  });

  test('R21: restores a backup after confirming', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await addSong(page, { title: 'Dancing Queen', artist: 'ABBA' });
    await openSettings(page);
    const { text, filename } = await downloadBackup(page);

    // A song added after the backup is gone once the backup is restored.
    await openSongs(page);
    await addSong(page, { title: 'Waterloo', artist: 'ABBA' });
    await expect(page.getByText('3 of 3 songs')).toBeVisible();

    await openSettings(page);
    const dialog = answerNextDialog(page, true);
    await restoreBackup(page, text, filename);
    expect(await dialog).toBe('Replace the 3 songs, 0 venues, 0 sing log entries and 0 setlists on this device with '
      + '2 songs, 0 venues, 0 sing log entries and 0 setlists from the backup? This cannot be undone.');
    await expect(page.getByText(`Restored 2 songs, 0 venues, 0 sing log entries and 0 setlists from ${filename}.`))
      .toBeVisible();

    await openSongs(page);
    await expect(page.getByText('2 of 2 songs')).toBeVisible();
    await expect(songItem(page, 'Valerie')).toBeVisible();
    await expect(songItem(page, 'Dancing Queen')).toBeVisible();
    await expect(songItem(page, 'Waterloo')).toHaveCount(0);

    // Restored data survives a reload.
    await page.reload();
    await expect(page.getByText('2 of 2 songs')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('R21: restores venues, sing log and setlists with their ids', async ({ page }) => {
    const data = {
      songs: [
        songRecord(7, 'Valerie', 'Amy Winehouse', { genre: 'Soul', year: 2006, tags: ['duet'], notes: 'starts cold' }),
        songRecord(12, 'Waterloo', 'ABBA', { year: 1974, rating: 4, status: 'want-to-try' }),
      ],
      venues: [{ id: 3, name: 'The Crown' }, { id: 5, name: 'Lucky Voice' }],
      sings: [
        { id: 1, songId: 7, venueId: 3, date: '2026-10-30' },
        { id: 2, songId: 12, venueId: 5, date: '2026-11-01' },
      ],
      setlists: [
        { id: 4, name: 'Friday at the Crown', venueId: 3, songIds: [12, 7] },
        { id: 6, name: 'Warm-ups', venueId: null, songIds: [7] },
      ],
      meta: [{ key: 'lastBackupAt', value: '2026-11-01T20:00:00.000Z' }],
    };

    await openApp(page);
    await openSettings(page);
    const dialog = answerNextDialog(page, true);
    await restoreBackup(page, backupFile(data));
    expect(await dialog).toBe('Restore 2 songs, 2 venues, 2 sing log entries and 2 setlists from the backup?');
    await expect(page.getByText(/^Restored 2 songs, 2 venues, 2 sing log entries and 2 setlists/)).toBeVisible();

    // Everything comes back exactly, ids included, so sings and setlists still
    // point at the right songs and venues.
    const { json } = await downloadBackup(page);
    expect(json.data).toEqual(data);

    // New songs added after a restore get fresh ids.
    await openSongs(page);
    await expect(page.getByText('2 of 2 songs')).toBeVisible();
    await addSong(page, { title: 'Dancing Queen', artist: 'ABBA' });
    await openSettings(page);
    const after = await downloadBackup(page);
    const ids = after.json.data.songs.map((s) => s.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  test('R21: leaves data alone when the restore confirmation is dismissed', async ({ page }) => {
    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await openSettings(page);

    const dialog = answerNextDialog(page, false);
    await restoreBackup(page, backupFile({ songs: [songRecord(1, 'Waterloo', 'ABBA')] }));
    expect(await dialog).toBe('Replace the 1 song, 0 venues, 0 sing log entries and 0 setlists on this device with '
      + '1 song, 0 venues, 0 sing log entries and 0 setlists from the backup? This cannot be undone.');
    await expect(page.getByRole('status')).toHaveText('Restore cancelled. Nothing was changed.');

    await openSongs(page);
    await expect(page.getByText('1 of 1 songs')).toBeVisible();
    await expect(songItem(page, 'Valerie')).toBeVisible();
    await expect(songItem(page, 'Waterloo')).toHaveCount(0);
  });

  test('R21: refuses files that are not valid backups, without asking or changing anything', async ({ page }) => {
    const errors = collectPageErrors(page);
    const dialogs = [];
    page.on('dialog', (dialog) => { dialogs.push(dialog.message()); dialog.dismiss(); });

    await openApp(page);
    await addSong(page, { title: 'Valerie', artist: 'Amy Winehouse' });
    await openSettings(page);

    await restoreBackup(page, 'this is not JSON', 'notes.json');
    await expect(page.getByText('notes.json is not a backup: it is not valid JSON. Nothing was changed.')).toBeVisible();

    await restoreBackup(page, { name: 'something else' }, 'other.json');
    await expect(page.getByText('other.json cannot be restored. Nothing was changed.')).toBeVisible();
    await expect(page.getByText('This file is not a Mic Jaunt backup.')).toBeVisible();

    const broken = backupFile({ songs: [songRecord(1, 'Waterloo', 'ABBA')] }, { format: 2 });
    delete broken.data.sings;
    await restoreBackup(page, broken, 'future.json');
    await expect(page.getByText('future.json cannot be restored. Nothing was changed.')).toBeVisible();
    await expect(page.getByText('The backup uses format 2, but this version of the app reads format 1.')).toBeVisible();
    await expect(page.getByText('The backup has no sing log section.')).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('future.json cannot be restored. Nothing was changed.'
      + 'The backup uses format 2, but this version of the app reads format 1.'
      + 'The backup has no sing log section.');

    expect(dialogs).toEqual([]);
    await openSongs(page);
    await expect(page.getByText('1 of 1 songs')).toBeVisible();
    await expect(songItem(page, 'Valerie')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
