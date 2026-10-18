// Notes in NeTEx: the line note, a trip's note and a single time's note each become a Notice with a
// NoticeAssignment to the Line, the ServiceJourney or the TimetabledPassingTime.
import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../../src/core/netex/export.js';

const U = '5f0c2e1a-1111-4aaa-8bbb-000000000001';
const t = [
  '#LEV;T;TST', '#RUT;-1;1;Linje;;6;', '#SEK;TST:Authority:1;F;1;0;0;0', '#SEK;TST:Operator:1;B;0;1;0;0', '#DST;1;B;',
  '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0', `#UID;${U}`,
  '#TRL;0;NSR:Quay:1;A;0;-1;-1;-1;0;-1', '#TRC;0;0700;0;0;0;0;0', '#TRL;1;NSR:Quay:2;B;0;-1;-1;-1;0;-1', '#TRC;0;0710;0;0;0;0;0',
  '#FOT;-1;-1;Linjemerknad;nob', '#FOT;0;-1;Turmerknad;nob', '#FOT;0;1;Tidsmerknad;nob', '#DSK;0;0;;1',
].join('\r\n') + '\r\n';
const line = () => buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs: parseERN(t) }], orgs: [], brandings: [], calendars: [{ id: 'h1', name: 'V', ranges: [['20260101', '20260630']] }], timestamp: 'x' })[1].xml;
/** The id of the Notice with this text, and what its assignments point to. */
const assigned = (/** @type {string} */ xml, /** @type {string} */ text) => {
  const id = new RegExp(`<Notice id="([^"]+)"[^>]*>\\s*<Text>${text}</Text>`).exec(xml)?.[1];
  return [...xml.matchAll(/<NoticeAssignment [^>]*>([\s\S]*?)<\/NoticeAssignment>/g)]
    .filter((m) => m[1].includes(`ref="${id}"`)).map((m) => /<NoticedObjectRef ref="([^"]+)"/.exec(m[1])?.[1]);
};

describe('notices', () => {
  it('assigns the line note to the Line', () => {
    expect(assigned(line(), 'Linjemerknad')).toEqual(['TST:Line:r1']);
  });

  it('assigns a trip\'s note to its ServiceJourney', () => {
    expect(assigned(line(), 'Turmerknad')).toEqual([`TST:ServiceJourney:${U}`]);
  });

  it('assigns a time\'s note to its TimetabledPassingTime', () => {
    const xml = line();
    const [ref] = assigned(xml, 'Tidsmerknad');
    expect(ref).toMatch(/^TST:TimetabledPassingTime:/);
    expect(xml).toContain(`<TimetabledPassingTime id="${ref}"`);
    expect(xml.slice(xml.indexOf(`<TimetabledPassingTime id="${ref}"`)).slice(0, 400)).toContain('<ArrivalTime>07:10:00</ArrivalTime>'); // the last stop: arrival only
  });

  it('gives every assignment an order, and keeps them out of <lines>', () => {
    const xml = line();
    for (const m of xml.matchAll(/<NoticeAssignment [^>]*>/g)) expect(m[0]).toMatch(/order="\d+"/);
    const lines = xml.slice(xml.indexOf('<lines>'), xml.indexOf('</lines>'));
    expect(lines).not.toContain('noticeAssignments');
  });
});
