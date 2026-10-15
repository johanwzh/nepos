// The two-step transport mode menu (line header spec §2): modes, then the chosen mode's
// submodes with "not specified" first.
import { TRANSMODEL_MODES } from '../core/modes.js';
import { modeLabel, submodeLabel } from '../i18n/modes.js';
import { modeIconSvg } from './mode-icons.js';
import { t } from '../i18n/strings.js';

/** @type {(() => void) | null} */
let closeOpen = null;

/**
 * @param {HTMLElement} anchor
 * @param {{ mode: string, submode: string, lang: 'no' | 'en', onPick: (mode: string, submode: string) => void }} opts
 */
export function openModeMenu(anchor, { mode, submode, lang, onPick }) {
  closeOpen?.();
  const menu = document.createElement('div');
  menu.className = 'mode-menu';
  const modes = document.createElement('div');
  modes.className = 'mode-col';
  const subs = document.createElement('div');
  subs.className = 'mode-col mode-subs';
  menu.append(modes, subs);

  /** @param {string} m */
  const showSubs = (m) => {
    for (const el of modes.querySelectorAll('.mode-item')) el.classList.toggle('active', /** @type {HTMLElement} */ (el).dataset.mode === m);
    subs.innerHTML = '';
    const entry = TRANSMODEL_MODES.find((x) => x.mode === m);
    for (const s of ['', ...(entry?.submodes ?? [])]) {
      const row = document.createElement('div');
      row.className = `mode-sub${m === mode && s === submode ? ' current' : ''}`;
      row.dataset.sub = s;
      row.innerHTML = `${modeIconSvg(m, s)} `;
      row.append(s ? submodeLabel(s, lang) : t('submodeNone'));
      row.addEventListener('click', () => { close(); onPick(m, s); });
      subs.appendChild(row);
    }
  };
  for (const { mode: m } of TRANSMODEL_MODES.filter((x) => x.mode !== 'other')) {
    const row = document.createElement('div');
    row.className = 'mode-item';
    row.dataset.mode = m;
    row.innerHTML = `${modeIconSvg(m)} `;
    row.append(modeLabel(m, lang));
    row.addEventListener('mouseenter', () => showSubs(m));
    row.addEventListener('click', () => showSubs(m));
    modes.appendChild(row);
  }

  const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const onDown = (/** @type {MouseEvent} */ e) => { if (!menu.contains(/** @type {Node} */ (e.target)) && e.target !== anchor) close(); };
  function close() {
    menu.remove();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('mousedown', onDown, true);
    closeOpen = null;
  }
  closeOpen = close;
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('mousedown', onDown, true);
  const r = anchor.getBoundingClientRect();
  menu.style.left = `${r.left}px`;
  menu.style.top = `${r.bottom + 4}px`;
  document.body.appendChild(menu);
  if (mode) showSubs(mode);
}
