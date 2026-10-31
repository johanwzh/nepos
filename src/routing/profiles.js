// Which network a line is routed on, by its Transmodel mode (kept from the 2.3 engine, 2026-10-30). The profile is
// part of a link's key (fromQuay|toQuay|profile), so a stop pair served by a bus and a tram line keeps two links.
// Routing for all modes (2026-11-01): every profile has its own network; cableway, funicular and lift are 'cable'.
// Pure.

/** @typedef {'bus' | 'tram' | 'rail' | 'metro' | 'ferry' | 'cable'} Profile */

/**
 * The profile for a line's Transmodel mode; null: not routed (a straight line).
 * @param {string} mode @param {string} submode
 * @returns {Profile | null}
 */
export function profileFor(mode, submode) {
  if (mode === 'taxi') return submode === 'waterTaxi' ? 'ferry' : 'bus';
  if (mode === 'bus' || mode === 'coach' || mode === 'trolleyBus') return 'bus';
  if (mode === 'tram') return 'tram';
  if (mode === 'rail') return 'rail';
  if (mode === 'metro') return 'metro';
  if (mode === 'water' || mode === 'ferry') return 'ferry';
  if (mode === 'cableway' || mode === 'funicular' || mode === 'lift') return 'cable';
  return null;
}

/** Routed in a routing session: every mode with a profile (all but air, snow and ice, and other).
 *  @param {{ mode?: string, submode?: string } | null | undefined} rs */
export const isRoutedLine = (rs) => profileFor(rs?.mode ?? '', rs?.submode ?? '') != null;
