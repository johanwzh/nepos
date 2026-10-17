import { describe, it, expect } from 'vitest';
import { parseERN } from '../../src/core/ern/parse.js';
import { checkForExport, CHECK_CODES } from '../../src/core/export-check.js';
import { STRINGS } from '../../src/i18n/strings.js';
import { projectCopy, registerCompanies } from '../fixtures/orgs.js';

const ORGS = projectCopy();
const bus = (/** @type {string} */ id, /** @type {string} */ name) => ({ quayId: id, publicCode: 'A', stopPlaceId: 'NSR:StopPlace:1', stopPlaceName: name, mode: 'bus', lat: 0, lon: 0 });
const NSR = new Map([['NSR:Quay:7203', bus('NSR:Quay:7203', 'Jernbanetorget')], ['NSR:Quay:11972', bus('NSR:Quay:11972', 'Oslo bussterminal')]]);

const CAL = 'cccccccc-0000-4000-8000-0000000000c1';
const CALENDARS = [{ id: CAL, name: 'Vinter', ranges: /** @type {[string, string][]} */ ([['20260101', '20260630']]) }];

/** A clean bus route: one table set, one period on a calendar, two NSR stops, one trip. */
const route = () => parseERN([
  '#RUT;-1;50;Jernbanetorget - Oslo bussterminal;;1;',
  '#SEK;NOG:Authority:aaaaaaaaaa1;Eksempel fylkeskommune;1;0;0;0', '#SEK;NOG:Operator:bbbbbbbbbb2;Eksempel Buss AS;0;1;0;0',
  '#DST;1;Oslo;',
  '#TRA;Tur', '#PER;;;;;;', `#KAL;${CAL}`, '#TAB;0;;;;', '#TUR;0;DX67;0;0;0;0',
  '#TRL;0;NSR:Quay:7203;Jernbanetorget;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;NSR:Quay:11972;Oslo bussterminal;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0',
  '#DSK;0;0;;1',
].join('\r\n') + '\r\n', { lang: 'no' });
const grid0 = (/** @type {any} */ rs) => rs.grids[`${rs.periods[0].id}:${rs.periods[0].setId}`];
/** The clean route, running on to a third stop. */
const three = () => {
  const rs = route();
  const g = grid0(rs);
  g.stops.push({ name: 'Jernbanetorget', stopId: 'NSR:Quay:7203', bold: false, sep: false, isDwellArr: false, price: null });
  g.cols[0].cells.push({ time: '0720', dayOffset: 0, suffix: '', interchange: null });
  g.cols[0].dests.push(null);
  return rs;
};

/** @param {any} rs @param {object} [extra] */
const check = (rs, extra = {}) => checkForExport({ routes: [{ code: '50', rs, status: 'ok' }], orgs: ORGS, register: registerCompanies(), orgMode: 'codespace', codespace: 'TST', brandings: [], calendars: CALENDARS, orgsProblem: '', quayInfo: NSR, ...extra });
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
      expect(issues[0]).toMatchObject({ route: '50', where: { tableSet: 'Tur', period: 'Vinter' }, detail: 'Oslo bussterminal' });
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
      expect(issues[0].where).toEqual({ tableSet: 'Tur', period: 'Vinter', column: 1 });
    });

    it('warns about a time earlier than the stop before it', () => {
      const rs = route();
      grid0(rs).cols[0].cells[1].time = '0650';
      expect(codes(check(rs))).toEqual(['warning:col-decreasing']);
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
      rs.mode = 'other'; // what a new line starts as: not a mode NeTEx accepts
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
      const issues = checkForExport({ routes: [{ code: '50', rs: route(), status: 'ok' }, { code: '60', rs: null, status: 'damaged' }], orgs: ORGS, register: registerCompanies(), orgMode: 'codespace', codespace: 'TST', brandings: [], calendars: CALENDARS, orgsProblem: '', quayInfo: NSR });
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
      const issues = checkForExport({ routes: [{ code: '50', rs: route(), status: 'ok' }, { code: '60', rs: empty, status: 'ok' }], orgs: ORGS, register: registerCompanies(), orgMode: 'codespace', codespace: 'TST', brandings: [], calendars: CALENDARS, orgsProblem: '', quayInfo: NSR });
      expect(codes(issues)).toEqual(['warning:route-no-trips']);
      expect(issues[0].route).toBe('60');
    });

    it('blocks a route code that cannot be a NeTEx ID', () => {
      const issues = checkForExport({ routes: [{ code: 'A&B 2', rs: route(), status: 'ok' }], orgs: ORGS, register: registerCompanies(), orgMode: 'codespace', codespace: 'TST', brandings: [], calendars: CALENDARS, orgsProblem: '', quayInfo: NSR });
      expect(codes(issues)).toEqual(['error:route-code']);
    });

    it('exports a trip\'s own dates and a time switched off on some days without a warning', () => {
      const rs = three();
      grid0(rs).cols[0].dates = [{ from: '20260301', to: '20260301', on: false }];
      expect(codes(check(rs))).toEqual([]);
      grid0(rs).cols[0].cells[1].dates = [{ from: '20260302', to: '20260302', on: false }];
      expect(codes(check(rs))).toEqual([]);
    });

    it('warns that "runs also" on a single time does nothing', () => {
      const rs = route();
      grid0(rs).cols[0].cells[1].dates = [{ from: '20260302', to: '20260302', on: true }];
      expect(codes(check(rs))).toEqual(['warning:cell-dates-also']);
    });

    it('warns when switching times off leaves a day with only one stop', () => {
      const rs = route();
      grid0(rs).cols[0].cells[1].dates = [{ from: '20260302', to: '20260303', on: false }];
      const issues = check(rs);
      expect(codes(issues)).toEqual(['warning:cell-dates-short']);
      expect(issues[0].detail).toBe('2');
    });

    it('warns about route files that changed on disk', () => {
      expect(codes(check(route(), { changedOnDisk: ['50'] }))).toEqual(['warning:route-changed-on-disk']);
    });
  });

  describe('table sets, calendars and day codes', () => {
    it('blocks a table set without a name', () => {
      const rs = route();
      rs.tableSets[0].name = '';
      expect(codes(check(rs))).toEqual(['error:table-set-name']);
    });

    it('blocks a period without a calendar, or with a calendar that is not in the project', () => {
      const rs = route();
      rs.periods[0].calendarIds = [];
      expect(codes(check(rs))).toContain('error:no-calendar');
      rs.periods[0].calendarIds = ['gone'];
      expect(codes(check(rs))).toContain('error:calendar-missing');
    });

    it('warns about an empty calendar and a trip with no operating days', () => {
      expect(codes(check(route(), { calendars: [{ id: CAL, name: 'Tom', ranges: [] }] }))).toEqual(['warning:calendar-empty', 'warning:no-operating-days']);
    });

    it('blocks a day code Nepos cannot turn into dates (S)', () => {
      const rs = route();
      grid0(rs).cols[0].dayCode = 'S';
      expect(codes(check(rs))).toContain('error:day-code');
    });

    it('warns about a trip whose own dates take away every day', () => {
      const rs = route();
      grid0(rs).cols[0].dates = [{ from: '20200101', to: '20351231', on: false }];
      expect(codes(check(rs))).toEqual(['warning:no-operating-days']);
    });
  });

  it('has a text for every code in both languages', () => {
    for (const lang of ['no', 'en']) {
      for (const code of CHECK_CODES) expect(/** @type {any} */ (STRINGS)[lang][`chk:${code}`], `${lang} ${code}`).toBeDefined();
    }
  });
});

