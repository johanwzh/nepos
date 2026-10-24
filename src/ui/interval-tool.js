// The Virtual intervals tool's boxes (power tools spec 2026-10-24). The drag itself lives in the grid; here: the
// dialog a drop at step 1 opens (interval and last departure typed in), and the "how often?" box a drag past six band
// columns opens (the collapsed intervals).
import { t } from '../i18n/strings.js';
import { openFloatBox } from './float-box.js';
import { INTERVALS, MIN_SPAN, MAX_SPAN, minSpan } from '../core/blocks.js';

/** A column width for the drag when the page cannot measure one (px). */
export const DRAG_STEP_PX = 56;

/** "16:05" → minutes of the day, or null. @param {string} s */
const clock = (s) => {
  const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(s.trim());
  return m && Number(m[1]) <= 23 && Number(m[2]) <= 59 ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** @param {number} m */
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * The block typed in: interval (one that divides an hour) and the last departure (a time of day; one at or before the
 * first departure is the next day). Refuses a last departure off the band or outside 2 h – 23 h 59 min.
 * @param {{ first: number, every?: number, span?: number, x: number, y: number, onApply: (b: { every: number, span: number }) => void, onCancel?: () => void }} opts
 *   first: the parent's first departure, minutes (with its day offset)
 */
export function openBlockDialog({ first, every = 60, span = MIN_SPAN, x, y, onApply, onCancel }) {
  const body = document.createElement('div');
  body.className = 'iv';
  body.innerHTML = `<label class="iv-row"><span>${t('ivEvery')}</span><select class="iv-every">${INTERVALS.map((n) => `<option value="${n}"${n === every ? ' selected' : ''}>${t('ivEveryN', n)}</option>`).join('')}</select></label>
    <label class="iv-row"><span>${t('ivLast')}</span><input class="iv-last" value="${hhmm(first + span)}" autocomplete="off"></label>
    <div class="iv-err"></div>`;
  const err = /** @type {HTMLElement} */ (body.querySelector('.iv-err'));
  openFloatBox({
    x, y, title: t('ivTitle'), body, cls: 'iv-box', onCancel,
    onApply: () => {
      const n = Number(/** @type {HTMLSelectElement} */ (body.querySelector('.iv-every')).value);
      const at = clock(/** @type {HTMLInputElement} */ (body.querySelector('.iv-last')).value);
      if (at === null) { err.textContent = t('ivErrTime'); return false; }
      let s = at - (first % 1440);
      while (s <= 0) s += 1440;
      if (s < minSpan(n) || s > MAX_SPAN) { err.textContent = t('ivErrRange'); return false; }
      if (s % n) { err.textContent = t('ivErrBand', n); return false; }
      onApply({ every: n, span: s });
    },
  });
}

/** "How often?" past six band columns: 6, 5, 4, 3, 2 or 1 minutes. @param {{ x: number, y: number, onPick: (every: number) => void, onCancel?: () => void }} opts */
export function openHowOften({ x, y, onPick, onCancel }) {
  const body = document.createElement('div');
  body.className = 'iv-often';
  body.innerHTML = [6, 5, 4, 3, 2, 1].map((n) => `<button type="button" class="pop-btn" data-every="${n}">${t('ivEveryN', n)}</button>`).join('');
  const box = openFloatBox({ x, y, title: t('ivOften'), body, cls: 'iv-box', onApply: () => false, onCancel });
  box.setApplyEnabled(false);
  for (const btn of body.querySelectorAll('[data-every]')) {
    btn.addEventListener('click', () => { box.close(); onPick(Number(/** @type {HTMLElement} */ (btn).dataset.every)); });
  }
}
