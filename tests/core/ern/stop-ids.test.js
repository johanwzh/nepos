import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { serializeERN } from '../../../src/core/ern/serialize.js';
import { checkRouteFile } from '../../../src/core/integrity/check.js';

/** A one-trip route whose stops have the given IDs. @param {string[]} ids */
const route = (ids) => [
  '#LEV;Test;TST', '#RUT;-1;50;A - B;;1;', '#SEK;-1;;0;0;0;0', '#CUR;neposcoin;1', '#TRA;50',
  '#PER;;;;;;', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
  ...ids.flatMap((id, i) => [`#TRL;${i};${id};Stopp ${i};34;0;-1;-1;34;-1`, `#TRC;0;07${10 + i};0;0;0;0;0`]),
].join('\r\n') + '\r\n';

const stopIds = (/** @type {string} */ text) => {
  const rs = parseERN(text);
  return rs.grids[`${rs.periods[0].id}:${rs.periods[0].setId}`].stops.map((/** @type {any} */ s) => s.stopId);
};

describe('stop IDs in route files', () => {
  it('keeps NSR Quay IDs as text', () => {
    expect(stopIds(route(['NSR:Quay:7203', 'NSR:Quay:11972']))).toEqual(['NSR:Quay:7203', 'NSR:Quay:11972']);
  });

  it('writes them back unchanged', () => {
    const text = route(['NSR:Quay:7203', 'NSR:Quay:11972']);
    // Nepos 2 adds #MOD, #UID, #EKS and #OFF and writes #PER without name and dates (line header spec §5,
    // structure spec §6); the stop IDs are written back as read.
    const out = serializeERN(parseERN(text), '50', { delivery: { name: 'Test', codespace: 'TST' } });
    expect(out.replace(/^#(MOD|UID|EKS|OFF);[^\r\n]*\r\n/gm, '')).toBe(text.replace('#PER;;;;;;', '#PER;;;;;;'));
  });

  it('passes the integrity check', () => {
    expect(checkRouteFile(route(['NSR:Quay:7203', 'NSR:Quay:11972'])).status).toBe('ok');
  });

  it('treats -1, 0 and an empty field as no stop ID', () => {
    expect(stopIds(route(['-1', '0', '']))).toEqual([null, null, null]);
  });

  it('keeps old numeric IDs as text', () => {
    expect(stopIds(route(['101']))).toEqual(['101']);
  });
});
