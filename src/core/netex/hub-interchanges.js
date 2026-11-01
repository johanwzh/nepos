// Knutepunkt links in the export (interchanges spec 2026-10-31, "Export"): a guaranteed ServiceJourneyInterchange in
// our line's file, the feeder (another line of the delivery) as From, our trip as To. The feeder's ServiceJourney ID
// comes from a delivery-wide index built with the line files' own ID rules, so the reference always points at a
// journey the delivery writes; a link whose journeys are not both there is left out. The feeder's journey is in another
// line's file, so its reference has no version: the XSD's Journey_KeyRef (ref + version) only holds within one file
// (Antu's schema check, user 2026-11-01).
import { tripVariants, sjIdFor, variantSjIdOf } from './journeys.js';
import { stopLocalId } from '../quays.js';
import { uuid5 } from '../uuid5.js';
import { hubState } from '../interchanges/hub.js';
import { addDays } from '../calendars.js';
import { cellToMins } from '../interpolate.js';

/** @typedef {Map<string, Map<string, { sjId: string, calls: { ri: number, stopId: string, arr: number | null }[], days: Set<string> }[]>>} JourneyIndex line code → trip uid → its written variants */

/**
 * Every ServiceJourney the line files write, by line and trip uid; the same loop as genLineXml.
 * @param {string} cs @param {{ code: string, rs: any }[]} routes expanded, as collect.js keeps them
 * @param {Map<any, string[]>} colDays @returns {JourneyIndex}
 */
export function journeyIndex(cs, routes, colDays) {
  /** @type {JourneyIndex} */
  const out = new Map();
  for (const { code, rs } of routes) {
    /** @type {Map<string, { sjId: string, calls: { ri: number, stopId: string, arr: number | null }[], days: Set<string> }[]>} */
    const byTrip = new Map();
    (rs.tableSets ?? []).forEach((/** @type {any} */ set, /** @type {number} */ di) => {
      for (const per of (rs.periods ?? []).filter((/** @type {any} */ p) => p.setId === set.id)) {
        const grid = rs.grids[`${per.id}:${set.id}`] ?? { stops: [], cols: [] };
        grid.cols.forEach((/** @type {any} */ col, /** @type {number} */ ci) => {
          for (const v of tripVariants(grid, col, colDays.get(col) ?? [])) {
            // As genLineXml: a variant with no days is not written, so it must not be referred to (final review I1)
            if (v.calls.length < 2 || !v.days.length || !col.uid) continue;
            const list = byTrip.get(col.uid) ?? [];
            list.push({ sjId: variantSjIdOf(cs, sjIdFor(cs, code, col, di, per, ci), v), calls: v.calls.map((c) => ({ ri: c.ri, stopId: c.stopId, arr: cellToMins(c.arrCell) ?? cellToMins(c.depCell) })), days: new Set(v.days) });
            byTrip.set(col.uid, list);
          }
        });
      }
    });
    out.set(code, byTrip);
  }
  return out;
}

/**
 * Which visit to its stop a call is (1: the first time the journey calls there). NeTEx's From/ToVisitNumber tell a
 * stop called at twice apart, as on a boat that goes out and back (Antu, user 2026-11-01).
 * @param {{ stopId: string }[]} calls @param {number} k
 */
const visitOf = (calls, k) => calls.slice(0, k + 1).filter((c) => c.stopId === calls[k].stopId).length;

/**
 * The feeder's arriving call at the link's stop: never its first call (nobody gets off where a trip starts); the one at
 * the link's arrival time when the stop is called at more than once. @param {{ stopId: string, arr: number | null }[]} calls
 * @param {{ stopId?: string, arr?: number }} link @returns {number} -1: none
 */
function arrivingCall(calls, link) {
  const at = calls.map((c, k) => k).filter((k) => k > 0 && calls[k].stopId === link.stopId);
  return at.find((k) => calls[k].arr === link.arr) ?? at[at.length - 1] ?? -1;
}

/** Two variants run on a common day, or on neighbouring days (a feeder the evening before our trip after midnight). @param {Set<string>} a @param {Set<string>} b */
function shareDay(a, b) {
  for (const d of a) if (b.has(d) || b.has(addDays(d, -1)) || b.has(addDays(d, 1))) return true;
  return false;
}

/**
 * Our line's Knutepunkt links as ServiceJourneyInterchange XML, in element order of the NeTEx 2.0 XSD.
 * @param {string} cs @param {string} code @param {any} rs our route state (expanded) @param {JourneyIndex | undefined} journeys
 * @returns {string[]}
 */
export function hubInterchangesXml(cs, code, rs, journeys) {
  if (!journeys) return [];
  /** @type {string[]} */
  const out = [];
  for (const grid of Object.values(rs.grids ?? {})) {
    /** @type {any} */ const g = grid;
    g.stops.forEach((/** @type {any} */ stop, /** @type {number} */ ri) => {
      if (hubState(g, ri) !== 'ok') return;
      const hub = stop.hub;
      for (const col of g.cols) {
        const link = col.cells[ri]?.hubLink;
        if (!link?.line || !col.uid) continue;
        // Every variant of ours that leaves the hub, with every variant of the feeder that arrives there on one of its
        // days: a time switched off on some dates splits a trip, and the promise holds on those days too (final review I2)
        const tos = journeys.get(code)?.get(col.uid)?.filter((v) => v.calls.some((c) => c.ri === ri)) ?? [];
        const froms = journeys.get(link.line)?.get(link.trip ?? '')?.filter((v) => arrivingCall(v.calls, link) >= 0) ?? [];
        const walk = hub.walk > 0 ? `\n        <MinimumTransferTime>PT${hub.walk}M</MinimumTransferTime>` : '';
        for (const to of tos) for (const from of froms) {
          if (!shareDay(to.days, from.days)) continue;
          const fromVisit = visitOf(from.calls, arrivingCall(from.calls, link));
          const toVisit = visitOf(to.calls, to.calls.findIndex((c) => c.ri === ri));
          const fromNo = fromVisit > 1 ? `\n        <FromVisitNumber>${fromVisit}</FromVisitNumber>` : '';
          const toNo = toVisit > 1 ? `\n        <ToVisitNumber>${toVisit}</ToVisitNumber>` : '';
          out.push(`      <!-- knutepunkt: waits for line ${link.line} at ${stopLocalId(String(stop.stopId))} -->
      <ServiceJourneyInterchange id="${cs}:ServiceJourneyInterchange:${uuid5(`${to.sjId}|${from.sjId}|${stop.stopId}`)}" version="1">
        <Guaranteed>true</Guaranteed>${walk}
        <MaximumWaitTime>PT${hub.maxWait}M</MaximumWaitTime>
        <FromPointRef ref="${cs}:ScheduledStopPoint:${stopLocalId(link.stopId ?? '')}"/>${fromNo}
        <ToPointRef ref="${cs}:ScheduledStopPoint:${stopLocalId(String(stop.stopId))}"/>${toNo}
        <FromJourneyRef ref="${from.sjId}"/>
        <ToJourneyRef ref="${to.sjId}" version="1"/>
      </ServiceJourneyInterchange>`);
        }
      }
    });
  }
  return out;
}
