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

  it('a wait of 0 minutes is kept and written, and warned about (user 2026-10-26)', () => {
    const rs = withIx(undefined);
    /** @type {any} */ (Object.values(rs.grids)[0]).cols[0].cells[2].interchange.maxWait = 0;
    expect(codes(check(rs))).toContain('warning:ix-no-wait');
    expect(buildLine(rs).line).toContain('<MaximumWaitTime>PT0M</MaximumWaitTime>');
    const text = serializeERN(rs, 'r', OPTS);
    expect(text).toContain('#MVT;0;2;0');
    expect(gridOf(text).grid.cols[0].cells[2].interchange.maxWait).toBe(0);
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

describe('dates: a DatedServiceJourney for every trip on every day, for every line (user 2026-10-26)', () => {
  it('writes DatedServiceJourneys and OperatingDays, no day types, and ignores a #DSJ from a 2.4 test build', () => {
    const { rs } = gridOf(miniErn({ extra: ['#DSJ;0'] }));
    const { shared, line } = buildLine(rs);
    expect(line).toContain('<DatedServiceJourney ');
    expect(line).not.toContain('<DayTypeRef ');
    expect(shared).toContain('<OperatingDay ');
    expect(shared).not.toContain('<DayType ');
    expect(serializeERN(rs, 'r', OPTS)).not.toContain('#DSJ');
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
