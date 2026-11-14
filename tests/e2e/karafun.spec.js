// R66: load, replace and remove the KaraFun catalog in Settings. R68: loading
// it flags the owner's songs that KaraFun has.
import { test, expect } from '@playwright/test';
import { openApp, putRecords, readStore } from './helpers.js';
import { openSettings, answerNextDialog, songRecord, downloadBackup } from './helpers-data.js';

const HEADER = 'Id;Title;Artist;Year;Duo;Explicit;"Date Added";Styles;Languages';
const CREEP = '12543;Creep;Radiohead;1992;0;1;2008-03-07;Rock,Alternative;English';
const WHISKEY = '49375;"Tennessee Whiskey";"Chris Stapleton";2015;0;0;2015-07-21;Blues,Country,Soul,Rock;English';
const SHALLOW = '56442;Shallow;"A Star is Born (2018 film)";2018;1;0;2018-10-15;Soundtrack,Pop,Duet;English';

// KaraFun's file as it comes: a BOM, CRLF line ends, a final line break.
const catalogCsv = (...rows) => `﻿${[HEADER, ...rows].join('\r\n')}\r\n`;

const card = (page) => page.locator('#karafun-card');
const statusLine = (page) => card(page).locator('.karafun-status');
const message = (page) => card(page).getByRole('status');
const removeButton = (page) => card(page).getByRole('button', { name: 'Remove catalog' });
const meta = async (page, key) => (await readStore(page, 'meta')).find((r) => r.key === key);

// Hands a file to "Load catalog file", like choosing it in the picker.
function loadCatalogFile(page, contents, name = 'karafun.csv') {
  return card(page).locator('input[type="file"]').setInputFiles({
    name, mimeType: 'text/csv', buffer: Buffer.from(contents, 'utf8'),
  });
}

async function loadCatalog(page, contents, expected) {
  await loadCatalogFile(page, contents);
  await expect(message(page)).toHaveText(expected);
}

