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

function middleOf(node) {
  const box = node.getBoundingClientRect();
  return box.top + box.height / 2;
}

export function dragToReorder({ list, li, handle, onDrop, onCancel }) {
  let drag = null; // { pointerId, grabY, shift } while dragging

  handle.addEventListener('pointerdown', (e) => {
    if (drag || !e.isPrimary || e.button !== 0) return;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      return; // the pointer is already gone
    }
    e.preventDefault(); // no text selection while dragging
    drag = { pointerId: e.pointerId, grabY: e.clientY - li.getBoundingClientRect().top, shift: 0 };
    li.classList.add('dragging');
  });

  handle.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const y = e.clientY;
    // Past the middle of the row below (or above), that row moves to the other side.
    for (let guard = list.children.length; guard > 0; guard -= 1) {
      const next = li.nextElementSibling;
      const prev = li.previousElementSibling;
      if (next && y > middleOf(next)) list.insertBefore(next, li);
      else if (prev && y < middleOf(prev)) list.insertBefore(prev, li.nextElementSibling);
      else break;
    }
    // The lifted row follows the pointer from wherever it now sits in the list.
    const top = li.getBoundingClientRect().top - drag.shift;
    drag.shift = e.clientY - drag.grabY - top;
    li.style.transform = `translateY(${drag.shift}px)`;
  });

  // Dropping hands the new index to the caller; a cancelled drag puts the rows back.
  function end(e, drop) {
    if (!drag || e.pointerId !== drag.pointerId) return;
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
