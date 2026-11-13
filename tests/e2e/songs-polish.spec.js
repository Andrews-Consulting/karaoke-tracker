// Songs tab polish (Wave 4 I): title and artist suggestions from MusicBrainz
// (R35), a warning when adding a song already in the library (R9) and "Pick
// for me" (R13). Every test answers MusicBrainz itself (mockMusicBrainz), so
// none reaches the real site.
import { test, expect } from '@playwright/test';
import { openApp, expectTab } from './helpers.js';
import {
  seed, openFilters, choose, filter, shownTitles, expectTapTarget,
  openAddForm, mbRecording, mockMusicBrainz, suggestionList, suggestionsSwitch,
} from './helpers-find.js';

// A service worker would sit between the page and page.route(), so the
// MusicBrainz requests could go unseen. Nothing here needs it.
test.use({ serviceWorkers: 'block' });

const VALERIE = { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006 };
const QUEEN = { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976 };
const BRIGHTSIDE = { title: 'Mr. Brightside', artist: 'The Killers', genre: 'Rock', year: 2004 };
const AFRICA = { title: 'Africa', artist: 'Toto', genre: 'Rock', year: 1982 };

// Long enough for the 400 ms wait after typing and a request to be made, if one would be.
const QUIET_MS = 1200;

const search = (page) => page.getByRole('searchbox', { name: 'Search songs' });

async function showTab(page, name) {
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name }).click();
  await expectTab(page, name);
}

async function backToList(page) {
  await page.getByRole('button', { name: 'Back to list' }).click();
  await expect(search(page)).toBeVisible();
}

