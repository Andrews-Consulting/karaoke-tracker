// A night out on Tonight (Design B): the venue and the set open there in the
// header (R47); + from the Songs scope or the Tonight field (R48); Up next
// with Sang it, and the rest of the set with Park, Remove and Details (R49);
// the Sung strip and what was sung here by date, with Undo for today (R50);
// and Sang it showing the next song to the KJ in one tap (R74).
import { test, expect } from '@playwright/test';
import { openApp, openSong, putRecords, readStore, openScope, expectTab, scopeBar } from './helpers.js';
import {
  seed, reloadList, bigLibrary, venueSelect, songRow, sungLine, openFilters, choose, openAddForm, chooseVenue,
  findContext, shownVenue,
} from './helpers-find.js';
import { openSetlists, setlistRow, editSetlist, openSetlist, pageToday } from './helpers-setlists.js';
import { openVenue, historyRow } from './helpers-venues.js';
import { deleteOpenList, historyDate } from './helpers-lists.js';
import { tonightListName } from '../../js/lib/night.js';

const VALERIE = { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 };
const QUEEN = { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 };
const BRIGHTSIDE = { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 };
const AFRICA = { title: 'Africa', artist: 'Toto', genre: 'Rock', year: 1982 };
const SONGS = [VALERIE, QUEEN, BRIGHTSIDE, AFRICA];

const search = (page) => page.getByRole('searchbox', { name: 'Search songs' });
const field = (page) => page.getByRole('searchbox', { name: 'Add a song to tonight\'s set' });
const setSelect = (page) => page.getByLabel('Set', { exact: true });
const upNext = (page) => page.locator('.up-next');
const afterList = (page) => page.getByRole('list', { name: 'The rest of tonight\'s set' });
const afterTitles = (page) => afterList(page).locator('li[data-song-id] .title');
const afterRow = (page, title) => afterList(page).locator('li[data-song-id]')
  .filter({ has: page.locator('.title').getByText(title, { exact: true }) });
const matches = (page) => page.getByRole('region', { name: 'Add to tonight' });
const matchRow = (page, title) => matches(page).locator('li.match')
  .filter({ has: page.locator('.title', { hasText: new RegExp(`^${title}$`) }) });
const toggle = (page, title) => songRow(page, title).locator('.set-toggle');
const statusLine = (page) => page.locator('.tonight-status');
const button = (page, name) => page.getByRole('button', { name, exact: true });
const sungStrip = (page) => page.locator('.sung-strip');
const kjView = (page) => page.getByRole('region', { name: 'For the KJ' });
const emptySet = (page) => page.getByText('Nothing in tonight\'s set yet. Type a song below, or open Lists.');
const day = (page, label) => page.getByRole('region', { name: label, exact: true });

// Opens the app, stores songs, venues, sings ({ title, venue, date }),
// setlists ({ name, venue, titles }) and the remembered venue, and reloads so
// the app starts from them, on the Songs scope. Sings and setlists can be
// functions of today's date ('YYYY-MM-DD' in the page) that give them.
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

// Tonight's set as shown: the Up next card's song, then the rest in order.
async function expectSet(page, titles) {
  if (!titles.length) {
    await expect(upNext(page)).toHaveCount(0);
    await expect(afterList(page)).toBeHidden();
    return;
  }
  await expect(upNext(page).locator('.up-title')).toHaveText(titles[0]);
  if (titles.length > 1) await expect(afterTitles(page)).toHaveText(titles.slice(1));
  else await expect(afterList(page)).toBeHidden();
}

