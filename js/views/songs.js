// Songs view: the list with add and search (R1, R10), and one song's detail,
// edit form and delete (R2, R3, R36; the edit form also holds tags, key,
// status and rating).
import { db, request } from '../db.js';
import { el, viewEl, confirmAction } from '../ui.js';
import { filterSongs, sortByTitle } from '../lib/search.js';
import {
  makeSong, updateSong, validateSong, planSongDelete, describeSongDelete,
  SONG_STATUSES, STATUS_LABELS, RATINGS, statusLabel, formatRating, formatTags,
} from '../lib/song.js';

// Deletes a song together with its sings and its place in every setlist, in
// one transaction, so nothing is left pointing at a missing song (R2).
// Resolves with what was removed: { singIds, setlists }.
export function deleteSong(id) {
  return db.transaction(['songs', 'sings', 'setlists'], 'readwrite', async (stores) => {
    const sings = await request(stores.sings.index('songId').getAll(id));
    const setlists = await request(stores.setlists.getAll());
    const plan = planSongDelete(id, sings, setlists);
    stores.songs.delete(id);
    for (const singId of plan.singIds) stores.sings.delete(singId);
    for (const setlist of plan.setlists) stores.setlists.put(setlist);
    return plan;
  });
}

// Shows validateSong() errors on a form. Returns true when there were any.
function showErrors(form, errorBox, errors) {
  for (const field of form.elements) field.removeAttribute('aria-invalid');
  const names = Object.keys(errors);
  errorBox.hidden = names.length === 0;
  errorBox.textContent = names.map((name) => errors[name]).join(' ');
  for (const name of names) form.elements[name]?.setAttribute('aria-invalid', 'true');
  if (names.length) form.elements[names[0]]?.focus();
  return names.length > 0;
}

function textField(label, props) {
  return el('label', { text: label }, el('input', { autocomplete: 'off', ...props }));
}

function yearField() {
  return textField('Year', { name: 'year', type: 'number', min: '1900', max: '2100', inputmode: 'numeric' });
}

