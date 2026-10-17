// "Forskyv tider…" (user test 2026-10-17): the mini-jog as a standing tool. It stays open until closed
// (✕ or Esc) while the selection in the grid changes; each notch moves whatever is selected at that
// moment one minute (Shift: ten). The readout counts the minutes moved while it has been open.
import { t } from '../i18n/strings.js';
import { jogDial } from './jog/jogDial.js';

/** @type {(() => void) | null} */
let closeOpen = null;

/**
 * @param {{ x: number, y: number, onNudge: (minutes: number) => void, onClose?: () => void }} opts
 */
export function openTimeNudge({ x, y, onNudge, onClose }) {
  closeOpen?.();
  let total = 0;
  const box = document.createElement('div');
  box.className = 'nudge-box';
  box.innerHTML = `<span class="nudge-read">0 min</span><span class="nudge-jog"></span><span class="nudge-hint">${t('nudgeHint')}</span><button class="nudge-x" title="Esc">✕</button>`;
  const read = /** @type {HTMLElement} */ (box.querySelector('.nudge-read'));
  const jog = jogDial({
    size: 30, detents: true, pxPerNotch: 9,
    onNudge: (/** @type {1 | -1} */ dir, /** @type {boolean} */ coarse) => {
      const d = dir * (coarse ? 10 : 1);
      total += d;
      read.textContent = `${total > 0 ? '+' : ''}${total} min`;
      onNudge(d);
    },
  });
  /** @type {HTMLElement} */ (box.querySelector('.nudge-jog')).appendChild(jog);
  document.body.appendChild(box);
  // The jog's own arrow keys reach it first; they stop here, never reaching the grid
  box.addEventListener('keydown', (e) => e.stopPropagation());
  box.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 300))}px`;
  box.style.top = `${Math.max(8, y)}px`;

  const close = () => {
    box.remove();
    document.removeEventListener('keydown', onKey, true);
    if (closeOpen === close) closeOpen = null;
    onClose?.();
  };
  /** @param {KeyboardEvent} e Esc closes the tool, from the jog or from the grid */
  const onKey = (e) => {
    if (e.key !== 'Escape' || document.querySelector('.float-box, dialog[open]')) return;
    e.preventDefault(); e.stopPropagation(); close();
  };
  document.addEventListener('keydown', onKey, true);
  box.querySelector('.nudge-x')?.addEventListener('click', close);
  closeOpen = close;
  jog.focus();
  return { close };
}

/** Is the tool open? */
export const nudgeOpen = () => closeOpen !== null;
