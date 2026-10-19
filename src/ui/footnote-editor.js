// Notes on a column or a cell (spreadsheet tools spec, 2026-10-17): text only, the same thing at every
// level (the line's note is the "Legg til en merknad" bar). Apply (or Ctrl+Enter), Fjern, Esc. Date
// changes are not here any more: they have their own date picker (date-picker.js).
import { app } from './state.js';
import { t } from '../i18n/strings.js';
import { markDirty } from './shell.js';
import { grid, render } from './grid.js';
import { openFloatBox, closeFloatBox } from './float-box.js';

const $ = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));

/** The column or cell a note belongs to. @param {'col' | 'cell'} type @param {number} ri @param {number} ci */
function holder(type, ri, ci) {
  return type === 'col' ? grid.cols[ci] ?? null : grid.cols[ci]?.cells[ri] ?? null;
}

/** Show the selected cell's note, else its column's, under the grid. @param {{ type: 'col' | 'cell', ri: number, ci: number } | null} where */
export function updateFnPreview(where = null) {
  const el = $('fn-preview');
  if (!el) return;
  let text = '';
  /** @type {{ type: 'col' | 'cell', ri: number, ci: number } | null} */
  let target = null;
  if (where && grid.active) {
    const col = grid.cols[where.ci];
    if (where.type === 'cell' && col?.cells[where.ri]?.note) { text = col.cells[where.ri].note; target = where; }
    else if (col?.note) { text = col.note; target = { type: 'col', ri: 0, ci: where.ci }; }
  }
  if (!text || !target) { el.classList.remove('visible'); el.onclick = null; return; }
  el.textContent = text;
  el.classList.add('visible');
  const at = target;
  el.onclick = () => openFnEditor(at.type, at.ri, at.ci);
}

/**
 * The note box for a column or a cell with a time; with `cells`, one note for all those cells at once (user
 * 2026-10-18: a note on the selected cells).
 * @param {'col' | 'cell'} type
 * @param {number} ri
 * @param {number} ci
 * @param {{ ri: number, ci: number }[]} [cells] every cell the note goes on (the first is ri, ci)
 */
export function openFnEditor(type, ri, ci, cells) {
  if (!app.routeState || grid.readOnly) return;
  const ats = (cells?.length ? cells : [{ ri, ci }]).map((c) => holder(type, c.ri, c.ci)).filter(Boolean);
  const at = ats[0];
  if (!at) return; // notes attach to columns and to cells with a time
  // Several cells: their note when they all have the same one, else empty
  const shared = ats.every((/** @type {any} */ x) => (x.note ?? '') === (at.note ?? '')) ? at.note ?? '' : '';
  const body = document.createElement('div');
  body.className = 'note-box';
  body.innerHTML = `<input type="text" class="note-text">
    <button class="note-remove"${ats.some((/** @type {any} */ x) => x.note) ? '' : ' hidden'}></button>`;
  // One line: a note becomes a NeTEx Notice text (user 2026-10-18)
  const text = /** @type {HTMLInputElement} */ (body.querySelector('.note-text'));
  const value = () => text.value.replace(/\s*[\r\n]+\s*/g, ' ').trim();
  text.value = shared;
  text.placeholder = t('noteHint');
  const remove = /** @type {HTMLButtonElement} */ (body.querySelector('.note-remove'));
  remove.textContent = t('noteRemove');
  const anchor = /** @type {HTMLElement | null} */ (document.querySelector(type === 'col' ? `.g-dc-cell[data-ci="${ci}"]` : `[data-r="${ri}"][data-c="${ci}"]`));
  const r = anchor?.getBoundingClientRect();
  const set = (/** @type {string} */ v) => { for (const x of ats) x.note = v; markDirty(); render(); updateFnPreview({ type, ri, ci }); };
  const box = openFloatBox({
    x: r?.left ?? 200, y: (r?.bottom ?? 160) + 4, title: ats.length > 1 ? t('noteTitleCells', ats.length) : t(type === 'col' ? 'noteTitleCol' : 'noteTitleCell'), body, cls: 'note-float',
    onApply: () => { if (value() !== shared) set(value()); // unchanged: nothing happens (mixed notes stay as they are) },
  });
  remove.addEventListener('click', () => { box.close(); set(''); });
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (value() !== shared) set(value()); // unchanged: nothing happens (mixed notes stay as they are) box.close(); } });
  text.focus();
}

export function closeFnEditor() { closeFloatBox(); }

export function initFootnoteEditor() { /* the note box is built when asked for */ }
