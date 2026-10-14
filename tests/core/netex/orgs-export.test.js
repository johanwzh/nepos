import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';
import { projectCopy } from '../../fixtures/orgs.js';

const ern = [
  '#LEV;Test;TST', '#RUT;-1;50;A - B;;1;',
  '#SEK;NOG:Authority:aaaaaaaaaa1;Eksempel fylkeskommune;1;0;0;0',
  '#SEK;NOG:Operator:bbbbbbbbbb2;Eksempel Buss AS;0;1;0;0',
  '#CUR;neposcoin;1', '#TRA;50', '#PER;P;20260101;20260630;;;', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
  '#TRL;0;NSR:Quay:7203;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;NSR:Quay:11972;B;34;0;-1;-1;34;-1', '#TRC;0;0715;0;0;0;0;0',
].join('\r\n');

/** @param {'codespace' | 'nog'} orgMode @param {any[]} [orgs] */
const build = (orgMode, orgs = projectCopy()) => {
  const files = buildNeTExFiles({ codespace: 'TST', deliveryName: 'Test', routes: [{ code: '50', rs: parseERN(ern) }], orgs, orgMode, timestamp: '2026-10-14T00:00:00' });
  return { shared: files[0].xml, line: files[1].xml };
};

describe('organisations in the export', () => {
  it('codespace mode: writes the organisations with their details under the generated alias', () => {
    const { shared, line } = build('codespace');
    expect(shared).toContain('<Authority id="TST:Authority:aaaaaaaaaa1" version="1">');
    expect(shared).toContain('<CompanyNumber>991609407</CompanyNumber>');
    expect(shared).toContain('<LegalName>EKSEMPEL BUSS AS</LegalName>');
    expect(shared).toContain('<TradingName>Eksempel Buss</TradingName>');
    expect(shared).toContain('<ContactDetails>\n          <Phone>61245400</Phone>\n        </ContactDetails>');
    expect(shared).toContain('<AuthorityRef ref="TST:Authority:aaaaaaaaaa1" version="1"/>');
    expect(line).toContain('<OperatorRef ref="TST:Operator:bbbbbbbbbb2"/>');
    expect(line).toContain('RepresentedByGroupRef ref="TST:Network:authority-TST-Authority-aaaaaaaaaa1"');
  });

  it('codespace mode: element order CompanyNumber, Name, LegalName, TradingName, ContactDetails, OrganisationType', () => {
    const { shared } = build('codespace');
    const op = shared.slice(shared.indexOf('<Operator id='), shared.indexOf('</Operator>'));
    const order = ['CompanyNumber', 'Name', 'LegalName', 'TradingName', 'ContactDetails', 'OrganisationType'].map((n) => op.indexOf(`<${n}>`));
    expect(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]))).toBe(true);
  });

  it('codespace mode: uses a typed alias', () => {
    const copy = projectCopy();
    /** @type {any} */ (copy[1].operator).alias = 'KOL:Operator:309';
    const { shared, line } = build('codespace', copy);
    expect(shared).toContain('<Operator id="KOL:Operator:309" version="1">');
    expect(line).toContain('<OperatorRef ref="KOL:Operator:309"/>');
  });

  it('nog mode: only references, no organisations and no ResourceFrame', () => {
    const { shared, line } = build('nog');
    expect(shared).not.toContain('<organisations>');
    expect(shared).not.toContain('<ResourceFrame');
    expect(shared).toContain('<AuthorityRef ref="NOG:Authority:aaaaaaaaaa1" version="1"/>');
    expect(line).toContain('<OperatorRef ref="NOG:Operator:bbbbbbbbbb2"/>');
  });

  it('an organisation that is not in the copy falls back to the route file (old behaviour)', () => {
    const { shared } = build('codespace', []);
    expect(shared).toContain('<Operator id="NOG:Operator:bbbbbbbbbb2" version="1">\n        <Name>Eksempel Buss AS</Name>');
  });
});
