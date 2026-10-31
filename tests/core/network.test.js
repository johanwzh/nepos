// The network on Oversikt (user 2026-10-21): every stretch between two stops a trip calls at drawn once, however many
// patterns use it, with the number of trips on it, so many patterns do not make a tangle.
import { describe, it, expect } from 'vitest';
import { networkOf } from '../../src/core/network.js';
import { encodePolyline } from '../../src/routing/geometry.js';

const stop = (/** @type {string} */ id, extra = {}) => ({ name: id, stopId: id, bold: false, sep: false, isDwellArr: false, price: null, ...extra });
const cell = (/** @type {string} */ time) => ({ time, dayOffset: 0, suffix: '', interchange: null });
const at = (/** @type {number} */ lon, /** @type {number} */ lat) => ({ lon, lat, stopPlaceName: '' });
const QUAYS = new Map(/** @type {[string, any][]} */ ([['A', at(10, 60)], ['B', at(10.1, 60)], ['C', at(10.2, 60)], ['D', at(10.3, 60)], ['X', null]]));

/** @param {any[]} stops @param {(string | null)[][]} cols */
const rs = (stops, cols) => ({ grids: { 'p:1': { stops, cols: cols.map((times) => ({ dayCode: 'D', cells: times.map((t) => (t ? cell(t) : null)) })) } } });

describe('networkOf', () => {
  it('draws a stretch once, counting the trips on it, from every line and pattern', () => {
    const a = rs([stop('A'), stop('B'), stop('C')], [['0700', '0710', '0720'], ['0800', null, '0820']]); // A–B–C and A–C
    const b = rs([stop('C'), stop('B')], [['0900', '0910']]); // C–B, the same stretch as B–C
    const n = networkOf([{ code: '1', rs: a, problem: false }, { code: '2', rs: b, problem: true }], QUAYS);
    const s = Object.fromEntries(n.segments.map((x) => [[x.from, x.to].sort().join('-'), x]));
    expect(Object.keys(s).sort()).toEqual(['A-B', 'A-C', 'B-C']);
    expect(s['B-C']).toMatchObject({ trips: 2, problem: true, lines: ['1', '2'] });
    expect(s['A-B']).toMatchObject({ trips: 1, problem: false });
    expect(s['A-B'].coords).toEqual([[10, 60], [10.1, 60]]);
  });

  it('a passed stop (|) is skipped, and a waiting stop is not a stretch to itself', () => {
    const r = rs([stop('A'), stop('B'), stop('C', { isDwellArr: true }), stop('C'), stop('D')], [['0700', '|', '0720', '0725', '0730']]);
    const n = networkOf([{ code: '1', rs: r, problem: false }], QUAYS);
    expect(n.segments.map((x) => `${x.from}-${x.to}`)).toEqual(['A-C', 'C-D']);
  });

  it('leaves out stops without a position, and lists the stops with how many lines call there', () => {
    const r = rs([stop('A'), stop('X'), stop('B')], [['0700', '0710', '0720']]);
    const n = networkOf([{ code: '1', rs: r, problem: false }, { code: '2', rs: rs([stop('A'), stop('B')], [['0800', '0810']]), problem: false }], QUAYS);
    expect(n.segments.map((x) => `${x.from}-${x.to}`)).toEqual(['A-B']); // A–X and X–B have no position for X; A–B from line 2
    expect(n.stops.map((x) => [x.id, x.lines])).toEqual([['A', 2], ['B', 2]]);
  });

  it('a stretch with a routed link follows it, in either direction; a bus line only (user 2026-10-31)', () => {
    const road = /** @type {[number, number][]} */ ([[10, 60], [10.05, 60.03], [10.1, 60]]);
    const link = /** @type {any} */ ({ polyline: encodePolyline(road, 6), precision: 6, distanceM: 6000, status: 'OK', from: [10, 60], to: [10.1, 60] });
    const bus = { ...rs([stop('A'), stop('B'), stop('C')], [['0700', '0710', '0720']]), mode: 'bus' };
    const n = networkOf([{ code: '1', rs: bus, problem: false, links: { 'A|B|bus': link } }], QUAYS);
    const s = Object.fromEntries(n.segments.map((x) => [`${x.from}-${x.to}`, x]));
    expect(s['A-B'].coords).toEqual(road);
    expect(s['B-C'].coords).toEqual([[10.1, 60], [10.2, 60]]);
    // the other direction uses it too, turned round
    const back = { ...rs([stop('B'), stop('A')], [['0700', '0710']]), mode: 'bus' };
    expect(networkOf([{ code: '2', rs: back, problem: false, links: { 'A|B|bus': link } }], QUAYS).segments[0].coords).toEqual([...road].reverse());
  });

  it('marks the main stops (bold in a timetable): the overview draws only those, small (user 2026-10-31)', () => {
    const r = rs([stop('A', { bold: true }), stop('B'), stop('C')], [['0700', '0710', '0720']]);
    expect(networkOf([{ code: '1', rs: r, problem: false }], QUAYS).stops.map((x) => [x.id, x.main])).toEqual([['A', true], ['B', false], ['C', false]]);
  });
});
