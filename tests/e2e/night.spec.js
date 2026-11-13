// A night out on the Songs tab (Wave 5 K): the venue and the set open there,
// pinned at the top (R47); Find with a + per song (R48); List with move,
// "Sang it" and "Next time" (R49); Sung with Undo for today (R50).
import { test, expect } from '@playwright/test';
import { openApp, openSong, putRecords, readStore } from './helpers.js';
import {
  seed, reloadList, bigLibrary, venueSelect, songRow, sungLine, openFilters, choose, openAddForm,
} from './helpers-find.js';
import { openSetlists, setlistRow, editSetlist, openSetlist, pageToday } from './helpers-setlists.js';
import { openVenues, openVenue, historyRow } from './helpers-venues.js';
import { tonightListName } from '../../js/lib/night.js';

const VALERIE = { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 };
const QUEEN = { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 };
const BRIGHTSIDE = { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 };
const AFRICA = { title: 'Africa', artist: 'Toto', genre: 'Rock', year: 1982 };
const SONGS = [VALERIE, QUEEN, BRIGHTSIDE, AFRICA];

const search = (page) => page.getByRole('searchbox', { name: 'Search songs' });
const setSelect = (page) => page.getByLabel('Set', { exact: true });
const tab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const setList = (page) => page.getByRole('list', { name: 'Songs in the set' });
const setRows = (page) => setList(page).locator('li[data-song-id]');
const setRow = (page, title) => setRows(page).filter({ has: page.locator('.title').getByText(title, { exact: true }) });
const setTitles = (page) => setRows(page).locator('.title');
const toggle = (page, title) => songRow(page, title).locator('.set-toggle');
const statusLine = (page) => page.locator('.night-status');
const button = (page, name) => page.getByRole('button', { name, exact: true });
const day = (page, label) => page.getByRole('region', { name: label, exact: true });

// Opens the app, stores songs, venues, sings ({ title, venue, date }),
// setlists ({ name, venue, titles }) and the remembered venue, and reloads so
// the Songs tab starts from them. Sings and setlists can be functions of
// today's date ('YYYY-MM-DD' in the page) that give them.
async function start(page, { songs = SONGS, venues = ['Viking', 'The Crown'], sings = [], setlists = [], venue } = {}) {
  await openApp(page);
  const today = await pageToday(page);
  const { songIds, venueIds } = await seed(page, {
    songs, venues, sings: typeof sings === 'function' ? sings(today) : sings,
  });
  const lists = typeof setlists === 'function' ? setlists(today) : setlists;
  if (lists.length) {
    await putRecords(page, 'setlists', lists.map(({ name, venue: at, titles = [] }) => ({
      name, venueId: at ? venueIds[at] : null, songIds: titles.map((title) => songIds[title]),
    })));
  }
  if (venue) await putRecords(page, 'meta', [{ key: 'findVenueId', value: venueIds[venue] }]);
  if (lists.length || venue) await reloadList(page, songs.length);
  return { today, songIds, venueIds };
}