// The list. Coming back from a song passes the search to restore (`query`),
// the song to scroll to (`focusId`) and an optional status line (`message`).
export async function renderSongs({ query = '', focusId = null, message = '' } = {}) {
  const songs = sortByTitle(await db.getAll('songs'));

  const count = el('p', { class: 'count' });
  const list = el('ul', { class: 'list' });

  function draw(text) {
    const shown = filterSongs(songs, text);

    count.textContent = `${shown.length} of ${songs.length} songs`;
    list.replaceChildren(
      ...shown.map((s) => {
        const details = [s.artist, s.genre, s.year].filter(Boolean).join(' · ');
        return el('li', { class: 'song-item', 'data-song-id': s.id },
          el('button', { type: 'button', class: 'song-row', onclick: () => renderSong(s.id, search.value) },
            el('span', { class: 'title', text: s.title }),
            el('span', { class: 'sub', text: details })));
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
  search.value = query;

  const errorBox = el('p', { class: 'error', role: 'alert', hidden: '' });
  const form = el('form', { class: 'stack', 'aria-label': 'Add a song' },
    textField('Title', { name: 'title', required: '' }),
    textField('Artist', { name: 'artist', required: '' }),
    el('div', { class: 'row' }, textField('Genre', { name: 'genre' }), yearField()),
    errorBox,
    el('button', { class: 'btn primary', type: 'submit', text: 'Add song' }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const fields = {
      title: data.get('title'),
      artist: data.get('artist'),
      genre: data.get('genre'),
      year: data.get('year'),
    };
    if (showErrors(form, errorBox, validateSong(fields))) return;
    await db.add('songs', makeSong(fields));
    renderSongs();
  });

  viewEl.replaceChildren(
    el('div', { class: 'stack' },
      el('details', { class: 'card' }, el('summary', { text: 'Add a song' }), form),
      message ? el('p', { class: 'notice', role: 'status', text: message }) : null,
      search,
      count,
      list));
  draw(query);

  if (focusId != null) {
    const row = list.querySelector(`[data-song-id="${focusId}"] button`);
    if (row) {
      row.scrollIntoView({ block: 'center' });
      row.focus({ preventScroll: true });
    }
  }
}

// One song: notes first (what matters at the venue), then the other fields,
// with Edit and Delete at the bottom within thumb reach.
async function renderSong(id, query) {
  const song = await db.get('songs', id);
  if (!song) {
    renderSongs({ query, message: 'That song is no longer in your library.' });
    return;
  }

  const field = (label, value) => el('div', { class: 'field' },
    el('dt', { text: label }),
    el('dd', { class: value ? '' : 'muted', text: value || '—' }));

  const errorBox = el('p', { class: 'error', role: 'alert', hidden: '' });

  async function remove() {
    const [sings, setlists] = await Promise.all([
      db.getAllByIndex('sings', 'songId', song.id),
      db.getAll('setlists'),
    ]);
    if (!confirmAction(describeSongDelete(song, planSongDelete(song.id, sings, setlists)))) return;
    try {
      await deleteSong(song.id);
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = `Could not delete the song: ${err.message}`;
      return;
    }
    renderSongs({ query, message: `Deleted “${song.title}”.` });
  }

  viewEl.replaceChildren(
    el('div', { class: 'stack song-detail' },
      backButton(() => renderSongs({ query, focusId: song.id })),
      el('section', { class: 'card stack', 'aria-label': 'Song details' },
        el('div', {},
          el('h2', { text: song.title }),
          el('p', { class: 'artist', text: song.artist })),
        el('div', {},
          el('h3', { text: 'Notes' }),
          song.notes
            ? el('p', { class: 'song-notes', text: song.notes })
            : el('p', { class: 'song-notes muted', text: 'No notes yet.' })),
        el('dl', { class: 'song-fields' },
          field('Key', song.key),
          field('Status', statusLabel(song.status)),
          field('Rating', formatRating(song.rating)),
          field('Genre', song.genre),
          field('Year', song.year == null ? '' : String(song.year)),
          field('Tags', formatTags(song.tags))),
        errorBox,
        el('div', { class: 'row' },
          el('button', { type: 'button', class: 'btn primary', text: 'Edit', onclick: () => renderEditSong(song, query) }),
          el('button', { type: 'button', class: 'btn danger', text: 'Delete', onclick: remove })))));
  viewEl.scrollTop = 0;
}

function backButton(onclick) {
  return el('button', { type: 'button', class: 'btn back', onclick },
    el('span', { 'aria-hidden': 'true', text: '‹ ' }), 'Back to list');
}

// Every field of a song (R2, R3, R36, plus tags, key, status and rating).
function renderEditSong(song, query) {
  const select = (name, options, value) => {
    const node = el('select', { name },
      ...options.map(([optionValue, text]) => el('option', { value: optionValue, text })));
    node.value = value;
    return node;
  };

  const notes = el('textarea', {
    name: 'notes', rows: '4', placeholder: 'e.g. skip the bridge, starts cold',
  });
  notes.value = song.notes;

  const errorBox = el('p', { class: 'error', role: 'alert', hidden: '' });
  const form = el('form', { class: 'card stack', 'aria-label': 'Edit song' },
    textField('Title', { name: 'title', required: '', value: song.title }),
    textField('Artist', { name: 'artist', required: '', value: song.artist }),
    el('div', { class: 'row' },
      textField('Genre', { name: 'genre', value: song.genre }),
      yearField()),
    el('div', { class: 'row' },
      textField('Key', { name: 'key', value: song.key, placeholder: 'e.g. -2 or +1' }),
      el('label', { text: 'Rating' },
        select('rating', [['', 'No rating'], ...RATINGS.map((r) => [String(r), String(r)])],
          song.rating == null ? '' : String(song.rating)))),
    el('label', { text: 'Status' },
      select('status', SONG_STATUSES.map((s) => [s, STATUS_LABELS[s]]), song.status)),
    textField('Tags (comma-separated)', { name: 'tags', value: formatTags(song.tags), placeholder: 'e.g. duet, slow, 80s' }),
    el('label', { text: 'Notes' }, notes),
    errorBox,
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => renderSong(song.id, query) }),
      el('button', { type: 'submit', class: 'btn primary', text: 'Save' })));
  form.elements.year.value = song.year == null ? '' : String(song.year);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(form));
    if (showErrors(form, errorBox, validateSong(fields))) return;
    try {
      await db.put('songs', updateSong(song, fields));
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = `Could not save the song: ${err.message}`;
      return;
    }
    renderSong(song.id, query);
  });

  viewEl.replaceChildren(el('div', { class: 'song-detail' }, form));
  viewEl.scrollTop = 0;
}
