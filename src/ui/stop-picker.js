// Stop picking in the map pane (stop picking spec): the pane follows the selected stop cell; the
// user searches by name or ID (or browses the map), a Quay becomes the candidate, and only Bruk
// (or Enter) puts it into that row. Services and the map are injectable for tests.
import { app } from './state.js';
import { $, openPanel, onRefresh } from './shell.js';
import { t, getLang } from '../i18n/strings.js';
import { searchStopPlaces, nearbyStopPlaces } from '../services/geocoder.js';
import { getStopPlace, getStopPlaces, lookupQuays } from '../services/nsr.js';
import { NSR_QUAY_PATTERN, NSR_STOP_PLACE_PATTERN, modeMatches } from '../core/quays.js';
import { ERN_MODES } from '../core/ern/modes.js';
import { grid, selectedStopRow, setStopOnRow, clearStopOnRow, focusGrid, setStopTypeHandler, onGridRender, appendStopRow, removeStopRow } from './grid.js';
import { quayInfo } from './quays.js';

/**
 * @typedef {import('../services/nsr.js').QuayInfo} QuayInfo
 * @typedef {import('../services/nsr.js').StopPlace} StopPlace
 * @typedef {import('../services/geocoder.js').StopPlaceHit} StopPlaceHit
 * @typedef {{ row: number | null, current: QuayInfo | null, candidate: QuayInfo | null, hits: StopPlaceHit[],
 *             place: StopPlace | null, direct: { quayId: string, info: QuayInfo | null | undefined } | null,
 *             browse: StopPlaceHit[], browseQuays: StopPlace[], onlyMode: boolean, ernMode: number, recording: boolean }} PickerState
 * @typedef {{ show(state: PickerState): void, onPick(fn: (kind: 'place' | 'quay', id: string) => void): void,
 *             view(): { lat: number, lon: number, radiusKm: number, zoom: number } | null,
 *             onViewChange(fn: () => void): void, zoomTo(lat: number, lon: number, zoom: number): void }} PickerMap
 */

let services = { search: searchStopPlaces, getStopPlace, lookupQuays, nearby: nearbyStopPlaces, getStopPlaces };
/** Replace the Entur adapters (tests). @param {Partial<typeof services>} s */
export function setPickerServices(s) {
  services = { ...services, ...s };
}

/** @type {PickerMap | null} */
let map = null;
/** @param {PickerMap | null} m */
export function setPickerMap(m) {
  map = m;
  m?.onPick((kind, id) => { if (kind === 'place') { if (!state.recording) void openPlace(id); } else pickQuay(id); });
  m?.onViewChange(() => onViewChange());
}

/** @type {(() => void)[]} */
const viewListeners = [];
/** Task 3 hooks browsing in here. @param {() => void} fn */
export function onPickerViewChange(fn) {
  viewListeners.push(fn);
}
function onViewChange() {
  for (const fn of viewListeners) fn();
  // Browsing (spec §4): once the view has settled, not on every move event.
  clearTimeout(browseTimer);
  browseTimer = setTimeout(() => { void browse(); }, 400);
}

/** @type {Map<string, StopPlaceHit[]>} nearby answers per view, for this session */
const browseCache = new Map();
/** @type {Map<string, StopPlace | null>} stop places with their Quays, for this session */
const quayCache = new Map();
/** @type {any} */
let browseTimer = null;
let browseSeq = 0;

/** The stop places in view from street level (zoom ≥ 15), and their Quays from zoom 17 (16 while recording). */
async function browse() {
  const v = map?.view() ?? null;
  const my = ++browseSeq;
  if ((state.row == null && !state.recording) || !v || v.zoom < 15) {
    if (state.browse.length || state.browseQuays.length) { state.browse = []; state.browseQuays = []; render(); }
    return;
  }
  const key = `${v.lat.toFixed(3)},${v.lon.toFixed(3)},${v.radiusKm.toFixed(2)}`;
  let hits = browseCache.get(key);
  if (!hits) {
    try { hits = await services.nearby({ lat: v.lat, lon: v.lon, radiusKm: v.radiusKm }, opts('geocoder')); } catch { return; }
    browseCache.set(key, hits);
  }
  if (my !== browseSeq) return;
  state.browse = hits;
  if (v.zoom >= (state.recording ? 16 : 17)) {
    const missing = hits.map((h) => h.id).filter((id) => !quayCache.has(id));
    if (missing.length) {
      try { for (const p of await services.getStopPlaces(missing, opts('nsr'))) quayCache.set(p.id, p); } catch { /* shown without Quays */ }
      for (const id of missing) if (!quayCache.has(id)) quayCache.set(id, null);
    }
    if (my !== browseSeq) return;
    state.browseQuays = /** @type {StopPlace[]} */ (hits.map((h) => quayCache.get(h.id)).filter(Boolean));
  } else state.browseQuays = [];
  render();
}

