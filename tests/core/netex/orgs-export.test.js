import { describe, it, expect } from 'vitest';
import { sample } from '../../fixtures/sample-project.js';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';

const text = sample.routes[1].text.replace(
  '#SEK;3;Kystbuss AS;0;1;0;0',
  '#SEK;RUT:Authority:1;Ruter;1;0;0;0\r\n#SEK;INN:Operator:62;Innlandsbuss;0;1;0;0',
);
const files = buildNeTExFiles({
  codespace: 'TST',
  deliveryName: 'Testprosjekt',
  routes: [{ code: '20', rs: parseERN(text) }],
  orgs: [
    { id: 'RUT:Authority:1', name: 'Ruter' },
    { id: 'INN:Operator:62', name: 'Innlandsbuss' },
  ],
  stopDb: sample.stopDb,
  timestamp: '2026-01-01T00:00:00',
});
const shared = files[0].xml;
const line = files[1].xml;

describe('organisation IDs in NeTEx', () => {
  it('writes Authority and Operator IDs exactly as entered', () => {
    expect(shared).toContain('<Authority id="RUT:Authority:1" version="1">');
    expect(shared).toContain('<Operator id="INN:Operator:62" version="1">');
    expect(shared).not.toContain('TST:Authority:RUT');
  });

  it('names the authority Network without colons and refers to the authority by its ID', () => {
    expect(shared).toContain('<Network id="TST:Network:authority-RUT-Authority-1" version="1">');
    expect(shared).toContain('<AuthorityRef ref="RUT:Authority:1" version="1"/>');
  });

  it('points the Line at the operator and the authority Network', () => {
    expect(line).toContain('<OperatorRef ref="INN:Operator:62"/>');
    expect(line).toContain('<RepresentedByGroupRef ref="TST:Network:authority-RUT-Authority-1"/>');
  });

  it('uses the organisation names from the list', () => {
    expect(shared).toContain('<Name>Ruter</Name>');
    expect(shared).toContain('<Name>Innlandsbuss</Name>');
  });
});
