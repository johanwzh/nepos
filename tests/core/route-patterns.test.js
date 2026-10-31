import { describe, it, expect } from 'vitest';
import { tablePatterns, patternStates, pruneLineLinks } from '../../src/core/route-patterns.js';

const stop = (/** @type {string} */ name, /** @type {string | null} */ stopId, extra = {}) => ({ name, stopId, bold: false, sep: false, isDwellArr: false, price: null, ...extra });
const cell = (/** @type {string} */ time, extra = {}) => ({ time, dayOffset: 0, suffix: '', interchange: null, ...extra });
const CAL = [{ id: 'c', name: 'Jan', ranges: /** @type {[string, string][]} */ ([['20260101', '20260131']]) }];
const QUAYS = new Map(['1', '2', '3', '4', '5'].map((n, i) => [`NSR:Quay:${n}`, { lat: 59.9 + i * 0.01, lon: 10.7 }]));
const STOPS = [stop('A', 'NSR:Quay:1'), stop('B', 'NSR:Quay:2'), stop('C', 'NSR:Quay:3')];
const t = (/** @type {string} */ uid, /** @type {any[]} */ times) => ({ uid, dayCode: 'D', cells: times.map((x) => (typeof x === 'string' ? cell(x) : x)) });
const line = (/** @type {any[]} */ cols, stops = STOPS, mode = 'bus') => ({ mode, submode: 'localBus', tableSets: [{ id: 0, name: 'T' }],
  periods: [{ id: 0, setId: 0, calendarIds: ['c'] }], grids: { '0:0': { stops, cols } } });
const pats = (/** @type {any} */ rs, quayInfo = QUAYS) => tablePatterns(rs, { calendars: CAL, quayInfo, setId: 0 });
const k = (/** @type {string} */ a, /** @type {string} */ b) => `NSR:Quay:${a}|NSR:Quay:${b}|bus`;
/** A routed link between two of QUAYS' positions. @param {string} key */
const link = (key, extra = {}) => {
  const [a, b] = key.split('|').map((id) => QUAYS.get(id));
  return { polyline: 'x', distanceM: 1000, status: 'OK', from: [a?.lon, a?.lat], to: [b?.lon, b?.lat], tiles: { set: 'road', built: '2026-10-01', dataDate: '', hashes: {} }, ...extra };
};
/** The file after accepting `patterns` (their legs routed, the pattern recorded). @param {any[]} patterns @returns {any} */
const accepted = (patterns) => ({ version: 1, line: 'L', snaps: {},
  links: Object.fromEntries(patterns.flatMap((p) => p.keys.filter(Boolean).map((/** @type {string} */ key) => [key, link(key)]))),
  patterns: Object.fromEntries(patterns.map((p) => [p.id, { stops: p.stops.map((/** @type {any} */ s) => s.stopId), keys: p.keys, trips: p.trips, acceptedAt: '2026-10-31T10:00:00Z' }])) });
const states = (/** @type {any[]} */ patterns, /** @type {any} */ file, quayInfo = QUAYS, publishedBuilt = '2026-10-01') =>
  patternStates(patterns, file, { quayInfo, publishedBuilt });

describe('the journey patterns of a table set (routing editor, 2026-10-31)', () => {
  it('one pattern per distinct stop sequence, with its trips', () => {
    const p = pats(line([t('u1', ['0700', '0710', '0720']), t('u2', ['0800', '', '0820']), t('u3', ['0900', '0910', '0920'])]));
    expect(p.map((x) => x.id)).toEqual(['NSR:Quay:1 NSR:Quay:2 NSR:Quay:3', 'NSR:Quay:1 NSR:Quay:3']);
    expect(p[0].trips).toEqual(['u1', 'u3']);
    expect(p.map((x) => x.runs)).toEqual([2, 1]);
    expect(p[0].keys).toEqual([k('1', '2'), k('2', '3')]);
    expect(p[0].stops.map((s) => s.name)).toEqual(['A', 'B', 'C']);
    expect(p[1].keys).toEqual([k('1', '3')]);
  });

  it('a block\'s trips belong to the parent; a "doesn\'t run" variant is a pattern of its own with the same trip', () => {
    const col = t('u1', ['0700', '0710', '0720']);
    /** @type {any} */ (col).block = { every: 30, span: 60 };
    expect(pats(line([col])).map((x) => x.trips)).toEqual([['u1']]);
    expect(pats(line([col])).map((x) => x.runs)).toEqual([3]); // the parent and its two generated trips (user 2026-10-31: a trip count per pattern)
    const off = cell('0710', { dates: [{ from: '20260105', to: '20260105', on: false }] });
    const p = pats(line([t('u2', ['0700', off, '0720'])]));
    expect(p.map((x) => [x.id, x.trips])).toEqual([['NSR:Quay:1 NSR:Quay:2 NSR:Quay:3', ['u2']], ['NSR:Quay:1 NSR:Quay:3', ['u2']]]);
  });

  it('a trip without a UUID gives a pattern with no trips; a dwell is one stop', () => {
    const stops = [stop('A', 'NSR:Quay:1'), stop('B', 'NSR:Quay:2', { isDwellArr: true }), stop('B', 'NSR:Quay:2'), stop('C', 'NSR:Quay:3')];
    const p = pats(line([{ dayCode: 'D', cells: ['0700', '0710', '0712', '0720'].map((x) => cell(x)) }], stops));
    expect(p).toHaveLength(1);
    expect(p[0].trips).toEqual([]);
    expect(p[0].stops).toHaveLength(3);
  });

  it('a stop without an NSR position is in the pattern, its legs have no key', () => {
    const stops = [stop('A', 'NSR:Quay:1'), stop('X', '104'), stop('C', 'NSR:Quay:3')];
    const p = pats(line([t('u1', ['0700', '0710', '0720'])], stops));
    expect(p[0].stops[1]).toEqual({ stopId: '104', quay: null, name: 'X' });
    expect(p[0].keys).toEqual([null, null]);
  });

  it('a rail line has patterns keyed on its own network; an air line has none (routing for all modes)', () => {
    const [p] = pats(line([t('u1', ['0700', '0710'])], STOPS, 'rail'));
    expect(p.keys.every((k) => k?.endsWith('|rail'))).toBe(true);
    expect(pats(line([t('u1', ['0700', '0710'])], STOPS, 'air'))).toEqual([]);
  });
});

