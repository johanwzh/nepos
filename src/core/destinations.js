// Destinations (destination displays spec): what a journey planner shows a trip goes to, from its
// first served stop, changing at later stops. A column holds its start (col.dest) and its changes
// (col.dests, one slot per stop row, parallel to col.cells), so writing times never touches them and
// row and column operations move them with the cells. Pure.
import { journeyStops } from './netex/journeys.js';

/** @typedef {{ text: string, vias: string[] }} Dest */
/**
 * @typedef {{ row: number, end: number, dest: Dest, start: boolean, colour: 0 | 1 | 2,
 *             state: 'ok' | 'unserved' | 'last' }} DestSegment
 */

/** The first word of a stop name ("Oslo S" → "Oslo"): people travel to places, not to stops. @param {string} name */
export function firstWord(name) {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

/** "via" written into a destination text: a via is data, not text. @param {string} text */
export function hasViaWord(text) {
  return /(^|[^\p{L}\p{N}])via($|[^\p{L}\p{N}])/iu.test(text ?? '');
}

/** @param {Dest | null | undefined} a @param {Dest | null | undefined} b */
export function sameDest(a, b) {
  if (!a || !b) return !a && !b;
  return a.text === b.text && a.vias.length === b.vias.length && a.vias.every((v, i) => v === b.vias[i]);
}

/** One string per distinct destination (compaction, NeTEx IDs). @param {Dest} d */
export function destKey(d) {
  return `${d.text}\u0001${d.vias.join('\u0002')}`;
}

/** @param {Dest} d @returns {{ text: string, vias: string }} */
export function destLabel(d) {
  return { text: d.text, vias: d.vias.length ? `via ${d.vias.join(', ')}` : '' };
}

/**
 * Every column gets a start (null = none yet) and a change list exactly as long as the stops.
 * @param {{ stops: any[], cols: any[] }} grid
 */
export function normalizeDests(grid) {
  const n = grid.stops.length;
  for (const col of grid.cols) {
    if (col.dest === undefined) col.dest = null;
    const old = Array.isArray(col.dests) ? col.dests : [];
    col.dests = Array.from({ length: n }, (_, i) => old[i] ?? null);
    // A waiting stop is one call: a destination on its arrival row belongs on its departure row, when this
    // trip has times on both (otherwise it is a change on a row the trip does not serve, and stays flagged)
    const timed = (/** @type {any} */ c) => !!c?.time && c.time !== '|';
    for (let r = 0; r < n - 1; r++) {
      if (!grid.stops[r]?.isDwellArr || !col.dests[r] || !timed(col.cells?.[r]) || !timed(col.cells?.[r + 1])) continue;
      if (!col.dests[r + 1]) col.dests[r + 1] = col.dests[r];
      col.dests[r] = null;
    }
  }
}

/** The rows a trip calls at, exactly as the export writes them. @param {{ stops: any[] }} grid @param {{ cells: any[] }} col */
export function servedRows(grid, col) {
  return journeyStops(grid, col).map((c) => c.ri);
}

/**
 * Where each destination of a column starts and ends, for drawing and checking.
 * @param {{ stops: any[] }} grid @param {any} col
 * @returns {DestSegment[]}
 */
export function destSegments(grid, col) {
  const served = servedRows(grid, col);
  const first = served[0], last = served[served.length - 1];
  /** @type {{ row: number, dest: Dest, start: boolean }[]} */
  const marks = [];
  if (col.dest && served.length) marks.push({ row: first, dest: col.dest, start: true });
  (col.dests ?? []).forEach((/** @type {Dest | null} */ dest, /** @type {number} */ row) => {
    if (dest) marks.push({ row, dest, start: false });
  });
  marks.sort((a, b) => a.row - b.row || (a.start ? -1 : 1));
  const endRow = last ?? grid.stops.length - 1;
  // A change on a row the trip does not serve draws no line: it does not end the destination before it
  const counts = (/** @type {{ row: number, start: boolean }} */ m) => m.start || (served.includes(m.row) && m.row > first);
  return marks.map((m, i) => {
    const next = marks.slice(i + 1).find(counts);
    const end = next ? Math.max(m.row, next.row - 1) : Math.max(m.row, endRow);
    /** @type {'ok' | 'unserved' | 'last'} */
    let state = 'ok';
    if (!m.start) {
      if (!served.includes(m.row) || m.row <= first) state = 'unserved';
      else if (m.row === last) state = 'last';
    }
    return { row: m.row, end, dest: m.dest, start: m.start, colour: /** @type {0 | 1 | 2} */ (i % 3), state };
  });
}

/** The destination in effect at a row (the last start or change at or above it). @param {{ stops: any[] }} grid @param {any} col @param {number} row */
export function effectiveDestAt(grid, col, row) {
  /** @type {Dest | null} */
  let out = null;
  for (const s of destSegments(grid, col)) if (s.row <= row && s.state !== 'unserved') out = s.dest;
  return out;
}

// ─── Editing ────────────────────────────────────────────────────────────────
/** @param {Dest} d @returns {Dest} */
const clone = (d) => ({ text: d.text, vias: [...d.vias] });

/**
 * Set (or with null remove) the destination from a row on. On or above the first served row it is the
 * column's start; further down a change, never on the last served row or a row the trip does not
 * serve. A change equal to the destination already in effect is removed instead.
 * @param {{ stops: any[] }} grid @param {any} col @param {number} row @param {Dest | null} dest
 * @returns {boolean} changed
 */
export function setDestAt(grid, col, row, dest) {
  const served = servedRows(grid, col);
  if (!served.length) return false;
  const first = served[0], last = served[served.length - 1];
  if (row <= first) { col.dest = dest ? clone(dest) : null; return true; }
  if (!dest) {
    if (!col.dests[row]) return false;
    col.dests[row] = null;
    return true;
  }
  if (!served.includes(row) || row === last) return false;
  col.dests[row] = null;
  col.dests[row] = sameDest(effectiveDestAt(grid, col, row - 1), dest) ? null : clone(dest);
  return true;
}

/**
 * Move a change to another served row (not the first or the last); one already there is replaced.
 * @param {{ stops: any[] }} grid @param {any} col @param {number} from @param {number} to
 */
export function moveChange(grid, col, from, to) {
  const dest = col.dests[from];
  const served = servedRows(grid, col);
  if (!dest || from === to || !served.includes(to) || to <= served[0] || to === served[served.length - 1]) return false;
  col.dests[to] = dest;
  col.dests[from] = null;
  return true;
}

/**
 * Shift+drag: the stop at toRow becomes a via of the destination that starts at labelRow (vias in stop
 * order), and from that stop on the destination goes on without it.
 * @param {{ stops: any[] }} grid @param {any} col @param {number} labelRow @param {number} toRow
 */
export function viaDrag(grid, col, labelRow, toRow) {
  const served = servedRows(grid, col);
  const seg = destSegments(grid, col).find((s) => s.row === labelRow && s.state === 'ok');
  if (!seg || !served.includes(toRow) || toRow <= labelRow || toRow > seg.end || toRow === served[served.length - 1]) return false;
  const via = firstWord(grid.stops[toRow].name);
  if (!via || seg.dest.vias.includes(via)) return false;
  // Where each existing via is passed, to keep them in stop order
  const rowOf = (/** @type {string} */ v) => served.find((r) => r > labelRow && firstWord(grid.stops[r].name) === v) ?? Infinity;
  const vias = [...seg.dest.vias];
  const at = vias.findIndex((v) => rowOf(v) > toRow);
  vias.splice(at < 0 ? vias.length : at, 0, via);
  const updated = { text: seg.dest.text, vias };
  if (seg.start) col.dest = updated; else col.dests[labelRow] = updated;
  if (!col.dests[toRow]) col.dests[toRow] = { text: seg.dest.text, vias: vias.filter((v) => v !== via) };
  return true;
}

/**
 * A suggestion from the stop pattern (served stops only): the last stop; a bold stop is a via that
 * drops off there (bold + underline counts as bold); an underlined stop is a destination of its own,
 * after which the trip goes on to the next one.
 * @param {{ stops: any[] }} grid @param {any} col
 * @returns {{ dest: Dest | null, dests: (Dest | null)[] }}
 */
export function suggestDests(grid, col) {
  /** @type {(Dest | null)[]} */
  const dests = grid.stops.map(() => null);
  const served = servedRows(grid, col);
  if (!served.length) return { dest: null, dests };
  const first = served[0], last = served[served.length - 1];
  const inner = served.slice(1, -1);
  const word = (/** @type {number} */ r) => firstWord(grid.stops[r].name);
  const splits = inner.filter((r) => grid.stops[r].sep && !grid.stops[r].bold);
  /** @type {Dest | null} */
  let dest = null;
  const bounds = [first, ...splits];
  bounds.forEach((from, i) => {
    const to = splits[i] ?? last;
    const bold = inner.filter((r) => r > from && r < to && grid.stops[r].bold);
    let vias = bold.map(word);
    const startDest = { text: word(to), vias: [...vias] };
    if (i === 0) dest = startDest; else dests[from] = startDest;
    for (const b of bold) {
      vias = vias.filter((v, k) => k !== vias.indexOf(word(b)));
      dests[b] = { text: word(to), vias: [...vias] };
    }
  });
  return { dest, dests };
}

/** Write the suggestion into the column. @param {{ stops: any[] }} grid @param {any} col */
export function applySuggestion(grid, col) {
  const s = suggestDests(grid, col);
  col.dest = s.dest;
  col.dests = s.dests;
  return true;
}

/**
 * The destinations in rows r0…r1 of a column, for pasting elsewhere.
 * @param {{ stops: any[] }} grid @param {any} col @param {number} r0 @param {number} r1
 * @returns {{ start: Dest | null, changes: { offset: number, dest: Dest }[] }}
 */
export function copyDests(grid, col, r0, r1) {
  const first = servedRows(grid, col)[0];
  const start = col.dest && first !== undefined && first >= r0 && first <= r1 ? clone(col.dest) : null;
  const changes = [];
  for (let r = r0; r <= r1; r++) if (col.dests[r]) changes.push({ offset: r - r0, dest: clone(col.dests[r]) });
  return { start, changes };
}

/**
 * Paste copied destinations from row r0 down: what was there in the range goes, the start goes on the
 * column's own first served stop, changes that fall on rows it does not serve (or its last) are left out.
 * @param {{ stops: any[] }} grid @param {any} col
 * @param {{ start: Dest | null, changes: { offset: number, dest: Dest }[] }} clip @param {number} r0
 */
export function pasteDests(grid, col, clip, r0) {
  // Only the rows the copied changes cover are cleared (pasting just a start clears nothing)
  const span = clip.changes.length ? Math.max(...clip.changes.map((c) => c.offset)) : -1;
  for (let r = r0; r <= r0 + span && r < col.dests.length; r++) col.dests[r] = null;
  if (clip.start) col.dest = clone(clip.start);
  const first = servedRows(grid, col)[0];
  for (const c of clip.changes) {
    const row = r0 + c.offset;
    if (clip.start && first !== undefined && row <= first) continue;
    setDestAt(grid, col, row, c.dest);
  }
  return true;
}

/** The destinations of all columns, for a one-step undo. @param {any[]} cols */
export function snapshotDests(cols) {
  return JSON.stringify(cols.map((c) => [c.dest ?? null, c.dests ?? []]));
}

/** @param {any[]} cols @param {string} snap */
export function restoreDests(cols, snap) {
  const data = JSON.parse(snap);
  cols.forEach((c, i) => { if (data[i]) { c.dest = data[i][0]; c.dests = data[i][1]; } });
}
