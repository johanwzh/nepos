// The search window's map (spec §7.1: a large map beside the results). Same library and tiles as
// the map panel. Markers are the current results (stop places) or the open stop place's Quays;
// clicking one does what clicking the row does. The view is fitted to the markers every time they
// change — the auto-fit the original workbench never got right.
import L from 'leaflet';
import { app } from './state.js';
import { DEFAULT_SETTINGS } from '../project/settings.js';

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** @param {HTMLElement} el @returns {import('./workbench.js').WorkbenchMap} */
export function createWorkbenchMap(el) {
  /** @type {any} */ let map = null;
  /** @type {any} */ let markers = null;
  return {
    show(points, onClick) {
      if (!map) {
        map = L.map(el, { keyboard: false }).setView([62.5, 13], 5);
        L.tileLayer(app.settings.tileUrl || DEFAULT_SETTINGS.tileUrl, {
          attribution: app.settings.tileAttribution || DEFAULT_SETTINGS.tileAttribution, maxZoom: 19,
        }).addTo(map);
      }
      el.classList.toggle('n2-map-dark', document.documentElement.getAttribute('data-theme') === 'dark');
      // The dialog has just been shown: let Leaflet measure it before fitting.
      setTimeout(() => {
        map.invalidateSize();
        if (markers) markers.remove();
        markers = L.layerGroup(points.map((p) => L.circleMarker([p.lat, p.lon], {
          radius: 7, fillColor: '#0078d4', color: '#ffffff', weight: 2, fillOpacity: 1,
        }).bindTooltip(esc(p.label)).on('click', () => onClick(p.id)))).addTo(map);
        if (points.length === 1) map.setView([points[0].lat, points[0].lon], 17);
        else if (points.length > 1) map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon])), { padding: [30, 30], maxZoom: 17 });
      }, 0);
    },
  };
}
