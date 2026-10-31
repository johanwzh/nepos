// Knutepunkt (interchanges spec 2026-10-31): our trips at a hub, and the feeders from other lines that arrive in the
// window before our departure and meet the criteria.
import { describe, it, expect } from 'vitest';
import { lineTrips } from '../../../src/core/interchanges/trips.js';
import { candidates } from '../../../src/core/interchanges/match.js';
import { newHub } from '../../../src/core/interchanges/hub.js';

const stop = (/** @type {string} */ name, /** @type {string | null} */ stopId, extra = {}) => ({ name, stopId, bold: false, sep: false, isDwellArr: false, price: null, ...extra });
const cell = (/** @type {string} */ time, extra = {}) => (time ? { time, dayOffset: 0, suffix: '', interchange: null, ...extra } : null);
const CAL = [{ id: 'c', name: 'Jan', ranges: /** @type {[string, string][]} */ ([['20260105', '20260111']]) }]; // Mon 5 – Sun 11 Jan
const QI = new Map(/** @type {[string, any][]} */ ([
  ['NSR:Quay:1', { stopPlaceId: 'NSR:StopPlace:1', lat: 60.00, lon: 10.00 }],
  ['NSR:Quay:2', { stopPlaceId: 'NSR:StopPlace:2', lat: 61.00, lon: 10.00 }],   // the hub
  ['NSR:Quay:22', { stopPlaceId: 'NSR:StopPlace:2', lat: 61.0005, lon: 10.00 }], // another quay of the hub's StopPlace
  ['NSR:Quay:23', { stopPlaceId: 'NSR:StopPlace:23', lat: 61.001, lon: 10.00 }], // ~110 m away, another StopPlace
  ['NSR:Quay:3', { stopPlaceId: 'NSR:StopPlace:3', lat: 62.00, lon: 10.00 }],
  ['NSR:Quay:9', { stopPlaceId: 'NSR:StopPlace:9', lat: 59.00, lon: 10.00 }],
]));
let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
/** A trip: times per row ('' = no call), day code D (every day) unless given. */
const col = (/** @type {string[]} */ times, extra = {}) => ({ dayCode: 'D', uid: uid(), cells: times.map((t) => cell(t)), ...extra });
/** A line with one table set and one period. */
const line = (/** @type {any[]} */ stops, /** @type {any[]} */ cols, extra = {}) => ({ mode: 'bus', submode: 'localBus', publicCode: '', sek: [],
  tableSets: [{ id: 1, name: 'T', uid: '11111111-0000-4000-8000-000000000001' }], periods: [{ id: 0, setId: 1, calendarIds: ['c'] }], grids: { '0:1': { stops, cols } }, ...extra });

const OUR_STOPS = [stop('Hub', 'NSR:Quay:2'), stop('C', 'NSR:Quay:3')];
const FEED_STOPS = [stop('A', 'NSR:Quay:1'), stop('Hub', 'NSR:Quay:2')];
const ctx = { calendars: CAL, quayInfo: QI, ownCode: 'OUR' };
const hub = (extra = {}) => ({ ...newHub('NSR:Quay:2', QI), ...extra });
/** Our line with one trip leaving the hub at `dep`, and the feeders' lines; the candidates for that trip. */
function find(/** @type {string} */ dep, /** @type {{ code: string, rs: any }[]} */ feeders, h = hub(), ourCol = col([dep, '1100'])) {
  const ours = line(OUR_STOPS, [ourCol]);
  const trip = lineTrips(ours, { calendars: CAL }).find((t) => t.uid === ourCol.uid);
  return candidates(h, 0, trip, [{ code: 'OUR', rs: ours }, ...feeders], ctx);
}
const feeder = (/** @type {string} */ arr, extra = {}, stops = FEED_STOPS) => ({ code: 'F', rs: line(stops, [col(['0900', arr])], extra) });

describe('lineTrips', () => {
  it('gives each variant its own calls and the column\'s own uid', () => {
    const off = { time: '0910', dayOffset: 0, suffix: '', interchange: null, dates: [{ from: '20260107', to: '20260107', on: false }] };
    const c = { dayCode: 'D', uid: uid(), cells: [cell('0900'), off, cell('0920')] };
    const trips = lineTrips(line([stop('A', 'NSR:Quay:1'), stop('B', 'NSR:Quay:2'), stop('C', 'NSR:Quay:3')], [c]), { calendars: CAL });
    expect(trips.map((t) => [t.uid, t.calls.map((x) => x.ri), t.days.length])).toEqual([[c.uid, [0, 1, 2], 6], [c.uid, [0, 2], 1]]);
    expect(trips[0]).toMatchObject({ set: '11111111-0000-4000-8000-000000000001', setId: 1, block: false });
    expect(trips[0].calls[1]).toEqual({ ri: 1, stopId: 'NSR:Quay:2', arr: 550, dep: 550, board: true, alight: true });
  });
});

