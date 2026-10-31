// Knutepunkt (interchanges spec 2026-10-31): a hub on its row (#KNP), a picked trip and its approved link on our cell
// at that row (#KNL). Kept in the line file so they move with rows and columns (user 2026-10-31).
import { describe, it, expect } from 'vitest';
import { serializeERN } from '../../../src/core/ern/serialize.js';
import { checkRouteFile } from '../../../src/core/integrity/check.js';
import { copiesAtInterval } from '../../../src/core/column-copy.js';
import { blockTrips } from '../../../src/core/blocks.js';
import { newHub, hubState, hubRows } from '../../../src/core/interchanges/hub.js';
import { miniErn, gridOf } from '../../fixtures/mini-line.js';

const OPTS = { delivery: { name: 'T', codespace: 'TST' }, orgs: [] };
const HUB = { stopId: 'NSR:Quay:2', stops: ['NSR:StopPlace:20', 'NSR:StopPlace:21'], radiusM: 200, window: [2, 15], maxWait: 5, walk: 3,
  criteria: { authority: ['TST:Authority:1'], operator: ['A:Operator:1', 'B:Operator:2'], mode: 'water', submode: 'highSpeedPassengerService', publicCode: '1101', calledAt: ['NSR:StopPlace:9'] } };
const LINK = { line: 'r2', trip: '5f0c2e1a-1111-4aaa-8bbb-000000000009', stopId: 'NSR:Quay:7', arr: 1441, at: '2026-10-31T20:00:00.000Z' };

describe('#KNP and #KNL', () => {
  it('round-trip through parse and serialize, lists and empty fields included', () => {
    const { rs, grid } = gridOf(miniErn());
    grid.stops[1].hub = structuredClone(HUB);
    grid.stops[2].hub = { ...newHub('NSR:Quay:3', new Map()) };
    grid.cols[0].cells[1].hubLink = { ...LINK };
    const text = serializeERN(rs, 'r', OPTS);
    expect(text).toContain('#KNP;1;NSR:Quay:2;NSR:StopPlace:20,NSR:StopPlace:21;200;2;15;5;3;TST:Authority:1;A:Operator:1,B:Operator:2;water;highSpeedPassengerService;1101;NSR:StopPlace:9');
    expect(text).toContain('#KNP;2;NSR:Quay:3;NSR:Quay:3;;2;15;5;0;;;;;;');
    expect(text).toContain(`#KNL;0;1;r2;${LINK.trip};NSR:Quay:7;1441;${LINK.at}`);
    const back = gridOf(text).grid;
    expect(back.stops[1].hub).toEqual(HUB);
    expect(back.stops[2].hub).toEqual(newHub('NSR:Quay:3', new Map()));
    expect(back.cols[0].cells[1].hubLink).toEqual(LINK);
    expect(serializeERN(gridOf(text).rs, 'r', OPTS)).toBe(text);
    expect(checkRouteFile(text)).toEqual({ status: 'ok', issues: [] });
  });

  it('a picked trip without a link round-trips as an empty #KNL', () => {
    const { rs, grid } = gridOf(miniErn());
    grid.stops[1].hub = newHub('NSR:Quay:2', new Map());
    grid.cols[2].cells[1].hubLink = {};
    const text = serializeERN(rs, 'r', OPTS);
    expect(text).toContain('#KNL;2;1;;;;;');
    expect(gridOf(text).grid.cols[2].cells[1].hubLink).toEqual({});
    expect(checkRouteFile(text).status).toBe('ok');
  });

  it('a file without them parses as before', () => {
    const text = miniErn();
    const { rs, grid } = gridOf(text);
    expect(grid.stops.some((/** @type {any} */ s) => 'hub' in s)).toBe(false);
    expect(serializeERN(rs, 'r', OPTS)).not.toMatch(/#KN[PL]/);
  });

  it('inserting a row above moves the hub with its row', () => {
    const { rs, grid } = gridOf(miniErn());
    grid.stops[1].hub = newHub('NSR:Quay:2', new Map());
    grid.cols[0].cells[1].hubLink = { ...LINK };
    grid.stops.splice(0, 0, { name: 'Ny', stopId: null, bold: false, sep: false, isDwellArr: false, price: null });
    for (const col of grid.cols) col.cells.splice(0, 0, null);
    const back = gridOf(serializeERN(rs, 'r', OPTS)).grid;
    expect(back.stops[2].hub?.stopId).toBe('NSR:Quay:2');
    expect(back.cols[0].cells[2].hubLink).toEqual(LINK);
  });

  it('a copied column has no hubLink; a block\'s generated trips have none', () => {
    const { grid } = gridOf(miniErn());
    grid.cols[0].cells[1].hubLink = { ...LINK };
    for (const copy of copiesAtInterval(grid.cols[0], 30, 8 * 60)) expect(copy.cells.every((/** @type {any} */ c) => !c?.hubLink)).toBe(true);
    const parent = { ...grid.cols[0], block: { every: 30, span: 120 } };
    for (const trip of blockTrips(parent)) expect(trip.cells.every((/** @type {any} */ c) => !c?.hubLink)).toBe(true);
  });
});

describe('hubState and hubRows', () => {
  it('hubState is lost when the row\'s stop was changed', () => {
    const { grid } = gridOf(miniErn());
    expect(hubState(grid, 1)).toBe('none');
    grid.stops[1].hub = newHub('NSR:Quay:2', new Map());
    expect(hubState(grid, 1)).toBe('ok');
    grid.stops[1].stopId = 'NSR:Quay:99';
    expect(hubState(grid, 1)).toBe('lost');
  });

  it('hubRows lists a dwell pair once, at its departure row', () => {
    const { grid } = gridOf(miniErn());
    grid.stops[0].stopId = null;
    grid.stops.splice(1, 0, { ...grid.stops[1], isDwellArr: true });
    expect(hubRows(grid)).toEqual([2, 3]);
  });

  it('newHub defaults to our quay\'s StopPlace when it is known', () => {
    const info = new Map([['NSR:Quay:2', { stopPlaceId: 'NSR:StopPlace:20' }]]);
    expect(newHub('NSR:Quay:2', info)).toEqual({ stopId: 'NSR:Quay:2', stops: ['NSR:StopPlace:20'], radiusM: null, window: [2, 15], maxWait: 5, walk: 0, criteria: {} });
  });
});
