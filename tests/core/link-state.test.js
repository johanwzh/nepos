import { describe, it, expect } from 'vitest';
import { quayMoved, isExportable } from '../../src/core/link-state.js';

const KEY = 'NSR:Quay:1|NSR:Quay:2|bus';
/** @param {string} status */
const saved = (status) => ({ polyline: '', precision: 6, distanceM: 600, status, from: /** @type {[number, number]} */ ([10.75, 59.91]), to: /** @type {[number, number]} */ ([10.76, 59.91]) });
const quays = (/** @type {number} */ toLon) => new Map([['NSR:Quay:1', { lon: 10.75, lat: 59.91 }], ['NSR:Quay:2', { lon: toLon, lat: 59.91 }]]);

describe('whether a saved link is exported', () => {
  it('a routed link whose Quays are where they were is exported', () => {
    expect(quayMoved(KEY, saved('OK'), quays(10.76))).toBe(false);
    expect(isExportable(KEY, saved('OK'), quays(10.76))).toBe(true);
  });

  it('a link with no route is not', () => {
    expect(isExportable(KEY, saved('NO_PATH'), quays(10.76))).toBe(false);
  });

  it('a Quay moved more than 5 m since routing makes it out of date; a few metres do not', () => {
    expect(quayMoved(KEY, saved('OK'), quays(10.7601))).toBe(true); // ~5.6 m east
    expect(quayMoved(KEY, saved('OK'), quays(10.76005))).toBe(false); // ~2.8 m
    expect(isExportable(KEY, saved('OK'), quays(10.7601))).toBe(false);
  });

  it('a Quay without a known position does not count as moved', () => {
    expect(quayMoved(KEY, saved('OK'), new Map([['NSR:Quay:2', { lat: null, lon: null }]]))).toBe(false);
  });
});