// Opens a row's "…" and taps one of its actions: 'Park', 'Remove' or 'Details'.
async function rowAction(page, title, action) {
  const more = button(page, `More for ${title}`);
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  const names = { Park: `Park ${title} for next time`, Remove: `Remove ${title} from tonight`, Details: `Details for ${title}` };
  await button(page, names[action]).click();
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
    // No list for any venue here: Viking would open that rather than make its own (R56).
    const { venueIds } = await start(page, {
      setlists: [
        { name: 'Crown Friday', venue: 'The Crown' },
        { name: 'Another', venue: 'The Crown' },
      ],
    });
    const viking = venueIds.Viking;
    const crown = venueIds['The Crown'];
    await openScope(page, 'Tonight');
    // Overall opens the first list of all when none is for any venue (R56).
    await expect(shownVenue(page)).toHaveText('Overall');
    await expect(shownSet(page)).toHaveText('Another · The Crown');
    await expect(page.locator('.set-menu .menu-text')).toHaveText('Another');

    // The venue with the date under it at the left, the Set menu at the right, above the set.
    const venueBox = await venueSelect(page).boundingBox();
    const setBox = await setSelect(page).boundingBox();
    expect(venueBox.x).toBeLessThan(setBox.x);
    expect(venueBox.y).toBeLessThan(setBox.y + setBox.height);
    await expect(page.locator('.tonight-date')).toHaveText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/);
    expect((await emptySet(page).boundingBox()).y).toBeGreaterThan(setBox.y);
    await expectTapTarget(venueSelect(page));
    await expectTapTarget(setSelect(page));

    // First visit to Viking: a list named after it is created and opened.
    await venueSelect(page).selectOption({ label: 'Viking' });
    await expect(shownSet(page)).toHaveText('Viking');
    await expect(shownVenue(page)).toHaveText('Viking');
    await expect(setSelect(page)).toBeEnabled();
    // Every list is offered (R56): this venue's first, then other venues' with their venue.
    await expect(setSelect(page).locator('option'))
      .toHaveText(['Viking', 'Another · The Crown', 'Crown Friday · The Crown', 'New list for tonight…']);
    await expect(emptySet(page)).toBeVisible();
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
    await page.reload();
    await expectTab(page, 'Tonight');
    await expect(venueSelect(page)).toHaveValue(String(crown));
    await expect(shownSet(page)).toHaveText('Crown Friday');
    expect(await readStore(page, 'setlists')).toHaveLength(3); // nothing created twice

    // The Songs scope works at the same venue and set.
    await openScope(page, 'Songs');
    await expect(findContext(page)).toHaveText('The Crown · Crown Friday · 0 songs');

    // A remembered set that was deleted gives way to the venue's first by name.
    await openSetlists(page);
    await openSetlist(page, 'Crown Friday');
    page.once('dialog', (dialog) => dialog.accept());
    await deleteOpenList(page, 'Crown Friday');
    await expect(setlistRow(page, 'Crown Friday')).toHaveCount(0);
    await openScope(page, 'Tonight');
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
    await openScope(page, 'Tonight');
    await expect(shownSet(page)).toHaveText('Viking');

    await setSelect(page).selectOption({ label: 'New list for tonight…' });
    await expect(shownSet(page)).toHaveText(`${name} (2)`);
    await expect(statusLine(page)).toHaveText(`Started “${name} (2)”.`);
    await expect(emptySet(page)).toBeVisible();
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
    await page.reload();
    await expectTab(page, 'Tonight');
    await expect(shownSet(page)).toHaveText(`${name} (3)`);
    await openSetlists(page);
    await expect(setlistRow(page, `${name} (3)`)).toContainText('Viking');
  });

  test('R48: + adds a song to tonight\'s set from the Songs scope or the Tonight field, and ✓ removes it', async ({ page }) => {
    const { songIds } = await start(page);
    await expect(page.getByRole('button', { name: / to the set$/ })).toHaveCount(4); // Overall has a set too (R56)
    expect(await readStore(page, 'setlists')).toEqual([]); // saved only once a song goes in

    await chooseVenue(page, 'Viking');
    await expect(findContext(page)).toHaveText('Viking · Viking · 0 songs');
    const [{ id: setId }] = await setlistsNamed(page, 'Viking');
    const stored = async () => (await readStore(page, 'setlists')).find((s) => s.id === setId).songIds;

    await expect(toggle(page, 'Valerie')).toHaveText('+');
    await expect(toggle(page, 'Valerie')).toHaveAccessibleName('Add Valerie to the set');
    await expectTapTarget(toggle(page, 'Valerie'));
    await expectAllTapTargets(page, 'Songs at a venue');

    await toggle(page, 'Valerie').click();
    await expect(toggle(page, 'Valerie')).toHaveText('✓');
    await expect(toggle(page, 'Valerie')).toHaveAccessibleName('Remove Valerie from the set');
    await expect(toggle(page, 'Valerie')).toHaveClass(/in-set/);
    await expect(findContext(page)).toHaveText('Viking · Viking · 1 song');
    await toggle(page, 'Dancing Queen').click();
    await expect(findContext(page)).toHaveText('Viking · Viking · 2 songs');
    await expect.poll(stored).toEqual([songIds.Valerie, songIds['Dancing Queen']]);

    // Still in Songs, with the search: songs go to the end of the set.
    await search(page).fill('brightside');
    await toggle(page, 'Mr. Brightside').click();
    await expect(findContext(page)).toHaveText('Viking · Viking · 3 songs');
    await search(page).fill('');
    await expect(toggle(page, 'Valerie')).toHaveText('✓');
    await expect(toggle(page, 'Africa')).toHaveText('+');
    await expect.poll(stored).toEqual([songIds.Valerie, songIds['Dancing Queen'], songIds['Mr. Brightside']]);

    // ✓ takes it out again; the others keep their order.
    await toggle(page, 'Valerie').click();
    await expect(toggle(page, 'Valerie')).toHaveText('+');
    await expect(findContext(page)).toHaveText('Viking · Viking · 2 songs');
    await expect.poll(stored).toEqual([songIds['Dancing Queen'], songIds['Mr. Brightside']]);

    // The row itself still opens the song, and Back returns to the same venue and set.
    await openSong(page, 'Dancing Queen');
    await page.getByRole('button', { name: 'Back to Songs' }).click();
    await expect(findContext(page)).toHaveText('Viking · Viking · 2 songs');
    await expect(toggle(page, 'Dancing Queen')).toHaveText('✓');

    // On Tonight the field lists matches, the typed part marked, each with + or ✓.
    await openScope(page, 'Tonight');
    await expectSet(page, ['Dancing Queen', 'Mr. Brightside']);
    await expect(matches(page)).toHaveCount(0);
    await field(page).fill('af');
    await expect(matches(page).locator('.cap')).toHaveText('Add to tonight · 1 match');
    await expect(upNext(page)).toHaveCount(0); // the matches take the card's place while typing
    await expect(matchRow(page, 'Africa').locator('.hit')).toHaveText('Af');
    await expect(matchRow(page, 'Africa')).toContainText('Toto');
    await expect(matchRow(page, 'Africa').locator('.here')).toHaveText('New here');
    await matchRow(page, 'Africa').getByRole('button', { name: 'Add Africa to the set' }).click();
    await expect(matchRow(page, 'Africa').getByRole('button', { name: 'Remove Africa from the set' })).toHaveText('✓');
    await expect(field(page)).toBeFocused(); // the keyboard stays up for the next one
    await expect(afterTitles(page)).toHaveText(['Mr. Brightside', 'Africa']); // the card is away while typing
    await expect.poll(stored).toEqual([songIds['Dancing Queen'], songIds['Mr. Brightside'], songIds.Africa]);
    await expectAllTapTargets(page, 'Tonight while typing');

    // The matches sit right above the field; ✓ takes a song out. Clearing the
    // field brings the Up next card back.
    expect((await matches(page).boundingBox()).y).toBeLessThan((await field(page).boundingBox()).y);
    await field(page).fill('queen');
    await matchRow(page, 'Dancing Queen').getByRole('button', { name: 'Remove Dancing Queen from the set' }).click();
    await expect(afterTitles(page)).toHaveText(['Africa']);
    await expect.poll(stored).toEqual([songIds['Mr. Brightside'], songIds.Africa]);

    // Clearing the field returns to the set.
    await button(page, 'Clear search').click();
    await expect(field(page)).toHaveValue('');
    await expect(matches(page)).toHaveCount(0);
    await expectSet(page, ['Mr. Brightside', 'Africa']);

    // Nothing of mine matches: the song can be added, on the Songs scope with the text.
    await field(page).fill('Sharp Dressed Man');
    await expect(matches(page).locator('.cap')).toHaveText('No songs match');
    await button(page, 'Add “Sharp Dressed Man” as a new song').click();
    await expectTab(page, 'Songs');
    await expect(search(page)).toHaveValue('Sharp Dressed Man');
    await expect(page.getByText('No match for “Sharp Dressed Man”.')).toBeVisible();
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
    const form = await openAddForm(page); // a sheet over the list
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: 'Cancel' }).click();
    await expect(more).toHaveText('Show 6 more');

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
    await openScope(page, 'Tonight');
    await expect(shownSet(page)).toHaveText('Friday');
    await expectSet(page, ['Valerie', 'Dancing Queen', 'Mr. Brightside']);

    // Up next: the first song, its sings here and the two buttons; the rest after it.
    await expect(upNext(page).locator('h2')).toHaveText('Up next · 01');
    await expect(upNext(page)).toContainText('Amy Winehouse');
    await expect(upNext(page).locator('.here')).toHaveText(/^Here 1× · last 1 Oct( 2026)?$/);
    await expect(afterRow(page, 'Dancing Queen').locator('.here')).toHaveText('New here'); // sung, but elsewhere
    await expect(afterList(page).locator('.pos')).toHaveText(['02', '03']);
    await expect(upNext(page).getByRole('button')).toHaveText(['Sang it', 'KJ']);
    await expectTapTarget(button(page, 'Sang it: Valerie'));
    await expectAllTapTargets(page, 'Tonight at a venue');
    await expect(page.getByRole('searchbox', { name: 'Search songs' })).toHaveCount(0);

    // One tap: logged, off the set, and the next song shows for the KJ (R74).
    await button(page, 'Sang it: Valerie').click();
    await expect(kjView(page).locator('.kj-title')).toHaveText('Dancing Queen');
    await expect.poll(async () => (await readStore(page, 'sings')).length).toBe(3);
    expect((await readStore(page, 'sings')).at(-1))
      .toEqual({ id: expect.any(Number), songId: songIds.Valerie, venueId: viking, date: today });
    expect((await setlistsNamed(page, 'Friday'))[0].songIds).toEqual([songIds['Dancing Queen'], songIds['Mr. Brightside']]);
    await button(page, 'Done').click();
    await expectSet(page, ['Dancing Queen', 'Mr. Brightside']);
    await expect(sungStrip(page)).toContainText('Valerie');

    // The last song: nothing left to show the KJ, so Tonight says what happened.
    await button(page, 'Sang it: Dancing Queen').click();
    await button(page, 'Done').click();
    await button(page, 'Sang it: Mr. Brightside').click();
    await expect(statusLine(page)).toHaveText('Logged “Mr. Brightside” at Viking. That was the last song in the set.');
    await expect(kjView(page)).toHaveCount(0);
    await expectSet(page, []);
    await expect(emptySet(page)).toBeVisible();
    await expect(sungStrip(page).locator('.sung-titles')).toHaveText('Valerie, Dancing Queen, Mr. Brightside');
    expect(dialogs).toEqual([]);

    // The Songs scope shows the new sings at this venue, and the songs are no longer in the set.
    await openScope(page, 'Songs');
    await expect(sungLine(page, 'Dancing Queen')).toHaveText('1× · tonight');
    await expect(sungLine(page, 'Valerie')).toHaveText('2× · tonight');
    await expect(toggle(page, 'Dancing Queen')).toHaveText('+');

    // So does the venue's history.
    await openVenue(page, 'Viking');
    await expect(historyRow(page, 'Dancing Queen')).toContainText(historyDate(today));
  });

  test('R49: Park moves the song to the venue\'s Next time list, which can be renamed', async ({ page }) => {
    const { songIds, venueIds } = await start(page, {
      setlists: [
        { name: 'Friday', venue: 'Viking', titles: ['Valerie', 'Dancing Queen', 'Mr. Brightside', 'Africa'] },
        { name: 'Next time', venue: 'The Crown' }, // another venue's list with the name already
      ],
      venue: 'Viking',
    });
    const viking = venueIds.Viking;
    await openScope(page, 'Tonight');

    // Park is in a row's "…", not on Up next: the KJ already has that song.
    await expect(upNext(page).getByRole('button', { name: /Park/ })).toHaveCount(0);
    await expect(button(page, 'More for Dancing Queen')).toHaveAttribute('aria-expanded', 'false');
    await button(page, 'More for Dancing Queen').click();
    await expect(button(page, 'More for Dancing Queen')).toHaveAttribute('aria-expanded', 'true');
    await expect(afterRow(page, 'Dancing Queen').locator('.after-actions').getByRole('button')).toHaveText(['Park', 'Remove', 'Details']);
    await expectAllTapTargets(page, 'A row\'s actions');
    await button(page, 'Park Dancing Queen for next time').click();
    await expect(statusLine(page)).toHaveText('Parked “Dancing Queen” for next time.');
    await expectSet(page, ['Valerie', 'Mr. Brightside', 'Africa']);
    // Setlist names are unique, so this venue's list is "Next time (2)".
    const [next] = await setlistsNamed(page, 'Next time (2)');
    expect(next).toEqual({ id: expect.any(Number), name: 'Next time (2)', venueId: viking, songIds: [songIds['Dancing Queen']] });
    expect(await metaValue(page, `nextTimeSetlist:${viking}`)).toBe(next.id);
    await expect(shownSet(page)).toHaveText('Friday');
    await expect(setSelect(page).locator('option'))
      .toHaveText(['Friday', 'Next time (2)', 'Next time · The Crown', 'New list for tonight…']);

    await rowAction(page, 'Mr. Brightside', 'Park');
    await expect(statusLine(page)).toHaveText('Parked “Mr. Brightside” for next time.');
    await expect.poll(async () => (await setlistsNamed(page, 'Next time (2)'))[0].songIds)
      .toEqual([songIds['Dancing Queen'], songIds['Mr. Brightside']]);
    expect(await readStore(page, 'setlists')).toHaveLength(3);
    expect((await setlistsNamed(page, 'Friday'))[0].songIds).toEqual([songIds.Valerie, songIds.Africa]);

    // Renamed in Lists, it keeps the role. The setlist screen has no Tonight mode.
    await openSetlists(page);
    const form = await editSetlist(page, 'Next time (2)');
    await form.getByLabel('Setlist name').fill('Maybe later');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Maybe later', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tonight', exact: true }).and(page.locator('main *'))).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);

    await openScope(page, 'Tonight');
    await rowAction(page, 'Africa', 'Park');
    await expect(statusLine(page)).toHaveText('Parked “Africa” for next time.');
    await expect.poll(async () => (await setlistsNamed(page, 'Maybe later'))[0].songIds)
      .toEqual([songIds['Dancing Queen'], songIds['Mr. Brightside'], songIds.Africa]);
    expect(await readStore(page, 'setlists')).toHaveLength(3);

    // Opened, the Next time list offers no Park: a song never moves onto its own list.
    await setSelect(page).selectOption({ label: 'Maybe later' });
    await expectSet(page, ['Dancing Queen', 'Mr. Brightside', 'Africa']);
    await button(page, 'More for Mr. Brightside').click();
    await expect(page.getByRole('button', { name: /^Park / })).toHaveCount(0);
    await expect(button(page, 'Remove Mr. Brightside from tonight')).toBeVisible();
    await expect(button(page, 'Sang it: Dancing Queen')).toBeVisible();

    // Deleted, it is made again the next time it is needed.
    await openSetlists(page);
    await openSetlist(page, 'Maybe later');
    page.once('dialog', (dialog) => dialog.accept());
    await deleteOpenList(page, 'Maybe later');
    await expect(setlistRow(page, 'Maybe later')).toHaveCount(0);
    await openScope(page, 'Tonight');
    await expect(shownSet(page)).toHaveText('Friday');
    await field(page).fill('africa');
    await matchRow(page, 'Africa').getByRole('button', { name: 'Add Africa to the set' }).click();
    await button(page, 'Clear search').click();
    await expectSet(page, ['Valerie', 'Africa']);
    await rowAction(page, 'Africa', 'Park');
    await expect(statusLine(page)).toHaveText('Parked “Africa” for next time.');
    const [again] = await setlistsNamed(page, 'Next time (2)');
    expect(again).toMatchObject({ venueId: viking, songIds: [songIds.Africa] });
    expect(await metaValue(page, `nextTimeSetlist:${viking}`)).toBe(again.id);
  });

  test('R49: tonight\'s set shows Up next and the rest in order, with Remove, Details and an empty state', async ({ page }) => {
    const { songIds } = await start(page, {
      setlists: [{ name: 'Friday', venue: 'Viking', titles: ['Valerie', 'Dancing Queen', 'Mr. Brightside'] }],
      venue: 'Viking',
    });
    const stored = async () => (await setlistsNamed(page, 'Friday'))[0].songIds;
    await openScope(page, 'Tonight');
    await expectSet(page, ['Valerie', 'Dancing Queen', 'Mr. Brightside']);
    await expect(page.locator('.after-head')).toHaveText('After that · 2');
    await expect(button(page, 'Move Dancing Queen')).toBeVisible(); // the drag handle (R61)

    // Remove takes a song off tonight's set, with no confirmation.
    await rowAction(page, 'Dancing Queen', 'Remove');
    await expect(statusLine(page)).toHaveText('Removed “Dancing Queen” from tonight\'s set.');
    await expectSet(page, ['Valerie', 'Mr. Brightside']);
    await expect.poll(stored).toEqual([songIds.Valerie, songIds['Mr. Brightside']]);

    // Details opens the song with the dock's field put away; Back returns to Tonight.
    await rowAction(page, 'Mr. Brightside', 'Details');
    await expect(page.getByRole('heading', { level: 2, name: 'Mr. Brightside' })).toBeVisible();
    await expect(field(page)).toBeHidden();
    await expect(scopeBar(page)).toBeVisible();
    await page.getByRole('button', { name: 'Back to Tonight' }).click();
    await expectSet(page, ['Valerie', 'Mr. Brightside']);
    await expect(field(page)).toBeVisible();

    // Tapping a row's song opens it too, and the back gesture returns.
    await afterRow(page, 'Mr. Brightside').locator('.after-open').click();
    await expect(page.getByRole('heading', { level: 2, name: 'Mr. Brightside' })).toBeVisible();
    await page.goBack();
    await expectSet(page, ['Valerie', 'Mr. Brightside']);
    // Tonight is the root: one more back leaves the app.
    await page.goBack();
    expect(page.url()).toBe('about:blank');

    // A fresh load starts on Tonight; the set was saved.
    await page.goto('./');
    await expectTab(page, 'Tonight');
    await expectSet(page, ['Valerie', 'Mr. Brightside']);

    // An empty set says how to fill it.
    await setSelect(page).selectOption({ label: 'New list for tonight…' });
    await expect(emptySet(page)).toBeVisible();
    await expectSet(page, []);
    await expectTapTarget(button(page, 'Open Lists'));
    await button(page, 'Open Lists').click();
    await expectTab(page, 'Lists');
  });

  test('R50: the Sung strip opens what was sung here by date, and Undo puts the song back on top', async ({ page }) => {
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
    await openScope(page, 'Tonight');

    // The strip: what was sung here today, in the order it was logged.
    await expect(sungStrip(page).locator('.cap')).toHaveText('Sung · 2');
    await expect(sungStrip(page).locator('.sung-titles')).toHaveText('Mr. Brightside, Africa');
    await expect(button(page, 'Undo last: Africa goes back to the top of the set')).toBeVisible();

    // Tapped, it lists every sing here by date, newest first, with Undo for today's.
    await page.getByRole('button', { name: /^Sung · 2/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Sung at Viking' })).toBeVisible();
    await expect(page.getByRole('region').locator('h3')).toHaveText(['Today', '2026-10-24', '2026-10-01']);
    await expect(day(page, 'Today').locator('.title')).toHaveText(['Africa', 'Mr. Brightside']);
    await expect(day(page, 'Today')).toContainText('The Killers');
    await expect(day(page, '2026-10-24').locator('.title')).toHaveText(['Dancing Queen']);
    await expect(day(page, '2026-10-01').locator('.title')).toHaveText(['Valerie']);
    await expect(page.getByRole('button', { name: /^Undo / })).toHaveCount(2);
    await expect(day(page, '2026-10-24').getByRole('button', { name: /^Undo / })).toHaveCount(0);
    await expectTapTarget(button(page, 'Undo Mr. Brightside'));
    await expectAllTapTargets(page, 'Sung here');

    await button(page, 'Undo Mr. Brightside').click();
    await expect(page.locator('.tonight-status')).toHaveText('Put “Mr. Brightside” back at the top of the set.');
    await expect(day(page, 'Today').locator('.title')).toHaveText(['Africa']);
    await expect.poll(async () => (await readStore(page, 'sings')).length).toBe(4);
    expect((await readStore(page, 'sings')).some((s) => s.songId === songIds['Mr. Brightside'])).toBe(false);
    expect((await setlistsNamed(page, 'Friday'))[0].songIds).toEqual([songIds['Mr. Brightside'], songIds['Dancing Queen']]);

    // Back on Tonight, the song is Up next again.
    await button(page, 'Back to Tonight').click();
    await expectSet(page, ['Mr. Brightside', 'Dancing Queen']);
    await expect(sungStrip(page).locator('.cap')).toHaveText('Sung · 1');

    // Undo last on the strip does the same for the last sing.
    await button(page, 'Undo last: Africa goes back to the top of the set').click();
    await expect(statusLine(page)).toHaveText('Put “Africa” back at the top of the set.');
    await expectSet(page, ['Africa', 'Mr. Brightside', 'Dancing Queen']);
    await expect(sungStrip(page)).toBeHidden(); // nothing sung here today now

    // Sang it and Undo last round trip: the song comes back on top.
    await button(page, 'Sang it: Africa').click();
    await button(page, 'Done').click();
    await expectSet(page, ['Mr. Brightside', 'Dancing Queen']);
    await button(page, 'Undo last: Africa goes back to the top of the set').click();
    await expectSet(page, ['Africa', 'Mr. Brightside', 'Dancing Queen']);
    const left = await readStore(page, 'sings');
    expect(left.filter((s) => s.venueId === viking).map((s) => s.date).sort()).toEqual(['2026-10-01', '2026-10-24']);
    expect(left.filter((s) => s.date === today)).toHaveLength(1); // The Crown's

    // Another venue's sings are its own.
    await venueSelect(page).selectOption({ label: 'The Crown' });
    await expect(sungStrip(page).locator('.sung-titles')).toHaveText('Valerie');
    await venueSelect(page).selectOption({ label: 'Anchor' });
    await expect(sungStrip(page)).toBeHidden();
  });

  test('R74: Sang it logs the song and shows the next song to the KJ in one tap, landscape shows only title, artist and key', async ({ page }) => {
    const { today, songIds, venueIds } = await start(page, {
      songs: [VALERIE, { ...QUEEN, key: '+1' }, { ...BRIGHTSIDE, key: '-2' }, AFRICA],
      setlists: [{ name: 'Friday', venue: 'The Crown', titles: ['Valerie', 'Dancing Queen', 'Mr. Brightside'] }],
      venue: 'The Crown',
    });
    await openScope(page, 'Tonight');
    await expectSet(page, ['Valerie', 'Dancing Queen', 'Mr. Brightside']);

    // One tap.
    await button(page, 'Sang it: Valerie').click();
    const view = kjView(page);
    await expect(view).toBeVisible();
    await expect(view.getByRole('status')).toHaveText('“Valerie” logged at The Crown');
    await expect(button(page, 'Undo: Valerie goes back to up next')).toBeVisible();
    await expect(view.locator('.kj-label')).toHaveText('Up next for the KJ');
    await expect(view.locator('.kj-title')).toHaveText('Dancing Queen');
    await expect(view.locator('.kj-artist')).toHaveText('ABBA');
    await expect(view.locator('.kj-key-big')).toHaveText('+1');
    await expect(view.locator('.kj-key-words')).toHaveText('one semitone up');
    await expect(scopeBar(page)).toBeHidden();
    await expect.poll(async () => readStore(page, 'sings'))
      .toEqual([{ id: expect.any(Number), songId: songIds.Valerie, venueId: venueIds['The Crown'], date: today }]);
    expect((await setlistsNamed(page, 'Friday'))[0].songIds).toEqual([songIds['Dancing Queen'], songIds['Mr. Brightside']]);
    await expectAllTapTargets(page, 'KJ view');

    // Landscape: only the title, artist and key, as large as fit.
    const size = (selector) => view.locator(selector).evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
    const portrait = page.viewportSize();
    const portraitKey = await size('.kj-key-big');
    await page.setViewportSize({ width: portrait.height, height: portrait.width });
    for (const part of ['.kj-title', '.kj-artist', '.kj-key-big']) await expect(view.locator(part)).toBeVisible();
    for (const part of ['.kj-logged', '.kj-label', '.kj-key-words']) await expect(view.locator(part)).toBeHidden();
    await expect(button(page, 'Done')).toBeHidden();
    expect(await size('.kj-title')).toBeGreaterThanOrEqual(36);
    expect(await size('.kj-artist')).toBeGreaterThanOrEqual(24);
    expect(await size('.kj-key-big')).toBeGreaterThanOrEqual(Math.min(portraitKey, 72));
    expect(await page.evaluate(() => {
      const main = document.querySelector('main');
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth
        && main.scrollHeight <= main.clientHeight + 1;
    })).toBe(true);

    // Turned back, the portrait view returns as it was.
    await page.setViewportSize(portrait);
    await expect(view.getByRole('status')).toBeVisible();
    await expect(button(page, 'Done')).toBeVisible();

    // Undo puts Valerie back on top and returns to Tonight.
    await button(page, 'Undo: Valerie goes back to up next').click();
    await expect(view).toHaveCount(0);
    await expect(statusLine(page)).toHaveText('Put “Valerie” back at the top of the set.');
    await expectSet(page, ['Valerie', 'Dancing Queen', 'Mr. Brightside']);
    await expect.poll(async () => readStore(page, 'sings')).toEqual([]);
    await expect(scopeBar(page)).toBeVisible();

    // Done, or the back gesture, leaves the next song Up next.
    await button(page, 'Sang it: Valerie').click();
    await expect(view.locator('.kj-title')).toHaveText('Dancing Queen');
    await page.goBack();
    await expect(view).toHaveCount(0);
    await expectSet(page, ['Dancing Queen', 'Mr. Brightside']);
    await expect(sungStrip(page).locator('.sung-titles')).toHaveText('Valerie');
    await button(page, 'Sang it: Dancing Queen').click();
    await expect(view.locator('.kj-title')).toHaveText('Mr. Brightside');
    await expect(view.locator('.kj-key-big')).toHaveText('−2');
    await expect(view.locator('.kj-key-words')).toHaveText('two semitones down');
    await button(page, 'Done').click();
    await expectSet(page, ['Mr. Brightside']);
    await expect(sungStrip(page).locator('.sung-titles')).toHaveText('Valerie, Dancing Queen');
  });

  // "R47: Overall has no set and List and Sung are disabled" was here until R56
  // gave Overall a set; see "R56: under Overall a list can be built and
  // ordered but not sung" in setlist-labels.spec.js.
});
