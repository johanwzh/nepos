// The destination columns (destination displays spec): a narrow column after each trip column,
// shown and hidden like the map (Alt+D, remembered per user). Each destination is a small label where
// it starts and a line in its colour down to where the next one starts; vias make the line double.
// Also the small box for editing one destination.
import { t } from '../i18n/strings.js';
import { destSegments, destLabel, servedRows } from '../core/destinations.js';
import { openFloatBox } from './float-box.js';
import { addOnce } from './shell.js';

const KEY = 'nepos.destOpen';
let open = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
/** @type {(() => void)[]} */
const listeners = [];

/** Whether the destination columns are shown. */
export function destColumnsOpen() {
  return open;
}

/** Show or hide the destination columns (and remember it). */
export function toggleDestColumns() {
  open = !open;
  try { localStorage.setItem(KEY, open ? '1' : '0'); } catch { /* private window: not remembered */ }
  for (const fn of listeners) fn();
}

/** Called when the columns are shown or hidden. @param {() => void} fn */
export function onDestToggle(fn) {
  addOnce(listeners, fn);
}

/**
 * @typedef {{ line?: { colour: number, double: boolean, gap: boolean, last: boolean },
 *             label?: import('../core/destinations.js').DestSegment, missing?: boolean, served: boolean }} DestCellInfo
 */

/**
 * What each row of one column's destination cell shows.
 * @param {{ stops: any[] }} grid @param {any} col
 * @returns {DestCellInfo[]}
 */
export function destCellInfo(grid, col) {
  const served = servedRows(grid, col);
  const servedSet = new Set(served);
  /** @type {DestCellInfo[]} */
  const out = grid.stops.map((_, r) => ({ served: servedSet.has(r) }));
  const segs = destSegments(grid, col);
  for (const seg of segs) {
    if (seg.state === 'unserved') { out[seg.row].label = seg; continue; }
    for (let r = seg.row; r <= seg.end && r < out.length; r++) {
      out[r].line = { colour: seg.colour, double: seg.dest.vias.length > 0, gap: !servedSet.has(r), last: seg.state === 'last' };
    }
    out[seg.row].label = seg;
  }
  if (!col.dest && served.length) out[served[0]].missing = true;
  return out;
}

/**
 * Fill one destination cell.
 * @param {HTMLElement} td @param {DestCellInfo | undefined} info
 */
export function renderDestCell(td, info) {
  const inner = document.createElement('div');
  inner.className = 'dest-in';
  td.appendChild(inner);
  if (!info) return;
  if (info.line) {
    const l = info.line;
    const line = document.createElement('span');
    line.className = `dl dl-c${l.colour}${l.double ? ' dl-double' : ''}${l.gap ? ' dl-gap' : ''}`;
    inner.appendChild(line);
  }
  if (info.label) {
    const seg = info.label;
    const { text, vias } = destLabel(seg.dest);
    const label = document.createElement('span');
    label.className = `dest-label${seg.state === 'last' ? ' dl-last' : ''}${seg.state === 'unserved' ? ' dl-warn' : ''}`;
    label.textContent = text;
    if (vias) {
      const v = document.createElement('span');
      v.className = 'dest-via';
      v.textContent = vias;
      label.append(' ', v);
    }
    label.title = seg.state === 'last' ? t('destLastTitle') : seg.state === 'unserved' ? t('destUnservedTitle') : `${text}${vias ? ` ${vias}` : ''}`;
    inner.appendChild(label);
  }
  if (info.missing) {
    const m = document.createElement('span');
    m.className = 'dest-missing';
    m.title = t('destMissingTitle');
    inner.appendChild(m);
  }
}

/**
 * The box for one destination: its text (with the project's own suggestions) and its vias.
 * @param {{ x: number, y: number, dest: import('../core/destinations.js').Dest | null, initial?: string,
 *           suggestions: string[], onApply: (dest: import('../core/destinations.js').Dest | null) => void }} opts
 */
