// The shared list frame for Linjer, Kalendere and Ressurser (list pages, decided 2026-10-16):
// - a left pane (a toolkit, resizable) with "Finn" (search, filters) above and "Verktøy" (actions)
//   below a clear line; the only thing above the list itself is the row of sortable column headers;
// - each row is a record line, and — where a calendar is involved — a timeline band under it across
//   the whole width, with a validity strip at the left edge;
// - selection by click, Shift-click and Ctrl-click (no checkboxes); double-click or Enter edits;
//   arrows, Shift+arrows, Ctrl+A, Delete and Ctrl+C (the rows as plain text) work as usual;
// - the state (search, filters, sort, selection, scroll) lasts the session: a page reload resets it.
import { t, getLang } from '../i18n/strings.js';
import { validityBar, todayYmd } from './validity-bar.js';
import { pick } from './selection.js';
import { addDays } from '../core/calendars.js';

/**
 * @typedef {{ key: string, label: () => string, cell: (row: any) => string, text?: (row: any) => string,
 *             sort?: (row: any) => string | number, width?: string }} Column  cell is HTML
 * @typedef {{ id: string, label: () => string, enabled?: (sel: string[]) => boolean, run: (sel: string[]) => void, danger?: boolean }} Tool
 * @typedef {{ id: string, rows: () => any[], rowId: (row: any) => string, columns: Column[],
 *             band?: (row: any) => string[], rowClass?: (row: any) => string, today?: () => string,
 *             renderFinders?: (box: HTMLElement, state: Record<string, any>, changed: () => void) => void,
 *             matches?: (row: any, state: Record<string, any>) => boolean,
 *             tools: Tool[], renderExtraTools?: (box: HTMLElement, sel: string[]) => void,
 *             onEdit: (id: string) => void, onDelete?: (ids: string[]) => void, empty?: () => string,
 *             defaultSort?: { col: string, dir: 1 | -1 } }} ListSpec
 */

/** Days before the end that count as "ends soon" (the amber strip). */
export const ENDING_DAYS = 30;

/**
 * Where a set of valid days stands today: none, future (starts later), expired, ending (within
 * ENDING_DAYS), valid.
 * @param {string[]} days sorted YYYYMMDD @param {string} today
 */
export function validityOf(days, today) {
  if (!days.length) return 'none';
  const first = days[0], last = days[days.length - 1];
  if (last < today) return 'expired';
  if (first > today) return 'future';
  if (last <= addDays(today, ENDING_DAYS)) return 'ending';
  return 'valid';
}

/** @type {Map<string, { sort: { col: string, dir: 1 | -1 } | null, finder: Record<string, any>, sel: Set<string>, anchor: string | null, scroll: number }>} */
const states = new Map();
let paneWidth = 200;

/** Forget every list's state (a page reload does this; tests too). */
export function resetListStates() {
  states.clear();
  paneWidth = 200;
}

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * @param {HTMLElement} root
 * @param {ListSpec} spec
 */
