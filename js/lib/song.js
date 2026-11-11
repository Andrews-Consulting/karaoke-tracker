// Song records. Pure: no DOM, no IndexedDB.
//
// Every song in the database has this exact shape (see js/db.js). Build new
// songs through makeSong() so the form, CSV import (R22) and restore (R21) all
// agree on defaults and normalisation.

export const SONG_STATUSES = ['go-to', 'want-to-try', 'retired'];

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
  const status = SONG_STATUSES.includes(fields.status) ? fields.status : 'go-to';
  const rating = Number(fields.rating);
  return {
    title: text(fields.title),
    artist: text(fields.artist),
    genre: text(fields.genre),
    year: normalizeYear(fields.year),
    key: text(fields.key),
    notes: text(fields.notes),
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    status,
    tags: normalizeTags(fields.tags),
    createdAt: fields.createdAt || now.toISOString(),
  };
}

// Case-insensitive "same song" key, for duplicate checks (R9, CSV import).
export function songKey(song) {
  return `${(song.title || '').trim().toLowerCase()}\u0000${(song.artist || '').trim().toLowerCase()}`;
}
