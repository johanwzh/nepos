import { describe, it, expect } from 'vitest';
import { linkStatus, lineLinkSummary } from '../../src/core/link-status.js';

const KEY = 'NSR:Quay:1|NSR:Quay:2|bus';
const quays = new Map([['NSR:Quay:1', { lon: 10, lat: 59 }], ['NSR:Quay:2', { lon: 10.01, lat: 59 }], ['NSR:Quay:3', { lon: 10.02, lat: 59 }]]);
/** @returns {any} */
const saved = (from = [10, 59], to = [10.01, 59]) => ({ polyline: '', precision: 6, distanceM: 600, status: 'OK', from, to });

describe('link status (spec §6)', () => {
  it('no saved link: not routed', () => {
    expect(linkStatus(KEY, undefined, quays)).toBe('not-routed');
  });

  it('a Quay moved 6 m since: out of date', () => {
    expect(linkStatus(KEY, saved([10, 59 - 6 / 111195]), quays)).toBe('out-of-date');
  });

  it('else routed (a move under 5 m does not count)', () => {
    expect(linkStatus(KEY, saved(), quays)).toBe('routed');
    expect(linkStatus(KEY, saved([10, 59 - 4 / 111195]), quays)).toBe('routed');
  });
});

describe('a line\'s routing summary', () => {
  const stop = (/** @type {string} */ id) => ({ name: id, stopId: id, bold: false, sep: false, isDwellArr: false, price: null });
  const cell = (/** @type {string} */ time) => ({ time, dayOffset: 0, suffix: '', interchange: null });
  const rs = { mode: 'bus', submode: 'localBus', tableSets: [{ id: 0, name: 'T' }], periods: [{ id: 0, setId: 0, calendarIds: ['c'] }],
    grids: { '0:0': { stops: ['NSR:Quay:1', 'NSR:Quay:2', 'NSR:Quay:3'].map(stop), cols: [{ dayCode: 'D', cells: ['0700', '0710', '0720'].map(cell) }] } } };
  const calendars = [{ id: 'c', name: 'Jan', ranges: /** @type {[string, string][]} */ ([['20260101', '20260131']]) }];

  it('counts the pairs by status', () => {
    expect(lineLinkSummary(rs, undefined, { calendars, quayInfo: quays })).toEqual({ pairs: 2, routed: 0, notRouted: 2, outOfDate: 0 });
    /** @type {any} */
    const ll = { version: 1, line: 'L', snaps: {}, links: { [KEY]: saved(), 'NSR:Quay:2|NSR:Quay:3|bus': saved([10.01, 59], [10.03, 59]) } };
    expect(lineLinkSummary(rs, ll, { calendars, quayInfo: quays })).toEqual({ pairs: 2, routed: 1, notRouted: 0, outOfDate: 1 });
  });
});
