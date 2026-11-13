// A setlist's venue is a label, not a binding (R56): the Set menu offers every
// setlist, Overall has a set too, and deleting a venue clears its labels.
// "Find songs" on a setlist opens the Songs tab with that set (R57), and a
// setlist can be merged into another (R59).
import { test, expect } from '@playwright/test';
import { openApp, putRecords, readStore } from './helpers.js';
import { seed, reloadList, venueSelect, songRow } from './helpers-find.js';
import {
  openSetlists, openSetlist, backToSetlists, setlistRow, setlistSongTitles, suggestForm, mixCard, pageToday,
} from './helpers-setlists.js';
import { openVenues, venueRow, venueRows } from './helpers-venues.js';
import { tonightListName } from '../../js/lib/night.js';

const VALERIE = { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 };
const QUEEN = { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 };
const BRIGHTSIDE = { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 };
const AFRICA = { title: 'Africa', artist: 'Toto', genre: 'Rock', year: 1982 };
const SONGS = [VALERIE, QUEEN, BRIGHTSIDE, AFRICA];

const search = (page) => page.getByRole('searchbox', { name: 'Search songs' });
const setSelect = (page) => page.getByLabel('Set', { exact: true });
const shownSet = (page) => setSelect(page).locator('option:checked');
const tab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const setRows = (page) => page.getByRole('list', { name: 'Songs in the set' }).locator('li[data-song-id]');
const setTitles = (page) => setRows(page).locator('.title');
const setRow = (page, title) => setRows(page).filter({ has: page.locator('.title').getByText(title, { exact: true }) });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const toggle = (page, title) => songRow(page, title).locator('.set-toggle');
const statusLine = (page) => page.locator('.night-status');
const songsTab = (page) => page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Songs' });

// Opens the app and stores songs, venues, sings ({ title, venue, date }),
// setlists ({ name, venue, titles }), the remembered venue and meta records
// made from the ids ({ songIds, venueIds, setlistIds } => [{ key, value }]),
// then reloads so the Songs tab starts from them.
async function start(page, { songs = SONGS, venues = ['Viking', 'The Crown'], sings = [], setlists = [], venue, meta } = {}) {
  await openApp(page);
  const today = await pageToday(page);
  const { songIds, venueIds } = await seed(page, { songs, venues, sings });
  const ids = setlists.length
    ? await putRecords(page, 'setlists', setlists.map(({ name, venue: at, titles = [] }) => ({
      name, venueId: at ? venueIds[at] : null, songIds: titles.map((title) => songIds[title]),
    })))
    : [];
  const setlistIds = Object.fromEntries(setlists.map((s, i) => [s.name, ids[i]]));
  const records = meta ? meta({ songIds, venueIds, setlistIds }) : [];
  if (venue) records.push({ key: 'findVenueId', value: venueIds[venue] });
  if (records.length) await putRecords(page, 'meta', records);
  await reloadList(page, songs.length);
  return { today, songIds, venueIds, setlistIds };
}

async function showMode(page, name) {
  await tab(page, name).click();
  await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
}

// The Set menu's groups: [label, [option texts]] in order.
function setGroups(page) {
  return setSelect(page).locator('optgroup').evaluateAll((groups) => groups
    .map((group) => [group.label, [...group.querySelectorAll('option')].map((option) => option.textContent)]));
}

async function metaValue(page, key) {
  const record = (await readStore(page, 'meta')).find((r) => r.key === key);
  return record ? record.value : undefined;
}

async function setlistNamed(page, name) {
  return (await readStore(page, 'setlists')).find((s) => s.name === name);
}

