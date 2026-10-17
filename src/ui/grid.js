// The timetable grid, ported from Nepos 1.5.7 (nepos.html lines 3914–4672). Rows are stops,
// columns are departures. Differences from 1.5.7:
// - no price column and no vehicle row (both hidden in Nepos 2; the data stays in the file);
// - no stop search list: a stop is a name, and an existing stop ID is kept when the name is
//   corrected (picking NSR stops arrives in Plan 3);
// - no distance interpolation and no map updates (both need stop coordinates — Plan 3);
// - a read-only mode for routes the integrity check marked damaged.
import { t } from '../i18n/strings.js';
import { isValidDayCode } from '../core/ern/validate.js';
import { parseCellInput } from '../core/grid-input.js';
import { currentPage, showMessage, addOnce } from './shell.js';
import { stopMark, loadQuays, quayInfo, onQuaysLoaded } from './quays.js';
import { NSR_QUAY_PATTERN } from '../core/quays.js';
import { openFnEditor, closeFnEditor, updateFnPreview } from './footnote-editor.js';
import { interpolateTime, extrapolateTime, speedUnit, toKmh, interpolateSpan } from '../core/interpolate.js';
import { openDayCodeHelper } from './day-code-helper.js';
import { sortColumns } from '../core/column-sort.js';
import { openCopyInterval } from './copy-interval.js';
import { openTimeNudge } from './time-nudge.js';
import { shiftTimes } from '../core/time-shift.js';
import { openDatePicker } from './date-picker.js';
import { unionDays, tripDays } from '../core/calendars.js';
import { app } from './state.js';

/** The grid being edited: one period × direction of the open route. */
export const grid = {
  /** @type {any[]} */ stops: [],
  /** @type {any[]} */ cols: [],
  /** the trip-number row is shown (a column's number is col.tripNo) */
  tripRow: false,
  active: false,
  readOnly: false,
};

let baseline = '';
/** @type {() => void} */
let onChange = () => {};

/** Called whenever the grid differs from what was loaded or last saved. @param {() => void} fn */
export function onGridChange(fn) {
  onChange = fn;
}

/** @type {(() => void)[]} */
const renderListeners = [];

/** Called after every grid render (the map follows the selected trip). @param {() => void} fn */
export function onGridRender(fn) {
  addOnce(renderListeners, fn);
}

/** Where a stop is, from the NSR lookups. @param {any} stop @returns {[number, number] | null} */
function posOf(stop) {
  const info = stop?.stopId == null ? null : quayInfo.get(String(stop.stopId));
  return info?.lat != null && info.lon != null ? [info.lon, info.lat] : null;
}

let ancR = 0, ancC = 0, endR = 0, endC = 0;
let editing = false, editBuf = '';
let inDC = false, dcCol = 0, dcEdit = false, dcBuf = '';
/** The trip-number row: selected (its column is dcCol), being typed in */
let inTN = false, tnEdit = false, tnBuf = '';
let inStopCol = false;
/** A mouse button is held after a click in a time cell: moving over cells extends the range */
let dragging = false;
let ctxR = -1, ctxC = -1, ctxIsStop = false, ctxStopRow = -1, ctxDCCol = -1;
let ixMode = false;
/** @type {{ r: number, c: number, type: string } | null} */
let ixSource = null;
let inStopEdit = false, stopEditRow = -1, stopBuf = '', stopPrevName = '';

