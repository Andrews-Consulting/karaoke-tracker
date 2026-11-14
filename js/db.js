// IndexedDB wrapper (R18). All data stays on this device.
//
// Stores (every record has exactly these fields; build songs with makeSong() in js/lib/song.js)
//   songs     { id, title, artist, genre, year, key, notes, rating, status, tags[], createdAt, karafunId }
//               genre/key/notes: '' when empty.  year: number or null.  rating: 1-5 or null.
//               status: 'go-to' | 'want-to-try' | 'retired' | '' (not set, R64).  createdAt: ISO timestamp.
//               karafunId: the song's id in the loaded KaraFun catalog, or null (R68).
//   venues    { id, name }                              name trimmed, non-empty
//   sings     { id, songId, venueId, date }             one row per time a song is sung (R8)
//               date is a local calendar day 'YYYY-MM-DD' (what the user picked, no time zone shifts)
//   setlists  { id, name, venueId|null, songIds[] }     venueId is a label (R56), null = any venue;
//               songIds in setlist order, no duplicates within one setlist
//   meta      { key, value }                            e.g. { key: 'lastBackupAt', value: ISO } (R25)
//   catalog   { id, title, artist, year, duet, explicit, added, styles[], languages[], key }
//               one row per song in the KaraFun catalog the owner loaded from its CSV (R66);
//               id is KaraFun's own number. key is songKey() of title and artist, for matching
//               the owner's songs (R68). year: number or null. duet/explicit: booleans.
//               added: 'YYYY-MM-DD'. Not part of a backup: it is reloaded from the file.
//
// Indexes: songs.artist, songs.genre, songs.year, sings.songId, sings.venueId,
// setlists.venueId (setlists for any venue have null venueId and so are not in it),
// catalog.key.
// At this app's scale (hundreds of songs, thousands of sings) reading a whole
// store with getAll() and working in memory is fine and keeps views simple. The
// catalog is the exception at about 100,000 rows: read it once and keep rows lean.
//
// Referential integrity is the caller's job: deleting a song must also delete its
// sings and remove it from every setlist; deleting a venue must deal with its sings
// and clear its label on setlists. Use db.transaction() so those writes land atomically.
//
// To change the schema: bump DB_VERSION and add a new `if (oldVersion < N)` block.
// Never edit an existing block, or installed copies will not be migrated.

const DB_NAME = 'mic-jaunt';
export const DB_VERSION = 2;

// The owner's data: what a backup holds (R20) and a restore replaces (R21).
export const STORES = ['songs', 'venues', 'sings', 'setlists', 'meta'];

// The loaded KaraFun catalog (R66) lives beside the owner's data, outside backups.
export const CATALOG_STORE = 'catalog';

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = req.result;
        const oldVersion = event.oldVersion;

        if (oldVersion < 1) {
          const songs = db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
          songs.createIndex('artist', 'artist');
          songs.createIndex('genre', 'genre');
          songs.createIndex('year', 'year');

          db.createObjectStore('venues', { keyPath: 'id', autoIncrement: true });

          const sings = db.createObjectStore('sings', { keyPath: 'id', autoIncrement: true });
          sings.createIndex('songId', 'songId');
          sings.createIndex('venueId', 'venueId');

          const setlists = db.createObjectStore('setlists', { keyPath: 'id', autoIncrement: true });
          setlists.createIndex('venueId', 'venueId');

          db.createObjectStore('meta', { keyPath: 'key' });
        }

        if (oldVersion < 2) {
          const catalog = db.createObjectStore('catalog', { keyPath: 'id' });
          catalog.createIndex('key', 'key');
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

// Wraps one IDBRequest in a promise.
export function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Runs `work` inside one transaction over `storeNames` (a string or an array)
// and resolves, after the transaction commits, with whatever `work` returned.
//
//   await db.transaction(['songs', 'sings'], 'readwrite', async (stores) => {
//     await request(stores.songs.delete(id));
//     for (const sing of await request(stores.sings.index('songId').getAll(id))) {
//       stores.sings.delete(sing.id);
//     }
//   });
//
// Only await IndexedDB requests (via request()) inside `work`. Awaiting anything
// else (a fetch, a timer, a file read) lets the transaction auto-commit first,
// and later requests throw TransactionInactiveError. Read files before calling.
async function transaction(storeNames, mode, work) {
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  const conn = await open();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(names, mode);
    const stores = Object.fromEntries(names.map((name) => [name, tx.objectStore(name)]));
    let result;
    let failed = false;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => { failed = true; reject(tx.error); };
    tx.onabort = () => { if (!failed) reject(tx.error || new Error('Transaction aborted')); };
    Promise.resolve()
      .then(() => work(stores, tx))
      .then((value) => { result = value; })
      .catch((err) => { failed = true; reject(err); try { tx.abort(); } catch { /* already done */ } });
  });
}

// Runs one request in its own transaction and resolves with its result.
function run(storeName, mode, makeRequest) {
  return transaction(storeName, mode, (stores) => request(makeRequest(stores[storeName])));
}

export const db = {
  transaction,
  getAll: (store) => run(store, 'readonly', (s) => s.getAll()),
  get: (store, id) => run(store, 'readonly', (s) => s.get(id)),
  count: (store) => run(store, 'readonly', (s) => s.count()),
  getAllByIndex: (store, index, value) =>
    run(store, 'readonly', (s) => s.index(index).getAll(value)),
  // add() resolves with the new record's id.
  add: (store, value) => run(store, 'readwrite', (s) => s.add(value)),
  put: (store, value) => run(store, 'readwrite', (s) => s.put(value)),
  delete: (store, id) => run(store, 'readwrite', (s) => s.delete(id)),
  clear: (store) => run(store, 'readwrite', (s) => s.clear()),

  // Adds many records in one transaction (CSV import, R22). Resolves with their ids.
  addAll: (store, values) =>
    transaction(store, 'readwrite', (stores) => Promise.all(values.map((v) => request(stores[store].add(v))))),

  // Everything, for a backup (R20): { songs: [...], venues: [...], ... }.
  exportAll: () =>
    transaction(STORES, 'readonly', async (stores) => {
      const out = {};
      for (const name of STORES) out[name] = await request(stores[name].getAll());
      return out;
    }),

  // Replaces every store's contents with `data` ({ songs: [...], ... }) in one
  // transaction, so a restore (R21) is all-or-nothing. Records keep their ids,
  // which is what keeps sings and setlists pointing at the right songs and venues.
  // Stores missing from `data` are emptied.
  replaceAll: (data) =>
    transaction(STORES, 'readwrite', async (stores) => {
      for (const name of STORES) {
        await request(stores[name].clear());
        for (const record of data[name] || []) stores[name].put(record);
      }
    }),
};
