// Knutepunkt's approval round (interchanges spec 2026-10-31): per picked trip, what Finn treff proposes against what
// was approved before, and what Godkjenn writes.
import { describe, it, expect } from 'vitest';
import { proposals, approve } from '../../../src/core/interchanges/proposals.js';
import { newHub } from '../../../src/core/interchanges/hub.js';

const stop = (/** @type {string} */ name, /** @type {string} */ stopId) => ({ name, stopId, bold: false, sep: false, isDwellArr: false, price: null });
const cell = (/** @type {string} */ time) => (time ? { time, dayOffset: 0, suffix: '', interchange: null } : null);
const CAL = [{ id: 'c', name: 'Jan', ranges: /** @type {[string, string][]} */ ([['20260105', '20260111']]) }];
const QI = new Map([['NSR:Quay:2', { stopPlaceId: 'NSR:StopPlace:2', lat: 61, lon: 10 }]]);
const U = (/** @type {number} */ i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const line = (/** @type {any[]} */ stops, /** @type {any[]} */ cols) => ({ mode: 'bus', submode: 'localBus', publicCode: '', sek: [],
  tableSets: [{ id: 1, name: 'T' }], periods: [{ id: 0, setId: 1, calendarIds: ['c'] }], grids: { '0:1': { stops, cols } } });
const col = (/** @type {number} */ i, /** @type {string[]} */ times) => ({ dayCode: 'D', uid: U(i), cells: times.map(cell) });
const NOW = new Date('2026-10-31T20:00:00Z');

/** Our line: trips leaving the hub (row 0) at the given times, picked, with the given links; feeders arriving at the hub. */
function setup(/** @type {string[]} */ deps, /** @type {Record<number, any>} */ links, /** @type {Record<string, string[]>} */ feeders) {
  const stops = [stop('Hub', 'NSR:Quay:2'), stop('C', 'NSR:Quay:3')];
  stops[0] = { ...stops[0], hub: newHub('NSR:Quay:2', QI) };
  const cols = deps.map((d, i) => col(i + 1, [d, '1100']));
  cols.forEach((c, i) => { /** @type {any} */ (c.cells[0]).hubLink = links[i] ?? {}; });
  const ours = line(stops, cols);
  let k = 100;
  const lines = [{ code: 'OUR', rs: ours }, ...Object.entries(feeders).map(([code, arrs]) => ({ code, rs: line([stop('A', 'NSR:Quay:1'), stop('Hub', 'NSR:Quay:2')], arrs.map((a) => col(++k, ['0900', a]))) }))];
  const grid = ours.grids['0:1'];
  return { grid, lines, props: proposals(grid, 0, lines, { calendars: CAL, quayInfo: QI, ownCode: 'OUR' }) };
}
const link = (/** @type {string} */ line, /** @type {number} */ trip, /** @type {number} */ arr) => ({ line, trip: U(trip), stopId: 'NSR:Quay:2', arr, at: '2026-10-30T10:00:00.000Z' });

describe('proposals', () => {
  it('one per picked trip, in departure order, with its state', () => {
    const { props } = setup(['1030', '1000'], {}, { F: ['0952'] });
    expect(props.map((p) => [p.trip, p.dep, p.state])).toEqual([[U(2), 600, 'new'], [U(1), 630, 'none']]);
  });

  it('new: one candidate, nothing approved', () => {
    const { props } = setup(['1000'], {}, { F: ['0952'] });
    expect(props[0]).toMatchObject({ state: 'new', pick: { line: 'F', trip: U(101), arr: 592, transfer: 8 } });
  });

  it('same: the approved trip still arrives at the same time, even beside another candidate', () => {
    const { props } = setup(['1000'], { 0: link('F', 101, 592) }, { F: ['0952', '0950'] });
    expect(props[0]).toMatchObject({ state: 'same', pick: { trip: U(101) } });
  });

  it('changed: the approved trip arrives at another time', () => {
    const { props } = setup(['1000'], { 0: link('F', 101, 590) }, { F: ['0952'] });
    expect(props[0]).toMatchObject({ state: 'changed', pick: { trip: U(101), arr: 592 } });
  });

  it('changed: the approved trip is gone and one candidate is left', () => {
    const { props } = setup(['1000'], { 0: link('F', 999, 592) }, { F: ['0952'] });
    expect(props[0]).toMatchObject({ state: 'changed', pick: { trip: U(101) } });
  });

  it('gone: approved, and nothing matches any more', () => {
    const { props } = setup(['1000'], { 0: link('F', 101, 592) }, { F: ['0930'] });
    expect(props[0]).toMatchObject({ state: 'gone', pick: null, candidates: [] });
  });

  it('pick: two candidates and nothing decided', () => {
    const { props } = setup(['1000'], {}, { F: ['0952'], G: ['0950'] });
    expect(props[0].state).toBe('pick');
    expect(props[0].pick).toBeNull();
    expect(props[0].candidates.map((c) => c.line)).toEqual(['F', 'G']);
  });

  it('none: no candidates, nothing approved', () => {
    const { props } = setup(['1000'], {}, { F: ['0930'] });
    expect(props[0]).toMatchObject({ state: 'none', pick: null });
  });

  it('lost: the hub row\'s stop was changed', () => {
    const { grid, lines } = setup(['1000'], { 0: link('F', 101, 592) }, { F: ['0952'] });
    grid.stops[0].stopId = 'NSR:Quay:9';
    expect(proposals(grid, 0, lines, { calendars: CAL, quayInfo: QI, ownCode: 'OUR' })[0].state).toBe('lost');
  });
});

describe('approve', () => {
  it('writes new and changed, clears gone and lost, keeps same', () => {
    const a = setup(['1000', '1030', '1100'], { 1: link('F', 102, 618), 2: link('F', 777, 650) }, { F: ['0952', '1022'] });
    expect(a.props.map((p) => p.state)).toEqual(['new', 'changed', 'gone']);
    const out = approve(a.props, {}, NOW);
    expect(out[U(1)]).toEqual({ line: 'F', trip: U(101), stopId: 'NSR:Quay:2', arr: 592, at: NOW.toISOString() });
    expect(out[U(2)]).toEqual({ line: 'F', trip: U(102), stopId: 'NSR:Quay:2', arr: 622, at: NOW.toISOString() });
    expect(out[U(3)]).toEqual({});
    const same = setup(['1000'], { 0: link('F', 101, 592) }, { F: ['0952'] });
    expect(approve(same.props, {}, NOW)[U(1)]).toEqual(link('F', 101, 592));
  });

  it('a pick needs a choice; with one it is written', () => {
    const { props } = setup(['1000'], {}, { F: ['0952'], G: ['0950'] });
    expect(approve(props, {}, NOW)[U(1)]).toEqual({});
    expect(approve(props, { [U(1)]: 1 }, NOW)[U(1)]).toMatchObject({ line: 'G', arr: 590 });
  });

  it('an unchosen pick is left as it was', () => {
    const { props } = setup(['1000'], { 0: link('H', 5, 580) }, { F: ['0952'], G: ['0950'] });
    expect(props[0].state).toBe('pick');
    expect(approve(props, {}, NOW)[U(1)]).toEqual(link('H', 5, 580));
  });
});
