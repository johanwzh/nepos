// A vehicle on the road's limits (backlog 93, 92, 107; design 2026-11-03). The road tiles carry maxheight, maxwidth,
// maxlength (metres) and maxweight (tonnes) per edge, 0 when no limit is known. Height, width and length are hard: over
// the limit is over, less than half a metre to spare is close. Weight may be exceeded slightly: close from 1 t under the
// limit up to 5 % over it, over beyond that (user 2026-11-03). A trip's vehicle group is its vehicle's sizes; vehicles
// with the same sizes route alike whatever else differs. A U-turn costs more the longer the vehicle. Pure.

/** Less than this left under a height, width or length limit is close (metres). */
export const NEAR_M = 0.5;
/** This close under a weight limit is close (tonnes). */
export const WEIGHT_NEAR_T = 1;
/** A weight limit may be exceeded by this factor and still only be close. */
export const WEIGHT_OVER = 1.05;
/** A U-turn by a 4 m car costs this (seconds); it grows with the square of the length. */
export const UTURN_BASE_S = 15;
/** The U-turn length of a trip without a vehicle length (a standard bus), and on a taxi line (a car). */
export const DEFAULT_UTURN_M = 12;
export const TAXI_UTURN_M = 4;
/** Below the tiles' resolution (1 cm, 0.1 t): a limit read as float32 still lets a vehicle of exactly that size pass. */
const EPS = 0.001;

/** @typedef {'height' | 'width' | 'length' | 'weight'} LimitKind */
/** @typedef {{ height?: number, width?: number, length?: number, weight?: number }} Sizes */
/** The lowest limit of a kind along a route, and where it is. @typedef {{ kind: LimitKind, value: number, way: number, road: string, at: [number, number] }} LimitAt */
/** built: the road build the limits were read from. @typedef {{ height?: LimitAt, width?: LimitAt, length?: LimitAt, weight?: LimitAt, built?: string }} Limits */

/** @type {LimitKind[]} */
export const KINDS = ['height', 'width', 'length', 'weight'];
const LETTER = /** @type {Record<LimitKind, string>} */ ({ height: 'h', width: 'w', length: 'l', weight: 't' });

/** Over a limit of `limit` (0: none) with this size (undefined: not given). @param {LimitKind} kind @param {number} limit @param {number | undefined} size */
export function isOver(kind, limit, size) {
  if (!(limit > 0) || size == null) return false;
  return kind === 'weight' ? size > limit * WEIGHT_OVER + EPS : size > limit + EPS;
}

/** Close to a limit it is not over. @param {LimitKind} kind @param {number} limit @param {number} size */
function isClose(kind, limit, size) {
  if (kind === 'weight') return size >= limit - WEIGHT_NEAR_T - EPS;
  return limit - size < NEAR_M - EPS;
}

/** The limits along a route this vehicle is over, and those it is close to. @param {Limits | undefined} limits @param {Sizes} s */
export function fit(limits, s) {
  /** @type {{ over: LimitAt[], close: LimitAt[] }} */
  const out = { over: [], close: [] };
  for (const kind of KINDS) {
    const l = limits?.[kind], size = s[kind];
    if (!l || !(l.value > 0) || size == null) continue;
    if (isOver(kind, l.value, size)) out.over.push(l);
    else if (isClose(kind, l.value, size)) out.close.push(l);
  }
  return out;
}

/** A vehicle's sizes, by its name in the timetable; {} for none, a name not in the list, or no sizes.
 *  @param {string} name @param {{ name: string, height?: number | null, width?: number | null, length?: number | null, weight?: number | null }[] | undefined} vehicles @returns {Sizes} */
export function groupOf(name, vehicles) {
  const v = name ? vehicles?.find((x) => x.name === name) : undefined;
  /** @type {Sizes} */
  const s = {};
  if (v) for (const kind of KINDS) { const n = v[kind]; if (typeof n === 'number' && n > 0) s[kind] = n; }
  return s;
}

/** The group's key: its sizes in a fixed order, e.g. h4w2.55; '' for no sizes. @param {Sizes} s */
export const groupKey = (s) => KINDS.filter((k) => s[k] != null).map((k) => `${LETTER[k]}${s[k]}`).join('');

/** @param {string} key @returns {Sizes} */
export function parseGroupKey(key) {
  /** @type {Sizes} */
  const s = {};
  for (const [, c, n] of key.matchAll(/([hwlt])(\d+(?:\.\d+)?)/g)) {
    const kind = /** @type {LimitKind} */ (KINDS.find((k) => LETTER[k] === c));
    s[kind] = Number(n);
  }
  return s;
}

/** Has g every size g0 has, each at least as big (so the router can only forbid more roads for g)? @param {Sizes} g @param {Sizes} g0 */
export const biggerOrEqual = (g, g0) => KINDS.every((k) => g0[k] == null || (g[k] != null && /** @type {number} */ (g[k]) >= /** @type {number} */ (g0[k])));

/** The length a U-turn is costed by: the vehicle's, else a standard bus (a car on a taxi line). @param {Sizes} s @param {string} lineMode */
export const uturnLength = (s, lineMode) => s.length ?? (lineMode === 'taxi' ? TAXI_UTURN_M : DEFAULT_UTURN_M);

/** Seconds a U-turn costs a vehicle this long. @param {number} lengthM */
export const uturnSeconds = (lengthM) => UTURN_BASE_S * (Math.max(lengthM, 4) / 4) ** 2;
