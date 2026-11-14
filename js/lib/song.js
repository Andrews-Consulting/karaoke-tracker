// Song records. Pure: no DOM, no IndexedDB.
//
// Every song in the database has this exact shape (see js/db.js). Build new
// songs through makeSong() so the form, CSV import (R22) and restore (R21) all
// agree on defaults and normalisation.

export const SONG_STATUSES = ['go-to', 'want-to-try', 'retired'];

// What the owner sees for each status (R7).
export const STATUS_LABELS = { 'go-to': 'Go-to', 'want-to-try': 'Want to try', retired: 'Retired' };

export const RATINGS = [1, 2, 3, 4, 5];

// Shown for a status that is not set (R64): a new song starts with none.
export const NO_STATUS_LABEL = 'Not set';

// Label for a stored status; blank or unknown values read as not set, like makeSong().
export function statusLabel(status) {
  return STATUS_LABELS[status] || '';
}

// Returns a whole rating 1..5 (R4) from a number or form string, or null when
// missing, blank or invalid.
export function normalizeRating(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  const text = String(value).trim();
  if (!text) return null;
  const rating = Number(text);
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
}

// '4 of 5', or '' when there is no valid rating.
export function formatRating(rating) {
  const value = normalizeRating(rating);
  return value === null ? '' : `${value} of 5`;
}

// Tags as the edit form shows them: 'duet, slow'.
export function formatTags(tags) {
  return normalizeTags(tags).join(', ');
}

// Returns a year number in 1900..2100, or null when missing or invalid.
export function normalizeYear(value) {
  if (value === null || value === undefined || value === '') return null;
  const year = Number(String(value).trim());
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null;
  return year;
}

// Tags: trimmed, non-empty, de-duplicated case-insensitively, original case kept.
export function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags || '').split(/[;,]/);
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const tag = String(raw).trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

// Builds a complete song record from partial input. Title and artist are
// trimmed; everything else gets a safe default. Does not set `id`; IndexedDB
// assigns it on add.
export function makeSong(fields = {}, now = new Date()) {
  const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const status = SONG_STATUSES.includes(fields.status) ? fields.status : ''; // '' = not set (R64)
  return {
    title: text(fields.title),
    artist: text(fields.artist),
    genre: text(fields.genre),
    year: normalizeYear(fields.year),
    key: text(fields.key),
    notes: text(fields.notes),
    rating: normalizeRating(fields.rating),
    status,
    tags: normalizeTags(fields.tags),
    createdAt: fields.createdAt || now.toISOString(),
    karafunId: normalizeKarafunId(fields.karafunId),
  };
}

// The song's id in the KaraFun catalog (R68): a positive whole number, or null
// when missing or invalid.
export function normalizeKarafunId(value) {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Case-insensitive "same song" key, for duplicate checks (R9, CSV import).
export function songKey(song) {
  return `${(song.title || '').trim().toLowerCase()}\u0000${(song.artist || '').trim().toLowerCase()}`;
}

// Checks song form input (add or edit) before it becomes a record. Returns
// { field: message } for each problem, or {} when the input can be saved.
// Optional fields may be blank; when filled they must be valid, because
// makeSong() would otherwise drop them silently.
export function validateSong(fields = {}) {
  const blank = (v) => v === null || v === undefined || String(v).trim() === '';
  const errors = {};
  if (blank(fields.title)) errors.title = 'Enter a title.';
  if (blank(fields.artist)) errors.artist = 'Enter an artist.';
  if (!blank(fields.year) && normalizeYear(fields.year) === null) {
    errors.year = 'Enter a year from 1900 to 2100, or leave it blank.';
  }
  if (!blank(fields.rating) && normalizeRating(fields.rating) === null) {
    errors.rating = 'Choose a rating from 1 to 5, or no rating.';
  }
  if (!blank(fields.status) && !SONG_STATUSES.includes(fields.status)) {
    errors.status = 'Choose Go-to, Want to try or Retired.';
  }
  return errors;
}

// Applies edits to a stored song (R2). Keeps its id and createdAt; every other
// field is rebuilt through makeSong(), so fields left out of `changes` keep
// their current values.
export function updateSong(existing, changes = {}) {
  return { id: existing.id, ...makeSong({ ...existing, ...changes, createdAt: existing.createdAt }) };
}

// Works out what deleting a song touches (R2): the ids of its sings, and each
// setlist that lists it, copied with the song removed. Setlists that become
// empty are kept. Does not change its inputs.
export function planSongDelete(songId, sings = [], setlists = []) {
  return {
    singIds: sings.filter((sing) => sing.songId === songId).map((sing) => sing.id),
    setlists: setlists
      .filter((list) => (list.songIds || []).includes(songId))
      .map((list) => ({ ...list, songIds: list.songIds.filter((id) => id !== songId) })),
  };
}

// The delete confirmation, saying what else goes with the song.
export function describeSongDelete(song, plan = { singIds: [], setlists: [] }) {
  const artist = (song.artist || '').trim();
  const parts = [`Delete “${(song.title || '').trim()}”${artist ? ` by ${artist}` : ''}?`];
  const sung = plan.singIds.length;
  const lists = plan.setlists.length;
  if (sung) parts.push(`It has been sung ${sung === 1 ? 'once' : `${sung} times`}; that history will be deleted too.`);
  if (lists) parts.push(`It will be removed from ${lists} ${lists === 1 ? 'setlist' : 'setlists'}.`);
  parts.push('This cannot be undone.');
  return parts.join(' ');
}
