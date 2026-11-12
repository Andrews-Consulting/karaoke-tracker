// CSV import (R22). Pure: no DOM, no IndexedDB.
//
//   const plan = planImport(parseCsv(text), existingSongs);
//   await db.addAll('songs', plan.toAdd);
//   show(importSummary(plan));
//
// The file needs a header row. Column names are matched case-insensitively and
// trimmed: title and artist are required; genre, year, key and tags are optional
// (tags separated by ; or , inside the cell). Other columns are ignored.

import { makeSong, songKey } from './song.js';

export const CSV_COLUMNS = ['title', 'artist', 'genre', 'year', 'key', 'tags'];

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

// Turns parsed rows (header first) into an import plan:
//   toAdd       complete song records (makeSong), in file order
//   duplicates  rows whose title + artist (songKey) is already in `existingSongs`
//               or appeared earlier in the file
//   invalid     rows missing a title or an artist
// Rows whose cells are all blank are ignored. Throws CsvError when the file is
// empty or the header has no title or artist column.
export function planImport(rows, existingSongs = [], now = new Date()) {
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
  const plan = { toAdd: [], duplicates: [], invalid: [] };

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
    if (seen.has(key)) {
      plan.duplicates.push(song);
      continue;
    }
    seen.add(key);
    plan.toAdd.push(song);
  }
  return plan;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// One-line result for the user, e.g.
// "Imported 412 songs. Skipped 3 duplicates and 1 row without a title or artist."
export function importSummary({ toAdd, duplicates, invalid }) {
  if (toAdd.length + duplicates.length + invalid.length === 0) {
    return 'The file has a header row but no songs, so nothing was imported.';
  }
  const skipped = [];
  if (duplicates.length) skipped.push(plural(duplicates.length, 'duplicate'));
  if (invalid.length) skipped.push(`${plural(invalid.length, 'row')} without a title or artist`);
  const tail = skipped.length ? ` Skipped ${skipped.join(' and ')}.` : '';
  return `Imported ${plural(toAdd.length, 'song')}.${tail}`;
}
