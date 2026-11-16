// Drag a list row to a new place (R16, R61) with pointer events, which work for
// touch, pen and mouse alike; native HTML5 drag and drop does not work in
// mobile browsers. The handle captures the pointer, so moves keep arriving
// wherever the finger goes, and its touch-action: none (app.css) stops the
// page scrolling. The dragged row is never taken out of the list, since that
// would drop the capture; its neighbours are moved past it instead.
//
//   dragToReorder({ list, li, handle, onDrop: (index) => save(index), onCancel: redraw });
//
// onDrop gets the row's new index among list.children; onCancel runs when the
// drag is interrupted, so the caller can draw the rows back where they were.
//
// Long moves: held within EDGE px of the top or bottom of the scrolling
// screen (the <main>), the drag scrolls it a few pixels a frame that way,
// faster nearer the edge, and the row keeps its place under the finger. It
// scrolls only the way the row has been moved, so grabbing a row at the
// bottom edge and nudging it up does not run off down the list.

const EDGE = 60; // px from the screen's top or bottom where a drag scrolls it
const MAX_STEP = 14; // px a frame, right at the edge
const MOVED = 4; // px the pointer must have moved that way before it scrolls

function middleOf(node) {
  const box = node.getBoundingClientRect();
  return box.top + box.height / 2;
}

// The screen that scrolls: the app's <main>, or the page itself.
function scrollerOf(list) {
  return list.closest('main') || document.scrollingElement;
}

function edgesOf(scroller) {
  if (scroller === document.scrollingElement) return { top: 0, bottom: window.innerHeight };
  const box = scroller.getBoundingClientRect();
  return { top: box.top, bottom: box.bottom };
}

// How far to scroll this frame with the pointer at `y`: negative up, positive
// down, 0 outside the edge zones or against the way the row has moved.
function edgeStep(y, top, bottom, startY) {
  if (y < top + EDGE && y < startY - MOVED) return -Math.ceil(MAX_STEP * Math.min(1, (top + EDGE - y) / EDGE));
  if (y > bottom - EDGE && y > startY + MOVED) return Math.ceil(MAX_STEP * Math.min(1, (y - (bottom - EDGE)) / EDGE));
  return 0;
}

export function dragToReorder({ list, li, handle, onDrop, onCancel }) {
  let drag = null; // { pointerId, grabY, startY, y, shift, frame } while dragging

  // Past the middle of the row below (or above), that row moves to the other
  // side; the lifted row follows the pointer from wherever it now sits, but
  // never past either end of the list.
  function follow() {
    const { y } = drag;
    for (let guard = list.children.length; guard > 0; guard -= 1) {
      const next = li.nextElementSibling;
      const prev = li.previousElementSibling;
      if (next && y > middleOf(next)) list.insertBefore(next, li);
      else if (prev && y < middleOf(prev)) list.insertBefore(prev, li.nextElementSibling);
      else break;
    }
    const home = li.getBoundingClientRect().top - drag.shift; // where the row sits in the list
    const ends = list.getBoundingClientRect();
    const wanted = Math.max(ends.top, Math.min(y - drag.grabY, ends.bottom - li.offsetHeight));
    drag.shift = wanted - home;
    li.style.transform = `translateY(${drag.shift}px)`;
  }

  // One frame of edge scrolling; it stops when the pointer leaves the zone,
  // that end of the list is clear of the zone, the screen can scroll no
  // further, or the drag ends. "Clear of the zone", not merely in view: on an
  // iPhone a finger cannot reach the top few dozen pixels under the status
  // bar, so a first row parked right at the edge could never be passed and
  // the song stopped at second place.
  function scrollFrame() {
    if (!drag) return;
    drag.frame = 0;
    const scroller = scrollerOf(list);
    const { top, bottom } = edgesOf(scroller);
    const step = edgeStep(drag.y, top, bottom, drag.startY);
    const ends = list.getBoundingClientRect();
    if (!step || (step > 0 && ends.bottom <= bottom - EDGE) || (step < 0 && ends.top >= top + EDGE)) return;
    const before = scroller.scrollTop;
    scroller.scrollTop = before + step;
    if (scroller.scrollTop === before) return;
    follow();
    drag.frame = requestAnimationFrame(scrollFrame);
  }

  handle.addEventListener('pointerdown', (e) => {
    if (drag || !e.isPrimary || e.button !== 0) return;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      return; // the pointer is already gone
    }
    e.preventDefault(); // no text selection while dragging
    drag = {
      pointerId: e.pointerId, grabY: e.clientY - li.getBoundingClientRect().top, startY: e.clientY, y: e.clientY, shift: 0, frame: 0,
    };
    li.classList.add('dragging');
  });

  handle.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.y = e.clientY;
    follow();
    if (!drag.frame) drag.frame = requestAnimationFrame(scrollFrame);
  });

  // Dropping hands the new index to the caller; a canceled drag puts the rows back.
  function end(e, drop) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    drag = null;
    li.classList.remove('dragging');
    li.style.transform = '';
    const index = [...list.children].indexOf(li);
    if (drop && index !== -1) onDrop(index, document.activeElement === handle);
    else onCancel();
  }
  handle.addEventListener('pointerup', (e) => end(e, true));
  handle.addEventListener('pointercancel', (e) => end(e, false));
  handle.addEventListener('lostpointercapture', (e) => end(e, false));
}
