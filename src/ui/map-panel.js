// The map panel (F6, spec §7.3): the selected trip's stops joined by straight lines on a raster
// basemap (OpenStreetMap by default; CARTO's free basemaps now need an API key). Positions come
// from the NSR lookups; stops without one are listed under the map. Created only when the panel
// is first opened.
import L from 'leaflet';
import { app } from './state.js';
import { $, onRefresh, currentPage, panelOpen, onPanelToggle } from './shell.js';
import { t } from '../i18n/strings.js';
import { grid, selectedColumn, onGridRender } from './grid.js';
import { quayInfo, onQuaysLoaded } from './quays.js';
import { tripOnMap } from '../core/map-model.js';
import { DEFAULT_SETTINGS } from '../project/settings.js';
import { pickerState, setPickerMap } from './stop-picker.js';
import { pickerMapModel } from '../core/picker-map-model.js';
import { modeIconSvg } from './mode-icons.js';


/** @type {any} */ let map = null;
/** @type {any} */ let tiles = null;
let tileTheme = '';
/** @type {any[]} */ let layers = [];
let lastKey = '';
let scheduled = false;

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function theme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function ensureMap() {
  if (map) return;
  map = L.map($('leaflet-map'), {
    zoomControl: true, attributionControl: true,
    keyboard: false, // arrow keys, digits and +/- belong to the grid, never to the map
  }).setView([62.5, 13], 5);
  map.on('moveend', () => { for (const fn of viewListeners) fn(); }); // browsing (stop picking spec §4)
}

function ensureTiles() {
  // The basemap comes from the settings (private/settings.json), default OpenStreetMap; it is
  // muted in light mode and inverted in dark mode by CSS (.n2-map-dark), so one source serves both.
  const url = app.settings.tileUrl || DEFAULT_SETTINGS.tileUrl;
  const want = `${url}|${theme()}`;
  $('leaflet-map').classList.toggle('n2-map-dark', theme() === 'dark');
  if (tiles && tileTheme === want) return;
  if (tiles) tiles.remove();
  tiles = L.tileLayer(url, {
    attribution: app.settings.tileAttribution || DEFAULT_SETTINGS.tileAttribution, maxZoom: 19,
  }).addTo(map);
  tiles.bringToBack();
  tileTheme = want;
}

/** @type {(kind: 'place' | 'quay', id: string) => void} */
let onPick = () => {};
/** @type {(() => void)[]} */
const viewListeners = [];
let pickKey = '';

/** @param {string} cls @param {string} html @param {number} size */
const icon = (cls, html, size) => L.divIcon({ className: `pm ${cls}`, html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });

/** While a stop row is being picked (stop picking spec §5): the picker's symbols. */
function drawPicker() {
  const s = pickerState();
  const lineStops = grid.stops.map((st, i) => ({ n: i + 1, stopId: st.stopId == null ? null : String(st.stopId), name: st.name,
    info: st.stopId ? quayInfo.get(String(st.stopId)) ?? null : null }));
  const model = pickerMapModel({ ...s, lineStops });
  $('map-missing').hidden = true;
  /** @type {HTMLElement | null} */ (document.querySelector('#map-inner .map-hint-overlay')).style.display = 'none';
  if (model.line.length > 1) layers.push(L.polyline(model.line, { color: '#888', weight: 2, opacity: 0.5, dashArray: '4 4' }).addTo(map));
  for (const m of model.markers) {
    /** @type {any} */ let marker;
    if (m.kind === 'line') marker = L.marker([m.lat, m.lon], { icon: icon('pm-line', String(m.n), 18), keyboard: false });
    else if (m.kind === 'current') marker = L.marker([m.lat, m.lon], { icon: icon('pm-current', '', 18), keyboard: false, zIndexOffset: 800 });
    else if (m.kind === 'candidate') marker = L.marker([m.lat, m.lon], { icon: icon('pm-candidate', '', 26), keyboard: false, zIndexOffset: 1000 });
    else if (m.kind === 'quay') marker = L.marker([m.lat, m.lon], { icon: icon('pm-quay', esc(m.label || '·'), 20), keyboard: false, zIndexOffset: 500 });
    else marker = L.marker([m.lat, m.lon], { icon: icon(m.kind === 'place' ? 'pm-place' : 'pm-place pm-browse', modeIconSvg(m.mode ?? '', ''), 26), keyboard: false });
    marker.bindTooltip(esc(m.label), { direction: 'top', offset: [0, -10] });
    if (m.kind === 'place' || m.kind === 'browsePlace') marker.on('click', () => onPick('place', m.id));
    if (m.kind === 'quay') marker.on('click', () => onPick('quay', m.id));
    layers.push(marker.addTo(map));
  }
  // Fit when what is being looked at changes (a new row, new hits, another stop place) — never
  // while the user pans and zooms to browse.
  const key = `${s.row}|${s.place?.id ?? ''}|${s.hits.map((h) => h.id).join(',')}|${s.current?.quayId ?? ''}`;
  if (key !== pickKey && model.fit) {
    pickKey = key;
    if (model.fit.length === 1) map.setView(model.fit[0], Math.max(map.getZoom(), 17));
    else map.fitBounds(L.latLngBounds(model.fit), { padding: [30, 30], maxZoom: 17 });
  }
}