describe('the state of each pattern (spec "The user is in control")', () => {
  const rs = line([t('u1', ['0700', '0710', '0720']), t('u2', ['0800', '0810', '0820'])]);
  const p = pats(rs);

  it('no links file: red, every leg none', () => {
    const s = states(p, undefined);
    expect(s[0].state).toBe('red');
    expect(s[0].legs.map((l) => l.state)).toEqual(['none', 'none']);
    expect(s[0].saved).toBeNull();
  });

  it('an accepted pattern is green', () => {
    const s = states(p, accepted(p));
    expect(s[0].state).toBe('green');
    expect(s[0].legs.map((l) => l.state)).toEqual(['routed', 'routed']);
    expect(s[0].saved?.trips).toEqual(['u1', 'u2']);
  });

  it('a Quay moved 6 m: orange, moved; Keep (reviewed at the new place) makes it green', () => {
    const moved = new Map(QUAYS);
    const q2 = /** @type {any} */ (QUAYS.get('NSR:Quay:2'));
    moved.set('NSR:Quay:2', { lat: q2.lat + 6 / 111320, lon: q2.lon });
    const file = accepted(p);
    const s = states(p, file, moved);
    expect(s[0].state).toBe('orange');
    expect(s[0].legs.map((l) => l.state)).toEqual(['moved', 'moved']);
    const m = /** @type {any} */ (moved.get('NSR:Quay:2'));
    file.links[k('1', '2')].reviewed = { from: file.links[k('1', '2')].from, to: [m.lon, m.lat] };
    file.links[k('2', '3')].reviewed = { from: [m.lon, m.lat], to: file.links[k('2', '3')].to };
    expect(states(p, file, moved)[0].state).toBe('green');
  });

  it('newer published road data: orange, map; reviewed against that build: green; unknown build: never map', () => {
    const file = accepted(p);
    expect(states(p, file, QUAYS, '2026-11-01')[0].legs.map((l) => l.state)).toEqual(['map', 'map']);
    expect(states(p, file, QUAYS, '')[0].state).toBe('green');
    for (const key of p[0].keys) file.links[/** @type {string} */ (key)].reviewed = { built: '2026-11-01' };
    expect(states(p, file, QUAYS, '2026-11-01')[0].state).toBe('green');
  });

  it('a Quay replaced on one row (same trips): orange, exactly that row\'s two legs changed, with their old keys (Review Focus 1)', () => {
    const file = accepted(p);
    const now = pats(line(rs.grids['0:0'].cols, [stop('A', 'NSR:Quay:1'), stop('B', 'NSR:Quay:4'), stop('C', 'NSR:Quay:3')]));
    const s = states(now, file);
    expect(s[0].state).toBe('orange');
    expect(s[0].legs).toEqual([
      { key: k('1', '4'), state: 'changed', oldKey: k('1', '2') },
      { key: k('4', '3'), state: 'changed', oldKey: k('2', '3') },
    ]);
  });

  it('final review 2: a pattern and its "doesn’t run" variant share trips; a Quay replaced shows both orange, each traced to its own', () => {
    const S4 = [stop('A', 'NSR:Quay:1'), stop('B', 'NSR:Quay:2'), stop('C', 'NSR:Quay:3'), stop('D', 'NSR:Quay:5')];
    const off = () => cell('0720', { dates: [{ from: '20260105', to: '20260105', on: false }] });
    const before = pats(line([t('u1', ['0700', '0710', off(), '0730'])], S4));
    expect(before).toHaveLength(2);
    const S4b = [stop('A', 'NSR:Quay:1'), stop('B', 'NSR:Quay:4'), stop('C', 'NSR:Quay:3'), stop('D', 'NSR:Quay:5')];
    const now = pats(line([t('u1', ['0700', '0710', off(), '0730'])], S4b));
    const s = states(now, accepted(before));
    expect(s.map((x) => x.state)).toEqual(['orange', 'orange']);
    expect(s[1].legs).toEqual([{ key: k('1', '4'), state: 'changed', oldKey: k('1', '2') }, { key: k('4', '5'), state: 'changed', oldKey: k('2', '5') }]);
  });

  it('an extra call is a new pattern: red', () => {
    const stops = [...STOPS, stop('D', 'NSR:Quay:5')];
    const now = pats(line([t('u1', ['0700', '0710', '0720', '0730'])], stops));
    expect(states(now, accepted(p))[0].state).toBe('red');
  });

  it('a stop without a position: red, unroutable', () => {
    const now = pats(line([t('u1', ['0700', '0710', '0720'])], [stop('A', 'NSR:Quay:1'), stop('X', '104'), stop('C', 'NSR:Quay:3')]));
    const s = states(now, accepted(p));
    expect(s[0].state).toBe('red');
    expect(s[0].legs.map((l) => l.state)).toEqual(['unroutable', 'unroutable']);
  });

  it('trips in no saved pattern, or with no UUID, cannot be traced: red, never a crash (Review Focus 5)', () => {
    const now = pats(line([t('u9', ['0700', '0710', '0720']), { dayCode: 'D', cells: [cell('0700'), cell('0710'), cell('0720')] }],
      [stop('A', 'NSR:Quay:1'), stop('B', 'NSR:Quay:4'), stop('C', 'NSR:Quay:3')]));
    const s = states(now, accepted(p));
    expect(s[0].state).toBe('red');
    expect(s[0].saved).toBeNull();
  });
});

