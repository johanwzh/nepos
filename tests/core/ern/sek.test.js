import { describe, it, expect } from 'vitest';
import { sample } from '../../fixtures/sample-project.js';
import { parseERN } from '../../../src/core/ern/parse.js';
import { serializeERN } from '../../../src/core/ern/serialize.js';

const withSek = (sekLines) => sample.routes[1].text.replace('#SEK;3;Kystbuss AS;0;1;0;0', sekLines.join('\r\n'));
const orgs = [
  { id: 'RUT:Authority:1', name: 'Ruter' },
  { id: 'INN:Operator:62', name: 'Innlandsbuss' },
];

describe('#SEK organisation IDs', () => {
  it('keeps a full NeTEx ID as text', () => {
    const rs = parseERN(withSek(['#SEK;RUT:Authority:1;Ruter;1;0;0;0']));
    expect(rs.sek).toEqual([{ orgId: 'RUT:Authority:1', isAuthority: true, isOperator: false }]);
  });

  it('takes the role from the ID, not from contradicting flags', () => {
    const rs = parseERN(withSek(['#SEK;INN:Operator:62;Innlandsbuss;1;0;0;0']));
    expect(rs.sek).toEqual([{ orgId: 'INN:Operator:62', isAuthority: false, isOperator: true }]);
  });

  it('writes the ID and matching flags back', () => {
    const text = withSek(['#SEK;RUT:Authority:1;x;0;1;0;0', '#SEK;INN:Operator:62;y;1;1;0;0']);
    const out = serializeERN(parseERN(text), '20', { delivery: sample.delivery, orgs });
    expect(out).toContain('#SEK;RUT:Authority:1;Ruter;1;0;0;0\r\n');
    expect(out).toContain('#SEK;INN:Operator:62;Innlandsbuss;0;1;0;0\r\n');
  });

  it('skips -1 and empty organisation fields', () => {
    expect(parseERN(withSek(['#SEK;-1;;0;0;0;0', '#SEK;;;0;0;0;0'])).sek).toEqual([]);
  });

  it('still reads a bare ID with its flags', () => {
    expect(parseERN(sample.routes[1].text).sek).toEqual([{ orgId: '3', isAuthority: false, isOperator: true }]);
  });
});