const $ = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
const clampR = (/** @type {number} */ r) => Math.max(0, Math.min(grid.stops.length - 1, r));
const clampC = (/** @type {number} */ c) => Math.max(0, Math.min(grid.cols.length - 1, c));
const esc = (/** @type {string} */ s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const snapshot = () => JSON.stringify([grid.stops, grid.cols, grid.tripRow]);

/** Index of the selected column (for the footnote preview and, in Plan 3, the map). */
export function selectedColumn() {
  return inDC ? dcCol : ancC;
}

/**
 * Show a period × direction.
 * @param {{ stops: any[], cols: any[] }} data
 * @param {{ readOnly?: boolean }} [opts]
 */
export function loadGrid(data, { readOnly = false } = {}) {
  grid.stops = JSON.parse(JSON.stringify(data.stops));
  grid.cols = JSON.parse(JSON.stringify(data.cols));
  grid.tripRow = !!(/** @type {any} */ (data).tripRow);
  inTN = false; tnEdit = false; tnBuf = '';
  // Every column on screen has its stable ID, so saving twice writes the same text.
  for (const col of grid.cols) if (!col.uid) col.uid = crypto.randomUUID();
  grid.readOnly = readOnly;
  grid.active = true;
  baseline = snapshot();
  ancR = 0; ancC = 0; endR = 0; endC = 0;
  editing = false; editBuf = ''; inDC = false; dcEdit = false; inStopCol = false;
  ixMode = false; ixSource = null; inStopEdit = false;
  closeFnEditor(); // its target position belongs to the grid that was shown before
  $('tbl-wrap').style.display = 'block';
  render();
}

/** Finish a half-typed time, day code or stop name, so it counts as a change. */
export function commitPending() {
  if (!grid.active || grid.readOnly) return;
  if (editing) commitEdit();
  if (dcEdit) commitDayCode();
  if (tnEdit) commitTripNo();
  if (inStopEdit) commitStopEdit();
}

/** A copy of the grid's data, for storing in the route state. */
export function gridData() {
  return { stops: JSON.parse(JSON.stringify(grid.stops)), cols: JSON.parse(JSON.stringify(grid.cols)), tripRow: grid.tripRow };
}

/** The grid now matches what is saved. */
export function markGridClean() {
  baseline = snapshot();
}

export function clearGrid() {
  grid.active = false;
  grid.tripRow = false;
  grid.stops = [];
  grid.cols = [];
  $('tbl-wrap').style.display = 'none';
  $('tbl').innerHTML = '';
  hideCtx();
  closeFnEditor();
  updateFnPreview(null);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function rect() {
  return { r1: Math.min(ancR, endR), r2: Math.max(ancR, endR), c1: Math.min(ancC, endC), c2: Math.max(ancC, endC) };
}
/** @param {number} r @param {number} c */
function inRect(r, c) {
  const { r1, r2, c1, c2 } = rect();
  return r >= r1 && r <= r2 && c >= c1 && c <= c2;
}
/** @param {string} time @param {number} off */
const toMins = (time, off) => (off || 0) * 1440 + parseInt(time.slice(0, 2), 10) * 60 + parseInt(time.slice(2, 4), 10);
/** A time earlier than the stop above it in the same column. @param {number} r @param {number} c */
function isDecreasing(r, c) {
  const cell = grid.cols[c].cells[r];
  if (!cell || !cell.time || cell.time === '|') return false;
  const cur = toMins(cell.time, cell.dayOffset);
  for (let i = r - 1; i >= 0; i--) {
    const p = grid.cols[c].cells[i];
    if (p && p.time && p.time !== '|') return cur < toMins(p.time, p.dayOffset);
  }
  return false;
}
/** @param {any} cell @param {boolean} isEdit @param {string} buf */
function cellHTML(cell, isEdit, buf) {
  if (isEdit) return esc(buf) + '▌';
  if (!cell || !cell.time) return '';
  if (cell.time === '|') return '|';
  let h = esc(cell.time);
  if (cell.suffix) h += `<span class="g-sfx-${cell.suffix}">${cell.suffix}</span>`;
  if (cell.dayOffset > 0) h += `<span class="g-day-off"> +${cell.dayOffset}</span>`;
  return h;
}
/** @param {number} r @param {number} c */
const hasTime = (r, c) => { const cell = grid.cols[c].cells[r]; return !!(cell && cell.time && cell.time !== '|'); };
/** @param {number} r @param {number} c */
function ixTarget(r, c) {
  if (c < 0 || c >= grid.cols.length || r < 0 || r >= grid.stops.length) return null;
  const cell = grid.cols[c].cells[r];
  if (!cell || !cell.interchange) return null;
  const { targetC, targetR } = cell.interchange;
  if (targetR < 0 || targetR >= grid.stops.length || targetC < 0 || targetC >= grid.cols.length) return null;
  return { r: targetR, c: targetC, type: cell.interchange.type };
}
/** @param {number} r @param {number} c */
function ixSources(r, c) {
  const out = [];
  for (let sc = 0; sc < grid.cols.length; sc++) for (let sr = 0; sr < grid.stops.length; sr++) {
    const cell = grid.cols[sc].cells?.[sr];
    if (cell && cell.interchange && cell.interchange.targetR === r && cell.interchange.targetC === c) out.push({ r: sr, c: sc, type: cell.interchange.type });
  }
  return out;
}

// ─── Stop names ─────────────────────────────────────────────────────────────
/** @param {number} ri @param {string | null} [initVal] */
function enterStopEdit(ri, initVal = null) {
  if (grid.readOnly || ri < 0 || ri >= grid.stops.length || grid.stops[ri].isDwellArr) return;
  const preselect = initVal == null;
  stopPrevName = grid.stops[ri].name;
  inStopEdit = true; inStopCol = false; stopEditRow = ri;
  // The edited row becomes the selected row, so what is typed after the name goes into this row.
  inDC = false; ancR = ri; endR = ri;
  stopBuf = preselect ? grid.stops[ri].name : initVal;
  render();
  const input = /** @type {HTMLInputElement | null} */ (document.querySelector('.g-stop-input'));
  if (input) {
    input.value = stopBuf;
    input.focus();
    if (preselect) input.select(); else input.setSelectionRange(stopBuf.length, stopBuf.length);
  }
}
function commitStopEdit() {
  if (!inStopEdit) return;
  inStopEdit = false;
  // The stop ID is kept: correcting a name must not unlink the stop.
  grid.stops[stopEditRow].name = stopBuf.trim() || stopPrevName;
  inStopCol = true;
  render();
}
function cancelStopEdit() {
  if (!inStopEdit) return;
  inStopEdit = false;
  grid.stops[stopEditRow].name = stopPrevName;
  inStopCol = true;
  render();
}

// ─── Stop marks (NSR status, spec §7.2) ─────────────────────────────────────
const MARK_CLASSES = ['stop-unlinked', 'stop-broken', 'n2-quay-notseen', 'n2-quay-unknown'];

/** @param {HTMLElement} td @param {any} stop */
function applyStopMark(td, stop) {
  td.classList.remove(...MARK_CLASSES);
  td.removeAttribute('title');
  if (stop.isDwellArr) return;
  const mark = stopMark(stop);
  if (mark.cls) td.classList.add(mark.cls);
  td.title = mark.title;
}

/** New NSR results: update the marks in place, so nothing is rebuilt under the cursor. */
function updateStopMarks() {
  if (!grid.active) return;
  document.querySelectorAll('#tbl .g-td-name[data-ri]').forEach((td) => {
    const stop = grid.stops[Number(/** @type {HTMLElement} */ (td).dataset.ri)];
    if (stop) applyStopMark(/** @type {HTMLElement} */ (td), stop);
  });
}

/** Select a row, keeping the column (the speed profile's dots and legs). @param {number} ri */
export function selectRow(ri) {
  if (!grid.active || !grid.stops[ri]) return;
  inDC = false; inStopEdit = false;
  ancR = ri; endR = ri; endC = ancC;
  render();
}

/** The selected row in any column (the stop card follows it), or null. */
export function selectedRowIndex() {
  return grid.active && !inDC && grid.stops[ancR] ? ancR : null;
}

/** The selected stop row (the stop-name column), or null (stop picking spec §1). */
export function selectedStopRow() {
  return grid.active && inStopCol && !inStopEdit && grid.stops[ancR] ? ancR : null;
}

/** The rows a stop is set on: a dwell stop is two rows (arrival, departure) and stays one stop. @param {number} ri */
function stopRows(ri) {
  const at = grid.stops[ri]?.isDwellArr ? ri + 1 : ri;
  const stop = grid.stops[at];
  if (!stop) return [];
  return grid.stops[at - 1]?.isDwellArr ? [grid.stops[at - 1], stop] : [stop];
}

/**
 * Put a Quay into a row (stop picking spec §3: only on Bruk). An empty name is filled from NSR.
 * @param {number} ri
 * @param {{ quayId: string, name?: string, info?: import('../services/nsr.js').QuayInfo | null }} pick
 *   info: what NSR said (null: it does not know the Quay); undefined: not asked yet
 */
export function setStopOnRow(ri, pick) {
  const rows = stopRows(ri);
  if (!rows.length || grid.readOnly) return;
  if (pick.info) quayInfo.set(pick.quayId, pick.info);
  else if (pick.info === null) quayInfo.set(pick.quayId, null);
  for (const r of rows) {
    r.stopId = pick.quayId;
    if (pick.name) r.name = pick.name;
  }
  render();
  if (pick.info !== undefined) return;
  const stop = rows[rows.length - 1];
  loadQuays([pick.quayId]).then(() => {
    const info = quayInfo.get(pick.quayId);
    if (!info || stop.name.trim() || !grid.stops.includes(stop)) return;
    if (inStopEdit) { updateStopMarks(); return; } // a name is being typed: never rebuild under it
    for (const r of rows) r.name = info.stopPlaceName;
    render();
  });
}

/** Remove the stop from a row; the name stays as a plain label. @param {number} ri */
export function clearStopOnRow(ri) {
  const rows = stopRows(ri);
  if (!rows.length || grid.readOnly) return;
  for (const r of rows) r.stopId = null;
  if (rows.length === 2) rows[0].isDwellArr = false; // no longer one stop
  render();
}

/** Give the keyboard back to the grid (Esc in the map pane). */
export function focusGrid() {
  const el = /** @type {HTMLElement | null} */ (document.activeElement);
  if (el && el !== document.body) el.blur();
}

/** @type {((text: string) => void) | null} */
let stopTypeHandler = null;
/** Typing in a selected stop cell goes to the map pane's search (spec §2). @param {((text: string) => void) | null} fn */
export function setStopTypeHandler(fn) {
  stopTypeHandler = fn;
}

// ─── Interchanges ───────────────────────────────────────────────────────────
/** @param {number} r @param {number} c @param {string} type */
function enterIx(r, c, type) {
  ixMode = true;
  ixSource = { r, c, type };
  $('grid-status').textContent = t('ixPick', type);
  $('grid-status').classList.add('on');
  render();
}
function exitIx() {
  ixMode = false;
  ixSource = null;
  $('grid-status').textContent = '';
  $('grid-status').classList.remove('on');
  render();
}
/** @param {number} tr @param {number} tc */
function completeIx(tr, tc) {
  const { r, c, type } = /** @type {{ r: number, c: number, type: string }} */ (ixSource);
  if (r !== tr || c !== tc) {
    const cell = grid.cols[c].cells[r];
    if (cell) cell.interchange = { targetC: tc, targetR: tr, type };
  }
  exitIx();
}

// ─── Render ─────────────────────────────────────────────────────────────────
export function render() {
  if (!grid.active) return;
  /** @type {Set<string>} */
  const linked = new Set();
  if (!inDC && !inStopCol) {
    const target = ixTarget(ancR, ancC);
    if (target) linked.add(`${target.r},${target.c}:${target.type}`);
    for (const s of ixSources(ancR, ancC)) linked.add(`${s.r},${s.c}:${s.type}`);
  }
  const tbl = $('tbl');
  tbl.innerHTML = '';
  renderInsertRow(tbl);
  renderFootRow(tbl);
  renderDayCodeRow(tbl);
  if (grid.tripRow) renderTripRow(tbl);
  grid.stops.forEach((stop, ri) => renderStopRow(tbl, stop, ri, linked));
  renderBottomRow(tbl);
  updateFnPreview(inDC ? { type: 'col', ri: 0, ci: dcCol } : inStopCol ? null : { type: 'cell', ri: ancR, ci: ancC });
  if (snapshot() !== baseline) onChange();
  for (const fn of renderListeners) fn();
}

/** @param {string} label @param {string} cls @param {string} title @param {() => void} fn */
function smallButton(label, cls, title, fn) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = label;
  s.title = title;
  s.addEventListener('mousedown', (e) => { e.preventDefault(); fn(); });
  return s;
}

/** @param {HTMLTableElement} tbl */
function renderInsertRow(tbl) {
  const tr = tbl.insertRow();
  tr.className = 'g-row-ins';
  tr.insertCell().className = 'cw-ins g-sticky0';
  tr.insertCell().className = 'cw-name g-sticky1';
  grid.cols.forEach((_, ci) => {
    const td = tr.insertCell();
    td.className = 'cw-time';
    if (!grid.readOnly) td.appendChild(smallButton('+', 'g-ibtn', t('insColLeft'), () => insertCol(ci)));
  });
  // The add column: "+ column" above the row × buttons (same column), tinted like the add row.
  const end = tr.insertCell();
  end.className = 'cw-ins g-add';
  if (!grid.readOnly) end.appendChild(smallButton('+', 'g-ibtn g-ibtn-end', t('addColEnd'), () => insertCol(grid.cols.length)));
}

/** @param {HTMLTableElement} tbl */
function renderFootRow(tbl) {
  const tr = tbl.insertRow();
  tr.className = 'g-row-foot';
  tr.insertCell().className = 'cw-ins g-sticky0';
  tr.insertCell().className = 'cw-name g-sticky1';
  grid.cols.forEach((col, ci) => {
    const td = tr.insertCell();
    td.className = 'cw-time';
    // The column's note and dates, as small marks over the day code
    if (col.note) {
      const dot = document.createElement('span');
      dot.className = 'fn-col-dot';
      dot.title = col.note;
      dot.addEventListener('click', () => openFnEditor('col', 0, ci));
      td.appendChild(dot);
    }
    if (col.dates?.length) {
      const mark = document.createElement('span');
      mark.className = 'dt-col-mark';
      mark.textContent = '📅';
      mark.title = datesSummary(col.dates);
      mark.addEventListener('click', () => openDates('col', 0, ci));
      td.appendChild(mark);
    }
  });
  tr.insertCell().className = 'cw-ins g-add';
}

/** The trip-number row, between the day codes and the first stop. @param {HTMLTableElement} tbl */
function renderTripRow(tbl) {
  const tr = tbl.insertRow();
  tr.className = 'g-row-tn';
  tr.insertCell().className = 'cw-ins g-sticky0';
  const th = tr.insertCell();
  th.className = 'cw-name g-sticky1 g-tn-label';
  th.textContent = t(app.routeState?.mode === 'rail' ? 'tnTrain' : 'tnTrip');
  grid.cols.forEach((col, ci) => {
    const td = tr.insertCell();
    td.className = 'cw-time g-tn-cell';
    td.dataset.ci = String(ci);
    const isSel = inTN && ci === dcCol && !tnEdit, isEdit = inTN && ci === dcCol && tnEdit;
    if (isEdit) { td.classList.add('tn-edit'); td.innerHTML = esc(tnBuf) + '▌'; }
    else { td.textContent = col.tripNo ?? ''; if (isSel) td.classList.add('tn-sel'); }
    td.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      commitEdit(); commitDayCode(); commitStopEdit(); commitTripNo();
      inStopCol = false; inDC = false; inTN = true; dcCol = ci; tnEdit = false;
      render();
    });
  });
  tr.insertCell().className = 'cw-ins g-add';
}