async function expectTapTarget(locator) {
  const box = await locator.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

// Every visible control on the screen under 44 px either way (R31), as in ux.spec.js.
async function expectAllTapTargets(page, screen) {
  const small = await page.evaluate(() => [...document.querySelectorAll('button, input, select, textarea, summary, a[href]')]
    .map((node) => {
      const r = node.getBoundingClientRect();
      return { name: (node.getAttribute('aria-label') || node.textContent).trim(), width: r.width, height: r.height };
    })
    .filter((b) => b.width > 0 && b.height > 0 && (b.width < 44 || b.height < 44)));
  expect(small, `${screen}: controls under 44 px`).toEqual([]);
}

test.describe('Setlist labels, Find songs and merge', () => {
  test('R56: the Set menu offers every setlist, grouped for this venue, any venue and other venues', async ({ page }) => {
    const { venueIds } = await start(page, {
      venues: ['Viking', 'The Crown', 'Anchor', 'Pub'],
      setlists: [
        { name: 'Viking Fri', venue: 'Viking' },
        { name: 'Big hits', venue: null },
        { name: 'Crown Sat', venue: 'The Crown' },
        { name: 'Anchor night', venue: 'Anchor' },
        { name: 'All time', venue: null },
      ],
      venue: 'Viking',
    });

    // At Viking: its own list opens; every list is offered, in three groups, then "New list for tonight…".
    await expect(shownSet(page)).toHaveText('Viking Fri');
    await expect.poll(() => setGroups(page)).toEqual([
      ['For Viking', ['Viking Fri']],
      ['Any venue', ['All time', 'Big hits']],
      ['Other venues', ['Anchor night · Anchor', 'Crown Sat · The Crown']],
    ]);
    await expect(setSelect(page).locator('option').last()).toHaveText('New list for tonight…');
    await expectTapTarget(setSelect(page));

    // A venue with no list of its own opens the first for any venue, creates
    // nothing, and leaves out the empty group.
    await venueSelect(page).selectOption({ label: 'Pub' });
    await expect(shownSet(page)).toHaveText('All time');
    await expect.poll(() => setGroups(page)).toEqual([
      ['Any venue', ['All time', 'Big hits']],
      ['Other venues', ['Anchor night · Anchor', 'Crown Sat · The Crown', 'Viking Fri · Viking']],
    ]);
    expect(await readStore(page, 'setlists')).toHaveLength(5);
    await expect.poll(() => metaValue(page, `currentSetlist:${venueIds.Pub}`))
      .toBe((await setlistNamed(page, 'All time')).id);

    // A list from another venue can be picked, and is remembered for this venue.
    await setSelect(page).selectOption({ label: 'Crown Sat · The Crown' });
    await expect(shownSet(page)).toHaveText('Crown Sat · The Crown');
    await expect.poll(() => metaValue(page, `currentSetlist:${venueIds.Pub}`))
      .toBe((await setlistNamed(page, 'Crown Sat')).id);

    // New list for tonight is still labelled for the venue.
    await setSelect(page).selectOption({ label: 'New list for tonight…' });
    const today = await pageToday(page);
    const name = tonightListName(new Date(`${today}T12:00:00`));
    await expect(shownSet(page)).toHaveText(name);
    expect(await setlistNamed(page, name)).toMatchObject({ venueId: venueIds.Pub, songIds: [] });
    await expect.poll(() => setGroups(page)).toEqual([
      ['For Pub', [name]],
      ['Any venue', ['All time', 'Big hits']],
      ['Other venues', ['Anchor night · Anchor', 'Crown Sat · The Crown', 'Viking Fri · Viking']],
    ]);

    // Under Overall: any venue first, then every labelled list with its venue.
    await venueSelect(page).selectOption({ label: 'Overall' });
    await expect(shownSet(page)).toHaveText('All time');
    await expect.poll(() => setGroups(page)).toEqual([
      ['Any venue', ['All time', 'Big hits']],
      ['For a venue', ['Anchor night · Anchor', 'Crown Sat · The Crown', `${name} · Pub`, 'Viking Fri · Viking']],
    ]);
    await expect(setSelect(page).locator('option').last()).toHaveText('New list…');

    // Each venue kept its own choice.
    await venueSelect(page).selectOption({ label: 'Viking' });
    await expect(shownSet(page)).toHaveText('Viking Fri');
    await venueSelect(page).selectOption({ label: 'Pub' });
    await expect(shownSet(page)).toHaveText(name);
  });

  test('R56: a list labelled for one venue can be opened and sung at another', async ({ page }) => {
    const { today, songIds, venueIds } = await start(page, {
      sings: [
        { title: 'Valerie', venue: 'Viking', date: '2026-10-01' },
        { title: 'Dancing Queen', venue: 'The Crown', date: '2026-10-02' },
      ],
      setlists: [{ name: 'Crown Sat', venue: 'The Crown', titles: ['Valerie', 'Dancing Queen', 'Africa'] }],
      venue: 'Viking',
    });
    const viking = venueIds.Viking;
    const crown = venueIds['The Crown'];
    // Viking has no list of its own and there is none for any venue, so it gets one named after it.
    await expect(shownSet(page)).toHaveText('Viking');
    const crownSat = (await setlistNamed(page, 'Crown Sat')).id;

    await setSelect(page).selectOption({ label: 'Crown Sat · The Crown' });
    await expect(tab(page, 'List')).toHaveText('List (3)');
    await expect.poll(() => metaValue(page, `currentSetlist:${viking}`)).toBe(crownSat);

    // List mode at Viking: the flags are for Viking, where the set is open, not its label venue.
    await showMode(page, 'List');
    await expect(setTitles(page)).toHaveText(['Valerie', 'Dancing Queen', 'Africa']);
    await expect(setRow(page, 'Valerie').locator('.flag')).toHaveText('Sung here · last 2026-10-01');
    await expect(setRow(page, 'Dancing Queen').locator('.flag')).toHaveCount(0); // sung only at The Crown

    // Sang it logs the sing at Viking; the list keeps its label.
    await button(page, 'Sang Valerie').click();
    await expect(statusLine(page)).toHaveText('Sang “Valerie”. Undo is under Sung.');
    await expect(setTitles(page)).toHaveText(['Dancing Queen', 'Africa']);
    await expect.poll(async () => (await readStore(page, 'sings')).length).toBe(3);
    expect((await readStore(page, 'sings')).at(-1))
      .toEqual({ id: expect.any(Number), songId: songIds.Valerie, venueId: viking, date: today });
    expect(await setlistNamed(page, 'Crown Sat'))
      .toEqual({ id: crownSat, name: 'Crown Sat', venueId: crown, songIds: [songIds['Dancing Queen'], songIds.Africa] });

    // Next time goes to Viking's own Next time list.
    await button(page, 'Africa next time').click();
    await expect(statusLine(page)).toHaveText('Moved “Africa” to Next time.');
    await expect.poll(async () => (await setlistNamed(page, 'Next time'))?.songIds).toEqual([songIds.Africa]);
    expect((await setlistNamed(page, 'Next time')).venueId).toBe(viking);
    expect(await metaValue(page, `nextTimeSetlist:${viking}`)).toBe((await setlistNamed(page, 'Next time')).id);

    // Sung at Viking lists it; The Crown's history does not.
    await showMode(page, 'Sung');
    await expect(page.getByRole('region', { name: 'Today', exact: true }).locator('.title')).toHaveText(['Valerie']);

    // Viking remembers the Crown list through a reload; The Crown opens it as its own.
    await reloadList(page, SONGS.length);
    await expect(venueSelect(page)).toHaveValue(String(viking));
    await expect(shownSet(page)).toHaveText('Crown Sat · The Crown');
    await venueSelect(page).selectOption({ label: 'The Crown' });
    await expect(shownSet(page)).toHaveText('Crown Sat');
    await expect.poll(() => setGroups(page)).toEqual([
      ['For The Crown', ['Crown Sat']],
      ['Other venues', ['Next time · Viking', 'Viking · Viking']],
    ]);
  });

  test('R56: under Overall a list can be built and ordered but not sung', async ({ page }) => {
    const { songIds } = await start(page);

    // Overall has a set: an unsaved "My list" until a song goes in.
    await expect(venueSelect(page)).toHaveValue('');
    await expect(setSelect(page)).toBeEnabled();
    await expect(shownSet(page)).toHaveText('My list');
    await expect(setSelect(page).locator('option')).toHaveText(['My list', 'New list…']);
    await expect(tab(page, 'List')).toBeEnabled();
    await expect(tab(page, 'List')).toHaveText('List (0)');
    await expect(tab(page, 'Sung')).toBeDisabled();
    await expect(page.getByText('Pick a venue to log a sing or use Sung.')).toBeVisible();
    await expect(toggle(page, 'Valerie')).toHaveText('+');
    for (const name of ['Find', 'List', 'Sung']) await expectTapTarget(tab(page, name));
    await expectAllTapTargets(page, 'Find, Overall');
    expect(await readStore(page, 'setlists')).toEqual([]); // browsing Overall creates nothing

    // The first + saves it, for any venue, and remembers it for Overall.
    await toggle(page, 'Valerie').click();
    await expect(toggle(page, 'Valerie')).toHaveText('✓');
    await expect(tab(page, 'List')).toHaveText('List (1)');
    await toggle(page, 'Dancing Queen').click();
    await toggle(page, 'Mr. Brightside').click();
    await expect(tab(page, 'List')).toHaveText('List (3)');
    await expect.poll(async () => readStore(page, 'setlists')).toEqual([{
      id: expect.any(Number), name: 'My list', venueId: null,
      songIds: [songIds.Valerie, songIds['Dancing Queen'], songIds['Mr. Brightside']],
    }]);
    const myList = (await setlistNamed(page, 'My list')).id;
    expect(await metaValue(page, 'currentSetlist:overall')).toBe(myList);
    await expect.poll(() => setGroups(page)).toEqual([['Any venue', ['My list']]]);

    // List mode: move up and down, and Remove in place of Sang it and Next time.
    await showMode(page, 'List');
    await expect(setTitles(page)).toHaveText(['Valerie', 'Dancing Queen', 'Mr. Brightside']);
    await expect(page.getByRole('button', { name: /^Sang / })).toHaveCount(0);
    await expect(page.getByRole('button', { name: / next time$/ })).toHaveCount(0);
    await expectTapTarget(button(page, 'Remove Valerie from the set'));
    await expectAllTapTargets(page, 'List, Overall');
    await button(page, 'Move Mr. Brightside up').click();
    await expect(setTitles(page)).toHaveText(['Valerie', 'Mr. Brightside', 'Dancing Queen']);
    await button(page, 'Remove Valerie from the set').click();
    await expect(statusLine(page)).toHaveText('Removed “Valerie” from the set.');
    await expect(setTitles(page)).toHaveText(['Mr. Brightside', 'Dancing Queen']);
    await expect(tab(page, 'List')).toHaveText('List (2)');
    await expect.poll(async () => (await setlistNamed(page, 'My list')).songIds)
      .toEqual([songIds['Mr. Brightside'], songIds['Dancing Queen']]);
    expect(await readStore(page, 'sings')).toEqual([]);

    // Sung stays off: a disabled tab does nothing.
    await tab(page, 'Sung').click({ force: true });
    await expect(tab(page, 'List')).toHaveAttribute('aria-selected', 'true');

    // Overall remembers its list through a reload.
    await page.reload();
    await expect(page.getByText('4 of 4 songs')).toBeVisible();
    await expect(shownSet(page)).toHaveText('My list');
    await expect(tab(page, 'List')).toHaveText('List (2)');

    // At a venue with no list of its own, the same list opens and can be sung.
    await showMode(page, 'List');
    await venueSelect(page).selectOption({ label: 'Viking' });
    await expect(shownSet(page)).toHaveText('My list');
    await expect(tab(page, 'List')).toHaveAttribute('aria-selected', 'true');
    await expect(button(page, 'Sang Dancing Queen')).toBeVisible();
    await expect(page.getByText('Pick a venue to log a sing or use Sung.')).toBeHidden();

    // From Sung, picking Overall goes back to Find.
    await showMode(page, 'Sung');
    await venueSelect(page).selectOption({ label: 'Overall' });
    await expect(tab(page, 'Find')).toHaveAttribute('aria-selected', 'true');
    await expect(search(page)).toBeVisible();
    await expect(tab(page, 'Sung')).toBeDisabled();

    // "New list…" under Overall makes a dated list for any venue.
    await setSelect(page).selectOption({ label: 'New list…' });
    const today = await pageToday(page);
    const name = tonightListName(new Date(`${today}T12:00:00`));
    await expect(shownSet(page)).toHaveText(name);
    await expect(statusLine(page)).toHaveText(`Started “${name}”.`);
    expect(await setlistNamed(page, name)).toMatchObject({ venueId: null, songIds: [] });
    expect(await metaValue(page, 'currentSetlist:overall')).toBe((await setlistNamed(page, name)).id);
  });

  test('R56: deleting a venue clears the label on its setlists instead of being blocked', async ({ page }) => {
    const dialogs = [];
    let accept = false;
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      if (accept) dialog.accept();
      else dialog.dismiss();
    });
    const { venueIds, setlistIds } = await start(page, {
      venues: ['Viking', 'The Crown', 'Anchor'],
      sings: [{ title: 'Valerie', venue: 'Anchor', date: '2026-10-01' }],
      setlists: [
        { name: 'Crown Fri', venue: 'The Crown', titles: ['Valerie'] },
        { name: 'Crown Sat', venue: 'The Crown', titles: ['Dancing Queen', 'Africa'] },
        { name: 'Anywhere', venue: null },
        { name: 'Anchor list', venue: 'Anchor' },
        { name: 'Viking list', venue: 'Viking' },
      ],
      meta: ({ venueIds: v, setlistIds: s }) => [
        { key: `currentSetlist:${v['The Crown']}`, value: s['Crown Sat'] },
        { key: `nextTimeSetlist:${v['The Crown']}`, value: s['Crown Fri'] },
        { key: `currentSetlist:${v.Viking}`, value: s['Viking list'] },
      ],
      venue: 'The Crown',
    });
    const crown = venueIds['The Crown'];
    await expect(shownSet(page)).toHaveText('Crown Sat');
    await openVenues(page);

    // Setlists do not block the delete; the confirmation says what happens to them.
    await venueRow(page, 'The Crown').getByRole('button', { name: 'Delete The Crown' }).click();
    await expect.poll(() => dialogs).toEqual([
      'Delete the venue “The Crown”? 2 setlists are labelled for it; they will become Any venue.',
    ]);
    await expect(venueRow(page, 'The Crown').getByRole('alert')).toHaveCount(0); // no "Can't delete"
    await expect(venueRows(page)).toHaveCount(3);
    expect((await setlistNamed(page, 'Crown Fri')).venueId).toBe(crown); // dismissed: nothing changes

    accept = true;
    await venueRow(page, 'The Crown').getByRole('button', { name: 'Delete The Crown' }).click();
    await expect(venueRows(page)).toHaveCount(2);
    const byName = Object.fromEntries((await readStore(page, 'setlists')).map((s) => [s.name, s]));
    expect(byName['Crown Fri']).toEqual({ id: setlistIds['Crown Fri'], name: 'Crown Fri', venueId: null, songIds: [expect.any(Number)] });
    expect(byName['Crown Sat'].venueId).toBeNull();
    expect(byName['Crown Sat'].songIds).toHaveLength(2);
    expect(byName['Anchor list'].venueId).toBe(venueIds.Anchor);
    expect(byName['Viking list'].venueId).toBe(venueIds.Viking);
    // The Songs tab's memory of the venue's sets goes with it; other venues keep theirs.
    const meta = new Map((await readStore(page, 'meta')).map((r) => [r.key, r.value]));
    expect(meta.has(`currentSetlist:${crown}`)).toBe(false);
    expect(meta.has(`nextTimeSetlist:${crown}`)).toBe(false);
    expect(meta.get(`currentSetlist:${venueIds.Viking}`)).toBe(setlistIds['Viking list']);

    // Sings still block a delete, and then nothing changes.
    await venueRow(page, 'Anchor').getByRole('button', { name: 'Delete Anchor' }).click();
    await expect(venueRow(page, 'Anchor').getByRole('alert')).toHaveText(
      'Can\'t delete “Anchor”: 1 sing log entry still uses it. Remove those first.');
    expect(dialogs).toHaveLength(2);
    expect((await setlistNamed(page, 'Anchor list')).venueId).toBe(venueIds.Anchor);

    // The Setlists tab shows them as for any venue.
    await openSetlists(page);
    await expect(setlistRow(page, 'Crown Fri')).toContainText('Any venue · 1 song');
    await expect(setlistRow(page, 'Crown Sat')).toContainText('Any venue · 2 songs');
    await expect(setlistRow(page, 'Anchor list')).toContainText('For Anchor · 0 songs');

    // The Songs tab falls back to Overall, which offers them as lists for any venue.
    await songsTab(page).click();
    await expect(venueSelect(page)).toHaveValue('');
    await expect.poll(() => setGroups(page)).toEqual([
      ['Any venue', ['Anywhere', 'Crown Fri', 'Crown Sat']],
      ['For a venue', ['Anchor list · Anchor', 'Viking list · Viking']],
    ]);
  });

  test('R57: Find songs on a setlist opens the Songs tab with that set at the current venue', async ({ page }) => {
    const { songIds, venueIds, setlistIds } = await start(page, {
      setlists: [
        { name: 'Crown Sat', venue: 'The Crown', titles: ['Valerie'] },
        { name: 'Viking', venue: 'Viking', titles: ['Africa'] },
        { name: 'Empty one', venue: null },
      ],
      venue: 'Viking',
    });
    const viking = venueIds.Viking;
    await expect(shownSet(page)).toHaveText('Viking');
    await showMode(page, 'List'); // Find songs switches to Find whatever mode was showing

    // The setlist screen: no picker, Find songs at the top, Suggest songs and Mix stay.
    await openSetlists(page);
    await openSetlist(page, 'Crown Sat');
    await expect(page.getByRole('region', { name: 'Add songs' })).toHaveCount(0);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(suggestForm(page)).toBeVisible();
    await expect(mixCard(page)).toBeVisible();
    const find = button(page, 'Find songs');
    await expect(find).toHaveCount(1);
    await expectTapTarget(find);
    const findBox = await find.boundingBox();
    expect(findBox.y).toBeGreaterThan((await page.getByText('For The Crown', { exact: true }).boundingBox()).y);
    expect(findBox.y).toBeLessThan((await page.getByRole('list', { name: 'Songs in this setlist' }).boundingBox()).y);

    await find.click();
    await expect(songsTab(page)).toHaveAttribute('aria-current', 'page');
    await expect(venueSelect(page)).toHaveValue(String(viking)); // the venue stays
    await expect(shownSet(page)).toHaveText('Crown Sat · The Crown');
    await expect(tab(page, 'Find')).toHaveAttribute('aria-selected', 'true');
    await expect(search(page)).toBeVisible();
    await expect(tab(page, 'List')).toHaveText('List (1)');
    await expect(toggle(page, 'Valerie')).toHaveText('✓');
    expect(await metaValue(page, `currentSetlist:${viking}`)).toBe(setlistIds['Crown Sat']);
    expect(await metaValue(page, 'findVenueId')).toBe(viking);

    await toggle(page, 'Dancing Queen').click();
    await expect(tab(page, 'List')).toHaveText('List (2)');
    await expect.poll(async () => (await setlistNamed(page, 'Crown Sat')).songIds)
      .toEqual([songIds.Valerie, songIds['Dancing Queen']]);

    // An empty setlist offers Find songs in its empty state, once.
    await openSetlists(page);
    await openSetlist(page, 'Empty one');
    await expect(page.getByText('No songs yet. Find songs to add some, or let Suggest songs pick a few.')).toBeVisible();
    await expect(button(page, 'Find songs')).toHaveCount(1);
    await expectTapTarget(button(page, 'Find songs'));
    await button(page, 'Find songs').click();
    await expect(shownSet(page)).toHaveText('Empty one');
    await expect(tab(page, 'List')).toHaveText('List (0)');

    // Under Overall, the set opens there.
    await venueSelect(page).selectOption({ label: 'Overall' });
    await openSetlists(page);
    await openSetlist(page, 'Viking');
    await button(page, 'Find songs').click();
    await expect(venueSelect(page)).toHaveValue('');
    await expect(shownSet(page)).toHaveText('Viking · Viking');
    await expect(toggle(page, 'Africa')).toHaveText('✓');
    expect(await metaValue(page, 'currentSetlist:overall')).toBe(setlistIds.Viking);
    expect(await metaValue(page, `currentSetlist:${viking}`)).toBe(setlistIds['Empty one']); // Viking's own choice is kept
  });

  test('R59: merging moves every song not already there to the end of the other list and empties the source', async ({ page }) => {
    const dialogs = [];
    let accept = false;
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      if (accept) dialog.accept();
      else dialog.dismiss();
    });
    const { songIds, venueIds, setlistIds } = await start(page, {
      venues: ['The Crown'],
      setlists: [{ name: 'Friday', venue: 'The Crown', titles: ['Valerie', 'Dancing Queen', 'Mr. Brightside'] }],
    });
    const crown = venueIds['The Crown'];

    // With no other setlist there is nowhere to merge.
    await openSetlists(page);
    await openSetlist(page, 'Friday');
    const merge = button(page, 'Merge into…');
    await expect(merge).toBeDisabled();
    await expect(page.getByText('No other setlist to merge into.')).toBeVisible();

    const [nextTime, anywhere, empty] = await putRecords(page, 'setlists', [
      { name: 'Next time', venueId: crown, songIds: [songIds['Dancing Queen'], songIds.Africa] },
      { name: 'Anywhere', venueId: null, songIds: [songIds.Africa] },
      { name: 'Empty', venueId: null, songIds: [] },
    ]);
    await putRecords(page, 'meta', [
      { key: `currentSetlist:${crown}`, value: setlistIds.Friday },
      { key: `nextTimeSetlist:${crown}`, value: nextTime },
    ]);
    await backToSetlists(page);
    await openSetlist(page, 'Friday');
    await expect(merge).toBeEnabled();
    await expect(page.getByText('No other setlist to merge into.')).toBeHidden();
    await expectTapTarget(merge);

    // The form lists every other setlist, this list's venue first; Cancel closes it.
    await merge.click();
    const form = page.getByRole('form', { name: 'Merge into another setlist' });
    await expect(form).toBeVisible();
    const target = form.getByLabel('Merge into', { exact: true });
    await expect(target).toBeFocused();
    expect(await target.locator('optgroup').evaluateAll((groups) => groups
      .map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.textContent)]))).toEqual([
      ['For The Crown', ['Next time']],
      ['Any venue', ['Anywhere', 'Empty']],
    ]);
    await expectAllTapTargets(page, 'Merge form');
    await form.getByRole('button', { name: 'Cancel' }).click();
    await expect(form).toBeHidden();

    // Confirm first: saying no changes nothing.
    await merge.click();
    await target.selectOption({ label: 'Next time' });
    await form.getByRole('button', { name: 'Merge', exact: true }).click();
    await expect.poll(() => dialogs).toEqual([
      'Move 2 songs from “Friday” to the end of “Next time”? 1 song is already there. “Friday” will be left empty.',
    ]);
    await expect(setlistSongTitles(page)).toHaveText(['Valerie', 'Dancing Queen', 'Mr. Brightside']);
    expect((await setlistNamed(page, 'Friday')).songIds).toHaveLength(3);

    // Saying yes: the songs not already there go to the end, in order; Friday is left empty.
    accept = true;
    await form.getByRole('button', { name: 'Merge', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Next time', exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Moved' }))
      .toHaveText('Moved 2 songs from “Friday”. 1 was already here.');
    await expect(setlistSongTitles(page)).toHaveText(['Dancing Queen', 'Africa', 'Valerie', 'Mr. Brightside']);
    const stored = Object.fromEntries((await readStore(page, 'setlists')).map((s) => [s.name, s]));
    expect(stored.Friday).toEqual({ id: setlistIds.Friday, name: 'Friday', venueId: crown, songIds: [] });
    expect(stored['Next time']).toEqual({
      id: nextTime, name: 'Next time', venueId: crown,
      songIds: [songIds['Dancing Queen'], songIds.Africa, songIds.Valerie, songIds['Mr. Brightside']],
    });
    expect(stored.Anywhere.songIds).toEqual([songIds.Africa]);
    expect(stored.Empty.id).toBe(empty);
    expect(anywhere).toBe(stored.Anywhere.id);
    // The remembered set and the Next time role are not affected.
    expect(await metaValue(page, `currentSetlist:${crown}`)).toBe(setlistIds.Friday);
    expect(await metaValue(page, `nextTimeSetlist:${crown}`)).toBe(nextTime);

    // Back goes to the list; the emptied source has nothing to merge.
    await backToSetlists(page);
    await expect(setlistRow(page, 'Friday')).toContainText('For The Crown · 0 songs');
    await expect(setlistRow(page, 'Next time')).toContainText('For The Crown · 4 songs');
    await openSetlist(page, 'Friday');
    await expect(merge).toBeDisabled();
    await expect(page.getByText('Nothing to merge.')).toBeVisible();
  });
});
