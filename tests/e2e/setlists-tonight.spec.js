// Setlists, Wave 4 J: suggest a set (R45) and Tonight mode (R17).
import { test, expect } from '@playwright/test';
import { makeSong } from '../../js/lib/song.js';
import { openApp, putRecords, readStore } from './helpers.js';
import { openVenues, openVenue, historyRow } from './helpers-venues.js';
import {
  openSetlists, openSetlist, backToSetlists, setlistSongRow, setlistSongRows, setlistSongTitles,
  dragHandle, moveButton, removeFromSetlist, openMix, mixLine,
  suggestForm, suggest, tonightButton, setTonight, sangBox, pageToday,
} from './helpers-setlists.js';

// Stores songs (partial fields, completed by makeSong) and returns { title: id }.
async function seedSongs(page, songs) {
  const ids = await putRecords(page, 'songs', songs.map((fields) => makeSong(fields)));
  return Object.fromEntries(songs.map((s, i) => [s.title, ids[i]]));
}

// Dismisses and records every dialog, so a test can check that none appeared.
function refuseDialogs(page) {
  const seen = [];
  page.on('dialog', (dialog) => {
    seen.push(dialog.message());
    dialog.dismiss();
  });
  return seen;
}

async function expectTapTarget(locator) {
  const box = await locator.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

// Three genres, each over at least two decades, plus songs ruled out by the
// setlist or the venue. (Genres matching ignoring case is a unit test; here one
// spelling each keeps the Mix labels the same whatever order the songs come in.)
const LIBRARY = [
  { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 }, // in the setlist
  { title: 'Hotel California', artist: 'Eagles', genre: 'Rock', year: 1976 }, // sung at The Crown
  { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 }, // sung at The Crown
  { title: 'Born to Run', artist: 'Bruce Springsteen', genre: 'Rock', year: 1975 },
  { title: 'Livin\' on a Prayer', artist: 'Bon Jovi', genre: 'Rock', year: 1986 },
  { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 },
  { title: 'Seven Nation Army', artist: 'The White Stripes', genre: 'Rock', year: 2003 },
  { title: 'Billie Jean', artist: 'Michael Jackson', genre: 'Pop', year: 1982 },
  { title: 'Like a Prayer', artist: 'Madonna', genre: 'Pop', year: 1989 },
  { title: 'Toxic', artist: 'Britney Spears', genre: 'Pop', year: 2003 }, // sung, but only at Anchor
  { title: 'Umbrella', artist: 'Rihanna', genre: 'Pop', year: 2007 },
  { title: 'Respect', artist: 'Aretha Franklin', genre: 'Soul', year: 1967 },
  { title: 'My Girl', artist: 'The Temptations', genre: 'Soul', year: 1964 },
  { title: 'Rehab', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 },
  { title: 'Back to Black', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 },
];
const byTitle = new Map(LIBRARY.map((s) => [s.title, s]));
const genreOf = (title) => byTitle.get(title).genre.toLowerCase();
const decadeOf = (title) => Math.floor(byTitle.get(title).year / 10) * 10;

test.describe('Setlists: suggest and Tonight', () => {
  test('R45: suggests never-sung songs spread across genres and decades', async ({ page }) => {
    await openApp(page);
    const ids = await seedSongs(page, LIBRARY);
    const [crown, anchor] = await putRecords(page, 'venues', [{ name: 'The Crown' }, { name: 'Anchor' }]);
    await putRecords(page, 'sings', [
      { songId: ids['Hotel California'], venueId: crown, date: '2026-10-01' },
      { songId: ids['Dancing Queen'], venueId: crown, date: '2026-10-08' },
      { songId: ids.Toxic, venueId: anchor, date: '2026-10-09' },
    ]);
    await putRecords(page, 'setlists', [{ name: 'Friday', venueId: crown, songIds: [ids.Valerie] }]);
    await openSetlists(page);
    await openSetlist(page, 'Friday');

    const form = suggestForm(page);
    await expect(form.getByLabel('How many')).toHaveValue('10');
    await expectTapTarget(form.getByLabel('How many'));
    await expectTapTarget(form.getByRole('button', { name: 'Suggest songs' }));
    await openMix(page);
    await expect(mixLine(page, 'Genres')).toHaveText('Soul 1');

    await suggest(page, 6, 'Added 6 songs.');
    await expect(setlistSongRows(page)).toHaveCount(7);
    const titles = await setlistSongTitles(page).allTextContents();
    const added = titles.slice(1);
    expect(titles[0]).toBe('Valerie'); // what was there stays first; suggestions go at the end
    expect(new Set(added).size).toBe(6);
    for (const title of ['Valerie', 'Hotel California', 'Dancing Queen']) expect(added).not.toContain(title);

    // One from each genre before any genre comes up again, two of each in all,
    // and a genre's two songs come from different decades.
    expect(new Set(added.slice(0, 3).map(genreOf)).size).toBe(3);
    expect(new Set(added.slice(3).map(genreOf)).size).toBe(3);
    for (const genre of ['rock', 'pop', 'soul']) {
      const inGenre = added.filter((title) => genreOf(title) === genre);
      expect(inGenre).toHaveLength(2);
      expect(decadeOf(inGenre[0])).not.toBe(decadeOf(inGenre[1]));
    }

    // Never sung here, so no sung flags; the mix and the stored setlist follow.
    await expect(setlistSongRows(page).locator('.flag')).toHaveCount(0);
    await expect(mixLine(page, 'Genres')).toHaveText('Soul 3 · Pop 2 · Rock 2');
    await expect.poll(async () => (await readStore(page, 'setlists'))[0].songIds)
      .toEqual(titles.map((title) => ids[title]));

    // The result is a start to edit: songs can be removed and moved as usual.
    const last = added.at(-1);
    await removeFromSetlist(page, { title: last, artist: byTitle.get(last).artist });
    await moveButton(page, added[0], 'up').click();
    await expect(setlistSongTitles(page).first()).toHaveText(added[0]);
    await expect(dragHandle(page, added[0])).toBeVisible();

    // Asking again takes the rest (the removed song is a candidate again); Toxic, sung only at Anchor, is among them.
    await suggest(page, 50, 'Added 7 songs (only 7 never sung here were left).');
    await expect(setlistSongRows(page)).toHaveCount(13);
    await expect(setlistSongRow(page, 'Toxic')).toHaveCount(1);
    await expect(mixLine(page, 'Genres')).toHaveText('Soul 5 · Pop 4 · Rock 4');
  });

  test('R45: says so when fewer songs are left than asked for', async ({ page }) => {
    await openApp(page);
    const ids = await seedSongs(page, LIBRARY.slice(0, 5));
    const [crown, anchor] = await putRecords(page, 'venues', [{ name: 'The Crown' }, { name: 'Anchor' }]);
    await putRecords(page, 'sings', [
      { songId: ids['Hotel California'], venueId: crown, date: '2026-10-01' },
      { songId: ids['Dancing Queen'], venueId: anchor, date: '2026-10-02' },
    ]);
    await putRecords(page, 'setlists', [
      { name: 'Friday', venueId: crown, songIds: [ids.Valerie] },
      { name: 'Anywhere', venueId: null, songIds: [] },
    ]);
    await openSetlists(page);
    await openSetlist(page, 'Friday');

    // A number outside 1 to 50 adds nothing.
    await suggestForm(page).getByLabel('How many').fill('0');
    await suggestForm(page).getByRole('button', { name: 'Suggest songs' }).click();
    await expect(suggestForm(page).getByRole('alert')).toHaveText('Enter how many songs to suggest, from 1 to 50.');
    await expect(setlistSongRows(page)).toHaveCount(1);

    // Ten asked for (the default), three left: Dancing Queen (sung only at Anchor), Born to Run, Livin' on a Prayer.
    await suggestForm(page).getByLabel('How many').fill('10');
    await suggest(page, undefined, 'Added 3 songs (only 3 never sung here were left).');
    await expect(suggestForm(page).locator('.error')).toBeEmpty();
    await expect(setlistSongTitles(page)).toHaveCount(4);
    expect((await setlistSongTitles(page).allTextContents()).slice(1).sort())
      .toEqual(['Born to Run', 'Dancing Queen', 'Livin\' on a Prayer']);

    await suggest(page, undefined, 'Every song has been sung here already, or is in this setlist.');
    await expect(setlistSongRows(page)).toHaveCount(4);
    expect((await readStore(page, 'setlists')).find((s) => s.name === 'Friday').songIds).toHaveLength(4);

    // A general setlist leaves out songs sung at any venue.
    await backToSetlists(page);
    await openSetlist(page, 'Anywhere');
    await expect(suggestForm(page)).toContainText('Songs never sung anywhere');
    await suggest(page, 5, 'Added 3 songs (only 3 never sung were left).');
    expect((await setlistSongTitles(page).allTextContents()).sort())
      .toEqual(['Born to Run', 'Livin\' on a Prayer', 'Valerie']);
    await expect(page.getByText('Sung here')).toHaveCount(0);
  });

  test('R17: checking off a song in Tonight mode logs a sing today, and unchecking removes it', async ({ page }) => {
    const dialogs = refuseDialogs(page);
    await openApp(page);
    const today = await pageToday(page);
    const ids = await seedSongs(page, [
      { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 },
      { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 },
      { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 },
      { title: 'Jolene', artist: 'Dolly Parton', genre: 'Country', year: 1973 },
    ]);
    const [crown, anchor] = await putRecords(page, 'venues', [{ name: 'The Crown' }, { name: 'Anchor' }]);
    const seeded = [
      { songId: ids['Dancing Queen'], venueId: crown, date: today }, // logged on the Venues tab earlier today
      { songId: ids['Mr. Brightside'], venueId: crown, date: '2026-10-15' },
      { songId: ids.Valerie, venueId: anchor, date: today }, // today, but somewhere else
    ];
    await putRecords(page, 'sings', seeded);
    await putRecords(page, 'setlists', [{
      name: 'Friday', venueId: crown, songIds: [ids.Valerie, ids['Dancing Queen'], ids['Mr. Brightside'], ids.Jolene],
    }]);
    await openSetlists(page);
    await openSetlist(page, 'Friday');

    await expect(tonightButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expectTapTarget(tonightButton(page));
    await expect(page.getByRole('list', { name: 'Songs in this setlist' }).getByRole('checkbox')).toHaveCount(0);

    // On: the reorder and Remove controls give way to a checkbox per song.
    await setTonight(page, true);
    await expect(dragHandle(page, 'Valerie')).toHaveCount(0);
    await expect(moveButton(page, 'Valerie', 'down')).toHaveCount(0);
    await expect(page.getByLabel('Venue', { exact: true })).toBeHidden(); // the setlist's venue is used
    await expect(page.getByText(`Check off each song as you sing it. Logged: The Crown, ${today}.`)).toBeVisible();
    await expect(sangBox(page, 'Dancing Queen')).toBeChecked(); // sung here today already
    await expect(sangBox(page, 'Valerie')).not.toBeChecked();
    await expect(sangBox(page, 'Mr. Brightside')).not.toBeChecked();
    await expect(setlistSongRow(page, 'Dancing Queen')).toContainText('Sang tonight');
    await expect(page.getByText('4 songs · 1 sung tonight', { exact: true })).toBeVisible();
    await expectTapTarget(sangBox(page, 'Valerie'));

    // Check: a sing at The Crown today, shown on the row, its sung flag (R43) and the count.
    await sangBox(page, 'Valerie').click();
    await expect(sangBox(page, 'Valerie')).toBeChecked();
    await expect(setlistSongRow(page, 'Valerie').locator('.tonight-mark')).toHaveText('Sang tonight');
    await expect(setlistSongRow(page, 'Valerie').locator('.flag')).toHaveText(`Sung here · last ${today}`);
    await expect(page.getByText('4 songs · 2 sung tonight', { exact: true })).toBeVisible();
    await expect.poll(async () => (await readStore(page, 'sings')).length).toBe(4);
    expect((await readStore(page, 'sings')).at(-1))
      .toEqual({ id: expect.any(Number), songId: ids.Valerie, venueId: crown, date: today });

    // Check and uncheck: the sing comes and goes again, with no confirmation.
    await sangBox(page, 'Jolene').click();
    await expect(sangBox(page, 'Jolene')).toBeChecked();
    await expect.poll(async () => (await readStore(page, 'sings')).length).toBe(5);
    await sangBox(page, 'Jolene').click();
    await expect(sangBox(page, 'Jolene')).not.toBeChecked();
    await expect(setlistSongRow(page, 'Jolene')).not.toContainText('Sang tonight');
    await expect(setlistSongRow(page, 'Jolene').locator('.flag')).toHaveCount(0);
    await expect.poll(async () => (await readStore(page, 'sings')).length).toBe(4);
    expect((await readStore(page, 'sings')).some((s) => s.songId === ids.Jolene)).toBe(false);
    expect(dialogs).toEqual([]);

    // The mix still counts every song.
    await openMix(page);
    await expect(mixLine(page, 'Genres')).toHaveText('Country 1 · Pop 1 · Rock 1 · Soul 1');

    // Off: the normal controls come back, and the flag stays.
    await setTonight(page, false);
    await expect(dragHandle(page, 'Valerie')).toBeVisible();
    await expect(setlistSongRow(page, 'Valerie').getByRole('button', { name: 'Remove Valerie by Amy Winehouse' })).toBeVisible();
    await expect(setlistSongRow(page, 'Valerie').locator('.flag')).toHaveText(`Sung here · last ${today}`);
    await expect(page.getByText('4 songs', { exact: true })).toBeVisible();

    // The Venues tab's history has the new sing, and not the one taken back.
    await openVenues(page);
    await openVenue(page, 'The Crown');
    await expect(historyRow(page, 'Valerie')).toContainText(`Last sung ${today}`);
    await expect(historyRow(page, 'Jolene')).toHaveCount(0);

    // Leaving the screen turns Tonight off.
    await openSetlists(page);
    await openSetlist(page, 'Friday');
    await expect(tonightButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(dragHandle(page, 'Valerie')).toBeVisible();
  });

  test('R17: a general setlist asks for a venue before logging', async ({ page }) => {
    await openApp(page);
    const today = await pageToday(page);
    const ids = await seedSongs(page, [
      { title: 'Valerie', artist: 'Amy Winehouse' },
      { title: 'Jolene', artist: 'Dolly Parton' },
    ]);
    const [crown, anchor] = await putRecords(page, 'venues', [{ name: 'The Crown' }, { name: 'Anchor' }]);
    await putRecords(page, 'sings', [{ songId: ids.Jolene, venueId: anchor, date: today }]);
    await putRecords(page, 'setlists', [{ name: 'Anywhere', venueId: null, songIds: [ids.Valerie, ids.Jolene] }]);
    await openSetlists(page);
    await openSetlist(page, 'Anywhere');

    await setTonight(page, true);
    const venue = page.getByLabel('Venue', { exact: true });
    await expect(venue).toBeVisible();
    await expect(venue).toHaveValue('');
    await expect(venue.locator('option')).toHaveText(['Choose a venue', 'Anchor', 'The Crown']);
    await expectTapTarget(venue);
    await expect(page.getByText('Pick a venue first.', { exact: true })).toBeVisible();
    await expect(sangBox(page, 'Valerie')).toBeDisabled();
    await expect(sangBox(page, 'Jolene')).toBeDisabled();
    await expect(sangBox(page, 'Jolene')).not.toBeChecked();

    // Anchor: Jolene was sung there today.
    await venue.selectOption({ label: 'Anchor' });
    await expect(page.getByText('Pick a venue first.', { exact: true })).toHaveCount(0);
    await expect(sangBox(page, 'Valerie')).toBeEnabled();
    await expect(sangBox(page, 'Jolene')).toBeChecked();

    // The Crown: nothing sung there yet. Checking Valerie logs it at The Crown.
    await venue.selectOption({ label: 'The Crown' });
    await expect(sangBox(page, 'Jolene')).not.toBeChecked();
    await sangBox(page, 'Valerie').click();
    await expect(sangBox(page, 'Valerie')).toBeChecked();
    await expect(setlistSongRow(page, 'Valerie')).toContainText('Sang tonight');
    await expect.poll(async () => (await readStore(page, 'sings')).length).toBe(2);
    expect((await readStore(page, 'sings')).at(-1))
      .toEqual({ id: expect.any(Number), songId: ids.Valerie, venueId: crown, date: today });
    // General setlists still show no sung flags (R43).
    await expect(setlistSongRows(page).locator('.flag')).toHaveCount(0);

    // The venue choice stays while the screen is open, and is not saved to the setlist.
    await setTonight(page, false);
    await setTonight(page, true);
    await expect(venue).toHaveValue(String(crown));
    await expect(sangBox(page, 'Valerie')).toBeChecked();
    expect((await readStore(page, 'setlists'))[0].venueId).toBeNull();

    // A new visit starts with Tonight off and no venue picked.
    await backToSetlists(page);
    await openSetlist(page, 'Anywhere');
    await setTonight(page, true);
    await expect(page.getByLabel('Venue', { exact: true })).toHaveValue('');
    await expect(sangBox(page, 'Valerie')).toBeDisabled();
  });
});
