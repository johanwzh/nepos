// The map panel (F6, spec §7.3): the selected trip's stops on a MapLibre map (2.3: OpenFreeMap vector tiles,
// Positron in light mode and Dark in dark mode). Positions come from the NSR lookups; stops without one are listed
// under the map. Created only when the panel is first opened.
import { app } from './state.js';
import { $, onRefresh, currentPage, panelOpen, onPanelToggle } from './shell.js';
import { t } from '../i18n/strings.js';
import { grid, selectedColumn, selectedRowIndex, onGridRender } from './grid.js';
import { quayInfo, onQuaysLoaded } from './quays.js';
import { tripOnMap } from '../core/map-model.js';
import { styleUrlFor } from '../core/map-style.js';
import { pickerState, setPickerMap } from './stop-picker.js';
import { pickerMapModel } from '../core/picker-map-model.js';
import { modeIconSvg } from './mode-icons.js';
import { placeMenu } from './place-menu.js';
import { createMapView } from './map-view.js';
import { linkFeatures, onLinksChanged, blockLink, routeAgain, linesUsing, linkFor, linkBudgetLeft } from './link-router.js';

/** @type {import('./map-view.js').MapView | null} */ let view = null;
let styleKey = '';
let lastKey = '';
let scheduled = false;
/** @type {((view: import('./map-view.js').MapView) => void)[]} */
const readyListeners = [];
/** @type {(() => void)[]} */
const drawListeners = [];

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function theme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function ensureMap() {
  const style = styleUrlFor(app.settings, theme());
  const key = `${JSON.stringify(style)}|${theme()}`;
  if (!view) {
    view = createMapView($('map-gl'), { style, dark: theme() === 'dark' });
    styleKey = key;
    view.onMoveEnd(() => { for (const fn of viewListeners) fn(); }); // browsing (stop picking spec §4)
    view.onLinkContext(linkMenu);
    const v = view;
    for (const fn of readyListeners) fn(v);
    return;
  }
  if (key !== styleKey) { view.setStyle(style, theme() === 'dark'); styleKey = key; }
}

/** The map, once it exists (the link router draws on it and reads its tile source). @param {(view: import('./map-view.js').MapView) => void} fn */
export function onMapCreated(fn) {
  readyListeners.push(fn);
  if (view) fn(view);
}

/** Called after the map has drawn the trip (the link router adds the trip's links). @param {() => void} fn */
export function onMapDraw(fn) { drawListeners.push(fn); }

/** Draw again (new links arrived). */
export function redrawMap() { schedule(); }

/** @type {(kind: 'place' | 'quay', id: string, action?: 'use' | 'above' | 'below') => void} */
let onPick = () => {};

/** The right-click menu on a Quay: Bruk, Legg til over, Legg til under. @param {string} id @param {MouseEvent} ev */
function quayMenu(id, ev) {
  closeQuayMenu();
  const s = pickerState();
  if (s.row == null || s.recording) return;
  const menu = document.createElement('div');
  menu.className = 'map-ctx';
  menu.style.left = `${ev.clientX}px`;
  menu.style.top = `${ev.clientY}px`;
  for (const [action, label] of /** @type {['use' | 'above' | 'below', string][]} */ ([['use', t('mapUse')], ['above', t('mapAbove')], ['below', t('mapBelow')]])) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); closeQuayMenu(); onPick('quay', id, action); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  placeMenu(menu, ev.clientX, ev.clientY);
  setTimeout(() => document.addEventListener('mousedown', closeQuayMenu, { once: true }), 0);
}
function closeQuayMenu() { document.querySelector('.map-ctx')?.remove(); }

/** The right-click menu on a link (design §4): don't route it, or route it again. @param {string} key @param {MouseEvent} ev */
function linkMenu(key, ev) {
  closeQuayMenu();
  if (grid.readOnly) return;
  ev.preventDefault();
  const s = linkFor(key);
  const menu = document.createElement('div');
  menu.className = 'map-ctx';
  /** @type {[string, () => void][]} */
  const items = [];
  if (s?.status !== 'BLOCKED') items.push([t('linkBlock', linesUsing(key)), () => blockLink(key)]);
  if (s && s.status !== 'OK') items.push([t('linkRouteAgain'), () => routeAgain(key)]);
  for (const [label, fn] of items) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); closeQuayMenu(); fn(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  placeMenu(menu, ev.clientX, ev.clientY);
  setTimeout(() => document.addEventListener('mousedown', closeQuayMenu, { once: true }), 0);
}
/** @type {(() => void)[]} */
const viewListeners = [];
let pickKey = '';

