import { describe, it, expect } from 'vitest';
import { linkPairs, tripLinks } from '../../src/core/link-pairs.js';

const stop = (/** @type {string} */ name, /** @type {string | null} */ stopId, extra = {}) => ({ name, stopId, bold: false, sep: false, isDwellArr: false, price: null, ...extra });
const cell = (/** @type {string} */ time, extra = {}) => ({ time, dayOffset: 0, suffix: '', interchange: null, ...extra });
const CAL = [{ id: 'c', name: 'Jan', ranges: /** @type {[string, string][]} */ ([['20260101', '20260131']]) }];
const pos = (/** @type {string[]} */ ids) => new Map(ids.map((id, i) => [id, { lat: 59.9 + i * 0.01, lon: 10.7 }]));
const QUAYS = pos(['NSR:Quay:1', 'NSR:Quay:2', 'NSR:Quay:3']);
const STOPS = [stop('A', 'NSR:Quay:1'), stop('B', 'NSR:Quay:2'), stop('C', 'NSR:Quay:3')];
/** A bus line with one table set and one period, and these columns. */
const line = (/** @type {any[]} */ cols, stops = STOPS, mode = 'bus') => ({ mode, submode: 'localBus', tableSets: [{ id: 0, name: 'T' }],
  periods: [{ id: 0, setId: 0, calendarIds: ['c'] }], grids: { '0:0': { stops, cols } } });
const keys = (/** @type {any} */ rs, quays = QUAYS) => linkPairs(rs, { calendars: CAL, quayInfo: quays }).map((p) => p.key);

describe('the stop pairs a line needs (design §1, §10)', () => {
  it('a trip A–B–C needs A→B and B→C', () => {
    expect(keys(line([{ dayCode: 'D', cells: [cell('0700'), cell('0710'), cell('0720')] }]))).toEqual(['NSR:Quay:1|NSR:Quay:2|bus', 'NSR:Quay:2|NSR:Quay:3|bus']);
  });

  it('a trip that skips B needs A→C', () => {
    expect(keys(line([{ dayCode: 'D', cells: [cell('0700'), cell(''), cell('0720')] }]))).toEqual(['NSR:Quay:1|NSR:Quay:3|bus']);
  });

  it('two trips with the same stops give each pair once', () => {
    const c = () => ({ dayCode: 'D', cells: [cell('0700'), cell('0710'), cell('0720')] });
    expect(keys(line([c(), c()]))).toHaveLength(2);
  });

  it('a "doesn\'t run" date on B adds the pattern without B: A→C as well', () => {
    const off = cell('0710', { dates: [{ from: '20260105', to: '20260105', on: false }] });
    expect(keys(line([{ dayCode: 'D', cells: [cell('0700'), off, cell('0720')] }])).sort()).toEqual(
      ['NSR:Quay:1|NSR:Quay:2|bus', 'NSR:Quay:1|NSR:Quay:3|bus', 'NSR:Quay:2|NSR:Quay:3|bus']);
  });

  it('skips a stop with an old numeric ID or no NSR position, and keeps the rest', () => {
    const stops = [stop('A', 'NSR:Quay:1'), stop('B', '104'), stop('C', 'NSR:Quay:3'), stop('D', 'NSR:Quay:2'), stop('E', 'NSR:Quay:9')];
    const rs = line([{ dayCode: 'D', cells: [cell('0700'), cell('0710'), cell('0720'), cell('0730'), cell('0740')] }], stops);
    // The export's pattern is A, 104, C, D, E: the pairs touching 104 (not an NSR Quay) or E (no position) are skipped
    expect(keys(rs)).toEqual(['NSR:Quay:3|NSR:Quay:2|bus']);
  });

  it('a mode without a routing profile needs no links', () => {
    expect(keys(line([{ dayCode: 'D', cells: [cell('0700'), cell('0710')] }], STOPS, 'air'))).toEqual([]);
  });

  it('a dwell (arrival and departure at one stop) is no pair', () => {
    const stops = [stop('A', 'NSR:Quay:1'), stop('B', 'NSR:Quay:2', { isDwellArr: true }), stop('B', 'NSR:Quay:2'), stop('C', 'NSR:Quay:3')];
    const rs = line([{ dayCode: 'D', cells: [cell('0700'), cell('0710'), cell('0712'), cell('0720')] }], stops);
    expect(keys(rs)).toEqual(['NSR:Quay:1|NSR:Quay:2|bus', 'NSR:Quay:2|NSR:Quay:3|bus']);
  });

  it('gives each link of one trip with its rows, for drawing', () => {
    const grid = { stops: STOPS, cols: [{ dayCode: 'D', cells: [cell('0700'), cell(''), cell('0720')] }] };
    expect(tripLinks(grid, grid.cols[0], 'bus')).toEqual([{ key: 'NSR:Quay:1|NSR:Quay:3|bus', fromRi: 0, toRi: 2 }]);
  });
});
