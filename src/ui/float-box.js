// A small floating box over the page (the grid's helpers: day codes, copying at an interval, notes,
// dates): a title, a body, Apply and Avbryt. Fixed size, placed near where it was asked for and kept
// inside the window. Esc cancels; Ctrl+Enter applies. One at a time.
import { t } from '../i18n/strings.js';

/** @type {(() => void) | null} */
let closeOpen = null;

/**
 * @param {{ x: number, y: number, title: string, body: HTMLElement, cls?: string,
 *           onApply: () => boolean | void, onCancel?: () => void, applyLabel?: string }} opts
 *   onApply returns false to keep the box open
 * @returns {{ box: HTMLElement, setApplyEnabled: (on: boolean) => void, close: () => void }}
 */
export function openFloatBox({ x, y, title, body, cls = '', onApply, onCancel, applyLabel }) {
  closeOpen?.();
  const box = document.createElement('div');
  box.className = `float-box ${cls}`.trim();
  box.innerHTML = `<div class="fb-head"><b></b><button class="fb-x" title="Esc">✕</button></div><div class="fb-body"></div>
    <div class="fb-foot"><button class="pop-btn fb-cancel"></button><button class="pop-btn primary fb-apply" title="Ctrl+Enter"></button></div>`;
  /** @type {HTMLElement} */ (box.querySelector('.fb-head b')).textContent = title;
  /** @type {HTMLElement} */ (box.querySelector('.fb-body')).appendChild(body);
  const apply = /** @type {HTMLButtonElement} */ (box.querySelector('.fb-apply'));
  apply.textContent = applyLabel ?? t('fnApply');
  /** @type {HTMLElement} */ (box.querySelector('.fb-cancel')).textContent = t('cancel');
  document.body.appendChild(box);

  const close = () => {
    box.remove();
    document.removeEventListener('keydown', onKey, true);
    if (closeOpen === close) closeOpen = null;
  };
  const cancel = () => { close(); onCancel?.(); };
  const doApply = () => { if (apply.disabled) return; if (onApply() !== false) close(); };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); doApply(); }
  };
  // Typing in the box reaches its own fields first, then stops here: never the grid
  box.addEventListener('keydown', (e) => e.stopPropagation());
  document.addEventListener('keydown', onKey, true);
  apply.addEventListener('click', doApply);
  box.querySelector('.fb-cancel')?.addEventListener('click', cancel);
  box.querySelector('.fb-x')?.addEventListener('click', cancel);
  closeOpen = close;

  // Near the point, inside the window
  const w = box.offsetWidth || 320, h = box.offsetHeight || 240;
  box.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
  box.style.top = `${Math.max(8, Math.min(y, window.innerHeight - h - 8))}px`;
  return { box, setApplyEnabled: (on) => { apply.disabled = !on; }, close };
}

/** Close the open box, if any (without applying). */
export function closeFloatBox() { closeOpen?.(); }
