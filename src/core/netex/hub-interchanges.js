// Knutepunkt links in the export (interchanges spec 2026-10-31, "Export"): a guaranteed ServiceJourneyInterchange in
// our line's file, the feeder (another line of the delivery) as From, our trip as To. The feeder's ServiceJourney ID
// comes from a delivery-wide index built with the line files' own ID rules, so the reference always points at a
// journey the delivery writes; a link whose journeys are not both there is left out.
import { tripVariants, sjIdFor, variantSjIdOf } from './journeys.js';
import { stopLocalId } from '../quays.js';
import { uuid5 } from '../uuid5.js';
import { hubState } from '../interchanges/hub.js';

/** @typedef {Map<string, Map<string, { sjId: string, calls: { ri: number, stopId: string }[] }[]>>} JourneyIndex line code → trip uid → its written variants */

/**
 * Every ServiceJourney the line files write, by line and trip uid; the same loop as genLineXml.
 * @param {string} cs @param {{ code: string, rs: any }[]} routes expanded, as collect.js keeps them
 * @param {Map<any, string[]>} colDays @returns {JourneyIndex}
 */
export function journeyIndex(cs, routes, colDays) {
  /** @type {JourneyIndex} */
  const out = new Map();
  for (const { code, rs } of routes) {
    /** @type {Map<string, { sjId: string, calls: { ri: number, stopId: string }[] }[]>} */
    const byTrip = new Map();
    (rs.tableSets ?? []).forEach((/** @type {any} */ set, /** @type {number} */ di) => {
      for (const per of (rs.periods ?? []).filter((/** @type {any} */ p) => p.setId === set.id)) {
        const grid = rs.grids[`${per.id}:${set.id}`] ?? { stops: [], cols: [] };
        grid.cols.forEach((/** @type {any} */ col, /** @type {number} */ ci) => {
          for (const v of tripVariants(grid, col, colDays.get(col) ?? [])) {
            if (v.calls.length < 2 || !col.uid) continue;
            const list = byTrip.get(col.uid) ?? [];
            list.push({ sjId: variantSjIdOf(cs, sjIdFor(cs, code, col, di, per, ci), v), calls: v.calls.map((c) => ({ ri: c.ri, stopId: c.stopId })) });
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
        const to = journeys.get(code)?.get(col.uid)?.find((v) => v.calls.some((c) => c.ri === ri));
        const from = journeys.get(link.line)?.get(link.trip ?? '')?.find((v) => v.calls.some((c) => c.stopId === link.stopId));
        if (!to || !from) continue;
        const walk = hub.walk > 0 ? `\n        <MinimumTransferTime>PT${hub.walk}M</MinimumTransferTime>` : '';
        out.push(`      <!-- knutepunkt: waits for line ${link.line} at ${stopLocalId(String(stop.stopId))} -->
      <ServiceJourneyInterchange id="${cs}:ServiceJourneyInterchange:${uuid5(`${to.sjId}|${from.sjId}|${stop.stopId}`)}" version="1">
        <Guaranteed>true</Guaranteed>${walk}
        <MaximumWaitTime>PT${hub.maxWait}M</MaximumWaitTime>
        <FromPointRef ref="${cs}:ScheduledStopPoint:${stopLocalId(link.stopId ?? '')}"/>
        <ToPointRef ref="${cs}:ScheduledStopPoint:${stopLocalId(String(stop.stopId))}"/>
        <FromJourneyRef ref="${from.sjId}" version="1"/>
        <ToJourneyRef ref="${to.sjId}" version="1"/>
      </ServiceJourneyInterchange>`);
      }
    });
  }
  return out;
}
