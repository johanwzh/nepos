// Analyse (spec 2026-10-31): one fact per trip as the export writes it — its days, times, legs and known km, its
// stops, and what its vehicle and bookings say. The receipt is built from these.
import { describe, it, expect } from 'vitest';
import { lineFacts } from '../../src/core/analysis/facts.js';

const stop = (/** @type {string} */ name, /** @type {string | null} */ stopId, extra = {}) => ({ name, stopId, bold: false, sep: false, isDwellArr: false, price: null, ...extra });
const cell = (/** @type {string} */ time, extra = {}) => ({ time, dayOffset: 0, suffix: '', interchange: null, ...extra });
const CAL = [{ id: 'c', name: 'Jan', ranges: /** @type {[string, string][]} */ ([['20260101', '20260131']]) }];
const Q = (/** @type {number} */ i) => `NSR:Quay:${i}`;
const QUAYS = new Map([1, 2, 3].map((i) => [Q(i), { lat: 59.9 + i * 0.01, lon: 10.7, stopPlaceId: `NSR:StopPlace:${i}` }]));
const STOPS = [stop('A', Q(1)), stop('B', Q(2)), stop('C', Q(3))];
const line = (/** @type {any[]} */ cols, extra = {}) => ({ mode: 'bus', submode: 'localBus', tableSets: [{ id: 0, name: 'T' }],
  periods: [{ id: 0, setId: 0, calendarIds: ['c'] }], grids: { '0:0': { stops: STOPS, cols } }, ...extra });
const trip = (/** @type {string[]} */ t, extra = {}) => ({ dayCode: 'D', uid: '5f0c2e1a-1111-4aaa-8bbb-00000000000a', cells: t.map((x) => cell(x)), ...extra });
const link = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ m, extra = {}) => [`${Q(a)}|${Q(b)}|bus`,
  { distanceM: m, seconds: 60, status: 'OK', from: [10.7, 59.9 + a * 0.01], to: [10.7, 59.9 + b * 0.01], ...extra }];
const facts = (/** @type {any} */ rs, { links = {}, vehicles = /** @type {any[]} */ ([]) } = {}) => lineFacts('L1', rs, { calendars: CAL, quayInfo: QUAYS, links, vehicles });

describe('trip facts', () => {
  it('one trip A–B–C on 31 days: times, running minutes, stop places', () => {
    const [f] = facts(line([trip(['0700', '0710', '0720'])]));
    expect(f).toMatchObject({ line: 'L1', mode: 'bus', profile: 'bus', start: 420, end: 440, runMin: 20 });
    expect(f.days).toHaveLength(31);
    expect(f.calls.map((c) => c.stopId)).toEqual([Q(1), Q(2), Q(3)]);
    expect(f.stopPlaces).toHaveLength(3);
  });

  it('km is known only when every leg is routed and not moved', () => {
    const rs = line([trip(['0700', '0710', '0720'])]);
    expect(facts(rs, { links: Object.fromEntries([link(1, 2, 1000), link(2, 3, 2500)]) })[0].km).toBe(3.5);
    const half = facts(rs, { links: Object.fromEntries([link(1, 2, 1000)]) })[0];
    expect(half.km).toBeNull();
    expect(half.legs[0].km).toBe(1);
    const failed = facts(rs, { links: Object.fromEntries([link(1, 2, 1000), link(2, 3, 2500, { status: 'FAILED' })]) })[0];
    expect(failed.km).toBeNull();
    expect(failed.legs[1].km).toBeNull();
  });

  it('a clock wrapping past midnight without a day offset still runs forwards', () => {
    const [f] = facts(line([trip(['2350', '0000', '0010'])]));
    expect(f.runMin).toBe(20);
    expect(f.end).toBe(1450);
  });

  it('a "doesn\'t run" date splits the trip into variants, each with its own days', () => {
    const t = trip(['0700', '0710', '0720']);
    t.cells[1] = cell('0710', { dates: [{ from: '20260105', to: '20260105', on: false }] });
    const fs = facts(line([t]));
    expect(fs.map((f) => [f.days.length, f.calls.length])).toEqual([[30, 3], [1, 2]]);
    expect(fs[1].days).toEqual(['20260105']);
  });

  it('vehicle, fuel, seats, low floor and booking come from the column', () => {
    const vehicles = [{ id: 'v', name: 'E1', colour: '', shortCode: '', transportMode: 'bus', fuelType: 'battery', lowFloor: true, seats: 40, length: null, width: null, height: null }];
    expect(facts(line([trip(['0700', '0710', '0720'], { vehicle: 'E1' })]), { vehicles })[0]).toMatchObject({ fuel: 'battery', seats: 40, lowFloor: true, booked: false });
    expect(facts(line([trip(['0700', '0710', '0720'], { vehicle: 'X9' })]), { vehicles })[0]).toMatchObject({ fuel: '', seats: null, lowFloor: false });
    expect(facts(line([trip(['0700', '0710', '0720'], { booking: { phone: '1' } })]))[0].booked).toBe(true);
    const onStop = trip(['0700', '0710', '0720']);
    onStop.cells[1] = cell('0710', { booking: { phone: '1' } });
    expect(facts(line([onStop]))[0].booked).toBe(true);
    expect(facts(line([trip(['0700', '0710', '0720'])], { booking: { phone: '1' } }))[0].booked).toBe(true);
  });

  it('a block-generated trip is counted with its parent\'s vehicle', () => {
    const vehicles = [{ id: 'v', name: 'E1', colour: '', shortCode: '', transportMode: 'bus', fuelType: 'battery', lowFloor: false, seats: 40, length: null, width: null, height: null }];
    const fs = facts(line([trip(['0605', '0615', '0625'], { vehicle: 'E1', block: { every: 60, span: 120 } })]), { vehicles });
    expect(fs).toHaveLength(3);
    expect(fs.every((f) => f.fuel === 'battery')).toBe(true);
    expect(fs.map((f) => f.start)).toEqual([365, 425, 485]);
  });

  it('a line with no transport mode: mode "" and no profile, every leg unknown', () => {
    const [f] = facts(line([trip(['0700', '0710', '0720'])], { mode: '', submode: '', transportMode: 0 }), { links: Object.fromEntries([link(1, 2, 1000), link(2, 3, 2500)]) });
    expect(f.mode).toBe('');
    expect(f.profile).toBeNull();
    expect(f.legs.every((l) => l.km === null)).toBe(true);
    expect(f.km).toBeNull();
  });

  it('a waiting stop is one call, arriving before it leaves', () => {
    const stops = [stop('A', Q(1)), stop('B', Q(2), { isDwellArr: true }), stop('B', Q(2)), stop('C', Q(3))];
    const rs = { ...line([]), grids: { '0:0': { stops, cols: [trip(['0700', '0708', '0712', '0720'])] } } };
    const [f] = facts(rs);
    expect(f.calls).toEqual([{ stopId: Q(1), arr: 420, dep: 420 }, { stopId: Q(2), arr: 428, dep: 432 }, { stopId: Q(3), arr: 440, dep: 440 }]);
  });

  it('a trip with no days gives no fact', () => {
    expect(facts(line([trip(['0700', '0710', '0720'], { dayCode: '' })]))).toEqual([]);
  });
});
