// ERN serializer, ported from Nepos 1.5.7 (nepos.html lines 2720–2809). See docs/ern/ern-format.md.
import { currencyRate } from './currency.js';

function fnByIdInRs(rs, id) { return id!=null ? (rs.footnotes||[]).find(f=>f.id===id)||null : null; }

/**
 * Write a route state as ERN text (CRLF line endings).
 * @param {any} rs route state from parseERN
 * @param {string} routeCode
 * @param {{ delivery?: { name?: string, codespace?: string }, orgs?: { id: any, name: string }[] }} [opts]
 * @returns {string}
 */
export function serializeERN(rs, routeCode, { delivery = {}, orgs = [] } = {}) {
    const d   = delivery || {};
    const nl  = '\r\n';
    const esc = s => (s||'').replace(/;/g, ','); // semicolons not allowed in fields
    const lines = [];

    lines.push(`#LEV;${esc(d.name)};${esc(d.codespace)}`);
    lines.push(`#RUT;-1;${esc(routeCode)};${esc(rs.routeName)};;${rs.transportMode||6};`);
    const curId = rs.currency || 'neposcoin';
    // The rate read from the file wins; the 1.5.7 table is only the fallback for files without one.
    const curRate = rs.currencyRate ?? currencyRate(curId);
    const sek = rs.sek || [];
    if (sek.length > 0) {
        sek.forEach(s => {
            const org = (orgs||[]).find(o => String(o.id) === String(s.orgId));
            lines.push(`#SEK;${esc(String(s.orgId))};${esc(org?.name||s.name||'')};${s.isAuthority?1:0};${s.isOperator?1:0};0;0`);
        });
    } else {
        lines.push(`#SEK;-1;;0;0;0;0`);
    }
    lines.push(`#CUR;${curId};${curRate}`);
    lines.push(`#TRA;${esc(rs.publicCode||routeCode)}`);

    for (const per of rs.periods) {
        lines.push(`#PER;${esc(per.name)};${per.from||''};${per.to||''};${per.from2||''};${per.to2||''};`);
        // Write route-wide comment once in first period block
        if (rs.kom?.trim() && per === rs.periods[0]) lines.push(`#KOM;${esc(rs.kom)}`);

        for (let di = 0; di < rs.directions.length; di++) {
            const dir   = rs.directions[di];
            const isRet = di > 0 ? 1 : 0;
            lines.push(`#TAB;${isRet};;;;`);

            const grid = rs.grids[`${per.id}:${dir.id}`] || { stops:[], cols:[] };

            grid.cols.forEach((col, ci) => {
                // Fields: X ; dayCode ; requestRoute ; CO2 ; comfort ; replacementTransport
                lines.push(`#TUR;${ci};${esc(col.dayCode)};0;0;0;0`);
            });

            grid.stops.forEach((stop, ri) => {
                const sid = (stop.stopId != null) ? stop.stopId : -1;
                const pNep = (stop.price != null && stop.price >= 0) ? stop.price.toFixed(6) : '-1';
                const flags = (stop.bold ? 1 : 0) | (stop.sep ? 2 : 0);
                lines.push(`#TRL;${ri};${sid};${esc(stop.name)};34;${flags};${pNep};-1;34;-1`);
                grid.cols.forEach((col, ci) => {
                    const cell = col.cells[ri];
                    if (!cell || !cell.time) return;
                    let mask = 0;
                    if (cell.suffix === 'a') mask |= 1;
                    if (cell.suffix === 'p') mask |= 2;
                    if (cell.suffix === 'x') mask |= 8;
                    let dx = 0, dy = 0;
                    if (cell.interchange) {
                        dx = cell.interchange.targetC - ci;
                        dy = cell.interchange.targetR - ri;
                        mask |= cell.interchange.type === 'stayseated' ? 0x800 : 0x400;
                    }
                    lines.push(`#TRC;${ci};${cell.time};${cell.dayOffset||0};0;${dx};${dy};${mask}`);
                });
            });

            // FOT (text footnotes) and UNT (date exceptions) — written after all TRL/TRC
            // Column-level (y=-1)
            grid.cols.forEach((col, ci) => {
                const fn = fnByIdInRs(rs, col.footnoteId);
                if (!fn) return;
                if (fn.text) lines.push(`#FOT;${ci};-1;${esc(fn.text)};0`);
                fn.exceptions?.forEach(ex => {
                    const pmu = ex.runsOnly ? 8192 : 16384;
                    lines.push(`#UNT;${ci};-1;${ex.from||''};${pmu};${ex.to||''};${pmu};0;0;`);
                });
            });
            // Cell-level
            grid.stops.forEach((stop, ri) => {
                grid.cols.forEach((col, ci) => {
                    const cell = col.cells[ri];
                    const fn = fnByIdInRs(rs, cell?.footnoteId);
                    if (!fn) return;
                    if (fn.text) lines.push(`#FOT;${ci};${ri};${esc(fn.text)};0`);
                    fn.exceptions?.forEach(ex => {
                        const pmu = ex.runsOnly ? 8192 : 16384;
                        lines.push(`#UNT;${ci};${ri};${ex.from||''};${pmu};${ex.to||''};${pmu};0;0;`);
                    });
                });
            });
        }
    }

    return lines.join(nl) + nl;
}