function commitTripNo() {
  if (!tnEdit) return;
  tnEdit = false;
  if (grid.cols[dcCol]) grid.cols[dcCol].tripNo = tnBuf.trim();
  tnBuf = '';
  render();
}

/** @param {KeyboardEvent} e */
function keyTripNav(e) {
  switch (e.key) {
    case 'ArrowLeft': e.preventDefault(); dcCol = Math.max(0, dcCol - 1); render(); break;
    case 'ArrowRight': e.preventDefault(); dcCol = Math.min(grid.cols.length - 1, dcCol + 1); render(); break;
    case 'ArrowUp': e.preventDefault(); inTN = false; inDC = true; render(); break;
    case 'ArrowDown': e.preventDefault(); inTN = false; inDC = true; downFromDayCodes(true); break;
    case 'Escape': e.preventDefault(); inTN = false; render(); break;
    case 'Enter': case 'F2': e.preventDefault(); tnEdit = true; tnBuf = grid.cols[dcCol]?.tripNo ?? ''; render(); break;
    case 'Delete': case 'Backspace': e.preventDefault(); if (grid.cols[dcCol]) grid.cols[dcCol].tripNo = ''; render(); break;
    default:
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); tnEdit = true; tnBuf = e.key; render(); }
  }
}

/** @param {KeyboardEvent} e */
function keyTripEdit(e) {
  switch (e.key) {
    case 'Escape': e.preventDefault(); tnEdit = false; tnBuf = ''; render(); break;
    case 'Enter': e.preventDefault(); commitTripNo(); break;
    case 'Backspace': e.preventDefault(); tnBuf = tnBuf.slice(0, -1); render(); break;
    case 'ArrowLeft': e.preventDefault(); commitTripNo(); dcCol = Math.max(0, dcCol - 1); render(); break;
    case 'ArrowRight': e.preventDefault(); commitTripNo(); dcCol = Math.min(grid.cols.length - 1, dcCol + 1); render(); break;
    case 'ArrowUp': e.preventDefault(); commitTripNo(); inTN = false; inDC = true; render(); break;
    case 'ArrowDown': e.preventDefault(); commitTripNo(); inTN = false; inDC = true; downFromDayCodes(true); break;
    default:
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && tnBuf.length < 20) { e.preventDefault(); tnBuf += e.key; render(); }
  }
}

/** @param {HTMLTableElement} tbl */
function renderDayCodeRow(tbl) {
  const tr = tbl.insertRow();
  tr.className = 'g-row-dc';
  tr.insertCell().className = 'cw-ins g-sticky0';
  const th = tr.insertCell();
  th.className = 'cw-name g-sticky1';
  th.textContent = t('stopHeader');
  grid.cols.forEach((col, ci) => {
    const td = tr.insertCell();
    td.className = 'cw-time g-dc-cell';
    td.dataset.ci = String(ci);
    const isSel = inDC && ci === dcCol && !dcEdit, isEdit = inDC && ci === dcCol && dcEdit;
    if (isEdit) { td.classList.add('dc-edit'); td.innerHTML = esc(dcBuf) + '▌'; }
    else { td.textContent = col.dayCode; if (isSel) td.classList.add('dc-sel'); }
    td.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (ixMode) { exitIx(); return; }
      commitEdit(); commitDayCode(); commitStopEdit();
      inStopCol = false; inDC = true; dcCol = ci; dcEdit = false;
      render();
    });
    td.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (ixMode || grid.readOnly) return;
      ctxDCCol = ci; dcCol = ci; inDC = true; inStopCol = false;
      showCtx(e.clientX, e.clientY, true);
    });
  });
  tr.insertCell().className = 'cw-ins g-add';
}

