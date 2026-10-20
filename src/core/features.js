// Features that can be switched off in one place.

/**
 * Routed links (2.3) are off for now (user 2026-10-20): a new routing service (Ettutu, over Entur's OSRM) is planned.
 * The tile engine (src/shapes/) and the link logic stay in the code; while this is false nothing routes, the map draws
 * straight lines between the stops, and the export writes no ServiceLinks and checks none. data/shapes.json is kept.
 */
export const ROUTING = false;

/** The routed links to hand to the export and its check: none while routing is off.
 *  @template T @param {T} shapes @returns {T | undefined} */
export const routedLinks = (shapes) => (ROUTING ? shapes : undefined);
