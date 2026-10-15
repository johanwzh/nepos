import { describe, it, expect } from 'vitest';
import { recodeProject } from '../../src/core/recode.js';

const route = '#LEV;Test;TST\r\n#RUT;-1;7;A - B;;1;\r\n#BRA;TST:Branding:b1\r\n#SEK;NOG:Operator:x;B;0;1;0;0\r\n#TRA;A\r\n';
const companies = [{ organisationId: '9', companyNumber: '', name: 'B', legalName: '', tradingName: '', authority: null,
  operator: { id: 'NOG:Operator:x', version: '1', contact: { email: '', phone: '', url: '' }, alias: 'TST:Operator:egen' } },
  { organisationId: '8', companyNumber: '', name: 'C', legalName: '', tradingName: '', authority: null,
    operator: { id: 'NOG:Operator:y', version: '1', contact: { email: '', phone: '', url: '' } } }];

describe('changing the codespace', () => {
  it('rewrites every ID that carries the codespace, and nothing else', () => {
    const out = recodeProject('TST', 'ABC', {
      brandings: [{ id: 'TST:Branding:b1', name: 'X', shortName: '', description: '', url: '', imageUrl: '' }],
      orgs: companies,
      routes: [{ code: '7', text: route }, { code: '8', text: '#LEV;Test;TST\r\n#RUT;-1;8;C;;1;\r\n' }],
    });
    expect(out.brandings[0].id).toBe('ABC:Branding:b1');
    expect(out.orgs[0].operator?.alias).toBe('ABC:Operator:egen');
    expect(out.orgs[1].operator?.alias).toBeUndefined(); // generated aliases follow the codespace by themselves
    expect(out.routes[0].text).toBe(route.replace('#LEV;Test;TST', '#LEV;Test;ABC').replace('#BRA;TST:', '#BRA;ABC:'));
    expect(out.routes[1].text).toBe('#LEV;Test;ABC\r\n#RUT;-1;8;C;;1;\r\n');
    expect(out.routes[0].text).toContain('#SEK;NOG:Operator:x'); // NOG IDs are not ours
  });

  it('leaves a branding or alias from another codespace alone', () => {
    const out = recodeProject('TST', 'ABC', { brandings: [{ id: 'RUT:Branding:z', name: 'Z', shortName: '', description: '', url: '', imageUrl: '' }], orgs: [], routes: [] });
    expect(out.brandings[0].id).toBe('RUT:Branding:z');
  });
});
