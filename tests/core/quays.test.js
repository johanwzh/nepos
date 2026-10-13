import { describe, it, expect } from 'vitest';
import { NSR_QUAY_PATTERN, stopLocalId, quayRef, quayIdsInErn } from '../../src/core/quays.js';

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
});
