// Setlists, Wave 4 J: suggest a set (R45). Tonight mode (R17) was here too
// until the Songs tab's List mode (R49) replaced it; see night.spec.js.
import { test, expect } from '@playwright/test';
import { makeSong } from '../../js/lib/song.js';
import { openApp, putRecords, readStore } from './helpers.js';
import {
  openSetlists, openSetlist, backToSetlists, setlistSongRow, setlistSongRows, setlistSongTitles,
  dragHandle, removeFromSetlist, mixText, mixToggle, suggestForm, suggestNote, suggestDone, suggestPreview, previewTitles,
  suggestMode, suggest, addSuggested,
} from './helpers-setlists.js';

// Stores songs (partial fields, completed by makeSong) and returns { title: id }.
async function seedSongs(page, songs) {
  const ids = await putRecords(page, 'songs', songs.map((fields) => makeSong(fields)));
  return Object.fromEntries(songs.map((s, i) => [s.title, ids[i]]));
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

test.describe('Setlists: suggest', () => {
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
    await expect(mixText(page, 'genre')).toHaveText('Soul 1');

    // Mix it up: across every genre, whatever the list holds.
    await expect(form.getByRole('radio', { name: 'Match this list' })).toBeChecked();
    await expectTapTarget(form.getByRole('radio', { name: 'Mix it up' }));
    await suggestMode(page, 'Mix it up');
    await expect(form).toContainText('Songs never sung here, spread across genres and decades.');
    const added = await suggest(page, 6, 6);
    expect(new Set(added).size).toBe(6);
    for (const title of ['Valerie', 'Hotel California', 'Dancing Queen']) expect(added).not.toContain(title);
    await expect(setlistSongRows(page)).toHaveCount(1); // nothing is added before Add these

    // One from each genre before any genre comes up again, two of each in all,
    // and a genre's two songs come from different decades.
    expect(new Set(added.slice(0, 3).map(genreOf)).size).toBe(3);
    expect(new Set(added.slice(3).map(genreOf)).size).toBe(3);
    for (const genre of ['rock', 'pop', 'soul']) {
      const inGenre = added.filter((title) => genreOf(title) === genre);
      expect(inGenre).toHaveLength(2);
      expect(decadeOf(inGenre[0])).not.toBe(decadeOf(inGenre[1]));
    }
    // Each with its genre and year.
    const first = byTitle.get(added[0]);
    await expect(suggestPreview(page).locator('li').first().locator('.pick-mix')).toHaveText(`${first.genre} · ${first.year}`);

    // Add these puts them on the end, in the preview's order.
    await addSuggested(page, 6);
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', ...added]);

    // Never sung here, so every one is new here; the mix and the stored setlist follow.
    await expect(setlistSongRows(page).locator('.here.sung')).toHaveCount(0);
    await expect(setlistSongRows(page).locator('.here')).toHaveText(Array(7).fill('New here'));
    await expect(mixText(page, 'genre')).toHaveText('Soul 3 · Pop 2 · Rock 2');
    await expect.poll(async () => (await readStore(page, 'setlists'))[0].songIds)
      .toEqual(['Valerie', ...added].map((title) => ids[title]));

    // The result is a start to edit: songs can be removed and moved as usual,
    // and once the list changes that way, Undo is gone.
    const last = added.at(-1);
    await removeFromSetlist(page, { title: last, artist: byTitle.get(last).artist });
    await expect(suggestDone(page)).toBeHidden();
    await dragHandle(page, added[0]).focus();
    await page.keyboard.press('ArrowUp');
    await expect(setlistSongTitles(page).first()).toHaveText(added[0]);

    // Asking again offers the rest (the removed song is a candidate again);
    // Toxic, sung only at Anchor, is in one batch or the other.
    await suggestMode(page, 'Mix it up');
    const rest = await suggest(page, 50, 7);
    expect(rest).toContain(last);
    await expect(suggestPreview(page)).toContainText('Only 7 never sung here were left.');
    await addSuggested(page, 7);
    await expect(setlistSongRows(page)).toHaveCount(13);
    await expect(setlistSongRow(page, 'Toxic')).toHaveCount(1);
    await expect(mixText(page, 'genre')).toHaveText('Soul 5 · Pop 4 · Rock 4');
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

    // A number outside 1 to 50 suggests nothing.
    await suggestForm(page).getByLabel('How many').fill('0');
    await suggestForm(page).getByRole('button', { name: 'Suggest songs' }).click();
    await expect(suggestForm(page).getByRole('alert')).toHaveText('Enter how many songs to suggest, from 1 to 50.');
    await expect(suggestPreview(page)).toBeHidden();
    await expect(setlistSongRows(page)).toHaveCount(1);

    // Match this list (the default): the list is all Soul, and no Soul is left.
    await suggestForm(page).getByLabel('How many').fill('10');
    await suggestForm(page).getByRole('button', { name: 'Suggest songs' }).click();
    await expect(suggestNote(page)).toHaveText(
      'Every song in this list\'s genres has been sung here already, or is in this setlist. Mix it up looks in every genre.',
    );
    await expect(suggestPreview(page)).toBeHidden();

    // Mix it up, ten asked for (the default), three left: Dancing Queen (sung only at Anchor), Born to Run, Livin' on a Prayer.
    await suggestMode(page, 'Mix it up');
    const found = await suggest(page, undefined, 3);
    await expect(suggestNote(page)).toBeEmpty();
    await expect(suggestForm(page).locator('.error')).toBeEmpty();
    await expect(suggestPreview(page)).toContainText('Only 3 never sung here were left.');
    expect([...found].sort()).toEqual(['Born to Run', 'Dancing Queen', 'Livin\' on a Prayer']);
    await addSuggested(page, 3);
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', ...found]);

    await suggestMode(page, 'Mix it up');
    await suggestForm(page).getByRole('button', { name: 'Suggest songs' }).click();
    await expect(suggestNote(page)).toHaveText('Every song has been sung here already, or is in this setlist.');
    await expect(suggestPreview(page)).toBeHidden();
    await expect(setlistSongRows(page)).toHaveCount(4);
    expect((await readStore(page, 'setlists')).find((s) => s.name === 'Friday').songIds).toHaveLength(4);

    // A general setlist leaves out songs sung at any venue. Empty, it has no mix
    // to match, so there is no switch and the songs come from every genre.
    await backToSetlists(page);
    await openSetlist(page, 'Anywhere');
    await expect(suggestForm(page)).toContainText('Songs never sung anywhere, spread across genres and decades.');
    await expect(suggestForm(page).getByRole('radiogroup')).toBeHidden();
    const general = await suggest(page, 5, 3);
    await expect(suggestPreview(page)).toContainText('Only 3 never sung were left.');
    await addSuggested(page, 3);
    expect((await setlistSongTitles(page).allTextContents()).sort())
      .toEqual(['Born to Run', 'Livin\' on a Prayer', 'Valerie']);
    expect([...general].sort()).toEqual(['Born to Run', 'Livin\' on a Prayer', 'Valerie']);
    await expect(setlistSongRows(page).locator('.here')).toHaveCount(0); // no label venue, no sings here
    // With songs, the switch is back, on Match this list.
    await expect(suggestForm(page).getByRole('radio', { name: 'Match this list' })).toBeChecked();
  });

  test('R45: Match this list suggests songs in the list\'s own mix, the preview can drop one, and Undo takes them out again', async ({ page }) => {
    await openApp(page);
    const shelf = (genre, titles, years) => titles.map((title, i) => ({ title, artist: `${genre} Singers`, genre, year: years[i % years.length] }));
    const christmas = shelf('Christmas', ['Jingle Bell Rock', 'White Christmas', 'Last Christmas', 'Feliz Navidad',
      'Silent Night', 'Let It Snow', 'Blue Christmas', 'Frosty the Snowman'], [1957, 1984]);
    const country = shelf('Country', ['Jolene', 'Friends in Low Places', 'Ring of Fire', 'Wagon Wheel',
      'Before He Cheats', 'Islands in the Stream', 'Stand by Your Man', 'Take Me Home, Country Roads'], [1973, 1990]);
    const rock = shelf('Rock', ['Born to Run', 'Livin\' on a Prayer', 'Mr. Brightside', 'Seven Nation Army',
      'Wonderwall', 'Hotel California', 'Don\'t Stop Believin\'', 'Sweet Child o\' Mine'], [1975, 2003]);
    const ids = await seedSongs(page, [...christmas, ...country, ...rock]);
    const genreOfTitle = new Map([...christmas, ...country, ...rock].map((s) => [s.title, s.genre]));
    const listed = ['Jingle Bell Rock', 'White Christmas', 'Last Christmas'];
    // "Anytime" sorts first, so it is tonight's set under Overall, and the party list has + / ✓.
    await putRecords(page, 'setlists', [
      { name: 'Christmas party', venueId: null, songIds: listed.map((t) => ids[t]) },
      { name: 'Anytime', venueId: null, songIds: [] },
    ]);
    const stored = async () => (await readStore(page, 'setlists')).find((s) => s.name === 'Christmas party').songIds;
    await openSetlists(page);
    await openSetlist(page, 'Christmas party');

    // Match this list is chosen while the list has songs; the preview is all
    // Christmas, never a song already in the list, and nothing is added yet.
    const form = suggestForm(page);
    await expect(form.getByRole('radio', { name: 'Match this list' })).toBeChecked();
    await expect(form.getByRole('radio', { name: 'Mix it up' })).not.toBeChecked();
    await expect(form).toContainText('Songs never sung anywhere, in this list\'s mix of genres and decades.');
    const picked = await suggest(page, 4, 4);
    for (const title of picked) {
      expect(genreOfTitle.get(title)).toBe('Christmas');
      expect(listed).not.toContain(title);
    }
    await expect(suggestPreview(page).locator('.pick-mix')).toHaveText(Array(4).fill(/^Christmas · (1957|1984)$/));
    await expect(setlistSongTitles(page)).toHaveText(listed);

    // × drops one from the preview (a 44 px target named for the song); the count follows.
    const drop = suggestPreview(page).getByRole('button', { name: `Drop ${picked[1]}`, exact: true });
    await expectTapTarget(drop);
    await drop.click();
    await expect(suggestPreview(page).getByRole('heading')).toHaveText('Suggested · 3');
    const kept = [picked[0], picked[2], picked[3]];
    await expect(previewTitles(page)).toHaveText(kept);

    // Cancel adds nothing; Suggest songs again makes a new preview in place of the old one.
    await suggestPreview(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(suggestPreview(page)).toBeHidden();
    await expect(setlistSongTitles(page)).toHaveText(listed);
    const again = await suggest(page, 3, 3);
    await expect(previewTitles(page)).toHaveText(again);
    for (const title of again) expect(genreOfTitle.get(title)).toBe('Christmas');
    await suggest(page, 4, 4);
    const fresh = await previewTitles(page).allTextContents();
    await suggestPreview(page).getByRole('button', { name: `Drop ${fresh[0]}`, exact: true }).click();
    const adding = fresh.slice(1);

    // Add these puts what is left on the end and offers Undo.
    await addSuggested(page, 3);
    await expect(setlistSongTitles(page)).toHaveText([...listed, ...adding]);
    await expect.poll(stored).toEqual([...listed, ...adding].map((t) => ids[t]));
    await expect(mixText(page, 'genre')).toHaveText('Christmas 6');

    // Undo stays while nothing else changes the list (a tap on + for tonight's set changes another list).
    await page.getByRole('button', { name: `Add ${listed[0]} to tonight's set`, exact: true }).click();
    await expect(page.getByRole('button', { name: `Remove ${listed[0]} from tonight's set`, exact: true })).toBeVisible();
    const undo = suggestDone(page).getByRole('button', { name: 'Undo', exact: true });
    await expectTapTarget(undo);
    await undo.click();
    await expect(suggestDone(page)).toHaveText('Undone.');
    await expect(setlistSongTitles(page)).toHaveText(listed);
    await expect.poll(stored).toEqual(listed.map((t) => ids[t]));
    await expect(mixText(page, 'genre')).toHaveText('Christmas 3');

    // Mix it up looks across every genre instead.
    await suggestMode(page, 'Mix it up');
    const mixed = await suggest(page, 3, 3);
    expect(new Set(mixed.map((title) => genreOfTitle.get(title)))).toEqual(new Set(['Christmas', 'Country', 'Rock']));
  });
});
