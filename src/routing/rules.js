// Routing for all modes (spec 2026-11-01): the rules each profile routes by. set: the tile set (nepos-tiles) it routes
// on; kmh: the speed where an edge has no maxspeed (null: the road classes' defaults, cost.js); radius: the first snap
// radius in metres (it widens to four times that); vmax: the top speed in m/s, which keeps the search's bound
// admissible (no edge is faster); farSnap: a stop snapped further than this is flagged; track: no sharp turns at a node;
// turnAtStops: may leave a stop the way it came (a boat turns at a quay; a bus drives on to where it can turn).

/** @typedef {import('./profiles.js').Profile} Profile */
/** @typedef {{ set: string, kmh: number | null, radius: number, vmax: number, farSnap: number, track: boolean, turnAtStops?: boolean }} Rules */

/** @type {Record<Profile, Rules>} */
export const RULES = {
  bus: { set: 'road', kmh: null, radius: 75, vmax: 25, farSnap: 25, track: false },
  rail: { set: 'rail', kmh: 100, radius: 75, vmax: 70, farSnap: 25, track: true },
  tram: { set: 'tram', kmh: 40, radius: 75, vmax: 25, farSnap: 25, track: true },
  metro: { set: 'metro', kmh: 60, radius: 75, vmax: 30, farSnap: 25, track: true },
  ferry: { set: 'ferry', kmh: 30, radius: 500, vmax: 25, farSnap: 170, track: false, turnAtStops: true },
  cable: { set: 'cable', kmh: 15, radius: 150, vmax: 15, farSnap: 50, track: true },
};

/** @param {Profile} profile @returns {Rules} */
export const rulesFor = (profile) => RULES[profile] ?? RULES.bus;

/** On track (rail, tram, metro, cable) the route may not turn more than this at a node. */
export const MAX_TURN_DEG = 90;
/** At a level crossing of two tracks (node byte bit 1, nepos-tiles) track only goes straight through. */
export const CROSSING_MAX_DEG = 30;

/** A U-turn (backlog 107) only on a small road: minor (unclassified, residential, living street…) or service, never
 *  tertiary (class 5) or larger, and only at this speed or less. */
export const UTURN_CLASSES = [2, 3];
export const UTURN_MAX_KMH = 50;
