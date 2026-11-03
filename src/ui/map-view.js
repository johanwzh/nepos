// The map (2.3): MapLibre GL on vector tiles. The only file that talks to MapLibre; the map panel, the dashboard and
// the routing session give it plain data (lines, dots, markers, links) and get plain events back. The data survives a style
// change (light/dark): every source is filled again when the new style has loaded.
import maplibregl from 'maplibre-gl';
import { t } from '../i18n/strings.js';

/** @typedef {[number, number]} LonLat */
/**
 * @typedef {{ lon: number, lat: number, html: string, cls: string, size: number, height?: number, tooltip?: string, z?: number,
 *             anchor?: 'center' | 'bottom', onClick?: (ev: MouseEvent) => void, onContext?: (ev: MouseEvent) => void,
 *             draggable?: boolean, onDragEnd?: (lngLat: LonLat) => void }} MapMarker
 *   anchor 'bottom': the marker's bottom edge is the point (a pin's tip, 2.5); draggable: a routing waypoint (2.6)
 * @typedef {{ key: string, coords: LonLat[], state: 'routed' | 'flagged' | 'failed' | 'selected' | 'via' | 'old' | 'faint' | 'stale' | 'free' }} MapLink
 *   via: a leg through waypoints; old: the saved route under a proposal; faint: the table set's other patterns; stale: a
 *   saved route out of date (the timetable's map) — routing editor, 2026-10-31
 * @typedef {{ lon: number, lat: number, r: number, tooltip: string, c?: string }} MapDot   c: the dot's colour (default blue)
 */

const BLUE = '#0078d4';

/** @param {LonLat[]} line */
const lineFeature = (line, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: line } });
/** @param {LonLat} p */
const pointFeature = (p, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: p } });
/** @param {any[]} features */
const collection = (features) => ({ type: 'FeatureCollection', features });

