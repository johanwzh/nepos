// Notes on a column or a cell (spreadsheet tools spec, 2026-10-17): text only, the same thing at every
// level (the line's note is the "Legg til en merknad" bar). Apply (or Ctrl+Enter), Fjern, Esc. Date
// changes are not here any more: they have their own date picker (date-picker.js).
import { app } from './state.js';
import { t } from '../i18n/strings.js';
import { markDirty } from './shell.js';
import { grid, render } from './grid.js';
import { openFloatBox, closeFloatBox } from './float-box.js';
import { normalizeBooking } from '../core/booking.js';

const $ = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));

/** The column or cell a note belongs to. @param {'col' | 'cell'} type @param {number} ri @param {number} ci */
function holder(type, ri, ci) {
  return type === 'col' ? grid.cols[ci] ?? null : grid.cols[ci]?.cells[ri] ?? null;
}

/** A booking in words, every field it has (booking spec 2026-10-22). @param {any} booking @param {string} label */
export function bookingSummary(booking, label) {
  const b = normalizeBooking(booking);
  if (!b) return '';
  const parts = [
    b.phone && `${t('bkPhone')} ${b.phone}`, b.email && `${t('bkEmail')} ${b.email}`, b.url && `${t('bkUrl')} ${b.url}`, b.details,
    b.access && t(`bk:${b.access}`), b.bookWhen && t(`bk:${b.bookWhen}`),
    b.methods && b.methods.map((m) => t(`bk:${m}`)).join(', '),
    b.buyWhen && `${t('bkBuyWhen')}: ${b.buyWhen.map((m) => t(`bk:${m}`)).join(', ')}`,
    b.latest && `${t('bkLatest')} ${b.latest.slice(0, 2)}:${b.latest.slice(2)}`,
    b.minAhead && `${t('bkMinAhead')} ${b.minAhead}`, b.maxAhead && `${t('bkMaxAhead')} ${b.maxAhead}`, b.note,
  ].filter(Boolean);
  return `${label}: ${parts.join(' · ')}`;
}

/** The dates on a time or a trip in a few words. @param {any[]} dates */
const datesText = (dates) => `${t('fnDatesLabel')}: ${t('datesSummary', dates.filter((d) => d.on).length, dates.filter((d) => !d.on).length)}`;

/**
 * Under the grid: everything about the selected time — its note (else its trip's), dates, boarding rule, request stop and
 * booking (else the trip's, else the line's) — in full; the grid itself has no hover texts (booking spec 2026-10-22).
 * @param {{ type: 'col' | 'cell', ri: number, ci: number } | null} where
 */
export function updateFnPreview(where = null) {
  const el = $('fn-preview');
  if (!el) return;
  let text = '';
  /** @type {{ type: 'col' | 'cell', ri: number, ci: number } | null} */
  let target = null;
  /** @type {string[]} */
  const more = [];
  if (where && grid.active) {
    const col = grid.cols[where.ci];
    const cell = where.type === 'cell' ? col?.cells[where.ri] : null;
    if (cell?.note) { text = cell.note; target = where; }
    else if (col?.note) { text = col.note; target = { type: 'col', ri: 0, ci: where.ci }; }
    if (cell?.dates?.length) more.push(datesText(cell.dates));
    else if (where.type === 'col' && col?.dates?.length) more.push(datesText(col.dates));
    if (cell?.suffix === 'a') more.push(t('fnAlight'));
    if (cell?.suffix === 'p') more.push(t('fnBoard'));
    if (cell?.req) more.push(t('xwReq'));
    if (cell?.interchange?.type === 'guaranteed' && cell.interchange.maxWait) more.push(t('fnWait', cell.interchange.maxWait));
    const booking = cell?.booking ? bookingSummary(cell.booking, t('bkTitle'))
      : col?.booking ? bookingSummary(col.booking, t('bkTrip'))
      : app.routeState?.booking ? bookingSummary(app.routeState.booking, t('bkLine')) : '';
    if (booking) more.push(booking);
  }
  if (!text && !more.length) { el.classList.remove('visible'); el.onclick = null; return; }
  el.textContent = [text, ...more].filter(Boolean).join(' · ');
  el.classList.add('visible');
  const at = target;
  el.onclick = at ? () => openFnEditor(at.type, at.ri, at.ci) : null;
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
  // Unchanged text changes nothing, so mixed notes on several cells are only replaced when something is typed
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
    onApply: () => { if (value() !== shared) set(value()); },
  });
  remove.addEventListener('click', () => { box.close(); set(''); });
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (value() !== shared) set(value()); box.close(); } });
  text.focus();
}

export function closeFnEditor() { closeFloatBox(); }

export function initFootnoteEditor() { /* the note box is built when asked for */ }