// The name "New list for tonight" gives on `today` ('YYYY-MM-DD').
const tonightName = (today) => tonightListName(new Date(`${today}T12:00:00`));
const byName = (names) => [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

async function showMode(page, name) {
  await tab(page, name).click();
  await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
}

async function setlistsNamed(page, name) {
  return (await readStore(page, 'setlists')).filter((s) => s.name === name);
}

async function metaValue(page, key) {
  const record = (await readStore(page, 'meta')).find((r) => r.key === key);
  return record ? record.value : undefined;
}

// The selected option's text in the Set menu.
const shownSet = (page) => setSelect(page).locator('option:checked');

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

test.describe('Night out', () => {
  test('R47: picking a venue opens its list, creating one on first visit, and remembers it', async ({ page }) => {
    const { songs } = bigLibrary(30, 0); // enough to scroll
    // No list for any venue here: Viking would open that rather than make its own (R56).
    const { venueIds } = await start(page, {
      songs: [...SONGS, ...songs],
      setlists: [
        { name: 'Crown Friday', venue: 'The Crown' },
        { name: 'Another', venue: 'The Crown' },
      ],
    });
    const viking = venueIds.Viking;
    const crown = venueIds['The Crown'];
    // Overall opens the first list of all when none is for any venue (R56).
    await expect(shownSet(page)).toHaveText('Another · The Crown');

    // Venue first, then Set, above the modes and the search.
    const venueBox = await venueSelect(page).boundingBox();
    const setBox = await setSelect(page).boundingBox();
    const findBox = await tab(page, 'Find').boundingBox();
    expect(venueBox.x).toBeLessThan(setBox.x);
    expect(Math.abs(venueBox.y - setBox.y)).toBeLessThan(4);
    expect(findBox.y).toBeGreaterThan(venueBox.y + venueBox.height - 1);
    expect((await search(page).boundingBox()).y).toBeGreaterThan(findBox.y + findBox.height - 1);
    await expectTapTarget(venueSelect(page));
    await expectTapTarget(setSelect(page));

    // First visit to Viking: a list named after it is created and opened.
    await venueSelect(page).selectOption({ label: 'Viking' });
    await expect(shownSet(page)).toHaveText('Viking');
    await expect(setSelect(page)).toBeEnabled();
    // Every list is offered (R56): this venue's first, then other venues' with their venue.
    await expect(setSelect(page).locator('option'))
      .toHaveText(['Viking', 'Another · The Crown', 'Crown Friday · The Crown', 'New list for tonight…']);
    await expect(tab(page, 'List')).toHaveText('List (0)');
    const [vikingList] = await setlistsNamed(page, 'Viking');
    expect(vikingList).toEqual({ id: expect.any(Number), name: 'Viking', venueId: viking, songIds: [] });
    expect(await metaValue(page, `currentSetlist:${viking}`)).toBe(vikingList.id);

    // A venue with lists labelled for it opens its first by name and creates nothing.
    await venueSelect(page).selectOption({ label: 'The Crown' });
    await expect(shownSet(page)).toHaveText('Another');
    await expect(setSelect(page).locator('option'))
      .toHaveText(['Another', 'Crown Friday', 'Viking · Viking', 'New list for tonight…']);
    await setSelect(page).selectOption({ label: 'Crown Friday' });
    const crownFriday = (await setlistsNamed(page, 'Crown Friday'))[0].id;
    await expect.poll(() => metaValue(page, `currentSetlist:${crown}`)).toBe(crownFriday);

    // Each venue remembers its own set, through a visit elsewhere and a reload.
    await venueSelect(page).selectOption({ label: 'Viking' });
    await expect(shownSet(page)).toHaveText('Viking');
    await venueSelect(page).selectOption({ label: 'The Crown' });
    await expect(shownSet(page)).toHaveText('Crown Friday');
    await reloadList(page, 34);
    await expect(venueSelect(page)).toHaveValue(String(crown));
    await expect(shownSet(page)).toHaveText('Crown Friday');
    expect(await readStore(page, 'setlists')).toHaveLength(3); // nothing created twice

    // The bar stays at the top while the list scrolls under it.
    await page.locator('main').evaluate((main) => { main.scrollTop = main.scrollHeight; });
    await expect(songRow(page, 'Africa')).not.toBeInViewport(); // the first row
    await expect(venueSelect(page)).toBeInViewport();
    await expect(setSelect(page)).toBeInViewport();
    await expect(tab(page, 'Find')).toBeInViewport();
    const mainTop = (await page.locator('main').boundingBox()).y;
    expect((await venueSelect(page).boundingBox()).y - mainTop).toBeLessThan(16);

    // A remembered set that was deleted gives way to the venue's first by name.
    await openSetlists(page);
    page.once('dialog', (dialog) => dialog.accept());
    await setlistRow(page, 'Crown Friday').getByRole('button', { name: 'Delete Crown Friday' }).click();
    await expect(setlistRow(page, 'Crown Friday')).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Songs' }).click();
    await expect(shownSet(page)).toHaveText('Another');
    await expect.poll(() => metaValue(page, `currentSetlist:${crown}`))
      .toBe((await setlistsNamed(page, 'Another'))[0].id);
  });

  test('R47: New list for tonight creates a dated list and selects it', async ({ page }) => {
    const { today, venueIds } = await start(page, {
      setlists: (t) => [{ name: tonightName(t).toUpperCase(), venue: 'The Crown' }], // the name is taken, ignoring case
      venue: 'Viking',
    });
    const name = tonightName(today);
    expect(name).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/);
    const viking = venueIds.Viking;
    await expect(shownSet(page)).toHaveText('Viking');

    await setSelect(page).selectOption({ label: 'New list for tonight…' });
    await expect(shownSet(page)).toHaveText(`${name} (2)`);
    await expect(statusLine(page)).toHaveText(`Started “${name} (2)”.`);
    await expect(tab(page, 'List')).toHaveText('List (0)');
    const [made] = await setlistsNamed(page, `${name} (2)`);
    expect(made).toEqual({ id: expect.any(Number), name: `${name} (2)`, venueId: viking, songIds: [] });
    expect(await metaValue(page, `currentSetlist:${viking}`)).toBe(made.id);

    // Another one the same night is (3); the menu lists them by name.
    await setSelect(page).selectOption({ label: 'New list for tonight…' });
    await expect(shownSet(page)).toHaveText(`${name} (3)`);
    await expect(setSelect(page).locator('option')).toHaveText([
      ...byName([`${name} (2)`, `${name} (3)`, 'Viking']), `${name.toUpperCase()} · The Crown`, 'New list for tonight…',
    ]);
    expect(await readStore(page, 'setlists')).toHaveLength(4);

    // It stays open after a reload.
    await reloadList(page, SONGS.length);
    await expect(shownSet(page)).toHaveText(`${name} (3)`);
    await openSetlists(page);
    await expect(setlistRow(page, `${name} (3)`)).toContainText('Viking');
  });

  test('R48: + adds a song to the set from Find mode and ✓ removes it', async ({ page }) => {
    const { songIds, venueIds } = await start(page);
    await expect(page.getByRole('button', { name: / to the set$/ })).toHaveCount(4); // Overall has a set too (R56)
    expect(await readStore(page, 'setlists')).toEqual([]); // saved only once a song goes in

    await venueSelect(page).selectOption({ label: 'Viking' });
    await expect(shownSet(page)).toHaveText('Viking');
    const [{ id: setId }] = await setlistsNamed(page, 'Viking');
    const stored = async () => (await readStore(page, 'setlists')).find((s) => s.id === setId).songIds;

    await expect(toggle(page, 'Valerie')).toHaveText('+');
    await expect(toggle(page, 'Valerie')).toHaveAccessibleName('Add Valerie to the set');
    await expectTapTarget(toggle(page, 'Valerie'));
    await expectAllTapTargets(page, 'Find at a venue');

    await toggle(page, 'Valerie').click();
    await expect(toggle(page, 'Valerie')).toHaveText('✓');
    await expect(toggle(page, 'Valerie')).toHaveAccessibleName('Remove Valerie from the set');
    await expect(toggle(page, 'Valerie')).toHaveClass(/in-set/);
    await expect(tab(page, 'List')).toHaveText('List (1)');
    await toggle(page, 'Dancing Queen').click();
    await expect(tab(page, 'List')).toHaveText('List (2)');
    await expect.poll(stored).toEqual([songIds.Valerie, songIds['Dancing Queen']]);

    // Still in Find, with the search: songs go to the end of the set.
    await expect(tab(page, 'Find')).toHaveAttribute('aria-selected', 'true');
    await search(page).fill('brightside');
    await toggle(page, 'Mr. Brightside').click();
    await expect(tab(page, 'List')).toHaveText('List (3)');
    await search(page).fill('');
    await expect(toggle(page, 'Valerie')).toHaveText('✓');
    await expect(toggle(page, 'Africa')).toHaveText('+');
    await expect.poll(stored).toEqual([songIds.Valerie, songIds['Dancing Queen'], songIds['Mr. Brightside']]);

    // ✓ takes it out again; the others keep their order.
    await toggle(page, 'Valerie').click();
    await expect(toggle(page, 'Valerie')).toHaveText('+');
    await expect(tab(page, 'List')).toHaveText('List (2)');
    await expect.poll(stored).toEqual([songIds['Dancing Queen'], songIds['Mr. Brightside']]);

    // The row itself still opens the song, and Back returns to the same venue, set and mode.
    await openSong(page, 'Dancing Queen');
    await page.getByRole('button', { name: 'Back to list' }).click();
    await expect(venueSelect(page)).toHaveValue(String(venueIds.Viking));
    await expect(shownSet(page)).toHaveText('Viking');
    await expect(tab(page, 'Find')).toHaveAttribute('aria-selected', 'true');
    await expect(toggle(page, 'Dancing Queen')).toHaveText('✓');

    await showMode(page, 'List');
    await expect(setTitles(page)).toHaveText(['Dancing Queen', 'Mr. Brightside']);
  });

  test('R48: Add a song sits at the bottom and a search with no match offers to add it', async ({ page }) => {
    const { songs } = bigLibrary(205, 0);
    await start(page, { songs: [...songs, { ...VALERIE, status: 'retired' }] });
    const more = page.getByRole('button', { name: /^Show \d+ more$/ });
    const addSummary = page.getByText('Add a song', { exact: true });

    // Under the list and under "Show more".
    await expect(more).toHaveText('Show 6 more');
    const lastRow = await page.locator('li.song-item').last().boundingBox();
    const moreBox = await more.boundingBox();
    const addBox = await addSummary.boundingBox();
    expect(moreBox.y).toBeGreaterThan(lastRow.y);
    expect(addBox.y).toBeGreaterThan(moreBox.y + moreBox.height - 1);
    const form = await openAddForm(page);
    await expect(form).toBeVisible();
    await addSummary.click(); // closes it again

    // A search that matches nothing offers to add it, title filled in.
    await search(page).fill('  Sharp Dressed Man ');
    await expect(page.getByText('0 of 206 songs')).toBeVisible();
    await expect(page.getByText('No match for “Sharp Dressed Man”.')).toBeVisible();
    const offer = button(page, 'Add “Sharp Dressed Man”');
    await expectTapTarget(offer);
    await offer.click();
    await expect(form).toBeVisible();
    await expect(form.getByLabel('Title')).toHaveValue('Sharp Dressed Man');
    await expect(form.getByLabel('Artist')).toBeFocused();
    await form.getByLabel('Artist').fill('ZZ Top');
    await form.getByRole('button', { name: 'Add song' }).click();
    await expect(page.getByText('207 of 207 songs')).toBeVisible();
    await search(page).fill('sharp');
    await expect(songRow(page, 'Sharp Dressed Man')).toContainText('ZZ Top');

    // A search that matches a song the filters hide does not offer to add it again.
    await search(page).fill('valerie');
    await expect(page.getByText('1 of 207 songs')).toBeVisible();
    await openFilters(page);
    await choose(page, 'Status', 'Go-to');
    await expect(page.getByText('0 of 207 songs')).toBeVisible();
    await expect(page.getByText('No songs match the search and filters.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Add “/ })).toHaveCount(0);
  });

  test('R49: Sang it logs a sing today and removes the song from the set', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (dialog) => { dialogs.push(dialog.message()); dialog.dismiss(); });
    const { today, songIds, venueIds } = await start(page, {
      sings: [{ title: 'Valerie', venue: 'Viking', date: '2026-10-01' }, { title: 'Dancing Queen', venue: 'The Crown', date: '2026-10-02' }],
      setlists: [{ name: 'Friday', venue: 'Viking', titles: ['Valerie', 'Dancing Queen', 'Mr. Brightside'] }],
      venue: 'Viking',
    });
    const viking = venueIds.Viking;
    await expect(shownSet(page)).toHaveText('Friday');
    await expect(tab(page, 'List')).toHaveText('List (3)');

    await showMode(page, 'List');
    await expect(search(page)).toHaveCount(0);
    await expect(setTitles(page)).toHaveText(['Valerie', 'Dancing Queen', 'Mr. Brightside']);
    await expect(setRow(page, 'Valerie').locator('.flag')).toHaveText('Sung here · last 2026-10-01');
    await expect(setRow(page, 'Dancing Queen').locator('.flag')).toHaveCount(0); // sung, but elsewhere
    await expect(setRow(page, 'Valerie')).toContainText('Amy Winehouse');
    for (const name of ['Move Dancing Queen up', 'Move Dancing Queen down', 'Sang Dancing Queen', 'Dancing Queen next time']) {
      await expectTapTarget(button(page, name));
    }
    await expectAllTapTargets(page, 'List mode');

    await button(page, 'Sang Dancing Queen').click();
    await expect(statusLine(page)).toHaveText('Sang “Dancing Queen”. Undo is under Sung.');
    await expect(setTitles(page)).toHaveText(['Valerie', 'Mr. Brightside']);
    await expect(tab(page, 'List')).toHaveText('List (2)');
    await expect.poll(async () => (await readStore(page, 'sings')).length).toBe(3);
    expect((await readStore(page, 'sings')).at(-1))
      .toEqual({ id: expect.any(Number), songId: songIds['Dancing Queen'], venueId: viking, date: today });
    expect((await setlistsNamed(page, 'Friday'))[0].songIds).toEqual([songIds.Valerie, songIds['Mr. Brightside']]);

    // A sung song can be sung again later: Valerie gets a second sing today.
    await button(page, 'Sang Valerie').click();
    await expect(statusLine(page)).toHaveText('Sang “Valerie”. Undo is under Sung.');
    await expect(setTitles(page)).toHaveText(['Mr. Brightside']);
    expect(dialogs).toEqual([]);

    // Find shows the new sings at this venue, and the songs are no longer in the set.
    await showMode(page, 'Find');
    await expect(statusLine(page)).toBeHidden();
    await expect(sungLine(page, 'Dancing Queen')).toHaveText(`Sung 1 time · last ${today}`);
    await expect(sungLine(page, 'Valerie')).toHaveText(`Sung 2 times · last ${today}`);
    await expect(toggle(page, 'Dancing Queen')).toHaveText('+');
    await expect(toggle(page, 'Mr. Brightside')).toHaveText('✓');

    // So does the venue's history.
    await openVenues(page);
    await openVenue(page, 'Viking');
    await expect(historyRow(page, 'Dancing Queen')).toContainText(`Last sung ${today}`);
  });

  test('R49: Next time moves the song to the venue\'s Next time list, which can be renamed', async ({ page }) => {
    const { songIds, venueIds } = await start(page, {
      setlists: [
        { name: 'Friday', venue: 'Viking', titles: ['Valerie', 'Dancing Queen', 'Mr. Brightside', 'Africa'] },
        { name: 'Next time', venue: 'The Crown' }, // another venue's list with the name already
      ],
      venue: 'Viking',
    });
    const viking = venueIds.Viking;
    await showMode(page, 'List');

    await button(page, 'Valerie next time').click();
    await expect(statusLine(page)).toHaveText('Moved “Valerie” to Next time.');
    await expect(setTitles(page)).toHaveText(['Dancing Queen', 'Mr. Brightside', 'Africa']);
    await expect(tab(page, 'List')).toHaveText('List (3)');
    // Setlist names are unique, so this venue's list is "Next time (2)".
    const [next] = await setlistsNamed(page, 'Next time (2)');
    expect(next).toEqual({ id: expect.any(Number), name: 'Next time (2)', venueId: viking, songIds: [songIds.Valerie] });
    expect(await metaValue(page, `nextTimeSetlist:${viking}`)).toBe(next.id);
    await expect(shownSet(page)).toHaveText('Friday');
    await expect(setSelect(page).locator('option'))
      .toHaveText(['Friday', 'Next time (2)', 'Next time · The Crown', 'New list for tonight…']);

    await button(page, 'Mr. Brightside next time').click();
    await expect(statusLine(page)).toHaveText('Moved “Mr. Brightside” to Next time.');
    await expect.poll(async () => (await setlistsNamed(page, 'Next time (2)'))[0].songIds)
      .toEqual([songIds.Valerie, songIds['Mr. Brightside']]);
    expect(await readStore(page, 'setlists')).toHaveLength(3);
    expect((await setlistsNamed(page, 'Friday'))[0].songIds).toEqual([songIds['Dancing Queen'], songIds.Africa]);

    // Renamed on the Setlists tab, it keeps the role. The setlist screen has no Tonight mode now.
    await openSetlists(page);
    const form = await editSetlist(page, 'Next time (2)');
    await form.getByLabel('Setlist name').fill('Maybe later');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(setlistRow(page, 'Maybe later')).toBeVisible();
    await openSetlist(page, 'Maybe later');
    await expect(page.getByRole('button', { name: 'Tonight' })).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);

    await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Songs' }).click();
    await expect(tab(page, 'List')).toHaveAttribute('aria-selected', 'true'); // the mode is kept while the app is open
    await button(page, 'Dancing Queen next time').click();
    await expect(statusLine(page)).toHaveText('Moved “Dancing Queen” to Next time.');
    await expect.poll(async () => (await setlistsNamed(page, 'Maybe later'))[0].songIds)
      .toEqual([songIds.Valerie, songIds['Mr. Brightside'], songIds['Dancing Queen']]);
    expect(await readStore(page, 'setlists')).toHaveLength(3);

    // Opened, the Next time list has no Next time buttons: a song never moves onto its own list.
    await setSelect(page).selectOption({ label: 'Maybe later' });
    await expect(setTitles(page)).toHaveText(['Valerie', 'Mr. Brightside', 'Dancing Queen']);
    await expect(page.getByRole('button', { name: / next time$/ })).toHaveCount(0);
    await expect(button(page, 'Sang Valerie')).toBeVisible();

    // Deleted, it is made again the next time it is needed.
    await openSetlists(page);
    page.once('dialog', (dialog) => dialog.accept());
    await setlistRow(page, 'Maybe later').getByRole('button', { name: 'Delete Maybe later' }).click();
    await expect(setlistRow(page, 'Maybe later')).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Songs' }).click();
    await expect(shownSet(page)).toHaveText('Friday');
    await button(page, 'Africa next time').click();
    await expect(statusLine(page)).toHaveText('Moved “Africa” to Next time.');
    const [again] = await setlistsNamed(page, 'Next time (2)');
    expect(again).toMatchObject({ venueId: viking, songIds: [songIds.Africa] });
    expect(await metaValue(page, `nextTimeSetlist:${viking}`)).toBe(again.id);
  });

  test('R49: moves songs up and down in List mode', async ({ page }) => {
    const { songIds } = await start(page, {
      setlists: [{ name: 'Friday', venue: 'Viking', titles: ['Valerie', 'Dancing Queen', 'Mr. Brightside'] }],
      venue: 'Viking',
    });
    const stored = async () => (await setlistsNamed(page, 'Friday'))[0].songIds;
    await showMode(page, 'List');
    await expect(button(page, 'Move Valerie up')).toBeDisabled();
    await expect(button(page, 'Move Mr. Brightside down')).toBeDisabled();
    await expect(button(page, 'Move Valerie')).toHaveCount(0); // no drag handle here

    await button(page, 'Move Mr. Brightside up').click();
    await expect(setTitles(page)).toHaveText(['Valerie', 'Mr. Brightside', 'Dancing Queen']);
    await button(page, 'Move Valerie down').click();
    await expect(setTitles(page)).toHaveText(['Mr. Brightside', 'Valerie', 'Dancing Queen']);
    await expect(button(page, 'Move Mr. Brightside up')).toBeDisabled();
    await expect(button(page, 'Move Dancing Queen down')).toBeDisabled();
    await expect.poll(stored).toEqual([songIds['Mr. Brightside'], songIds.Valerie, songIds['Dancing Queen']]);

    // Modes are not screens: a song opened from List comes back to List, and
    // the switches between modes left no history behind.
    await showMode(page, 'Sung');
    await showMode(page, 'Find');
    await showMode(page, 'List');
    // Tapping the song in List shows it to the KJ (R54); back returns to List.
    await setRow(page, 'Valerie').locator('.night-open').click();
    await expect(page.getByRole('dialog', { name: 'Show to the KJ' })).toContainText('Valerie');
    await page.goBack();
    await expect(tab(page, 'List')).toHaveAttribute('aria-selected', 'true');
    await expect(setTitles(page)).toHaveText(['Mr. Brightside', 'Valerie', 'Dancing Queen']);
    await page.goBack();
    expect(page.url()).toBe('about:blank');

    // A fresh load starts in Find; the order was saved.
    await page.goto('./');
    await expect(page.getByText('4 of 4 songs')).toBeVisible();
    await expect(tab(page, 'Find')).toHaveAttribute('aria-selected', 'true');
    await showMode(page, 'List');
    await expect(setTitles(page)).toHaveText(['Mr. Brightside', 'Valerie', 'Dancing Queen']);

    // An empty set says how to fill it.
    await setSelect(page).selectOption({ label: 'New list for tonight…' });
    await expect(tab(page, 'List')).toHaveText('List (0)');
    await expect(page.getByText('Nothing in this set yet. Find songs and tap + to add them.')).toBeVisible();
    await expectTapTarget(button(page, 'Find songs'));
    await button(page, 'Find songs').click();
    await expect(tab(page, 'Find')).toHaveAttribute('aria-selected', 'true');
    await expect(search(page)).toBeVisible();
  });

  test('R50: Sung mode lists sings newest first by date and Undo puts the song back on top', async ({ page }) => {
    const { today, songIds, venueIds } = await start(page, {
      venues: ['Viking', 'The Crown', 'Anchor'],
      sings: (t) => [
        { title: 'Valerie', venue: 'Viking', date: '2026-10-01' },
        { title: 'Dancing Queen', venue: 'Viking', date: '2026-10-24' },
        { title: 'Mr. Brightside', venue: 'Viking', date: t },
        { title: 'Africa', venue: 'Viking', date: t }, // logged after Mr. Brightside
        { title: 'Valerie', venue: 'The Crown', date: t }, // another venue
      ],
      setlists: [{ name: 'Friday', venue: 'Viking', titles: ['Dancing Queen'] }],
      venue: 'Viking',
    });
    const viking = venueIds.Viking;
    await showMode(page, 'Sung');
    await expect(page.getByRole('region').locator('h3')).toHaveText(['Today', '2026-10-24', '2026-10-01']);
    await expect(day(page, 'Today').locator('.title')).toHaveText(['Africa', 'Mr. Brightside']);
    await expect(day(page, 'Today')).toContainText('The Killers');
    await expect(day(page, '2026-10-24').locator('.title')).toHaveText(['Dancing Queen']);
    await expect(day(page, '2026-10-01').locator('.title')).toHaveText(['Valerie']);
    // Undo only for today's.
    await expect(page.getByRole('button', { name: /^Undo / })).toHaveCount(2);
    await expect(day(page, '2026-10-24').getByRole('button', { name: /^Undo / })).toHaveCount(0);
    await expectTapTarget(button(page, 'Undo Mr. Brightside'));
    await expectAllTapTargets(page, 'Sung mode');

    await button(page, 'Undo Mr. Brightside').click();
    await expect(statusLine(page)).toHaveText('Put “Mr. Brightside” back at the top of the set.');
    await expect(day(page, 'Today').locator('.title')).toHaveText(['Africa']);
    await expect(tab(page, 'List')).toHaveText('List (2)');
    await expect.poll(async () => (await readStore(page, 'sings')).length).toBe(4);
    expect((await readStore(page, 'sings')).some((s) => s.songId === songIds['Mr. Brightside'])).toBe(false);
    expect((await setlistsNamed(page, 'Friday'))[0].songIds).toEqual([songIds['Mr. Brightside'], songIds['Dancing Queen']]);

    await showMode(page, 'List');
    await expect(setTitles(page)).toHaveText(['Mr. Brightside', 'Dancing Queen']);

    // Sang it and Undo round trip: the song comes back on top.
    await button(page, 'Sang Dancing Queen').click();
    await showMode(page, 'Sung');
    await expect(day(page, 'Today').locator('.title')).toHaveText(['Dancing Queen', 'Africa']);
    await expect(day(page, '2026-10-24').locator('.title')).toHaveText(['Dancing Queen']);
    await button(page, 'Undo Dancing Queen').click();
    await expect(day(page, 'Today').locator('.title')).toHaveText(['Africa']);
    await showMode(page, 'List');
    await expect(setTitles(page)).toHaveText(['Dancing Queen', 'Mr. Brightside']);
    const left = await readStore(page, 'sings');
    expect(left.filter((s) => s.venueId === viking).map((s) => s.date).sort()).toEqual(['2026-10-01', '2026-10-24', today]);

    // A venue with no sings says so.
    await showMode(page, 'Sung');
    await venueSelect(page).selectOption({ label: 'Anchor' });
    await expect(tab(page, 'Sung')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Nothing sung here yet.')).toBeVisible();
  });

  // "R47: Overall has no set and List and Sung are disabled" was here until R56
  // gave Overall a set; see "R56: under Overall a list can be built and
  // ordered but not sung" in setlist-labels.spec.js.
});
