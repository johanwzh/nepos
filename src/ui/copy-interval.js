// "Kopier med intervall…" (user test 2026-10-17, from Reggi): copy a column every N minutes up to a
// last start time. The box says how many columns it will make before Apply.
import { t } from '../i18n/strings.js';
import { copiesAtInterval } from '../core/column-copy.js';
import { openFloatBox } from './float-box.js';

/** "60", "90", "1:30", "1.30" → minutes, or null. @param {string} s */
export function parseInterval(s) {
  const v = s.trim();
  let m = /^(\d{1,2})[:.](\d{2})$/.exec(v);
  if (m) return Number(m[1]) * 60 + Number(m[2]) || null;
  m = /^(\d{1,4})$/.exec(v);
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}

/** "1530", "15:30", "9:05" → minutes after midnight, or null. @param {string} s */
export function parseClock(s) {
  const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(s.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * @param {{ col: any, x: number, y: number, onApply: (copies: any[]) => void }} opts
 */
export function openCopyInterval({ col, x, y, onApply }) {
  const body = document.createElement('div');
  body.className = 'cpi';
  body.innerHTML = `<label class="cpi-row"><span>${t('cpiInterval')}</span><input class="cpi-interval" value="60" autocomplete="off"></label>
    <label class="cpi-row"><span>${t('cpiLast')}</span><input class="cpi-last" placeholder="16:00" autocomplete="off"></label>
    <div class="cpi-sum"></div>`;
  const interval = /** @type {HTMLInputElement} */ (body.querySelector('.cpi-interval'));
  const last = /** @type {HTMLInputElement} */ (body.querySelector('.cpi-last'));
  const copies = () => {
    const i = parseInterval(interval.value), l = parseClock(last.value);
    return i && l != null ? copiesAtInterval(col, i, l) : [];
  };
  const show = () => {
    const list = copies();
    const first = (/** @type {any} */ c) => c.cells.find((/** @type {any} */ x) => x?.time && x.time !== '|')?.time ?? '';
    const fmt = (/** @type {string} */ s) => `${s.slice(0, 2)}:${s.slice(2)}`;
    /** @type {HTMLElement} */ (body.querySelector('.cpi-sum')).textContent = list.length
      ? t('cpiSum', list.length, fmt(first(list[0])), fmt(first(list[list.length - 1]))) : t('cpiNone');
    fb.setApplyEnabled(list.length > 0);
  };
  interval.addEventListener('input', show);
  last.addEventListener('input', show);
  const fb = openFloatBox({ x, y, title: t('cpiTitle'), body, cls: 'cpi-box', onApply: () => { const list = copies(); if (!list.length) return false; onApply(list); } });
  show();
  last.focus();
}
