// Screenshots of every screen, on a phone, for design review.
//
//   npm run screenshots                 # all devices and themes
//   DEVICE=iphone THEME=dark npm run screenshots
//
// Writes screenshots/<device>/<theme>/<nn>-<screen>.png. Starts its own copy
// of tools/serve.js on PORT (default 8004) so it never collides with a running
// server or test run. Each run starts from an empty database and seeds the
// same realistic library, so two runs can be compared image by image.
import { chromium, webkit, devices } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSong } from '../js/lib/song.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'screenshots');
const PORT = Number(process.env.PORT) || 8004;
const BASE = `http://localhost:${PORT}/`;

const DEVICES = {
  iphone: { browser: webkit, profile: devices['iPhone 14'] },
  pixel: { browser: chromium, profile: devices['Pixel 7'] },
};
const THEMES = ['dark', 'light'];

// ---------- Seed data ----------

const SONGS = [
  { title: 'Come and Get Your Love', artist: 'Redbone', genre: 'Funk', year: 1974, tags: ['crowd-pleaser'], rating: 4, status: 'go-to', notes: 'Starts cold. Hold the “hey” on the chorus.' },
  { title: 'Drive', artist: 'Incubus', genre: 'Rock', year: 1999, rating: 3, status: 'go-to', key: '-1' },
  { title: 'Brown Eyed Girl', artist: 'Van Morrison', genre: 'Rock', year: 1967, tags: ['crowd-pleaser', 'sing-along'], rating: 5, status: 'go-to' },
  { title: 'I Sang Dixie', artist: 'Dwight Yoakam', genre: 'Country', year: 1988, rating: 4, status: 'go-to', key: '-2' },
  { title: 'Beginnings', artist: 'Chicago', genre: 'Rock', year: 1969, status: 'want-to-try' },
  { title: 'Valerie', artist: 'Amy Winehouse', genre: 'Soul', year: 2006, tags: ['duet'], rating: 4, status: 'go-to', notes: 'Skip the bridge.' },
  { title: 'Dancing Queen', artist: 'ABBA', genre: 'Pop', year: 1976, tags: ['crowd-pleaser'], rating: 3, status: 'retired' },
  { title: 'Wichita Lineman', artist: 'Glen Campbell', genre: 'Country', year: 1968, rating: 5, status: 'go-to' },
  { title: 'Make It with You', artist: 'Bread', genre: 'Soft rock', year: 1970, status: 'want-to-try' },
  { title: 'Never Gonna Give You Up', artist: 'Rick Astley', genre: 'Pop', year: 1987, key: '-1', rating: 2, status: 'go-to' },
  { title: 'Evil Ways', artist: 'Santana', genre: 'Latin rock', year: 1969, rating: 3, status: 'go-to' },
  { title: 'Cherokee Fiddle', artist: 'Johnny Lee', genre: 'Country', year: 1980, status: 'want-to-try' },
];
const VENUES = ['Viking', 'The Crown'];
const SINGS = [
  ['Come and Get Your Love', 'Viking', '2026-10-03'], ['Come and Get Your Love', 'Viking', '2026-10-24'],
  ['Drive', 'Viking', '2026-10-24'], ['Brown Eyed Girl', 'Viking', '2026-09-12'], ['I Sang Dixie', 'Viking', '2026-10-24'],
  ['Valerie', 'The Crown', '2026-11-01'], ['Wichita Lineman', 'Viking', '2026-08-30'], ['Dancing Queen', 'The Crown', '2026-11-01'],
];
const SETLISTS = [
  { name: 'Friday at Viking', venue: 'Viking', songs: ['Brown Eyed Girl', 'Drive', 'Valerie', 'Evil Ways', 'Cherokee Fiddle'] },
  { name: 'Slow ones', venue: null, songs: ['Make It with You', 'Wichita Lineman'] },
];

async function seed(page) {
  const songIds = await put(page, 'songs', SONGS.map((s) => makeSong(s, new Date('2026-09-01T18:00:00Z'))));
  const venueIds = await put(page, 'venues', VENUES.map((name) => ({ name })));
  const song = Object.fromEntries(SONGS.map((s, i) => [s.title, songIds[i]]));
  const venue = Object.fromEntries(VENUES.map((n, i) => [n, venueIds[i]]));
  await put(page, 'sings', SINGS.map(([t, v, date]) => ({ songId: song[t], venueId: venue[v], date })));
  const setlistIds = await put(page, 'setlists', SETLISTS.map((s) => ({ name: s.name, venueId: s.venue ? venue[s.venue] : null, songIds: s.songs.map((t) => song[t]) })));
  // Open at Viking with "Friday at Viking" as the set, and one sing logged today for Sung mode.
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  await put(page, 'sings', [{ songId: song['I Sang Dixie'], venueId: venue.Viking, date: today }]);
  await put(page, 'meta', [
    { key: 'findVenueId', value: venue.Viking },
    { key: `currentSetlist:${venue.Viking}`, value: setlistIds[0] },
    { key: 'lastBackupAt', value: d.toISOString() }, // no reminder banner over the screens
  ]);
}

