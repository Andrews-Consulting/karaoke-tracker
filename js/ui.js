// Shared UI helpers. Every view imports from here.

// Small DOM helper. Text always goes in through textContent, never innerHTML,
// so song titles and notes can hold any characters safely.
//
//   el('button', { class: 'btn', text: 'Save', onclick: save })
//   el('label', { text: 'Title' }, el('input', { name: 'title' }))
//
// Props: `class` sets className, `text` sets textContent, `on<event>` adds a
// listener, anything else becomes an attribute. Null children are skipped.
export function el(tag, props = {}, ...children) {
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

// The <main> element every view renders into.
export const viewEl = document.getElementById('view');

// A stroked 24 x 24 icon, hidden from screen readers (the button says what it does).
//   icon(['M6 9l6 6 6-6'], { size: 20, width: 2.4 })
const SVG_NS = 'http://www.w3.org/2000/svg';
export function icon(paths, { size = 20, width = 2.4 } = {}) {
  const node = document.createElementNS(SVG_NS, 'svg');
  const attrs = {
    'aria-hidden': 'true', width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  };
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    node.append(path);
  }
  return node;
}

export const ICONS = {
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  undo: ['M9 14L4 9l5-5', 'M4 9h11a5 5 0 010 10h-3'],
  chevron: ['M6 9l6 6 6-6'],
  grip: ['M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  search: ['M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z', 'M20 20l-3.5-3.5'],
  plus: ['M12 5v14M5 12h14'],
};

// Asks before a destructive action (delete, restore). Returns true to proceed.
// Kept in one place so every confirmation reads the same way and tests can
// accept it with page.on('dialog').
export function confirmAction(message) {
  return window.confirm(message);
}

// ---------- Screens and the back gesture (R31) ----------
//
// Each scope (Tonight, Songs, Lists, History) has a root screen. Opening a
// detail screen with openScreen() pushes a history entry, so the phone's back
// gesture, or the browser's back button, returns to the previous screen
// instead of leaving the installed app. In-page Back buttons use
// closeScreen(), which goes back in history so the two stay in step. The
// stack holds render functions, so a screen reached by going back is drawn
// again with the state it had.
const screens = []; // screens[0] is the current scope's root
let currentView = null;
let pendingBack = null; // what to render when the next popstate arrives, if not the stack entry
let switchView = null; // set by app.js: shows another scope's root screen

export function setViewSwitcher(fn) {
  switchView = fn;
}

// Called before every render through the stack with { view, depth }: the
// dock hides its field on detail screens and app.js keeps the page title.
const drawHooks = [];
export function onDraw(fn) {
  drawHooks.push(fn);
}

// Counts renders through the stack. A screen that loads before drawing takes
// a ticket first and draws only while screenStillShowing(ticket), so a slow
// load never paints over a screen opened, closed or switched to meanwhile.
let drawCount = 0;
export function screenTicket() {
  return drawCount;
}
export function screenStillShowing(ticket) {
  return ticket === drawCount;
}

// A full-screen screen (the KJ view, R54) sets body[data-screen] to hide the
// dock and banners. Every render through the stack clears it first, so
// leaving that screen by any route restores them.
function draw(render) {
  drawCount += 1;
  delete document.body.dataset.screen;
  for (const hook of drawHooks) hook({ view: currentView, depth: screens.length - 1 });
  return render();
}

// True while a render was started by going back (the back gesture, the
// browser's back button or closeScreen), as opposed to a scope tap or opening
// a screen. A view reads it synchronously at the start of its render; a
// scope's root may reopen where it was on a tap but must not on the way back (R60).
let backRender = false;
export function renderingBack() {
  return backRender;
}

function drawBack(render) {
  backRender = true;
  try {
    return draw(render);
  } finally {
    backRender = false;
  }
}

// Starts a scope: its root becomes the only screen on the stack. Scopes
// replace the current history entry rather than adding one, so back from a
// scope's root leaves the app the way it would from any other app's home
// screen. The entry names the scope, so a reload shows the same one.
export function rootScreen(view, render) {
  currentView = view;
  screens.length = 0;
  screens.push(render);
  pendingBack = null;
  history.replaceState({ view, depth: 0 }, '');
  return draw(render);
}

// The scope a reload of this history entry was showing, or null on a fresh load.
export function viewInHistory() {
  return (history.state && history.state.view) || null;
}

// True when a detail screen is on top of the scope's root.
export function onDetailScreen() {
  return screens.length > 1;
}

// Shows a detail screen on top of the current one, with a history entry.
export function openScreen(render) {
  screens.push(render);
  history.pushState({ view: currentView, depth: screens.length - 1 }, '');
  return draw(render);
}

// Replaces the current screen with another at the same place in the history,
// for a screen that turns into a different one (a merged list showing its
// target): back from whatever opens on top returns to the new screen, not
// the old one, and the back gesture from it still leaves as before.
export function replaceScreen(render) {
  screens[screens.length - 1] = render;
  return draw(render);
}

// Leaves the current detail screen, rendering `render` (usually the screen
// below with some state, e.g. the song to scroll to), or without one the
// screen below as it was. Goes back in history when the current entry is this
// screen's, so the back gesture stays in step.
export function closeScreen(render = null) {
  const top = screens.length - 1;
  const state = history.state;
  if (top > 0 && state && state.view === currentView && state.depth === top) {
    pendingBack = render;
    history.back(); // the popstate handler trims the stack and renders
    return;
  }
  screens.length = Math.max(1, top);
  drawBack(render || screens[screens.length - 1]);
}

window.addEventListener('popstate', (event) => {
  const state = event.state || { view: currentView, depth: 0 };
  if (state.view && state.view !== currentView && switchView) {
    pendingBack = null;
    switchView(state.view);
    return;
  }
  const depth = Math.max(0, Math.min(state.depth ?? 0, screens.length - 1));
  screens.length = depth + 1;
  const render = pendingBack || screens[depth];
  pendingBack = null;
  if (render) drawBack(render);
});

// A "Not built yet" card listing what a section will do.
export function placeholder(lines) {
  return () => {
    viewEl.replaceChildren(
      el('div', { class: 'card stack' },
        el('p', { text: 'Not built yet.' }),
        el('ul', { class: 'muted' }, ...lines.map((line) => el('li', { text: line })))));
  };
}
