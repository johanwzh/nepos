import { describe, it, expect } from 'vitest';
import { parseERN } from '../../src/core/ern/parse.js';
import { checkForExport, CHECK_CODES } from '../../src/core/export-check.js';
import { STRINGS } from '../../src/i18n/strings.js';
import { projectCopy, registerCompanies } from '../fixtures/orgs.js';

const ORGS = projectCopy();
const bus = (/** @type {string} */ id, /** @type {string} */ name) => ({ quayId: id, publicCode: 'A', stopPlaceId: 'NSR:StopPlace:1', stopPlaceName: name, mode: 'bus', lat: 0, lon: 0 });
const NSR = new Map([['NSR:Quay:7203', bus('NSR:Quay:7203', 'Jernbanetorget')], ['NSR:Quay:11972', bus('NSR:Quay:11972', 'Oslo bussterminal')]]);

/** A clean bus route: two NSR stops, one trip, authority and operator from the list. */
const route = () => parseERN([
  '#RUT;-1;50;Jernbanetorget - Oslo bussterminal;;1;',
  '#SEK;NOG:Authority:aaaaaaaaaa1;Eksempel fylkeskommune;1;0;0;0', '#SEK;NOG:Operator:bbbbbbbbbb2;Eksempel Buss AS;0;1;0;0',
  '#PER;Vinter;20260101;20260630;;;', '#TAB;0;;;;', '#TUR;0;DX67;0;0;0;0',
  '#TRL;0;NSR:Quay:7203;Jernbanetorget;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;NSR:Quay:11972;Oslo bussterminal;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0',
].join('\r\n') + '\r\n', { lang: 'no' });
const grid0 = (/** @type {any} */ rs) => rs.grids[`${rs.periods[0].id}:${rs.directions[0].id}`];