/** Draw the selected trip, or the picker. Never touches the grid. */
function update() {
  scheduled = false;
  if (!panelOpen('right') || currentPage() !== 'edit') return;
  ensureMap();
  ensureTiles();
  map.invalidateSize();

  for (const layer of layers) layer.remove();
  layers = [];
  if (pickerState().row != null) { lastKey = ''; drawPicker(); return; }
  pickKey = '';
  const ci = selectedColumn();
  const col = grid.active ? grid.cols[ci] : null;
  const trip = col ? tripOnMap(grid, col, quayInfo) : { points: [], missing: [] };

  $('map-missing').hidden = !trip.missing.length;
  $('map-missing').textContent = trip.missing.length ? t('mapMissing', trip.missing.join(', ')) : '';
  /** @type {HTMLElement | null} */ (document.querySelector('#map-inner .map-hint-overlay')).style.display = trip.points.length ? 'none' : '';
  if (!trip.points.length) { lastKey = ''; return; }

  const dark = theme() === 'dark';
  const latlngs = trip.points.map((p) => [p.lat, p.lon]);
  if (latlngs.length > 1) layers.push(L.polyline(latlngs, { color: '#0078d4', weight: 3, opacity: 0.85 }).addTo(map));
  trip.points.forEach((p, i) => {
    const end = i === 0 || i === trip.points.length - 1;
    layers.push(L.circleMarker([p.lat, p.lon], {
      radius: end ? 7 : 5, fillColor: '#0078d4', color: dark ? '#2a2620' : '#ffffff', weight: 2, fillOpacity: 1,
    }).bindTooltip(`<b>${esc(p.name)}</b> ${esc(p.time.slice(0, 2))}:${esc(p.time.slice(2))}`, { sticky: true }).addTo(map));
  });

  // Fit only when another trip is shown, so the user's own zoom/pan survives edits.
  const key = `${app.activeRoute}|${app.routeState?.activePer}|${app.routeState?.activeSet}|${ci}|${trip.points.map((p) => p.stopId).join(',')}`;
  if (key !== lastKey) {
    map.fitBounds(L.latLngBounds(latlngs), { padding: [24, 24], maxZoom: 14 });
    lastKey = key;
  }
}

/** Many things can change the map at once (a render, a lookup): draw once, after them. */
function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(update, 0);
}

export function initMapPanel() {
  setPickerMap({
    show: () => schedule(),
    onPick: (fn) => { onPick = fn; },
    view: () => {
      if (!map || !panelOpen('right')) return null;
      const c = map.getCenter();
      const b = map.getBounds();
      return { lat: c.lat, lon: c.lng, zoom: map.getZoom(), radiusKm: b.getNorthEast().distanceTo(b.getSouthWest()) / 2000 };
    },
    onViewChange: (fn) => { viewListeners.push(fn); },
    zoomTo: (lat, lon, zoom) => { ensureMap(); map.setView([lat, lon], zoom); },
  });
  onGridRender(schedule);
  // The panel slides open (CSS width transition): fit again once it has its final size.
  onPanelToggle(() => {
    schedule();
    setTimeout(() => { lastKey = ''; schedule(); }, 250);
  });
  // Light/dark switch (the theme button changes data-theme without a full refresh).
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  // Dragging the panel edge or resizing the window: let Leaflet re-measure.
  new ResizeObserver(() => { if (map) map.invalidateSize(); }).observe($('map-inner'));
  onQuaysLoaded(schedule);
  onRefresh(schedule); // page changes, theme, language, another route
}
