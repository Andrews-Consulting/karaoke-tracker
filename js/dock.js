// The dock (Design B): pinned at the bottom of every scope, from the bottom
// up, the scope bar (Tonight, Songs, Lists, History and a gear for
// Settings), the search field with its filter button, and a slot above them
// for a docked card (Tonight's Up next). The markup is in index.html; each
// scope's module hands the dock what it needs, so no module touches another.
//
//   dock.scope('songs')                      select a scope and render it
//   dock.onScope((name) => ...)              app.js: how to render one ('settings' too)
//   dock.search({ placeholder, label, value, onInput, onSubmit, detail })   or null to hide
//   dock.filters({ count, onOpen })          or null to hide
//   dock.slot(element)                       or null to empty
//
// Switching scope clears the field, filters and slot; the new scope's root
// sets them again. On a detail screen (anything opened with openScreen) the
// field and slot hide and the scope bar stays, unless that screen hands the
// field over with `detail: true` (a list's songs, "Search Friday"), which
// lasts until the next screen is drawn; the KJ view hides it all
// (body[data-screen="kj"] in css/app.css).
import { onDraw, el } from './ui.js';

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
  dockEl.toggleAttribute('data-detail-search', !!(searchOpts && searchOpts.detail));
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

// Clearing keeps the keyboard up only if it was up: mid-typing, the field
// stays focused for the next search; with the keyboard down (coming back to a
// scope with an old search) the tap just empties the field, and the phone
// does not raise the keyboard. The check is made on pointerdown, before the
// tap can move focus, and the default is stopped then so focus never moves.
let fieldHadFocus = false;
clearButton.addEventListener('pointerdown', (e) => {
  fieldHadFocus = document.activeElement === input;
  if (fieldHadFocus) e.preventDefault();
});
clearButton.addEventListener('click', () => {
  input.value = '';
  clearButton.hidden = true;
  if (fieldHadFocus) input.focus();
  fieldHadFocus = false;
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
// clears the gear and a detail screen's hold on the field; Settings and that
// screen set them again as they render.
onDraw(({ depth }) => {
  dockEl.toggleAttribute('data-detail', depth > 0);
  dockEl.removeAttribute('data-detail-search');
  if (settingsOn) {
    settingsOn = false;
    markScopes();
  }
});

// The visible height, which shrinks when a phone's keyboard opens. The page
// is sized to it (css/app.css, --vvh), so the dock sits on the keyboard and
// <main> shrinks and scrolls inside rather than the page scrolling to the
// field and hiding the top of the screen. Safari still nudges the page when
// the field takes focus; scrolling back to the top keeps the layout honest.
// html[data-kb] says the keyboard is up, which the Songs scope uses to fold
// its header away. In Safari the keyboard shrinks only the visual viewport,
// but in a Home Screen app iOS shrinks the whole window with it (a phone
// read window 762 and visible 762, then 427 and 427 with the keyboard up), so
// the sign is a height well below the tallest this orientation has had.
const DEBUG_KEY = 'layoutDebug';
const KEYBOARD_DROP = 150;
const tallest = { portrait: 0, landscape: 0 };
let debugLine = null;

function fit() {
  const vv = window.visualViewport;
  const height = vv ? Math.round(vv.height) : window.innerHeight;
  const orientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  tallest[orientation] = Math.max(tallest[orientation], height);
  document.documentElement.style.setProperty('--vvh', `${height}px`);
  document.documentElement.toggleAttribute('data-kb', height < tallest[orientation] - KEYBOARD_DROP);
  if (vv && (window.scrollY || vv.offsetTop)) window.scrollTo(0, 0);
  if (debugLine) {
    debugLine.textContent = `window ${window.innerHeight} · visible ${height} · top ${vv ? Math.round(vv.offsetTop) : 0} · scroll ${Math.round(window.scrollY)}`;
  }
}

// Settings → Appearance switches a line of screen numbers on at the top of
// the dock, for checking the keyboard layout on a real phone.
export function setLayoutDebug(on) {
  try { localStorage.setItem(DEBUG_KEY, on ? '1' : ''); } catch { /* storage may be unavailable */ }
  if (on && !debugLine) {
    debugLine = el('p', { class: 'dock-debug', 'aria-hidden': 'true' });
    dockEl.prepend(debugLine);
  } else if (!on && debugLine) {
    debugLine.remove();
    debugLine = null;
  }
  fit();
}

export function layoutDebugOn() {
  try { return localStorage.getItem(DEBUG_KEY) === '1'; } catch { return false; }
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fit);
  window.visualViewport.addEventListener('scroll', fit);
}
window.addEventListener('resize', fit);
if (layoutDebugOn()) setLayoutDebug(true);
else fit();