/**
 * @param {HTMLTableElement} tbl
 * @param {any} stop
 * @param {number} ri
 * @param {Set<string>} linked
 */
function renderStopRow(tbl, stop, ri, linked) {
  const tr = tbl.insertRow();
  tr.className = 'g-row-stop' + (stop.isDwellArr ? ' g-row-dwell' : '') + (stop.sep ? ' g-row-sep' : '');
  const tdi = tr.insertCell();
  tdi.className = 'cw-ins g-sticky0 g-td-btn g-td-ins';
  if (!grid.readOnly) tdi.appendChild(smallButton('+', 'g-ibtn', t('insRowAbove'), () => insertRow(ri)));

  const tdn = tr.insertCell();
  if (inStopEdit && stopEditRow === ri) {
    tdn.className = 'cw-name g-sticky1 g-td-name stop-editing';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'g-stop-input';
    input.value = stopBuf;
    input.setAttribute('autocomplete', 'off');
    input.addEventListener('input', () => { stopBuf = input.value; });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelStopEdit(); }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); commitStopEdit(); }
    });
    input.addEventListener('blur', () => { if (inStopEdit) commitStopEdit(); });
    tdn.appendChild(input);
  } else {
    const isSel = inStopCol && ri === ancR;
    tdn.className = 'cw-name g-sticky1 g-td-name' + (stop.bold ? ' stop-bold' : '') + (isSel ? ' stop-sel' : '');
    tdn.dataset.ri = String(ri);
    applyStopMark(tdn, stop);
    tdn.textContent = stop.name;
    tdn.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (ixMode) return;
      commitEdit(); commitDayCode();
      if (inStopEdit) commitStopEdit();
      inDC = false; inStopCol = true; ancR = ri; endR = ri;
      render();
    });
    tdn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (ixMode || grid.readOnly) return;
      commitEdit(); commitDayCode();
      if (inStopEdit) commitStopEdit();
      inStopCol = true; ancR = ri; endR = ri; ctxIsStop = true; ctxStopRow = ri;
      showCtx(e.clientX, e.clientY);
    });
  }

  grid.cols.forEach((col, ci) => {
    const td = tr.insertCell();
    td.className = 'cw-time g-td-time';
    td.dataset.r = String(ri);
    td.dataset.c = String(ci);
    const cell = col.cells[ri];
    const isSel = !inDC && !inTN && !inStopCol && !inStopEdit && ri === ancR && ci === ancC;
    const isRange = !inDC && !inTN && !inStopCol && !inStopEdit && inRect(ri, ci) && !isSel;
    if (cell && cell.interchange) td.classList.add(cell.interchange.type === 'guaranteed' ? 'g-ix-g' : 'g-ix-s');
    const srcs = ixSources(ri, ci);
    if (srcs.length) td.classList.add(srcs[0].type === 'guaranteed' ? 'g-ix-tg' : 'g-ix-ts');
    if (linked.has(`${ri},${ci}:guaranteed`)) td.classList.add('g-ix-lg');
    if (linked.has(`${ri},${ci}:stayseated`)) td.classList.add('g-ix-ls');
    if (ixMode && ixSource) {
      if (ri === ixSource.r && ci === ixSource.c) td.classList.add('g-ix-pend');
      else if (hasTime(ri, ci)) td.classList.add('g-ix-pick');
      else td.classList.add('g-ix-dim');
    }
    if (cell && cell.time === '|') td.classList.add('is-pipe');
    if (cell?.note) { td.classList.add('has-fn'); td.title = cell.note; }
    if (cell?.dates?.length) { td.classList.add('has-dates'); td.title = [td.title, datesSummary(cell.dates)].filter(Boolean).join(' · '); }
    if (isDecreasing(ri, ci) && !ixMode) td.classList.add('is-dec');
    if (isRange && !ixMode) td.classList.add('in-range');
    if (isSel && editing) { td.classList.add('is-edit'); td.innerHTML = cellHTML(cell, true, editBuf); }
    else { td.innerHTML = cellHTML(cell, false, ''); if (isSel && !ixMode) td.classList.add('is-anchor'); }
    td.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (ixMode && ixSource) {
        if (ri === ixSource.r && ci === ixSource.c) { exitIx(); return; }
        if (hasTime(ri, ci)) { completeIx(ri, ci); return; }
        exitIx();
        return;
      }
      commitEdit(); commitDayCode();
      if (inStopEdit) commitStopEdit();
      inStopCol = false; inDC = false;
      if (e.shiftKey) { endR = ri; endC = ci; } else { ancR = ri; ancC = ci; endR = ri; endC = ci; }
      dragging = true; // click and drag selects a range
      render();
    });
    td.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (ixMode) { exitIx(); return; }
      if (grid.readOnly) return;
      commitEdit(); commitDayCode();
      if (inStopEdit) commitStopEdit();
      inStopCol = false; inDC = false;
      if (!inRect(ri, ci)) { ancR = ri; ancC = ci; endR = ri; endC = ci; }
      ctxIsStop = false; ctxR = ri; ctxC = ci;
      showCtx(e.clientX, e.clientY);
    });
  });
  const tdd = tr.insertCell();
  tdd.className = 'cw-ins g-td-btn g-add';
  if (!grid.readOnly) tdd.appendChild(smallButton('×', 'g-ibtn g-ibtn-del', t('delRow'), () => deleteRow(ri)));
}

/** @param {HTMLTableElement} tbl */
function renderBottomRow(tbl) {
  const tr = tbl.insertRow();
  tr.className = 'g-row-bot';
  const ti = tr.insertCell();
  ti.className = 'cw-ins g-sticky0 g-td-btn g-td-ins g-add';
  if (!grid.readOnly) ti.appendChild(smallButton('+', 'g-ibtn g-ibtn-end', t('addRowEnd'), () => insertRow(grid.stops.length)));
  tr.insertCell().className = 'cw-name g-sticky1 g-add';
  grid.cols.forEach((_, ci) => {
    const td = tr.insertCell();
    td.className = 'cw-time g-td-btn g-add';
    if (!grid.readOnly) td.appendChild(smallButton('×', 'g-ibtn g-ibtn-del', t('delCol'), () => deleteCol(ci)));
  });
  tr.insertCell().className = 'cw-ins g-add';
}

