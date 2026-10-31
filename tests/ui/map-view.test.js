// @vitest-environment jsdom
// The map view's routing layers (2.6): links by state, a wide hit line to click, draggable waypoint markers.
import { describe, it, expect, vi } from 'vitest';

/** @type {any[]} */
const maps = [], markers = [];
vi.mock('maplibre-gl', () => {
  class FakeMap {
    constructor() {
      /** @type {Record<string, any>} */ this.sources = {};
      /** @type {any[]} */ this.layers = [];
      /** @type {Record<string, Function[]>} */ this.handlers = {};
      maps.push(this);
    }
    addControl() {}
    on(/** @type {string} */ ev, /** @type {any} */ a, /** @type {any} */ b) { const k = b ? `${ev}:${a}` : ev; (this.handlers[k] ??= []).push(b ?? a); }
    once() {}
    fire(/** @type {string} */ k, /** @type {any} */ e) { for (const f of this.handlers[k] ?? []) f(e); }
    addSource(/** @type {string} */ id, /** @type {any} */ s) { const src = { data: s.data, setData(/** @type {any} */ d) { src.data = d; } }; this.sources[id] = src; }
    getSource(/** @type {string} */ id) { return this.sources[id]; }
    addLayer(/** @type {any} */ l) { this.layers.push(l); }
    getCanvas() { return { style: {} }; }
  }
  class FakeMarker {
    constructor(/** @type {any} */ opts) { this.opts = opts; /** @type {Record<string, Function>} */ this.handlers = {}; this.at = [0, 0]; markers.push(this); }
    setLngLat(/** @type {[number, number]} */ p) { this.at = p; return this; }
    getLngLat() { return { lng: this.at[0], lat: this.at[1] }; }
    addTo() { return this; }
    remove() { this.removed = true; }
    on(/** @type {string} */ ev, /** @type {Function} */ f) { this.handlers[ev] = f; return this; }
    getElement() { return this.opts.element; }
  }
  class Popup { setLngLat() { return this; } setHTML() { return this; } addTo() { return this; } remove() {} }
  class NavigationControl {}
  return { default: { Map: FakeMap, Marker: FakeMarker, Popup, NavigationControl } };
});

const { createMapView } = await import('../../src/ui/map-view.js');

function view() {
  const v = createMapView(document.createElement('div'), { style: {} });
  const map = maps.at(-1);
  map.fire('style.load');
  return { v, map };
}

describe('routing on the map', () => {
  it('setLinks puts each leg in the links source with its state, drawn by state layers', () => {
    const { v, map } = view();
    v.setLinks([{ key: 'a|b|bus', coords: [[10, 59], [10.1, 59]], state: 'routed' }, { key: 'b|c|bus', coords: [[10.1, 59], [10.2, 59]], state: 'failed' }]);
    expect(map.sources.links.data.features.map((/** @type {any} */ f) => [f.properties.key, f.properties.state])).toEqual([['a|b|bus', 'routed'], ['b|c|bus', 'failed']]);
    expect(map.layers.map((/** @type {any} */ l) => l.id)).toEqual(expect.arrayContaining(['links-routed', 'links-flagged', 'links-failed', 'links-selected', 'links-hit']));
    expect(map.layers.find((/** @type {any} */ l) => l.id === 'links-failed').paint['line-dasharray']).toBeDefined();
  });

  it('keeps the links across a style change', () => {
    const { v, map } = view();
    v.setLinks([{ key: 'a|b|bus', coords: [[10, 59], [10.1, 59]], state: 'selected' }]);
    map.sources = {};
    map.fire('style.load');
    expect(map.sources.links.data.features).toHaveLength(1);
  });

  it('a click on a leg reports its key and the point', () => {
    const { v, map } = view();
    const fn = vi.fn();
    v.onLinkClick(fn);
    map.fire('click:links-hit', { features: [{ properties: { key: 'a|b|bus' } }], lngLat: { lng: 10.05, lat: 59 } });
    expect(fn).toHaveBeenCalledWith('a|b|bus', [10.05, 59]);
  });

  it('a draggable marker reports where it was dropped', () => {
    const { v } = view();
    const onDragEnd = vi.fn();
    v.setMarkers([{ lon: 10, lat: 59, html: '', cls: 'wp', size: 12, draggable: true, onDragEnd }]);
    const m = markers.at(-1);
    expect(m.opts.draggable).toBe(true);
    m.setLngLat([10.2, 59.1]);
    m.handlers.dragend();
    expect(onDragEnd).toHaveBeenCalledWith([10.2, 59.1]);
  });

  it('the 2.3 style source lookup is gone', () => {
    expect(/** @type {any} */ (view().v).styleSource).toBeUndefined();
  });

  it('the routing editor’s states get their layers: via, old (dashed), faint, stale (2026-10-31)', () => {
    const { map } = view();
    const ids = map.layers.map((/** @type {any} */ l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(['links-via', 'links-old', 'links-faint', 'links-stale']));
    expect(map.layers.find((/** @type {any} */ l) => l.id === 'links-old').paint['line-dasharray']).toBeDefined();
    // the faint and old routes lie under the pattern's own legs
    expect(ids.indexOf('links-faint')).toBeLessThan(ids.indexOf('links-routed'));
    expect(ids.indexOf('links-old')).toBeLessThan(ids.indexOf('links-routed'));
  });

  it('stop labels are markers with the stop’s number and name, apart from the other markers (any map style)', () => {
    const { v } = view();
    v.setMarkers([{ lon: 10, lat: 59, html: '', cls: 'wp', size: 12 }]);
    const before = markers.length;
    v.setStopLabels([{ lon: 10, lat: 59, name: 'Torget <1>', n: 1 }]);
    const m = markers.at(-1);
    expect(markers.length).toBe(before + 1);
    expect(m.getElement().className).toBe('rv-stop');
    expect(m.getElement().textContent).toBe('1Torget <1>');
    v.setStopLabels([]);
    expect(m.removed).toBe(true);
  });

  it('a click over two legs reports the selected one (final review M4)', () => {
    const { v, map } = view();
    const fn = vi.fn();
    v.onLinkClick(fn);
    map.fire('click:links-hit', { features: [{ properties: { key: 'a|b|bus', state: 'routed' } }, { properties: { key: 'b|a|bus', state: 'selected' } }], lngLat: { lng: 10, lat: 59 } });
    expect(fn).toHaveBeenCalledWith('b|a|bus', [10, 59]);
  });
});
