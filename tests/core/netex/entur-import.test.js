// Entur's import (user 2026-10-18): the Network must have an AuthorityRef, and the NSR codespace must be
// declared, since the stops are NSR Quays.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';

const line = (/** @type {string} */ code, /** @type {string} */ auth) => parseERN([
  '#LEV;T;TST', `#RUT;-1;${code};Linje;;6;`, `#SEK;${auth};F;1;0;0;0`, '#SEK;TST:Operator:1;B;0;1;0;0', '#DST;1;B;',
  '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
  '#TRL;0;NSR:Quay:1;A;0;-1;-1;-1;0;-1', '#TRC;0;0700;0;0;0;0;0', '#TRL;1;NSR:Quay:2;B;0;-1;-1;-1;0;-1', '#TRC;0;0710;0;0;0;0;0', '#DSK;0;0;;1',
].join('\r\n') + '\r\n');
const build = () => buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs: line('1', 'TST:Authority:1') }, { code: 'r2', rs: line('2', 'TST:Authority:2') }], orgs: [], brandings: [], calendars: [{ id: 'h1', name: 'V', ranges: [['20260101', '20260630']] }], timestamp: 'x' });

describe('networks', () => {
  it('puts one authority on the Network and the others on additional networks, each with an AuthorityRef', () => {
    const shared = build()[0].xml;
    const main = shared.slice(shared.indexOf('<Network '), shared.indexOf('</Network>'));
    expect(main).toMatch(/<AuthorityRef ref="TST:Authority:[12]"/);
    const extra = shared.slice(shared.indexOf('<additionalNetworks>'), shared.indexOf('</additionalNetworks>'));
    expect((extra.match(/<Network /g) ?? []).length).toBe(1);
    expect(extra).toMatch(/<AuthorityRef ref="TST:Authority:[12]"/);
  });

  it('lets every line point to the network of its own authority', () => {
    const [shared, l1, l2] = build().map((f) => f.xml);
    const ids = [...shared.matchAll(/<Network id="([^"]+)"/g)].map((m) => m[1]);
    for (const l of [l1, l2]) expect(ids).toContain(/<RepresentedByGroupRef ref="([^"]+)"/.exec(l)?.[1]);
  });
});

describe('codespaces', () => {
  it('declares NSR in every file, beside the project\'s own', () => {
    for (const f of build()) {
      expect(f.xml).toContain('<Xmlns>TST</Xmlns>');
      expect(f.xml).toMatch(/<Codespace id="nsr">\s*<Xmlns>NSR<\/Xmlns>\s*<XmlnsUrl>http:\/\/www\.rutebanken\.org\/ns\/nsr<\/XmlnsUrl>/);
    }
  });
});
