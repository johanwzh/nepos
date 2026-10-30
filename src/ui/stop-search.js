// Stop picking 2 (2.5, docs/superpowers/specs/2026-10-29-stop-picking-2-design.md): typing in a stop cell opens a
// small floating window right at the cell, as Reggi did, so the eye stays in the spreadsheet. The hits are a tree:
// each stop place a heading with its Quays under it. A stop place is never picked, only a Quay, so a Quay can't be
// forgotten. Arrows move over the Quays, Enter (or a click) puts one on the row; Esc closes. A click on the map closes
// the window ("search in the list, finish on the map"). Late answers are ignored.
import { t } from '../i18n/strings.js';
import { NSR_QUAY_PATTERN, NSR_STOP_PLACE_PATTERN, modeMatches } from '../core/quays.js';
import { grid, focusGrid } from './grid.js';
import { pickerServices, pickerOpts, modeOk, quayInfoOf, useQuay, useQuayId, showPlaceOnMap, lineErnMode } from './stop-picker.js';
import { modeIconSvg } from './mode-icons.js';
import { onRefresh, currentPage } from './shell.js';
import { app } from './state.js';

/** How many hits get their Quays looked up (one NSR call). */
const TOP = 8;

/**
 * @typedef {import('../services/nsr.js').StopPlace} StopPlace
 * @typedef {{ place: StopPlace | null, quays: StopPlace['quays'] | null }} Branch  quays null: the lookup failed
 */

/** @type {{ el: HTMLElement, ri: number, route: string | null, branches: Branch[], direct: string | null, kb: number, seq: number, timer: any } | null} */
let open = null;
let seq = 0;
let wired = false;

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const isStopSearchOpen = () => !!open;

/** Close the window without picking (Esc, a click on the map, a power tool turned on). */
export function closeStopSearch() {
  if (!open) return;
  showPlaceOnMap(null, null); // no platform marked on the map any more
  clearTimeout(open.timer);
  open.el.remove();
  open = null;
  seq++;
  document.removeEventListener('mousedown', onOutside, true);
}

/** A click anywhere outside the window closes it (on the map: "finish on the map"). @param {MouseEvent} e */
function onOutside(e) {
  if (open && !open.el.contains(/** @type {Node} */ (e.target))) closeStopSearch();
}

/**
 * Open the search window at a stop cell, with the text typed so far.
 * @param {number} ri the stop row @param {string} text @param {boolean} [select] the text selected (Enter / F2: the stop's name)
 */
export function openStopSearch(ri, text, select = false) {
  closeStopSearch();
  if (grid.readOnly || !grid.stops[ri]) return;
  if (!wired) {
    wired = true;
    // Another page or another line: the window belongs to a stop cell that is gone (review)
    onRefresh(() => { if (open && (currentPage() !== 'edit' || app.activeRoute !== open.route)) closeStopSearch(); });
  }
  const el = document.createElement('div');
  el.className = 'float-box ss-box';
  el.innerHTML = `<div class="fb-head"><b></b><button class="fb-x" title="Esc">✕</button></div>
    <div class="fb-body"><input type="text" class="ss-q" autocomplete="off" spellcheck="false"><div class="ss-status"></div><div class="ss-tree"></div></div>`;
  /** @type {HTMLElement} */ (el.querySelector('.fb-head b')).textContent = t(grid.stops[ri].stopId ? 'spReplace' : 'spFind', ri + 1);
  document.body.appendChild(el);
  open = { el, ri, route: app.activeRoute, branches: [], direct: null, kb: -1, seq: ++seq, timer: null };
  place();
  const q = /** @type {HTMLInputElement} */ (el.querySelector('.ss-q'));
  q.value = text;
  q.placeholder = t('wsPlaceholder');
  q.focus();
  if (select) q.select(); else q.setSelectionRange(text.length, text.length);
  el.addEventListener('keydown', onKey);
  // New text: an answer for the old text must never be drawn (review)
  q.addEventListener('input', () => { if (!open) return; open.seq = ++seq; open.kb = -1; clearTimeout(open.timer); open.timer = setTimeout(() => { void search(); }, 350); });
  el.querySelector('.fb-x')?.addEventListener('click', () => { closeStopSearch(); focusGrid(); });
  // Hovering a platform marks it, as the arrows do (user 2026-10-30)
  el.addEventListener('mouseover', (e) => {
    const row = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.ss-quay'));
    if (!row || !open) return;
    const i = quayRows().indexOf(row);
    if (i !== open.kb) { open.kb = i; markKb(); }
  });
  el.addEventListener('mousedown', (e) => {
    const row = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.ss-quay'));
    if (!row || !open) return;
    e.preventDefault();
    open.kb = quayRows().indexOf(row);
    pick();
  });
  document.addEventListener('mousedown', onOutside, true);
  open.timer = setTimeout(() => { void search(); }, 350);
}