test.describe('Online suggestions', () => {
  test('R35: suggests titles and artists from MusicBrainz and fills the form on tap', async ({ page }) => {
    const requests = await mockMusicBrainz(page, () => ({
      json: {
        created: '2026-11-12T10:00:00.000Z',
        count: 4,
        offset: 0,
        recordings: [
          mbRecording('Valerie', 'Amy Winehouse'),
          mbRecording('VALERIE', 'amy winehouse'), // the same, ignoring case: shown once
          mbRecording('Valerie', 'The Zutons'),
          { id: 'no-artist', title: 'Valerie (no artist)' }, // missing credit: skipped
        ],
      },
    }));
    await openApp(page);
    const form = await openAddForm(page);
    const title = form.getByLabel('Title');

    // Two characters are not enough to look up.
    await title.pressSequentially('Va', { delay: 40 });
    await page.waitForTimeout(QUIET_MS);
    expect(requests).toHaveLength(0);

    // Typing on waits for a pause, then asks once.
    await title.pressSequentially('lerie', { delay: 40 });
    const buttons = suggestionList(page).getByRole('button');
    await expect(buttons).toHaveText(['Valerie — Amy Winehouse', 'Valerie — The Zutons']);
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.origin + url.pathname).toBe('https://musicbrainz.org/ws/2/recording');
    expect(url.searchParams.get('fmt')).toBe('json');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('query')).toBe('recording:"Valerie"');
    expect(requests[0].accept).toBe('application/json');
    for (const button of await buttons.all()) await expectTapTarget(button);

    // Emptying the title clears them.
    await title.fill('');
    await expect(suggestionList(page)).toBeHidden();

    // With an artist typed, the search includes it.
    await form.getByLabel('Artist').fill('The "Zutons"');
    await title.fill('Valerie');
    await expect(buttons).toHaveCount(2);
    expect(requests).toHaveLength(2);
    expect(new URL(requests[1].url).searchParams.get('query')).toBe('recording:"Valerie" AND artist:"The \\"Zutons\\""');

    // Tapping one fills title and artist and clears the list.
    await form.getByRole('button', { name: 'Use Valerie by The Zutons' }).click();
    await expect(title).toHaveValue('Valerie');
    await expect(form.getByLabel('Artist')).toHaveValue('The Zutons');
    await expect(suggestionList(page)).toBeHidden();
    await page.waitForTimeout(QUIET_MS);
    expect(requests).toHaveLength(2); // filling the form is not typing

    await form.getByRole('button', { name: 'Add song' }).click();
    await expect(page.getByText('1 of 1 songs')).toBeVisible();
    await expect(page.locator('li.song-item').filter({ hasText: 'The Zutons' })).toBeVisible();

    // Submitting clears the suggestions, and a lookup still waiting is dropped.
    const again = await openAddForm(page);
    await again.getByLabel('Artist').fill('Amy Winehouse');
    await again.getByLabel('Title').fill('Back to Black');
    await expect(buttons).toHaveCount(2);
    await again.getByLabel('Title').fill('Rehab');
    await again.getByLabel('Title').press('Enter');
    await expect(page.getByText('2 of 2 songs')).toBeVisible();
    await expect(suggestionList(page)).toBeHidden();
    await page.waitForTimeout(QUIET_MS);
    expect(requests).toHaveLength(3);
  });

  test('R35: makes no request when online suggestions are off', async ({ page }) => {
    const requests = await mockMusicBrainz(page, () => ({ json: { recordings: [mbRecording('Valerie', 'Amy Winehouse')] } }));
    await openApp(page);

    // On by default; the owner turns it off and the choice survives a reload.
    await showTab(page, 'Settings');
    await expect(page.getByText('Online suggestions', { exact: true })).toBeVisible();
    await expect(suggestionsSwitch(page)).toBeChecked();
    await expectTapTarget(suggestionsSwitch(page));
    expect((await suggestionsSwitch(page).boundingBox()).width).toBeGreaterThanOrEqual(44);
    await suggestionsSwitch(page).uncheck();
    expect(await page.evaluate(() => localStorage.getItem('musicbrainz'))).toBe('off');
    await page.reload();
    await showTab(page, 'Settings');
    await expect(suggestionsSwitch(page)).not.toBeChecked();

    await showTab(page, 'Songs');
    const form = await openAddForm(page);
    await form.getByLabel('Title').pressSequentially('Valerie', { delay: 40 });
    await form.getByLabel('Artist').pressSequentially('Amy', { delay: 40 });
    await page.waitForTimeout(QUIET_MS);
    expect(requests).toHaveLength(0);
    await expect(suggestionList(page)).toBeHidden();

    // Turned back on, typing asks again.
    await showTab(page, 'Settings');
    await suggestionsSwitch(page).check();
    expect(await page.evaluate(() => localStorage.getItem('musicbrainz'))).toBe('on');
    await showTab(page, 'Songs');
    const form2 = await openAddForm(page);
    await form2.getByLabel('Title').pressSequentially('Valerie', { delay: 40 });
    await expect(suggestionList(page).getByRole('button')).toHaveText(['Valerie — Amy Winehouse']);
    expect(requests).toHaveLength(1);
  });

  test('R35: shows nothing when MusicBrainz fails', async ({ page }) => {
    const failures = [
      { status: 503, json: { error: 'Service unavailable' } },
      { status: 200, json: '<html>not JSON</html>' },
      { abort: true }, // no connection
    ];
    const requests = await mockMusicBrainz(page, () => failures[Math.min(requests.length - 1, failures.length - 1)]);
    await openApp(page);

    const pageErrors = [];
    const loudLogs = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      // The browser's own note about a failed load is not the app's logging.
      if (['error', 'warning'].includes(msg.type()) && !/Failed to load resource/.test(msg.text())) {
        loudLogs.push(msg.text());
      }
    });

    const form = await openAddForm(page);
    const title = form.getByLabel('Title');
    for (const [i, typed] of ['Valerie', 'Rehab', 'Back to Black'].entries()) {
      await title.fill(typed);
      await expect.poll(() => requests.length).toBe(i + 1);
      await page.waitForTimeout(300);
      await expect(suggestionList(page)).toBeHidden();
    }
    expect(pageErrors).toEqual([]);
    expect(loudLogs).toEqual([]);

    // The form works as before.
    await form.getByLabel('Artist').fill('Amy Winehouse');
    await form.getByRole('button', { name: 'Add song' }).click();
    await expect(page.getByText('1 of 1 songs')).toBeVisible();
  });
});

