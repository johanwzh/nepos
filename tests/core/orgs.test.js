import { describe, it, expect } from 'vitest';
import { orgRole, netexOrgId, authorityNetworkLocalId, validateOrgs } from '../../src/core/orgs.js';

describe('organisation IDs', () => {
  it('reads the role from a full NeTEx ID', () => {
    expect(orgRole('RUT:Authority:1')).toBe('authority');
    expect(orgRole('INN:Operator:62')).toBe('operator');
    expect(orgRole('1')).toBe(null);
    expect(orgRole('RUT:Line:1')).toBe(null);
  });

  it('writes a full ID exactly as entered', () => {
    expect(netexOrgId('RUT:Authority:1', 'Authority', 'TST')).toBe('RUT:Authority:1');
  });

  it('prefixes a bare ID with the codespace and role', () => {
    expect(netexOrgId(1, 'Operator', 'TST')).toBe('TST:Operator:1');
  });

  it('builds a Network ID without colons in the local part', () => {
    expect(authorityNetworkLocalId('RUT:Authority:1')).toBe('authority-RUT-Authority-1');
    expect(authorityNetworkLocalId(2)).toBe('authority-2');
  });
});

describe('validateOrgs', () => {
  it('accepts full authority and operator IDs', () => {
    expect(validateOrgs([
      { id: 'RUT:Authority:1', name: 'Ruter' },
      { id: 'INN:Operator:62', name: 'Innlandsbuss' },
    ])).toEqual([]);
  });

  it('flags empty, malformed and duplicate IDs', () => {
    expect(validateOrgs([
      { id: '', name: 'A' },
      { id: 'Ruter', name: 'B' },
      { id: 'RUT:Authority:1', name: 'C' },
      { id: 'RUT:Authority:1', name: 'D' },
    ])).toEqual([
      { index: 0, code: 'id-required' },
      { index: 1, code: 'id-format' },
      { index: 3, code: 'id-duplicate' },
    ]);
  });

  it('flags IDs with surrounding spaces or wrong case instead of accepting them', () => {
    expect(validateOrgs([
      { id: ' RUT:Authority:1', name: 'A' },
      { id: 'rut:authority:1', name: 'B' },
      { id: 'RUT:Authority:1;', name: 'C' },
    ]).map((i) => i.code)).toEqual(['id-format', 'id-format', 'id-format']);
  });
});

describe('organisation ID characters', () => {
  it('only allows letters, digits, _ and - after the role', () => {
    expect(validateOrgs([
      { id: 'RUT:Operator:A&B', name: 'x' },
      { id: 'RUT:Operator:a<b', name: 'y' },
      { id: 'RUT:Operator:62.1', name: 'z' },
      { id: 'RUT:Operator:Øst', name: 'w' },
    ]).map((i) => i.code)).toEqual(['id-format', 'id-format', 'id-format', 'id-format']);
    expect(validateOrgs([{ id: 'RUT:Operator:Ab_9-x', name: 'ok' }])).toEqual([]);
  });
});
