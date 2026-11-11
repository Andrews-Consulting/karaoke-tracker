// IndexedDB wrapper (R18). All data stays on this device.
//
// Stores
//   songs     { id, title, artist, genre, year, key, notes, rating, status, tags[], createdAt }
//   venues    { id, name }
//   sings     { id, songId, venueId, date }            one row per time a song is sung (R8)
//   setlists  { id, name, venueId|null, songIds[] }    venueId null = general setlist (R39)
//   meta      { key, value }                           e.g. lastBackupAt (R25)
//
// To change the schema: bump DB_VERSION and add a new `if (oldVersion < N)` block.
// Never edit an existing block, or installed copies will not be migrated.

const DB_NAME = 'karaoke-tracker';
const DB_VERSION = 1;

export const STORES = ['songs', 'venues', 'sings', 'setlists', 'meta'];

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
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

// Runs one request in its own transaction and resolves with its result.
async function run(storeName, mode, makeRequest) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = makeRequest(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  getAll: (store) => run(store, 'readonly', (s) => s.getAll()),
  get: (store, id) => run(store, 'readonly', (s) => s.get(id)),
  getAllByIndex: (store, index, value) =>
    run(store, 'readonly', (s) => s.index(index).getAll(value)),
  // add() resolves with the new record's id.
  add: (store, value) => run(store, 'readwrite', (s) => s.add(value)),
  put: (store, value) => run(store, 'readwrite', (s) => s.put(value)),
  delete: (store, id) => run(store, 'readwrite', (s) => s.delete(id)),
  clear: (store) => run(store, 'readwrite', (s) => s.clear()),
};
