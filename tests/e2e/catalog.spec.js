// The KaraFun catalog in Find (R67): a "My songs | KaraFun" switch once a
// catalog is loaded, its own search and filters, and rows that add a song to
// my songs or straight into the set. And the KaraFun flag on my songs (R68):
// a mark on the row, a field on the song screen and an "In KaraFun" filter.
// The catalog store is written directly here; loading the CSV is R66's.
import { test, expect } from '@playwright/test';
import { openApp, openSong, putRecords, readStore } from './helpers.js';
import {
  seed, reloadList, openFilters, filter, choose, filtersForm, filtersSummary, shownTitles, songRow, expectTapTarget,
} from './helpers-find.js';
import { songKey } from '../../js/lib/song.js';

const LOADED_AT = '2026-11-14T00:00:00.000Z';

// A row as the catalog store holds it.
function catalogRow(id, title, artist, year, styles, extra = {}) {
  const row = { id, title, artist, year, duet: false, explicit: false, added: '2020-01-01', styles, languages: ['English'], ...extra };
  return { ...row, key: songKey(row) };
}

const CATALOG = [
  catalogRow(101, 'Bohemian Rhapsody', 'Queen', 1975, ['Rock', 'Classic Rock'], { added: '2012-05-01' }),
  catalogRow(102, 'Under Pressure', 'Queen & David Bowie', 1981, ['Rock', 'Duet'], { duet: true, added: '2014-02-01' }),
  catalogRow(103, 'Islands in the Stream', 'Dolly Parton & Kenny Rogers', 1983, ['Country', 'Duet'], { duet: true, added: '2019-09-09' }),
  catalogRow(104, 'Valerie', 'Amy Winehouse', 2007, ['Pop', 'Soul'], { added: '2011-01-01' }),
  catalogRow(105, 'Despacito', 'Luis Fonsi', 2017, ['Latin', 'Pop'], { languages: ['Spanish'], added: '2017-03-01' }),
  catalogRow(106, 'La Bamba', 'Ritchie Valens', 1958, ['Latin', 'Rock'], { languages: ['Spanish'], added: '2010-10-10' }),
  catalogRow(107, 'Ne me quitte pas', 'Jacques Brel', 1959, ['Chanson'], { languages: ['French'], added: '2016-01-01' }),
  catalogRow(108, 'Lose Yourself', 'Eminem', 2002, ['Hip Hop'], { explicit: true, added: '2021-07-07' }),
  catalogRow(109, 'WAP', 'Cardi B & Megan Thee Stallion', 2020, ['Hip Hop', 'Duet'], { duet: true, explicit: true, added: '2020-09-01' }),
  catalogRow(110, 'Shallow', 'Lady Gaga & Bradley Cooper', 2018, ['Soundtrack', 'Pop', 'Duet'], { duet: true, added: '2018-11-01' }),
  catalogRow(111, 'Mr. Brightside', 'The Killers', 2004, ['Alternative', 'Rock'], { added: '2013-03-03' }),
  catalogRow(112, 'Jolene', 'Dolly Parton', 1973, ['Country'], { added: '2015-05-05' }),
  catalogRow(113, 'Africa', 'Toto', 1982, ['Rock', 'Pop'], { added: '2015-06-01' }),
  catalogRow(114, 'Dancing Queen', 'ABBA', 1976, ['Pop', 'Disco'], { added: '2013-01-01' }),
  catalogRow(115, 'Take On Me', 'a-ha', 1985, ['Pop'], { added: '2014-08-08' }),
  catalogRow(116, 'Wonderwall', 'Oasis', 1995, ['Alternative', 'Rock'], { added: '2012-12-12' }),
  catalogRow(117, "Don't Stop Believin'", 'Journey', 1981, ['Rock'], { added: '2011-11-11' }),
  catalogRow(118, 'Rolling in the Deep', 'Adele', 2010, ['Pop', 'Soul'], { added: '2011-02-02' }),
  catalogRow(119, 'Total Eclipse of the Heart', 'Bonnie Tyler', 1983, ['Pop', 'Rock'], { added: '2016-06-06' }),
  catalogRow(120, '99 Luftballons', 'Nena', 1983, ['Pop'], { languages: ['German'], added: '2019-01-01' }),
];

// My own copy of Valerie: same title and artist as catalog row 104, no KaraFun id yet.
const MY_VALERIE = { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 };