export function createListView(root, spec) {
  if (!states.has(spec.id)) states.set(spec.id, { sort: null, finder: {}, sel: new Set(), anchor: null, scroll: 0 });
  const st = /** @type {NonNullable<ReturnType<typeof states.get>>} */ (states.get(spec.id));
  /** @type {string[]} */ let shown = [];
  /** @type {any[]} */ let shownRows = [];
  const today = spec.today ?? todayYmd;
  const grid = spec.columns.map((c) => c.width ?? 'minmax(0, 1fr)').join(' ');

  function build() {
    root.innerHTML = `<div class="lv">
      <aside class="lv-pane" style="width:${paneWidth}px">
        <div class="lv-find"><div class="lv-h">${esc(t('lvFind'))}</div><div class="lv-finders"></div></div>
        <div class="lv-split"></div>
        <div class="lv-tools"><div class="lv-h">${esc(t('lvTools'))}</div><div class="lv-toolbox"></div><div class="lv-extra"></div><div class="lv-count"></div></div>
        <div class="lv-resize" title="${esc(t('lvResize'))}"></div>
      </aside>
      <section class="lv-main" tabindex="0">
        <div class="lv-head" style="grid-template-columns:${grid}"></div>
        <div class="lv-body"></div>
      </section>
    </div>`;
    root.dataset.lv = spec.id;
    root.dataset.lvLang = getLang(); // a language switch rebuilds the labels
    const finders = /** @type {HTMLElement} */ (root.querySelector('.lv-finders'));
    spec.renderFinders?.(finders, st.finder, () => { st.scroll = 0; render(); });
    const toolbox = /** @type {HTMLElement} */ (root.querySelector('.lv-toolbox'));
    for (const tool of spec.tools) {
      const b = document.createElement('button');
      b.id = tool.id;
      b.className = `lv-tool${tool.danger ? ' danger' : ''}`;
      b.textContent = tool.label();
      b.addEventListener('click', () => tool.run(selected()));
      toolbox.appendChild(b);
    }
    const head = /** @type {HTMLElement} */ (root.querySelector('.lv-head'));
    head.innerHTML = spec.columns.map((c) => (c.sort ? `<span data-col="${c.key}">${esc(c.label())}</span>` : `<span>${esc(c.label())}</span>`)).join('');
    head.querySelectorAll('[data-col]').forEach((h) => h.addEventListener('click', () => {
      const col = /** @type {string} */ (/** @type {HTMLElement} */ (h).dataset.col);
      const cur = st.sort ?? spec.defaultSort ?? { col: spec.columns.find((c) => c.sort)?.key ?? '', dir: /** @type {1} */ (1) };
      st.sort = { col, dir: cur.col === col ? /** @type {1 | -1} */ (-cur.dir) : 1 };
      render();
    }));
    const body = /** @type {HTMLElement} */ (root.querySelector('.lv-body'));
    const main = /** @type {HTMLElement} */ (root.querySelector('.lv-main'));
    body.addEventListener('click', (e) => {
      const row = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.lv-row'));
      if (!row || /** @type {HTMLElement} */ (e.target).closest('a, button, input, select')) return;
      ({ selected: st.sel, anchor: st.anchor } = pick({ selected: st.sel, anchor: st.anchor }, shown, /** @type {string} */ (row.dataset.id),
        { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }));
      main.focus({ preventScroll: true });
      render();
    });
    body.addEventListener('dblclick', (e) => {
      const row = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.lv-row'));
      if (row && !/** @type {HTMLElement} */ (e.target).closest('a, button, input, select')) spec.onEdit(/** @type {string} */ (row.dataset.id));
    });
    body.addEventListener('scroll', () => { st.scroll = body.scrollTop; });
    root.addEventListener('keydown', onKey);
    // the toolkit's width can be tweaked
    const pane = /** @type {HTMLElement} */ (root.querySelector('.lv-pane'));
    root.querySelector('.lv-resize')?.addEventListener('mousedown', (e) => {
      const me = /** @type {MouseEvent} */ (e);
      me.preventDefault();
      const x0 = me.clientX, w0 = pane.offsetWidth || paneWidth;
      const move = (/** @type {MouseEvent} */ ev) => { paneWidth = Math.max(160, Math.min(420, w0 + ev.clientX - x0)); pane.style.width = `${paneWidth}px`; };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    const tag = /** @type {HTMLElement} */ (e.target).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || document.querySelector('dialog[open]')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!shown.length) return;
      e.preventDefault();
      const cur = st.anchor && shown.includes(st.anchor) ? shown.indexOf(st.anchor) : -1;
      const next = Math.max(0, Math.min(shown.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)));
      if (e.shiftKey && cur >= 0) {
        st.sel.add(shown[next]);
        st.anchor = shown[next];
      } else {
        st.sel = new Set([shown[next]]);
        st.anchor = shown[next];
      }
      render();
    } else if (ctrl && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      st.sel = new Set(shown);
      render();
    } else if (ctrl && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      void copySelected();
    } else if (e.key === 'Enter' && st.anchor && st.sel.has(st.anchor)) {
      e.preventDefault();
      spec.onEdit(st.anchor);
    } else if (e.key === 'Delete' && st.sel.size && spec.onDelete) {
      e.preventDefault();
      spec.onDelete(selected());
    }
  }

  /** The selected rows as plain text (tab between columns, a header line), for pasting anywhere. */
  async function copySelected() {
    const rows = shownRows.filter((r) => st.sel.has(spec.rowId(r)));
    if (!rows.length) return;
    const cols = spec.columns.filter((c) => c.text);
    const text = [cols.map((c) => c.label()).join('\t'), ...rows.map((r) => cols.map((c) => /** @type {any} */ (c).text(r)).join('\t'))].join('\n');
    try { await navigator.clipboard.writeText(text); } catch { /* nothing copied */ }
  }

  /** The selected ids, in the order shown. */
  function selected() {
    return shown.filter((id) => st.sel.has(id));
  }

  function render() {
    if (root.dataset.lv !== spec.id || root.dataset.lvLang !== getLang() || !root.querySelector('.lv-body')) build();
    const all = spec.rows();
    const ids = new Set(all.map(spec.rowId));
    st.sel = new Set([...st.sel].filter((id) => ids.has(id))); // items can go away
    const sort = st.sort ?? spec.defaultSort ?? { col: spec.columns.find((c) => c.sort)?.key ?? '', dir: 1 };
    const col = spec.columns.find((c) => c.key === sort.col && c.sort);
    const now = today();
    shownRows = all.filter((r) => !spec.matches || spec.matches(r, st.finder));
    if (col?.sort) {
      const key = col.sort;
      shownRows.sort((a, b) => {
        const x = key(a), y = key(b);
        return sort.dir * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'nb', { numeric: true }));
      });
    }
    shown = shownRows.map(spec.rowId);
    root.querySelectorAll('.lv-head [data-col]').forEach((h) => {
      const c = /** @type {HTMLElement} */ (h).dataset.col;
      h.classList.toggle('sorted', c === sort.col);
      h.setAttribute('data-dir', c === sort.col ? String(sort.dir) : '');
    });
    const body = /** @type {HTMLElement} */ (root.querySelector('.lv-body'));
    body.innerHTML = shownRows.map((r) => {
      const id = spec.rowId(r);
      const days = spec.band ? spec.band(r) : null;
      const state = days ? `lv-${validityOf(days, now)}` : 'lv-noband';
      return `<div class="lv-row ${state}${st.sel.has(id) ? ' selected' : ''} ${spec.rowClass?.(r) ?? ''}" data-id="${esc(id)}">
        <div class="lv-rec" style="grid-template-columns:${grid}">${spec.columns.map((c) => `<span class="lv-c lv-c-${c.key}">${c.cell(r)}</span>`).join('')}</div>
        ${days ? `<div class="lv-band">${validityBar(days, now)}</div>` : ''}</div>`;
    }).join('') || `<div class="lv-empty">${esc(spec.empty?.() ?? t('noMatches'))}</div>`;
    body.scrollTop = st.scroll;
    const sel = selected();
    for (const tool of spec.tools) {
      const b = /** @type {HTMLButtonElement | null} */ (root.querySelector(`#${tool.id}`));
      if (b) b.disabled = tool.enabled ? !tool.enabled(sel) : false;
    }
    const extra = /** @type {HTMLElement} */ (root.querySelector('.lv-extra'));
    if (spec.renderExtraTools) spec.renderExtraTools(extra, sel);
    /** @type {HTMLElement} */ (root.querySelector('.lv-count')).textContent = sel.length ? t('ltSelected', sel.length) : '';
  }

  return { render, selected, order: () => [...shown], select: (/** @type {string[]} */ ids) => { st.sel = new Set(ids); st.anchor = ids[0] ?? null; } };
}