function put(page, store, records) {
  return page.evaluate(async ({ store, records }) => {
    const conn = await new Promise((resolve, reject) => {
      const req = indexedDB.open('mic-jaunt');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = conn.transaction(store, 'readwrite');
        const reqs = records.map((r) => tx.objectStore(store).put(r));
        tx.oncomplete = () => resolve(reqs.map((r) => r.result));
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      conn.close();
    }
  }, { store, records });
}

// ---------- Screens ----------

const tab = (page, name) => page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name }).click();
const heading = (page, name, level) => page.getByRole('heading', { name, level, exact: true }).waitFor();

// Each entry: a name and the steps that get the screen on the page.
const SCREENS = [
  ['songs', async (page) => { await heading(page, 'Songs', 1); await page.getByText(/of \d+ songs/).waitFor(); }],
  ['songs-filters', async (page) => {
    await page.locator('details.find-filters > summary').click();
    await page.getByRole('form', { name: 'Filters' }).getByLabel('Sung', { exact: true }).selectOption('never');
  }],
  ['songs-add', async (page) => {
    await page.locator('details.find-filters > summary').click();
    await page.getByText('Add a song', { exact: true }).click();
    await page.getByRole('form', { name: 'Add a song' }).getByLabel('Title').fill('Sweet Caroline');
  }],
  ['list-mode', async (page) => {
    await page.reload(); // drops the "never sung" filter and closes the Add form
    await page.getByText(/of \d+ songs/).waitFor();
    await page.getByRole('tab', { name: /^List/ }).click();
    await page.getByRole('button', { name: /^Sang / }).first().waitFor();
  }],
  ['sung-mode', async (page) => {
    await page.getByRole('tab', { name: 'Sung' }).click();
    await page.getByRole('button', { name: /^Undo / }).first().waitFor();
  }],
  ['song', async (page) => {
    await page.reload(); // back to Find mode
    await page.getByText(/of \d+ songs/).waitFor();
    await page.getByRole('listitem').filter({ hasText: 'Come and Get Your Love' }).locator('button.song-row').click();
    await heading(page, 'Come and Get Your Love', 2);
  }],
  ['song-edit', async (page) => { await page.getByRole('button', { name: 'Edit' }).click(); await page.getByRole('button', { name: 'Save' }).waitFor(); }],
  ['venues', async (page) => { await tab(page, 'Venues'); await page.getByRole('form', { name: 'Add a venue' }).waitFor(); }],
  ['venue', async (page) => {
    await page.getByRole('button', { name: 'Open Viking', exact: true }).click();
    await heading(page, 'Viking', 2);
    for (const s of await page.locator('.history details > summary').all()) await s.click();
  }],
  ['venue-log', async (page) => {
    await page.getByRole('searchbox', { name: 'Find a song to log' }).fill('bro');
  }],
  ['overall', async (page) => {
    await page.getByRole('button', { name: '‹ All venues' }).click();
    await page.getByRole('button', { name: 'Open overall stats' }).click();
    await heading(page, 'Overall', 2);
  }],
  ['setlists', async (page) => { await tab(page, 'Setlists'); await page.getByRole('form', { name: 'New setlist' }).waitFor(); }],
  ['setlist', async (page) => {
    await page.getByRole('button', { name: 'Open Friday at Viking', exact: true }).click();
    await heading(page, 'Friday at Viking', 2);
    await page.locator('details.mix > summary').click();
  }],
  ['settings', async (page) => { await tab(page, 'Settings'); await heading(page, 'Settings', 1); }],
];

async function shoot(deviceKey, theme) {
  const { browser: type, profile } = DEVICES[deviceKey];
  const browser = await type.launch();
  const context = await browser.newContext({ ...profile, baseURL: BASE, colorScheme: 'dark' });
  const page = await context.newPage();
  await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch { /* ignore */ } }, theme);

  const dir = path.join(OUT, deviceKey, theme);
  await mkdir(dir, { recursive: true });

  await page.goto('./');
  await page.getByText(/of \d+ songs/).waitFor();
  await seed(page);
  await page.reload();

  let n = 0;
  for (const [name, steps] of SCREENS) {
    await steps(page);
    await page.waitForTimeout(150); // let focus rings and transitions settle
    n += 1;
    const file = path.join(dir, `${String(n).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file });
    console.log(path.relative(ROOT, file));
  }
  await browser.close();
}

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.js')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
  });
  try {
    await waitForServer();
    const wantedDevices = process.env.DEVICE ? [process.env.DEVICE] : Object.keys(DEVICES);
    const wantedThemes = process.env.THEME ? [process.env.THEME] : THEMES;
    for (const device of wantedDevices) {
      if (!DEVICES[device]) throw new Error(`Unknown DEVICE "${device}"; use ${Object.keys(DEVICES).join(' or ')}`);
      await rm(path.join(OUT, device), { recursive: true, force: true });
      for (const theme of wantedThemes) await shoot(device, theme);
    }
  } finally {
    server.kill();
  }
}

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server on ${BASE} did not start`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