test.describe('KaraFun catalog', () => {
  test('R66: loading the KaraFun CSV stores the catalog, shows when and how many, and can be replaced', async ({ page }) => {
    await openApp(page);
    await openSettings(page);

    await expect(card(page).getByText('KaraFun catalog', { exact: true })).toBeVisible();
    const link = card(page).getByRole('link', { name: 'Get the catalog from KaraFun' });
    await expect(link).toHaveAttribute('href', 'https://www.karafun.com/karaoke-song-list.html');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');
    await expect(statusLine(page)).toHaveText('No catalog loaded');
    await expect(removeButton(page)).toBeHidden();

    await loadCatalog(page, catalogCsv(CREEP, WHISKEY, ';"No id";Nobody;;;;;;', SHALLOW),
      'Loaded 3 songs from KaraFun; 1 row skipped.');
    await expect(statusLine(page)).toHaveText(/^Loaded \d{1,2} [A-Z][a-z]{2} \d{4} · 3 songs$/);
    await expect(removeButton(page)).toBeVisible();

    const catalog = await readStore(page, 'catalog');
    expect(catalog.map((r) => r.id)).toEqual([12543, 49375, 56442]);
    expect(catalog[2]).toEqual({
      id: 56442, title: 'Shallow', artist: 'A Star is Born (2018 film)', year: 2018, duet: true, explicit: false,
      added: '2018-10-15', styles: ['Soundtrack', 'Pop', 'Duet'], languages: ['English'],
      key: 'shallow\u0000a star is born (2018 film)',
    });
    expect((await meta(page, 'karafunCount')).value).toBe(3);
    const firstLoad = (await meta(page, 'karafunLoadedAt')).value;
    expect(firstLoad).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Never in a backup: it is rebuilt from the file.
    const { json } = await downloadBackup(page);
    expect(Object.keys(json.data).sort()).toEqual(['meta', 'setlists', 'sings', 'songs', 'venues']);

    // It survives a reload.
    await page.reload();
    await openSettings(page);
    await expect(statusLine(page)).toHaveText(/ · 3 songs$/);

    // A newer file replaces it entirely: changed rows are updated, dropped rows go.
    await loadCatalog(page, catalogCsv('12543;"Creep (Acoustic)";Radiohead;1992;0;0;2020-01-01;Rock;English', '70001;New;Song;2026;0;0;2026-11-01;Pop;English'),
      'Loaded 2 songs from KaraFun.');
    await expect(statusLine(page)).toHaveText(/ · 2 songs$/);
    const replaced = await readStore(page, 'catalog');
    expect(replaced.map((r) => [r.id, r.title])).toEqual([[12543, 'Creep (Acoustic)'], [70001, 'New']]);
    expect((await meta(page, 'karafunCount')).value).toBe(2);
    expect((await meta(page, 'karafunLoadedAt')).value >= firstLoad).toBe(true);
  });

  test('R66: a large catalog is stored in batches with progress', async ({ page }) => {
    await openApp(page);
    await openSettings(page);

    // Every message the card shows, in order, including the brief progress ones.
    await page.evaluate(() => {
      window.__karafunMessages = [];
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) window.__karafunMessages.push(node.textContent);
        }
      }).observe(document.querySelector('#karafun-card .message'), { childList: true });
    });

    const rows = [];
    for (let i = 1; i <= 6000; i += 1) rows.push(`${i};"Song ${i}";"Artist ${i % 300}";${1960 + (i % 60)};0;0;2020-01-01;Pop;English`);
    await loadCatalog(page, catalogCsv(...rows), 'Loaded 6,000 songs from KaraFun.');
    await expect(statusLine(page)).toHaveText(/ · 6,000 songs$/);

    const shown = await page.evaluate(() => window.__karafunMessages);
    expect(shown).toEqual([
      'Reading karafun.csv…',
      'Loading… 0 of 6,000',
      'Loading… 2,500 of 6,000',
      'Loading… 5,000 of 6,000',
      'Loading… 6,000 of 6,000',
      'Loaded 6,000 songs from KaraFun.',
    ]);
    expect(await readStore(page, 'catalog')).toHaveLength(6000);
  });

  test('R66: the wrong file is refused', async ({ page }) => {
    await openApp(page);
    await openSettings(page);
    await loadCatalog(page, catalogCsv(CREEP), 'Loaded 1 song from KaraFun.');

    // The app's own song export, say.
    await loadCatalogFile(page, '﻿title,artist,genre\r\nValerie,Amy Winehouse,Soul\r\n', 'mic-jaunt-songs.csv');
    await expect(message(page)).toHaveText('Could not load mic-jaunt-songs.csv. This is not the KaraFun catalog CSV. '
      + 'Its first line should be Id;Title;Artist;Year;Duo;Explicit;"Date Added";Styles;Languages. The catalog was not changed.');
    await expect(message(page)).toHaveClass(/error/);

    // The right header with nothing under it.
    await loadCatalogFile(page, catalogCsv(), 'empty.csv');
    await expect(message(page)).toHaveText('Could not load empty.csv. The file has the KaraFun header but no songs. '
      + 'The catalog was not changed.');

    // The earlier catalog is untouched.
    expect((await readStore(page, 'catalog')).map((r) => r.id)).toEqual([12543]);
    await expect(statusLine(page)).toHaveText(/ · 1 song$/);
  });

  test('R66: a file that breaks part-way leaves no half-loaded catalog', async ({ page }) => {
    await openApp(page);
    await openSettings(page);
    await loadCatalog(page, catalogCsv(CREEP), 'Loaded 1 song from KaraFun.');

    // The first 2,500 rows are stored before the reader reaches the bad quote.
    const rows = [];
    for (let i = 1; i <= 2600; i += 1) rows.push(`${i};"Song ${i}";Artist;2000;0;0;2020-01-01;Pop;English`);
    rows.push('2601;"Never closed;Artist;2000;0;0;2020-01-01;Pop;English');
    await loadCatalogFile(page, catalogCsv(...rows), 'broken.csv');
    await expect(message(page)).toHaveText('Could not load broken.csv. A quoted value starting on line 2602 is never '
      + 'closed. The part loaded was removed; load the file again.');
    await expect(statusLine(page)).toHaveText('No catalog loaded');
    expect(await readStore(page, 'catalog')).toEqual([]);
    expect(await meta(page, 'karafunLoadedAt')).toBeUndefined();
  });

  test('R66: rows left by a load that stopped part-way are reported, and loading again replaces them', async ({ page }) => {
    await openApp(page);
    // What an app closed during a load leaves: some rows, no load time.
    await putRecords(page, 'catalog', [
      { id: 1, title: 'A', artist: 'X', year: null, duet: false, explicit: false, added: '', styles: [], languages: [], key: 'a\u0000x' },
      { id: 2, title: 'B', artist: 'X', year: null, duet: false, explicit: false, added: '', styles: [], languages: [], key: 'b\u0000x' },
    ]);
    await openSettings(page);
    await expect(statusLine(page)).toHaveText('The last load did not finish (2 songs stored). Load the file again.');
    await expect(removeButton(page)).toBeVisible();

    await loadCatalog(page, catalogCsv(CREEP), 'Loaded 1 song from KaraFun.');
    await expect(statusLine(page)).toHaveText(/^Loaded .* · 1 song$/);
    expect((await readStore(page, 'catalog')).map((r) => r.id)).toEqual([12543]);
  });

  test('R66: removing the catalog clears it', async ({ page }) => {
    await openApp(page);
    await putRecords(page, 'songs', [songRecord(1, 'Creep', 'Radiohead', { karafunId: null })]);
    await openSettings(page);
    await loadCatalog(page, catalogCsv(CREEP, WHISKEY), 'Loaded 2 songs from KaraFun; your 1 song is in it.');

    // Dismissing the confirmation keeps everything.
    let asked = answerNextDialog(page, false);
    await removeButton(page).click();
    expect(await asked).toContain('Remove the KaraFun catalog from this phone?');
    await expect(statusLine(page)).toHaveText(/ · 2 songs$/);
    expect(await readStore(page, 'catalog')).toHaveLength(2);

    asked = answerNextDialog(page, true);
    await removeButton(page).click();
    await asked;
    await expect(message(page)).toHaveText('Removed the KaraFun catalog. Your songs stay marked as in KaraFun.');
    await expect(statusLine(page)).toHaveText('No catalog loaded');
    await expect(removeButton(page)).toBeHidden();
    expect(await readStore(page, 'catalog')).toEqual([]);
    expect(await meta(page, 'karafunCount')).toBeUndefined();
    expect(await meta(page, 'karafunLoadedAt')).toBeUndefined();

    // The song keeps its flag (R68).
    expect((await readStore(page, 'songs'))[0].karafunId).toBe(12543);
  });

  test('R66: catalog details without the rows, as after a restore on a new phone, read as no catalog loaded', async ({ page }) => {
    await openApp(page);
    await putRecords(page, 'meta', [
      { key: 'karafunLoadedAt', value: '2026-05-01T10:00:00.000Z' },
      { key: 'karafunCount', value: 101234 },
    ]);
    await openSettings(page);
    await expect(statusLine(page)).toHaveText('No catalog loaded');
    await expect(removeButton(page)).toBeHidden();
  });

  test('R68: loading the catalog flags the songs KaraFun has and clears flags that no longer match', async ({ page }) => {
    await openApp(page);
    const old = songRecord(4, 'Old Song', 'Nobody');
    delete old.karafunId; // stored before the flag existed
    await putRecords(page, 'songs', [
      songRecord(1, 'creep', 'RADIOHEAD', { karafunId: null, genre: 'Rock', notes: 'start low' }),
      songRecord(2, 'Valerie', 'Amy Winehouse', { karafunId: 999 }),
      songRecord(3, 'Tennessee Whiskey', 'Chris Stapleton', { karafunId: null }),
      old,
    ]);
    await openSettings(page);

    await loadCatalog(page, catalogCsv(CREEP, WHISKEY, SHALLOW),
      'Loaded 3 songs from KaraFun; 2 of your 4 songs are in it.');
    let songs = await readStore(page, 'songs');
    expect(songs.map((s) => [s.title, s.karafunId])).toEqual([
      ['creep', 12543], ['Valerie', null], ['Tennessee Whiskey', 49375], ['Old Song', undefined],
    ]);
    // Nothing else about the song changes.
    expect(songs[0]).toEqual(songRecord(1, 'creep', 'RADIOHEAD', { karafunId: 12543, genre: 'Rock', notes: 'start low' }));

    // A newer catalog without Tennessee Whiskey clears its flag.
    await loadCatalog(page, catalogCsv(CREEP, SHALLOW), 'Loaded 2 songs from KaraFun; 1 of your 4 songs is in it.');
    songs = await readStore(page, 'songs');
    expect(songs.map((s) => [s.title, s.karafunId])).toEqual([
      ['creep', 12543], ['Valerie', null], ['Tennessee Whiskey', null], ['Old Song', undefined],
    ]);
  });
});
