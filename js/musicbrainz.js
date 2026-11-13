// Title and artist suggestions from MusicBrainz while adding a song (R35).
// This is the only network call in the app. It is made only while the owner
// leaves "Online suggestions" on in Settings, at most one request at a time,
// 400 ms after the last keystroke, because MusicBrainz allows about one
// request a second. Failures show nothing: the form works the same offline.
import { suggestionUrl, parseSuggestions, shouldSuggest, artistUrl, parseGenres } from './lib/musicbrainz.js';

const STORAGE_KEY = 'musicbrainz';
const DEBOUNCE_MS = 400;
const TIMEOUT_MS = 5000;

// On unless the owner turned it off.
export function suggestionsEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSuggestionsEnabled(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Private mode or storage blocked: the choice lasts for this visit only.
  }
}

// The artist's genres (R63), fetched once per artist when a suggestion is
// tapped and remembered for the visit. Resolves with [] on any failure.
const genreCache = new Map();
export async function fetchArtistGenres(artistId) {
  if (!artistId || !suggestionsEnabled() || navigator.onLine === false) return [];
  if (genreCache.has(artistId)) return genreCache.get(artistId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(artistUrl(artistId), { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`MusicBrainz answered ${response.status}`);
    const genres = parseGenres(await response.json());
    genreCache.set(artistId, genres);
    return genres;
  } catch (err) {
    console.debug('No MusicBrainz genres:', err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// Looks up suggestions as the owner types. Call update(title, artist) on
// every keystroke in the title; `show` is called with [{ title, artist }],
// an empty list meaning "show none". cancel() stops any pending or running
// lookup, e.g. when a suggestion is taken or the form is submitted. Nothing
// is looked up once `isActive()` is false, e.g. the form has left the screen.
export function createSuggester(show, isActive = () => true) {
  let timer = null;
  let running = null; // the AbortController of the request in flight

  function cancel() {
    clearTimeout(timer);
    timer = null;
    if (running) {
      running.abort();
      running = null;
    }
  }

  async function lookup(title, artist) {
    if (!isActive()) return;
    if (!suggestionsEnabled() || navigator.onLine === false) {
      show([]);
      return;
    }
    const controller = new AbortController();
    running = controller;
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(suggestionUrl(title, artist), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`MusicBrainz answered ${response.status}`);
      const json = await response.json();
      if (running === controller) show(parseSuggestions(json));
    } catch (err) {
      // Offline, refused, slow or replaced by a newer lookup: nothing to show.
      console.debug('No MusicBrainz suggestions:', err);
      if (running === controller) show([]);
    } finally {
      clearTimeout(timeout);
      if (running === controller) running = null;
    }
  }

  function update(title, artist = '') {
    cancel();
    if (!shouldSuggest(title) || !suggestionsEnabled()) {
      show([]);
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      lookup(title, artist);
    }, DEBOUNCE_MS);
  }

  return { update, cancel };
}