// ─── Selection and editing ──────────────────────────────────────────────────
/** @param {number} r @param {number} c */
function setAnchor(r, c) {
  inDC = false; inStopCol = false;
  ancR = clampR(r); ancC = clampC(c); endR = ancR; endC = ancC;
  editing = false; editBuf = '';
}
/** @param {number} r @param {number} c */
function extend(r, c) { endR = clampR(r); endC = clampC(c); }
function clearSelection() {
  const { r1, r2, c1, c2 } = rect();
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) grid.cols[c].cells[r] = null;
}
/** @param {string} init */
function startEdit(init) { editing = true; editBuf = init || ''; render(); }
function commitEdit() {
  if (!editing) return;
  editing = false;
  const raw = editBuf.trim();
  if (!raw) {
    grid.cols[ancC].cells[ancR] = null;
  } else {
    const p = /** @type {any} */ (parseCellInput(raw));
    if (p) {
      const prev = grid.cols[ancC].cells[ancR];
      if (prev && p.time !== '|') p.dayOffset = prev.dayOffset || 0;
      p.interchange = prev && p.time !== '|' ? prev.interchange : null;
      // A new time keeps the cell's note and dates
      if (prev && p.time !== '|') { if (prev.note) p.note = prev.note; if (prev.dates?.length) p.dates = prev.dates; }
      grid.cols[ancC].cells[ancR] = p;
    }
  }
  editBuf = '';
  render();
}
function cancelEdit() { editing = false; editBuf = ''; render(); }
function commitDayCode() {
  if (!dcEdit) return;
  dcEdit = false;
  const v = dcBuf.trim().toUpperCase();
  dcBuf = '';
  if (isValidDayCode(v)) { grid.cols[dcCol].dayCode = v; render(); return; }
  render();
  const td = document.querySelector(`.g-dc-cell[data-ci="${dcCol}"]`);
  if (td) { td.classList.add('dc-err'); setTimeout(() => td.classList.remove('dc-err'), 600); }
}
function cancelDayCode() { dcEdit = false; dcBuf = ''; render(); }
/** @param {number} r @param {number} c */
function scrollTo(r, c) {
  /** @type {any} */ (document.querySelector(`[data-r="${r}"][data-c="${c}"]`))?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

// ─── Keyboard ───────────────────────────────────────────────────────────────
/** @param {KeyboardEvent} e */
function onKeyDown(e) {
  if (!grid.active || currentPage() !== 'edit') return;
  // A floating box (note, dates, helpers) or a dialog has the keyboard
  if (document.querySelector('.float-box, .nudge-box, dialog[open]')) return;
  if (inStopEdit) return; // the name input handles its own keys
  const tag = /** @type {HTMLElement} */ (e.target)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (ixMode) { if (e.key === 'Escape') { e.preventDefault(); exitIx(); } return; }
  if ($('grid-ctx').style.display === 'block') { if (e.key === 'Escape') hideCtx(); return; }
  if ((e.ctrlKey || e.metaKey) && !editing && !dcEdit && !inStopCol) {
    if (e.key === 'c') { e.preventDefault(); copySelection(); return; }
    if (e.key === 'x' && !grid.readOnly) { e.preventDefault(); copySelection().then(() => { clearSelection(); render(); }); return; }
  }
  if (grid.readOnly) { keyReadOnly(e); return; }
  if (tnEdit) { keyTripEdit(e); return; }
  if (inTN) { keyTripNav(e); return; }
  if (dcEdit) { keyDayCodeEdit(e); return; }
  if (inDC) { keyDayCodeNav(e); return; }
  if (inStopCol) { keyStopCol(e); return; }
  if (editing) { keyEdit(e); return; }
  keyNav(e);
}

/** Read-only: moving around only. @param {KeyboardEvent} e */
function keyReadOnly(e) {
  const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  const m = moves[/** @type {keyof typeof moves} */ (e.key)];
  if (!m) return;
  e.preventDefault();
  if (!grid.cols.length) return;
  setAnchor(ancR + m[0], ancC + m[1]);
  render();
  scrollTo(ancR, ancC);
}

/** @param {KeyboardEvent} e */
function keyStopCol(e) {
  switch (e.key) {
    case 'ArrowUp': e.preventDefault(); if (ancR > 0) { ancR--; endR = ancR; render(); } break;
    case 'ArrowDown': e.preventDefault(); if (ancR < grid.stops.length - 1) { ancR++; endR = ancR; render(); } break;
    case 'ArrowRight': e.preventDefault(); if (!grid.cols.length) break; inStopCol = false; ancC = 0; endC = 0; render(); scrollTo(ancR, 0); break;
    case 'Escape': e.preventDefault(); inStopCol = false; render(); break;
    case 'Enter': case 'F2': e.preventDefault(); enterStopEdit(ancR); break;
    case 'Delete': case 'Backspace':
      e.preventDefault();
      if (grid.stops[ancR] && !grid.stops[ancR].isDwellArr) { grid.stops[ancR].name = ''; grid.stops[ancR].stopId = null; render(); }
      break;
    default:
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && grid.stops[ancR] && !grid.stops[ancR].isDwellArr) {
        e.preventDefault();
        if (stopTypeHandler) stopTypeHandler(e.key); else enterStopEdit(ancR, e.key);
      }
  }
}

/** @param {KeyboardEvent} e */
function keyNav(e) {
  const sh = e.shiftKey;
  if (!grid.cols.length || !grid.stops.length) {
    if (e.key === 'ArrowLeft' && grid.stops.length) { e.preventDefault(); inStopCol = true; ancR = clampR(ancR); render(); }
    return;
  }
  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault();
      if (ancR === 0 && !sh) { dcCol = ancC; if (grid.tripRow) inTN = true; else inDC = true; render(); return; }
      if (sh) extend(endR - 1, endC); else setAnchor(ancR - 1, ancC);
      render(); scrollTo(ancR, ancC); break;
    case 'ArrowDown': e.preventDefault(); if (sh) extend(endR + 1, endC); else setAnchor(ancR + 1, ancC); render(); scrollTo(ancR, ancC); break;
    case 'ArrowLeft':
      e.preventDefault();
      if (!sh && ancC === 0) { commitEdit(); commitDayCode(); inDC = false; inStopCol = true; ancR = clampR(ancR); endR = ancR; render(); return; }
      if (sh) extend(endR, endC - 1); else setAnchor(ancR, ancC - 1);
      render(); scrollTo(ancR, ancC); break;
    case 'ArrowRight': e.preventDefault(); if (sh) extend(endR, endC + 1); else setAnchor(ancR, ancC + 1); render(); scrollTo(ancR, ancC); break;
    case 'F2': e.preventDefault(); enterStopEdit(ancR); break;
    case 'F7': e.preventDefault(); openFnEditor('cell', ancR, ancC); break;
    case 'Enter': e.preventDefault(); startEdit(''); break;
    case 'Delete': case 'Backspace': e.preventDefault(); clearSelection(); render(); break;
    case '|': e.preventDefault(); grid.cols[ancC].cells[ancR] = { time: '|', dayOffset: 0, suffix: '', interchange: null }; render(); break;
    default:
      if (e.key.length === 1 && /\d/.test(e.key) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); startEdit(e.key); }
  }
}

/** @param {KeyboardEvent} e */
function keyEdit(e) {
  switch (e.key) {
    case 'Escape': e.preventDefault(); cancelEdit(); break;
    case 'Enter': case 'ArrowDown': e.preventDefault(); commitEdit(); setAnchor(ancR + 1, ancC); render(); scrollTo(ancR, ancC); break;
    case 'ArrowUp': e.preventDefault(); commitEdit(); setAnchor(ancR - 1, ancC); render(); scrollTo(ancR, ancC); break;
    case 'ArrowRight': e.preventDefault(); commitEdit(); setAnchor(ancR, ancC + 1); render(); scrollTo(ancR, ancC); break;
    case 'ArrowLeft': e.preventDefault(); commitEdit(); setAnchor(ancR, ancC - 1); render(); scrollTo(ancR, ancC); break;
    case 'Backspace': e.preventDefault(); editBuf = editBuf.slice(0, -1); render(); break;
    default:
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        const digits = editBuf.replace(/[apx]/, '').length, hasSuffix = /[apx]$/.test(editBuf);
        if (/\d/.test(e.key) && digits < 4 && !hasSuffix) { e.preventDefault(); editBuf += e.key; render(); }
        else if (/[apx]/i.test(e.key) && digits >= 3 && !hasSuffix) { e.preventDefault(); editBuf += e.key.toLowerCase(); render(); }
      }
  }
}