export function openDestEditor({ x, y, dest, initial, suggestions, onApply }) {
  const body = document.createElement('div');
  body.className = 'dest-edit';
  body.innerHTML = `<label class="de-lbl"></label><input type="text" class="de-text" autocomplete="off">
    <div class="de-sugg" hidden></div><div class="de-vias"></div><button class="pop-btn de-add-via"></button>`;
  /** @type {HTMLElement} */ (body.querySelector('.de-lbl')).textContent = t('destText');
  const input = /** @type {HTMLInputElement} */ (body.querySelector('.de-text'));
  const sugg = /** @type {HTMLElement} */ (body.querySelector('.de-sugg'));
  const viasEl = /** @type {HTMLElement} */ (body.querySelector('.de-vias'));
  const addVia = /** @type {HTMLButtonElement} */ (body.querySelector('.de-add-via'));
  addVia.textContent = t('destAddVia');
  input.value = initial ?? dest?.text ?? '';
  /** @type {string[]} */
  let vias = [...(dest?.vias ?? [])];
  let hi = -1;
  /** @type {string[]} */
  let shown = [];

  const result = () => {
    const text = input.value.trim();
    return text ? { text, vias: vias.map((v) => v.trim()).filter(Boolean) } : null;
  };
  const renderVias = () => {
    viasEl.innerHTML = '';
    vias.forEach((v, i) => {
      const row = document.createElement('div');
      row.className = 'de-via';
      const vi = document.createElement('input');
      vi.type = 'text';
      vi.className = 'de-via-text';
      vi.value = v;
      vi.setAttribute('autocomplete', 'off');
      vi.placeholder = 'via';
      vi.addEventListener('input', () => { vias[i] = vi.value; });
      row.appendChild(vi);
      for (const [label, cls, fn] of /** @type {[string, string, () => void][]} */ ([
        ['↑', 'de-up', () => { if (i > 0) { [vias[i - 1], vias[i]] = [vias[i], vias[i - 1]]; renderVias(); } }],
        ['↓', 'de-down', () => { if (i < vias.length - 1) { [vias[i + 1], vias[i]] = [vias[i], vias[i + 1]]; renderVias(); } }],
        ['✕', 'de-del', () => { vias.splice(i, 1); renderVias(); }],
      ])) {
        const b = document.createElement('button');
        b.className = `pop-btn ${cls}`;
        b.textContent = label;
        b.addEventListener('click', fn);
        row.appendChild(b);
      }
      viasEl.appendChild(row);
    });
  };
  const renderSugg = () => {
    const q = input.value.trim().toLowerCase();
    shown = q ? suggestions.filter((s) => s.toLowerCase().startsWith(q) && s.toLowerCase() !== q).slice(0, 8) : [];
    if (hi >= shown.length) hi = -1;
    sugg.innerHTML = '';
    sugg.hidden = !shown.length;
    shown.forEach((s, i) => {
      const item = document.createElement('div');
      item.className = `de-sugg-item${i === hi ? ' on' : ''}`;
      item.textContent = s;
      item.addEventListener('mousedown', (e) => { e.preventDefault(); input.value = s; hi = -1; renderSugg(); });
      sugg.appendChild(item);
    });
  };
  addVia.addEventListener('click', () => { vias.push(''); renderVias(); /** @type {HTMLInputElement | null} */ (viasEl.querySelector('.de-via:last-child input'))?.focus(); });
  input.addEventListener('input', () => { hi = -1; renderSugg(); });

  const box = openFloatBox({ x, y, title: t('destTitle'), body, cls: 'dest-box', onApply: () => { onApply(result()); } });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && shown.length) { e.preventDefault(); hi = (hi + 1) % shown.length; renderSugg(); }
    else if (e.key === 'ArrowUp' && shown.length) { e.preventDefault(); hi = hi <= 0 ? shown.length - 1 : hi - 1; renderSugg(); }
    else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (hi >= 0 && shown[hi]) { input.value = shown[hi]; hi = -1; renderSugg(); return; }
      onApply(result());
      box.close();
    }
  });
  renderVias();
  renderSugg();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  return { box: box.box, input };
}
