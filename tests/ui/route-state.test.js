import { describe, it, expect } from 'vitest';
import { newRouteState, fillMissingPeriod, addPeriod, deletePeriod, addDirection, deleteDirection, periodHasData, directionHasData, gridKey } from '../../src/ui/route-state.js';

const stop = (name) => ({ name, stopId: null, bold: false, sep: false, isDwellArr: false, price: null });

describe('route state', () => {
  it('starts a new route without a transport mode, with one period and one direction', () => {
    const rs = newRouteState('no');
    expect([rs.mode, rs.submode, rs.transportMode]).toEqual(['', '', 0]);
    expect(rs.periods).toEqual([{ id: 1, name: 'Periode 1', from: '', to: '', from2: '', to2: '' }]);
    expect(rs.directions).toEqual([{ id: 2, name: 'Tur' }]);
    expect(gridKey(rs)).toBe('1:2');
    expect(newRouteState('en').periods[0].name).toBe('Period 1');
  });

  it('gives a route without periods a default period, keeping its other data', () => {
    const rs = { ...newRouteState('no'), routeName: 'X', periods: [], directions: [], grids: {}, activePer: null, activeDir: null, nextId: 5 };
    fillMissingPeriod(rs, 'no');
    expect(rs.routeName).toBe('X');
    expect(rs.periods).toHaveLength(1);
    expect(rs.directions).toHaveLength(1);
    expect(rs.grids[gridKey(rs)]).toEqual({ stops: [], cols: [] });
    expect(rs.nextId).toBeGreaterThan(Math.max(rs.activePer, rs.activeDir));
  });

  it('adds a period, optionally copying the trips of the active one', () => {
    const rs = newRouteState('no');
    rs.grids['1:2'].stops.push(stop('A'));
    const copied = addPeriod(rs, 'Sommer', true);
    expect(rs.grids[`${copied}:2`].stops.map((s) => s.name)).toEqual(['A']);
    const empty = addPeriod(rs, 'Høst', false);
    expect(rs.grids[`${empty}:2`]).toEqual({ stops: [], cols: [] });
  });

  it('never deletes the last period or direction', () => {
    const rs = newRouteState('no');
    expect(deletePeriod(rs)).toBe(false);
    expect(deleteDirection(rs)).toBe(false);
  });

  it('deletes the active period and moves to the first remaining one', () => {
    const rs = newRouteState('no');
    const p2 = addPeriod(rs, 'Sommer', false);
    rs.activePer = p2;
    expect(deletePeriod(rs)).toBe(true);
    expect(rs.periods.map((p) => p.id)).toEqual([1]);
    expect(rs.activePer).toBe(1);
    expect(rs.grids[`${p2}:2`]).toBeUndefined();
  });

  it('adds a return direction with the stops reversed', () => {
    const rs = newRouteState('no');
    rs.grids['1:2'].stops.push(stop('A'), stop('B'));
    const ret = addDirection(rs, 'Retur', true);
    expect(rs.grids[`1:${ret}`].stops.map((s) => s.name)).toEqual(['B', 'A']);
    expect(rs.grids[`1:${ret}`].cols).toEqual([]);
  });

  it('tells whether a period or direction has data', () => {
    const rs = newRouteState('no');
    expect(periodHasData(rs, 1)).toBe(false);
    rs.grids['1:2'].stops.push(stop('A'));
    expect(periodHasData(rs, 1)).toBe(true);
    expect(directionHasData(rs, 2)).toBe(true);
  });
});

describe('column IDs', () => {
  it('gives the trips of a copied period their own IDs', () => {
    const rs = newRouteState('no');
    rs.grids['1:2'].cols = [{ dayCode: 'D', uid: 'aaaaaaaa-0000-4000-8000-000000000001', footnote: '', footnoteId: null, cells: [] }];
    const id = addPeriod(rs, 'Sommer', true);
    const copied = rs.grids[`${id}:2`].cols[0].uid;
    expect(copied).not.toBe('aaaaaaaa-0000-4000-8000-000000000001');
    expect(copied).toMatch(/^[0-9a-f-]{36}$/);
  });
});