/**
 * Down from the day-code row: the next row below it, in the same column (like a spreadsheet) — the
 * trip-number row when shown, else the first stop. From the trip-number row (pastTrip): the first stop.
 */
function downFromDayCodes(pastTrip = false) {
  inDC = false;
  if (grid.tripRow && !pastTrip) { inTN = true; render(); return; }
  inTN = false; ancC = dcCol; endC = dcCol; ancR = 0; endR = 0;
  render(); scrollTo(ancR, ancC);
}

/** @param {KeyboardEvent} e */
function keyDayCodeNav(e) {
  switch (e.key) {
    case 'ArrowLeft': e.preventDefault(); dcCol = Math.max(0, dcCol - 1); render(); break;
    case 'ArrowRight': e.preventDefault(); dcCol = Math.min(grid.cols.length - 1, dcCol + 1); render(); break;
    case 'ArrowDown': e.preventDefault(); downFromDayCodes(); break;
    case 'Escape': e.preventDefault(); inDC = false; render(); break;
    case 'F7': e.preventDefault(); openFnEditor('col', 0, dcCol); break;
    case 'Enter': e.preventDefault(); dcEdit = true; dcBuf = grid.cols[dcCol].dayCode; render(); break;
    default:
      if (e.key.length === 1 && /[A-Za-z0-9]/.test(e.key) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); dcEdit = true; dcBuf = e.key.toUpperCase(); render(); }
  }
}

/** @param {KeyboardEvent} e */
function keyDayCodeEdit(e) {
  switch (e.key) {
    case 'Escape': e.preventDefault(); cancelDayCode(); break;
    case 'Enter': e.preventDefault(); commitDayCode(); break;
    case 'ArrowLeft': e.preventDefault(); commitDayCode(); dcCol = Math.max(0, dcCol - 1); render(); break;
    case 'ArrowRight': e.preventDefault(); commitDayCode(); dcCol = Math.min(grid.cols.length - 1, dcCol + 1); render(); break;
    case 'ArrowDown': e.preventDefault(); commitDayCode(); downFromDayCodes(); break;
    case 'Backspace': e.preventDefault(); dcBuf = dcBuf.slice(0, -1); render(); break;
    default:
      if (e.key.length === 1 && /[A-Za-z0-9]/.test(e.key) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); dcBuf += e.key.toUpperCase(); render(); }
  }
}

// ─── Clipboard ──────────────────────────────────────────────────────────────
async function copySelection() {
  const { r1, r2, c1, c2 } = rect();
  const lines = [];
  for (let r = r1; r <= r2; r++) {
    const row = [];
    for (let c = c1; c <= c2; c++) { const cell = grid.cols[c]?.cells[r]; row.push(cell ? cell.time + (cell.suffix || '') : ''); }
    lines.push(row.join('\t'));
  }
  try { await navigator.clipboard.writeText(lines.join('\n')); } catch { /* clipboard not available */ }
}

/** Paste uses the paste event, so the browser never asks for clipboard permission. @param {ClipboardEvent} e */
function onPaste(e) {
  if (!grid.active || grid.readOnly || currentPage() !== 'edit' || inStopEdit) return;
  const tag = /** @type {HTMLElement} */ (e.target)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const text = e.clipboardData?.getData('text');
  if (!text) return;
  e.preventDefault();
  if (inDC && dcEdit) { dcBuf = text.trim().toUpperCase(); commitDayCode(); return; }
  if (inDC || inStopCol) return;
  text.split(/\r?\n/).forEach((line, dr) => {
    if (!line) return;
    line.split('\t').forEach((val, dc) => {
      const r = ancR + dr, c = ancC + dc;
      if (r >= grid.stops.length || c >= grid.cols.length) return;
      const v = val.trim();
      if (!v) { grid.cols[c].cells[r] = null; return; }
      const p = /** @type {any} */ (parseCellInput(v));
      if (!p) return;
      const prev = grid.cols[c].cells[r];
      if (prev && p.time !== '|') p.dayOffset = prev.dayOffset || 0;
      p.interchange = null;
      grid.cols[c].cells[r] = p;
    });
  });
  render();
}

/** Dates as a tooltip: how many days added and removed. @param {{ from: string, to: string, on: boolean }[]} dates */
function datesSummary(dates) {
  const on = dates.filter((d) => d.on).length, off = dates.length - on;
  return t('datesSummary', on, off);
}

/** The days of the open period (its calendars). */
function periodDays() {
  const rs = app.routeState;
  const per = rs?.periods?.find((/** @type {any} */ p) => p.id === rs.activePer);
  const cals = (per?.calendarIds ?? []).map((/** @type {string} */ id) => app.calendars.find((c) => c.id === id)).filter(Boolean);
  return unionDays(/** @type {any[]} */ (cals));
}

/**
 * The date picker for a trip (its own dates on top of its calendars and day code) or a single time
 * (on top of the trip's days).
 * @param {'col' | 'cell'} type @param {number} ri @param {number} ci
 */
function openDates(type, ri, ci) {
  const col = grid.cols[ci];
  const at = type === 'col' ? col : col?.cells[ri];
  if (!at || grid.readOnly) return;
  const base = type === 'col' ? tripDays(periodDays(), { dayCode: col.dayCode }) : tripDays(periodDays(), col);
  const anchor = /** @type {HTMLElement | null} */ (document.querySelector(type === 'col' ? `.g-dc-cell[data-ci="${ci}"]` : `[data-r="${ri}"][data-c="${ci}"]`));
  const r = anchor?.getBoundingClientRect();
  openDatePicker({
    x: r?.left ?? 200, y: (r?.bottom ?? 160) + 4, title: t(type === 'col' ? 'dpTitleCol' : 'dpTitleCell'), base, dates: at.dates ?? [],
    onApply: (dates) => { at.dates = dates; render(); },
  });
}

// ─── Context menu ───────────────────────────────────────────────────────────
/** The selected rectangle of time cells. */
function selRect() {
  return { r0: Math.min(ancR, endR), r1: Math.max(ancR, endR), c0: Math.min(ancC, endC), c1: Math.max(ancC, endC) };
}

/** The timed cells (not |) in the selection. */
function timedInSelection() {
  const { r0, r1, c0, c1 } = selRect();
  const out = [];
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
    const cell = grid.cols[c]?.cells[r];
    if (cell && cell.time && cell.time !== '|') out.push(cell);
  }
  return out;
}

/** What "Interpoler tider" would fill: per column of the selection (a single cell: the whole column). */
function interpolationFills() {
  const { r0, r1, c0, c1 } = selRect();
  const single = r0 === r1 && c0 === c1;
  /** @type {{ ci: number, ri: number, cell: any }[]} */
  const out = [];
  for (let c = c0; c <= c1; c++) {
    if (!grid.cols[c]) continue;
    for (const f of interpolateSpan(grid, c, single ? 0 : r0, single ? grid.stops.length - 1 : r1, posOf)) out.push({ ci: c, ...f });
  }
  return out;
}

