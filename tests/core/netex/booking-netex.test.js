// Booking in NeTEx (booking spec 2026-10-22, as Uttu writes it): BookingArrangements on the StopPointInJourneyPattern,
// FlexibleServiceProperties on the ServiceJourney for a trip (and, provisionally, the line), RequestStop.
import { describe, it, expect } from 'vitest';
import { checkForExport } from '../../../src/core/export-check.js';
import { miniErn, gridOf, buildLine, U } from '../../fixtures/mini-line.js';
import { registerCompanies } from '../../fixtures/orgs.js';

const B = { phone: '+47 1', email: 'a@b.no', url: 'https://b.no', bookWhen: 'untilPreviousDay', access: 'public', methods: ['callOffice', 'online'], buyWhen: ['beforeBoarding'], latest: '1800', minAhead: 'PT2H', note: 'Ring dagen før' };
const jpOf = (/** @type {string} */ line, /** @type {string} */ uid) => /<JourneyPatternRef ref="([^"]+)"/.exec(line.slice(line.indexOf(`<ServiceJourney id="TST:ServiceJourney:${uid}"`)))?.[1];
const sjOf = (/** @type {string} */ line, /** @type {string} */ uid) => { const s = line.slice(line.indexOf(`<ServiceJourney id="TST:ServiceJourney:${uid}"`)); return s.slice(0, s.indexOf('</ServiceJourney>')); };
const inOrder = (/** @type {string} */ s, /** @type {string[]} */ parts) => parts.every((p, i) => i === 0 || s.indexOf(parts[i - 1]) < s.indexOf(p)) && parts.every((p) => s.includes(p));

describe('booking in NeTEx', () => {
  it('writes BookingArrangements on the stop point, in the schema order', () => {
    const { rs, grid } = gridOf(miniErn());
    grid.cols[0].cells[1].booking = B;
    const { line } = buildLine(rs);
    const sp = line.split('<StopPointInJourneyPattern ').slice(1).find((p) => p.includes('<BookingArrangements>'));
    expect(sp).toBeDefined();
    expect(inOrder(/** @type {string} */ (sp), ['<ScheduledStopPointRef', '<BookingArrangements>', '<BookingContact>', '<Email>a@b.no</Email>', '<Phone>+47 1</Phone>', '<Url>https://b.no</Url>', '</BookingContact>',
      '<BookingMethods>callOffice online</BookingMethods>', '<BookingAccess>public</BookingAccess>', '<BookWhen>untilPreviousDay</BookWhen>', '<BuyWhen>beforeBoarding</BuyWhen>',
      '<LatestBookingTime>18:00:00</LatestBookingTime>', '<MinimumBookingPeriod>PT2H</MinimumBookingPeriod>', '<BookingNote>Ring dagen før</BookingNote>'])).toBe(true);
  });

  it('gives trips that differ only in a stop booking or a request stop their own pattern', () => {
    const { rs, grid } = gridOf(miniErn());
    grid.cols[0].cells[1].booking = B;
    grid.cols[2].cells[1].req = true;
    const { line } = buildLine(rs);
    expect(new Set([jpOf(line, U[0]), jpOf(line, U[1]), jpOf(line, U[2])]).size).toBe(3);
  });

  it('writes a trip booking as FlexibleServiceProperties after the passing times', () => {
    const { rs, grid } = gridOf(miniErn());
    grid.cols[1].booking = { phone: '22', bookWhen: 'dayOfTravelOnly' };
    const { line } = buildLine(rs);
    const sj = sjOf(line, U[1]);
    expect(inOrder(sj, ['</passingTimes>', '<FlexibleServiceProperties id="TST:FlexibleServiceProperties:', '<Phone>22</Phone>', '<BookWhen>dayOfTravelOnly</BookWhen>'])).toBe(true);
    expect(sjOf(line, U[0])).not.toContain('FlexibleServiceProperties');
  });

  it('writes the line booking on every trip without its own (provisional, until Entur answers)', () => {
    const { rs, grid } = gridOf(miniErn());
    rs.booking = { phone: '33' };
    grid.cols[1].booking = { phone: '22' };
    const { line } = buildLine(rs);
    expect(sjOf(line, U[0])).toContain('<Phone>33</Phone>');
    expect(sjOf(line, U[1])).toContain('<Phone>22</Phone>');
    expect(sjOf(line, U[1])).not.toContain('<Phone>33</Phone>');
  });

  it('warns about a booking with no phone, e-mail or web address', () => {
    const { rs, grid } = gridOf(miniErn());
    grid.cols[0].cells[1].booking = { bookWhen: 'dayOfTravelOnly' };
    const issues = checkForExport({ routes: [{ code: '50', rs, status: 'ok' }], orgs: [], register: registerCompanies(), orgMode: 'codespace', codespace: 'TST', brandings: [], calendars: [{ id: 'h1', name: 'Vår', ranges: [['20260101', '20260630']] }], orgsProblem: '', quayInfo: new Map() });
    expect(issues.some((i) => i.code === 'booking-no-contact' && i.level === 'warning')).toBe(true);
  });
});