// Writes catalog rows and then karafunLoadedAt, as Settings does (R66). Does not reload.
async function storeCatalog(page, rows = CATALOG, loadedAt = LOADED_AT) {
  await putRecords(page, 'catalog', rows);
  await putRecords(page, 'meta', [{ key: 'karafunLoadedAt', value: loadedAt }]);
}

// Empties the catalog store, as removing the catalog in Settings does.
async function clearCatalog(page) {
  await page.evaluate(async () => {
    const conn = await new Promise((resolve, reject) => {
      const req = indexedDB.open('mic-jaunt');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = conn.transaction('catalog', 'readwrite');
        tx.objectStore('catalog').clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      conn.close();
    }
  });
}

const search = (page) => page.getByRole('searchbox', { name: 'Search songs' });
const sourceSwitch = (page) => page.getByRole('radiogroup', { name: 'Search in' });
const source = (page, name) => page.getByRole('radio', { name, exact: true });
const catalogRows = (page) => page.locator('li.catalog-item');
const countLine = (page) => page.locator('.pick-row .count');
const hint = (page) => page.getByText('Type two or more letters, or choose a filter, to search the KaraFun catalog.');
const modeTab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const showTab = (page, name) => page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name }).click();
const songField = (page, name) => page.locator('.song-fields .field').filter({ has: page.locator('dt', { hasText: name }) }).locator('dd');

async function showSource(page, name) {
  await source(page, name).click();
  await expect(source(page, name)).toHaveAttribute('aria-checked', 'true');
}

// Every visible control on the screen under 44 px either way (R31), as in night.spec.js.
async function expectAllTapTargets(page, screen) {
  const small = await page.evaluate(() => [...document.querySelectorAll('button, input, select, textarea, summary, a[href]')]
    .map((node) => {
      const r = node.getBoundingClientRect();
      return { name: (node.getAttribute('aria-label') || node.textContent).trim(), width: r.width, height: r.height };
    })
    .filter((b) => b.width > 0 && b.height > 0 && (b.width < 44 || b.height < 44)));
  expect(small, `${screen}: controls under 44 px`).toEqual([]);
}