describe('candidates', () => {
  it('a feeder arriving in the window is a candidate, with its transfer in minutes', () => {
    const got = find('1000', [feeder('0952', { publicCode: '7' })]);
    expect(got).toEqual([{ line: 'F', trip: expect.any(String), stopId: 'NSR:Quay:2', arr: 592, transfer: 8, commonDays: 7, publicCode: '7', mode: 'bus' }]);
  });

  it('a feeder outside the window, or under the walk time, is not', () => {
    expect(find('1000', [feeder('0944')])).toEqual([]); // 16 minutes
    expect(find('1000', [feeder('0959')])).toEqual([]); // 1 minute
    expect(find('1000', [feeder('0957')], hub({ walk: 4 }))).toEqual([]);
    expect(find('1000', [feeder('0956')], hub({ walk: 4 }))).toHaveLength(1);
  });

  it('past midnight: 23:55 arrival, 00:05 (+1) departure is a 10-minute transfer', () => {
    const ours = col(['0005', '0030'].map(() => ''));
    ours.cells = [cell('0005', { dayOffset: 1 }), cell('0030', { dayOffset: 1 })];
    expect(find('', [feeder('2355')], hub(), ours).map((c) => c.transfer)).toEqual([10]);
  });

  it('past midnight: our trip starting at 00:05 meets the evening before\'s 23:55', () => {
    const got = find('0005', [feeder('2355')]);
    expect(got.map((c) => [c.transfer, c.commonDays])).toEqual([[10, 6]]); // the feeder's Mon–Sat evenings meet our Tue–Sun
  });

  it('a feeder sharing no operating day is not a candidate', () => {
    const weekend = { code: 'F', rs: line(FEED_STOPS, [col(['0900', '0952'], { dayCode: '67' })]) };
    expect(find('1000', [weekend], hub(), col(['1000', '1100'], { dayCode: '12345' }))).toEqual([]);
  });

  it('a call that only lets passengers board is not a feeder arrival', () => {
    const f = line(FEED_STOPS, [{ dayCode: 'D', uid: uid(), cells: [cell('0900'), cell('0952', { suffix: 'p' })] }]);
    expect(find('1000', [{ code: 'F', rs: f }])).toEqual([]);
  });

  it('a quay of the same StopPlace matches; a quay of another StopPlace matches only within the radius', () => {
    const at = (/** @type {string} */ q) => feeder('0952', {}, [stop('A', 'NSR:Quay:1'), stop('X', q)]);
    expect(find('1000', [at('NSR:Quay:22')])).toHaveLength(1);
    expect(find('1000', [at('NSR:Quay:23')])).toEqual([]);
    expect(find('1000', [at('NSR:Quay:23')], hub({ radiusM: 200 }))).toHaveLength(1);
    expect(find('1000', [at('NSR:Quay:23')], hub({ radiusM: 50 }))).toEqual([]);
  });

  it('each criterion filters', () => {
    const f = feeder('0952', { mode: 'water', submode: 'highSpeedPassengerService', publicCode: '1101',
      sek: [{ orgId: 'X:Authority:1', isAuthority: true, isOperator: false }, { orgId: 'X:Operator:2', isAuthority: false, isOperator: true }] });
    const ok = (/** @type {any} */ criteria) => find('1000', [f], hub({ criteria })).length === 1;
    expect(ok({ authority: ['X:Authority:1'] })).toBe(true);
    expect(ok({ authority: ['X:Authority:9'] })).toBe(false);
    expect(ok({ operator: ['X:Operator:2', 'Y:Operator:3'] })).toBe(true);
    expect(ok({ operator: ['X:Authority:1'] })).toBe(false);
    expect(ok({ mode: 'water', submode: 'highSpeedPassengerService' })).toBe(true);
    expect(ok({ mode: 'bus' })).toBe(false);
    expect(ok({ submode: 'localCarFerry' })).toBe(false);
    expect(ok({ publicCode: '1101' })).toBe(true);
    expect(ok({ publicCode: '1102' })).toBe(false);
    expect(ok({ calledAt: ['NSR:StopPlace:1'] })).toBe(true);
    expect(ok({ calledAt: ['NSR:StopPlace:9'] })).toBe(false);
  });

  it('the same table set of our line never feeds; another table set of our line may', () => {
    const back = col(['', '0952']); // our line's other direction would be in another set; first the same set:
    const ourCol = col(['1000', '1100']);
    const sameSet = line([stop('C', 'NSR:Quay:3'), ...OUR_STOPS], [{ ...ourCol, cells: [null, ...ourCol.cells] }, { ...back, cells: [cell('0940'), cell('0952'), null] }]);
    const t0 = lineTrips(sameSet, { calendars: CAL }).find((t) => t.uid === ourCol.uid);
    expect(candidates(hub(), 1, t0, [{ code: 'OUR', rs: sameSet }], ctx)).toEqual([]);
    const twoSets = { ...sameSet, tableSets: [...sameSet.tableSets, { id: 2, name: 'Back', uid: '11111111-0000-4000-8000-000000000002' }],
      periods: [...sameSet.periods, { id: 1, setId: 2, calendarIds: ['c'] }],
      grids: { '0:1': { stops: sameSet.grids['0:1'].stops, cols: [sameSet.grids['0:1'].cols[0]] }, '1:2': { stops: sameSet.grids['0:1'].stops, cols: [sameSet.grids['0:1'].cols[1]] } } };
    const t1 = lineTrips(twoSets, { calendars: CAL }).find((t) => t.uid === ourCol.uid);
    expect(candidates(hub(), 1, t1, [{ code: 'OUR', rs: twoSets }], ctx).map((c) => c.transfer)).toEqual([8]);
  });

  it('several feeders come sorted by transfer, then line', () => {
    const got = find('1000', [{ ...feeder('0950'), code: 'G' }, feeder('0950'), feeder('0955')]);
    expect(got.map((c) => `${c.line}${c.transfer}`)).toEqual(['F5', 'F10', 'G10']);
  });

  it('our trip not calling at the hub row, or not letting passengers board there, has none', () => {
    expect(find('', [feeder('0952')], hub(), col(['', '1100']))).toEqual([]);
    const alightOnly = col(['1000', '1100']);
    alightOnly.cells[0] = cell('1000', { suffix: 'a' });
    expect(find('', [feeder('0952')], hub(), alightOnly)).toEqual([]);
  });
});