/** @type {PickerState} */
const state = { row: null, current: null, candidate: null, hits: [], place: null, direct: null, browse: [], browseQuays: [], onlyMode: true, ernMode: 0, recording: false };
export const pickerState = () => state;
let seq = 0;
/** @type {any} */
let timer = null;

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const opts = (/** @type {'geocoder' | 'nsr'} */ which) => ({
  baseUrl: which === 'geocoder' ? app.settings.geocoderUrl : app.settings.stopPlacesUrl,
  clientName: app.settings.clientName || 'nepos-online',
});
const modeName = (/** @type {number} */ ernMode) => {
  const m = /** @type {any} */ (ERN_MODES)[ernMode];
  return m ? String(m[getLang()] ?? m.en).toLowerCase() : '';
};
/** @param {string} id */
const known = (id) => quayInfo.get(id) ?? null;

/** @param {string} text */
function setStatus(text) {
  $('sp-status').textContent = text;
}

/** A new row (or none): forget the search for the old one; late answers are ignored. */
function followRow() {
  const row = grid.active && !grid.readOnly ? selectedStopRow() : null;
  if (row === state.row) { render(); return; }
  state.row = row;
  if (row != null) openPanel('right'); // picking a stop happens in the map pane
  seq++;
  clearTimeout(timer);
  state.hits = []; state.place = null; state.direct = null; state.candidate = null;
  if ($('sp-q')) $('sp-q').value = '';
  setStatus('');
  render();
}

/** Typing in a selected stop cell: the text goes to the search box (spec §2). @param {string} text */
export function pickerType(text) {
  openPanel('right');
  followRow();
  const q = /** @type {HTMLInputElement} */ ($('sp-q'));
  q.value = text;
  q.focus();
  q.setSelectionRange(text.length, text.length);
  schedule();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => { void search(); }, 350);
}

/** Search by name, or look up a pasted ID. */
async function search() {
  clearTimeout(timer);
  const text = /** @type {HTMLInputElement} */ ($('sp-q')).value.trim();
  const my = ++seq;
  const current = () => my === seq;
  state.hits = []; state.place = null; state.direct = null; state.candidate = null;
  if (!text) { setStatus(''); render(); return; }
  try {
    if (NSR_QUAY_PATTERN.test(text)) {
      state.direct = { quayId: text, info: undefined };
      render();
      let info;
      try { info = (await services.lookupQuays([text], opts('nsr'))).get(text) ?? null; } catch { info = undefined; }
      if (!current() || !state.direct) return;
      state.direct.info = info;
      if (info) state.candidate = info;
      render();
      return;
    }
    setStatus(t('wsSearching'));
    if (NSR_STOP_PLACE_PATTERN.test(text)) {
      const place = await services.getStopPlace(text, opts('nsr'));
      if (!current()) return;
      if (!place) { setStatus(t('wsNotFound', text)); render(); return; }
      setStatus('');
      showPlace(place);
      return;
    }
    const hits = await services.search(text, opts('geocoder'));
    if (!current()) return;
    state.hits = hits;
    setStatus(hits.length ? '' : t('wsNoResults'));
    render();
  } catch (e) {
    if (current()) setStatus(t('wsFailed', /** @type {Error} */ (e).message));
  }
}

/** @param {StopPlace} place @param {any} quay @returns {QuayInfo} */
const quayInfoOf = (place, quay) => ({ quayId: quay.quayId, publicCode: quay.publicCode, stopPlaceId: place.id, stopPlaceName: place.name, mode: place.mode, lat: quay.lat, lon: quay.lon });

/** A stop place with one Quay: that Quay is the candidate; with several: list them. @param {StopPlace} place */
function showPlace(place) {
  state.place = place;
  state.candidate = place.quays.length === 1 ? quayInfoOf(place, place.quays[0]) : null;
  if (!place.quays.length) setStatus(t('wsNoQuays'));
  render();
}

/** @param {string} id */
async function openPlace(id) {
  clearTimeout(timer);
  const my = ++seq;
  const place = state.browseQuays.find((p) => p.id === id) ?? await services.getStopPlace(id, opts('nsr')).catch(() => null);
  if (my !== seq) return;
  if (!place) { setStatus(t('wsNotFound', id)); return; }
  setStatus('');
  showPlace(place);
}

// ─── Recording stops (user test 2026-10-16) ─────────────────────────────────
// "Registrer stopp": every Quay clicked on the map goes into the next empty stop row, or a new row
// at the bottom. No Bruk. Ctrl+Z takes back the last one recorded in this run; Esc or the button
// ends it. The map never moves by itself while recording.

