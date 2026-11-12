// Steps for the Find e2e tests (Wave 2 D). openApp, putRecords and readStore live in helpers.js.
import { expect } from '@playwright/test';
import { makeSong } from '../../js/lib/song.js';
import { putRecords, readStore } from './helpers.js';

// Reloads and waits for the Songs list to show all `total` songs.
export async function reloadList(page, total) {
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Songs' })).toBeVisible();
  await expect(page.getByText(`${total} of ${total} songs`)).toBeVisible();
}

// Writes songs (partial fields, completed by makeSong), venues (names) and
// sings ({ title, venue, date }), then reloads so the list picks them up.
// Resolves with ids by title and by venue name.
export async function seed(page, { songs = [], venues = [], sings = [] }) {
  const songIdList = songs.length ? await putRecords(page, 'songs', songs.map((fields) => makeSong(fields))) : [];
  const venueIdList = venues.length ? await putRecords(page, 'venues', venues.map((name) => ({ name }))) : [];
  const songIds = Object.fromEntries(songs.map((s, i) => [s.title, songIdList[i]]));
  const venueIds = Object.fromEntries(venues.map((name, i) => [name, venueIdList[i]]));
  if (sings.length) {
    await putRecords(page, 'sings', sings.map(({ title, venue, date }) => ({
      songId: songIds[title], venueId: venueIds[venue], date,
    })));
  }
  await reloadList(page, songs.length);
  return { songIds, venueIds };
}

export function venueSelect(page) {
  return page.getByLabel('Venue', { exact: true });
}

// Waits until the venue choice is saved, so a reload sees it.
export async function expectRememberedVenue(page, venueId) {
  await expect.poll(async () => {
    const record = (await readStore(page, 'meta')).find((r) => r.key === 'findVenueId');
    return record ? record.value : undefined;
  }).toBe(venueId);
}

export function filtersForm(page) {
  return page.getByRole('form', { name: 'Filters' });
}

export function filtersSummary(page) {
  return page.locator('details.find-filters > summary');
}

// Opens the collapsed Filters card.
export async function openFilters(page) {
  if (!(await filtersForm(page).isVisible())) await filtersSummary(page).click();
  await expect(filtersForm(page)).toBeVisible();
}

// A menu in the Filters card, by its label: Sung, Since, Tag, Status, Rating, Genre, Decade, Sort by.
export function filter(page, label) {
  return filtersForm(page).getByLabel(label, { exact: true });
}

export async function choose(page, label, option) {
  await filter(page, label).selectOption({ label: option });
}

// The titles in the list, in order.
export function shownTitles(page) {
  return page.locator('li.song-item .title');
}

export function songRow(page, title) {
  return page.locator('li.song-item').filter({ has: page.locator('.title').getByText(title, { exact: true }) });
}

// A row's "Sung N times · last D" / "Never sung here" line.
export function sungLine(page, title) {
  return songRow(page, title).locator('.sung');
}

export async function expectTapTarget(locator) {
  const box = await locator.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
}

// ---------- A big library (R34, Wave 3 F) ----------

const WORDS_A = ['Midnight', 'Summer', 'Electric', 'Broken', 'Golden', 'Wild', 'Lonely', 'Crazy', 'Sweet', 'Dancing',
  'Burning', 'Silver', 'Endless', 'Secret', 'Neon', 'Velvet', 'Purple', 'Little', 'Brand New', 'Lucky'];
const WORDS_B = ['Heart', 'Love', 'Train', 'City', 'Dreams', 'Rain', 'Fire', 'Night', 'Road', 'Kiss', 'Sky', 'Radio',
  'Girl', 'Boy', 'Highway', 'Moon', 'Lights', 'Ocean', 'Thunder', 'Memory', 'Paradise', 'Angel', 'Shadow', 'River', 'Song'];
const FIRST_NAMES = ['Amy', 'Bruno', 'Cher', 'Dolly', 'Elton', 'Freddie', 'Gloria', 'Harry', 'Iggy', 'Janis', 'Kylie',
  'Lionel', 'Madonna', 'Nina', 'Ozzy'];
const LAST_NAMES = ['Stone', 'Rivers', 'Knight', 'Bell', 'Fox', 'Gray', 'Hart', 'King'];
const GENRES = ['Pop', 'Rock', 'Soul', 'Country', 'Disco', 'R&B', 'Indie', 'Metal', 'Jazz', ''];
const TAGS = ['duet', 'slow', 'crowd-pleaser', 'high', 'low', 'rap', 'party'];
const STATUSES = ['go-to', 'go-to', 'want-to-try', 'go-to', 'retired'];

