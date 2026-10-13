// NeTEx data collection, ported from Nepos 1.5.7 (nepos.html lines 5818–6040).
// Pure: takes the parsed routes and stop database as input instead of reading app state.
import { yyyymmdd2d } from './xml.js';
import { expandDayCode } from './daycodes.js';

/**
 * Collect everything the NeTEx files need from the parsed routes. Stops are identified by their
 * stop ID in the route file (an NSR Quay ID); rows without one are left out. No ServiceLinks are
 * produced (spec §8).
 * @param {{ codespace: string, routes: { code: string, rs: any }[], orgs?: { id: any, name: string }[] }} input
 */
export function collectNeTExData({ codespace, routes: inputRoutes, orgs: orgList = [] }) {
    const cs = codespace || '1869';

    // Routes without periods have nothing to export
    const routes = inputRoutes.filter(({ rs }) => rs && rs.periods?.length);

    // Overall date range (min from / max to across all periods all routes)
    let overallFrom = '99999999', overallTo = '00000000';
    for (const { rs } of routes) {
        for (const p of rs.periods||[]) {
            if (p.from && p.from < overallFrom) overallFrom = p.from;
            if (p.to   && p.to   > overallTo)   overallTo   = p.to;
        }
    }
    if (overallFrom === '99999999') overallFrom = '';
    if (overallTo   === '00000000') overallTo   = '';

    // Organisations (from SEK across all routes, merged with orgs.json)
    const orgs = new Map(); // orgId → {id, name, isAuthority, isOperator}
    for (const { rs } of routes) {
        for (const s of rs.sek||[]) {
            if (!orgs.has(s.orgId)) {
                const org = (orgList||[]).find(o=>String(o.id)===String(s.orgId));
                orgs.set(s.orgId, { id:s.orgId, name:org?.name||`Org ${s.orgId}`,
                    isAuthority:false, isOperator:false });
            }
            const entry = orgs.get(s.orgId);
            if (s.isAuthority) entry.isAuthority = true;
            if (s.isOperator)  entry.isOperator  = true;
        }
    }

    // Collect used stops, stop pairs, dest displays, day types, operating periods
    const usedStops = new Map();  // stopId → {id, name} (name from the first row that uses it)
    const destDisps  = new Map();  // stopId → name (final stops of JPs)
    const operDays  = new Map();  // "YYYY-MM-DD" → {ntxId, date}   (one per real calendar date)
    const operPers  = new Map();  // "from-to" → {ntxId, from, to, fromDayId, toDayId, name}
    const dayTypes  = new Map();  // key → {ntxId, daysOfWeek?, opKey?, specificDates?}
    const dtAssignments = [];     // built inline during DayType creation
    let opCtr = 1, dtCtr = 1, dtaCtr = 1;

    function ensureStop(stopId, stopName) {
        if (!usedStops.has(stopId)) usedStops.set(stopId, { id: stopId, name: stopName });
    }

    // OperatingDay: one per real calendar date, ID = date string (reusable across routes)
    function ensureOpDay(yyyymmdd) {
        const iso = yyyymmdd2d(yyyymmdd);
        if (!iso) return null;
        if (!operDays.has(iso)) {
            operDays.set(iso, { ntxId:`${cs}:OperatingDay:${iso}`, date:iso });
        }
        return operDays.get(iso).ntxId;
    }

    // OperatingPeriod: references OperatingDay for from/to (avoids DateTime ambiguity)
    function ensureOperPeriod(per) {
        const key = `${per.from}-${per.to}`;
        if (!operPers.has(key)) {
            const fromDayId = ensureOpDay(per.from);
            const toDayId   = ensureOpDay(per.to);
            operPers.set(key, { ntxId:`${cs}:OperatingPeriod:${opCtr++}`,
                from:per.from, to:per.to, name:per.name, fromDayId, toDayId });
        }
        return key;
    }

    // DayType: for 'D' (everyday) use OperatingPeriod; for all other codes expand to
    // individual OperatingDay entries so OTP can't ignore the day-of-week constraint.
    function ensureDayType(dayCode, opKey, specificDates, fromDate, toDate) {
        // Footnote-driven specific dates (UNT Kjører kun)
        if (specificDates?.length > 0) {
            const sorted = [...specificDates].sort();
            const key = `specific:${sorted.join(':')}`;
            if (!dayTypes.has(key)) {
                const ntxId = `${cs}:DayType:${dtCtr++}`;
                dayTypes.set(key, { ntxId });
                sorted.forEach(d => {
                    const odId = ensureOpDay(d);
                    if (odId) dtAssignments.push({
                        ntxId:`${cs}:DayTypeAssignment:${dtaCtr++}`,
                        dtNtxId:ntxId, opDayNtxId:odId
                    });
                });
            }
            return dayTypes.get(key).ntxId;
        }

        const key = `${dayCode||'D'}:${opKey}`;
        if (!dayTypes.has(key)) {
            const ntxId = `${cs}:DayType:${dtCtr++}`;
            const isEveryday = !dayCode || dayCode === 'D';
            if (isEveryday) {
                // 'D' → OperatingPeriod reference (compact, works fine for everyday)
                dayTypes.set(key, { ntxId, daysOfWeek:'Everyday', opKey });
                const op = operPers.get(opKey);
                if (op) dtAssignments.push({
                    ntxId:`${cs}:DayTypeAssignment:${dtaCtr++}`,
                    dtNtxId:ntxId, opNtxId:op.ntxId
                });
            } else {
                // Non-everyday code → expand to explicit dates (OTP reliably honours these)
                dayTypes.set(key, { ntxId });
                const op = operPers.get(opKey);
                if (op && fromDate && toDate) {
                    const dates = expandDayCode(dayCode, fromDate, toDate);
                    dates.forEach(d => {
                        const odId = ensureOpDay(d);
                        if (odId) dtAssignments.push({
                            ntxId:`${cs}:DayTypeAssignment:${dtaCtr++}`,
                            dtNtxId:ntxId, opDayNtxId:odId
                        });
                    });
                }
            }
        }
        return dayTypes.get(key).ntxId;
    }

    // Walk all routes → all periods → all directions → all columns
    for (const { rs } of routes) {
        for (const per of rs.periods||[]) {
            const opKey = ensureOperPeriod(per);
            for (let di=0; di<(rs.directions||[]).length; di++) {
                const dir = rs.directions[di];
                const grid = rs.grids[`${per.id}:${dir.id}`]||{stops:[],cols:[]};

                // Collect stops and dest displays PER COLUMN, mirroring what genLineXml does when
                // building each JourneyPattern (each column may stop at different stops).
                for (const col of grid.cols||[]) {
                    const colStops = [];
                    for (let ri=0; ri<grid.stops.length; ri++) {
                        const stop = grid.stops[ri];
                        const cell = col.cells[ri];
                        if (stop.isDwellArr) continue;
                        if (!cell?.time || cell.time==='|') continue;
                        if (stop.stopId == null || stop.stopId === '') continue;
                        const stopId = String(stop.stopId);
                        ensureStop(stopId, stop.name);
                        colStops.push({ stopId, name: stop.name });
                    }
                    if (colStops.length > 0) {
                        const last = colStops[colStops.length-1];
                        destDisps.set(last.stopId, last.name);
                    }
                }

                // Collect day types per column — check for UNT Kjører kun (specific dates)
                for (const col of grid.cols||[]) {
                    const hasTime = col.cells?.some(c=>c?.time&&c.time!=='|');
                    if (!hasTime) continue;
                    // Gather specific operating dates from footnote exceptions (runsOnly=true, single-day)
                    const fn = rs.footnotes?.find(f=>f.id===col.footnoteId);
                    const specific = fn?.exceptions
                        ?.filter(ex=>ex.runsOnly && ex.from && ex.from===ex.to)
                        .map(ex=>ex.from) || [];
                    ensureDayType(col.dayCode||'D', opKey, specific, per.from, per.to);
                }
            }
        }
    }

    return { cs, routes, orgs, usedStops, destDisps, operDays, operPers, dayTypes,
             dtAssignments, overallFrom, overallTo };
}
