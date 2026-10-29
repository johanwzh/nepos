// Day-shift lines (docs/superpowers/specs/2026-10-29-day-shift-lines-design.md): a trip's date change is drawn as a
// line on the top edge of the later time's cell, in place of `+1` text. The first time gets a line when it already has
// a day offset. Passes (`|`) and empty rows carry no line; the line goes on the next time.

/**
 * Row index → days the date jumps above that row's time (only jumps > 0).
 * @param {(any | null)[]} cells one column's cells, top to bottom
 * @returns {Map<number, number>}
 */
export function dayLines(cells) {
  /** @type {Map<number, number>} */
  const lines = new Map();
  let prev = 0;
  cells.forEach((cell, r) => {
    if (!cell?.time || cell.time === '|') return;
    const day = cell.dayOffset || 0;
    if (day - prev > 0) lines.set(r, day - prev);
    prev = day;
  });
  return lines;
}