// `n` varied songs (fields for makeSong) and sings ({ index, date }, `index`
// into the songs) at one venue, the same every run. Titles, artists, genres,
// years, tags, ratings, statuses and dates added all vary; some songs have no
// genre, year or rating. The sings fall on the first 40% of the songs, some
// of them twice.
export function bigLibrary(n = 1000, singCount = 500) {
  const day = 24 * 60 * 60 * 1000;
  const start = Date.UTC(2024, 0, 1);
  const songs = Array.from({ length: n }, (_, i) => ({
    title: `${WORDS_A[i % 20]} ${WORDS_B[Math.floor(i / 20) % 25]}${i >= 500 ? ' Again' : ''}`,
    artist: `${FIRST_NAMES[i % 15]} ${LAST_NAMES[(i * 7) % 8]}`,
    genre: GENRES[i % 10],
    year: i % 13 === 0 ? null : 1960 + ((i * 37) % 65),
    tags: i % 3 === 0 ? [TAGS[i % 7], TAGS[(i + 3) % 7]] : [TAGS[i % 7]],
    rating: i % 6 === 0 ? null : (i % 5) + 1,
    status: STATUSES[i % 5],
    createdAt: new Date(start + i * 7 * 60 * 60 * 1000).toISOString(),
  }));
  const sings = Array.from({ length: singCount }, (_, k) => ({
    index: (k * 13) % Math.ceil(n * 0.4),
    date: new Date(start + (k * 3) * day).toISOString().slice(0, 10),
  }));
  return { songs, sings };
}

// Writes bigLibrary() straight into IndexedDB (each store in one transaction),
// with every sing at one venue, "The Crown". Does not reload. Resolves with
// the song fields and the venue's id.
export async function seedBigLibrary(page, n = 1000, singCount = 500) {
  const { songs, sings } = bigLibrary(n, singCount);
  const songIds = await putRecords(page, 'songs', songs.map((fields) => makeSong(fields)));
  const [venueId] = await putRecords(page, 'venues', [{ name: 'The Crown' }]);
  await putRecords(page, 'sings', sings.map(({ index, date }) => ({ songId: songIds[index], venueId, date })));
  return { songs, venueId };
}

// ---------- Songs tab polish (R35, R9, R13, Wave 4 I) ----------

// Opens the "Add a song" card and resolves with its form.
export async function openAddForm(page) {
  const form = page.getByRole('form', { name: 'Add a song' });
  if (!(await form.isVisible())) await page.getByText('Add a song', { exact: true }).click();
  await expect(form).toBeVisible();
  return form;
}

// A recording as the MusicBrainz search answers it, trimmed to what the app reads.
export function mbRecording(title, artist) {
  return {
    id: `test-${title}-${artist}`,
    score: 100,
    title,
    'artist-credit': [{ name: artist, joinphrase: '', artist: { id: `test-${artist}`, name: artist } }],
  };
}

// Answers every request to musicbrainz.org in the test, so no test reaches the
// real site. `answer(url)` gives { status, json } or { abort: true }; the
// default is a search with no recordings. Call before openApp(); the route
// stays through reloads. Resolves with a live list of the requests made,
// each { url, accept }.
export async function mockMusicBrainz(page, answer = () => ({ json: { recordings: [] } })) {
  const requests = [];
  await page.route('https://musicbrainz.org/**', async (route) => {
    const request = route.request();
    const headers = await request.allHeaders();
    requests.push({ url: request.url(), accept: headers.accept });
    const { status = 200, json = {}, abort = false } = await answer(new URL(request.url()));
    if (abort) {
      await route.abort('internetdisconnected');
      return;
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: typeof json === 'string' ? json : JSON.stringify(json),
    });
  });
  return requests;
}

// The suggestion list under the Add form's Title field.
export function suggestionList(page) {
  return page.getByRole('form', { name: 'Add a song' }).getByRole('list', { name: 'Suggestions from MusicBrainz' });
}

// The Settings switch for R35.
export function suggestionsSwitch(page) {
  return page.getByRole('checkbox', {
    name: 'Suggest titles and artists from MusicBrainz while typing (sends what you type to musicbrainz.org)',
  });
}
