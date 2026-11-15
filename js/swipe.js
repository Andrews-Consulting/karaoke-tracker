// Swipe a row sideways to reveal the actions behind it: Tonight's rows (R49,
// R75) and a list's songs on the Lists scope (R16, R15).
//
//   swipeToReveal({ li, surface, panel, isOpen, onOpen, onClose });
//
// `surface` is the part of the row the finger moves on; `panel` holds the
// actions and slides in from the right over the row's end, following the
// finger, so the title at the left stays readable. The panel is always in
// the page, so a keyboard or a screen reader reaches its buttons without the
// gesture: focusing one opens the row. Pointer events; `touch-action: pan-y`
// on the surface leaves vertical scrolling to the browser and hands us the
// sideways moves. A swipe starts once the pointer has moved 10 px, more
// sideways than up or down; a press on the drag handle (which js/drag.js
// captures) or inside the panel never starts one. A tap on an open row's
// surface closes it, and a tap that ended a swipe is not a tap on whatever
// was under it.
const THRESHOLD = 10;

export function swipeToReveal({ li, surface, panel, isOpen, onOpen, onClose }) {
  const width = () => panel.offsetWidth || 160;
  let start = null; // { x, y, id, from } while a pointer is down on the surface
  let dragging = false;
  let swiped = false; // a swipe just ended: swallow the click it causes
  let shown = 0; // how far the panel is in, 0..width, while dragging

  surface.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.handle') || panel.contains(e.target)) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, from: isOpen() ? width() : 0 };
    dragging = false;
  });

  surface.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragging) {
      if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
      dragging = true;
      surface.setPointerCapture(e.pointerId);
      li.classList.add('swiping');
    }
    shown = Math.max(0, Math.min(width(), start.from - dx));
    panel.style.transform = `translateX(${width() - shown}px)`;
  });

  function end(e) {
    if (!start || e.pointerId !== start.id) return;
    start = null;
    if (!dragging) return;
    dragging = false;
    swiped = true;
    setTimeout(() => { swiped = false; }, 0);
    li.classList.remove('swiping');
    panel.style.transform = '';
    if (shown > width() / 2) onOpen();
    else onClose();
  }
  surface.addEventListener('pointerup', end);
  surface.addEventListener('pointercancel', end);

  // A swipe is not a tap; a tap on an open row's surface closes it.
  li.addEventListener('click', (e) => {
    if (panel.contains(e.target)) return;
    if (swiped || isOpen()) {
      e.preventDefault();
      e.stopPropagation();
      if (!swiped) onClose();
    }
  }, true);

  // Keyboard and screen readers: landing on an action opens the row.
  li.addEventListener('focusin', (e) => {
    if (panel.contains(e.target) && !isOpen()) onOpen();
  });
}
