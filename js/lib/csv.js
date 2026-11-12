// CSV import (R22). Pure: no DOM, no IndexedDB.
//
//   const plan = planImport(parseCsv(text), existingSongs);
//   await db.addAll('songs', plan.toAdd);
//   show(importSummary(plan));
//
// The file needs a header row. Column names are matched case-insensitively and
// trimmed: title and artist are required; genre, year, key and tags are optional
// (tags separated by ; or , inside the cell). Other columns are ignored.
//
// R46: a `venue` column logs one sing per row at that venue (created when new),
// dated by the `date` column or, when blank, the day of the import. The sing is
// logged even when the song itself is a duplicate, so a song sung at two venues
// is simply two rows. A sing already logged (same song, venue and date) is skipped.

import { makeSong, songKey } from './song.js';
import { isISODate, todayLocalISO } from './stats.js';

export const CSV_COLUMNS = ['title', 'artist', 'genre', 'year', 'key', 'tags', 'venue', 'date'];

// A problem with the file as a whole. The message is written for the user.
export class CsvError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CsvError';
  }
}

// Parses RFC 4180-style CSV into rows of strings: commas between fields, quoted
// fields may hold commas, line breaks and doubled quotes (""), records end with
// CRLF, LF or CR. A leading UTF-8 BOM is dropped and blank lines are skipped.
// A quote inside an unquoted field is kept as a literal character. Throws
// CsvError when a quoted field is never closed.
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let atFieldStart = true;
  let inQuotes = false;
  let line = 1;
  let quoteLine = 0;

  const endField = () => {
    row.push(field);
    field = '';
    atFieldStart = true;
  };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line += 1;
        field += ch;
      }
    } else if (ch === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
      quoteLine = line;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      endRow();
      line += 1;
    } else {
      field += ch;
      atFieldStart = false;
    }
  }

  if (inQuotes) throw new CsvError(`A quoted value starting on line ${quoteLine} is never closed.`);
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

// "1984", "1980s" (a decade) or a date such as "1984-05-01" give the 4-digit
// year. Anything else is passed on; makeSong() turns invalid years into null.
function csvYear(cell) {
  const match = /^\s*(\d{4})(?:s|-\d{1,2}(?:-\d{1,2})?)?\s*$/i.exec(String(cell ?? ''));
  return match ? match[1] : cell;
}

