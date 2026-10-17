// "Forskyv tider…" (user test 2026-10-17): the mini-jog floating over the column. Each notch moves the
// times one minute (Shift: ten); the change is live. Enter or a click outside keeps it, Esc undoes it.
import { t } from '../i18n/strings.js';
import { jogDial } from './jog/jogDial.js';

/** @type {(() => void) | null} */
let closeOpen = null;

/**
 * @param {{ x: number, y: number, onShift: (total: number) => void, onUndo: () => void, onDone?: () => void }} opts
 *   onShift gets the total minutes from where it started (the caller re-applies from its own snapshot)
 */
export function openTimeNudge({ x, y, onShift, onUndo, onDone }) {
  closeOpen?.();
  let total = 0;
  const box = document.createElement('div');
  box.className = 'nudge-box';
  box.innerHTML = `<span class="nudge-read">0 min</span><span class="nudge-jog"></span><span class="nudge-hint">${t('nudgeHint')}</span>`;
  const read = /** @type {HTMLElement} */ (box.querySelector('.nudge-read'));
  const jog = jogDial({
    size: 30, detents: true, pxPerNotch: 9,
    onNudge: (/** @type {1 | -1} */ dir, /** @type {boolean} */ coarse) => {
      total += dir * (coarse ? 10 : 1);
      read.textContent = `${total > 0 ? '+' : ''}${total} min`;
      onShift(total);
    },
  });
  /** @type {HTMLElement} */ (box.querySelector('.nudge-jog')).appendChild(jog);
  document.body.appendChild(box);
  // The jog's own arrow keys reach it first; they stop here, never reaching the grid
  box.addEventListener('keydown', (e) => e.stopPropagation());
  box.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 240))}px`;
  box.style.top = `${Math.max(8, y)}px`;

  const close = () => {
    box.remove();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('mousedown', onOutside, true);
    if (closeOpen === close) closeOpen = null;
  };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); onUndo(); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(); onDone?.(); }
  };
  /** @param {MouseEvent} e */
  const onOutside = (e) => { if (!box.contains(/** @type {Node} */ (e.target))) { close(); onDone?.(); } };
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
  closeOpen = close;
  jog.focus();
  return { close };
}