/** Great-circle distance in km. @param {LonLat} a @param {LonLat} b */
function km(a, b) {
  const r = Math.PI / 180;
  const h = Math.sin(((b[1] - a[1]) * r) / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * @param {HTMLElement} el
 * @param {{ style: string | object, dark?: boolean }} opts
 */
export function createMapView(el, { style, dark = false }) {
  const map = new maplibregl.Map({
    container: el, style: /** @type {any} */ (style), center: [13, 62.5], zoom: 4,
    keyboard: false, // arrow keys, digits and +/- belong to the grid, never to the map
    // The map's own buttons in the app's language
    locale: { 'NavigationControl.ResetBearing': t('mapNorth'), 'NavigationControl.ZoomIn': t('mapZoomIn'), 'NavigationControl.ZoomOut': t('mapZoomOut') },
    attributionControl: { compact: true },
  });
  // The compass turns a rotated or tilted map back to north and flat (user 2026-10-22)
  map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-left');

  /** What each source holds, so a new style can be filled again. @type {Record<string, any>} */
  const data = { network: collection([]), netstops: collection([]), links: collection([]), 'trip-line': collection([]), dashed: collection([]), dots: collection([]), ring: collection([]), mtrips: collection([]) };
  let isDark = dark;
  const size = { w: el.clientWidth, h: el.clientHeight };
  let ready = false;
  /** @type {maplibregl.Marker[]} */
  let markers = [];
  /** @type {maplibregl.Marker[]} */
  let labels = [];
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });

  function addLayers() {
    for (const [id, value] of Object.entries(data)) map.addSource(id, { type: 'geojson', data: value });
    // The network (Oversikt): stretches with their own width and colour, and the stops
    map.addLayer({ id: 'network', type: 'line', source: 'network', layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ['get', 'c'], 'line-width': ['get', 'w'], 'line-opacity': 0.85 } });
    map.addLayer({ id: 'netstops', type: 'circle', source: 'netstops', paint: { 'circle-radius': ['get', 'r'], 'circle-color': isDark ? '#d8d0c0' : '#ffffff',
      'circle-stroke-color': isDark ? '#998a78' : '#606060', 'circle-stroke-width': 1.5 } });
    map.addLayer({ id: 'dashed', type: 'line', source: 'dashed', paint: { 'line-color': '#888', 'line-width': 2, 'line-opacity': 0.5, 'line-dasharray': [2, 2] } });
    // A routing session's legs (2.6), by state; failed legs are a dashed straight line between the Quays
    const link = (/** @type {string} */ state, /** @type {Record<string, any>} */ paint) => map.addLayer({ id: `links-${state}`, type: 'line', source: 'links',
      filter: ['==', ['get', 'state'], state], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint });
    link('faint', { 'line-color': '#9a9a9a', 'line-width': 2, 'line-opacity': 0.45 });
    link('old', { 'line-color': '#777', 'line-width': 4, 'line-opacity': 0.7, 'line-dasharray': [1.5, 1.5] });
    // the route without limits, where a vehicle's limits closed it (backlog 92): under the proposal
    link('free', { 'line-color': '#c62828', 'line-width': 3, 'line-opacity': 0.75 });
    link('routed', { 'line-color': '#1b8a4a', 'line-width': 4, 'line-opacity': 0.85 });
    link('via', { 'line-color': '#6a3fc4', 'line-width': 4, 'line-opacity': 0.9 });
    link('stale', { 'line-color': '#e08a00', 'line-width': 4, 'line-opacity': 0.85 });
    link('flagged', { 'line-color': '#e08a00', 'line-width': 4, 'line-opacity': 0.95 });
    link('failed', { 'line-color': '#c62828', 'line-width': 3, 'line-dasharray': [2, 2] });
    link('selected', { 'line-color': BLUE, 'line-width': 6 });
    // An invisible wide line over the legs: easy to point at
    map.addLayer({ id: 'links-hit', type: 'line', source: 'links', paint: { 'line-color': '#000', 'line-width': 14, 'line-opacity': 0 } });
    map.addLayer({ id: 'trip-line', type: 'line', source: 'trip-line', paint: { 'line-color': BLUE, 'line-width': 3, 'line-opacity': 0.85 } });
    map.addLayer({ id: 'dots', type: 'circle', source: 'dots', paint: { 'circle-radius': ['get', 'r'], 'circle-color': ['coalesce', ['get', 'c'], BLUE],
      'circle-stroke-color': isDark ? '#2a2620' : '#ffffff', 'circle-stroke-width': 2 } });
    // Trips moving on the network (Analyse's Nettverkskart): a dot per trip in its line's colour, a ring while it waits
    map.addLayer({ id: 'mtrips', type: 'circle', source: 'mtrips', paint: { 'circle-radius': 5, 'circle-color': ['get', 'c'],
      'circle-stroke-color': ['case', ['get', 'waiting'], isDark ? '#ffffff' : '#000000', isDark ? '#2a2620' : '#ffffff'], 'circle-stroke-width': ['case', ['get', 'waiting'], 2.5, 1.5] } });
    map.addLayer({ id: 'ring', type: 'circle', source: 'ring', paint: { 'circle-radius': 12, 'circle-opacity': 0,
      'circle-stroke-color': ['get', 'ink'], 'circle-stroke-width': 3 } });
  }
  map.on('style.load', () => { addLayers(); ready = true; });

  /** @param {string} id @param {any} value */
  function put(id, value) {
    data[id] = value;
    if (!ready) return;
    /** @type {any} */ (map.getSource(id))?.setData(value);
  }

  // Hover texts: the trip's stops and the network
  for (const layer of ['dots', 'netstops', 'network', 'mtrips']) {
    map.on('mousemove', layer, (e) => {
      const tip = e.features?.[0]?.properties?.tooltip;
      if (!tip) return;
      map.getCanvas().style.cursor = 'pointer';
      popup.setLngLat(e.lngLat).setHTML(String(tip)).addTo(map);
    });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; popup.remove(); });
  }

  /** @type {((key: string, lngLat: LonLat) => void)[]} */
  const linkClick = [];
  map.on('click', 'links-hit', (e) => {
    // Where legs overlap (there and back), the selected one wins (final review M4, 2026-10-31)
    const f = e.features ?? [];
    const key = (f.find((x) => x.properties?.state === 'selected') ?? f[0])?.properties?.key;
    if (key) for (const fn of linkClick) fn(String(key), [e.lngLat.lng, e.lngLat.lat]);
  });
  map.on('mouseenter', 'links-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'links-hit', () => { map.getCanvas().style.cursor = ''; });

  return {
    /** @param {string | object} next @param {boolean} nextDark */
    setStyle(next, nextDark) {
      isDark = nextDark;
      ready = false;
      map.setStyle(/** @type {any} */ (next), { diff: false }); // a full load: style.load adds our layers again
    },
    /**
     * @param {{ line: LonLat[], segments?: LonLat[][], dots: MapDot[], ring: (LonLat & any) | null, ink?: string }} trip
     *   segments: drawn in place of line, the legs without a saved route (routing editor, 2026-10-31)
     */
    setTrip(trip) {
      const lines = trip.segments ?? (trip.line.length > 1 ? [trip.line] : []);
      put('trip-line', collection(lines.map((l) => lineFeature(l))));
      put('dots', collection(trip.dots.map((d) => pointFeature([d.lon, d.lat], { r: d.r, tooltip: d.tooltip, ...(d.c ? { c: d.c } : {}) }))));
      put('ring', collection(trip.ring ? [pointFeature(trip.ring, { ink: trip.ink ?? '#000' })] : []));
    },
    /** The network (Oversikt): lines { coords, w, c, tooltip } and stops { lon, lat, r, tooltip }. @param {{ lines: { coords: LonLat[], w: number, c: string, tooltip?: string }[], stops: { lon: number, lat: number, r: number, tooltip?: string }[] }} net */
    setNetwork(net) {
      put('network', collection(net.lines.map((l) => lineFeature(l.coords, { w: l.w, c: l.c, tooltip: l.tooltip ?? '' }))));
      put('netstops', collection(net.stops.map((p) => pointFeature([p.lon, p.lat], { r: p.r, tooltip: p.tooltip ?? '' }))));
    },
    /** Remove the map and its WebGL context (a view opened and closed often: Nettverkskart, final review I2). */
    destroy() {
      popup.remove();
      for (const m of [...markers, ...labels]) m.remove();
      map.remove();
    },
    /** Trips at a moment (Nettverkskart): { lon, lat, c, waiting, tooltip }. @param {{ line?: string, lon: number, lat: number, c: string, waiting: boolean, tooltip?: string }[]} trips */
    setTrips(trips) { put('mtrips', collection(trips.map((p) => pointFeature([p.lon, p.lat], { c: p.c, waiting: p.waiting, tooltip: p.tooltip ?? '' })))); },
    /** A routing session's legs. @param {MapLink[]} links */
    setLinks(links) { put('links', collection(links.map((l) => lineFeature(l.coords, { key: l.key, state: l.state })))); },
    /** @param {(key: string, lngLat: LonLat) => void} fn */
    onLinkClick(fn) { linkClick.push(fn); },
    /**
     * The stops of a routing pattern with their number and name (2026-10-31): HTML labels, so they work on every map
     * style (raster styles have no fonts). @param {{ lon: number, lat: number, name: string, n: number }[]} stops
     */
    setStopLabels(stops) {
      for (const m of labels) m.remove();
      labels = stops.map((s) => {
        const box = document.createElement('div');
        box.className = 'rv-stop';
        const n = document.createElement('b');
        n.textContent = String(s.n);
        const name = document.createElement('span');
        name.textContent = s.name;
        box.append(n, name);
        return new maplibregl.Marker({ element: box, anchor: 'left', offset: [-8, 0] }).setLngLat([s.lon, s.lat]).addTo(map);
      });
    },
    /** @param {LonLat[]} line */
    setDashed(line) { put('dashed', collection(line.length > 1 ? [lineFeature(line)] : [])); },
    /** @param {MapMarker[]} list */
    setMarkers(list) {
      for (const m of markers) m.remove();
      markers = list.map((m) => {
        const box = document.createElement('div');
        box.className = `pm ${m.cls}`;
        box.style.width = `${m.size}px`;
        box.style.height = `${m.height ?? m.size}px`;
        box.innerHTML = m.html;
        if (m.z) box.style.zIndex = String(m.z);
        if (m.tooltip) {
          box.addEventListener('mouseenter', () => popup.setLngLat([m.lon, m.lat]).setHTML(/** @type {string} */ (m.tooltip)).addTo(map));
          box.addEventListener('mouseleave', () => popup.remove());
        }
        if (m.onClick) {
          box.addEventListener('click', (e) => { e.stopPropagation(); m.onClick?.(e); });
          // Shift+mousedown would start MapLibre's box zoom, which eats the Shift+click (user 2026-10-30)
          box.addEventListener('mousedown', (e) => { if (e.shiftKey) e.stopPropagation(); });
        }
        if (m.onContext) box.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); m.onContext?.(e); });
        const marker = new maplibregl.Marker({ element: box, anchor: m.anchor ?? 'center', draggable: !!m.draggable }).setLngLat([m.lon, m.lat]).addTo(map);
        if (m.onDragEnd) marker.on('dragend', () => { const p = marker.getLngLat(); m.onDragEnd?.([p.lng, p.lat]); });
        if (m.z) marker.getElement().style.zIndex = String(m.z);
        return marker;
      });
    },
    /** @param {LonLat[]} points @param {{ padding?: number, maxZoom?: number }} [opts] */
    fit(points, { padding = 24, maxZoom = 14 } = {}) {
      if (!points.length) return;
      if (points.length === 1) { map.jumpTo({ center: points[0], zoom: Math.max(map.getZoom(), maxZoom) }); return; }
      const b = new maplibregl.LngLatBounds(points[0], points[0]);
      for (const p of points) b.extend(p);
      map.fitBounds(b, { padding, maxZoom, duration: 0 });
    },
    /** @param {number} lon @param {number} lat @param {number} zoom */
    setView(lon, lat, zoom) { map.jumpTo({ center: [lon, lat], zoom }); },
    view() {
      const c = map.getCenter();
      const b = map.getBounds();
      return { lat: c.lat, lon: c.lng, zoom: map.getZoom(), radiusKm: km([b.getEast(), b.getNorth()], [b.getWest(), b.getSouth()]) / 2 };
    },
    getZoom: () => map.getZoom(),
    /** @param {() => void} fn */
    onMoveEnd(fn) { map.on('moveend', fn); },
    /** @param {() => void} fn called once the style is loaded, now or later */
    whenReady(fn) { if (ready && map.isStyleLoaded()) fn(); else map.once('idle', fn); },
    /** Re-measure, only when the container's size changed (a real resize repaints and fires move events). */
    resize() {
      if (el.clientWidth === size.w && el.clientHeight === size.h) return;
      size.w = el.clientWidth; size.h = el.clientHeight;
      map.resize();
    },
  };
}

/** @typedef {ReturnType<typeof createMapView>} MapView */