/** @type {{ stop: any, appended: boolean }[]} what this run recorded, newest last */
let recorded = [];

/** @param {boolean} on */
export function setRecording(on) {
  if (on && (!grid.active || grid.readOnly)) return;
  state.recording = on;
  recorded = [];
  if (on) openPanel('right');
  render();
  onViewChange(); // browse with the recording rules (no row needed, Quays from zoom 16)
}

/** The first stop row with nothing in it (no stop, no name, no times), or -1. */
function emptyRow() {
  return grid.stops.findIndex((s, i) => !s.stopId && !String(s.name ?? '').trim() && !s.isDwellArr && grid.cols.every((c) => c.cells[i] == null));
}

/** @param {string} quayId */
function recordQuay(quayId) {
  for (const place of [state.place, ...state.browseQuays]) {
    const quay = place?.quays.find((q) => q.quayId === quayId);
    if (!place || !quay) continue;
    if (state.onlyMode && state.ernMode && place.mode && !modeMatches(state.ernMode, place.mode)) return; // the mode filter applies
    let ri = emptyRow();
    const appended = ri < 0;
    if (appended) ri = appendStopRow();
    const info = quayInfoOf(place, quay);
    setStopOnRow(ri, { quayId: info.quayId, name: info.stopPlaceName, info });
    recorded.push({ stop: grid.stops[ri], appended });
    /** @type {any} */ (document.querySelector(`.g-td-name[data-ri="${ri}"]`))?.scrollIntoView?.({ block: 'nearest' });
    render();
    return;
  }
}

/** Ctrl+Z while recording: take back the last recorded stop (rows changed since are skipped). */
function undoRecorded() {
  while (recorded.length) {
    const last = /** @type {{ stop: any, appended: boolean }} */ (recorded.pop());
    const ri = grid.stops.indexOf(last.stop);
    if (ri < 0) continue;
    if (last.appended) removeStopRow(ri);
    else { clearStopOnRow(ri); last.stop.name = ''; }
    render();
    return;
  }
}

/** A Quay clicked on the map or in the list becomes the candidate. @param {string} quayId */
function pickQuay(quayId) {
  if (state.recording) { recordQuay(quayId); return; }
  for (const place of [state.place, ...state.browseQuays]) {
    const quay = place?.quays.find((q) => q.quayId === quayId);
    if (place && quay) { state.candidate = quayInfoOf(place, quay); render(); return; }
  }
}

/** Bruk: the candidate goes into the row. */
function apply() {
  if (state.row == null || !state.candidate) return;
  const c = state.candidate;
  setStopOnRow(state.row, { quayId: c.quayId, name: c.stopPlaceName, info: c });
  done();
}

/** "Bruk ID-en likevel": a Quay ID NSR does not know (or did not answer for). */
function applyDirect() {
  if (state.row == null || !state.direct) return;
  const d = state.direct;
  setStopOnRow(state.row, { quayId: d.quayId, name: d.info?.stopPlaceName ?? '', info: d.info });
  done();
}

function done() {
  state.hits = []; state.place = null; state.direct = null; state.candidate = null;
  $('sp-q').value = '';
  setStatus('');
  focusGrid();
  render();
}

/** @param {string} html @param {() => void} onClick @param {string} [cls] */
function row(html, onClick, cls = 'sp-row') {
  const div = document.createElement('div');
  div.className = cls;
  div.innerHTML = html;
  div.addEventListener('click', onClick);
  return div;
}

