// NeTEx data collection, ported from Nepos 1.5.7 (nepos.html lines 5818–6040).
// Pure: takes the parsed routes and stop database as input instead of reading app state.
import { yyyymmdd2d } from './xml.js';
import { expandDayCode } from './daycodes.js';
import { straightLine } from './geo.js';

/**
 * Collect everything the NeTEx files need from the parsed routes.
 * @param {{ codespace: string, routes: { code: string, rs: any }[], orgs?: { id: any, name: string }[],
 *           stopDb?: any[], routePath?: (a: any, b: any) => { routed: boolean, coords: number[][] } }} input
 */
export function collectNeTExData({ codespace, routes: inputRoutes, orgs: orgList = [], stopDb = [], routePath = straightLine }) {
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
                const org = (orgList||[]).find(o=>o.id===s.orgId);
                orgs.set(s.orgId, { id:s.orgId, name:org?.name||`Org ${s.orgId}`,
                    isAuthority:false, isOperator:false });
            }
            const entry = orgs.get(s.orgId);
            if (s.isAuthority) entry.isAuthority = true;
            if (s.isOperator)  entry.isOperator  = true;
        }
    }

    // Collect used stops, stop pairs, dest displays, day types, operating periods
    const usedStops = new Map();  // stopId → stop db entry
    const stopPairs  = new Map();  // "fId-tId" → {fromId, toId, coords}
    const destDisps  = new Map();  // stopId → name (final stops of JPs)
    const operDays  = new Map();  // "YYYY-MM-DD" → {ntxId, date}   (one per real calendar date)
    const operPers  = new Map();  // "from-to" → {ntxId, from, to, fromDayId, toDayId, name}
    const dayTypes  = new Map();  // key → {ntxId, daysOfWeek?, opKey?, specificDates?}
    const dtAssignments = [];     // built inline during DayType creation
    let opCtr = 1, dtCtr = 1, dtaCtr = 1;

    // Resolve a stop: ID match first, then name fallback
    function resolveStop(stopId, stopName) {
        let db = (stopId!=null) ? stopDb.find(s=>+s.id===+stopId) : null;
        if (!db && stopName) db = stopDb.find(s=>s.name===stopName);
        return db;
    }

    function ensureStop(stopId, stopName) {
        if (stopId == null && !stopName) return;
        const db = resolveStop(stopId, stopName);
        if (db) usedStops.set(db.id, db);
    }

    function ensureStopPair(s1id, s2id, s1name, s2name) {
        const db1 = resolveStop(s1id, s1name);
        const db2 = resolveStop(s2id, s2name);
        if (!db1?.coords || !db2?.coords) return;
        if (db1.id === db2.id) return;  // same stop — dwell pair or name-collision; no ServiceLink
        const key = `${db1.id}-${db2.id}`;
        if (stopPairs.has(key)) return;
        const res = routePath({stopId:db1.id,coords:db1.coords},{stopId:db2.id,coords:db2.coords});
        stopPairs.set(key, { fromId:db1.id, toId:db2.id, routed:res.routed, coords:res.coords });
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

                // Collect stops, pairs, dest displays PER COLUMN.
                // Each column may have a different stopping pattern (different stops have times).
                // We must mirror exactly what genLineXml does when building each JourneyPattern,
                // otherwise the shared ServiceLinks won't cover all the pairs the line files need.
                for (const col of grid.cols||[]) {
                    const colStops = [];
                    for (let ri=0; ri<grid.stops.length; ri++) {
                        const stop = grid.stops[ri];
                        const cell = col.cells[ri];
                        if (stop.isDwellArr) continue;
                        if (!cell?.time || cell.time==='|') continue;
                        const db = resolveStop(stop.stopId, stop.name);
                        if (!db) continue;
                        ensureStop(db.id, stop.name);
                        colStops.push({ stopId: db.id, name: stop.name });
                    }
                    for (let i=0; i<colStops.length-1; i++) {
                        ensureStopPair(colStops[i].stopId, colStops[i+1].stopId, colStops[i].name, colStops[i+1].name);
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

    return { cs, routes, orgs, usedStops, stopPairs, destDisps, operDays, operPers, dayTypes,
             dtAssignments, overallFrom, overallTo, stopDb };
}
