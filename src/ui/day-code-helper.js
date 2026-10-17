// "Velg dager…" on a day code (user test 2026-10-17, from Reggi): click the days the trip runs on and
// whether it runs on public holidays; the day code is shown as it will be written. Combinations the
// day codes cannot say are refused.
import { t } from '../i18n/strings.js';
import { dayCodeFor, dayCodePick } from '../core/day-codes.js';
import { openFloatBox } from './float-box.js';

/**
 * @param {{ code: string, x: number, y: number, onApply: (code: string) => void }} opts
 */
export function openDayCodeHelper({ code, x, y, onApply }) {
  const pick = dayCodePick(code);
  const on = new Set(pick.days);
  let holidays = pick.holidays;
  const body = document.createElement('div');
  body.className = 'dch';
  const names = /** @type {string[]} */ (/** @type {unknown} */ (t('dchDays')));
  body.innerHTML = `<div class="dch-days">${names.map((n, i) => `<button class="dch-day" data-day="${i + 1}">${n}</button>`).join('')}</div>
    <button class="dch-day dch-hol" data-day="H">${t('dchHolidays')}</button>
    <div class="dch-code"></div>`;
  const result = () => dayCodeFor(on, holidays);
  const show = () => {
    body.querySelectorAll('.dch-day[data-day]').forEach((b) => {
      const d = /** @type {HTMLElement} */ (b).dataset.day;
      b.classList.toggle('on', d === 'H' ? holidays : on.has(Number(d)));
    });
    const code = result();
    /** @type {HTMLElement} */ (body.querySelector('.dch-code')).textContent = code ? t('dchCode', code) : t('dchCannot');
    body.querySelector('.dch-code')?.classList.toggle('bad', !code);
    fb.setApplyEnabled(!!code);
  };
  body.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.dch-day'));
    if (!b) return;
    const d = b.dataset.day;
    if (d === 'H') holidays = !holidays;
    else if (on.has(Number(d))) on.delete(Number(d)); else on.add(Number(d));
    show();
  });
  const fb = openFloatBox({ x, y, title: t('dchTitle'), body, cls: 'dch-box', onApply: () => { const c = result(); if (!c) return false; onApply(c); } });
  show();
}
