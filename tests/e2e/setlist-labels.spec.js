// A setlist's venue is a label, not a binding (R56): Tonight's Set menu offers
// every setlist, Overall has a set too, and deleting a venue clears its
// labels. "Find songs" on a setlist opens the Songs scope with that set as
// tonight's (R57), and a setlist can be merged into another (R59).
import { test, expect } from '@playwright/test';
import { openApp, putRecords, readStore, openScope, expectTab } from './helpers.js';
import {
  seed, reloadList, venueSelect, songRow, findContext, shownVenue,
} from './helpers-find.js';
import {
  openSetlists, openSetlist, backToSetlists, setlistRow, setlistSongTitles, suggestForm, mixCard, pageToday,
} from './helpers-setlists.js';
import { openVenues, venueRow, venueRows } from './helpers-venues.js';
import { tonightListName } from '../../js/lib/night.js';
import { swipeOpen } from './helpers-tonight.js';

const VALERIE = { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 };
const QUEEN = { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 };
const BRIGHTSIDE = { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 };
const AFRICA = { title: 'Africa', artist: 'Toto', genre: 'Rock', year: 1982 };
const SONGS = [VALERIE, QUEEN, BRIGHTSIDE, AFRICA];

const search = (page) => page.getByRole('searchbox', { name: 'Search songs' });
const field = (page) => page.getByRole('searchbox', { name: 'Add a song to tonight\'s set' });
const setSelect = (page) => page.getByLabel('Set', { exact: true });
const shownSet = (page) => setSelect(page).locator('option:checked');
const upNext = (page) => page.locator('.up-next');
const afterList = (page) => page.getByRole('list', { name: 'The rest of tonight\'s set' });
const afterRow = (page, title) => afterList(page).locator('li[data-song-id]')
  .filter({ has: page.locator('.title').getByText(title, { exact: true }) });
const matchToggle = (page, title) => page.getByRole('region', { name: 'Add to tonight' })
  .getByRole('button', { name: new RegExp(`^(Add|Remove) ${title} (to|from) the set$`) });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const toggle = (page, title) => songRow(page, title).locator('.set-toggle');
const statusLine = (page) => page.locator('.tonight-status');
const sungStrip = (page) => page.locator('.sung-strip');
const emptySet = (page) => page.getByText('Nothing in tonight\'s set yet. Type a song below, or open Lists.');

// Tonight's set as shown: the Up next card's song, then the rest in order.
async function expectSet(page, titles) {
  if (!titles.length) {
    await expect(upNext(page)).toHaveCount(0);
    await expect(afterList(page)).toBeHidden();
    return;
  }
  await expect(upNext(page).locator('.up-title')).toHaveText(titles[0]);
  if (titles.length > 1) await expect(afterList(page).locator('li[data-song-id] .title')).toHaveText(titles.slice(1));
  else await expect(afterList(page)).toBeHidden();
}

// Swipes a row open and taps one of its actions: 'Park' or 'Remove'.
async function rowAction(page, title, action) {
  const row = afterRow(page, title);
  if (!/\bopen\b/.test((await row.getAttribute('class')) || '')) await swipeOpen(page, row);
  const names = { Park: `Park ${title} for next time`, Remove: `Remove ${title} from tonight` };
  await button(page, names[action]).click();
}

// Adds a song to tonight's set from the Tonight field and clears the field.
async function addFromField(page, title) {
  await field(page).fill(title);
  await matchToggle(page, title).click();
  await expect(matchToggle(page, title)).toHaveText('✓');
  await button(page, 'Clear search').click();
}

