import { describe, it, expect } from 'vitest';
import { parseERN } from '../../../src/core/ern/parse.js';
import { serializeERN } from '../../../src/core/ern/serialize.js';
import { checkRouteFile } from '../../../src/core/integrity/check.js';
import { sample, CAL_SOMMER, CAL_VINTER } from '../../fixtures/sample-project.js';

const save = (/** @type {any} */ rs) => serializeERN(rs, 'r', { delivery: { name: 'T', codespace: 'TST' } });

describe('table sets and periods in ERN', () => {
  it('reads table sets with their periods, calendars and grids', () => {
    const rs = parseERN(sample.routes[0].text);
    expect(rs.tableSets.map((s) => [s.name, s.uid])).toEqual([
      ['Bergen - Florø', 'aaaaaaaa-0000-4000-8000-0000000000a1'], ['Florø - Bergen', 'aaaaaaaa-0000-4000-8000-0000000000a2']]);
    expect(rs.periods.map((p) => [p.setId, p.calendarIds])).toEqual([[rs.tableSets[0].id, [CAL_SOMMER]], [rs.tableSets[1].id, [CAL_SOMMER]]]);
    const back = rs.grids[`${rs.periods[1].id}:${rs.tableSets[1].id}`];
    expect(back.stops.map((/** @type {any} */ s) => s.name)).toEqual(['Florø', 'Ukjent brygge', 'Bergen']);
    expect([rs.activeSet, rs.activePer]).toEqual([rs.tableSets[0].id, rs.periods[0].id]);
  });

  it('writes the new structure: #TRA + #UID, empty #PER, #KAL, one #TAB', () => {
    const out = save(parseERN(sample.routes[1].text));
    expect(out).toContain(`#TRA;Florø - Eikefjord\r\n#UID;aaaaaaaa-0000-4000-8000-0000000000b1\r\n#PER;;;;;;\r\n#KAL;${CAL_VINTER}\r\n#TAB;0;;;;\r\n`);
    expect(out).toContain(`#PER;;;;;;\r\n#KAL;${CAL_SOMMER}\r\n#TAB;0;;;;\r\n`);
    expect(checkRouteFile(out).status).toBe('ok');
  });

  it('gives a table set without a valid #UID a new one', () => {
    const rs = parseERN(sample.routes[1].text.replace('#UID;aaaaaaaa-0000-4000-8000-0000000000b1\r\n', ''));
    expect(rs.tableSets[0].uid).toBe(null);
    expect(save(rs)).toMatch(/#TRA;Florø - Eikefjord\r\n#UID;[0-9a-f-]{36}\r\n/);
  });

  it('marks an old dated period with two tables as damaged instead of half-reading it', () => {
    const old = '#LEV;T;TST\r\n#RUT;-1;1;A;;1;\r\n#TRA;1\r\n#PER;P;20260101;20260601;;;\r\n#TAB;0;;;;\r\n#TUR;0;D;0;0;0;0\r\n#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1\r\n#TRC;0;0700;0;0;0;0;0\r\n#TAB;1;;;;\r\n#TUR;0;D;0;0;0;0\r\n#TRL;0;NSR:Quay:2;B;34;0;-1;-1;34;-1\r\n#TRC;0;0800;0;0;0;0;0\r\n';
    expect(checkRouteFile(old).status).toBe('damaged');
  });

  it('reports a #KAL that is not inside a period as out of order', () => {
    const bad = sample.routes[1].text.replace('#TRA;Florø - Eikefjord\r\n', `#TRA;Florø - Eikefjord\r\n#KAL;${CAL_SOMMER}\r\n`);
    expect(checkRouteFile(bad).status).toBe('damaged');
  });
});

describe('old dated periods', () => {
  it('marks a period with a name or dates as damaged, since a save would drop them', () => {
    const old = '#LEV;T;TST\r\n#RUT;-1;1;A;;1;\r\n#TRA;1\r\n#PER;Sommer;20260101;20260601;;;\r\n#TAB;0;;;;\r\n#TUR;0;D;0;0;0;0\r\n#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1\r\n#TRC;0;0700;0;0;0;0;0\r\n';
    expect(checkRouteFile(old).status).toBe('damaged');
  });
});
