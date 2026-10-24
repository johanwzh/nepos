// A small line for the booking and interval tests: three stops, given columns, built to ERN and NeTEx.
import { parseERN } from '../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../src/core/netex/export.js';

export const U = ['5f0c2e1a-1111-4aaa-8bbb-000000000001', '5f0c2e1a-1111-4aaa-8bbb-000000000002', '5f0c2e1a-1111-4aaa-8bbb-000000000003'];

/**
 * @param {{ times?: string[][], masks?: number[][], extra?: string[] }} [o]
 *   times[col][row] as hhmm (default 0700/0710/0720 + col hours); masks[col][row] the #TRC mask (default 0);
 *   extra: more records at the end
 */
export function miniErn({ times, masks, extra = [] } = {}) {
  const t = times ?? [['0700', '0710', '0720'], ['0800', '0810', '0820'], ['0900', '0910', '0920']];
  const out = ['#LEV;Test;TST', '#RUT;-1;1;Alfa - Delta;;6;', '#SEK;TST:Authority:1;Fylket;1;0;0;0', '#SEK;TST:Operator:1;Buss AS;0;1;0;0',
    '#TRA;Fram', '#PER;;;;;;', '#KAL;h1', '#TAB;0;;;;'];
  t.forEach((_, c) => out.push(`#TUR;${c};D;0;0;0;0`, `#UID;${U[c]}`));
  ['Alfa', 'Beta', 'Delta'].forEach((name, r) => {
    out.push(`#TRL;${r};NSR:Quay:${r + 1};${name};0;-1;-1;-1;0;-1`);
    t.forEach((col, c) => { if (col[r]) out.push(`#TRC;${c};${col[r]};0;0;0;0;${masks?.[c]?.[r] ?? 0}`); });
  });
  return [...out, ...extra].join('\r\n') + '\r\n';
}

/** @param {any} rs */
export function buildLine(rs) {
  const files = buildNeTExFiles({ codespace: 'TST', deliveryName: 'T', routes: [{ code: 'r1', rs }], orgs: [], brandings: [], calendars: [{ id: 'h1', name: 'Vår', ranges: [['20260101', '20260630']] }], timestamp: '2026-10-14T00:00:00' });
  return { shared: files[0].xml, line: files[1].xml };
}

/** @param {string} text */
export const gridOf = (text) => { const rs = parseERN(text); return { rs, grid: /** @type {any} */ (Object.values(rs.grids)[0]) }; };
