import { describe, it, expect } from 'vitest';
import { setLineFlags } from '../../src/core/ern/flags.js';
const T = ['#LEV;T;TST', '#RUT;-1;10;A;;1;', '#TRM;bus;', '#EKS;1', '#OFF;1', '#TRA;A - B'].join('\r\n') + '\r\n';

describe('line flags in a saved file', () => {
  it('changes only #EKS', () => {
    expect(setLineFlags(T, { exported: false })).toBe(T.replace('#EKS;1', '#EKS;0'));
  });
  it('changes only #OFF', () => {
    expect(setLineFlags(T, { isPublic: false })).toBe(T.replace('#OFF;1', '#OFF;0'));
  });
  it('inserts the records an old file lacks, where Nepos writes them', () => {
    const old = T.replace('#EKS;1\r\n#OFF;1\r\n', '');
    expect(setLineFlags(old, { exported: false })).toBe(T.replace('#EKS;1', '#EKS;0'));
  });
});
