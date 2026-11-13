// A night out on the Songs tab (R47, R48, R49, R50, R56): which set is open at
// a venue or under Overall, the Set menu, the venue's Next time list, new
// lists for tonight, and what was sung there by date. Pure: no DOM, no IndexedDB.
//
// A setlist's venueId is a label, not a binding (R56): any setlist can be
// opened at any venue, and under Overall. Which set is current at each venue
// (and under Overall), and which setlist plays a venue's Next time role, are
// remembered in the meta store as { key: 'currentSetlist:<venueId>' } (or
// 'currentSetlist:overall') and { key: 'nextTimeSetlist:<venueId>' }, each
// with a setlist id as its value. The selection rules here take that
// remembered id and the setlists and say which setlist to use, or null when
// one has to be created.
import { sortSetlists } from './setlist.js';
import { todayLocalISO } from './stats.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The meta keys for the current set at a venue (venueId null = Overall) and a venue's Next time list.
export const currentSetlistKey = (venueId) => `currentSetlist:${venueId == null ? 'overall' : venueId}`;
export const nextSetlistKey = (venueId) => `nextTimeSetlist:${venueId}`;

// The name of the list Overall makes when there is no setlist at all (R56).
export const OVERALL_LIST_NAME = 'My list';

// The name of a new list for tonight: the local day, e.g. 'Fri 14 Nov'.
// The same words whatever the phone's language, so names sort and read alike.
export function tonightListName(now = new Date()) {
  return `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
}

// `name`, or when a setlist already has that name ignoring case, the first
// free 'name (2)', 'name (3)' and so on. Setlist names are unique (R14).
export function uniqueSetlistName(name, setlists) {
  const base = String(name ?? '').trim();
  const taken = new Set((Array.isArray(setlists) ? setlists : []).map((s) => String(s.name ?? '').trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

// The setlists labelled for a venue (venueId null: those for any venue), by
// name, as on the Setlists tab.
export function venueSetlists(setlists, venueId) {
  const wanted = venueId ?? null;
  return sortSetlists((Array.isArray(setlists) ? setlists : []).filter((s) => (s.venueId ?? null) === wanted));
}

// The set to open at a venue (R47, R56): the remembered one while it still
// exists, whatever its label; otherwise the first by name labelled for the
// venue, then the first for any venue. Under Overall (venueId null): the
// remembered one, then the first for any venue, then the first of all.
// Null when there is nothing to open, so the caller creates one.
export function currentSetlistFor(setlists, venueId, remembered) {
  const all = sortSetlists(Array.isArray(setlists) ? setlists : []);
  const kept = remembered == null ? null : all.find((s) => s.id === remembered);
  if (kept) return kept;
  const anyVenue = all.find((s) => s.venueId == null);
  if (venueId == null) return anyVenue || all[0] || null;
  return all.find((s) => s.venueId === venueId) || anyVenue || null;
}

// The Set menu's groups (R56), each { label, items: [{ id, text }] } with the
// setlists by name, empty groups left out. At a venue: "For <venue>", "Any
// venue", then "Other venues"; under Overall (venueId null): "Any venue" then
// "For a venue". A list labelled for another venue reads "Name · Venue".
export function setMenuGroups(setlists, venues, venueId) {
  const all = sortSetlists(Array.isArray(setlists) ? setlists : []);
  const names = new Map((Array.isArray(venues) ? venues : []).map((v) => [v.id, v.name]));
  const plain = (s) => ({ id: s.id, text: s.name });
  const labelled = (s) => ({ id: s.id, text: `${s.name} · ${names.get(s.venueId) ?? 'Unknown venue'}` });
  const anyVenue = all.filter((s) => s.venueId == null).map(plain);
  const groups = venueId == null
    ? [
      { label: 'Any venue', items: anyVenue },
      { label: 'For a venue', items: all.filter((s) => s.venueId != null).map(labelled) },
    ]
    : [
      { label: `For ${names.get(venueId) ?? 'this venue'}`, items: all.filter((s) => s.venueId === venueId).map(plain) },
      { label: 'Any venue', items: anyVenue },
      { label: 'Other venues', items: all.filter((s) => s.venueId != null && s.venueId !== venueId).map(labelled) },
    ];
  return groups.filter((group) => group.items.length);
}

// The venue's Next time list (R49): the remembered one while it still exists
// and is still labelled for the venue. Null when it has to be created (first
// use, or the list was deleted or relabelled).
export function nextSetlistFor(setlists, venueId, remembered) {
  if (venueId == null || remembered == null) return null;
  return (Array.isArray(setlists) ? setlists : []).find((s) => s.id === remembered && s.venueId === venueId) || null;
}

// The setlist with the song first (R50 Undo). A song already in it moves to
// the top rather than appearing twice; the others keep their order.
export function putBackOnTop(setlist, songId) {
  const rest = [...new Set(Array.isArray(setlist.songIds) ? setlist.songIds : [])].filter((id) => id !== songId);
  return { ...setlist, songIds: [songId, ...rest] };
}

// A Sung mode heading: 'Today' for today, otherwise the date as stored.
export function dateLabel(date, today = todayLocalISO()) {
  return date === today ? 'Today' : date;
}

// Every sing at the venue grouped by date, newest date first, and within a
// date the most recently logged first (R50):
//   [{ date, label, entries: [{ sing, song }] }]
// Sings whose song no longer exists are left out. `songsById` is a Map of
// id -> song (an array of songs works too).
export function groupSingsByDate(sings, songsById, venueId, today = todayLocalISO()) {
  const byId = songsById instanceof Map
    ? songsById
    : new Map((Array.isArray(songsById) ? songsById : []).map((s) => [s.id, s]));
  const groups = new Map(); // date -> entries
  const here = (Array.isArray(sings) ? sings : [])
    .filter((sing) => sing.venueId === venueId && byId.has(sing.songId))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.id ?? 0) - (a.id ?? 0)));
  for (const sing of here) {
    if (!groups.has(sing.date)) groups.set(sing.date, []);
    groups.get(sing.date).push({ sing, song: byId.get(sing.songId) });
  }
  return [...groups].map(([date, entries]) => ({ date, label: dateLabel(date, today), entries }));
}
