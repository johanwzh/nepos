// Which network a line is routed on, by its Transmodel mode (kept from the 2.3 engine, 2026-10-30). The profile is
// part of a link's key (fromQuay|toQuay|profile), so a stop pair served by a bus and a tram line keeps two links.
// Pure.

/** @typedef {'bus' | 'tram' | 'rail' | 'metro' | 'ferry'} Profile */

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
  return null;
}

/** Routed in a routing session: only the road profile has tiles (2.6; rail, tram, metro and ferry draw straight).
 *  @param {{ mode?: string, submode?: string } | null | undefined} rs */
export const isRoadLine = (rs) => profileFor(rs?.mode ?? '', rs?.submode ?? '') === 'bus';
