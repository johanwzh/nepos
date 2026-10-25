// Rules Antu (Entur's validator, netex-validator-java) applies, checked before export (user 2026-10-24).
import { describe, it, expect } from 'vitest';
import { checkForExport } from '../../../src/core/export-check.js';
import { bookingProblems, BOOK_WHEN, BUY_WHEN } from '../../../src/core/booking.js';
import { serializeERN } from '../../../src/core/ern/serialize.js';
import { miniErn, gridOf, buildLine, U } from '../../fixtures/mini-line.js';
import { registerCompanies } from '../../fixtures/orgs.js';

const OPTS = { delivery: { name: 'T', codespace: 'TST' }, orgs: [] };
const check = (/** @type {any} */ rs) => checkForExport({ routes: [{ code: '50', rs, status: 'ok' }], orgs: [], register: registerCompanies(), orgMode: 'codespace', codespace: 'TST', brandings: [], calendars: [{ id: 'h1', name: 'Vår', ranges: [['20260101', '20260630']] }], orgsProblem: '', quayInfo: new Map() });
const codes = (/** @type {any[]} */ issues) => issues.map((i) => `${i.level}:${i.code}`);

describe('booking rules (BOOKING_3, the BookWhen / LatestBookingTime / MinimumBookingPeriod rules, as Uttu)', () => {
  it('offers only the values the Nordic profile allows', () => {
    expect(BOOK_WHEN).toEqual(['dayOfTravelOnly', 'untilPreviousDay', 'advanceAndDayOfTravel']);
    expect(BUY_WHEN).toEqual(['onReservation', 'beforeBoarding', 'afterBoarding', 'onCheckOut']);
  });

  it('when to book needs a latest time, and the other way round', () => {
    expect(bookingProblems({ phone: '1', bookWhen: 'dayOfTravelOnly' })).toContain('booking-latest');
    expect(bookingProblems({ phone: '1', latest: '1800' })).toContain('booking-latest');
    expect(bookingProblems({ phone: '1', bookWhen: 'dayOfTravelOnly', latest: '1800' })).toEqual([]);
  });

  it('not both "when to book" and "at least before"; one of them is needed', () => {
    expect(bookingProblems({ phone: '1', bookWhen: 'untilPreviousDay', latest: '1800', minAhead: 'PT2H' })).toContain('booking-both');
    expect(bookingProblems({ phone: '1' })).toContain('booking-neither');
    expect(bookingProblems({ phone: '1', minAhead: 'PT2H' })).toEqual([]);
  });

  it('a way to book needs its contact: phone for calls and text, a web address for online', () => {
    expect(bookingProblems({ minAhead: 'PT1H', url: 'u', methods: ['callOffice'] })).toContain('booking-method-phone');
    expect(bookingProblems({ minAhead: 'PT1H', phone: '1', methods: ['online'] })).toContain('booking-method-url');
    expect(bookingProblems({ minAhead: 'PT1H', phone: '1', methods: ['phoneAtStop', 'text', 'callDriver'] })).toEqual([]);
  });

  it('the export check reports them as errors on the line', () => {
    const { rs, grid } = gridOf(miniErn());
    grid.cols[0].cells[1].booking = { phone: '1', bookWhen: 'dayOfTravelOnly' };
    expect(codes(check(rs))).toContain('error:booking-latest');
  });
});

