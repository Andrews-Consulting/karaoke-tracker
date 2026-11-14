// The KaraFun catalog (R66) and the KaraFun flag on songs (R68). Pure: no DOM,
// no IndexedDB. js/karafun.js stores what this returns.
//
//   const { records, skipped } = parseCatalog(await file.text());
//   const changed = matchSongs(songs, catalogIndex(records));
//
// or, a chunk at a time so the page can repaint in between:
//
//   const reader = catalogReader(text);         // checks the header
//   while (!reader.done) store(reader.next(2500));
//
// KaraFun's file is semicolon-separated UTF-8 with a header row:
//   Id;Title;Artist;Year;Duo;Explicit;"Date Added";Styles;Languages
// Fields holding spaces or commas are quoted. Duo and Explicit are 0 or 1;
// Styles and Languages are comma lists. Columns are found by name, so a
// reordered or extended file still loads; Id, Title and Artist are required.

import { csvRows, CsvError } from './csv.js';
import { songKey, normalizeYear, normalizeKarafunId } from './song.js';
import { isISODate } from './stats.js';

// Where the owner downloads the file. The app never fetches it (see docs/REQUIREMENTS.md).
export const KARAFUN_LIST_URL = 'https://www.karafun.com/karaoke-song-list.html';

export const CATALOG_HEADER_LINE = 'Id;Title;Artist;Year;Duo;Explicit;"Date Added";Styles;Languages';

export const NOT_CATALOG_MESSAGE = `This is not the KaraFun catalog CSV. Its first line should be ${CATALOG_HEADER_LINE}.`;
export const NO_SONGS_MESSAGE = 'The file has the KaraFun header but no songs.';

const COLUMNS = {
  id: 'id', title: 'title', artist: 'artist', year: 'year', duet: 'duo', explicit: 'explicit',
  added: 'date added', styles: 'styles', languages: 'languages',
};

const cell = (cells, index) => (index === -1 || cells[index] === undefined ? '' : cells[index].trim());
const isYes = (text) => text === '1' || /^(true|yes)$/i.test(text);
const list = (text) => (text ? text.split(',').map((item) => item.trim()).filter(Boolean) : []);

// 'YYYY-MM-DD', also from a date with a time after it; '' when missing or not a real day.
function addedDate(text) {
  const day = text.slice(0, 10);
  return isISODate(day) && (text.length === 10 || /^[ T]/.test(text.slice(10))) ? day : '';
}

// Lines that are not empty, a quick estimate of the rows in a file for the
// progress count (a line break inside a quoted value would add one).
export function countLines(text) {
  const src = String(text ?? '');
  const breaks = src.includes('\n') ? '\n' : '\r';
  let lines = 0;
  let from = 0;
  while (from < src.length) {
    let end = src.indexOf(breaks, from);
    if (end === -1) end = src.length;
    const length = end - from - (end > from && src.charCodeAt(end - 1) === 13 ? 1 : 0); // less a CR before LF
    if (length > 0) lines += 1;
    from = end + 1;
  }
  return lines;
}

// Reads the catalog from the file's text a chunk at a time. Checks the header
// straight away and throws CsvError for an empty file or one that is not the
// catalog, before the caller has touched anything. Then next(n) returns up to
// n more records, in file order:
//   { id, title, artist, year, duet, explicit, added, styles[], languages[], key }
// (the `catalog` store's shape, see js/db.js), and [] once `done`. Rows without
// a positive whole Id or a title, and repeats of an Id already read, are left
// out and counted in `skipped`. `read` counts the rows read so far, kept or
// skipped, and `estimate` is about how many there are, for a progress count.
export function catalogReader(text) {
  const rows = csvRows(text, { delimiter: ';' });
  const first = rows.next();
  if (first.done) throw new CsvError('The file is empty.');

  const header = first.value.map((name) => name.trim().toLowerCase());
  const col = {};
  for (const [field, name] of Object.entries(COLUMNS)) col[field] = header.indexOf(name);
  if (col.id === -1 || col.title === -1 || col.artist === -1) throw new CsvError(NOT_CATALOG_MESSAGE);

  const seen = new Set();
  const reader = {
    estimate: Math.max(countLines(text) - 1, 0),
    read: 0,
    skipped: 0,
    done: false,
    next(limit = Infinity) {
      const records = [];
      while (!reader.done && records.length < limit) {
        const step = rows.next();
        if (step.done) {
          reader.done = true;
          break;
        }
        reader.read += 1;
        const cells = step.value;
        const id = normalizeKarafunId(cell(cells, col.id));
        const title = cell(cells, col.title);
        if (id === null || !title || seen.has(id)) {
          reader.skipped += 1;
          continue;
        }
        seen.add(id);
        const artist = cell(cells, col.artist);
        records.push({
          id,
          title,
          artist,
          year: normalizeYear(cell(cells, col.year)),
          duet: isYes(cell(cells, col.duet)),
          explicit: isYes(cell(cells, col.explicit)),
          added: addedDate(cell(cells, col.added)),
          styles: list(cell(cells, col.styles)),
          languages: list(cell(cells, col.languages)),
          key: songKey({ title, artist }),
        });
      }
      return records;
    },
  };
  return reader;
}

