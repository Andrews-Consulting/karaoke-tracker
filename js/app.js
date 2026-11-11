import { db } from './db.js';

const APP_VERSION = '0.1.0';

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('view-title');
const tabButtons = document.querySelectorAll('.tabs button');

// Small DOM helper. Text always goes in through textContent, never innerHTML,
// so song titles and notes can hold any characters safely.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child != null) node.append(child);
  }
  return node;
}

// ---------- Songs (R1, R10, R36 so far) ----------

async function renderSongs() {
  const songs = await db.getAll('songs');
  songs.sort((a, b) => a.title.localeCompare(b.title));

  const count = el('p', { class: 'count' });
  const list = el('ul', { class: 'list' });

  function draw(query) {
    const q = query.trim().toLowerCase();
    const shown = q
      ? songs.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
      : songs;

    count.textContent = `${shown.length} of ${songs.length} songs`;
    list.replaceChildren(
      ...shown.map((s) => {
        const details = [s.artist, s.genre, s.year].filter(Boolean).join(' · ');
        return el('li', {},
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

  const form = el('form', { class: 'stack' },
    el('label', { text: 'Title' }, el('input', { name: 'title', required: '', autocomplete: 'off' })),
    el('label', { text: 'Artist' }, el('input', { name: 'artist', required: '', autocomplete: 'off' })),
    el('div', { class: 'row' },
      el('label', { text: 'Genre' }, el('input', { name: 'genre', autocomplete: 'off' })),
      el('label', { text: 'Year' }, el('input', { name: 'year', type: 'number', min: '1900', max: '2100', inputmode: 'numeric' }))),
    el('button', { class: 'btn primary', type: 'submit', text: 'Add song' }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const year = Number(data.get('year'));
    await db.add('songs', {
      title: data.get('title').trim(),
      artist: data.get('artist').trim(),
      genre: data.get('genre').trim(),
      year: year || null,
      key: '',
      notes: '',
      rating: null,
      status: 'go-to',
      tags: [],
      createdAt: new Date().toISOString(),
    });
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

// ---------- Placeholders for the next sections ----------

function placeholder(lines) {
  return () => {
    viewEl.replaceChildren(
      el('div', { class: 'card stack' },
        el('p', { text: 'Not built yet.' }),
        el('ul', { class: 'muted' }, ...lines.map((line) => el('li', { text: line })))));
  };
}

// ---------- Settings (R19 so far) ----------

async function renderSettings() {
  const status = el('p', { class: 'muted' });

  async function refresh() {
    if (!navigator.storage || !navigator.storage.persisted) {
      status.textContent = 'This browser does not report storage persistence.';
      return;
    }
    const persisted = await navigator.storage.persisted();
    status.textContent = persisted
      ? 'Storage is persistent: the browser will not clear it on its own.'
      : 'Storage is not persistent yet. Installing the app to the home screen usually fixes this.';
  }

  const ask = el('button', {
    class: 'btn', type: 'button', text: 'Ask for persistent storage',
    onclick: async () => {
      if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
      refresh();
    },
  });

  viewEl.replaceChildren(
    el('div', { class: 'stack' },
      el('div', { class: 'card stack' }, el('strong', { text: 'Storage' }), status, ask),
      el('div', { class: 'card stack' },
        el('strong', { text: 'Backup' }),
        el('p', { class: 'muted', text: 'Not built yet: JSON backup and restore (R20, R21), CSV import (R22).' })),
      el('p', { class: 'count', text: `Version ${APP_VERSION}` })));
  refresh();
}

// ---------- Navigation ----------

const views = {
  songs: { title: 'Songs', render: renderSongs },
  setlists: {
    title: 'Setlists',
    render: placeholder([
      'Venue-specific or general setlists (R39, R14, R15)',
      'Flag songs already sung at the venue (R43)',
      'Mix by genre and decade (R44)',
    ]),
  },
  venues: {
    title: 'Venues',
    render: placeholder([
      'Add, rename and delete venues (R40)',
      'Log a song as sung at a venue (R8)',
    ]),
  },
  settings: { title: 'Settings', render: renderSettings },
};

function show(name) {
  const view = views[name] || views.songs;
  titleEl.textContent = view.title;
  for (const button of tabButtons) {
    if (button.dataset.view === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  view.render();
}

for (const button of tabButtons) {
  button.addEventListener('click', () => show(button.dataset.view));
}

// ---------- Startup ----------

// R19: ask once at startup. Browsers may grant this silently or ignore it.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// R27: offline support. Service workers need HTTPS or http://localhost.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => {
    console.warn('Service worker registration failed:', err);
  });
}

show('songs');
