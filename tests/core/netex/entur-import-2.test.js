// Entur's import, round 2 (user 2026-10-18): no getting off at the first stop or on at the last, the last stop
// has only an arrival time and the first only a departure, and a ServiceJourney does not repeat the line's mode.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';

const rows = [
  '#TRL;0;NSR:Quay:1;A;0;-1;-1;-1;0;-1', '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;B;0;-1;-1;-1;0;-1', '#TRC;0;0710;0;0;0;0;0',
  '#TRL;2;NSR:Quay:3;C;0;-1;-1;-1;0;-1', '#TRC;0;0720;1;0;0;0;0',
];
const line = buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs: parseERN([
  '#LEV;T;TST', '#RUT;-1;1;Linje;;6;', '#SEK;TST:Authority:1;F;1;0;0;0', '#SEK;TST:Operator:1;B;0;1;0;0', '#DST;1;C;',
  '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0', ...rows, '#DSK;0;0;;1',
].join('\r\n') + '\r\n') }], orgs: [], brandings: [], calendars: [{ id: 'h1', name: 'V', ranges: [['20260101', '20260630']] }], timestamp: 'x' })[1].xml;
const between = (/** @type {string} */ open, /** @type {string} */ close) => line.slice(line.indexOf(open), line.indexOf(close, line.indexOf(open)));

describe('stop points', () => {
  const points = between('<JourneyPattern ', '</JourneyPattern>').split('<StopPointInJourneyPattern ').slice(1);
  it('no getting off at the first stop', () => {
    expect(points[0]).toContain('<ForAlighting>false</ForAlighting>');
    expect(points[0]).not.toContain('ForBoarding');
  });
  it('no getting on at the last stop', () => {
    expect(points[2]).toContain('<ForBoarding>false</ForBoarding>');
    expect(points[2]).not.toContain('ForAlighting');
  });
  it('nothing extra in between', () => {
    expect(points[1]).not.toMatch(/ForBoarding|ForAlighting/);
  });
});

describe('passing times', () => {
  const times = between('<passingTimes>', '</passingTimes>').split('<TimetabledPassingTime ').slice(1);
  it('first stop: departure only', () => {
    expect(times[0]).toContain('<DepartureTime>07:00:00</DepartureTime>');
    expect(times[0]).not.toContain('ArrivalTime');
  });
  it('last stop: arrival only, with its day offset', () => {
    expect(times[2]).toContain('<ArrivalTime>07:20:00</ArrivalTime>');
    expect(times[2]).toContain('<ArrivalDayOffset>1</ArrivalDayOffset>');
    expect(times[2]).not.toMatch(/Departure/);
  });
});

describe('ServiceJourney', () => {
  it('does not repeat the line\'s TransportMode', () => {
    expect(between('<ServiceJourney ', '</ServiceJourney>')).not.toContain('TransportMode');
  });
});
