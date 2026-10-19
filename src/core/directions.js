// A table set's direction (customer request 2026-10-19): an optional label that mirrors NeTEx's DirectionType
// on the Route. Not required: not every table set fits one. Stored in #TRA field 1; empty = not given.

/** @typedef {'' | 'outbound' | 'inbound' | 'clockwise' | 'anticlockwise'} Direction */

/** NeTEx DirectionType values, in the order Nepos offers them. */
export const DIRECTION_TYPES = /** @type {const} */ (['outbound', 'inbound', 'clockwise', 'anticlockwise']);

/** A direction from a file: one of the NeTEx values, else '' (not given). @param {string | undefined} v @returns {Direction} */
export function readDirection(v) {
  const d = (v ?? '').trim();
  return /** @type {any} */ (DIRECTION_TYPES).includes(d) ? /** @type {Direction} */ (d) : '';
}
