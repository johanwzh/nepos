// Features that can be switched off in one place.

/**
 * Routed links: on since 2.6 (2026-10-31): road graph tiles built from OpenStreetMap, routed in a routing session,
 * saved per line in data/links/. Set it false to draw straight lines and export no ServiceLinks again. A project's
 * data/shapes.json from 2.3 is left alone on disk and never read.
 */
export const ROUTING = true;

/** The routed links to hand to the export and the check: none while routing is off.
 *  @template T @param {T} links @returns {T | undefined} */
export const routedLinks = (links) => (ROUTING ? links : undefined);