/** @param {KeyboardEvent} e */
function onKey(e) {
  e.stopPropagation(); // the grid and the shell never see typing in the window
  if (!open) return;
  if (e.key === 'Escape') { e.preventDefault(); closeStopSearch(); focusGrid(); return; }
  const rows = quayRows();
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && rows.length) {
    e.preventDefault();
    open.kb = e.key === 'ArrowDown' ? Math.min(rows.length - 1, open.kb + 1) : Math.max(0, open.kb - 1);
    markKb();
    return;
  }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (open.kb >= 0 && rows[open.kb]) pick();
  else void search();
}

const quayRows = () => /** @type {HTMLElement[]} */ ([...(open?.el.querySelectorAll('.ss-quay') ?? [])]);

/** Mark the keyboard's Quay; the map (if open) shows its stop place. */
function markKb() {
  if (!open) return;
  const rows = quayRows();
  rows.forEach((r, i) => r.classList.toggle('kb', i === open?.kb));
  const row = rows[open.kb];
  row?.scrollIntoView?.({ block: 'nearest' });
  const branch = open.branches.find((b) => b.quays?.some((q) => q.quayId === row?.dataset.quay));
  const quay = branch?.quays?.find((q) => q.quayId === row?.dataset.quay);
  if (branch?.place && quay) showPlaceOnMap(branch.place, quayInfoOf(branch.place, quay));
}

/** The marked Quay goes on the row; the window closes. */
function pick() {
  if (!open) return;
  const row = quayRows()[open.kb];
  const id = row?.dataset.quay;
  const ri = open.ri;
  if (!id) return;
  if (row.classList.contains('ss-direct')) { closeStopSearch(); useQuayId(ri, id); focusGrid(); return; }
  for (const b of open.branches) {
    const quay = b.place && b.quays?.find((q) => q.quayId === id);
    if (b.place && quay) { const info = quayInfoOf(b.place, quay); closeStopSearch(); useQuay(ri, info, 'use'); focusGrid(); return; }
  }
}

/** @param {string} text */
function setStatus(text) {
  const s = open?.el.querySelector('.ss-status');
  if (s) s.textContent = text;
}

