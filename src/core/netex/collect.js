// NeTEx data collection, ported from Nepos 1.5.7 (nepos.html lines 5818–6040).
// Pure: takes the parsed routes and stop database as input instead of reading app state.
import { journeyStops, routeHasTrips } from './journeys.js';
import { unionDays, tripDays, isoDate } from '../calendars.js';
import { findRole, exportOrgId, netexOrgId } from '../orgs.js';
import { destSegments, destKey } from '../destinations.js';
import { uuid5 } from '../uuid5.js';
import { profileFor } from '../../shapes/profiles.js';
import { isExportable } from '../link-state.js';

/**
 * Collect everything the NeTEx files need from the parsed routes. Stops are identified by their
 * stop ID in the route file (an NSR Quay ID); rows without one are left out. ServiceLinks (2.3) come from the
 * saved links: a JourneyPattern gets them only when every pair of it has an exportable (routed) link.
 * @param {{ codespace: string, routes: { code: string, rs: any }[],
 *           orgs?: import('../orgs.js').Company[], orgMode?: 'codespace' | 'nog',
 *           brandings?: import('../../project/brandings-store.js').Branding[],
 *           calendars?: import('../calendars.js').Calendar[],
 *           shapes?: Map<string, import('../link-state.js').SavedShape>, quayInfo?: Map<string, any> }} input
 */
export function collectNeTExData({ codespace, routes: inputRoutes, orgs: orgList = [], orgMode = 'codespace', brandings: brandingList = [], calendars: calendarList = [], shapes = undefined, quayInfo = new Map() }) {
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
    /** @type {Map<string, { id: string, text: string, viaIds: string[] }>} destKey → one DestinationDisplay */
    const destDisps = new Map();
    /** A destination's DestinationDisplay ID; its vias are displays of their own. @param {import('../destinations.js').Dest} d @returns {string} */
    const destDispId = (d) => {
        const key = destKey(d);
        const known = destDisps.get(key);
        if (known) return known.id;
        const viaIds = d.vias.map((v) => destDispId({ text: v, vias: [] }));
        const id = `${cs}:DestinationDisplay:${uuid5(`dd|${key}`)}`;
        destDisps.set(key, { id, text: d.text, viaIds });
        return id;
    };
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
                for (const seg of destSegments(grid, col)) if (seg.state === 'ok') destDispId(seg.dest);
                const days = tripDays(periodDays, col); // the day code, then the trip's own dates
                colDays.set(col, days);
                for (const d of days) if (!operDays.has(d)) operDays.set(d, { ntxId: `${cs}:OperatingDay:${isoDate(d)}`, date: isoDate(d) });
            }
        }
    }
    const allDays = [...operDays.keys()].sort();
    const overallFrom = allDays[0] ?? '', overallTo = allDays[allDays.length - 1] ?? '';

    /** @type {Map<string, { id: string, key: string, shape: import('../link-state.js').SavedShape, fromId: string, toId: string }>} the ServiceLinks the line files use */
    const usedLinks = new Map();
    /**
     * The ServiceLink IDs of a pattern's consecutive pairs, or null when any pair has no exportable link (then the
     * pattern is written with its points only, never half its links). Registers the links for the shared file.
     * @param {any} rs @param {{ stopId: string }[]} stopList
     */
    function linkRefsFor(rs, stopList) {
        const profile = profileFor(rs?.mode ?? '', rs?.submode ?? '');
        if (!shapes || !shapes.size || !profile || stopList.length < 2) return null;
        const found = [];
        for (let i = 1; i < stopList.length; i++) {
            const key = `${stopList[i - 1].stopId}|${stopList[i].stopId}|${profile}`;
            const shape = shapes.get(key);
            if (!shape || !isExportable(key, shape, quayInfo)) return null;
            found.push({ id: `${cs}:ServiceLink:${uuid5(key)}`, key, shape, fromId: stopList[i - 1].stopId, toId: stopList[i].stopId });
        }
        for (const l of found) if (!usedLinks.has(l.key)) usedLinks.set(l.key, l);
        return found.map((l) => l.id);
    }
    return { cs, routes, orgs, orgFor, orgMode, brandings, usedStops, destDisps, destDispId, operDays, colDays, overallFrom, overallTo, usedLinks, linkRefsFor };
}
