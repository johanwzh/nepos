// Stop picking (stop picking spec; stop picking 2, 2.5): typing in a stop cell opens the search window at the cell
// (stop-search.js); the map pane follows the selected stop cell and a click on a Quay picks it at once — click: on
// the row, Shift+click: a new row below, Alt+Shift+click: a new row above; right-click: a menu. The changed stop cell
// flashes. Map picking only works while a stop cell is selected. Services and the map are injectable for tests.
import { app } from './state.js';
import { $, openPanel, onRefresh } from './shell.js';
import { t } from '../i18n/strings.js';
import { searchStopPlaces, nearbyStopPlaces } from '../services/geocoder.js';
import { getStopPlace, getStopPlaces, lookupQuays } from '../services/nsr.js';
import { modeMatches } from '../core/quays.js';
import { grid, selectedStopRow, selectedRowIndex, setStopOnRow, clearStopOnRow, setStopTypeHandler, onGridRender, appendStopRow, removeStopRow, addStopRowAt, flashStopCell } from './grid.js';
import { quayInfo } from './quays.js';
import { openStopSearch, closeStopSearch } from './stop-search.js';
import { onToolChange, setTool } from './power-tools.js';

/**
 * @typedef {import('../services/nsr.js').QuayInfo} QuayInfo
 * @typedef {import('../services/nsr.js').StopPlace} StopPlace
 * @typedef {import('../services/geocoder.js').StopPlaceHit} StopPlaceHit
 * @typedef {{ row: number | null, current: QuayInfo | null, candidate: QuayInfo | null, hits: StopPlaceHit[],
 *             place: StopPlace | null, browse: StopPlaceHit[], browseQuays: StopPlace[], onlyMode: boolean, ernMode: number, recording: boolean }} PickerState
 *   candidate: the Quay marked in the search window (its pin is marked); hits stay empty since 2.5
 * @typedef {'use' | 'above' | 'below'} QuayAction
 * @typedef {{ show(state: PickerState): void, onPick(fn: (kind: 'place' | 'quay', id: string, action?: QuayAction) => void): void,
 *             view(): { lat: number, lon: number, radiusKm: number, zoom: number } | null,
 *             onViewChange(fn: () => void): void, zoomTo(lat: number, lon: number, zoom: number): void }} PickerMap
 */

let services = { search: searchStopPlaces, getStopPlace, lookupQuays, nearby: nearbyStopPlaces, getStopPlaces };
/** Replace the Entur adapters (tests). @param {Partial<typeof services>} s */
export function setPickerServices(s) {
  services = { ...services, ...s };
}
/** The Entur adapters (the search window uses them too). */
export const pickerServices = () => services;

/** @type {PickerMap | null} */
let map = null;
/** @param {PickerMap | null} m */
export function setPickerMap(m) {
  map = m;
  m?.onPick((kind, id, action) => {
    if (kind === 'place') { if (!state.recording) void openPlace(id); }
    else if (state.recording) recordQuay(id);
    else actOnQuay(id, action ?? 'use');
  });
  m?.onViewChange(() => onViewChange());
}

/** @type {(() => void)[]} */
const viewListeners = [];
/** @param {() => void} fn */
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

/** The stop places in view from street level (zoom ≥ 15), and their Quays from zoom 16 (15 while recording; 2.5). */
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
    try { hits = await services.nearby({ lat: v.lat, lon: v.lon, radiusKm: v.radiusKm }, pickerOpts('geocoder')); } catch { return; }
    browseCache.set(key, hits);
  }
  if (my !== browseSeq) return;
  state.browse = hits;
  if (v.zoom >= (state.recording ? 15 : 16)) {
    const missing = hits.map((h) => h.id).filter((id) => !quayCache.has(id));
    if (missing.length) {
      try { for (const p of await services.getStopPlaces(missing, pickerOpts('nsr'))) quayCache.set(p.id, p); } catch { /* shown without Quays */ }
      for (const id of missing) if (!quayCache.has(id)) quayCache.set(id, null);
    }
    if (my !== browseSeq) return;
    state.browseQuays = /** @type {StopPlace[]} */ (hits.map((h) => quayCache.get(h.id)).filter(Boolean));
  } else state.browseQuays = [];
  render();
}

