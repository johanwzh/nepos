// Which stops a column (one trip) calls at, and which DayType it runs on — exactly as the export
// writes it. Shared by collect.js, line.js and the export check so they can never disagree.
import { rangeDays } from '../calendars.js';

/** @param {any} cell */
const timed = (cell) => !!cell?.time && cell.time !== '|';

/**
 * The calls of one trip. A dwell arrival row (same stop as the row below) is folded into the
 * departure row's call where the departure row has a time in this column; otherwise it is an
 * ordinary call. Rows without a time or without a stop ID are not calls.
 * @param {{ stops: any[] }} grid
 * @param {{ cells: any[] }} col
 * @returns {{ ri: number, stopId: string, name: string, arrCell: any, depCell: any }[]}
 */
export function journeyStops(grid, col) {
  const calls = [];
  let pendingArrival = null;
  for (let ri = 0; ri < grid.stops.length; ri++) {
    const stop = grid.stops[ri];
    const cell = col.cells[ri];
    if (stop.isDwellArr && timed(col.cells[ri + 1])) {
      if (timed(cell)) pendingArrival = cell;
      continue;
    }
    if (!timed(cell)) { pendingArrival = null; continue; }
    const arrCell = pendingArrival;
    pendingArrival = null;
    if (stop.stopId == null || stop.stopId === '') continue;
    calls.push({ ri, stopId: String(stop.stopId), name: stop.name, arrCell, depCell: cell });
  }
  return calls;
}

/** A trip is exported when it calls at two or more stops. @param {{ stops: any[] }} grid @param {{ cells: any[] }} col */
export function isExportedTrip(grid, col) {
  return journeyStops(grid, col).length >= 2;
}

/** Whether a route has at least one exported trip. @param {any} rs */
export function routeHasTrips(rs) {
  for (const per of rs?.periods ?? []) {
    const grid = rs.grids?.[`${per.id}:${per.setId}`];
    if (grid?.cols.some((/** @type {any} */ col) => isExportedTrip(grid, col))) return true;
  }
  return false;
}


/**
 * A trip split by the times switched off on some of its days (dates on a single time, "kjører ikke"):
 * the days with the same calls are one variant. The usual variant (all calls, else the one with the most
 * days) comes first and is marked main. "Kjører også" on a single time does nothing (the export check
 * warns). Without such dates: one variant with every call and every day.
 * @param {{ stops: any[] }} grid @param {{ cells: any[] }} col @param {string[]} days the trip's operating days
 * @returns {{ calls: ReturnType<typeof journeyStops>, days: string[], main: boolean }[]}
 */
export function tripVariants(grid, col, days) {
  const calls = journeyStops(grid, col);
  const offOf = calls.map((c) => {
    /** @type {Set<string>} */
    const off = new Set();
    for (const cell of [c.arrCell, c.depCell]) for (const r of cell?.dates ?? []) if (!r.on) for (const d of rangeDays(r)) off.add(d);
    return off;
  });
  if (!days.length || offOf.every((s) => !s.size)) return [{ calls, days, main: true }];
  /** @type {Map<string, { idx: number[], days: string[] }>} */
  const groups = new Map();
  for (const d of days) {
    const idx = calls.map((_, i) => i).filter((i) => !offOf[i].has(d));
    const key = idx.join(',');
    if (!groups.has(key)) groups.set(key, { idx, days: [] });
    /** @type {any} */ (groups.get(key)).days.push(d);
  }
  const full = calls.map((_, i) => i).join(',');
  const list = [...groups].map(([key, g]) => ({ key, calls: g.idx.map((i) => calls[i]), days: g.days }));
  const mainKey = groups.has(full) ? full : list.reduce((a, b) => (b.days.length > a.days.length ? b : a)).key;
  list.sort((a, b) => (a.key === mainKey ? -1 : b.key === mainKey ? 1 : 0));
  return list.map((v) => ({ calls: v.calls, days: v.days, main: v.key === mainKey }));
}