// A sing date from a CSV cell (R46): 'YYYY-MM-DD', 'YYYY-MM' (the 1st),
// 'YYYY' (1 January) or a US 'M/D/YYYY'. Blank means the day of the import.
// Returns 'YYYY-MM-DD', or null when the cell cannot be read as a date.
export function csvDate(cell, now = new Date()) {
  const text = String(cell ?? '').trim();
  if (!text) return todayLocalISO(now);
  const pad = (n) => String(n).padStart(2, '0');
  let iso = null;
  let match;
  if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text))) iso = `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
  else if ((match = /^(\d{4})-(\d{1,2})$/.exec(text))) iso = `${match[1]}-${pad(match[2])}-01`;
  else if ((match = /^(\d{4})$/.exec(text))) iso = `${match[1]}-01-01`;
  else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text))) iso = `${match[3]}-${pad(match[1])}-${pad(match[2])}`;
  return iso && isISODate(iso) ? iso : null;
}

const venueKey = (name) => String(name ?? '').trim().toLowerCase();

// Turns parsed rows (header first) into an import plan:
//   toAdd        complete song records (makeSong), in file order
//   duplicates   rows whose title + artist (songKey) is already in `existingSongs`
//                or appeared earlier in the file
//   invalid      rows missing a title or an artist
//   venuesToAdd  { name } for each venue named in the file that does not exist yet (R46)
//   sings        { songKey, venue, date } to log, one per row with a venue (R46);
//                `venue` is the name as it will be stored
//   singsLogged  sings skipped because the same song, venue and date is already
//                logged, or appeared earlier in the file
//   singsBadDate sings skipped because the date cell could not be read
// `existing` holds the device's venues and sings so sings can be de-duplicated.
// Rows whose cells are all blank are ignored. Throws CsvError when the file is
// empty or the header has no title or artist column.
export function planImport(rows, existingSongs = [], now = new Date(), existing = {}) {
  if (!rows || rows.length === 0) throw new CsvError('The file is empty.');

  const header = rows[0].map((name) => String(name).trim().toLowerCase());
  const columns = {};
  for (const name of CSV_COLUMNS) {
    const index = header.indexOf(name);
    if (index !== -1) columns[name] = index;
  }
  if (columns.title === undefined || columns.artist === undefined) {
    const found = header.filter(Boolean).slice(0, 8).join(', ') || 'none';
    throw new CsvError(
      `The first row must name the columns, including "title" and "artist". Columns found: ${found}.`);
  }

  const seen = new Set(existingSongs.map(songKey));
  const plan = {
    toAdd: [], duplicates: [], invalid: [], venuesToAdd: [], sings: [], singsLogged: [], singsBadDate: [],
  };

  // Venues by lower-cased name -> stored name; sings as "songKey|venueKey|date".
  const existingVenues = existing.venues || [];
  const venueNames = new Map(existingVenues.map((v) => [venueKey(v.name), String(v.name).trim()]));
  const songKeyById = new Map(existingSongs.map((s) => [s.id, songKey(s)]));
  const venueKeyById = new Map(existingVenues.map((v) => [v.id, venueKey(v.name)]));
  const loggedSings = new Set((existing.sings || [])
    .filter((s) => songKeyById.has(s.songId) && venueKeyById.has(s.venueId))
    .map((s) => `${songKeyById.get(s.songId)}|${venueKeyById.get(s.venueId)}|${s.date}`));

  for (const cells of rows.slice(1)) {
    if (cells.every((cell) => cell.trim() === '')) continue;
    const fields = {};
    for (const [name, index] of Object.entries(columns)) fields[name] = cells[index] ?? '';
    fields.year = csvYear(fields.year);

    const song = makeSong(fields, now);
    if (!song.title || !song.artist) {
      plan.invalid.push(song);
      continue;
    }
    const key = songKey(song);
    if (seen.has(key)) plan.duplicates.push(song);
    else {
      seen.add(key);
      plan.toAdd.push(song);
    }

    // R46: a venue on the row logs a sing, for new and already-known songs alike.
    const venueName = String(fields.venue ?? '').trim();
    if (!venueName) continue;
    const date = csvDate(fields.date, now);
    if (date === null) {
      plan.singsBadDate.push({ song, venue: venueName, date: String(fields.date).trim() });
      continue;
    }
    const vKey = venueKey(venueName);
    if (!venueNames.has(vKey)) {
      venueNames.set(vKey, venueName);
      plan.venuesToAdd.push({ name: venueName });
    }
    const singId = `${key}|${vKey}|${date}`;
    if (loggedSings.has(singId)) {
      plan.singsLogged.push({ song, venue: venueNames.get(vKey), date });
      continue;
    }
    loggedSings.add(singId);
    plan.sings.push({ songKey: key, venue: venueNames.get(vKey), date });
  }
  return plan;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Joins parts as "a", "a and b" or "a, b and c".
function listed(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// One-line result for the user, e.g.
// "Imported 412 songs. Logged 30 sings at 1 new venue. Skipped 3 duplicates and 1 row without a title or artist."
export function importSummary({
  toAdd, duplicates, invalid, venuesToAdd = [], sings = [], singsLogged = [], singsBadDate = [],
}) {
  if (toAdd.length + duplicates.length + invalid.length === 0) {
    return 'The file has a header row but no songs, so nothing was imported.';
  }
  let text = `Imported ${plural(toAdd.length, 'song')}.`;
  if (sings.length) {
    const where = venuesToAdd.length ? ` at ${plural(venuesToAdd.length, 'new venue')}` : '';
    text += ` Logged ${plural(sings.length, 'sing')}${where}.`;
  }
  const skipped = [];
  if (duplicates.length) skipped.push(plural(duplicates.length, 'duplicate'));
  if (invalid.length) skipped.push(`${plural(invalid.length, 'row')} without a title or artist`);
  if (singsLogged.length) skipped.push(`${plural(singsLogged.length, 'sing')} already logged`);
  if (singsBadDate.length) skipped.push(`${plural(singsBadDate.length, 'sing')} with an unreadable date`);
  if (skipped.length) text += ` Skipped ${listed(skipped)}.`;
  return text;
}