/** @type {PickerState} */
const state = { row: null, current: null, candidate: null, hits: [], place: null, browse: [], browseQuays: [], onlyMode: true, ernMode: 0, recording: false };
export const pickerState = () => state;
let seq = 0;

export const pickerOpts = (/** @type {'geocoder' | 'nsr'} */ which) => ({
  baseUrl: which === 'geocoder' ? app.settings.geocoderUrl : app.settings.stopPlacesUrl,
  clientName: app.settings.clientName || 'nepos-online',
});
/** The open line's ERN mode (0: none). */
export const lineErnMode = () => app.routeState?.transportMode ?? 0;
/** @param {string} id */
const known = (id) => quayInfo.get(id) ?? null;

/** A new row (or none): the map shows that row's stop; an open stop place is forgotten. */
function followRow() {
  const row = grid.active && !grid.readOnly ? selectedStopRow() : null;
  if (row === state.row) { render(); return; }
  state.row = row;
  if (keepView) { render(); return; }
  seq++;
  state.place = null;
  render();
}

/** @param {StopPlace} place @param {any} quay @returns {QuayInfo} */
export const quayInfoOf = (place, quay) => ({ quayId: quay.quayId, publicCode: quay.publicCode, privateCode: quay.privateCode ?? '', stopPlaceId: place.id, stopPlaceName: place.name, mode: place.mode, lat: quay.lat, lon: quay.lon });

/**
 * The search window's marked Quay: the map (if open) shows its stop place, with that Quay's pin marked; (null, null)
 * when the window closes. @param {StopPlace | null} place @param {QuayInfo | null} quay
 */
export function showPlaceOnMap(place, quay) {
  if (place) state.place = place;
  state.candidate = /** @type {any} */ (quay);
  render();
}

/** A stop place marker clicked on the map: its Quays. @param {string} id */
async function openPlace(id) {
  const my = ++seq;
  const place = state.browseQuays.find((p) => p.id === id) ?? await services.getStopPlace(id, pickerOpts('nsr')).catch(() => null);
  if (my !== seq || !place) return;
  state.place = place;
  render();
}

// ─── Recording stops (user test 2026-10-16) ─────────────────────────────────
// "Registrer stopp" (a power tool since 2.5): every Quay clicked on the map goes into the next empty stop row, or a
// new row at the bottom. Ctrl+Z takes back the last one recorded in this run; Esc or the tool's button ends it. The
// map never moves by itself while recording.

/** @type {{ stop: any, appended: boolean }[]} what this run recorded, newest last */
let recorded = [];

/** @param {boolean} on */
export function setRecording(on) {
  if (on && (!grid.active || grid.readOnly)) { setTool(''); return; } // the tool must not stay on where it cannot work
  state.recording = on;
  recorded = [];
  if (on) openPanel('right');
  render();
  onViewChange(); // browse with the recording rules (no row needed, Quays from zoom 15)
}

/** The first stop row with nothing in it (no stop, no name, no times), or -1. */
function emptyRow() {
  return grid.stops.findIndex((s, i) => !s.stopId && !String(s.name ?? '').trim() && !s.isDwellArr && grid.cols.every((c) => c.cells[i] == null));
}

