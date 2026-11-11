// Songs view (R1, R10, part of R36). Wave 1 A adds R2, R3 and the rest of R36.
import { db } from '../db.js';
import { el, viewEl } from '../ui.js';
import { filterSongs, sortByTitle } from '../lib/search.js';
import { makeSong } from '../lib/song.js';

export async function renderSongs() {
  const songs = sortByTitle(await db.getAll('songs'));

  const count = el('p', { class: 'count' });
  const list = el('ul', { class: 'list' });

  function draw(query) {
    const shown = filterSongs(songs, query);

    count.textContent = `${shown.length} of ${songs.length} songs`;
    list.replaceChildren(
      ...shown.map((s) => {
        const details = [s.artist, s.genre, s.year].filter(Boolean).join(' · ');
        return el('li', { 'data-song-id': s.id },
          el('div', { class: 'title', text: s.title }),
          el('div', { class: 'sub', text: details }));
      })
    );
    if (songs.length === 0) {
      list.append(el('li', { class: 'muted', text: 'No songs yet. Add your first one above.' }));
    }
  }

  const search = el('input', {
    type: 'search',
    placeholder: 'Search title or artist',
    'aria-label': 'Search songs',
    oninput: (e) => draw(e.target.value),
  });

  const form = el('form', { class: 'stack', 'aria-label': 'Add a song' },
    el('label', { text: 'Title' }, el('input', { name: 'title', required: '', autocomplete: 'off' })),
    el('label', { text: 'Artist' }, el('input', { name: 'artist', required: '', autocomplete: 'off' })),
    el('div', { class: 'row' },
      el('label', { text: 'Genre' }, el('input', { name: 'genre', autocomplete: 'off' })),
      el('label', { text: 'Year' }, el('input', { name: 'year', type: 'number', min: '1900', max: '2100', inputmode: 'numeric' }))),
    el('button', { class: 'btn primary', type: 'submit', text: 'Add song' }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    await db.add('songs', makeSong({
      title: data.get('title'),
      artist: data.get('artist'),
      genre: data.get('genre'),
      year: data.get('year'),
    }));
    renderSongs();
  });

  viewEl.replaceChildren(
    el('div', { class: 'stack' },
      el('details', { class: 'card' }, el('summary', { text: 'Add a song' }), form),
      search,
      count,
      list));
  draw('');
}