/** While a stop row is being picked (stop picking spec §5): the picker's symbols. */
function drawPicker() {
  const v = /** @type {import('./map-view.js').MapView} */ (view);
  const s = pickerState();
  const lineStops = grid.stops.map((st, i) => ({ n: i + 1, stopId: st.stopId == null ? null : String(st.stopId), name: st.name,
    info: st.stopId ? quayInfo.get(String(st.stopId)) ?? null : null }));
  const model = pickerMapModel({ ...s, lineStops });
  $('map-missing').hidden = true;
  /** @type {HTMLElement | null} */ (document.querySelector('#map-inner .map-hint-overlay')).style.display = 'none';
  v.setTrip({ line: [], dots: [], ring: null });
  v.setLinks([]);
  v.setDashed(model.line.map(([lat, lon]) => [lon, lat]));
  v.setMarkers(model.markers.map((m) => {
    const base = { lon: m.lon, lat: m.lat };
    // Quays carry their platform on the icon: no hover label for them (user test 2026-10-16)
    if (m.kind === 'line') return { ...base, cls: 'pm-line', html: String(m.n), size: 18, tooltip: esc(m.label) };
    if (m.kind === 'current') return { ...base, cls: 'pm-current', html: '', size: 18, z: 800, tooltip: esc(m.label) };
    if (m.kind === 'candidate') return { ...base, cls: 'pm-candidate', html: '', size: 26, z: 1000, tooltip: esc(m.label) };
    if (m.kind === 'quay') return { ...base, cls: `pm-quay${m.state ? ` pm-quay-${m.state}` : ''}`, html: esc(m.label || '·'), size: 22, z: m.state ? 900 : 500,
      onClick: () => onPick('quay', m.id), onContext: (/** @type {MouseEvent} */ ev) => quayMenu(m.id, ev) };
    return { ...base, cls: m.kind === 'place' ? 'pm-place' : 'pm-place pm-browse', html: modeIconSvg(m.mode ?? '', ''), size: 26, tooltip: esc(m.label),
      onClick: () => onPick('place', m.id) };
  }));
  // Fit when what is being looked at changes (a new row, new hits, another stop place) — never
  // while the user pans and zooms to browse.
  const key = `${s.row}|${s.place?.id ?? ''}|${s.hits.map((h) => h.id).join(',')}|${s.current?.quayId ?? ''}`;
  if (key !== pickKey && model.fit && !s.recording) {
    pickKey = key;
    const pts = model.fit.map(([lat, lon]) => /** @type {[number, number]} */ ([lon, lat]));
    if (pts.length === 1) v.setView(pts[0][0], pts[0][1], Math.max(v.getZoom(), 17));
    else v.fit(pts, { padding: 30, maxZoom: 17 });
  }
}

/** The trip shown now: the selected column of the open line (the link router draws its links). */
export function shownTrip() {
  if (!grid.active || pickerState().row != null || pickerState().recording) return null;
  return grid.cols[selectedColumn()] ?? null;
}

/** Draw the selected trip, or the picker. Never touches the grid. */
function update() {
  scheduled = false;
  if (!panelOpen('right') || currentPage() !== 'edit') return;
  ensureMap();
  const v = /** @type {import('./map-view.js').MapView} */ (view);
  v.resize();

  if (pickerState().row != null || pickerState().recording) { lastKey = ''; drawPicker(); return; }
  pickKey = '';
  v.setMarkers([]);
  v.setDashed([]);
  const ci = selectedColumn();
  const col = grid.active ? grid.cols[ci] : null;
  const trip = col ? tripOnMap(grid, col, quayInfo) : { points: [], missing: [] };

  const notes = [trip.missing.length ? t('mapMissing', trip.missing.join(', ')) : '', linkBudgetLeft() ? '' : t('linkBudgetUsed')].filter(Boolean);
  $('map-missing').hidden = !notes.length;
  $('map-missing').textContent = notes.join(' ');
  /** @type {HTMLElement | null} */ (document.querySelector('#map-inner .map-hint-overlay')).style.display = trip.points.length ? 'none' : '';
  if (!trip.points.length) { lastKey = ''; v.setTrip({ line: [], dots: [], ring: null }); v.setLinks([]); return; }

  const line = trip.points.map((p) => /** @type {[number, number]} */ ([p.lon, p.lat]));
  // The selected row's stop, when it is a call of this trip: a ring on top, in the text colour
  const ri = selectedRowIndex();
  const here = trip.points.find((p) => p.ri === ri || (grid.stops[/** @type {number} */ (ri)]?.isDwellArr && p.ri === /** @type {number} */ (ri) + 1));
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#000';
  // Routed links replace the straight trip line when the line's mode is routed (2.3)
  const links = col ? linkFeatures(col) : null;
  v.setLinks(links ?? []);
  v.setTrip({
    // Bold stops (the main stops in the timetable) are the larger dots
    line: links ? [] : line, ink, ring: here ? [here.lon, here.lat] : null,
    dots: trip.points.map((p) => ({ lon: p.lon, lat: p.lat, r: p.bold ? 7 : 5, tooltip: `<b>${esc(p.name)}</b> ${esc(p.time.slice(0, 2))}:${esc(p.time.slice(2))}` })),
  });
  for (const fn of drawListeners) fn();

  // Fit only when another trip is shown, so the user's own zoom/pan survives edits.
  const key = `${app.activeRoute}|${app.routeState?.activePer}|${app.routeState?.activeSet}|${ci}|${trip.points.map((p) => p.stopId).join(',')}`;
  if (key !== lastKey) {
    v.fit(line, { padding: 24, maxZoom: 14 });
    lastKey = key;
  }
}

/** Many things can change the map at once (a render, a lookup): draw once, after them. */
function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(update, 0);
}

/** The panel slides open (CSS width transition): fit again once it has its final size. */
function refitAfterSlide() {
  schedule();
  setTimeout(() => { lastKey = ''; schedule(); }, 250);
}

export function initMapPanel() {
  setPickerMap({
    show: () => schedule(),
    onPick: (fn) => { onPick = fn; },
    view: () => (view && panelOpen('right') ? view.view() : null),
    onViewChange: (fn) => { viewListeners.push(fn); },
    zoomTo: (lat, lon, zoom) => { ensureMap(); view?.setView(lon, lat, zoom); },
  });
  onGridRender(schedule);
  onPanelToggle(refitAfterSlide);
  // Light/dark switch (the theme button changes data-theme without a full refresh): another style.
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  // Dragging the panel edge or resizing the window: let the map re-measure.
  new ResizeObserver(() => { view?.resize(); }).observe($('map-inner'));
  onQuaysLoaded(schedule);
  onLinksChanged(schedule);
  onRefresh(schedule); // page changes, theme, language, another route
}
