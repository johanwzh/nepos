// Features that can be switched off in one place.

/**
 * Routed links: off. The 2.3 engine (routing on the map's vector tiles, switched off 2026-10-20) was removed on
 * 2026-10-30. The new routing (graph tiles built from OpenStreetMap, routed in a routing session) will turn this on.
 * While it is false the map draws straight lines between the stops and the export writes no ServiceLinks. A project's
 * data/shapes.json from 2.3 is left alone on disk and never read.
 */
export const ROUTING = false;

/** The routed links to hand to the export: none while routing is off.
 *  @template T @param {T} links @returns {T | undefined} */
export const routedLinks = (links) => (ROUTING ? links : undefined);
