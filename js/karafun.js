// The KaraFun catalog on this device (R66) and the KaraFun flag on songs (R68).
// The parsing and matching are in js/lib/karafun.js; this stores the result.
//
// Meta keys: 'karafunCount' (rows stored) and 'karafunLoadedAt' (ISO time of
// the last load or replace). The Find view (R67) treats a non-empty catalog
// store as "a catalog is loaded" and a new karafunLoadedAt as its cue to read
// the catalog again, so karafunLoadedAt is written last, after the rows and
// the song flags. A load deletes both keys as it clears the old rows, so rows
// without a karafunLoadedAt are a load that has not finished (or never will:
// the app was closed part-way), and Settings says so.
import { db, request, CATALOG_STORE } from './db.js';
import { CsvError } from './lib/csv.js';
import {
  catalogReader, catalogIndex, matchSongs, catalogIdFor, NO_SONGS_MESSAGE,
} from './lib/karafun.js';

export const KARAFUN_LOADED_KEY = 'karafunLoadedAt';
export const KARAFUN_COUNT_KEY = 'karafunCount';

// Rows parsed and stored per transaction. Each batch is its own short
// transaction with a pause after it, so the page repaints and the Songs tab
// can still read songs and meta while a 100,000-row catalog loads.
const BATCH_SIZE = 2500;

const nextTask = () => new Promise((resolve) => { setTimeout(resolve, 0); });

// Reads the KaraFun CSV `file` and replaces the catalog with it, then sets or
// clears the KaraFun flag on every song. Calls onProgress(done, total) as rows
// are read and stored (total is the file's line count, an estimate). Resolves
// with { count, skipped, songs, matched } for loadResultMessage().
//
// The wrong file, or one with no usable rows, throws CsvError before anything
// is touched. A failure after the old rows are cleared (a full disk, say)
// removes the part loaded and throws an error with `catalogRemoved` set.
export async function loadCatalog(file, onProgress = () => {}, now = new Date()) {
  const text = await file.text(); // read before any transaction (see js/db.js)
  const reader = catalogReader(text); // checks the header
  let batch = reader.next(BATCH_SIZE);
  if (batch.length === 0) throw new CsvError(NO_SONGS_MESSAGE);
  const total = reader.estimate;
  onProgress(0, total);

  await db.transaction([CATALOG_STORE, 'meta'], 'readwrite', async (stores) => {
    stores.meta.delete(KARAFUN_LOADED_KEY);
    stores.meta.delete(KARAFUN_COUNT_KEY);
    await request(stores[CATALOG_STORE].clear());
  });

  try {
    const index = new Map();
    let count = 0;
    while (batch.length) {
      const rows = batch;
      await db.transaction(CATALOG_STORE, 'readwrite', async (stores) => {
        for (const record of rows) stores[CATALOG_STORE].put(record);
      });
      catalogIndex(rows, index);
      count += rows.length;
      onProgress(Math.min(reader.read, total), total);
      await nextTask();
      batch = reader.next(BATCH_SIZE);
    }

    return await db.transaction(['songs', 'meta'], 'readwrite', async (stores) => {
      const songs = await request(stores.songs.getAll());
      for (const song of matchSongs(songs, index)) stores.songs.put(song);
      const matched = songs.filter((song) => catalogIdFor(song, index) !== null).length;
      stores.meta.put({ key: KARAFUN_COUNT_KEY, value: count });
      await request(stores.meta.put({ key: KARAFUN_LOADED_KEY, value: now.toISOString() }));
      return { count, skipped: reader.skipped, songs: songs.length, matched };
    });
  } catch (err) {
    await removeCatalog().catch(() => {}); // leave no half-loaded catalog behind
    const failure = err instanceof Error || err instanceof DOMException ? err : new Error(String(err));
    failure.catalogRemoved = true;
    throw failure;
  }
}

// Empties the catalog and forgets when it was loaded. Song flags stay (R68):
// they still say what KaraFun had, and the next load re-checks them.
export function removeCatalog() {
  return db.transaction([CATALOG_STORE, 'meta'], 'readwrite', async (stores) => {
    stores[CATALOG_STORE].clear();
    stores.meta.delete(KARAFUN_COUNT_KEY);
    await request(stores.meta.delete(KARAFUN_LOADED_KEY));
  });
}

// { count, loadedAt } for the Settings status line. count is the store's real
// row count, and loadedAt is null without rows, so a backup restored on a new
// phone (which carries the meta but never the catalog) reads as not loaded.
// Rows with a null loadedAt are a load under way or one that stopped part-way.
export function catalogStatus() {
  return db.transaction([CATALOG_STORE, 'meta'], 'readonly', async (stores) => {
    const count = await request(stores[CATALOG_STORE].count());
    const record = await request(stores.meta.get(KARAFUN_LOADED_KEY));
    return { count, loadedAt: count && record ? record.value : null };
  });
}
