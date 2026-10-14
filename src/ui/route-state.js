// The route state's structure (timetable structure spec §1–§4): table sets, each with periods that
// reference calendars, and one grid per period.
const emptyGrid = () => ({ stops: [], cols: [] });

/** @param {'no' | 'en' | string} _lang */
export function newRouteState(_lang) {
  return {
    routeName: '', publicCode: '', privateCode: '', mode: '', submode: '', brandingId: '', transportMode: 0,
    tableSets: [{ id: 1, name: '', uid: null }],
    periods: [{ id: 2, setId: 1, calendarIds: [] }],
    activeSet: 1, activePer: 2, nextId: 3,
    grids: { '2:1': emptyGrid() },
    kom: '', sek: [], footnotes: [],
  };
}

/** @param {any} rs */
export function gridKey(rs) { return `${rs.activePer}:${rs.activeSet}`; }
/** @param {any} rs @param {number} setId */
export function periodsOf(rs, setId) { return rs.periods.filter((/** @type {any} */ p) => p.setId === setId); }
/** @param {any} rs @param {any} per */
export function gridOf(rs, per) { return rs.grids[`${per.id}:${per.setId}`] ?? (rs.grids[`${per.id}:${per.setId}`] = emptyGrid()); }

/** Make sure there is a table set, a period in the active set, and a grid for it. @param {any} rs */
export function fillMissingPeriod(rs) {
  if (!rs.tableSets?.length) { rs.tableSets = [{ id: rs.nextId++, name: '', uid: null }]; }
  if (!rs.tableSets.some((/** @type {any} */ s) => s.id === rs.activeSet)) rs.activeSet = rs.tableSets[0].id;
  if (!periodsOf(rs, rs.activeSet).length) rs.periods.push({ id: rs.nextId++, setId: rs.activeSet, calendarIds: [] });
  if (!periodsOf(rs, rs.activeSet).some((/** @type {any} */ p) => p.id === rs.activePer)) rs.activePer = periodsOf(rs, rs.activeSet)[0].id;
  gridOf(rs, rs.periods.find((/** @type {any} */ p) => p.id === rs.activePer));
}

/** @param {any} rs @param {boolean} copyTrips @returns {number} */
export function addPeriod(rs, copyTrips) {
  const src = rs.periods.find((/** @type {any} */ p) => p.id === rs.activePer);
  const id = rs.nextId++;
  rs.periods.push({ id, setId: rs.activeSet, calendarIds: [...(src?.calendarIds ?? [])] });
  const from = src ? rs.grids[`${src.id}:${src.setId}`] : null;
  const copy = from ? JSON.parse(JSON.stringify(from)) : emptyGrid();
  if (!copyTrips) copy.cols = [];
  for (const col of copy.cols) col.uid = crypto.randomUUID();
  rs.grids[`${id}:${rs.activeSet}`] = copy;
  return id;
}

/** @param {any} rs @returns {boolean} false when it is the set's last period */
export function deletePeriod(rs) {
  const mine = periodsOf(rs, rs.activeSet);
  if (mine.length <= 1) return false;
  const idx = mine.findIndex((/** @type {any} */ p) => p.id === rs.activePer);
  rs.periods = rs.periods.filter((/** @type {any} */ p) => p.id !== rs.activePer);
  delete rs.grids[`${rs.activePer}:${rs.activeSet}`];
  const rest = periodsOf(rs, rs.activeSet);
  rs.activePer = rest[Math.max(0, idx - 1)].id;
  return true;
}

/**
 * A new table set copying the active set's periods (with their calendars) and stops, without trips.
 * @param {any} rs @param {string} name @param {{ reversed: boolean }} opts @returns {number}
 */
export function addTableSet(rs, name, { reversed }) {
  const from = rs.activeSet;
  const setId = rs.nextId++;
  rs.tableSets.push({ id: setId, name, uid: crypto.randomUUID() });
  for (const per of periodsOf(rs, from)) {
    const id = rs.nextId++;
    rs.periods.push({ id, setId, calendarIds: [...per.calendarIds] });
    const stops = JSON.parse(JSON.stringify(rs.grids[`${per.id}:${from}`]?.stops ?? []));
    rs.grids[`${id}:${setId}`] = { stops: reversed ? stops.reverse() : stops, cols: [] };
  }
  if (!periodsOf(rs, setId).length) { const id = rs.nextId++; rs.periods.push({ id, setId, calendarIds: [] }); rs.grids[`${id}:${setId}`] = emptyGrid(); }
  rs.activeSet = setId;
  rs.activePer = periodsOf(rs, setId)[0].id;
  return setId;
}

/** @param {any} rs @returns {boolean} false for the last table set */
export function deleteTableSet(rs) {
  if (rs.tableSets.length <= 1) return false;
  const gone = rs.activeSet;
  for (const per of periodsOf(rs, gone)) delete rs.grids[`${per.id}:${gone}`];
  rs.periods = rs.periods.filter((/** @type {any} */ p) => p.setId !== gone);
  const idx = rs.tableSets.findIndex((/** @type {any} */ s) => s.id === gone);
  rs.tableSets.splice(idx, 1);
  rs.activeSet = rs.tableSets[Math.max(0, idx - 1)].id;
  rs.activePer = periodsOf(rs, rs.activeSet)[0].id;
  return true;
}

/** @param {any} rs @param {number} perId */
export function periodHasData(rs, perId) {
  const per = rs.periods.find((/** @type {any} */ p) => p.id === perId);
  const g = per && rs.grids[`${per.id}:${per.setId}`];
  return !!g && (g.stops.length > 0 || g.cols.length > 0);
}

/** @param {any} rs @param {number} setId */
export function tableSetHasData(rs, setId) { return periodsOf(rs, setId).some((/** @type {any} */ p) => periodHasData(rs, p.id)); }
