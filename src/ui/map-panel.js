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

/** Draw the selected trip. Never touches the grid. */
function update() {
  scheduled = false;
  if (!panelOpen('right') || currentPage() !== 'edit') return;
  ensureMap();
  ensureTiles();
  map.invalidateSize();

  for (const layer of layers) layer.remove();
  layers = [];
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
  const key = `${app.activeRoute}|${app.routeState?.activePer}|${app.routeState?.activeDir}|${ci}|${trip.points.map((p) => p.stopId).join(',')}`;
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
