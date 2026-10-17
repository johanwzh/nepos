// NeTEx data collection, ported from Nepos 1.5.7 (nepos.html lines 5818–6040).
// Pure: takes the parsed routes and stop database as input instead of reading app state.
import { journeyStops, routeHasTrips } from './journeys.js';
import { unionDays, tripDays, isoDate } from '../calendars.js';
import { findRole, exportOrgId, netexOrgId } from '../orgs.js';

/**
 * Collect everything the NeTEx files need from the parsed routes. Stops are identified by their
 * stop ID in the route file (an NSR Quay ID); rows without one are left out. No ServiceLinks are
 * produced (spec §8).
 * @param {{ codespace: string, routes: { code: string, rs: any }[],
 *           orgs?: import('../orgs.js').Company[], orgMode?: 'codespace' | 'nog',
 *           brandings?: import('../../project/brandings-store.js').Branding[],
 *           calendars?: import('../calendars.js').Calendar[] }} input
 */
export function collectNeTExData({ codespace, routes: inputRoutes, orgs: orgList = [], orgMode = 'codespace', brandings: brandingList = [], calendars: calendarList = [] }) {
    const cs = codespace || '1869';

    // Routes without a trip (two or more calls) have nothing to export: no line file at all
    const routes = inputRoutes.filter(({ rs }) => rs && rs.periods?.length && routeHasTrips(rs));

    // Brandings used by the exported lines (line header spec §6)
    const brandings = new Map();
    for (const { rs } of routes) {
        const b = brandingList.find((x) => x.id === rs.brandingId);
        if (b) brandings.set(b.id, b);
    }

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

    // Used stops, destination displays, and each exported trip's operating days: the period's
    // calendars ∩ the column's day code (timetable structure spec §5).
    const usedStops = new Map();  // stopId → {id, name} (name from the first row that uses it)
    const destDisps  = new Map();  // stopId → name (final stops of JPs)
    const operDays  = new Map();  // YYYYMMDD → {ntxId, date: YYYY-MM-DD}
    const colDays   = new Map();  // column object → its operating days (YYYYMMDD, sorted)

    for (const { rs } of routes) {
        for (const per of rs.periods||[]) {
            const grid = rs.grids[`${per.id}:${per.setId}`]||{stops:[],cols:[]};
            const periodDays = unionDays(calendarList.filter((c) => per.calendarIds.includes(c.id)));
            // From the same definition of a trip that genLineXml uses (journeys.js).
            for (const col of grid.cols||[]) {
                const calls = journeyStops(grid, col);
                if (calls.length < 2) continue;
                for (const call of calls) if (!usedStops.has(call.stopId)) usedStops.set(call.stopId, { id: call.stopId, name: call.name });
                const last = calls[calls.length-1];
                destDisps.set(last.stopId, last.name);
                const days = tripDays(periodDays, col); // the day code, then the trip's own dates
                colDays.set(col, days);
                for (const d of days) if (!operDays.has(d)) operDays.set(d, { ntxId: `${cs}:OperatingDay:${isoDate(d)}`, date: isoDate(d) });
            }
        }
    }
    const allDays = [...operDays.keys()].sort();
    const overallFrom = allDays[0] ?? '', overallTo = allDays[allDays.length - 1] ?? '';

    return { cs, routes, orgs, orgFor, orgMode, brandings, usedStops, destDisps, operDays, colDays, overallFrom, overallTo };
}