function render() {
  const pane = $('sp');
  if (!pane) return;
  const rec = $('map-rec');
  if (rec) {
    if (state.recording && (!grid.active || grid.readOnly)) { state.recording = false; recorded = []; }
    rec.classList.toggle('on', state.recording);
    rec.textContent = t(state.recording ? 'mapRecording' : 'mapRecord');
    /** @type {HTMLButtonElement} */ (rec).disabled = !grid.active || grid.readOnly;
    $('map-rec-hint').hidden = !state.recording;
  }
  const active = state.row != null && grid.stops[state.row];
  pane.hidden = !active;
  state.ernMode = app.routeState?.transportMode ?? 0;
  state.onlyMode = /** @type {HTMLInputElement} */ ($('sp-only-mode')).checked;
  if (!active) { state.current = null; map?.show(state); return; }

  const stop = grid.stops[/** @type {number} */ (state.row)];
  state.current = stop.stopId ? known(String(stop.stopId)) : null;
  const label = state.current ? `${state.current.stopPlaceName} · ${state.current.publicCode}`.replace(/ · $/, '')
    : stop.stopId ? `${stop.name || stop.stopId} (${stop.stopId})` : t('spNoStop');
  $('sp-head').textContent = t('spRow', /** @type {number} */ (state.row) + 1, label);
  const mode = modeName(state.ernMode);
  $('sp-only-mode-label').textContent = t('wsOnlyMode', mode);
  /** @type {HTMLElement} */ ($('sp-only-mode').parentElement).hidden = !mode;
  $('sp-q').placeholder = t('wsPlaceholder');
  $('sp-clear').disabled = !stop.stopId;

  const list = $('sp-list');
  list.innerHTML = '';
  if (state.direct && !state.direct.info) {
    const note = state.direct.info === null ? t('wsNotSeen') : t('wsUnchecked');
    list.appendChild(row(`${esc(t('spUseIdAnyway', state.direct.quayId))}<small>${esc(note)}</small>`, applyDirect));
  } else if (state.place) {
    const place = state.place;
    if (state.hits.length) list.appendChild(row(esc(t('wsBack')), () => { state.place = null; state.candidate = null; render(); }, 'sp-row sp-back'));
    const otherMode = place.mode && !modeMatches(state.ernMode, place.mode);
    const head = document.createElement('div');
    head.className = 'sp-place';
    head.innerHTML = `${esc(place.name)}<small>${esc(place.description)}${otherMode ? ` · <span class="n2-ws-warn">${esc(t('wsOtherMode'))}</span>` : ''}</small>`;
    list.appendChild(head);
    for (const quay of place.quays) {
      const r = row(`${esc(t('wsQuay', quay.publicCode))}<small>${esc(quay.quayId)}${quay.description ? ` · ${esc(quay.description)}` : ''}</small>`,
        () => { state.candidate = quayInfoOf(place, quay); render(); });
      if (state.candidate?.quayId === quay.quayId) r.classList.add('on');
      list.appendChild(r);
    }
  } else {
    const shown = state.onlyMode && mode ? state.hits.filter((h) => !h.modes.length || h.modes.some((m) => modeMatches(state.ernMode, m))) : state.hits;
    const hidden = state.hits.length - shown.length;
    if (hidden && !$('sp-status').textContent) setStatus(t('wsHidden', hidden));
    for (const h of shown) {
      const detail = [h.description, h.context, h.modes.join(', ')].filter(Boolean).join(' · ');
      list.appendChild(row(`${esc(h.name)}<small>${esc(detail)}</small>`, () => { void openPlace(h.id); }));
    }
  }

  const card = $('sp-card');
  const c = state.candidate;
  card.hidden = !c;
  if (c) {
    card.innerHTML = `<div class="sp-card-name">${esc(c.stopPlaceName)} <b>${esc(c.publicCode)}</b></div>
      <small>${esc(c.quayId)}${c.mode ? ` · ${esc(c.mode)}` : ''}</small>
      <button class="pop-btn primary" id="sp-use">${esc(t('spUse'))}</button>`;
    $('sp-use').addEventListener('click', apply);
  }
  map?.show(state);
}

export function initStopPicker() {
  state.row = null;
  seq++;
  setStopTypeHandler(pickerType);
  const q = /** @type {HTMLInputElement} */ ($('sp-q'));
  q.addEventListener('keydown', (e) => {
    e.stopPropagation(); // the grid and the shell must not see typing in the search box
    if (e.key === 'Escape') { e.preventDefault(); focusGrid(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (state.candidate) apply();
    else if (state.direct && q.value.trim() === state.direct.quayId && state.direct.info !== undefined) applyDirect();
    else void search();
  });
  q.addEventListener('input', () => {
    // New text: the old candidate must never be applied by an Enter before the search answers.
    if (state.candidate || state.direct) { state.candidate = null; state.direct = null; render(); }
    schedule();
  });
  $('sp-only-mode').addEventListener('change', render);
  $('map-rec').addEventListener('click', () => setRecording(!state.recording));
  state.recording = false;
  recorded = [];
  $('sp-clear').addEventListener('click', () => { if (state.row != null) { clearStopOnRow(state.row); render(); } });
  onGridRender(followRow);
  onRefresh(followRow);
  if (!keysWired) {
    keysWired = true;
    // Recording: Ctrl+Z takes back the last stop, Esc ends it. Text fields keep their own keys.
    document.addEventListener('keydown', (e) => {
      if (!state.recording || document.querySelector('dialog[open]')) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRecording(false); }
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); undoRecorded(); }
    }, true);
    // Capture phase: before the grid, which would otherwise start editing the row's name.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !state.candidate || state.row == null || $('sp')?.hidden) return;
      const el = document.activeElement;
      if (el === $('sp-q') || document.querySelector('dialog[open]')) return; // the box handles its own Enter
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      e.preventDefault();
      e.stopPropagation();
      apply();
    }, true);
  }
}

let keysWired = false;