// Opens the app and stores songs, venues, sings ({ title, venue, date }),
// setlists ({ name, venue, titles }), the remembered venue and meta records
// made from the ids ({ songIds, venueIds, setlistIds } => [{ key, value }]),
// then reloads and opens Tonight, where the venue and the set are chosen.
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
  await openScope(page, 'Tonight');
  return { today, songIds, venueIds, setlistIds };
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
    await expectSet(page, ['Valerie', 'Dancing Queen', 'Africa']);
    await expect.poll(() => metaValue(page, `currentSetlist:${viking}`)).toBe(crownSat);

    // At Viking the sings shown are Viking's, where the set is open, not its label venue's.
    await expect(upNext(page).locator('.here')).toHaveText(/^Here 1× · last 1 Oct( 2026)?$/);
    await expect(afterRow(page, 'Dancing Queen').locator('.here')).toHaveText('New here'); // sung only at The Crown

    // Sang it logs the sing at Viking; the list keeps its label.
    await button(page, 'Sang it: Valerie').click();
    await expect(page.getByRole('region', { name: 'For the KJ' }).getByRole('status')).toHaveText('“Valerie” logged at Viking');
    await button(page, 'Done').click();
    await expectSet(page, ['Dancing Queen', 'Africa']);
    await expect.poll(async () => (await readStore(page, 'sings')).length).toBe(3);
    expect((await readStore(page, 'sings')).at(-1))
      .toEqual({ id: expect.any(Number), songId: songIds.Valerie, venueId: viking, date: today });
    expect(await setlistNamed(page, 'Crown Sat'))
      .toEqual({ id: crownSat, name: 'Crown Sat', venueId: crown, songIds: [songIds['Dancing Queen'], songIds.Africa] });

    // Park goes to Viking's own Next time list.
    await rowAction(page, 'Africa', 'Park');
    await expect(statusLine(page)).toHaveText('Parked “Africa” for next time.');
    await expect.poll(async () => (await setlistNamed(page, 'Next time'))?.songIds).toEqual([songIds.Africa]);
    expect((await setlistNamed(page, 'Next time')).venueId).toBe(viking);
    expect(await metaValue(page, `nextTimeSetlist:${viking}`)).toBe((await setlistNamed(page, 'Next time')).id);

    // What was sung at Viking lists it; The Crown's history does not.
    await page.getByRole('button', { name: /^Sung · 1/ }).click();
    await expect(page.getByRole('region', { name: 'Today', exact: true }).locator('.title')).toHaveText(['Valerie']);
    await button(page, 'Back to Tonight').click();

    // Viking remembers the Crown list through a reload; The Crown opens it as its own.
    await page.reload();
    await expectTab(page, 'Tonight');
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
    await expect(shownVenue(page)).toHaveText('Overall');
    await expect(setSelect(page)).toBeEnabled();
    await expect(shownSet(page)).toHaveText('My list');
    await expect(setSelect(page).locator('option')).toHaveText(['My list', 'New list…']);
    await expect(emptySet(page)).toBeVisible();
    await expectAllTapTargets(page, 'Tonight, Overall');
    // The Songs scope's + works on it too.
    await openScope(page, 'Songs');
    await expect(findContext(page)).toHaveText('Overall · My list · 0 songs');
    await expect(toggle(page, 'Valerie')).toHaveText('+');
    expect(await readStore(page, 'setlists')).toEqual([]); // browsing Overall creates nothing

    // The first + saves it, for any venue, and remembers it for Overall.
    await toggle(page, 'Valerie').click();
    await expect(toggle(page, 'Valerie')).toHaveText('✓');
    await expect(findContext(page)).toHaveText('Overall · My list · 1 song');
    await openScope(page, 'Tonight');
    await addFromField(page, 'Dancing Queen');
    await addFromField(page, 'Mr. Brightside');
    await expectSet(page, ['Valerie', 'Dancing Queen', 'Mr. Brightside']);
    await expect.poll(async () => readStore(page, 'setlists')).toEqual([{
      id: expect.any(Number), name: 'My list', venueId: null,
      songIds: [songIds.Valerie, songIds['Dancing Queen'], songIds['Mr. Brightside']],
    }]);
    const myList = (await setlistNamed(page, 'My list')).id;
    expect(await metaValue(page, 'currentSetlist:overall')).toBe(myList);
    await expect.poll(() => setGroups(page)).toEqual([['Any venue', ['My list']]]);

    // Under Overall: no Sang it (Up next shows KJ only), no Park, no Sung strip; reorder and Remove work.
    await expect(upNext(page).getByRole('button')).toHaveText(['KJ']);
    await expect(page.getByRole('button', { name: /^Sang it/ })).toHaveCount(0);
    await expect(sungStrip(page)).toBeHidden();
    await swipeOpen(page, afterRow(page, 'Dancing Queen'));
    await expect(afterRow(page, 'Dancing Queen').locator('.after-actions').getByRole('button')).toHaveText(['Remove']);
    await expectAllTapTargets(page, 'Tonight\'s set, Overall');
    await button(page, 'Move Mr. Brightside').focus();
    await page.keyboard.press('ArrowUp');
    await expectSet(page, ['Valerie', 'Mr. Brightside', 'Dancing Queen']);
    await rowAction(page, 'Dancing Queen', 'Remove');
    await expect(statusLine(page)).toHaveText('Removed “Dancing Queen” from tonight\'s set.');
    await expectSet(page, ['Valerie', 'Mr. Brightside']);
    await expect.poll(async () => (await setlistNamed(page, 'My list')).songIds)
      .toEqual([songIds.Valerie, songIds['Mr. Brightside']]);
    expect(await readStore(page, 'sings')).toEqual([]);

    // Overall remembers its list through a reload.
    await page.reload();
    await expectTab(page, 'Tonight');
    await expect(shownSet(page)).toHaveText('My list');
    await expectSet(page, ['Valerie', 'Mr. Brightside']);

    // At a venue with no list of its own, the same list opens and can be sung.
    await venueSelect(page).selectOption({ label: 'Viking' });
    await expect(shownSet(page)).toHaveText('My list');
    await expect(button(page, 'Sang it: Valerie')).toBeVisible();

    // Back under Overall, Sang it goes again.
    await venueSelect(page).selectOption({ label: 'Overall' });
    await expect(upNext(page).getByRole('button')).toHaveText(['KJ']);

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

    // Lists shows them as for any venue.
    await openSetlists(page);
    await expect(setlistRow(page, 'Crown Fri')).toContainText('Any venue · 1 song');
    await expect(setlistRow(page, 'Crown Sat')).toContainText('Any venue · 2 songs');
    await expect(setlistRow(page, 'Anchor list')).toContainText('For Anchor · 0 songs');

    // Tonight falls back to Overall, which offers them as lists for any venue.
    await openScope(page, 'Tonight');
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

    // The setlist screen: no picker (the only search is the dock's, which
    // filters the list), Find songs at the top, Suggest songs and Mix stay.
    await openSetlists(page);
    await openSetlist(page, 'Crown Sat');
    await expect(page.getByRole('region', { name: 'Add songs' })).toHaveCount(0);
    await expect(page.getByRole('searchbox')).toHaveAccessibleName('Search Crown Sat');
    await expect(suggestForm(page)).toBeVisible();
    await expect(mixCard(page)).toBeVisible();
    const find = button(page, 'Find songs');
    await expect(find).toHaveCount(1);
    await expectTapTarget(find);
    const findBox = await find.boundingBox();
    expect(findBox.y).toBeGreaterThan((await page.getByText('For The Crown', { exact: true }).boundingBox()).y);
    expect(findBox.y).toBeLessThan((await page.getByRole('list', { name: 'Songs in this setlist' }).boundingBox()).y);

    // The Songs scope, at the same venue, with the setlist as tonight's set.
    await find.click();
    await expectTab(page, 'Songs');
    await expect(findContext(page)).toHaveText('Viking · Crown Sat · 1 song'); // the venue stays
    await expect(search(page)).toBeVisible();
    await expect(toggle(page, 'Valerie')).toHaveText('✓');
    expect(await metaValue(page, `currentSetlist:${viking}`)).toBe(setlistIds['Crown Sat']);
    expect(await metaValue(page, 'findVenueId')).toBe(viking);

    await toggle(page, 'Dancing Queen').click();
    await expect(findContext(page)).toHaveText('Viking · Crown Sat · 2 songs');
    await expect.poll(async () => (await setlistNamed(page, 'Crown Sat')).songIds)
      .toEqual([songIds.Valerie, songIds['Dancing Queen']]);
    // Tonight has it too.
    await openScope(page, 'Tonight');
    await expect(shownSet(page)).toHaveText('Crown Sat · The Crown');
    await expectSet(page, ['Valerie', 'Dancing Queen']);

    // An empty setlist offers Find songs in its empty state, once.
    await openSetlists(page);
    await openSetlist(page, 'Empty one');
    await expect(page.getByText('No songs yet. Find songs to add some, or let Suggest songs pick a few.')).toBeVisible();
    await expect(button(page, 'Find songs')).toHaveCount(1);
    await expectTapTarget(button(page, 'Find songs'));
    await button(page, 'Find songs').click();
    await expect(findContext(page)).toHaveText('Viking · Empty one · 0 songs');

    // Under Overall, the set opens there.
    await openScope(page, 'Tonight');
    await venueSelect(page).selectOption({ label: 'Overall' });
    await expect(shownVenue(page)).toHaveText('Overall');
    await openSetlists(page);
    await openSetlist(page, 'Viking');
    await button(page, 'Find songs').click();
    await expect(findContext(page)).toHaveText('Overall · Viking · 1 song');
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
