// Routing profiles (Lasse's spec: mode profiles, configuration): which tile lines make each network, their cost
// penalties, turn limits, snap radius, zoom rule, and the design's limits for extreme links. All tuning lives here.
// Raise ENGINE_VERSION whenever a value or the search changes: saved links from an older engine are re-routed
// quietly when their line is opened (design §10).

/** @typedef {'bus' | 'tram' | 'rail' | 'metro' | 'ferry'} Profile */

export const ENGINE_VERSION = 2; // 2: road ends cut at tile edges are stitched (Bjerke, 2026-10-19)

/**
 * @typedef {{ penalty: (cls: string, subclass: string, props: Record<string, any>) => number | null,
 *             oneway: boolean, softTurn: number, softCost: number, hardTurn: number, snapRadiusM: number,
 *             minPenalty: number, zoom: 'byDistance' | number, maxStraightKm: number }} ProfileRules
 *   penalty: the cost multiplier for a line, or null when the line is not part of the network
 */

const BUS_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'busway', 'bus_guideway']);
const SIDINGS = new Set(['siding', 'spur', 'yard']);

/** @type {Record<Profile, ProfileRules>} */
export const PROFILES = {
  bus: {
    penalty: (cls) => (!BUS_CLASSES.has(cls) ? null : cls === 'service' ? 1.5 : cls === 'busway' || cls === 'bus_guideway' ? 0.8 : 1),
    oneway: true, softTurn: 150, softCost: 500, hardTurn: 181, snapRadiusM: 40, minPenalty: 0.8, zoom: 'byDistance', maxStraightKm: 150,
  },
  tram: {
    penalty: (cls, sub, p) => (cls === 'transit' && (sub === 'tram' || sub === 'light_rail') ? (p.service === 'siding' || p.service === 'spur' ? 3 : 1) : null),
    oneway: false, softTurn: 60, softCost: 200, hardTurn: 120, snapRadiusM: 40, minPenalty: 1, zoom: 'byDistance', maxStraightKm: 30,
  },
  rail: {
    penalty: (cls, sub, p) => (cls === 'rail' && (sub === 'rail' || sub === 'narrow_gauge') ? (SIDINGS.has(p.service) ? 5 : 1) : null),
    oneway: false, softTurn: 30, softCost: 0, hardTurn: 30, snapRadiusM: 80, minPenalty: 1, zoom: 'byDistance', maxStraightKm: 600,
  },
  metro: {
    penalty: (cls, sub) => (cls === 'transit' && sub === 'subway' ? 1 : null),
    oneway: false, softTurn: 30, softCost: 0, hardTurn: 30, snapRadiusM: 80, minPenalty: 1, zoom: 14, maxStraightKm: 50,
  },
  ferry: {
    penalty: (cls) => (cls === 'ferry' ? 1 : null),
    oneway: false, softTurn: 181, softCost: 0, hardTurn: 181, snapRadiusM: 500, minPenalty: 1, zoom: 11, maxStraightKm: 300,
  },
};

/** Per tile host: how many requests at once, and how many per page load (OpenFreeMap's public instance). */
export const SOURCES = { default: { concurrency: 4, budget: 2500 } };

/**
 * The profile for a line's Transmodel mode (Lasse's mode table); null: not routed (a straight line).
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

/**
 * The tile zoom for a link: < 20 km z14, 20–80 km z12, longer z11; ferry always z11, metro always z14.
 * @param {Profile} profile @param {number} straightM
 * @returns {number}
 */
export function zoomFor(profile, straightM) {
  const z = PROFILES[profile].zoom;
  if (typeof z === 'number') return z;
  return straightM < 20000 ? 14 : straightM <= 80000 ? 12 : 11;
}
