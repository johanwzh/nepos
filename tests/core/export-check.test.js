import { describe, it, expect } from 'vitest';
import { parseERN } from '../../src/core/ern/parse.js';
import { checkForExport, CHECK_CODES } from '../../src/core/export-check.js';
import { STRINGS } from '../../src/i18n/strings.js';
import { projectCopy, registerCompanies } from '../fixtures/orgs.js';

/** The project copy, each role with an export ID (alias), as a ready project has */
const ORGS = projectCopy().map((c, n) => ({ ...c,
  authority: c.authority && { ...c.authority, alias: `TST:Authority:${n + 1}` },
  operator: c.operator && { ...c.operator, alias: `TST:Operator:${n + 1}` } }));
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

    it('warns about what NSR says; a stop of another mode than the line is an error, as in Antu (user 2026-10-30)', () => {
      expect(codes(check(route(), { quayInfo: new Map([...NSR, ['NSR:Quay:11972', null]]) }))).toEqual(['warning:stop-not-seen']);
      expect(codes(check(route(), { quayInfo: new Map([...NSR, ['NSR:Quay:11972', { ...bus('NSR:Quay:11972', 'Oslo S'), mode: 'rail' }]]) }))).toEqual(['error:stop-mode']);
      expect(codes(check(route(), { quayInfo: new Map() }))).toEqual(['warning:stop-unchecked']);
    });

    it('a cableway line (no ERN mode code) with bus stops: an error (user 2026-10-30)', () => {
      const rs = route();
      rs.mode = 'cableway'; rs.submode = 'telecabin'; rs.transportMode = 0;
      expect(codes(check(rs, { quayInfo: NSR })).filter((c) => c.endsWith('stop-mode'))).toEqual(['error:stop-mode']);
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
      expect(issues[0].where).toEqual({ tableSet: 'Tur', period: 'Vinter', column: 1, setId: rs.periods[0].setId, periodId: rs.periods[0].id });
    });

    it('warns about a time earlier than the stop before it', () => {
      const rs = route();
      grid0(rs).cols[0].cells[1].time = '0650';
      expect(codes(check(rs))).toEqual(['error:col-decreasing']); // an error in Antu (TIMETABLED_PASSING_TIME_NON_INCREASING_TIME), so here too (user 2026-10-24)
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
      const noMissing = (/** @type {string[]} */ c) => c.filter((x) => x !== 'warning:org-alias-missing');
      expect(noMissing(codes(check(route(), { orgs })))).toEqual(['error:org-alias-format']);
      expect(codes(check(route(), { orgs, orgMode: 'nog' }))).toEqual([]);
      const dup = projectCopy();
      /** @type {any} */ (dup[1].operator).alias = 'TST:Authority:aaaaaaaaaa1'; // wrong role and a duplicate
      expect(noMissing(codes(check(route(), { orgs: dup })))).toEqual(['error:org-alias-format', 'error:org-alias-duplicate', 'error:org-alias-duplicate']);
    });

    it('blocks, in codespace mode, an organisation that is in the register but not in the project copy', () => {
      expect(codes(check(route(), { orgs: [ORGS[0]] }))).toEqual(['error:org-not-in-project']);
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

  it('does not warn about a destination or a via the trip does not go to (too repetitive, off for now: user 2026-10-20)', () => {
    const rs = route();
    grid0(rs).cols[0].dest = { text: 'Røros', vias: [] };
    expect(destCodes(rs)).toEqual([]);
    grid0(rs).cols[0].dest = { text: 'Oslo', vias: ['Støren'] };
    expect(check(rs).filter((i) => i.code === 'dest-not-on-route')).toEqual([]);
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

describe('check messages (user 2026-10-18)', () => {
  it('says what is wrong with a damaged line', () => {
    const issues = checkForExport({ routes: [{ code: '50', rs: null, status: 'damaged', problem: '#KOS would be lost' }], orgs: ORGS, register: registerCompanies(), orgMode: 'codespace', codespace: 'TST', brandings: [], calendars: CALENDARS, orgsProblem: '', quayInfo: NSR });
    expect(issues[0]).toMatchObject({ code: 'route-damaged', detail: '#KOS would be lost' });
  });

});

describe('organisation aliases (user 2026-10-18)', () => {
  it('warns about a used organisation without an export ID (alias): Entur cannot read NOG IDs yet', () => {
    const issues = checkForExport({ routes: [{ code: '50', rs: route(), status: 'ok' }], orgs: projectCopy(), register: registerCompanies(), orgMode: 'codespace', codespace: 'TST', brandings: [], calendars: CALENDARS, orgsProblem: '', quayInfo: NSR });
    const missing = issues.filter((i) => i.code === 'org-alias-missing');
    expect(missing.map((i) => i.level)).toEqual(['warning', 'warning']);
    expect(missing[0].detail).toMatch(/Eksempel/);
  });
});

describe('small wave 2: a change on the last stop', () => {
  it('says that it is dropped on save (a warning)', () => {
    const rs = route();
    grid0(rs).cols[0].dests[1] = { text: 'X', vias: [] };
    expect(codes(check(rs))).toContain('warning:dest-last-dropped');
  });
});

describe('a missing submode (user 2026-10-19)', () => {
  it('is an error when the mode has submodes', () => {
    const rs = route();
    rs.mode = 'bus'; rs.submode = '';
    expect(codes(check(rs))).toContain('error:no-submode');
  });

  it('is not needed for a mode without submodes', () => {
    const rs = route();
    rs.mode = 'ferry'; rs.submode = '';
    expect(codes(check(rs))).not.toContain('error:no-submode');
  });
});

describe('speeds (user and customer 2026-10-19)', () => {
  // Jernbanetorget at 59.9, Oslo bussterminal 0.2° further north: about 22 km in 10 minutes = 133 km/h
  const placed = (/** @type {number} */ north) => new Map([['NSR:Quay:7203', { ...bus('NSR:Quay:7203', 'Jernbanetorget'), lat: 59.9, lon: 10.75 }], ['NSR:Quay:11972', { ...bus('NSR:Quay:11972', 'Oslo bussterminal'), lat: 59.9 + north, lon: 10.75 }]]);

  it("blocks a leg faster than the mode's limit (a red arc), naming the stops, the speed and the limit", () => {
    const issues = check(route(), { quayInfo: placed(0.2) });
    expect(codes(issues)).toEqual(['error:speed-over']);
    expect(issues[0]).toMatchObject({ route: '50', where: { column: 1, row: 1 } });
    expect(issues[0].detail).toContain('Jernbanetorget');
    expect(issues[0].detail).toContain('Oslo bussterminal');
    expect(issues[0].detail).toContain('133');
    expect(issues[0].detail).toContain('80');
  });

  it('lets a normal speed through', () => {
    expect(check(route(), { quayInfo: placed(0.1) })).toEqual([]); // 67 km/h
  });

  it("uses the project's own limit, and warns when it is far above the default", () => {
    expect(check(route(), { quayInfo: placed(0.2), speedLimits: { bus: 100 } }).map((i) => i.code)).toEqual(['speed-over']);
    const issues = check(route(), { quayInfo: placed(0.2), speedLimits: { bus: 150 } });
    expect(codes(issues)).toEqual(['warning:speed-limit-high']);
    expect(issues[0].detail).toContain('150');
    expect(codes(check(route(), { quayInfo: placed(0.1), speedLimits: { bus: 120 } }))).toEqual([]); // 1.5 × 80: not above
  });

  it('warns about a raised limit only for a mode the exported lines use', () => {
    expect(codes(check(route(), { quayInfo: placed(0.1), speedLimits: { tram: 200 } }))).toEqual([]);
  });
});

describe('vehicles on trips (user 2026-10-20)', () => {
  const V = (/** @type {object} */ v) => ({ id: 'v1', name: 'Buss 7', colour: '#2f6fb5', transportMode: 'bus', ...v });
  it('a vehicle of another mode than the line is an error', () => {
    const rs = route();
    grid0(rs).cols[0].vehicle = 'Ferje 1';
    const issues = check(rs, { vehicles: [V({ name: 'Ferje 1', transportMode: 'water' })] });
    expect(issues.filter((i) => i.code === 'vehicle-mode')).toEqual([expect.objectContaining({ level: 'error', route: '50', detail: 'Ferje 1' })]);
  });

  it('a vehicle of the line\'s mode, or with no mode, is fine', () => {
    const rs = route();
    grid0(rs).cols[0].vehicle = 'Buss 7';
    expect(check(rs, { vehicles: [V({})] }).filter((i) => i.code === 'vehicle-mode')).toEqual([]);
    expect(check(rs, { vehicles: [V({ transportMode: '' })] }).filter((i) => i.code === 'vehicle-mode')).toEqual([]);
    expect(check(rs).filter((i) => i.code === 'vehicle-mode')).toEqual([]); // no vehicle list given
  });

  it('modes that go together are fine: road vehicles on a road line, a boat or the old ferry on a water line (backlog 70)', () => {
    const rs = route();
    grid0(rs).cols[0].vehicle = 'Taxi 1';
    expect(check(rs, { vehicles: [V({ name: 'Taxi 1', transportMode: 'taxi' })] }).filter((i) => i.code === 'vehicle-mode')).toEqual([]);
    expect(check(rs, { vehicles: [V({ name: 'Taxi 1', transportMode: 'coach' })] }).filter((i) => i.code === 'vehicle-mode')).toEqual([]);
    const boat = route();
    boat.mode = 'water';
    grid0(boat).cols[0].vehicle = 'Ferje 1';
    expect(check(boat, { vehicles: [V({ name: 'Ferje 1', transportMode: 'ferry' })] }).filter((i) => i.code === 'vehicle-mode')).toEqual([]);
    expect(check(boat, { vehicles: [V({ name: 'Ferje 1', transportMode: 'water' })] }).filter((i) => i.code === 'vehicle-mode')).toEqual([]);
  });

  it('a snowcoach on a road line (bus, coach, taxi) is fine, a bus on a snowAndIce line is an error (backlog 70)', () => {
    const rs = route();
    grid0(rs).cols[0].vehicle = 'Snøbuss';
    for (const mode of ['bus', 'coach', 'taxi']) {
      rs.mode = mode;
      expect(check(rs, { vehicles: [V({ name: 'Snøbuss', transportMode: 'snowAndIce' })] }).filter((i) => i.code === 'vehicle-mode'), mode).toEqual([]);
    }
    const snow = route();
    snow.mode = 'snowAndIce';
    grid0(snow).cols[0].vehicle = 'Buss 7';
    expect(check(snow, { vehicles: [V({})] }).filter((i) => i.code === 'vehicle-mode')).toEqual([expect.objectContaining({ level: 'error', detail: 'Buss 7' })]);
  });

  it('has texts in both languages', () => {
    expect(CHECK_CODES).toContain('vehicle-mode');
    for (const lang of Object.keys(STRINGS)) expect(STRINGS[lang]['chk:vehicle-mode']).toBeTruthy();
  });
});

describe('routed links in the check (2.6: a warning, never an error)', () => {
  const KEY = 'NSR:Quay:7203|NSR:Quay:11972|bus';
  /** @param {Record<string, any>} links */
  const lineLinks = (links) => new Map([['50', { version: 1, line: '50', links, snaps: {} }]]);
  const ok = { polyline: '', precision: 6, distanceM: 900, status: 'OK', from: [0, 0], to: [0, 0] };

  it('warns once per line with the counts of legs not routed and out of date', () => {
    const issues = check(three(), { links: lineLinks({ [KEY]: { ...ok, to: [0.001, 0] } }) });
    expect(issues).toEqual([{ level: 'warning', code: 'link-missing', route: '50', detail: '1|1' }]);
    expect(STRINGS.en['chk:link-missing']('1|1')).toBe('1 leg not routed, 1 out of date — open Routing on the line.');
    expect(STRINGS.no['chk:link-missing']('4|0')).toBe('4 strekninger er ikke rutet — åpne Ruting på linjen.');
  });

  it('nothing when every leg is routed, or when no links are given', () => {
    expect(check(route(), { links: lineLinks({ [KEY]: ok }) })).toEqual([]);
    expect(check(route())).toEqual([]);
  });

  it('a rail line is routed too (routing for all modes); an air line has nothing', () => {
    const rs = route();
    rs.mode = 'rail'; rs.submode = 'regionalRail';
    expect(codes(check(rs, { links: new Map() })).filter((c) => c.endsWith('link-missing'))).toHaveLength(1);
    rs.mode = 'air'; rs.submode = 'domesticFlight';
    expect(codes(check(rs, { links: new Map() })).filter((c) => c.endsWith('link-missing'))).toEqual([]);
  });
});

// Knutepunkt (interchanges spec 2026-10-31): an approved link whose match changed is a warning, never an error
describe('Knutepunkt links', () => {
  const FEED_TRIP = 'cccccccc-0000-4000-8000-0000000000f1';
  /** Our route (Jernbanetorget 07:00 → Oslo bussterminal) with a hub at Jernbanetorget, row 0, and the trip's link. */
  const withHub = (/** @type {string} */ link, hubStop = 'NSR:Quay:7203') => {
    const rs = route();
    const g = grid0(rs);
    g.cols[0].uid = 'cccccccc-0000-4000-8000-0000000000a1'; // a trip is picked by its uid
    g.stops[0].hub = { stopId: hubStop, stops: ['NSR:StopPlace:1'], radiusM: null, window: [2, 15], maxWait: 5, walk: 0, criteria: {} };
    g.cols[0].cells[0].hubLink = link ? { line: 'F', trip: FEED_TRIP, stopId: 'NSR:Quay:11972', arr: link === 'same' ? 412 : 410, at: 'x' } : {};
    return rs;
  };
  /** A feeder line F arriving at Oslo bussterminal (same StopPlace in NSR here) at 06:52. */
  const feederLine = () => {
    const rs = route();
    const g = grid0(rs);
    g.cols[0].uid = FEED_TRIP;
    g.cols[0].cells[0].time = '0640'; g.cols[0].cells[1].time = '0652';
    return rs;
  };
  const run = (/** @type {any} */ ours, /** @type {any[]} */ more = []) => checkForExport({ routes: [{ code: '50', rs: ours, status: 'ok' }, ...more], orgs: ORGS, register: registerCompanies(), orgMode: 'codespace', codespace: 'TST', brandings: [], calendars: CALENDARS, orgsProblem: '', quayInfo: NSR })
    .filter((i) => i.code.startsWith('hub-'));
  const F = { code: 'F', rs: feederLine(), status: 'ok' };

  it('no hubs, no issues; an approved link that still matches, none', () => {
    expect(run(route(), [F])).toEqual([]);
    expect(run(withHub('same'), [F])).toEqual([]);
    expect(run(withHub(''), [F])).toEqual([]);
  });

  it('hub-stale: the feeder arrives at another time', () => {
    expect(run(withHub('changed'), [F])).toEqual([{ level: 'warning', code: 'hub-stale', route: '50', where: expect.objectContaining({ row: 0 }), detail: '1|Jernbanetorget' }]);
  });

  it('hub-lost: the row\'s stop was changed', () => {
    expect(run(withHub('same', 'NSR:Quay:1'), [F]).map((i) => [i.code, i.detail])).toEqual([['hub-lost', 'Jernbanetorget']]);
  });

  it('hub-missing-feeder: the feeder line is not exported, said once per hub', () => {
    const rs = withHub('same');
    grid0(rs).cols.push({ ...grid0(rs).cols[0], uid: 'cccccccc-0000-4000-8000-0000000000a2', cells: grid0(rs).cols[0].cells.map((/** @type {any} */ c) => c && { ...c }) });
    expect(run(rs).map((i) => [i.code, i.detail])).toEqual([['hub-missing-feeder', 'Jernbanetorget|F']]);
  });

  it('has texts for its codes in both languages', () => {
    for (const code of ['hub-lost', 'hub-stale', 'hub-missing-feeder']) {
      expect(CHECK_CODES).toContain(code);
      for (const lang of Object.keys(STRINGS)) expect(STRINGS[lang][`chk:${code}`]).toBeTruthy();
    }
  });
});

describe('vehicle limits on the route (backlog 93, design 2026-11-03 §11)', () => {
  const KEY = 'NSR:Quay:7203|NSR:Quay:11972|bus';
  /** @param {Record<string, any>} links */
  const lineLinks = (links) => new Map([['50', { version: 1, line: '50', links, snaps: {} }]]);
  const H = (/** @type {number} */ v) => ({ height: { kind: 'height', value: v, way: 77, road: 'Matrandvegen', at: [0, 0] } });
  const ok = (extra = {}) => ({ polyline: '', precision: 6, distanceM: 900, status: 'OK', from: [0, 0], to: [0, 0], ...extra });
  const V = [{ name: 'TB', height: 4 }, { name: 'LB', height: 3.3 }, { name: 'LB3', height: 3 }, { name: 'Plain' }];
  /** The clean route, its trip run by these vehicles (one trip each, an hour apart). @param {string[]} names */
  const run = (names) => {
    const rs = route();
    const g = grid0(rs), first = g.cols[0];
    g.cols = names.map((name, i) => ({ ...structuredClone(first), vehicle: name, uid: `cccccccc-0000-4000-8000-00000000010${i}`,
      cells: first.cells.map((/** @type {any} */ c) => (c ? { ...c, time: `${String(7 + i).padStart(2, '0')}${c.time.slice(2)}` } : c)) }));
    return rs;
  };
  const mine = (/** @type {any[]} */ issues) => issues.filter((i) => i.code.startsWith('vehicle-'));

  it('a vehicle over a limit on its route: one error per vehicle and limit, with the trips counted and the first as its place', () => {
    const issues = mine(check(run(['TB', 'TB']), { vehicles: V, links: lineLinks({ [KEY]: ok({ limits: H(3.7) }) }) }));
    expect(issues).toEqual([{ level: 'error', code: 'vehicle-limit', route: '50', detail: 'TB|height|4|3.7|Matrandvegen|Jernbanetorget|Oslo bussterminal|2',
      where: expect.objectContaining({ column: 1 }) }]);
    expect(STRINGS.en['chk:vehicle-limit'](issues[0].detail)).toBe('TB (4.0 m) is taller than the 3.7 m clearance on Matrandvegen, Jernbanetorget – Oslo bussterminal (2 trips): change the vehicle or route it again.');
    expect(STRINGS.no['chk:vehicle-limit'](issues[0].detail)).toBe('TB (4,0 m) er høyere enn fri høyde 3,7 m på Matrandvegen, Jernbanetorget – Oslo bussterminal (2 turer): bytt kjøretøy eller ruter på nytt.');
  });

  it('close to a limit: a warning', () => {
    const issues = mine(check(run(['LB']), { vehicles: V, links: lineLinks({ [KEY]: ok({ limits: H(3.7) }) }) }));
    expect(issues.map((i) => [i.level, i.code, i.detail])).toEqual([['warning', 'vehicle-limit-close', 'LB|height|3.3|3.7|Matrandvegen|Jernbanetorget|Oslo bussterminal|1']]);
    expect(STRINGS.en['chk:vehicle-limit-close'](issues[0].detail)).toBe('LB (3.3 m) has less than 0.5 m to spare under the 3.7 m clearance on Matrandvegen, Jernbanetorget – Oslo bussterminal (1 trip).');
  });

  it('routes not checked against the vehicle, or to reconfirm: one warning per line with the count', () => {
    const issues = mine(check(run(['TB', 'LB3']), { vehicles: V, links: lineLinks({ [KEY]: ok(), [`${KEY}|h4`]: ok({ limits: {}, uturn: 12 }) }) }));
    expect(issues).toEqual([{ level: 'warning', code: 'vehicle-route-check', route: '50', detail: '1' }]);
    expect(STRINGS.en['chk:vehicle-route-check']('1')).toBe('1 leg to reconfirm or not yet checked against the vehicle sizes — open Routing on the line.');
    expect(mine(check(run(['TB']), { vehicles: V, links: lineLinks({ [KEY]: ok() }) }))).toEqual([{ level: 'warning', code: 'vehicle-route-check', route: '50', detail: '1' }]);
  });

  it('nothing for trips without a vehicle or sizes, without links, or off roads', () => {
    expect(mine(check(run(['', 'Plain']), { vehicles: V, links: lineLinks({ [KEY]: ok({ limits: H(2) }) }) }))).toEqual([]);
    expect(mine(check(run(['TB']), { vehicles: V }))).toEqual([]);
    const rail = run(['TB']);
    rail.mode = 'rail'; rail.submode = 'regionalRail';
    expect(mine(check(rail, { vehicles: V, links: lineLinks({ 'NSR:Quay:7203|NSR:Quay:11972|rail': ok({ limits: H(2) }) }) }))).toEqual([]);
  });

  it('has texts in both languages', () => {
    for (const code of ['vehicle-limit', 'vehicle-limit-close', 'vehicle-route-check']) {
      expect(CHECK_CODES).toContain(code);
      for (const lang of Object.keys(STRINGS)) expect(STRINGS[lang][`chk:${code}`]).toBeTruthy();
    }
  });
});
