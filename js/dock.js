// The dock (Design B): pinned at the bottom of every scope, from the bottom
// up, the scope bar (Tonight, Songs, Lists, History and a gear for
// Settings), the search field with its filter button, and a slot above them
// for a docked card (Tonight's Up next). The markup is in index.html; each
// scope's module hands the dock what it needs, so no module touches another.
//
//   dock.scope('songs')                      select a scope and render it
//   dock.onScope((name) => ...)              app.js: how to render one ('settings' too)
//   dock.search({ placeholder, label, value, onInput, onSubmit })   or null to hide
//   dock.filters({ count, onOpen })          or null to hide
//   dock.slot(element)                       or null to empty
//
// Switching scope clears the field, filters and slot; the new scope's root
// sets them again. On a detail screen (anything opened with openScreen) the
// field and slot hide and the scope bar stays; the KJ view hides it all
// (body[data-screen="kj"] in css/app.css).
import { onDraw } from './ui.js';

export const SCOPES = [
  ['tonight', 'Tonight'],
  ['songs', 'Songs'],
  ['lists', 'Lists'],
  ['history', 'History'],
];
const SCOPE_KEYS = SCOPES.map(([key]) => key);

const dockEl = document.getElementById('dock');
const slotEl = dockEl.querySelector('.dock-slot');
const searchRow = dockEl.querySelector('.dock-search');
const input = dockEl.querySelector('.dock-field input');
const clearButton = dockEl.querySelector('.dock-clear');
const filterButton = dockEl.querySelector('.dock-filter');
const filterBadge = filterButton.querySelector('.badge');
const scopeButtons = [...dockEl.querySelectorAll('.scopes button[data-scope]')];

let current = null; // the scope showing
let router = null; // set by app.js
let searchOpts = null;
let filterOpts = null;
let settingsOn = false;

// The selected scope is an accent pill; while Settings shows, the gear is.
function markScopes() {
  for (const button of scopeButtons) {
    const key = button.dataset.scope;
    const on = key === 'settings' ? settingsOn : key === current && !settingsOn;
    if (on) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}

// Selects `name` and renders it through the router; 'settings' opens Settings
// on top of the scope showing.
export function scope(name) {
  if (name !== 'settings') {
    current = SCOPE_KEYS.includes(name) ? name : SCOPE_KEYS[0];
    search(null);
    filters(null);
    slot(null);
    settingsOn = false;
    markScopes();
  }
  if (router) router(name === 'settings' ? 'settings' : current);
}

export function onScope(fn) {
  router = fn;
}

export function currentScope() {
  return current;
}

// Settings marks the gear while it shows; any other screen clears it.
export function showingSettings(on) {
  settingsOn = !!on;
  markScopes();
}

export function settingsShowing() {
  return settingsOn;
}

// ---- The search field ----

function syncSearchRow() {
  searchRow.hidden = !searchOpts && !filterOpts;
  dockEl.querySelector('.dock-field').hidden = !searchOpts;
  clearButton.hidden = !input.value;
}

export function search(opts) {
  searchOpts = opts || null;
  if (searchOpts) {
    input.placeholder = searchOpts.placeholder || '';
    input.setAttribute('aria-label', searchOpts.label || searchOpts.placeholder || 'Search');
    const value = searchOpts.value ?? '';
    if (input.value !== value) input.value = value;
  } else {
    input.value = '';
    if (document.activeElement === input) input.blur();
  }
  syncSearchRow();
}

// The field's text, for a scope that redraws and wants it as typed.
export function searchValue() {
  return searchOpts ? input.value : '';
}

input.addEventListener('input', () => {
  clearButton.hidden = !input.value;
  if (searchOpts && searchOpts.onInput) searchOpts.onInput(input.value);
});

searchRow.addEventListener('submit', (e) => {
  e.preventDefault();
  if (searchOpts && searchOpts.onSubmit) searchOpts.onSubmit(input.value);
});

clearButton.addEventListener('click', () => {
  input.value = '';
  clearButton.hidden = true;
  input.focus();
  if (searchOpts && searchOpts.onInput) searchOpts.onInput('');
});

// ---- The filter button ----

export function filters(opts) {
  filterOpts = opts || null;
  filterButton.hidden = !filterOpts;
  const count = filterOpts ? filterOpts.count || 0 : 0;
  filterBadge.textContent = count ? String(count) : '';
  filterBadge.hidden = !count;
  filterButton.setAttribute('aria-label', count ? `Filters, ${count} on` : 'Filters');
  filterButton.classList.toggle('on', count > 0);
  syncSearchRow();
}

filterButton.addEventListener('click', () => {
  if (filterOpts && filterOpts.onOpen) filterOpts.onOpen();
});

// ---- The slot above the field ----

export function slot(element) {
  if (element) {
    if (slotEl.firstChild !== element || slotEl.childNodes.length !== 1) slotEl.replaceChildren(element);
  } else {
    slotEl.replaceChildren();
  }
}

// ---- Wiring ----

for (const button of scopeButtons) {
  button.addEventListener('click', () => scope(button.dataset.scope));
}

// Detail screens keep the scope bar and hide the field and slot. Every draw
// clears the gear; Settings marks it again as it renders.
onDraw(({ depth }) => {
  dockEl.toggleAttribute('data-detail', depth > 0);
  if (settingsOn) {
    settingsOn = false;
    markScopes();
  }
});

// The visible height, which shrinks when a phone's keyboard opens; the
// matches above the field size themselves to it (css/app.css, --vvh).
if (window.visualViewport) {
  const vv = window.visualViewport;
  const setHeight = () => document.documentElement.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
  vv.addEventListener('resize', setHeight);
  setHeight();
}
