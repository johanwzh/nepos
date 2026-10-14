import { describe, it, expect } from 'vitest';
import { tripOnMap } from '../../src/core/map-model.js';

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
        { name: 'A', time: '0700', stopId: 'NSR:Quay:1', lat: 60, lon: 10 },
        { name: 'B', time: '0720', stopId: 'NSR:Quay:3', lat: 60.1, lon: 10.1 },
      ],
      missing: ['Uten ID', 'Ukjent'],
    });
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
