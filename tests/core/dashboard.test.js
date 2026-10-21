// Oversikt (user 2026-10-21): what needs the planner today, what soon, and what is fine. Entur wants data valid 120
// days at delivery, so lines ending within 120 days are flagged: under 30 days today, 30–120 soon.
import { describe, it, expect } from 'vitest';
import { buildDashboard, STALE_DAYS } from '../../src/core/dashboard.js';

const TODAY = new Date('2026-10-21T09:00:00');
/** A day so many days from TODAY, as YYYYMMDD. @param {number} n */
const day = (n) => { const d = new Date(2026, 9, 21 + n); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
/** @param {Partial<import('../../src/core/dashboard.js').DashLine>} l */
const line = (l) => ({ code: '1', label: '1', exported: true, lastDay: day(400), issues: [], hash: 'h1', ...l });
const err = (/** @type {string} */ code, /** @type {string} */ route) => ({ level: /** @type {const} */ ('error'), code, route });
const recent = { at: new Date('2026-10-01T10:00:00Z').toISOString(), hash: 'h1' };

describe('Oversikt', () => {
  it('a line ending within 30 days is for today; 30 to 120 days is soon (Entur wants 120)', () => {
    const d = buildDashboard({ lines: [line({ code: '35', label: '35', lastDay: day(12) }), line({ code: '12', label: '12', lastDay: day(41) }), line({ code: '9', label: '9', lastDay: day(200) })],
      exports: { 35: recent, 12: recent, 9: recent }, today: TODAY });
    expect(d.today).toEqual([expect.objectContaining({ kind: 'expires', code: '35', days: 12 })]);
    expect(d.soon).toEqual([expect.objectContaining({ kind: 'expiring', code: '12', days: 41 })]);
    expect(d.ok).toEqual({ count: 1, until: day(200) });
  });

  it('a line that has already stopped running is for today, with a negative day count', () => {
    const d = buildDashboard({ lines: [line({ code: '7', lastDay: day(-3) })], exports: { 7: recent }, today: TODAY });
    expect(d.today[0]).toMatchObject({ kind: 'expires', code: '7', days: -3 });
  });

  it('a line with errors is for today, its errors grouped by kind', () => {
    const d = buildDashboard({ lines: [line({ code: '34', issues: [err('dest-missing', '34'), err('dest-missing', '34'), err('speed-over', '34')] })], exports: { 34: recent }, today: TODAY });
    expect(d.today).toEqual([expect.objectContaining({ kind: 'errors', code: '34', count: 3 })]);
    expect(/** @type {any} */ (d.today[0]).groups.map((/** @type {any} */ g) => [g.code, g.count])).toEqual([['dest-missing', 2], ['speed-over', 1]]);
  });

  it('lines changed since their last export make one card for today', () => {
    const d = buildDashboard({ lines: [line({ code: '37', hash: 'new' }), line({ code: '38', hash: 'new' }), line({ code: '39' })], exports: { 37: recent, 38: recent, 39: recent }, today: TODAY });
    expect(d.today).toEqual([expect.objectContaining({ kind: 'changed', codes: ['37', '38'] })]);
  });

  it('a line never exported, or not for a long time, is soon', () => {
    const old = { at: new Date(2026, 9, 21 - STALE_DAYS - 10).toISOString(), hash: 'h1' };
    const d = buildDashboard({ lines: [line({ code: '74' }), line({ code: '75' })], exports: { 75: old }, today: TODAY });
    expect(d.soon).toEqual([expect.objectContaining({ kind: 'stale', code: '74', never: true }), expect.objectContaining({ kind: 'stale', code: '75', never: false, days: STALE_DAYS + 10 })]);
  });

  it('warnings alone are soon, not today', () => {
    const d = buildDashboard({ lines: [line({ code: '20', issues: [{ level: 'warning', code: 'dest-unserved', route: '20' }] })], exports: { 20: recent }, today: TODAY });
    expect(d.today).toEqual([]);
    expect(d.soon).toEqual([expect.objectContaining({ kind: 'warnings', code: '20', count: 1 })]);
  });

  it('leaves out lines that are not exported', () => {
    const d = buildDashboard({ lines: [line({ code: '99', exported: false, lastDay: day(3), issues: [err('dest-missing', '99')] })], exports: {}, today: TODAY });
    expect([d.today, d.soon, d.ok.count, d.validity]).toEqual([[], [], 0, []]);
  });

  it('lists every exported line\'s validity, soonest end first, coloured by how soon', () => {
    const d = buildDashboard({ lines: [line({ code: 'a', lastDay: day(200) }), line({ code: 'b', lastDay: day(12) }), line({ code: 'c', lastDay: day(60) }), line({ code: 'd', lastDay: '' })],
      exports: {}, today: TODAY });
    expect(d.validity.map((v) => [v.code, v.days, v.bucket])).toEqual([['b', 12, 'today'], ['c', 60, 'soon'], ['a', 200, 'ok']]);
  });

  it('orders today: ending soonest first, then errors, then changes', () => {
    const d = buildDashboard({ lines: [line({ code: 'e', issues: [err('x', 'e')] }), line({ code: 'f', lastDay: day(20) }), line({ code: 'g', lastDay: day(5) }), line({ code: 'h', hash: 'new' })],
      exports: { e: recent, f: recent, g: recent, h: recent }, today: TODAY });
    expect(d.today.map((/** @type {any} */ x) => x.kind + ':' + (x.code ?? x.codes.join(',')))).toEqual(['expires:g', 'expires:f', 'errors:e', 'changed:h']);
  });
});
