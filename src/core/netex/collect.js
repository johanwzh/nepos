// NeTEx data collection, ported from Nepos 1.5.7 (nepos.html lines 5818–6040).
// Pure: takes the parsed routes and stop database as input instead of reading app state.
import { yyyymmdd2d } from './xml.js';
import { expandDayCode } from './daycodes.js';
import { journeyStops, routeHasTrips, runsOnlyDates } from './journeys.js';
import { findRole, exportOrgId, netexOrgId } from '../orgs.js';

/**
 * Collect everything the NeTEx files need from the parsed routes. Stops are identified by their
 * stop ID in the route file (an NSR Quay ID); rows without one are left out. No ServiceLinks are
 * produced (spec §8).
 * @param {{ codespace: string, routes: { code: string, rs: any }[],
 *           orgs?: import('../orgs.js').Company[], orgMode?: 'codespace' | 'nog',
 *           brandings?: import('../../project/brandings-store.js').Branding[] }} input
 */
export function collectNeTExData({ codespace, routes: inputRoutes, orgs: orgList = [], orgMode = 'codespace', brandings: brandingList = [] }) {
    const cs = codespace || '1869';

    // Routes without a trip (two or more calls) have nothing to export: no line file at all
    const routes = inputRoutes.filter(({ rs }) => rs && rs.periods?.length && routeHasTrips(rs));

    // Brandings used by the exported lines (line header spec §6)
    const brandings = new Map();
    for (const { rs } of routes) {
        const b = brandingList.find((x) => x.id === rs.brandingId);
        if (b) brandings.set(b.id, b);
    }

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

    /**
     * How one #SEK organisation is written for a role (organisations spec §6). An ID that is not in
     * the project copy with that role falls back to the route file, as before.
     * @param {{ orgId: string, name?: string }} s
     * @param {'Authority' | 'Operator'} role
     */
    function orgFor(s, role) {
        const hit = findRole(orgList, s.orgId);
        if (hit && hit.role === role.toLowerCase()) {
            const id = exportOrgId(hit.entry, hit.role, orgMode, cs);
            return { id, networkKey: id, name: hit.company.name, company: hit.company, entry: hit.entry };
        }
        return { id: netexOrgId(s.orgId, role, cs), networkKey: String(s.orgId), name: s.name || `Org ${s.orgId}`, company: null, entry: null };
    }
    const orgs = new Map(); // `${role}:${id}` → orgFor(...) + role, in order of first use
    for (const { rs } of routes) {
        for (const s of rs.sek||[]) {
            for (const role of /** @type {('Authority' | 'Operator')[]} */ (['Authority', 'Operator'])) {
                if (!(role === 'Authority' ? s.isAuthority : s.isOperator)) continue;
                const out = orgFor(s, role);
                if (!orgs.has(`${role}:${out.id}`)) orgs.set(`${role}:${out.id}`, { ...out, role });
            }
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

                // Stops, destination displays and day types of every exported trip, from the same
                // definition of a trip that genLineXml uses (journeys.js).
                for (const col of grid.cols||[]) {
                    const calls = journeyStops(grid, col);
                    if (calls.length < 2) continue;
                    for (const call of calls) ensureStop(call.stopId, call.name);
                    const last = calls[calls.length-1];
                    destDisps.set(last.stopId, last.name);
                }
                for (const col of grid.cols||[]) {
                    if (journeyStops(grid, col).length < 2) continue;
                    // "Runs only" single dates from the column's note give a DayType of their own
                    ensureDayType(col.dayCode||'D', opKey, runsOnlyDates(rs, col), per.from, per.to);
                }
            }
        }
    }

    return { cs, routes, orgs, orgFor, orgMode, brandings, usedStops, destDisps, operDays, operPers, dayTypes,
             dtAssignments, overallFrom, overallTo };
}
