// Routing profiles (Lasse's spec: mode profiles, configuration): which tile lines make each network, their cost
// penalties, turn limits, snap radius, zoom rule, and the design's limits for extreme links. All tuning lives here.
// Raise ENGINE_VERSION whenever a value or the search changes: saved links from an older engine are re-routed
// quietly when their line is opened (design §10).

/** @typedef {'bus' | 'tram' | 'rail' | 'metro' | 'ferry'} Profile */

export const ENGINE_VERSION = 3; // 2: tile-edge stitching (Bjerke); 3: bus by travel time, as Entur's OSRM bus profile

/**
 * @typedef {{ penalty: (cls: string, subclass: string, props: Record<string, any>) => number | null,
 *             oneway: boolean, softTurn: number, softCost: number, hardTurn: number, snapRadiusM: number,
 *             minPenalty: number, zoom: 'byDistance' | number, maxStraightKm: number, accessPerM?: number,
 *             turnCost?: (signedAngle: number, junction: boolean) => number, corridor?: { share: number, maxM: number } }} ProfileRules
 *   penalty: the cost of one metre of the line (bus: seconds; the others: metres), or null when it is not part of the
 *   network. turnCost (bus): the cost of a turn, replacing the soft/hard limits. accessPerM: the cost of a metre between
 *   a Quay and the network (default 3).
 */

// Bus speeds (km/h) per OpenMapTiles class, from Entur's OSRM bus profile (github.com/entur/osrm-backend-docker,
// profiles/bus.lua, 2026-10-19): motorway/trunk/primary 65, secondary 55, tertiary 40, residential/unclassified 25
// (OpenMapTiles 'minor'), service 15; links (ramp=1) motorway 45, trunk 40, primary 30, secondary 25, tertiary 20;
// service roads that are alleys, parking aisles or driveways at half speed. Busways are not in Entur's table: 40.
// Motorways: Entur's router takes the OSM speed limit x 0.8 when it has one (E6 at 110 -> 88). The tiles carry no speed
// limits, so motorways get that 88 here; every other class keeps Entur's table value.
const BUS_KMH = /** @type {Record<string, number>} */ ({ motorway: 88, trunk: 65, primary: 65, secondary: 55, tertiary: 40, minor: 25, service: 15, busway: 40, bus_guideway: 40 });
const BUS_RAMP_KMH = /** @type {Record<string, number>} */ ({ motorway: 45, trunk: 40, primary: 30, secondary: 25, tertiary: 20 });
const SLOW_SERVICE = new Set(['alley', 'parking', 'parking_aisle', 'driveway', 'drive-through', 'drive-thru']);
/** @param {string} cls @param {Record<string, any>} p */
function busKmh(cls, p) {
  if (!(cls in BUS_KMH)) return null;
  if (p.ramp == 1 && BUS_RAMP_KMH[cls]) return BUS_RAMP_KMH[cls];
  if (cls === 'service' && SLOW_SERVICE.has(p.service)) return BUS_KMH.service * 0.5;
  return BUS_KMH[cls];
}
/**
 * Entur's (OSRM's) turn cost, seconds: a sigmoid up to 7.5 s at a junction (right turns cheaper: right-hand traffic,
 * turn bias 1.075), plus 20 s for a U-turn. A bend where no other road meets costs nothing.
 * @param {number} angle signed, -180..180, positive = right @param {boolean} junction
 */
function busTurn(angle, junction) {
  const uTurn = Math.abs(angle) > 170;
  if (!junction && !uTurn) return 0;
  const bias = 1.075, max = 7.5;
  let s = angle >= 0 ? max / (1 + Math.exp(-((13 / bias) * angle / 180 - 6.5 * bias))) : max / (1 + Math.exp(-((13 * bias) * -angle / 180 - 6.5 / bias)));
  if (uTurn) s += 20;
  return s;
}

const BUS_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'busway', 'bus_guideway']);
const SIDINGS = new Set(['siding', 'spur', 'yard']);

/** @type {Record<Profile, ProfileRules>} */
export const PROFILES = {
  bus: {
    // Seconds per metre (travel time, as Entur's OSRM bus profile)
    penalty: (cls, sub, p) => { const kmh = BUS_CLASSES.has(cls) ? busKmh(cls, p) : null; return kmh ? 3.6 / kmh : null; },
    oneway: true, softTurn: 181, softCost: 0, hardTurn: 181, snapRadiusM: 40, minPenalty: 3.6 / 88, zoom: 'byDistance', maxStraightKm: 150,
    accessPerM: 3 * 3.6 / 15, turnCost: busTurn,
    // Roads detour to reach a motorway (the E6 runs ~6 km east of the straight line Olavsgaard–Gardermoen): a wider
    // corridor than the default 15 % of the distance
    corridor: { share: 0.3, maxM: 10000 },
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
