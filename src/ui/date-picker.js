// "Datoer…" for a trip or a single time (spreadsheet tools spec, 2026-10-17): a floating box with six
// months (3 × 2), the calendar editor's look. A toggle chooses the mode — Legg til (it also runs on these
// days) or Fjern (it does not run on these days); click or drag days to mark them, and a marked day
// clicked again in its mode is unmarked. Shown: the days it runs by its calendars and day code (normal),
// added days (green), removed days (red, struck). Apply (Ctrl+Enter) keeps them as ranges.
import { app } from './state.js';
import { t } from '../i18n/strings.js';
import { addDays, rangeDays } from '../core/calendars.js';
import { renderMonthsView } from './year-view.js';
import { openFloatBox } from './float-box.js';

/** @typedef {{ from: string, to: string, on: boolean }} DateRange */

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
function todayYmd() { const n = new Date(); return `${n.getFullYear()}${pad(n.getMonth() + 1)}${pad(n.getDate())}`; }
/** @param {string} ym @param {number} n */
function addMonths(ym, n) {
  const idx = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(4, 6)) - 1 + n;
  return `${Math.floor(idx / 12)}${pad((idx % 12) + 1)}`;
}

/** Every day of the ranges. @param {DateRange[]} ranges @param {boolean} on */
function daysOf(ranges, on) {
  /** @type {Set<string>} */ const out = new Set();
  for (const r of ranges) {
    if (r.on !== on) continue;
    for (const d of rangeDays(r)) out.add(d);
  }
  return out;
}

/** Days back into ranges of consecutive days. @param {Set<string>} days @param {boolean} on @returns {DateRange[]} */
export function toRanges(days, on) {
  /** @type {DateRange[]} */ const out = [];
  for (const d of [...days].sort()) {
    const last = out[out.length - 1];
    if (last && addDays(last.to, 1) === d) last.to = d;
    else out.push({ from: d, to: d, on });
  }
  return out;
}

/**
 * @param {{ x: number, y: number, title: string, base: string[], dates: DateRange[], onApply: (dates: DateRange[]) => void, removeOnly?: boolean }} opts
 *   base: the days it runs by its calendars and day code, before its own dates; removeOnly: a single time,
 *   which can only be switched off on some of the trip's days (user 2026-10-18): no "runs also"
 */
export function openDatePicker({ x, y, title, base, dates, onApply, removeOnly = false }) {
  const added = removeOnly ? new Set() : daysOf(dates, true);
  const removed = daysOf(dates, false);
  const baseSet = new Set(base);
  let mode = /** @type {'add' | 'remove'} */ (removeOnly ? 'remove' : 'add');
  let start = todayYmd().slice(0, 6);

  const body = document.createElement('div');
  body.className = 'dp';
  body.innerHTML = `<div class="dp-bar">
      <span class="dp-modes">${removeOnly ? '' : `<button class="dp-mode" data-mode="add">${t('dpAdd')}</button>`}<button class="dp-mode" data-mode="remove">${t('dpRemove')}</button></span>
      <span class="dp-nav"><button class="dp-prev" title="${t('calPrevMonth')}">↑</button><button class="dp-today">${t('calToday')}</button><button class="dp-next" title="${t('calNextMonth')}">↓</button></span>
    </div>
    <div class="dp-months cal-year-view"></div>
    <div class="dp-legend"><span class="dp-key dp-base"></span>${t('dpBase')} <span class="dp-key dp-added"></span>${t('dpAdded')} <span class="dp-key dp-removed"></span>${t('dpRemoved')}</div>`;
  const months = /** @type {HTMLElement} */ (body.querySelector('.dp-months'));

  const draw = () => {
    body.querySelectorAll('.dp-mode').forEach((b) => b.classList.toggle('on', /** @type {HTMLElement} */ (b).dataset.mode === mode));
    /** @type {Map<string, string>} */
    const marks = new Map();
    for (const d of baseSet) marks.set(d, 'dp-base');
    for (const d of added) marks.set(d, 'dp-added');
    for (const d of removed) marks.set(d, 'dp-removed');
    months.innerHTML = '';
    renderMonthsView(months, {
      start, count: 6, today: todayYmd(), lang: app.settings.lang === 'en' ? 'en' : 'no', marks,
      // What a click does depends on the mode: the days marked in this mode are the "on" ones
      active: mode === 'add' ? added : removed,
      onChange: (days, on) => {
        const mine = mode === 'add' ? added : removed, other = mode === 'add' ? removed : added;
        for (const d of days) { if (on) { mine.add(d); other.delete(d); } else mine.delete(d); }
        draw();
      },
    });
  };
  body.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    const m = el.closest('.dp-mode');
    if (m) { mode = /** @type {'add' | 'remove'} */ (/** @type {HTMLElement} */ (m).dataset.mode); draw(); return; }
    if (el.closest('.dp-prev')) { start = addMonths(start, -3); draw(); }
    else if (el.closest('.dp-next')) { start = addMonths(start, 3); draw(); }
    else if (el.closest('.dp-today')) { start = todayYmd().slice(0, 6); draw(); }
  });
  const fb = openFloatBox({ x, y, title, body, cls: 'dp-box', onApply: () => onApply([...toRanges(added, true), ...toRanges(removed, false)]) });
  draw();
  fb.place(); // by its full size, with the calendars in it
}