/** @param {string} quayId */
function recordQuay(quayId) {
  const info = findQuay(quayId);
  if (!info) return;
  let ri = emptyRow();
  const appended = ri < 0;
  if (appended) ri = appendStopRow();
  setStopOnRow(ri, { quayId: info.quayId, name: info.stopPlaceName, info });
  recorded.push({ stop: grid.stops[ri], appended });
  /** @type {any} */ (document.querySelector(`.g-td-name[data-ri="${ri}"]`))?.scrollIntoView?.({ block: 'nearest' });
  flashStopCell(ri);
  render();
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

/** Is a stop place of this mode allowed on the line? (Never another mode than the line's.) @param {string} mode */
export const modeOk = (mode) => !lineErnMode() || !mode || modeMatches(lineErnMode(), mode);

/** The Quay (with its stop place) among those shown on the map, or null (also for another mode). @param {string} quayId */
function findQuay(quayId) {
  for (const place of [state.place, ...state.browseQuays]) {
    const quay = place?.quays.find((q) => q.quayId === quayId);
    if (place && quay) return modeOk(place.mode) ? quayInfoOf(place, quay) : null;
  }
  return null;
}

/** A Quay clicked on the map, while a stop cell is selected. @param {string} quayId @param {QuayAction} action */
function actOnQuay(quayId, action) {
  const info = findQuay(quayId);
  if (state.row == null || !info) return;
  useQuay(state.row, info, action);
}

let keepView = false;

/**
 * Put a Quay on a stop row (use), or on a new row above or below it. A new row goes beside a whole dwell stop (never
 * between its two rows) and becomes the selected row; a dwell stop gets the Quay on both rows. The cell flashes: a
 * click in one place changed another (2.5).
 * @param {number} ri @param {QuayInfo} info @param {QuayAction} action
 */
export function useQuay(ri, info, action) {
  if (grid.readOnly || !grid.stops[ri] || !modeOk(info.mode)) return;
  if (action !== 'use') {
    const top = grid.stops[ri - 1]?.isDwellArr ? ri - 1 : ri;
    const bottom = grid.stops[ri]?.isDwellArr ? ri + 1 : ri;
    ri = action === 'above' ? top : bottom + 1;
    keepView = true; // the new row becomes the selected one; the open stop place stays on the map
    addStopRowAt(ri);
    keepView = false;
  }
  setStopOnRow(ri, { quayId: info.quayId, name: info.stopPlaceName, info });
  flashStopCell(ri);
  render();
}

/** A pasted Quay ID NSR does not know (or did not answer for): used anyway. @param {number} ri @param {string} quayId */
export function useQuayId(ri, quayId) {
  if (grid.readOnly || !grid.stops[ri]) return;
  setStopOnRow(ri, { quayId, name: '', info: null });
  flashStopCell(ri);
  render();
}

function render() {
  if (state.recording && (!grid.active || grid.readOnly)) { state.recording = false; recorded = []; setTool(''); }
  state.ernMode = lineErnMode();
  state.onlyMode = true; // never a stop of another mode than the line's (user test 2026-10-16)
  // Tøm stopp works on the selected row in any column
  const sel = selectedRowIndex();
  const clear = /** @type {HTMLButtonElement | null} */ ($('sp-clear'));
  if (clear) clear.disabled = sel == null || !grid.stops[sel]?.stopId || grid.readOnly;
  const stop = state.row != null ? grid.stops[state.row] : null;
  state.current = stop?.stopId ? known(String(stop.stopId)) : null;
  map?.show(state);
}

export function initStopPicker() {
  state.row = null;
  seq++;
  // Typing in a stop cell: the search window at the cell (never the map pane)
  setStopTypeHandler((text) => { const ri = selectedStopRow(); if (ri != null) openStopSearch(ri, text); });
  state.recording = false;
  recorded = [];
  $('sp-clear')?.addEventListener('click', () => { const ri = selectedRowIndex(); if (ri != null) { clearStopOnRow(ri); render(); } });
  onGridRender(followRow);
  onRefresh(followRow);
  if (!keysWired) {
    keysWired = true;
    // Registrer stopp follows its power tool; turning it on closes the search window (Esc ends it: the toolbox)
    onToolChange((name) => {
      if (name === 'record') closeStopSearch();
      if ((name === 'record') !== state.recording) setRecording(name === 'record');
    });
    // Recording: Ctrl+Z takes back the last stop. Text fields keep their own keys.
    document.addEventListener('keydown', (e) => {
      if (!state.recording || document.querySelector('dialog[open]')) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); undoRecorded(); }
    }, true);
  }
}

let keysWired = false;
