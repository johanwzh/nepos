// ERN serializer, ported from Nepos 1.5.7 (nepos.html lines 2720–2809). See docs/ern/ern-format.md.
import { ernCodeFor } from '../modes.js';
import { servedRows, destKey } from '../destinations.js';

/** A column's stable ID (#UID). */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


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
    // Semicolons are not allowed in fields, and a line break would end the record: both are replaced
    const esc = s => (s||'').replace(/;/g, ',').replace(/\s*[\r\n]+\s*/g, ' ');
    const lines = [];

    lines.push(`#LEV;${esc(d.name)};${esc(d.codespace)}`);
    // #RUT as ERN defines it: private code (-1 = none), public code, name, nearest ERN mode code;
    // the Transmodel mode and the branding in their own records (line header spec §5).
    const ernCode = ernCodeFor(rs.mode || '', rs.submode || '', rs.transportMode);
    rs.transportMode = ernCode;
    lines.push(`#RUT;${esc(rs.privateCode) || '-1'};${esc(rs.publicCode)};${esc(rs.routeName)};;${ernCode};`);
    if (rs.mode) lines.push(`#TRM;${esc(rs.mode)};${esc(rs.submode)}`);
    if (rs.brandingId) lines.push(`#MRK;${esc(rs.brandingId)}`);
    // The line flags (navigation spec §4) are always written.
    lines.push(`#EKS;${rs.exported === false ? 0 : 1}`, `#OFF;${rs.isPublic === false ? 0 : 1}`);
    const sek = rs.sek || [];
    if (sek.length > 0) {
        sek.forEach(s => {
            const org = (orgs||[]).find(o => String(o.id) === String(s.orgId));
            lines.push(`#SEK;${esc(String(s.orgId))};${esc(org?.name||s.name||'')};${s.isAuthority?1:0};${s.isOperator?1:0};0;0`);
        });
    } else {
        lines.push(`#SEK;-1;;0;0;0;0`);
    }
    // Destinations (#DST): each distinct one once, a via before the destination that uses it, before the
    // table sets; the trips' starts and changes (#DSK) per table below.
    /** @type {Map<string, string>} destKey → ID */
    const dstIds = new Map();
    /** @param {{ text: string, vias: string[] }} dest */
    const dstId = (dest) => {
        const viaIds = dest.vias.map((v) => dstId({ text: v, vias: [] }));
        const key = destKey(dest);
        if (!dstIds.has(key)) {
            const id = String(dstIds.size + 1);
            dstIds.set(key, id);
            lines.push(`#DST;${id};${esc(dest.text)};${viaIds.length ? `;${viaIds.join(';')}` : ''}`);
        }
        return /** @type {string} */ (dstIds.get(key));
    };
    /** @type {Map<any, string[]>} grid → its #DSK lines */
    const dskLines = new Map();
    for (const set of rs.tableSets) for (const per of rs.periods.filter((/** @type {any} */ p) => p.setId === set.id)) {
        const grid = rs.grids[`${per.id}:${set.id}`];
        if (!grid) continue;
        const out = [];
        grid.cols.forEach((/** @type {any} */ col, /** @type {number} */ ci) => {
            const served = servedRows(grid, col);
            const last = served[served.length - 1];
            if (col.dest) {
                // The start goes on the first stop the trip serves (else its first time, else row 0)
                const timedRow = col.cells.findIndex((/** @type {any} */ c) => c?.time && c.time !== '|');
                out.push(`#DSK;${ci};${served[0] ?? Math.max(0, timedRow)};;${dstId(col.dest)}`);
            }
            (col.dests ?? []).forEach((/** @type {any} */ dest, /** @type {number} */ ri) => {
                // none on the last stop; a change on a row the trip no longer serves is kept (it is flagged)
                if (dest && ri !== last && ri !== served[0]) out.push(`#DSK;${ci};${ri};;${dstId(dest)}`);
            });
        });
        dskLines.set(grid, out);
    }

    const usedUids = new Set();
    let komWritten = false;

    // Table sets (#TRA + #UID), each with its periods (#PER + #KAL) and one table per period
    // (timetable structure spec §6).
    for (const set of rs.tableSets) {
        lines.push(`#TRA;${esc(set.name)}${set.direction ? `;${set.direction}` : ''}`); // field 1: the direction, when given
        if (!set.uid || !UUID_PATTERN.test(set.uid) || usedUids.has(set.uid)) set.uid = crypto.randomUUID();
        usedUids.add(set.uid);
        lines.push(`#UID;${set.uid}`);
        for (const per of rs.periods.filter((/** @type {any} */ p) => p.setId === set.id)) {
            lines.push('#PER;;;;;;');
            for (const id of per.calendarIds) lines.push(`#KAL;${esc(id)}`);
            lines.push('#TAB;0;;;;');

            const grid = rs.grids[`${per.id}:${set.id}`] || { stops:[], cols:[] };

            grid.cols.forEach((col, ci) => {
                // Fields: X ; dayCode ; requestRoute ; CO2 ; comfort ; replacementTransport
                lines.push(`#TUR;${ci};${esc(col.dayCode)};0;0;0;0`);
                // The column's stable ID: new when missing, invalid or already used here (a copy).
                if (!col.uid || !UUID_PATTERN.test(col.uid) || usedUids.has(col.uid)) col.uid = crypto.randomUUID();
                usedUids.add(col.uid);
                lines.push(`#UID;${col.uid}`);
            });

            // The trip-number row (#TTL once, #TTC per column with a number): a train number for rail
            // (bit 6 = 64), a trip number otherwise (bit 7 = 128). NeTEx: the ServiceJourney's PrivateCode.
            if (grid.tripRow) {
                const rail = rs.mode === 'rail';
                lines.push(`#TTL;-1;0;;10;${rail ? 'Tognummer' : 'Turnummer'};0`);
                grid.cols.forEach((col, ci) => { if (col.tripNo) lines.push(`#TTC;${ci};;10;${esc(col.tripNo)};${rail ? 64 : 128}`); });
            }
            // The label row (user 2026-10-19): field 5 bit 0 marks it; a column's label as #TTC with flags 256
            if (grid.labelRow) {
                lines.push('#TTL;-1;0;;10;Etikett;1');
                grid.cols.forEach((col, ci) => { if (col.label) lines.push(`#TTC;${ci};;10;${esc(col.label)};256`); });
            }
            // The vehicle row (user 2026-10-20): field 5 bit 1; a column's vehicle as #TTC with flags 512
            if (grid.vehicleRow) {
                lines.push('#TTL;-1;0;;10;Kjøretøy;2');
                grid.cols.forEach((col, ci) => { if (col.vehicle) lines.push(`#TTC;${ci};;10;${esc(col.vehicle)};512`); });
            }

            grid.stops.forEach((stop, ri) => {
                const sid = (stop.stopId != null) ? stop.stopId : -1;
                const pNep = (stop.price != null && stop.price >= 0) ? stop.price.toFixed(6) : '-1';
                // ERN 2.0: typography (bold = bit 1, the separator line = underline, bit 3), km, zone,
                // price, flags, platform
                const typo = (stop.bold ? 2 : 0) | (stop.sep ? 8 : 0);
                lines.push(`#TRL;${ri};${sid};${esc(stop.name)};${typo};-1;-1;${pNep};0;-1`);
                grid.cols.forEach((col, ci) => {
                    const cell = col.cells[ri];
                    if (!cell || !cell.time) return;
                    let mask = 0;
                    if (cell.suffix === 'a') mask |= 1;
                    if (cell.suffix === 'p') mask |= 2;
                    if (cell.req) mask |= 256; // request stop: bit 8
                    let dx = 0, dy = 0;
                    if (cell.interchange) {
                        dx = cell.interchange.targetC - ci;
                        dy = cell.interchange.targetR - ri;
                        mask |= cell.interchange.type === 'stayseated' ? 0x800 : 0x400;
                    }
                    lines.push(`#TRC;${ci};${cell.time};${cell.dayOffset||0};0;${dx};${dy};${mask}`);
                });
            });

            // FOT (notes) and UNT (dates) — written after all TRL/TRC; a column's are row -1
            /** @param {any} at @param {number} ci @param {number} ri */
            const notesOf = (at, ci, ri) => {
                if (at?.note) lines.push(`#FOT;${ci};${ri};${esc(at.note)};nob`);
                for (const d of at?.dates ?? []) {
                    if (!d.from && !d.to) continue;
                    const pmu = d.on ? 8192 : 16384;
                    lines.push(`#UNT;${ci};${ri};${d.from||''};${pmu};${d.to||''};${pmu};0;0;`);
                }
            };
            // The line's note once, on the whole of the first table (#FOT -1;-1), then other languages
            if (!komWritten) {
                if (rs.kom?.trim()) lines.push(`#FOT;-1;-1;${esc(rs.kom)};nob`);
                for (const k of rs.komOther || []) if (k.text?.trim()) lines.push(`#FOT;-1;-1;${esc(k.text)};${esc(k.lang)}`);
                komWritten = true;
            }
            grid.cols.forEach((col, ci) => notesOf(col, ci, -1));
            grid.stops.forEach((stop, ri) => grid.cols.forEach((col, ci) => notesOf(col.cells[ri], ci, ri)));
            lines.push(...(dskLines.get(grid) ?? []));
        }
    }

    return lines.join(nl) + nl;
}