/** @param {any} rs @param {object} [extra] */
const check = (rs, extra = {}) => checkForExport({ routes: [{ code: '50', rs, status: 'ok' }], orgs: ORGS, register: registerCompanies(), orgMode: 'codespace', codespace: 'TST', brandings: [], orgsProblem: '', quayInfo: NSR, ...extra });
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

    it('blocks an organisation that is not in the register with that role', () => {
      const rs = route();
      rs.sek[1].orgId = 'NOG:Operator:gone';
      expect(codes(check(rs))).toEqual(['error:org-not-in-register']);
      const typed = route();
      typed.sek[1].orgId = 'TST:Operator:1';
      expect(codes(check(typed))).toEqual(['error:org-not-in-register']);
    });

    it('checks against the project copy, with one warning, when no register was ever downloaded', () => {
      expect(codes(check(route(), { register: null }))).toEqual(['warning:org-register-missing']);
    });

    it('blocks bad or duplicate aliases in codespace mode only', () => {
      const orgs = projectCopy();
      /** @type {any} */ (orgs[1].operator).alias = 'TST:Authority:1';
      expect(codes(check(route(), { orgs }))).toEqual(['error:org-alias-format']);
      expect(codes(check(route(), { orgs, orgMode: 'nog' }))).toEqual([]);
      const dup = projectCopy();
      /** @type {any} */ (dup[1].operator).alias = 'TST:Authority:aaaaaaaaaa1'; // wrong role and a duplicate
      expect(codes(check(route(), { orgs: dup }))).toEqual(['error:org-alias-format', 'error:org-alias-duplicate', 'error:org-alias-duplicate']);
    });

    it('blocks, in codespace mode, an organisation that is in the register but not in the project copy', () => {
      expect(codes(check(route(), { orgs: [projectCopy()[0]] }))).toEqual(['error:org-not-in-project']);
      expect(codes(check(route(), { orgs: [projectCopy()[0]], orgMode: 'nog' }))).toEqual([]);
    });

    it('blocks an organisation copy that cannot be read', () => {
      expect(codes(check(route(), { orgsProblem: 'unreadable' }))).toEqual(['error:orgs-unreadable']);
    });
  });

  describe('line details', () => {
    it('blocks a line without a mode or without a name', () => {
      const rs = route();
      rs.mode = '';
      expect(codes(check(rs))).toContain('error:no-mode');
      const unnamed = route();
      unnamed.routeName = '';
      expect(codes(check(unnamed))).toContain('error:no-name');
    });

    it('blocks a branding that is not in the project', () => {
      const rs = route();
      rs.brandingId = 'TST:Branding:gone';
      expect(codes(check(rs))).toEqual(['error:branding-missing']);
      expect(codes(check(rs, { brandings: [{ id: 'TST:Branding:gone', name: 'X', shortName: '', description: '', url: '', imageUrl: '' }] }))).toEqual([]);
    });
  });

  describe('project', () => {
    it('blocks a damaged route', () => {
      const issues = checkForExport({ routes: [{ code: '50', rs: route(), status: 'ok' }, { code: '60', rs: null, status: 'damaged' }], orgs: ORGS, register: registerCompanies(), orgMode: 'codespace', codespace: 'TST', brandings: [], orgsProblem: '', quayInfo: NSR });
      expect(codes(issues)).toEqual(['error:route-damaged']);
      expect(issues[0].route).toBe('60');
    });

    it('blocks a project without any trips', () => {
      const rs = route();
      grid0(rs).cols = [];
      expect(codes(check(rs))).toEqual(['error:no-trips', 'warning:route-no-trips']);
    });

    it('lists errors before warnings', () => {
      const rs = route();
      rs.routeName = '';
      grid0(rs).stops[1].stopId = null;
      expect(codes(check(rs))).toEqual(['error:no-name', 'error:stop-missing']); // no-name is an error (line header spec §7)
    });
  });

  describe('what the export actually writes', () => {
    it('blocks a trip with only one time', () => {
      const rs = route();
      grid0(rs).cols[0].cells[1] = null;
      const issues = check(rs);
      expect(codes(issues)).toEqual(['error:col-one-stop', 'error:no-trips', 'warning:route-no-trips']);
      expect(issues[0].where?.column).toBe(1);
    });

    it('warns that a route without trips is left out', () => {
      const empty = route();
      grid0(empty).cols = [];
      const issues = checkForExport({ routes: [{ code: '50', rs: route(), status: 'ok' }, { code: '60', rs: empty, status: 'ok' }], orgs: ORGS, register: registerCompanies(), orgMode: 'codespace', codespace: 'TST', brandings: [], orgsProblem: '', quayInfo: NSR });
      expect(codes(issues)).toEqual(['warning:route-no-trips']);
      expect(issues[0].route).toBe('60');
    });

    it('blocks a route code that cannot be a NeTEx ID', () => {
      const issues = checkForExport({ routes: [{ code: 'A&B 2', rs: route(), status: 'ok' }], orgs: ORGS, register: registerCompanies(), orgMode: 'codespace', codespace: 'TST', brandings: [], orgsProblem: '', quayInfo: NSR });
      expect(codes(issues)).toEqual(['error:route-code']);
    });

    it('warns about date exceptions the export cannot apply', () => {
      const rs = route();
      rs.footnotes = [{ id: 1, text: '', exceptions: [{ runsOnly: false, from: '20260301', to: '20260301' }] }];
      grid0(rs).cols[0].footnoteId = 1;
      expect(codes(check(rs))).toEqual(['warning:col-exceptions-ignored']);
    });

    it('warns about date exceptions on single times', () => {
      const rs = route();
      rs.footnotes = [{ id: 1, text: '', exceptions: [{ runsOnly: true, from: '20260301', to: '20260301' }] }];
      grid0(rs).cols[0].cells[1].footnoteId = 1;
      expect(codes(check(rs))).toEqual(['warning:col-exceptions-ignored']);
    });

    it('warns about a "runs only" date outside the period', () => {
      const rs = route();
      rs.footnotes = [{ id: 1, text: '', exceptions: [{ runsOnly: true, from: '20260801', to: '20260801' }] }];
      grid0(rs).cols[0].footnoteId = 1;
      expect(codes(check(rs))).toEqual(['warning:col-date-outside']);
    });

    it('accepts a "runs only" date inside the period', () => {
      const rs = route();
      rs.footnotes = [{ id: 1, text: '', exceptions: [{ runsOnly: true, from: '20260301', to: '20260301' }] }];
      grid0(rs).cols[0].footnoteId = 1;
      expect(check(rs)).toEqual([]);
    });

    it('warns about route files that changed on disk', () => {
      expect(codes(check(route(), { changedOnDisk: ['50'] }))).toEqual(['warning:route-changed-on-disk']);
    });
  });

  it('has a text for every code in both languages', () => {
    for (const lang of ['no', 'en']) {
      for (const code of CHECK_CODES) expect(/** @type {any} */ (STRINGS)[lang][`chk:${code}`], `${lang} ${code}`).toBeDefined();
    }
  });
});
