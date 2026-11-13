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

// Asks before a destructive action (delete, restore). Returns true to proceed.
// Kept in one place so every confirmation reads the same way and tests can
// accept it with page.on('dialog').
export function confirmAction(message) {
  return window.confirm(message);
}

// ---------- Screens and the back gesture (R31) ----------
//
// Each tab has a root screen (its list). Opening a detail screen with
// openScreen() pushes a history entry, so the phone's back gesture, or the
// browser's back button, returns to the previous screen instead of leaving the
// installed app. In-page Back buttons use closeScreen(), which goes back in
// history so the two stay in step. The stack holds render functions, so a
// screen reached by going back is drawn again with the state it had.
const screens = []; // screens[0] is the current tab's root
let currentView = null;
let pendingBack = null; // what to render when the next popstate arrives, if not the stack entry
let switchView = null; // set by app.js: shows another tab's root screen

export function setViewSwitcher(fn) {
  switchView = fn;
}

// A full-screen screen (e.g. the song shown to the KJ, R54) sets
// body[data-screen] to hide the header and tabs. Every render through the
// stack clears it first, so leaving that screen by any route restores them.
function draw(render) {
  delete document.body.dataset.screen;
  return render();
}

// Starts a tab: its list becomes the only screen on the stack. Tabs replace
// the current history entry rather than adding one, so back from a tab's list
// leaves the app the way it would from any other app's home screen.
export function rootScreen(view, render) {
  currentView = view;
  screens.length = 0;
  screens.push(render);
  pendingBack = null;
  history.replaceState({ view, depth: 0 }, '');
  return draw(render);
}

// Shows a detail screen on top of the current one, with a history entry.
export function openScreen(render) {
  screens.push(render);
  history.pushState({ view: currentView, depth: screens.length - 1 }, '');
  return draw(render);
}

// Leaves the current detail screen, rendering `render` (usually the screen
// below with some state, e.g. the song to scroll to). Goes back in history when
// the current entry is this screen's, so the back gesture stays in step.
export function closeScreen(render) {
  const top = screens.length - 1;
  const state = history.state;
  if (top > 0 && state && state.view === currentView && state.depth === top) {
    pendingBack = render;
    history.back(); // the popstate handler trims the stack and renders
    return;
  }
  screens.length = Math.max(1, top);
  draw(render);
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
  if (render) draw(render);
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
