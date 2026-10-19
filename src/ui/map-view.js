// The map (2.3): MapLibre GL on vector tiles. The only file that talks to MapLibre; the map panel and the link
// router give it plain data (lines, dots, markers, links) and get plain events back. The data survives a style
// change (light/dark): every source is filled again when the new style has loaded.
import maplibregl from 'maplibre-gl';

/** @typedef {[number, number]} LonLat */
/**
 * @typedef {{ lon: number, lat: number, html: string, cls: string, size: number, tooltip?: string, z?: number,
 *             onClick?: () => void, onContext?: (ev: MouseEvent) => void }} MapMarker
 * @typedef {{ lon: number, lat: number, r: number, tooltip: string }} MapDot
 */

const BLUE = '#0078d4';
const WARN = '#d97706';

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
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

  /** What each source holds, so a new style can be filled again. @type {Record<string, any>} */
  const data = { links: collection([]), 'trip-line': collection([]), dashed: collection([]), dots: collection([]), ring: collection([]) };
  let isDark = dark;
  let ready = false;
  /** @type {maplibregl.Marker[]} */
  let markers = [];
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });

  function addLayers() {
    for (const [id, value] of Object.entries(data)) map.addSource(id, { type: 'geojson', data: value });
    map.addLayer({ id: 'dashed', type: 'line', source: 'dashed', paint: { 'line-color': '#888', 'line-width': 2, 'line-opacity': 0.5, 'line-dasharray': [2, 2] } });
    map.addLayer({ id: 'trip-line', type: 'line', source: 'trip-line', paint: { 'line-color': BLUE, 'line-width': 3, 'line-opacity': 0.85 } });
    map.addLayer({ id: 'links-pending', type: 'line', source: 'links', filter: ['==', ['get', 'status'], 'PENDING'],
      paint: { 'line-color': '#888', 'line-width': 2.5, 'line-opacity': 0.7, 'line-dasharray': [2, 2] } });
    map.addLayer({ id: 'links-other', type: 'line', source: 'links', filter: ['all', ['!=', ['get', 'status'], 'OK'], ['!=', ['get', 'status'], 'PENDING']],
      paint: { 'line-color': WARN, 'line-width': 3, 'line-opacity': 0.9, 'line-dasharray': [2, 1.5] } });
    map.addLayer({ id: 'links-ok', type: 'line', source: 'links', filter: ['==', ['get', 'status'], 'OK'],
      layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': BLUE, 'line-width': 3.5, 'line-opacity': 0.9 } });
    map.addLayer({ id: 'dots', type: 'circle', source: 'dots', paint: { 'circle-radius': ['get', 'r'], 'circle-color': BLUE,
      'circle-stroke-color': isDark ? '#2a2620' : '#ffffff', 'circle-stroke-width': 2 } });
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

  // Hover texts: the trip's stops, and why a link is not routed
  for (const layer of ['dots', 'links-other', 'links-pending']) {
    map.on('mousemove', layer, (e) => {
      const tip = e.features?.[0]?.properties?.tooltip;
      if (!tip) return;
      map.getCanvas().style.cursor = 'pointer';
      popup.setLngLat(e.lngLat).setHTML(String(tip)).addTo(map);
    });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; popup.remove(); });
  }

  /** @type {((key: string, ev: MouseEvent) => void)[]} */
  const linkContext = [];
  for (const layer of ['links-ok', 'links-other']) {
    map.on('contextmenu', layer, (e) => {
      const key = e.features?.[0]?.properties?.key;
      if (key) for (const fn of linkContext) fn(String(key), /** @type {MouseEvent} */ (e.originalEvent));
    });
  }

  return {
    /** @param {string | object} next @param {boolean} nextDark */
    setStyle(next, nextDark) {
      isDark = nextDark;
      ready = false;
      map.setStyle(/** @type {any} */ (next), { diff: false }); // a full load: style.load adds our layers again
    },
    /** @param {{ line: LonLat[], dots: MapDot[], ring: (LonLat & any) | null, ink?: string }} trip */
    setTrip(trip) {
      put('trip-line', collection(trip.line.length > 1 ? [lineFeature(trip.line)] : []));
      put('dots', collection(trip.dots.map((d) => pointFeature([d.lon, d.lat], { r: d.r, tooltip: d.tooltip }))));
      put('ring', collection(trip.ring ? [pointFeature(trip.ring, { ink: trip.ink ?? '#000' })] : []));
    },
    /** Routed links: features with properties { key, status, tooltip }. @param {any[]} features */
    setLinks(features) { put('links', collection(features)); },
    /** @param {LonLat[]} line */
    setDashed(line) { put('dashed', collection(line.length > 1 ? [lineFeature(line)] : [])); },
    /** @param {MapMarker[]} list */
    setMarkers(list) {
      for (const m of markers) m.remove();
      markers = list.map((m) => {
        const box = document.createElement('div');
        box.className = `pm ${m.cls}`;
        box.style.width = `${m.size}px`;
        box.style.height = `${m.size}px`;
        box.innerHTML = m.html;
        if (m.z) box.style.zIndex = String(m.z);
        if (m.tooltip) {
          box.addEventListener('mouseenter', () => popup.setLngLat([m.lon, m.lat]).setHTML(/** @type {string} */ (m.tooltip)).addTo(map));
          box.addEventListener('mouseleave', () => popup.remove());
        }
        if (m.onClick) box.addEventListener('click', (e) => { e.stopPropagation(); m.onClick?.(); });
        if (m.onContext) box.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); m.onContext?.(e); });
        const marker = new maplibregl.Marker({ element: box }).setLngLat([m.lon, m.lat]).addTo(map);
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
    /** @param {(key: string, ev: MouseEvent) => void} fn */
    onLinkContext(fn) { linkContext.push(fn); },
    /** @param {() => void} fn called once the style is loaded, now or later */
    whenReady(fn) { if (ready && map.isStyleLoaded()) fn(); else map.once('idle', fn); },
    resize() { map.resize(); },
    /** The vector source the style draws roads from: what the router fetches. Null for a raster style. */
    styleSource() {
      const style = map.getStyle();
      for (const id of Object.keys(style?.sources ?? {})) {
        const src = /** @type {any} */ (map.getSource(id));
        if (src?.type !== 'vector' || !src.tiles?.length) continue;
        const build = String(src.tiles[0]).match(/\/(\d{8}_\d{6}_[a-z]+)\//)?.[1] ?? '';
        return { tiles: /** @type {string[]} */ (src.tiles), maxzoom: Number(src.maxzoom ?? 14), buildId: build || id };
      }
      return null;
    },
  };
}

/** @typedef {ReturnType<typeof createMapView>} MapView */