describe('destinations', () => {
  /** The route with a third stop (Oslo S) and the trip running on to it. */
  const three = () => {
    const rs = route();
    const g = grid0(rs);
    g.stops.push({ name: 'Jernbanetorget', stopId: 'NSR:Quay:7203', bold: false, sep: false, isDwellArr: false, price: null });
    g.cols[0].cells.push({ time: '0720', dayOffset: 0, suffix: '', interchange: null });
    g.cols[0].dests.push(null);
    return rs;
  };
  const destCodes = (rs) => codes(check(rs)).filter((c) => c.includes('dest'));

  it('blocks a trip without a destination', () => {
    const rs = route();
    grid0(rs).cols[0].dest = null;
    const issues = check(rs).filter((i) => i.code.startsWith('dest'));
    expect(codes(issues)).toEqual(['error:dest-missing']);
    expect(issues[0].where).toMatchObject({ column: 1 });
  });

  it('blocks via written into the text', () => {
    const rs = route();
    grid0(rs).cols[0].dest = { text: 'Oslo via Sentrum', vias: [] };
    expect(destCodes(rs)).toContain('error:dest-via-text');
  });

  it('warns about a change on a row the trip does not serve', () => {
    const rs = three();
    grid0(rs).cols[0].cells[1] = null;
    grid0(rs).cols[0].dests[1] = { text: 'Jernbanetorget', vias: [] };
    grid0(rs).cols[0].dest = { text: 'Jernbanetorget', vias: [] };
    expect(destCodes(rs)).toEqual(['warning:dest-unserved']);
  });

  it('warns about a destination or a via the trip does not go to', () => {
    const rs = route();
    grid0(rs).cols[0].dest = { text: 'Røros', vias: [] };
    expect(destCodes(rs)).toEqual(['warning:dest-not-on-route']);
    grid0(rs).cols[0].dest = { text: 'Oslo', vias: ['Støren'] };
    expect(check(rs).find((i) => i.code === 'dest-not-on-route')?.detail).toBe('Støren');
  });

  it('finds nothing wrong with a destination, a via and a change that fit the trip', () => {
    const rs = three();
    grid0(rs).cols[0].dest = { text: 'Jernbanetorget', vias: ['Oslo'] };
    grid0(rs).cols[0].dests[1] = { text: 'Jernbanetorget', vias: [] };
    expect(destCodes(rs)).toEqual([]);
  });

  it('has texts for its codes in both languages', () => {
    for (const code of ['dest-missing', 'dest-via-text', 'dest-unserved', 'dest-not-on-route']) {
      expect(CHECK_CODES).toContain(code);
      for (const lang of Object.keys(STRINGS)) expect(STRINGS[lang][`chk:${code}`]).toBeTruthy();
    }
  });
});
