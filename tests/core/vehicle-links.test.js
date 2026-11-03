// Which saved link a trip's leg uses, by its vehicle group (design 2026-11-03 §7): the plain key is the default group's
// route; a variant P|<group> is a group's own; Nepos reuses a link without asking when it can prove the router would
// give the same route (rules 3 and 5, user 2026-11-03), and otherwise names a candidate for the user to reconfirm.
import { describe, it, expect } from 'vitest';
import { linkFor, sameRouteFor, variantKey, pairOf, groupOfKey } from '../../src/core/vehicle-links.js';

const P = 'NSR:Quay:1|NSR:Quay:2|bus';
const limits = (/** @type {number} */ h) => ({ height: { kind: /** @type {const} */ ('height'), value: h, way: 77, road: 'Matrandvegen', at: /** @type {[number, number]} */ ([12, 60]) } });
/** @param {Partial<import('../../src/core/link-state.js').SavedLink>} [x] @returns {import('../../src/core/link-state.js').SavedLink} */
const link = (x = {}) => ({ polyline: 'abc', distanceM: 1000, status: 'OK', from: [0, 0], to: [1, 1], ...x });
const ctx = { lineMode: 'bus' };

describe('keys', () => {
  it('a variant is the pair and the group key; the plain key has none', () => {
    expect(variantKey(P, 'h4')).toBe(`${P}|h4`);
    expect(variantKey(P, '')).toBe(P);
    expect(pairOf(`${P}|h4`)).toBe(P);
    expect(groupOfKey(`${P}|h4`)).toBe('h4');
    expect(groupOfKey(P)).toBe('');
  });
});

describe('the same route for a group (no recheck needed)', () => {
  it('fits and the same U-turn length, or longer on a route without U-turns', () => {
    expect(sameRouteFor(link({ limits: limits(3.7) }), { height: 3 }, 12, 12)).toBe(true);
    expect(sameRouteFor(link({ limits: limits(3.7) }), { height: 4 }, 12, 12)).toBe(false);
    expect(sameRouteFor(link({ limits: {} }), { length: 18 }, 18, 12)).toBe(true);
    expect(sameRouteFor(link({ limits: {}, uturns: [{ at: [0, 0], road: '', where: 'stop' }] }), { length: 18 }, 18, 12)).toBe(false);
    expect(sameRouteFor(link({ limits: {} }), { length: 8 }, 8, 12)).toBe(false);
    expect(sameRouteFor(link(), { height: 3 }, 12, 12)).toBe(false);
    expect(sameRouteFor(link(), {}, 12, 12)).toBe(true);
  });
});

describe('linkFor: rules 1–6', () => {
  it('1: a trip without sizes uses the plain link', () => {
    expect(linkFor(P, {}, { [P]: link() }, ctx)).toMatchObject({ key: P, how: 'plain' });
    expect(linkFor(P, {}, { [`${P}|h4`]: link() }, ctx)).toEqual({ key: null, link: null, how: null });
  });

  it('2: a group\'s own variant comes first', () => {
    const links = { [P]: link({ limits: {} }), [`${P}|h4`]: link({ uturn: 12, limits: {} }) };
    expect(linkFor(P, { height: 4 }, links, ctx)).toMatchObject({ key: `${P}|h4`, how: 'own' });
  });

  it('3: the plain link, proven, when the vehicle fits it and costs U-turns alike', () => {
    expect(linkFor(P, { height: 3 }, { [P]: link({ limits: limits(3.7) }) }, ctx)).toMatchObject({ key: P, how: 'proven' });
  });

  it('3: not proven for a minibus on a route made with the 12 m default (it may turn now)', () => {
    expect(linkFor(P, { length: 8 }, { [P]: link({ limits: {} }) }, ctx)).toMatchObject({ key: P, how: 'candidate' });
  });

  it('3: an 18 m bus on a plain route without U-turns: proven; with one: a candidate', () => {
    expect(linkFor(P, { length: 18 }, { [P]: link({ limits: {} }) }, ctx)).toMatchObject({ how: 'proven' });
    const turning = link({ limits: {}, uturn: 12, uturns: [{ at: [0, 0], road: 'Blindvegen', where: 'stop' }] });
    expect(linkFor(P, { length: 18 }, { [P]: turning }, ctx)).toMatchObject({ how: 'candidate' });
  });

  it('4: a link the user kept for this group', () => {
    const links = { [P]: link({ limits: {}, kept: ['l8'] }) };
    expect(linkFor(P, { length: 8 }, links, ctx)).toMatchObject({ key: P, how: 'kept' });
  });

  it('5: a bigger vehicle that still fits the route its smaller group went round on: proven', () => {
    const links = { [P]: link({ limits: limits(3.7) }), [`${P}|h4`]: link({ uturn: 12, limits: {} }) };
    expect(linkFor(P, { height: 4.1 }, links, ctx)).toMatchObject({ key: `${P}|h4`, how: 'proven' });
  });

  it('6: a smaller vehicle on a route that went round for a bigger one: a candidate to reconfirm', () => {
    const links = { [`${P}|h4`]: link({ uturn: 12, limits: {} }) };
    expect(linkFor(P, { height: 3 }, links, ctx)).toMatchObject({ key: `${P}|h4`, how: 'candidate' });
  });

  it('6: a vehicle over the plain link with no other route: the plain link as the candidate', () => {
    expect(linkFor(P, { height: 4 }, { [P]: link({ limits: limits(3.7) }) }, ctx)).toMatchObject({ key: P, how: 'candidate' });
  });

  it('a plain link routed before 2.6.1 (no limits) is only a candidate for a sized vehicle', () => {
    expect(linkFor(P, { height: 3 }, { [P]: link() }, ctx)).toMatchObject({ key: P, how: 'candidate' });
  });

  it('links that are not routed, and another network\'s keys, are never used', () => {
    expect(linkFor(P, {}, { [P]: link({ status: 'FAILED' }) }, ctx)).toEqual({ key: null, link: null, how: null });
    const tram = 'NSR:Quay:1|NSR:Quay:2|tram';
    expect(linkFor(P, { height: 3 }, { [tram]: link({ limits: {} }) }, ctx)).toEqual({ key: null, link: null, how: null });
  });

  it('a taxi line costs U-turns for a car by default', () => {
    expect(linkFor(P, { length: 4 }, { [P]: link({ limits: {} }) }, { lineMode: 'taxi' })).toMatchObject({ how: 'proven' });
  });
});

describe('final review M6', () => {
  it('a group\'s own route over a new limit, with a plain route it fits: the plain one, not a red leg', () => {
    const links = { [P]: link({ limits: {} }), [`${P}|h4`]: link({ uturn: 12, limits: limits(3.5) }) };
    expect(linkFor(P, { height: 4 }, links, ctx)).toMatchObject({ key: P, how: 'proven' });
  });
});