// The whole catalog at once: { records, skipped }, as catalogReader() reads
// it. Also throws CsvError when no row is usable, so nothing is replaced by
// mistake.
export function parseCatalog(text) {
  const reader = catalogReader(text);
  const records = reader.next();
  if (records.length === 0) throw new CsvError(NO_SONGS_MESSAGE);
  return { records, skipped: reader.skipped };
}

// ---------- Matching my songs (R68) ----------

// songKey -> the catalog ids with that title and artist, ignoring case. KaraFun
// lists some songs more than once (another version, a duet), hence arrays.
// Pass `index` to add a further chunk of records to it.
export function catalogIndex(records, index = new Map()) {
  for (const { id, key } of records) {
    const ids = index.get(key);
    if (ids) ids.push(id);
    else index.set(key, [id]);
  }
  return index;
}

// The catalog id a song should carry: its current one while that is still a
// match (so a version picked from the catalog is kept), else the lowest
// matching id, or null when KaraFun does not have the song. `index` maps
// songKey to an id or an array of ids.
export function catalogIdFor(song, index) {
  const found = index.get(songKey(song));
  if (found === undefined) return null;
  const ids = Array.isArray(found) ? found : [found];
  if (ids.length === 0) return null;
  const current = normalizeKarafunId(song.karafunId);
  return ids.includes(current) ? current : Math.min(...ids);
}

// The songs whose karafunId must change, as copies with the new value: the
// matched id, or null for a song that had one and no longer matches. Songs
// that stay as they are are left out, so only real changes are written.
export function matchSongs(songs, index) {
  const changed = [];
  for (const song of songs) {
    const next = catalogIdFor(song, index);
    if (next !== (song.karafunId ?? null)) changed.push({ ...song, karafunId: next });
  }
  return changed;
}

// ---------- Wording ----------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 101234 -> '101,234'.
export function formatCount(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const songs = (n) => `${formatCount(n)} ${n === 1 ? 'song' : 'songs'}`;

// The status line in Settings: 'Loaded 14 Nov 2026 · 101,234 songs' (local day),
// or 'No catalog loaded'. `count` is the store's real count, so a restored
// backup that carries the meta but no rows reads as not loaded. Rows without a
// load time are a load that stopped part-way (the app was closed during it).
export function catalogStatusText({ count = 0, loadedAt = null } = {}) {
  if (!count) return 'No catalog loaded';
  const when = new Date(loadedAt ?? NaN);
  if (Number.isNaN(when.getTime())) return `The last load did not finish (${songs(count)} stored). Load the file again.`;
  return `Loaded ${when.getDate()} ${MONTHS[when.getMonth()]} ${when.getFullYear()} · ${songs(count)}`;
}

// While storing: 'Loading… 40,000 of 101,234'.
export function loadProgressText(done, total) {
  return `Loading… ${formatCount(done)} of ${formatCount(total)}`;
}

// The result of a load: 'Loaded 101,234 songs from KaraFun; 312 of your 480
// songs are in it; 3 rows skipped.'
export function loadResultMessage({ count, skipped = 0, songs: mine = 0, matched = 0 }) {
  let text = `Loaded ${songs(count)} from KaraFun`;
  if (mine === 1) text += matched ? '; your 1 song is in it' : '; your 1 song is not in it';
  else if (mine > 1) text += `; ${formatCount(matched)} of your ${songs(mine)} ${matched === 1 ? 'is' : 'are'} in it`;
  if (skipped) text += `; ${formatCount(skipped)} ${skipped === 1 ? 'row' : 'rows'} skipped`;
  return `${text}.`;
}