describe('unused links are dropped when a line is saved (spec Goal 6)', () => {
  const rs = line([t('u1', ['0700', '0710', '0720'])]);
  const p = pats(rs);
  const file = () => ({ ...accepted(p), snaps: { 'NSR:Quay:1': {}, 'NSR:Quay:2': {}, 'NSR:Quay:3': {} } });
  const B4 = [stop('A', 'NSR:Quay:1'), stop('B', 'NSR:Quay:4'), stop('C', 'NSR:Quay:3')];

  it('nothing unused: null (no write)', () => {
    expect(pruneLineLinks(rs, file())).toBeNull();
  });

  it('a replaced stop keeps the old pair while the saved pattern’s trips exist (Review Focus 3)', () => {
    expect(pruneLineLinks(line(rs.grids['0:0'].cols, B4), file())).toBeNull();
  });

  it('once no trip of the saved pattern is left, the pattern, its unused links and their snaps go', () => {
    const now = line([t('u9', ['0700', '0710', '0720'])], B4);
    const f = { ...file(), links: { ...file().links, [k('4', '3')]: link(k('4', '3')) } };
    const out = /** @type {any} */ (pruneLineLinks(now, f));
    expect(Object.keys(out.links)).toEqual([k('4', '3')]);
    expect(out.patterns).toEqual({});
    expect(Object.keys(out.snaps)).toEqual(['NSR:Quay:3']);
  });

  it('decided by stop IDs only: no positions (NSR offline) drops nothing that is still called', () => {
    const f = { ...file(), patterns: {} };
    expect(pruneLineLinks(rs, f)).toBeNull();
  });

  it('a pair only a "doesn’t run" date makes is still used', () => {
    const off = cell('0710', { dates: [{ from: '20260105', to: '20260105', on: false }] });
    const f = { ...file(), patterns: {}, links: { ...file().links, [k('1', '3')]: link(k('1', '3')) } };
    expect(pruneLineLinks(line([t('u1', ['0700', off, '0720'])]), f)).toBeNull();
  });

  it('a line switched to another mode keeps the old mode\'s links: only its own network\'s are pruned (final review I4)', () => {
    const tram = line([t('u9', ['0700', '0710', '0720'])], B4, 'tram');
    const out = pruneLineLinks(tram, file());
    expect(Object.keys(out?.links ?? file().links).sort()).toEqual(Object.keys(file().links).sort());
  });

  it('a line not routed (air) keeps its file', () => {
    expect(pruneLineLinks(line([t('u9', ['0700', '0710'])], STOPS, 'air'), file())).toBeNull();
  });
});