test.describe('Duplicates', () => {
  test('R9: warns when the song is already in the library and still allows adding', async ({ page }) => {
    await mockMusicBrainz(page);
    await openApp(page);
    await seed(page, { songs: [VALERIE, QUEEN] });

    const form = await openAddForm(page);
    const warning = form.getByRole('status');
    await form.getByLabel('Title').fill('  valerie ');
    await expect(warning).toHaveCount(0); // no artist yet
    await expect(form.getByRole('button', { name: 'Add song' })).toBeVisible();

    await form.getByLabel('Artist').fill('AMY WINEHOUSE');
    await expect(warning).toHaveText('Already in your library: “Valerie” by Amy Winehouse.');
    await expect(form.getByRole('button', { name: 'Add anyway' })).toBeVisible();
    await expect(form.getByRole('button', { name: 'Add song' })).toHaveCount(0);
    await expectTapTarget(form.getByRole('button', { name: 'Open it' }));
    await expectTapTarget(form.getByRole('button', { name: 'Add anyway' }));

    // Another artist is another song.
    await form.getByLabel('Artist').fill('The Zutons');
    await expect(warning).toHaveCount(0);
    await expect(form.getByRole('button', { name: 'Add song' })).toBeVisible();

    // Open it shows the song already there; Back returns to the list.
    await form.getByLabel('Artist').fill('Amy Winehouse');
    await form.getByRole('button', { name: 'Open it' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Valerie' })).toBeVisible();
    await expect(page.getByText('Amy Winehouse', { exact: true })).toBeVisible();
    await backToList(page);
    await expect(page.getByText('2 of 2 songs')).toBeVisible();

    // Add anyway adds a second entry.
    const again = await openAddForm(page);
    await again.getByLabel('Title').fill('Valerie');
    await again.getByLabel('Artist').fill('Amy Winehouse');
    await again.getByLabel('Genre').fill('Live');
    await again.getByRole('button', { name: 'Add anyway' }).click();
    await expect(page.getByText('3 of 3 songs')).toBeVisible();
    await expect(page.locator('li.song-item').filter({ hasText: 'Valerie' })).toHaveCount(2);
    const fresh = await openAddForm(page);
    await expect(fresh.getByRole('button', { name: 'Add song' })).toBeVisible();
    await expect(fresh.getByRole('status')).toHaveCount(0);
  });
});

test.describe('Pick for me', () => {
  test('R13: picks a random song from the current filter and opens it', async ({ page }) => {
    await mockMusicBrainz(page);
    await openApp(page);
    await seed(page, { songs: [VALERIE, QUEEN, BRIGHTSIDE, AFRICA] });
    const pick = page.getByRole('button', { name: 'Pick for me' });
    await expectTapTarget(pick);

    // A filter that leaves one song: that is the pick.
    await openFilters(page);
    await choose(page, 'Genre', 'Soul');
    await expect(page.getByText('1 of 4 songs')).toBeVisible();
    await pick.click();
    await expect(page.getByRole('heading', { level: 2, name: 'Valerie' })).toBeVisible();

    // Back returns to the same filtered list.
    await backToList(page);
    await expect(page.getByText('1 of 4 songs')).toBeVisible();
    await expect(filter(page, 'Genre')).toHaveValue('Soul');
    await expect(shownTitles(page)).toHaveText(['Valerie']);

    // With two shown, the pick is one of those two, chosen by Math.random.
    await choose(page, 'Genre', 'Rock');
    await expect(shownTitles(page)).toHaveText(['Africa', 'Mr. Brightside']);
    await page.evaluate(() => { Math.random = () => 0.99; });
    await pick.click();
    await expect(page.getByRole('heading', { level: 2, name: 'Mr. Brightside' })).toBeVisible();
    await backToList(page);
    await expect(page.getByText('2 of 4 songs')).toBeVisible();
    await page.evaluate(() => { Math.random = () => 0; });
    await pick.click();
    await expect(page.getByRole('heading', { level: 2, name: 'Africa' })).toBeVisible();
    await backToList(page);

    // The search narrows it too; nothing shown means nothing to pick.
    await search(page).fill('zzz');
    await expect(page.getByText('0 of 4 songs')).toBeVisible();
    await expect(pick).toBeDisabled();
    await expect(page.getByText('Nothing to pick from.')).toBeVisible();
    await search(page).fill('');
    await expect(pick).toBeEnabled();
    await expect(page.getByText('Nothing to pick from.')).toBeHidden();
  });
});
