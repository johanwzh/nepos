// Which stops a column (one trip) calls at, and which DayType it runs on — exactly as the export
// writes it. Shared by collect.js, line.js and the export check so they can never disagree.

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