test.describe('KaraFun catalog', () => {
  test('R67: the KaraFun switch appears once a catalog is loaded and searches it with the catalog filters', async ({ page }) => {
    await openApp(page);
    await seed(page, { songs: [MY_VALERIE] });
    await expect(sourceSwitch(page)).toHaveCount(0);
    await storeCatalog(page);
    await reloadList(page, 1);

    // My songs on a fresh load; the switch heads Find, above the search.
    await expect(source(page, 'My songs')).toHaveAttribute('aria-checked', 'true');
    await expect(source(page, 'KaraFun')).toHaveAttribute('aria-checked', 'false');
    expect((await sourceSwitch(page).boundingBox()).y).toBeLessThan((await search(page).boundingBox()).y);
    await expectTapTarget(source(page, 'KaraFun'));
    // With a catalog loaded, my songs' filters offer In KaraFun (R68).
    await openFilters(page);
    await expect(filter(page, 'KaraFun')).toBeVisible();

    // Nothing lists until two characters or a filter.
    await showSource(page, 'KaraFun');
    await expect(hint(page)).toBeVisible();
    await expect(countLine(page)).toHaveText('20 songs in the KaraFun catalog');
    await expect(catalogRows(page)).toHaveCount(0);
    await search(page).fill('q');
    await expect(hint(page)).toBeVisible();
    await expect(catalogRows(page)).toHaveCount(0);
    await search(page).fill('qu');
    await expect(shownTitles(page)).toHaveText(['Bohemian Rhapsody', 'Dancing Queen', 'Ne me quitte pas', 'Under Pressure']);
    await expect(countLine(page)).toHaveText('4 of 20 songs');

    // A row: artist, year and styles, with a Duet or Explicit mark; no sing line, status or Pick for me.
    await expect(songRow(page, 'Bohemian Rhapsody').locator('.sub')).toHaveText('Queen · 1975 · Rock · Classic Rock');
    await expect(songRow(page, 'Under Pressure').locator('.sub')).toHaveText('Queen & David Bowie · 1981 · Rock Duet');
    await expect(songRow(page, 'Under Pressure').locator('.mark')).toHaveText('Duet');
    await expect(page.locator('li.catalog-item .sung')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pick for me' })).toBeHidden();
    await expect(page.getByText('Add a song', { exact: true })).toBeHidden();
    await search(page).fill('eminem');
    await expect(songRow(page, 'Lose Yourself').locator('.mark')).toHaveText('Explicit');

    // The catalog's own filters; my songs' Sung, Tag, Status, Rating and KaraFun are not there.
    await search(page).fill('');
    for (const label of ['Genre', 'Decade', 'Duet', 'Explicit', 'Language', 'Sort by']) await expect(filter(page, label)).toBeVisible();
    for (const label of ['Sung', 'Since', 'Tag', 'Status', 'Rating', 'KaraFun']) await expect(filter(page, label)).toHaveCount(0);
    await expect(filter(page, 'Genre').locator('option')).toHaveText(['Any genre', 'Alternative', 'Chanson', 'Classic Rock',
      'Country', 'Disco', 'Hip Hop', 'Latin', 'Pop', 'Rock', 'Soul', 'Soundtrack']);
    await expect(filter(page, 'Language').locator('option')).toHaveText(['Any language', 'English', 'French', 'German', 'Spanish']);
    await expect(filter(page, 'Decade').locator('option')).toHaveText(
      ['Any decade', '1950s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s']);
    await expect(filtersSummary(page)).toHaveText('Filters');

    // A filter lists without a search, and filters combine.
    await choose(page, 'Genre', 'Country');
    await expect(shownTitles(page)).toHaveText(['Islands in the Stream', 'Jolene']);
    await expect(countLine(page)).toHaveText('2 of 20 songs');
    await expect(filtersSummary(page)).toHaveText('Filters (1)');
    await choose(page, 'Duet', 'Duets only');
    await expect(shownTitles(page)).toHaveText(['Islands in the Stream']);
    await expect(filtersSummary(page)).toHaveText('Filters (2)');
    await choose(page, 'Duet', 'No duets');
    await expect(shownTitles(page)).toHaveText(['Jolene']);
    await filtersForm(page).getByRole('button', { name: 'Clear filters' }).click();
    await expect(hint(page)).toBeVisible();
    await expect(filtersSummary(page)).toHaveText('Filters');

    await choose(page, 'Language', 'Spanish');
    await expect(shownTitles(page)).toHaveText(['Despacito', 'La Bamba']);
    await choose(page, 'Decade', '1950s');
    await expect(shownTitles(page)).toHaveText(['La Bamba']);
    await filtersForm(page).getByRole('button', { name: 'Clear filters' }).click();

    // With a filter on, one character searches too.
    await choose(page, 'Explicit', 'Hide explicit');
    await expect(countLine(page)).toHaveText('18 of 20 songs');
    await search(page).fill('lo');
    await expect(shownTitles(page)).toHaveText(['99 Luftballons', 'Shallow']);
    await choose(page, 'Explicit', 'Any');
    await expect(shownTitles(page)).toHaveText(['99 Luftballons', 'Lose Yourself', 'Shallow']);
    await search(page).fill('');

    // Sorts, with ties in title order.
    await choose(page, 'Genre', 'Rock');
    await choose(page, 'Sort by', 'Decade');
    await expect(shownTitles(page)).toHaveText(['La Bamba', 'Bohemian Rhapsody', 'Africa', "Don't Stop Believin'",
      'Total Eclipse of the Heart', 'Under Pressure', 'Wonderwall', 'Mr. Brightside']);
    await choose(page, 'Sort by', 'Artist');
    await expect(shownTitles(page)).toHaveText(['Total Eclipse of the Heart', "Don't Stop Believin'", 'Wonderwall',
      'Bohemian Rhapsody', 'Under Pressure', 'La Bamba', 'Mr. Brightside', 'Africa']);
    await choose(page, 'Sort by', 'Added to KaraFun, newest first');
    await expect(shownTitles(page)).toHaveText(['Total Eclipse of the Heart', 'Africa', 'Under Pressure', 'Mr. Brightside',
      'Wonderwall', 'Bohemian Rhapsody', "Don't Stop Believin'", 'La Bamba']);
    await expect(filtersSummary(page)).toHaveText('Filters (1)');
    await expectAllTapTargets(page, 'Find, KaraFun');

    // My songs keep their own filters and count; the search is shared.
    await showSource(page, 'My songs');
    await expect(filtersSummary(page)).toHaveText('Filters');
    await expect(filter(page, 'Tag')).toBeVisible();
    await expect(page.getByText('1 of 1 songs')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pick for me' })).toBeVisible();
    await search(page).fill('bri');
    await expect(page.getByText('No match for “bri”.')).toBeVisible();
    await page.getByRole('button', { name: 'Search the KaraFun catalog' }).click();
    await expect(source(page, 'KaraFun')).toHaveAttribute('aria-checked', 'true');
    await expect(search(page)).toHaveValue('bri');
    await expect(shownTitles(page)).toHaveText(['Mr. Brightside']);

    // The catalog filters survive a reload; the source goes back to my songs.
    await page.reload();
    await expect(page.getByText('1 of 1 songs')).toBeVisible();
    await expect(source(page, 'My songs')).toHaveAttribute('aria-checked', 'true');
    await expect(filtersSummary(page)).toHaveText('Filters');
    await showSource(page, 'KaraFun');
    await expect(filtersSummary(page)).toHaveText('Filters (1)');
    await openFilters(page);
    await expect(filter(page, 'Genre')).toHaveValue('Rock');
    await expect(filter(page, 'Sort by')).toHaveValue('added');
    await expect(shownTitles(page).first()).toHaveText('Total Eclipse of the Heart');
  });

  test('R67: a catalog song can be added to my songs and straight into the current set', async ({ page }) => {
    await openApp(page);
    const { venueIds } = await seed(page, { songs: [MY_VALERIE], venues: ['The Crown'] });
    await storeCatalog(page);
    await putRecords(page, 'meta', [{ key: 'findVenueId', value: venueIds['The Crown'] }]);
    await reloadList(page, 1);
    await expect(modeTab(page, 'List')).toHaveText('List (0)');
    await showSource(page, 'KaraFun');

    // A song already in my songs (same title and artist) is marked, with no Add.
    await search(page).fill('valerie');
    const valerie = songRow(page, 'Valerie');
    await expect(valerie.locator('.in-library')).toHaveText('✓ In my songs');
    await expect(valerie.getByRole('button', { name: 'Add Valerie to my songs' })).toHaveCount(0);
    await expect(valerie.locator('.set-toggle')).toHaveText('+');

    // Add to my songs: title, artist, year and genre filled, with the catalog id (R68).
    await search(page).fill('jolene');
    const jolene = songRow(page, 'Jolene');
    await jolene.getByRole('button', { name: 'Add Jolene to my songs' }).click();
    await expect(jolene.locator('.in-library')).toHaveText('✓ In my songs');
    await expect(page.locator('.night-status')).toHaveText('Added “Jolene” to your songs.');
    await expect(modeTab(page, 'List')).toHaveText('List (0)');
    const joleneSong = (await readStore(page, 'songs')).find((s) => s.title === 'Jolene');
    expect(joleneSong).toEqual({
      id: expect.any(Number), title: 'Jolene', artist: 'Dolly Parton', genre: 'Country', year: 1973, key: '', notes: '',
      rating: null, status: '', tags: [], createdAt: expect.any(String), karafunId: 112,
    });
    // Then + puts it in the set, and ✓ shows it is there.
    await jolene.getByRole('button', { name: 'Add Jolene to the set' }).click();
    await expect(jolene.locator('.set-toggle')).toHaveText('✓');
    await expect(modeTab(page, 'List')).toHaveText('List (1)');

    // + straight from the catalog adds the song to my songs and to the set; a duet gets the duet tag.
    await search(page).fill('islands');
    const islands = songRow(page, 'Islands in the Stream');
    await expect(islands.getByRole('button', { name: 'Add Islands in the Stream to my songs' })).toBeVisible();
    await islands.getByRole('button', { name: 'Add Islands in the Stream to the set' }).click();
    await expect(islands.locator('.set-toggle')).toHaveText('✓');
    await expect(islands.locator('.in-library')).toHaveText('✓ In my songs');
    await expect(modeTab(page, 'List')).toHaveText('List (2)');
    const islandsSong = (await readStore(page, 'songs')).find((s) => s.title === 'Islands in the Stream');
    expect(islandsSong).toMatchObject({
      artist: 'Dolly Parton & Kenny Rogers', genre: 'Country', year: 1983, tags: ['duet'], status: '', karafunId: 103,
    });
    await expect.poll(async () => (await readStore(page, 'setlists')).find((s) => s.name === 'The Crown').songIds)
      .toEqual([joleneSong.id, islandsSong.id]);

    // ✓ takes it out of the set; it stays in my songs.
    await islands.getByRole('button', { name: 'Remove Islands in the Stream from the set' }).click();
    await expect(islands.locator('.set-toggle')).toHaveText('+');
    await expect(modeTab(page, 'List')).toHaveText('List (1)');
    await expect(islands.locator('.in-library')).toBeVisible();
    await expect(songRow(page, 'Islands in the Stream')).toHaveCount(1);

    // My songs has both at once, with the KaraFun mark and the set's ✓.
    await showSource(page, 'My songs');
    await search(page).fill('');
    await expect(page.getByText('3 of 3 songs')).toBeVisible();
    await expect(songRow(page, 'Jolene').locator('.mark')).toHaveText('KaraFun');
    await expect(songRow(page, 'Jolene').locator('.set-toggle')).toHaveText('✓');
    await expect(songRow(page, 'Islands in the Stream').locator('.set-toggle')).toHaveText('+');
    await expect(songRow(page, 'Valerie').locator('.mark')).toHaveCount(0);
    await modeTab(page, 'List').click();
    await expect(page.getByRole('list', { name: 'Songs in the set' }).locator('.title')).toHaveText(['Jolene']);

    // Nothing is added twice: after a reload both rows say In my songs.
    await reloadList(page, 3);
    await showSource(page, 'KaraFun');
    await search(page).fill('dolly');
    await expect(shownTitles(page)).toHaveText(['Islands in the Stream', 'Jolene']);
    await expect(catalogRows(page).locator('.in-library')).toHaveCount(2);
    await expect(songRow(page, 'Jolene').locator('.set-toggle')).toHaveText('✓');
    expect(await readStore(page, 'songs')).toHaveLength(3);
  });

  test('R67: without a catalog Find is unchanged', async ({ page }) => {
    await openApp(page);
    await seed(page, { songs: [MY_VALERIE, { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 }] });
    await expect(sourceSwitch(page)).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(search(page)).toHaveAttribute('placeholder', 'Search title or artist');
    await expect(page.getByRole('button', { name: 'Pick for me' })).toBeVisible();
    await expect(page.getByText('Add a song', { exact: true })).toBeVisible();
    await expect(songRow(page, 'Valerie').locator('.sub')).toHaveText('Amy Winehouse · Soul · 2006');
    await expect(page.locator('.mark')).toHaveCount(0);
    // No catalog and no song from it: no KaraFun filter.
    await openFilters(page);
    await expect(filter(page, 'KaraFun')).toBeHidden();
    await expect(filter(page, 'Tag')).toBeVisible();
    await search(page).fill('zzz');
    await expect(page.getByRole('button', { name: 'Add “zzz”' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search the KaraFun catalog' })).toHaveCount(0);
    await search(page).fill('');
    await openSong(page, 'Valerie');
    await expect(songField(page, 'KaraFun')).toHaveText('No');
  });

  test('R67: a replaced catalog is read again, and removing it takes the switch away', async ({ page }) => {
    await openApp(page);
    await seed(page, { songs: [MY_VALERIE] });
    await storeCatalog(page, CATALOG.slice(0, 5));
    await reloadList(page, 1);
    await showSource(page, 'KaraFun');
    await search(page).fill('jolene');
    await expect(page.getByText('No KaraFun songs match the search and filters.')).toBeVisible();
    await expect(countLine(page)).toHaveText('0 of 5 songs');

    // Settings replaces it (rows, then karafunLoadedAt): the next visit to the tab reads it again.
    await storeCatalog(page, CATALOG, '2026-11-15T09:00:00.000Z');
    await showTab(page, 'Venues');
    await showTab(page, 'Songs');
    await expect(source(page, 'KaraFun')).toHaveAttribute('aria-checked', 'true'); // kept while the app is open
    await expect(search(page)).toHaveValue('jolene');
    await expect(shownTitles(page)).toHaveText(['Jolene']);
    await expect(countLine(page)).toHaveText('1 of 20 songs');

    // Removed: the switch goes and Find searches my songs again.
    await clearCatalog(page);
    await showTab(page, 'Venues');
    await showTab(page, 'Songs');
    await expect(sourceSwitch(page)).toHaveCount(0);
    await expect(page.getByText('No match for “jolene”.')).toBeVisible();
    await search(page).fill('');
    await expect(page.getByText('1 of 1 songs')).toBeVisible();
  });

  test('R67: a long catalog list draws 200 rows at a time, without Add a song or Starting fresh', async ({ page }) => {
    const polkas = Array.from({ length: 450 }, (_, i) => catalogRow(
      1000 + i, `Polka Number ${String(i + 1).padStart(3, '0')}`, 'Oompah Band', 1990, ['Polka']));
    await openApp(page);
    await storeCatalog(page, polkas);
    await reloadList(page, 0);
    await expect(page.getByText('Starting fresh?')).toBeVisible(); // an empty library, in my songs (R65)

    await showSource(page, 'KaraFun');
    await expect(page.getByText('Starting fresh?')).toHaveCount(0);
    await expect(page.getByText('Add a song', { exact: true })).toBeHidden();
    await openFilters(page);
    await choose(page, 'Genre', 'Polka');
    await expect(countLine(page)).toHaveText('450 of 450 songs');
    await expect(catalogRows(page)).toHaveCount(200);
    await page.getByRole('button', { name: 'Show 200 more' }).click();
    await expect(catalogRows(page)).toHaveCount(400);
    await page.getByRole('button', { name: 'Show 50 more' }).click();
    await expect(catalogRows(page)).toHaveCount(450);
    await expect(page.getByRole('button', { name: /^Show \d+ more$/ })).toBeHidden();

    // A new search starts again at the first page.
    await search(page).fill('number 1');
    await expect(countLine(page)).toHaveText('100 of 450 songs');
    await expect(catalogRows(page)).toHaveCount(100);
    await expect(shownTitles(page).first()).toHaveText('Polka Number 100');
  });

  test('R68: songs KaraFun has show a badge and can be filtered', async ({ page }) => {
    await openApp(page);
    // No catalog is loaded: the flags stay on the songs (R68), so the mark and filter show.
    await seed(page, {
      songs: [
        { ...MY_VALERIE, karafunId: 104 },
        { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976, karafunId: 114 },
        { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 },
      ],
    });
    await expect(sourceSwitch(page)).toHaveCount(0);
    await expect(songRow(page, 'Valerie').locator('.sub')).toContainText('Amy Winehouse · Soul · 2006');
    await expect(songRow(page, 'Valerie').locator('.mark')).toHaveText('KaraFun');
    await expect(songRow(page, 'Dancing Queen').locator('.mark')).toHaveText('KaraFun');
    await expect(songRow(page, 'Mr. Brightside').locator('.mark')).toHaveCount(0);
    await expect(songRow(page, 'Mr. Brightside').locator('.sub')).toHaveText('The Killers · Rock · 2004');

    await openFilters(page);
    await expect(filter(page, 'KaraFun').locator('option')).toHaveText(['Any', 'In KaraFun', 'Not in KaraFun']);
    await expectTapTarget(filter(page, 'KaraFun'));
    await choose(page, 'KaraFun', 'In KaraFun');
    await expect(shownTitles(page)).toHaveText(['Dancing Queen', 'Valerie']);
    await expect(filtersSummary(page)).toHaveText('Filters (1)');
    await choose(page, 'Genre', 'Pop');
    await expect(shownTitles(page)).toHaveText(['Dancing Queen']);
    await expect(filtersSummary(page)).toHaveText('Filters (2)');
    await choose(page, 'Genre', 'Any genre');
    await choose(page, 'KaraFun', 'Not in KaraFun');
    await expect(shownTitles(page)).toHaveText(['Mr. Brightside']);

    // Kept with the other filters across a reload (R53).
    await page.reload();
    await expect(page.getByText('1 of 3 songs')).toBeVisible();
    await openFilters(page);
    await expect(filter(page, 'KaraFun')).toHaveValue('out');
    await choose(page, 'KaraFun', 'Any');
    await expect(page.getByText('3 of 3 songs')).toBeVisible();

    // The song screen says whether KaraFun has it.
    await openSong(page, 'Valerie');
    await expect(songField(page, 'KaraFun')).toHaveText('Yes');
    await page.getByRole('button', { name: 'Back to list' }).click();
    await openSong(page, 'Mr. Brightside');
    await expect(songField(page, 'KaraFun')).toHaveText('No');
  });
});
