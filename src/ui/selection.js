// Selecting rows in the list pages (Linjer, Kalendere): click selects one row, Ctrl-click (or the
// row's checkbox) toggles one, Shift-click selects the range from the last clicked row.

/**
 * @param {{ selected: Set<string>, anchor: string | null }} state
 * @param {string[]} shown the rows in the order shown
 * @param {string} id the clicked row
 * @param {{ shift?: boolean, ctrl?: boolean, toggle?: boolean }} how
 * @returns {{ selected: Set<string>, anchor: string | null }}
 */
export function pick({ selected, anchor }, shown, id, { shift = false, ctrl = false, toggle = false }) {
  if (shift && anchor && shown.includes(anchor)) {
    const [a, b] = [shown.indexOf(anchor), shown.indexOf(id)].sort((x, y) => x - y);
    return { selected: new Set(shown.slice(a, b + 1)), anchor };
  }
  if (ctrl || toggle) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    return { selected: next, anchor: id };
  }
  return { selected: new Set([id]), anchor: id };
}
