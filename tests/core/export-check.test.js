import { describe, it, expect } from 'vitest';
import { parseERN } from '../../src/core/ern/parse.js';
import { checkForExport } from '../../src/core/export-check.js';

const ORGS = [{ id: 'TST:Authority:1', name: 'Fylket' }, { id: 'TST:Operator:1', name: 'Buss AS' }];
const bus = (/** @type {string} */ id, /** @type {string} */ name) => ({ quayId: id, publicCode: 'A', stopPlaceId: 'NSR:StopPlace:1', stopPlaceName: name, mode: 'bus', lat: 0, lon: 0 });
const NSR = new Map([['NSR:Quay:7203', bus('NSR:Quay:7203', 'Jernbanetorget')], ['NSR:Quay:11972', bus('NSR:Quay:11972', 'Oslo bussterminal')]]);

/** A clean bus route: two NSR stops, one trip, authority and operator from the list. */
const route = () => parseERN([
  '#RUT;-1;50;Jernbanetorget - Oslo bussterminal;;1;',
  '#SEK;TST:Authority:1;Fylket;1;0;0;0', '#SEK;TST:Operator:1;Buss AS;0;1;0;0',
  '#PER;Vinter;20260101;20260630;;;', '#TAB;0;;;;', '#TUR;0;DX67;0;0;0;0',
  '#TRL;0;NSR:Quay:7203;Jernbanetorget;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;NSR:Quay:11972;Oslo bussterminal;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0',
].join('\r\n') + '\r\n', { lang: 'no' });
const grid0 = (/** @type {any} */ rs) => rs.grids[`${rs.periods[0].id}:${rs.directions[0].id}`];

/** @param {any} rs @param {object} [extra] */
const check = (rs, extra = {}) => checkForExport({ routes: [{ code: '50', rs, status: 'ok' }], orgs: ORGS, orgsProblem: '', quayInfo: NSR, ...extra });
const codes = (/** @type {any[]} */ issues) => issues.map((i) => `${i.level}:${i.code}`);

describe('checkForExport', () => {
  it('finds nothing in a clean route', () => {
    expect(check(route())).toEqual([]);
  });

  describe('stops', () => {
    it('blocks a stop without an ID', () => {
      const rs = route();
      grid0(rs).stops[1].stopId = null;
      const issues = check(rs);
      expect(codes(issues)).toEqual(['error:stop-missing']);
      expect(issues[0]).toMatchObject({ route: '50', where: { period: 'Vinter', direction: 'Tur' }, detail: 'Oslo bussterminal' });
    });

    it('blocks an old numeric stop ID', () => {
      const rs = route();
      grid0(rs).stops[1].stopId = '104';
      expect(codes(check(rs))).toEqual(['error:stop-not-nsr']);
    });

    it('ignores rows that have no times', () => {
      const rs = route();
      grid0(rs).stops.push({ name: 'Ubrukt', stopId: null, bold: false, sep: false, isDwellArr: false, price: null });
      grid0(rs).cols[0].cells.push(null);
      expect(check(rs)).toEqual([]);
    });

    it('only warns about what NSR says', () => {
      expect(codes(check(route(), { quayInfo: new Map([...NSR, ['NSR:Quay:11972', null]]) }))).toEqual(['warning:stop-not-seen']);
      expect(codes(check(route(), { quayInfo: new Map([...NSR, ['NSR:Quay:11972', { ...bus('NSR:Quay:11972', 'Oslo S'), mode: 'rail' }]]) }))).toEqual(['warning:stop-mode']);
      expect(codes(check(route(), { quayInfo: new Map() }))).toEqual(['warning:stop-unchecked']);
    });

    it('blocks two stop IDs that would get the same NeTEx ID', () => {
      const rs = route();
      grid0(rs).stops[0].stopId = 'NSR:Quay:7';
      grid0(rs).stops[1].stopId = 'NSR-Quay-7';
      expect(codes(check(rs))).toContain('error:stop-id-clash');
    });
  });

  describe('columns', () => {
    it('blocks a trip without a day code', () => {
      const rs = route();
      grid0(rs).cols[0].dayCode = '';
      const issues = check(rs);
      expect(codes(issues)).toEqual(['error:col-no-daycode']);
      expect(issues[0].where).toEqual({ period: 'Vinter', direction: 'Tur', column: 1 });
    });

    it('warns about a time earlier than the stop before it', () => {
      const rs = route();
      grid0(rs).cols[0].cells[1].time = '0650';
      expect(codes(check(rs))).toEqual(['warning:col-decreasing']);
    });
  });

  describe('periods', () => {
    it('blocks a missing date and a start after the end', () => {
      const rs = route();
      rs.periods[0].from = '';
      expect(codes(check(rs))).toEqual(['error:period-dates']);
      rs.periods[0].from = '20260701';
      expect(codes(check(rs))).toEqual(['error:period-order']);
    });

    it('accepts a one-day period', () => {
      const rs = route();
      rs.periods[0].from = '20260630';
      expect(check(rs)).toEqual([]);
    });

    it('warns about an incomplete alternative date range', () => {
      const rs = route();
      rs.periods[0].from2 = '20260801';
      expect(codes(check(rs))).toEqual(['warning:alt-dates']);
    });
  });

  describe('organisations', () => {
    it('blocks a route without an authority or an operator', () => {
      const rs = route();
      rs.sek = rs.sek.filter((/** @type {any} */ s) => s.isOperator);
      expect(codes(check(rs))).toEqual(['error:no-authority']);
      rs.sek = [];
      expect(codes(check(rs))).toEqual(['error:no-authority', 'error:no-operator']);
    });

    it('warns about organisations missing from the list and old-style IDs', () => {
      expect(codes(check(route(), { orgs: [ORGS[0]] }))).toEqual(['warning:org-not-in-list']);
      const rs = route();
      rs.sek[1].orgId = '3';
      expect(codes(check(rs))).toEqual(['warning:org-id-old']);
    });

    it('blocks an organisation list that cannot be trusted', () => {
      expect(codes(check(route(), { orgsProblem: 'unreadable' }))).toEqual(['error:orgs-unreadable']);
      expect(codes(check(route(), { orgsProblem: 'not-saved' }))).toEqual(['error:orgs-not-saved']);
    });
  });

  describe('project', () => {
    it('blocks a damaged route', () => {
      const issues = checkForExport({ routes: [{ code: '50', rs: route(), status: 'ok' }, { code: '60', rs: null, status: 'damaged' }], orgs: ORGS, orgsProblem: '', quayInfo: NSR });
      expect(codes(issues)).toEqual(['error:route-damaged']);
      expect(issues[0].route).toBe('60');
    });

    it('blocks a project without any trips', () => {
      const rs = route();
      grid0(rs).cols = [];
      expect(codes(check(rs))).toEqual(['error:no-trips']);
    });

    it('lists errors before warnings', () => {
      const rs = route();
      rs.routeName = '';
      grid0(rs).stops[1].stopId = null;
      expect(codes(check(rs))).toEqual(['error:stop-missing', 'warning:no-name']);
    });
  });
});
