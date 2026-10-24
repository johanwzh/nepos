// A block in the export, the check and the network (power tools spec 2026-10-24): every trip is an ordinary
// ServiceJourney with the parent's data; problems point to the parent.
import { describe, it, expect } from 'vitest';
import { checkForExport } from '../../../src/core/export-check.js';
import { networkOf } from '../../../src/core/network.js';
import { tripCols, expandRoute } from '../../../src/core/blocks.js';
import { miniErn, gridOf, buildLine, U } from '../../fixtures/mini-line.js';
import { registerCompanies } from '../../fixtures/orgs.js';

const count = (/** @type {string} */ s, /** @type {string} */ x) => s.split(x).length - 1;
const check = (/** @type {any} */ rs) => checkForExport({ routes: [{ code: '50', rs, status: 'ok' }], orgs: [], register: registerCompanies(), orgMode: 'codespace', codespace: 'TST', brandings: [], calendars: [{ id: 'h1', name: 'Vår', ranges: [['20260101', '20260630']] }], orgsProblem: '', quayInfo: new Map() });

describe('blocks in the export', () => {
  it('appends the generated trips after the real columns, knowing their parent', () => {
    const { grid } = gridOf(miniErn());
    grid.cols[0].block = { every: 30, span: 120 };
    const all = tripCols(grid);
    expect(all).toHaveLength(3 + 4);
    expect(all.slice(0, 3).map((x) => x.parentCi)).toEqual([undefined, undefined, undefined]);
    expect(all.slice(3).map((x) => x.parentCi)).toEqual([0, 0, 0, 0]);
    expect(expandRoute({ grids: { a: grid } }).grids.a.cols).toHaveLength(7);
    expect(grid.cols).toHaveLength(3); // the route itself is untouched
  });

  it('writes every trip as a ServiceJourney with the parent\'s booking, and generated ones have no PrivateCode', () => {
    const { rs, grid } = gridOf(miniErn({ times: [['0605', '0615', '0625']] }));
    grid.cols[0].block = { every: 30, span: 120 };
    grid.cols[0].tripNo = '17';
    grid.cols[0].booking = { phone: '1' };
    const { line } = buildLine(rs);
    expect(count(line, '<ServiceJourney ')).toBe(5);
    expect(count(line, '<FlexibleServiceProperties ')).toBe(5);
    expect(count(line, '<PrivateCode>17</PrivateCode>')).toBe(1);
    expect(line).toContain(`TST:ServiceJourney:${U[0]}"`);
    expect(line).toMatch(/<DepartureTime>08:05:00<\/DepartureTime>/);
  });

  it('runs past midnight with DayOffset on the parent\'s days', () => {
    const { rs, grid } = gridOf(miniErn({ times: [['0605', '0615', '0625']] }));
    grid.cols[0].block = { every: 30, span: 1380 };
    const { line } = buildLine(rs);
    expect(line).toMatch(/<DepartureTime>05:05:00<\/DepartureTime>\s*<DepartureDayOffset>1<\/DepartureDayOffset>/);
  });

  it('counts the trips in the network', () => {
    const { rs, grid } = gridOf(miniErn({ times: [['0605', '0615', '0625']] }));
    grid.cols[0].block = { every: 60, span: 120 };
    const net = networkOf([{ code: '50', rs, problem: false }], new Map([['NSR:Quay:1', { lon: 10, lat: 59 }], ['NSR:Quay:2', { lon: 10.1, lat: 59 }], ['NSR:Quay:3', { lon: 10.2, lat: 59 }]]));
    expect(JSON.stringify(net)).toContain('"trips":3');
  });

  it('reports a problem on a generated trip once, on the parent column', () => {
    const { rs, grid } = gridOf(miniErn({ times: [['0605', '', '']] }));
    grid.cols[0].block = { every: 60, span: 120 };
    const issues = check(rs).filter((i) => i.code === 'col-one-stop');
    expect(issues.length).toBe(1);
    expect(issues[0].where?.column).toBe(1);
  });

  it('a block whose parent has no times left is an error on the parent', () => {
    const { rs, grid } = gridOf(miniErn({ times: [['', '', ''], ['0800', '0810', '0820']] }));
    grid.cols[0].block = { every: 60, span: 120 };
    expect(check(rs).some((i) => i.code === 'block-empty' && i.level === 'error' && i.where?.column === 1)).toBe(true);
  });
});
