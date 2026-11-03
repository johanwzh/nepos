import { describe, it, expect } from 'vitest';
import { tripOnMap, tripRouteLegs } from '../../src/core/map-model.js';
import { encodePolyline } from '../../src/routing/geometry.js';

const stop = (/** @type {string} */ name, /** @type {string | null} */ stopId, extra = {}) => ({ name, stopId, bold: false, sep: false, isDwellArr: false, price: null, ...extra });
const cell = (/** @type {string} */ time) => ({ time, dayOffset: 0, suffix: '', interchange: null, footnoteId: null });
const at = (/** @type {number} */ lat, /** @type {number} */ lon) => ({ quayId: '', publicCode: '', stopPlaceId: '', stopPlaceName: '', mode: 'bus', lat, lon });

describe('tripOnMap', () => {
  it('gives the positions of the calls and lists the stops without one', () => {
    const grid = {
      stops: [stop('A', 'NSR:Quay:1'), stop('Uten ID', null), stop('Ukjent', 'NSR:Quay:2'), stop('B', 'NSR:Quay:3'), stop('Ikke i turen', 'NSR:Quay:4')],
      cols: [{ cells: [cell('0700'), cell('0705'), cell('0710'), cell('0720'), null] }],
    };
    const info = new Map([['NSR:Quay:1', at(60, 10)], ['NSR:Quay:2', null], ['NSR:Quay:3', at(60.1, 10.1)], ['NSR:Quay:4', at(61, 11)]]);
    expect(tripOnMap(grid, grid.cols[0], info)).toEqual({
      points: [
        { name: 'A', time: '0700', stopId: 'NSR:Quay:1', lat: 60, lon: 10, ri: 0, bold: false },
        { name: 'B', time: '0720', stopId: 'NSR:Quay:3', lat: 60.1, lon: 10.1, ri: 3, bold: false },
      ],
      missing: ['Uten ID', 'Ukjent'],
    });
  });

  it('marks bold stops (drawn larger on the map) and gives each point its row', () => {
    const grid = { stops: [stop('A', 'NSR:Quay:1', { bold: true }), stop('B', 'NSR:Quay:3')], cols: [{ cells: [cell('0700'), cell('0710')] }] };
    const info = new Map([['NSR:Quay:1', at(60, 10)], ['NSR:Quay:3', at(60.1, 10.1)]]);
    expect(tripOnMap(grid, grid.cols[0], info).points.map((p) => [p.ri, p.bold])).toEqual([[0, true], [1, false]]);
  });

  it('shows a dwell stop once, with its departure time', () => {
    const grid = {
      stops: [stop('A', 'NSR:Quay:1'), stop('B', 'NSR:Quay:3', { isDwellArr: true }), stop('B', 'NSR:Quay:3')],
      cols: [{ cells: [cell('0700'), cell('0710'), cell('0715')] }],
    };
    const info = new Map([['NSR:Quay:1', at(60, 10)], ['NSR:Quay:3', at(60.1, 10.1)]]);
    expect(tripOnMap(grid, grid.cols[0], info).points.map((p) => `${p.name} ${p.time}`)).toEqual(['A 0700', 'B 0715']);
  });
});

describe('the selected trip along its saved routes (routing editor, 2026-10-31)', () => {
  const grid = { stops: [stop('A', 'NSR:Quay:1'), stop('B', 'NSR:Quay:2'), stop('C', 'NSR:Quay:3')], cols: [{ cells: [cell('0700'), cell('0710'), cell('0720')] }] };
  const info = new Map([['NSR:Quay:1', at(60, 10)], ['NSR:Quay:2', at(60, 10.1)], ['NSR:Quay:3', at(60, 10.2)]]);
  const K1 = 'NSR:Quay:1|NSR:Quay:2|bus';
  const route = /** @type {[number, number][]} */ ([[10, 60], [10.05, 60.02], [10.1, 60]]);
  const link = { polyline: encodePolyline(route, 6), precision: 6, distanceM: 6000, status: 'OK', from: /** @type {[number, number]} */ ([10, 60]), to: /** @type {[number, number]} */ ([10.1, 60]) };

  it('a leg with a saved route follows it; a leg without one is a straight line', () => {
    const r = tripRouteLegs(grid, grid.cols[0], { [K1]: link }, info);
    expect(r.links).toEqual([{ key: K1, coords: route, state: 'routed' }]);
    expect(r.straight).toEqual([{ key: 'NSR:Quay:2|NSR:Quay:3|bus', coords: [[10.1, 60], [10.2, 60]] }]);
  });

  it('a Quay moved since it was routed: the route is drawn stale', () => {
    const moved = new Map(info).set('NSR:Quay:2', at(60.001, 10.1));
    expect(tripRouteLegs(grid, grid.cols[0], { [K1]: link }, moved).links[0].state).toBe('stale');
  });

  it('a tram line draws its tram routes, never a bus route on the same stops (final review C1)', () => {
    const tram = 'NSR:Quay:1|NSR:Quay:2|tram';
    const r = tripRouteLegs(grid, grid.cols[0], { [K1]: link, [tram]: link }, info, 'tram');
    expect(r.links.map((l) => l.key)).toEqual([tram]);
    expect(tripRouteLegs(grid, grid.cols[0], { [K1]: link }, info, 'tram').links).toEqual([]);
  });

  it('no links: every leg straight', () => {
    expect(tripRouteLegs(grid, grid.cols[0], undefined, info).straight.map((s) => s.coords)).toEqual([[[10, 60], [10.1, 60]], [[10.1, 60], [10.2, 60]]]);
  });
});

describe('the selected trip along its own vehicle group\'s route (backlog 93)', () => {
  const grid = { stops: [stop('A', 'NSR:Quay:1'), stop('B', 'NSR:Quay:2')], cols: [{ vehicle: 'TB', cells: [cell('0700'), cell('0710')] }, { vehicle: 'LB', cells: [cell('0800'), cell('0810')] }] };
  const info = new Map([['NSR:Quay:1', at(60, 10)], ['NSR:Quay:2', at(60, 10.1)]]);
  const K = 'NSR:Quay:1|NSR:Quay:2|bus';
  const short = /** @type {[number, number][]} */ ([[10, 60], [10.1, 60]]), long = /** @type {[number, number][]} */ ([[10, 60], [10.05, 60.05], [10.1, 60]]);
  const mk = (/** @type {[number, number][]} */ c, extra = {}) => ({ polyline: encodePolyline(c, 6), precision: 6, distanceM: 6000, status: 'OK', from: c[0], to: c[c.length - 1], ...extra });
  const links = { [K]: mk(short, { limits: { height: { kind: 'height', value: 3.7, way: 1, road: '', at: [10, 60] } } }), [`${K}|h4`]: mk(long, { limits: {}, uturn: 12 }) };
  const ctx = { vehicles: [{ name: 'TB', height: 4 }, { name: 'LB', height: 3 }], lineMode: 'bus' };

  it('TB follows its own route, LB the plain one', () => {
    expect(tripRouteLegs(grid, grid.cols[0], /** @type {any} */ (links), info, 'bus', ctx).links[0].coords).toEqual(long);
    expect(tripRouteLegs(grid, grid.cols[1], /** @type {any} */ (links), info, 'bus', ctx).links[0].coords).toEqual(short);
  });
});