/** Search by name, or look up a pasted Quay or stop place ID. */
async function search() {
  if (!open) return;
  clearTimeout(open.timer);
  const text = /** @type {HTMLInputElement} */ (open.el.querySelector('.ss-q')).value.trim();
  const my = ++seq;
  open.seq = my;
  const current = () => !!open && open.seq === my;
  open.branches = []; open.direct = null; open.kb = -1;
  if (!text) { setStatus(''); draw(); return; }
  const svc = pickerServices();
  setStatus(t('wsSearching'));
  try {
    if (NSR_QUAY_PATTERN.test(text)) {
      let info;
      try { info = (await svc.lookupQuays([text], pickerOpts('nsr'))).get(text) ?? null; } catch { info = undefined; }
      if (!current() || !open) return;
      if (info && !modeOk(info.mode)) { setStatus(t('wsOtherMode')); draw(); return; }
      if (info) {
        open.branches = [{ place: { id: info.stopPlaceId, name: info.stopPlaceName, description: '', mode: info.mode,
          quays: [{ quayId: info.quayId, publicCode: info.publicCode, privateCode: info.privateCode ?? '', description: '', lat: info.lat, lon: info.lon }] },
        quays: null }];
        /** @type {Branch} */ (open.branches[0]).quays = /** @type {StopPlace} */ (open.branches[0].place).quays;
      } else open.direct = text; // NSR does not know it (or did not answer): use the ID anyway
      setStatus(''); draw(); return;
    }
    if (NSR_STOP_PLACE_PATTERN.test(text)) {
      const place = await svc.getStopPlace(text, pickerOpts('nsr'));
      if (!current() || !open) return;
      if (!place) { setStatus(t('wsNotFound', text)); draw(); return; }
      if (!modeOk(place.mode)) { setStatus(t('wsOtherMode')); draw(); return; }
      open.branches = [{ place, quays: place.quays }];
      setStatus(place.quays.length ? '' : t('wsNoQuays')); draw(); return;
    }
    const ernMode = lineErnMode();
    const all = await svc.search(text, pickerOpts('geocoder'));
    if (!current() || !open) return;
    const hits = all.filter((h) => !ernMode || !h.modes.length || h.modes.some((m) => modeMatches(ernMode, m))).slice(0, TOP);
    /** @type {Map<string, StopPlace>} */
    let places = new Map();
    let failed = false;
    try { places = new Map((await svc.getStopPlaces(hits.map((h) => h.id), pickerOpts('nsr'))).map((p) => [p.id, p])); } catch { failed = true; }
    if (!current() || !open) return;
    open.branches = hits.flatMap((h) => {
      const place = places.get(h.id);
      if (place && !modeOk(place.mode)) return [];
      return [{ place: place ?? { id: h.id, name: h.name, description: [h.description, h.context].filter(Boolean).join(', '), mode: h.modes[0] ?? '', quays: [] },
        quays: failed ? null : place?.quays ?? [] }];
    });
    setStatus(open.branches.length ? '' : t('wsNoResults'));
    draw();
  } catch (e) {
    if (current()) { setStatus(t('wsFailed', /** @type {Error} */ (e).message)); draw(); }
  }
}

/** The tree: stop places as headings, their Quays under them with the grid's platform and private code chips. */
function draw() {
  if (!open) return;
  const tree = /** @type {HTMLElement} */ (open.el.querySelector('.ss-tree'));
  const parts = [];
  if (open.direct) {
    parts.push(`<div class="ss-quay ss-direct" data-quay="${esc(open.direct)}"><span class="ss-line">└</span>${esc(t('spUseIdAnyway', open.direct))}</div>`);
  }
  for (const b of open.branches) {
    const p = /** @type {StopPlace} */ (b.place);
    parts.push(`<div class="ss-place"><span class="ss-mode">${modeIconSvg(p.mode, '')}</span><b>${esc(p.name)}</b><small>${esc(p.description)}</small></div>`);
    if (!b.quays || !b.quays.length) { parts.push(`<div class="ss-none">${esc(t(b.quays ? 'wsNoQuays' : 'ssNoPlatforms'))}</div>`); continue; }
    b.quays.forEach((q, i) => {
      const last = i === /** @type {any[]} */ (b.quays).length - 1;
      parts.push(`<div class="ss-quay" data-quay="${esc(q.quayId)}"><span class="ss-line">${last ? '└' : '├'}</span>`
        + `${q.publicCode ? `<span class="g-plat">${esc(q.publicCode)}</span>` : ''}${q.privateCode ? `<span class="g-priv">${esc(q.privateCode)}</span>` : ''}`
        + `${q.publicCode || q.privateCode ? '' : '<span class="ss-nocode"></span>'}`
        + `<span class="ss-desc">${esc(q.description)}</span><code>${esc(q.quayId)}</code></div>`);
    });
  }
  tree.innerHTML = parts.join('');
  place();
  markKb();
}

/** Under the stop cell, or above it when the window would run off the bottom; always inside the page. */
function place() {
  if (!open) return;
  const cell = document.querySelector(`.g-td-name[data-ri="${open.ri}"]`)?.getBoundingClientRect();
  const w = open.el.offsetWidth || 380, h = open.el.offsetHeight || 200;
  const below = (cell?.bottom ?? 160) + 2, above = (cell?.top ?? 160) - h - 2;
  const top = below + h <= window.innerHeight - 8 || above < 8 ? below : above;
  open.el.style.left = `${Math.max(8, Math.min(cell?.left ?? 200, window.innerWidth - w - 8))}px`;
  open.el.style.top = `${Math.max(8, Math.min(top, window.innerHeight - h - 8))}px`;
}
