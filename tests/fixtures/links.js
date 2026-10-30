// Every leg of a line routed (a straight two-point link per pair), so a UI test can show a line that checks clean.
import { app } from '../../src/ui/state.js';
import { quayInfo } from '../../src/ui/quays.js';
import { linkPairs } from '../../src/core/link-pairs.js';
import { lineState } from '../../src/ui/line-info.js';

/** @param {string} code */
export function routeAllLegs(code) {
  /** @type {Record<string, any>} */
  const links = {};
  for (const p of linkPairs(lineState(code), { calendars: app.calendars, quayInfo })) {
    links[p.key] = { polyline: '', precision: 6, distanceM: 1000, status: 'OK', from: [p.from.lon, p.from.lat], to: [p.to.lon, p.to.lat] };
  }
  app.lineLinks = new Map([...app.lineLinks, [code, { version: 1, line: code, links, snaps: {} }]]);
}