/** @param {number} x @param {number} y @param {boolean} [isDC] */
function showCtx(x, y, isDC = false) {
  const isStop = ctxIsStop && !isDC;
  $('gctx-time').style.display = !isStop && !isDC ? '' : 'none';
  $('gctx-stop').style.display = isStop ? '' : 'none';
  $('gctx-dc').style.display = isDC ? '' : 'none';
  if (isDC) $('gc-tripno').textContent = t(grid.tripRow ? 'ctxTripHide' : 'ctxTripShow');
  if (!isStop && !isDC && ctxC >= 0 && ctxC < grid.cols.length) {
    const cell = grid.cols[ctxC].cells[ctxR];
    const timed = !!(cell && cell.time && cell.time !== '|'), withIx = timed && !!cell.interchange;
    $('gc-ix-g').className = 'gci' + (timed && !withIx ? '' : ' dis');
    $('gc-ix-s').className = 'gci' + (timed && !withIx ? '' : ' dis');
    $('gc-ix-del').className = 'gci red' + (withIx ? '' : ' dis');
    // Boarding restrictions: ticked when every timed cell in the selection has it
    const sfx = timedInSelection().map((c) => c.suffix || '');
    for (const [k, key] of /** @type {[string, string][]} */ ([['a', 'ctxSfxA'], ['p', 'ctxSfxP'], ['x', 'ctxSfxX']])) {
      $(`gc-sfx-${k}`).textContent = (sfx.length && sfx.every((v) => v === k) ? '✓ ' : '    ') + t(key);
      $(`gc-sfx-${k}`).className = 'gci' + (sfx.length ? '' : ' dis');
    }
    $('gc-sfx-none').className = 'gci' + (sfx.some((v) => v) ? '' : ' dis');
    // Interpolating: between the times inside the selection (one cell selected: its whole column)
    $('gc-interp').className = 'gci' + (interpolationFills().length ? '' : ' dis');
    $('gc-nudge').className = 'gci' + (timedInSelection().length || grid.cols[ctxC]?.cells.some((/** @type {any} */ x) => x?.time && x.time !== '|') ? '' : ' dis');
    // Extrapolation by speed is hidden (user test 2026-10-17); the code stays for later
    $('gc-extrap-fwd').style.display = 'none';
    $('gc-extrap-bwd').style.display = 'none';
  } else if (isStop) {
    const stop = grid.stops[ctxStopRow];
    $('gc-bold').textContent = (stop.bold ? '✓ ' : '    ') + t('ctxBold');
    $('gc-sep').textContent = (stop.sep ? '✓ ' : '    ') + t('ctxSep');
  }
  const m = $('grid-ctx');
  m.style.display = 'block';
  m.style.left = `${x}px`;
  m.style.top = `${y}px`;
}
function hideCtx() {
  const m = $('grid-ctx');
  if (m) m.style.display = 'none';
  ctxIsStop = false;
}

// ─── Insert / delete ────────────────────────────────────────────────────────
/** @param {number} at */
function insertCol(at) {
  grid.cols.splice(at, 0, { dayCode: '', uid: crypto.randomUUID(), note: '', dates: [], cells: grid.stops.map(() => null) });
  for (const col of grid.cols) for (const cell of col.cells) if (cell && cell.interchange && cell.interchange.targetC >= at) cell.interchange.targetC++;
  if (!inDC) { if (ancC >= at && grid.cols.length > 1) ancC++; if (endC >= at && grid.cols.length > 1) endC++; } else if (dcCol >= at) dcCol++;
  ancC = clampC(ancC); endC = clampC(endC);
  render();
}
/** @param {number} at */
function insertRow(at) {
  grid.stops.splice(at, 0, { name: '', stopId: null, bold: false, sep: false, isDwellArr: false, price: null });
  for (const col of grid.cols) col.cells.splice(at, 0, null);
  for (const col of grid.cols) for (const cell of col.cells) if (cell && cell.interchange && cell.interchange.targetR >= at) cell.interchange.targetR++;
  // The new row's stop cell is selected, so the map pane offers to find its stop at once; Enter or
  // F2 names it (user test 2026-10-16: no name box popping up)
  inDC = false; inStopEdit = false; inStopCol = true; ancR = at; endR = at;
  render();
}

/** Add an empty stop row at a position and select it (adding a stop from the map). @param {number} at */
export function addStopRowAt(at) {
  if (grid.readOnly) return;
  insertRow(Math.max(0, Math.min(grid.stops.length, at)));
}
/** Put new columns right after column ci; interchanges to later columns move with them. @param {number} ci @param {any[]} cols */
function insertColumnsAfter(ci, cols) {
  if (!cols.length) return;
  for (const col of grid.cols) for (const cell of col.cells) if (cell?.interchange && cell.interchange.targetC > ci) cell.interchange.targetC += cols.length;
  grid.cols.splice(ci + 1, 0, ...cols);
  inDC = false;
  render();
}

/** @param {number} ci */
function deleteCol(ci) {
  if (grid.cols[ci].cells.some((/** @type {any} */ c) => c !== null) && !confirm(t('confirmDelCol'))) return;
  grid.cols.splice(ci, 1);
  for (const col of grid.cols) for (const cell of col.cells) {
    if (cell && cell.interchange) {
      if (cell.interchange.targetC === ci) cell.interchange = null;
      else if (cell.interchange.targetC > ci) cell.interchange.targetC--;
    }
  }
  ancC = clampC(ancC); endC = clampC(endC);
  if (inDC) dcCol = clampC(dcCol);
  render();
}
/** A new empty stop row at the bottom (recording stops); its index. */
export function appendStopRow() {
  grid.stops.push({ name: '', stopId: null, bold: false, sep: false, isDwellArr: false, price: null });
  for (const col of grid.cols) col.cells.push(null);
  render();
  return grid.stops.length - 1;
}

/** Remove a stop row without asking (undoing a recorded stop, which has no times). @param {number} ri */
export function removeStopRow(ri) {
  if (!grid.stops[ri] || grid.readOnly) return;
  dropRow(ri);
}

/** @param {number} ri */
function deleteRow(ri) {
  if (grid.cols.some((col) => col.cells[ri] !== null) && !confirm(t('confirmDelRow'))) return;
  dropRow(ri);
}

/** @param {number} ri */
function dropRow(ri) {
  grid.stops.splice(ri, 1);
  for (const col of grid.cols) col.cells.splice(ri, 1);
  for (const col of grid.cols) for (const cell of col.cells) {
    if (cell && cell.interchange) {
      if (cell.interchange.targetR === ri) cell.interchange = null;
      else if (cell.interchange.targetR > ri) cell.interchange.targetR--;
    }
  }
  ancR = clampR(ancR); endR = clampR(endR);
  render();
}

/** Wire keyboard, paste and the context menu once at start-up. */
let documentWired = false;

