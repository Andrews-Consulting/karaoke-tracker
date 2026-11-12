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

// A "Not built yet" card listing what a section will do.
export function placeholder(lines) {
  return () => {
    viewEl.replaceChildren(
      el('div', { class: 'card stack' },
        el('p', { text: 'Not built yet.' }),
        el('ul', { class: 'muted' }, ...lines.map((line) => el('li', { text: line })))));
  };
}
