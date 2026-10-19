import { describe, it, expect } from 'vitest';
import { newRouteState, fillMissingPeriod, addPeriod, deletePeriod, addTableSet, deleteTableSet, periodHasData, tableSetHasData, gridKey, periodsOf, gridOf } from '../../src/ui/route-state.js';

describe('route state', () => {
  it('starts a new route without a mode, with one table set and one period', () => {
    const rs = newRouteState('no');
    expect([rs.mode, rs.transportMode]).toEqual(['', 0]);
    expect(rs.tableSets).toEqual([{ id: 1, name: '', uid: null }]);
    expect(rs.periods).toEqual([{ id: 2, setId: 1, calendarIds: [] }]);
    expect(gridKey(rs)).toBe('2:1');
    // a new line starts with a small grid to type into: 3 stops by 3 trips (user test 2026-10-16)
    expect(rs.grids['2:1'].stops).toHaveLength(3);
    expect(rs.grids['2:1'].stops.every((/** @type {any} */ s) => s.stopId === null && s.name === '')).toBe(true);
    expect(rs.grids['2:1'].cols).toHaveLength(3);
    expect(rs.grids['2:1'].cols.map((/** @type {any} */ c) => c.cells)).toEqual([[null, null, null], [null, null, null], [null, null, null]]);
    expect(new Set(rs.grids['2:1'].cols.map((/** @type {any} */ c) => c.uid)).size).toBe(3);
  });

  it('adds a period to the active set, copying calendars and (optionally) trips with new IDs', () => {
    const rs = newRouteState('no');
    rs.periods[0].calendarIds = ['c1'];
    rs.grids['2:1'].cols = [{ dayCode: 'D', uid: 'aaaaaaaa-0000-4000-8000-000000000001', footnote: '', footnoteId: null, cells: [] }];
    const id = addPeriod(rs, true);
    const per = /** @type {any} */ (rs.periods.find((p) => p.id === id));
    expect(per).toEqual({ id, setId: 1, calendarIds: ['c1'] });
    expect(gridOf(rs, per).cols[0].uid).not.toBe('aaaaaaaa-0000-4000-8000-000000000001');
    const id2 = addPeriod(rs, false);
    expect(gridOf(rs, /** @type {any} */ (rs.periods.find((p) => p.id === id2))).cols).toEqual([]);
  });

  it('refuses to delete the last period of a set, and deletes another', () => {
    const rs = newRouteState('no');
    expect(deletePeriod(rs)).toBe(false);
    addPeriod(rs, false);
    rs.activePer = rs.periods[1].id;
    expect(deletePeriod(rs)).toBe(true);
    expect(rs.periods).toHaveLength(1);
    expect(rs.activePer).toBe(rs.periods[0].id);
  });

  it('adds a table set copying periods, calendars and stops (reversed), without trips', () => {
    const rs = newRouteState('no');
    rs.tableSets[0].name = 'Bergen - Oslo';
    rs.periods[0].calendarIds = ['c1'];
    rs.grids['2:1'] = { stops: [{ name: 'A' }, { name: 'B' }], cols: [{ dayCode: 'D', uid: null, footnote: '', footnoteId: null, cells: [null, null] }] };
    const setId = addTableSet(rs, 'Oslo - Bergen', { reversed: true });
    expect(rs.tableSets.map((s) => s.name)).toEqual(['Bergen - Oslo', 'Oslo - Bergen']);
    expect(rs.tableSets[1].uid).toMatch(/^[0-9a-f-]{36}$/);
    const [per] = periodsOf(rs, setId);
    expect(per.calendarIds).toEqual(['c1']);
    expect(gridOf(rs, per)).toEqual({ stops: [{ name: 'B', sep: false, isDwellArr: false }, { name: 'A', sep: false, isDwellArr: false }], cols: [] });
    expect([rs.activeSet, rs.activePer]).toEqual([setId, per.id]);
  });

  it('refuses to delete the last table set; deleting one removes its periods and grids', () => {
    const rs = newRouteState('no');
    expect(deleteTableSet(rs)).toBe(false);
    const setId = addTableSet(rs, 'B', { reversed: false });
    const perId = periodsOf(rs, setId)[0].id;
    expect(deleteTableSet(rs)).toBe(true);
    expect(rs.tableSets).toHaveLength(1);
    expect(rs.periods.some((p) => p.id === perId)).toBe(false);
    expect(Object.keys(rs.grids)).toEqual(['2:1']);
  });

  it('knows when a period or set holds data, and fills in a missing set and period', () => {
    const rs = newRouteState('no');
    expect(periodHasData(rs, 2)).toBe(false);
    rs.grids['2:1'].stops = [{ name: 'A' }];
    expect(periodHasData(rs, 2)).toBe(true);
    expect(tableSetHasData(rs, 1)).toBe(true);
    const empty = { ...newRouteState('no'), tableSets: [], periods: [], grids: {}, nextId: 5 };
    fillMissingPeriod(empty);
    expect(empty.tableSets).toHaveLength(1);
    expect(empty.periods).toHaveLength(1);
    expect(empty.grids[gridKey(empty)]).toEqual({ stops: [], cols: [] });
  });
});

describe('reversing keeps the divider between the same two stops (48)', () => {
  it('Oslo / Lillestrøm --- Lillestrøm / Fetsund reversed: Fetsund / Lillestrøm --- Lillestrøm / Oslo', () => {
    const rs = newRouteState('no');
    const st = (/** @type {string} */ name, sep = false, isDwellArr = false) => ({ name, stopId: null, bold: false, sep, isDwellArr, price: null });
    const g = rs.grids[`${rs.activePer}:${rs.activeSet}`];
    g.stops = [st('Oslo'), st('Lillestrøm', true), st('Lillestrøm'), st('Fetsund')];
    const setId = addTableSet(rs, 'Retur', { reversed: true });
    const back = rs.grids[`${rs.activePer}:${setId}`].stops;
    expect(back.map((/** @type {any} */ s) => s.name)).toEqual(['Fetsund', 'Lillestrøm', 'Lillestrøm', 'Oslo']);
    expect(back.map((/** @type {any} */ s) => s.sep)).toEqual([false, true, false, false]);
  });

  it('keeps a waiting stop\'s two rows together: the arrival mark moves to the new first row of the pair', () => {
    const rs = newRouteState('no');
    const st = (/** @type {string} */ name, isDwellArr = false) => ({ name, stopId: null, bold: false, sep: false, isDwellArr, price: null });
    rs.grids[`${rs.activePer}:${rs.activeSet}`].stops = [st('A'), st('B', true), st('B'), st('C')];
    const setId = addTableSet(rs, 'Retur', { reversed: true });
    expect(rs.grids[`${rs.activePer}:${setId}`].stops.map((/** @type {any} */ s) => s.isDwellArr)).toEqual([false, true, false, false]);
  });
});
