// Vehicle limits on roads (backlog 93, 92, 107; design 2026-11-03): over and close, vehicle groups, the U-turn cost.
import { describe, it, expect } from 'vitest';
import { fit, isOver, groupOf, groupKey, parseGroupKey, uturnLength, uturnSeconds, biggerOrEqual } from '../../src/core/vehicle-limits.js';

/** @param {'height' | 'width' | 'length' | 'weight'} kind @param {number} value */
const at = (kind, value) => ({ kind, value, way: 563373884, road: 'Matrandvegen', at: /** @type {[number, number]} */ ([12.1, 59.9]) });
const kinds = (/** @type {{ kind: string }[]} */ list) => list.map((l) => l.kind);

describe('over and close (user 2026-11-03)', () => {
  it('a size over the limit is over; less than 0.5 m to spare is close; 0 m to spare is close', () => {
    expect(kinds(fit({ height: at('height', 3.7) }, { height: 4 }).over)).toEqual(['height']);
    expect(kinds(fit({ height: at('height', 3.7) }, { height: 3.3 }).close)).toEqual(['height']);
    expect(fit({ height: at('height', 3.7) }, { height: 3.3 }).over).toEqual([]);
    expect(fit({ height: at('height', 3.7) }, { height: 3.0 })).toEqual({ over: [], close: [] });
    expect(fit({ height: at('height', 3.7) }, { height: 3.2 })).toEqual({ over: [], close: [] });
    expect(kinds(fit({ height: at('height', 3.7) }, { height: 3.7 }).close)).toEqual(['height']);
  });

  it('a limit read as float32 still lets a vehicle of exactly that size pass', () => {
    expect(fit({ width: at('width', Math.fround(2.55)) }, { width: 2.55 }).over).toEqual([]);
  });

  it('weight: close from 1 t under the limit up to 5 % over, over beyond that', () => {
    const w = { weight: at('weight', 8) };
    expect(kinds(fit(w, { weight: 8.1 }).close)).toEqual(['weight']);
    expect(kinds(fit(w, { weight: 8.4 }).close)).toEqual(['weight']);
    expect(kinds(fit(w, { weight: 8.5 }).over)).toEqual(['weight']);
    expect(kinds(fit(w, { weight: 7.0 }).close)).toEqual(['weight']);
    expect(fit(w, { weight: 6.9 })).toEqual({ over: [], close: [] });
  });

  it('a limit of 0 is no limit, and a size not given is not checked', () => {
    expect(fit({ height: at('height', 0) }, { height: 9 })).toEqual({ over: [], close: [] });
    expect(fit({ height: at('height', 3.7) }, { width: 2.55 })).toEqual({ over: [], close: [] });
    expect(fit(undefined, { height: 4 })).toEqual({ over: [], close: [] });
  });

  it('isOver works on an edge\'s raw values (the search)', () => {
    expect(isOver('height', 3.7, 4)).toBe(true);
    expect(isOver('height', 3.7, 3.7)).toBe(false);
    expect(isOver('height', 0, 9)).toBe(false);
    expect(isOver('weight', 8, 8.3)).toBe(false);
    expect(isOver('weight', 8, 8.5)).toBe(true);
    expect(isOver('height', 3.7, undefined)).toBe(false);
  });
});

describe('vehicle groups', () => {
  const vehicles = /** @type {any[]} */ ([
    { name: 'TB', height: 4, width: 2.55, length: null, weight: null },
    { name: 'LB', height: 3, width: null, length: null, weight: null },
    { name: 'Plain', height: null, width: null, length: null, weight: null },
  ]);

  it('a trip\'s group is its vehicle\'s sizes, found by name', () => {
    expect(groupOf('TB', vehicles)).toEqual({ height: 4, width: 2.55 });
    expect(groupOf('Plain', vehicles)).toEqual({});
    expect(groupOf('', vehicles)).toEqual({});
  });

  it('groupOf unknown vehicle: a name not in the list is no vehicle', () => {
    expect(groupOf('Deleted bus', vehicles)).toEqual({});
    expect(groupOf('TB', /** @type {any} */ (undefined))).toEqual({});
  });

  it('a group key names the sizes in a fixed order, and reads back', () => {
    expect(groupKey({ height: 4, width: 2.55 })).toBe('h4w2.55');
    expect(groupKey({ weight: 19.5, length: 12, height: 3.3 })).toBe('h3.3l12t19.5');
    expect(groupKey({})).toBe('');
    expect(parseGroupKey('h4w2.55')).toEqual({ height: 4, width: 2.55 });
    expect(parseGroupKey('h3.3l12t19.5')).toEqual({ height: 3.3, length: 12, weight: 19.5 });
    expect(parseGroupKey('')).toEqual({});
  });

  it('a group is at least as big as another when it has every size the other has, each as big', () => {
    expect(biggerOrEqual({ height: 4.1, width: 2.55 }, { height: 4 })).toBe(true);
    expect(biggerOrEqual({ height: 4 }, { height: 4 })).toBe(true);
    expect(biggerOrEqual({ width: 2.55 }, { height: 4 })).toBe(false);
    expect(biggerOrEqual({ height: 3 }, { height: 4 })).toBe(false);
    expect(biggerOrEqual({ height: 3 }, {})).toBe(true);
  });
});

describe('the U-turn cost (backlog 107)', () => {
  it('15 s for a 4 m car, growing with the square of the length', () => {
    expect(uturnSeconds(4)).toBe(15);
    expect(uturnSeconds(8)).toBe(60);
    expect(uturnSeconds(12)).toBe(135);
    expect(uturnSeconds(24)).toBe(540);
    expect(uturnSeconds(2)).toBe(15);
  });

  it('the vehicle\'s length, else 12 m (4 m on a taxi line)', () => {
    expect(uturnLength({}, 'bus')).toBe(12);
    expect(uturnLength({}, 'coach')).toBe(12);
    expect(uturnLength({}, 'taxi')).toBe(4);
    expect(uturnLength({ length: 8 }, 'bus')).toBe(8);
    expect(uturnLength({ height: 3 }, 'taxi')).toBe(4);
  });
});
