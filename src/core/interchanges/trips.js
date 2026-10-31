// A line's trips as the Knutepunkt tool sees them (interchanges spec 2026-10-31): each exported variant with its calls
// in minutes and its operating days, as the export writes them (journeyStops / tripVariants over the expanded route).
import { expandRoute } from '../blocks.js';
import { journeyStops, tripVariants } from '../netex/journeys.js';
import { unionDays, tripDays } from '../calendars.js';
import { cellToMins } from '../interpolate.js';
import { UUID_PATTERN } from '../ern/serialize.js';

/** @typedef {{ ri: number, stopId: string, arr: number | null, dep: number | null, board: boolean, alight: boolean }} Call */
/**
 * uid: the column's own uid (a block's generated trip keeps its own); set: the table set's uid, else its id as text;
 * block: a trip of an interval block, the parent included (our side cannot pick it: interchanges stay out of blocks).
 * @typedef {{ uid: string, set: string, setId: number, block: boolean, main: boolean, calls: Call[], days: string[] }} Trip
 */

/** A table set's key in hubs and trips. @param {any} set */
export const setKeyOf = (set) => (set?.uid && UUID_PATTERN.test(set.uid) ? set.uid : String(set?.id ?? ''));

/** @type {WeakMap<object, Trip[]>} lines do not change while their state object lives (edits make a new one) */
const cache = new WeakMap();

/** @param {any} rs @param {{ calendars: import('../calendars.js').Calendar[] }} ctx @returns {Trip[]} */
export function lineTrips(rs, { calendars }) {
  const hit = cache.get(rs);
  if (hit) return hit;
  /** @type {Trip[]} */
  const out = [];
  const ex = expandRoute(rs);
  for (const per of ex?.periods ?? []) {
    const grid = ex.grids?.[`${per.id}:${per.setId}`];
    if (!grid) continue;
    const set = (rs.tableSets ?? []).find((/** @type {any} */ s) => s.id === per.setId);
    const periodDays = unionDays(calendars.filter((c) => (per.calendarIds ?? []).includes(c.id)));
    for (const col of grid.cols) {
      const days = tripDays(periodDays, col);
      const variants = days.length ? tripVariants(grid, col, days) : [{ calls: journeyStops(grid, col), days, main: true }];
      const block = !!(col.block || col.virt || col.parentCi != null);
      for (const v of variants) {
        if (v.calls.length < 2) continue;
        out.push({ uid: col.uid ?? '', set: setKeyOf(set), setId: per.setId, block, main: v.main, days: v.days,
          calls: v.calls.map((c) => {
            const dep = cellToMins(c.depCell);
            return { ri: c.ri, stopId: c.stopId, arr: cellToMins(c.arrCell) ?? dep, dep, board: c.depCell?.suffix !== 'a', alight: c.depCell?.suffix !== 'p' };
          }) });
      }
    }
  }
  if (rs && typeof rs === 'object') cache.set(rs, out);
  return out;
}
