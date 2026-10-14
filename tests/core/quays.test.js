import { describe, it, expect } from 'vitest';
import { NSR_QUAY_PATTERN, stopLocalId, quayRef, quayIdsInErn, modeMatches, quayStatus } from '../../src/core/quays.js';

describe('NSR Quay IDs', () => {
  it('recognises NSR Quay IDs only', () => {
    expect(NSR_QUAY_PATTERN.test('NSR:Quay:7203')).toBe(true);
    for (const id of ['101', 'NSR:StopPlace:4000', 'nsr:quay:7203', 'NSR:Quay:', 'NSR:Quay:7203 ']) expect(NSR_QUAY_PATTERN.test(id)).toBe(false);
  });

  it('makes NeTEx-safe local IDs', () => {
    expect(stopLocalId('NSR:Quay:7203')).toBe('NSR-Quay-7203');
    expect(stopLocalId('101')).toBe('101');
  });

  it('refers to NSR Quays as-is and to old IDs in the codespace', () => {
    expect(quayRef('NSR:Quay:7203', 'TST')).toBe('NSR:Quay:7203');
    expect(quayRef('101', 'TST')).toBe('TST:Quay:101');
  });

  it('finds the NSR Quay IDs in a route file, once each', () => {
    const text = '#TRL;0;NSR:Quay:7203;A;34;0;-1;-1;34;-1\r\n#TRL;1;101;B;34;0;-1;-1;34;-1\r\n#TRL;2;NSR:Quay:7203;A;34;0;-1;-1;34;-1\r\n#TRL;3;NSR:Quay:563;C;34;0;-1;-1;34;-1\r\n';
    expect(quayIdsInErn(text)).toEqual(['NSR:Quay:7203', 'NSR:Quay:563']);
  });

  it('finds IDs with spaces around them, as the parser reads them', () => {
    expect(quayIdsInErn(' #TRL;0; NSR:Quay:7203 ;A;34;0;-1;-1;34;-1\r\n')).toEqual(['NSR:Quay:7203']);
  });
});

describe('Quay status', () => {
  const bus = { quayId: 'NSR:Quay:7203', publicCode: 'A', stopPlaceId: 'NSR:StopPlace:4000', stopPlaceName: 'Jernbanetorget', mode: 'bus', lat: 59.9, lon: 10.7 };

  it('matches the line mode with the stop place mode', () => {
    expect(modeMatches(1, 'bus')).toBe(true);   // ERN 1 = bus
    expect(modeMatches(13, 'coach')).toBe(true); // express bus at a coach station
    expect(modeMatches(1, 'rail')).toBe(false);
    expect(modeMatches(6, 'water')).toBe(true);  // ERN 6 = ship
    expect(modeMatches(1, '')).toBe(true);       // NSR gave no mode: nothing to complain about
  });

  it('tells each case apart', () => {
    expect(quayStatus(null, undefined, 1)).toBe('missing');
    expect(quayStatus('101', undefined, 1)).toBe('not-nsr');
    expect(quayStatus('NSR:Quay:7203', undefined, 1)).toBe('unknown');
    expect(quayStatus('NSR:Quay:7203', null, 1)).toBe('not-seen');
    expect(quayStatus('NSR:Quay:7203', bus, 7)).toBe('mode-mismatch'); // ERN 7 = car ferry
    expect(quayStatus('NSR:Quay:7203', bus, 1)).toBe('confirmed');
  });
});
