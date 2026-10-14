import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';

const U = ['5f0c2e1a-1111-4aaa-8bbb-000000000001', '5f0c2e1a-1111-4aaa-8bbb-000000000002'];
const ern = (/** @type {string} */ head) => [
  '#LEV;Test;TST', head, '#BRA;TST:Branding:b1',
  '#SEK;TST:Authority:1;Fylket;1;0;0;0', '#SEK;TST:Operator:1;Buss AS;0;1;0;0', '#CUR;neposcoin;1', '#TRA;', '#PER;P;20260101;20260630;;;', '#TAB;0;;;;',
  '#TUR;0;D;0;0;0;0', `#UID;${U[0]}`, '#TUR;1;D;0;0;0;0', `#UID;${U[1]}`,
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0', '#TRC;1;0800;0;0;0;0;0',
  '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0715;0;0;0;0;0', '#TRC;1;0815;0;0;0;0;0',
].join('\r\n') + '\r\n';
const brandings = [{ id: 'TST:Branding:b1', name: 'Sørlandsekspressen', shortName: '', description: '', url: 'https://ex.no', imageUrl: '' }];
/** @param {string} head */
const build = (head) => buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs: parseERN(ern(head)) }], orgs: [], brandings, timestamp: '2026-10-14T00:00:00' });

describe('line details in the export', () => {
  it('writes the Line elements in NeTEx order, with branding, codes and Transmodel mode', () => {
    const line = build('#RUT;1008;X20;Oslo - Gol;;13;\r\n#MOD;coach;nationalCoach')[1].xml;
    const el = line.slice(line.indexOf('<Line '), line.indexOf('</Line>'));
    const order = ['BrandingRef', 'Name', 'TransportMode', 'TransportSubmode', 'PublicCode', 'PrivateCode', 'OperatorRef', 'RepresentedByGroupRef'].map((n) => el.indexOf(`<${n}`));
    expect(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]))).toBe(true);
    expect(el).toContain('<TransportMode>coach</TransportMode>');
    expect(el).toContain('<CoachSubmode>nationalCoach</CoachSubmode>');
    expect(el).toContain('<PublicCode>X20</PublicCode>');
    expect(el).toContain('<PrivateCode>1008</PrivateCode>');
    expect(el).toContain('<BrandingRef ref="TST:Branding:b1"/>');
  });

  it('leaves out an empty public code, private code and submode', () => {
    const el = build('#RUT;-1;;Båtrute;;0;\r\n#MOD;ferry;')[1].xml;
    expect(el).not.toContain('<PublicCode>');
    expect(el).not.toContain('<PrivateCode>');
    expect(el).not.toContain('TransportSubmode');
    expect(el).toContain('<TransportMode>ferry</TransportMode>');
  });

  it('uses the column UUIDs as ServiceJourney IDs', () => {
    const line = build('#RUT;-1;X20;A;;13;\r\n#MOD;bus;expressBus')[1].xml;
    expect(line).toContain(`<ServiceJourney id="TST:ServiceJourney:${U[0]}"`);
    expect(line).toContain(`<ServiceJourney id="TST:ServiceJourney:${U[1]}"`);
  });

  it('writes the used brandings in the shared file', () => {
    const shared = build('#RUT;-1;X20;A;;13;\r\n#MOD;bus;expressBus')[0].xml;
    expect(shared).toContain('<typesOfValue>');
    expect(shared).toContain('<Branding id="TST:Branding:b1" version="1">\n          <Name>Sørlandsekspressen</Name>\n          <Url>https://ex.no</Url>\n        </Branding>');
    expect(shared.indexOf('<typesOfValue>')).toBeLessThan(shared.indexOf('<organisations>'));
  });
});

describe('interchanges between columns with IDs', () => {
  it('points the interchange at the target column\'s ServiceJourney', () => {
    // Column 0 arrives at B 07:15 and has a guaranteed interchange (mask bit 10) to column 1 at A (dx 1, dy -1).
    const text = ern('#RUT;-1;X20;A;;13;\r\n#MOD;bus;expressBus').replace('#TRC;0;0715;0;0;0;0;0', '#TRC;0;0715;0;0;1;-1;1024');
    const line = buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs: parseERN(text) }], orgs: [], brandings, timestamp: '2026-10-14T00:00:00' })[1].xml;
    expect(line).toContain(`<FromJourneyRef ref="TST:ServiceJourney:${U[0]}" version="1"/>`);
    expect(line).toContain(`<ToJourneyRef ref="TST:ServiceJourney:${U[1]}" version="1"/>`);
  });
});

describe('branding element order', () => {
  it('writes Image before Url, as the NeTEx TypeOfValue group orders them', () => {
    const withImage = [{ ...brandings[0], imageUrl: 'https://ex.no/logo.png' }];
    const shared = buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs: parseERN(ern('#RUT;-1;X20;A;;13;\r\n#MOD;bus;expressBus')) }], orgs: [], brandings: withImage, timestamp: '2026-10-14T00:00:00' })[0].xml;
    expect(shared.indexOf('<Image>')).toBeLessThan(shared.indexOf('<Url>'));
  });
});
