// The KJ view (R54, R74): one song full screen, to show the KJ. The dock and
// banners hide while it is up (body[data-screen="kj"], cleared by the screen
// stack on any other render). Portrait: after "Sang it", a strip saying what
// was logged with Undo; a label; the title and artist as large as fit; the key
// as a huge number with its meaning in words; Done. Landscape on a phone (a
// CSS orientation query in css/app.css) shows only the title, artist and key.
// Done and the back gesture return to the screen below.
import { db } from '../db.js';
import {
  el, viewEl, closeScreen, screenTicket, screenStillShowing, icon, ICONS,
} from '../ui.js';

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

// A song's key change (R6) as the KJ view and the Up next badge show it:
// { big: '−2', words: 'two semitones down' }. A key that is not a number of
// semitones ('Bb', 'capo 2') shows as typed, with no words; no key gives null.
export function keyParts(key) {
  const text = String(key ?? '').trim();
  if (!text) return null;
  const match = /^([+\-−]?)\s*(\d{1,2})$/.exec(text);
  if (!match) return { big: text, words: '' };
  const steps = Number(match[2]);
  if (steps === 0) return { big: '0', words: 'original key' };
  const down = match[1] === '-' || match[1] === '−';
  const count = NUMBER_WORDS[steps] ?? String(steps);
  return {
    big: `${down ? '−' : '+'}${steps}`,
    words: `${count} ${steps === 1 ? 'semitone' : 'semitones'} ${down ? 'down' : 'up'}`,
  };
}

// Shrinks `node`'s type from the size css/app.css gives it until its longest
// word fits the width and the view fits the screen, down to `min` px; past
// that a word may break. The stylesheet sizes by length and orientation; this
// covers fonts wider than expected and very long titles.
function fit(node, min) {
  node.style.fontSize = '';
  node.classList.remove('kj-break');
  let size = parseFloat(getComputedStyle(node).fontSize);
  const tooBig = () => node.scrollWidth > node.clientWidth + 1 || viewEl.scrollHeight > viewEl.clientHeight + 1;
  while (tooBig() && size > min) {
    size = Math.max(min, size - 2);
    node.style.fontSize = `${size}px`;
  }
  if (node.scrollWidth > node.clientWidth + 1) node.classList.add('kj-break');
}

// Shows song `songId` for the KJ. `label` heads it ('Up next for the KJ' from
// Tonight, 'For the KJ' from a song). `logged`, after "Sang it" (R74), is
// { title, venue, undo }: the strip at the top says what was logged and Undo
// calls undo().
export async function renderKj(songId, { label = 'For the KJ', logged = null } = {}) {
  const ticket = screenTicket();
  const song = await db.get('songs', songId);
  if (!screenStillShowing(ticket)) return;
  if (!song) {
    closeScreen();
    return;
  }
  document.body.dataset.screen = 'kj';
  const key = keyParts(song.key);
  const length = song.title.length <= 10 ? 'short' : song.title.length <= 20 ? 'medium' : 'long';

  let undoing = false;
  const strip = logged
    ? el('div', { class: 'kj-logged' },
      el('span', { class: 'kj-logged-mark' }, icon(ICONS.check, { width: 2.8 })),
      el('p', { role: 'status', text: `“${logged.title}” logged at ${logged.venue}` }),
      el('button', {
        type: 'button', class: 'kj-undo', 'aria-label': `Undo: ${logged.title} goes back to up next`,
        onclick: () => {
          if (undoing) return;
          undoing = true;
          logged.undo();
        },
      }, icon(ICONS.undo, { size: 16 }), 'Undo'))
    : null;

  const title = el('h2', { class: 'kj-title', text: song.title });
  const artist = el('p', { class: 'kj-artist', text: song.artist });
  const view = el('section', { class: `kj-view kj-${length}`, 'aria-label': 'For the KJ' },
    strip,
    el('div', { class: 'kj-body' },
      el('p', { class: 'kj-label', text: label }),
      title,
      artist,
        key
          ? el('div', { class: 'kj-key' },
            el('p', { class: 'kj-key-number' },
              el('span', { class: 'kj-key-label', text: 'Key' }),
              el('span', { class: 'kj-key-big', text: key.big })),
            key.words ? el('p', { class: 'kj-key-words', text: key.words }) : null)
          : null),
    el('button', { type: 'button', class: 'btn kj-done', text: 'Done', onclick: () => closeScreen() }));
  viewEl.replaceChildren(view);
  viewEl.scrollTop = 0;

  // Fitted now and again when the phone turns, until the view goes.
  const refit = () => {
    if (!view.isConnected) {
      window.removeEventListener('resize', refit);
      return;
    }
    fit(artist, 20);
    fit(title, 28);
  };
  window.addEventListener('resize', refit);
  refit();
}
