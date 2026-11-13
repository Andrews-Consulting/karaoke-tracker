// Venue and sing-log logic for the Venues tab (R40, R8). Pure: no DOM, no IndexedDB.
//
// Sing dates are local calendar days stored as 'YYYY-MM-DD' strings (see js/db.js).
// Strings in that format sort in date order, so dates are compared as strings and
// never turned into Date objects, which could shift them a day through UTC.

const pad = (n, width = 2) => String(n).padStart(width, '0');

// "1 sing", "2 sings".
export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------- Dates ----------

// Formats a Date as its local calendar day 'YYYY-MM-DD'. Not toISOString(),
// which is UTC and gives tomorrow's date late in the evening west of Greenwich.
export function todayLocalISO(date = new Date()) {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// True for a real calendar day written exactly as 'YYYY-MM-DD'.
export function isISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === 'string' ? value : '');
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= daysInMonth;
}

const newestFirst = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

// ---------- Sing stats (R8) ----------

function tally(sings, keyOf) {
  const out = new Map();
  for (const sing of sings) {
    const key = keyOf(sing);
    const entry = out.get(key);
    if (!entry) out.set(key, { count: 1, lastSung: sing.date });
    else {
      entry.count += 1;
      if (sing.date > entry.lastSung) entry.lastSung = sing.date;
    }
  }
  return out;
}

const atVenue = (sings, venueId) =>
  (venueId == null ? sings : sings.filter((s) => s.venueId === venueId));

// Times sung and last sung per song: Map songId -> { count, lastSung }.
// venueId null (or omitted) = overall, across every venue.
export function singStats(sings, venueId = null) {
  return tally(atVenue(sings, venueId), (s) => s.songId);
}

// Sings and last sung date per venue: Map venueId -> { count, lastSung }.
export function venueStats(sings) {
  return tally(sings, (s) => s.venueId);
}

// All sings together: { count, lastSung }, lastSung null when there are none.
export function totals(sings) {
  return tally(sings, () => 'all').get('all') || { count: 0, lastSung: null };
}

// Rows for a "times sung" list: one per song in `stats`, most recently sung
// first, then most sung, then by title. Songs never sung have no row. A sing
// whose song no longer exists still gets a row, with song: null, so it stays
// visible and can be deleted (it would otherwise block deleting its venue).
export function statsRows(songs, stats) {
  const byId = new Map(songs.map((s) => [s.id, s]));
  const titleOf = (row) => (row.song ? row.song.title : '');
  return [...stats]
    .map(([songId, { count, lastSung }]) => ({ songId, song: byId.get(songId) || null, count, lastSung }))
    .sort((a, b) =>
      newestFirst(a.lastSung, b.lastSung) ||
      b.count - a.count ||
      titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: 'base' }) ||
      String(a.songId).localeCompare(String(b.songId)));
}

// Each song's individual sings: Map songId -> sings, newest first (on the
// same day, the most recently logged first). venueId null = every venue.
export function singsBySong(sings, venueId = null) {
  const out = new Map();
  for (const sing of atVenue(sings, venueId)) {
    if (!out.has(sing.songId)) out.set(sing.songId, []);
    out.get(sing.songId).push(sing);
  }
  for (const list of out.values()) {
    list.sort((a, b) => newestFirst(a.date, b.date) || (b.id ?? 0) - (a.id ?? 0));
  }
  return out;
}

// ---------- Venues (R40) ----------

// Venue list order: by name, ignoring case.
export function sortVenues(venues) {
  return [...venues].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

// Checks a new or changed venue name: trimmed, not empty, and not the name of
// another venue ignoring case. `exceptId` is the venue being renamed, so it
// can change the case of its own name. Returns an error message, or ''.
export function venueNameError(name, venues, exceptId = null) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return 'Enter a venue name.';
  const key = trimmed.toLowerCase();
  const clash = venues.find((v) => v.id !== exceptId && String(v.name).trim().toLowerCase() === key);
  return clash ? `There is already a venue called “${clash.name}”.` : '';
}

// Deleting a venue is hard and only allowed when no sing references it.
// Setlists labelled for it do not hold it up (R56): the delete clears their
// label. Returns why it cannot be deleted, or '' when it can.
export function venueInUseMessage(name, singCount) {
  if (!singCount) return '';
  return `Can't delete “${name}”: ${plural(singCount, 'sing log entry', 'sing log entries')} ` +
    `still ${singCount === 1 ? 'uses' : 'use'} it. Remove those first.`;
}

// The confirmation before deleting a venue, saying what happens to the
// setlists labelled for it (R56).
export function describeVenueDelete(name, setlistCount = 0) {
  const labelled = !setlistCount ? ''
    : setlistCount === 1 ? ' 1 setlist is labelled for it; it will become Any venue.'
      : ` ${setlistCount} setlists are labelled for it; they will become Any venue.`;
  return `Delete the venue “${name}”?${labelled}`;
}