describe('interchanges: the maximum wait time (INTERCHANGE_2, INTERCHANGE_3)', () => {
  const withIx = (/** @type {number | undefined} */ maxWait) => {
    const { rs, grid } = gridOf(miniErn());
    grid.cols[0].cells[2].interchange = { targetC: 1, targetR: 0, type: 'guaranteed', ...(maxWait ? { maxWait } : {}) };
    return rs;
  };

  it('writes MaximumWaitTime right after Guaranteed', () => {
    expect(buildLine(withIx(5)).line).toMatch(/<Guaranteed>true<\/Guaranteed>\s*<MaximumWaitTime>PT5M<\/MaximumWaitTime>\s*<FromPointRef/);
  });

  it('warns about a guaranteed interchange without one', () => {
    expect(codes(check(withIx(undefined)))).toContain('warning:ix-no-wait');
    expect(codes(check(withIx(5)))).not.toContain('warning:ix-no-wait');
  });

  it('keeps it in ERN (#MVT) and reads it back', () => {
    const rs = withIx(7);
    const text = serializeERN(rs, 'r', OPTS);
    expect(text).toContain('#MVT;0;2;7');
    expect(gridOf(text).grid.cols[0].cells[2].interchange.maxWait).toBe(7);
  });
});

describe('dates: day types with explicit dates, or DatedServiceJourneys per line', () => {
  it('by default writes one DayType per set of dates, with a DayTypeAssignment per date, and no DatedServiceJourneys', () => {
    const { rs } = gridOf(miniErn());
    const { shared, line } = buildLine(rs);
    expect(line).not.toContain('<DatedServiceJourney ');
    expect(line.split('<DayTypeRef ').length - 1).toBe(3); // one per trip
    expect(shared.split('<DayType ').length - 1).toBe(1); // all three run on the same dates
    expect(shared).toMatch(/<DayTypeAssignment id="TST:DayTypeAssignment:[^"]+" version="1" order="1">\s*<Date>2026-01-01<\/Date>\s*<DayTypeRef ref="TST:DayType:/);
    expect(shared).not.toContain('<OperatingDay ');
    // the order in the ServiceJourney: dayTypes before the JourneyPatternRef
    expect(line).toMatch(/<dayTypes>\s*<DayTypeRef ref="TST:DayType:[^"]+"[^>]*\/>\s*<\/dayTypes>\s*<JourneyPatternRef/);
  });

  it('with DatedServiceJourneys switched on for the line, writes them as before and no day types', () => {
    const { rs } = gridOf(miniErn());
    rs.dsj = true;
    const { shared, line } = buildLine(rs);
    expect(line).toContain('<DatedServiceJourney ');
    expect(line).not.toContain('<DayTypeRef ');
    expect(shared).toContain('<OperatingDay ');
    expect(shared).not.toContain('<DayType ');
  });

  it('keeps the choice in ERN (#DSJ)', () => {
    const { rs } = gridOf(miniErn());
    rs.dsj = true;
    const text = serializeERN(rs, 'r', OPTS);
    expect(text).toContain('#DSJ;1');
    expect(gridOf(text).rs.dsj).toBe(true);
    expect(gridOf(miniErn()).rs.dsj).toBe(false);
  });

  it('two trips with other dates get two day types', () => {
    const { rs, grid } = gridOf(miniErn());
    grid.cols[1].dayCode = '1';
    expect(buildLine(rs).shared.split('<DayType ').length - 1).toBe(2);
    expect(U).toHaveLength(3);
  });
});

describe('where a booking problem is (user 2026-10-25: "an inexplicable error about some phone number")', () => {
  it('a time\'s booking: its column and row', () => {
    const { rs, grid } = gridOf(miniErn());
    grid.cols[1].cells[2].booking = { url: 'u', minAhead: 'PT1H', methods: ['text'] };
    const i = check(rs).find((x) => x.code === 'booking-method-phone');
    expect(i?.where).toMatchObject({ column: 2, row: 2 });
  });

  it('a trip\'s booking: its column; the line\'s: said as the line\'s', () => {
    const { rs, grid } = gridOf(miniErn());
    grid.cols[2].booking = { phone: '1' };
    rs.booking = { url: 'u', minAhead: 'PT1H', methods: ['callOffice'] };
    const issues = check(rs);
    expect(issues.find((x) => x.code === 'booking-neither')?.where).toMatchObject({ column: 3 });
    expect(issues.find((x) => x.code === 'booking-method-phone')?.detail).toBe('line');
  });
});
