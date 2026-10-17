// Put a pop-up menu at a point, but inside the window: it opens upwards when there is no room below,
// leftwards near the right edge, and scrolls when it is taller than the window (user test 2026-10-17).

/**
 * @param {HTMLElement} menu shown already (display set), so it can be measured
 * @param {number} x @param {number} y the click
 */
export function placeMenu(menu, x, y) {
  const pad = 8;
  menu.style.maxHeight = `${window.innerHeight - 2 * pad}px`;
  menu.style.overflowY = 'auto';
  const w = menu.offsetWidth, h = Math.min(menu.offsetHeight, window.innerHeight - 2 * pad);
  const left = x + w > window.innerWidth - pad ? Math.max(pad, x - w) : x;
  const top = y + h > window.innerHeight - pad ? Math.max(pad, y - h) : y;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}