export function initGrid() {
  // Clicks in the grid prevent the default (no text selection), so they never move focus: take the
  // keyboard back from a field outside the grid (the map pane's search box) here.
  document.addEventListener('mousedown', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const el = document.activeElement;
    if (target.closest?.('#tbl') && el instanceof HTMLElement && el !== document.body && !el.closest('#tbl')) el.blur();
  }, true);
  // Page-wide listeners only once, also when tests reload the page markup; the menu items below
  // belong to the markup and are wired on every call.
  if (!documentWired) {
    documentWired = true;
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('paste', onPaste);
    document.addEventListener('mousedown', (e) => {
      const el = /** @type {HTMLElement} */ (e.target);
      if (!inTN || !el.closest?.('#tbl') || el.closest('.g-tn-cell')) return;
      commitTripNo();
      inTN = false;
    }, true);
    document.addEventListener('mouseover', (e) => {
      if (!dragging || inDC || ixMode) return;
      const td = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('#tbl [data-r][data-c]'));
      if (!td) return;
      const r = Number(td.dataset.r), c = Number(td.dataset.c);
      if (r !== endR || c !== endC) { endR = r; endC = c; render(); }
    });
    document.addEventListener('mouseup', () => { dragging = false; });
    document.addEventListener('mousedown', (e) => {
      if (!/** @type {HTMLElement} */ (e.target).closest?.('#grid-ctx')) hideCtx();
    });
    onQuaysLoaded(updateStopMarks);
  }
  $('gc-clear').addEventListener('click', () => { clearSelection(); hideCtx(); render(); });
  $('gc-offset').addEventListener('click', () => {
    hideCtx();
    const cell = grid.cols[ctxC]?.cells[ctxR];
    if (!cell || !cell.time || cell.time === '|') return;
    const val = prompt(t('dayOffsetPrompt'), String(cell.dayOffset || 0));
    if (val === null) return;
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 0) return;
    const { r1, r2, c1, c2 } = rect();
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const cl = grid.cols[c].cells[r];
      if (cl && cl.time && cl.time !== '|') cl.dayOffset = n;
    }
    render();
  });
  /** @param {(r: number, c: number) => any} compute */
  const fill = (compute) => {
    hideCtx();
    if (grid.readOnly || ctxC < 0 || ctxC >= grid.cols.length) return;
    const existing = grid.cols[ctxC].cells[ctxR];
    if (existing && existing.time) return; // never overwrite a time
    const result = compute(ctxR, ctxC);
    if (!result) return;
    grid.cols[ctxC].cells[ctxR] = result;
    render();
  };
  /** @param {'fwd' | 'bwd'} direction */
  const extrapolate = (direction) => fill((r, c) => {
    const unit = speedUnit(app.routeState?.transportMode ?? 0);
    const answer = prompt(t('speedPrompt', unit), unit === 'knots' ? '9' : '50');
    if (answer === null) return null;
    const value = parseFloat(answer.replace(',', '.'));
    return extrapolateTime(grid, c, r, direction, toKmh(value, unit), posOf);
  });
  for (const k of ['a', 'p', 'x', 'none']) {
    $(`gc-sfx-${k}`).addEventListener('click', () => {
      hideCtx();
      if (grid.readOnly) return;
      for (const cell of timedInSelection()) cell.suffix = k === 'none' ? '' : k;
      render();
    });
  }
  $('gc-nudge').addEventListener('click', () => {
    hideCtx();
    if (grid.readOnly) return;
    // The selection, or one cell's whole column; re-applied from a snapshot on every notch
    const { r0, r1, c0, c1 } = selRect();
    const single = r0 === r1 && c0 === c1;
    const rows = [];
    for (let r = single ? 0 : r0; r <= (single ? grid.stops.length - 1 : r1); r++) rows.push(r);
    const cols = [];
    for (let c = c0; c <= c1; c++) if (grid.cols[c]) cols.push(c);
    const snapshot = cols.map((c) => grid.cols[c].cells.map((/** @type {any} */ x) => (x ? { ...x } : x)));
    const restore = () => cols.forEach((c, i) => { grid.cols[c].cells = snapshot[i].map((/** @type {any} */ x) => (x ? { ...x } : x)); });
    const head = /** @type {HTMLElement | null} */ (document.querySelector(`.g-dc-cell[data-ci="${c0}"]`))?.getBoundingClientRect();
    openTimeNudge({
      x: head?.left ?? 200, y: (head?.top ?? 120) - 44,
      onShift: (total) => { restore(); for (const c of cols) shiftTimes(grid.cols[c], rows, total); render(); },
      onUndo: () => { restore(); render(); },
    });
  });
  $('gc-interp').addEventListener('click', () => {
    hideCtx();
    if (grid.readOnly) return;
    for (const f of interpolationFills()) grid.cols[f.ci].cells[f.ri] = f.cell;
    render();
  });
  $('gc-extrap-fwd').addEventListener('click', () => extrapolate('fwd'));
  $('gc-extrap-bwd').addEventListener('click', () => extrapolate('bwd'));
  $('gc-ix-g').addEventListener('click', () => { hideCtx(); if (hasTime(ctxR, ctxC)) enterIx(ctxR, ctxC, 'guaranteed'); });
  $('gc-ix-s').addEventListener('click', () => { hideCtx(); if (hasTime(ctxR, ctxC)) enterIx(ctxR, ctxC, 'stayseated'); });
  $('gc-ix-del').addEventListener('click', () => {
    hideCtx();
    const cell = grid.cols[ctxC]?.cells[ctxR];
    if (cell) { cell.interchange = null; render(); }
  });
  $('gc-bold').addEventListener('click', () => {
    if (ctxStopRow < 0) return;
    grid.stops[ctxStopRow].bold = !grid.stops[ctxStopRow].bold;
    hideCtx(); render();
  });
  $('gc-sep').addEventListener('click', () => {
    if (ctxStopRow < 0) return;
    grid.stops[ctxStopRow].sep = !grid.stops[ctxStopRow].sep;
    hideCtx(); render();
  });
  $('gc-add-note').addEventListener('click', () => { hideCtx(); openFnEditor('cell', ctxR, ctxC); });
  $('gc-tripno').addEventListener('click', () => {
    hideCtx();
    if (grid.readOnly) return;
    if (grid.tripRow) {
      const numbered = grid.cols.some((/** @type {any} */ c) => c.tripNo);
      if (numbered && !confirm(t('confirmTripHide'))) return;
      for (const c of grid.cols) c.tripNo = '';
      inTN = false;
    }
    grid.tripRow = !grid.tripRow;
    render();
  });
  $('gc-dc-days').addEventListener('click', (e) => {
    hideCtx();
    const ci = ctxDCCol >= 0 ? ctxDCCol : dcCol;
    if (grid.readOnly || !grid.cols[ci]) return;
    openDayCodeHelper({ code: grid.cols[ci].dayCode, x: e.clientX, y: e.clientY, onApply: (code) => { grid.cols[ci].dayCode = code; render(); } });
  });
  for (const [id, by] of /** @type {[string, 'time' | 'daycode'][]} */ ([['gc-sort-time', 'time'], ['gc-sort-dc', 'daycode']])) {
    $(id).addEventListener('click', () => {
      hideCtx();
      if (grid.readOnly) return;
      sortColumns(grid, by);
      inDC = false; ancC = 0; endC = 0;
      render();
    });
  }
  $('gc-copy-int').addEventListener('click', (e) => {
    hideCtx();
    const ci = ctxDCCol >= 0 ? ctxDCCol : dcCol;
    if (grid.readOnly || !grid.cols[ci]) return;
    openCopyInterval({ col: grid.cols[ci], x: e.clientX, y: e.clientY, onApply: (copies) => insertColumnsAfter(ci, copies) });
  });
  $('gc-dc-dates').addEventListener('click', () => { hideCtx(); openDates('col', 0, ctxDCCol >= 0 ? ctxDCCol : dcCol); });
  $('gc-cell-dates').addEventListener('click', () => { hideCtx(); openDates('cell', ctxR, ctxC); });
  $('gc-dc-note').addEventListener('click', () => { hideCtx(); openFnEditor('col', 0, ctxDCCol >= 0 ? ctxDCCol : dcCol); });
}
