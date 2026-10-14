// Operations on a route state (periods, directions, grids), ported from Nepos 1.5.7
// (nepos.html lines 2656–2672, 3080–3151) without the prompts: the caller asks the user.

const emptyGrid = () => ({ stops: [], cols: [] });

/** @param {'no' | 'en' | string} lang */
export function newRouteState(lang) {
  const en = lang === 'en';
  return {
    routeName: '',
    publicCode: '',
    privateCode: '',
    mode: '', // no transport mode until the user picks one (line header spec §2)
    submode: '',
    brandingId: '',
    tra: '',
    transportMode: 0, // ERN #RUT field 4, kept in step with mode
    periods: [{ id: 1, name: en ? 'Period 1' : 'Periode 1', from: '', to: '', from2: '', to2: '' }],
    directions: [{ id: 2, name: en ? 'Outbound' : 'Tur' }],
    activePer: 1,
    activeDir: 2,
    nextId: 3,
    grids: { '1:2': emptyGrid() },
    kom: '',
    sek: [],
    footnotes: [],
  };
}

/** @param {any} rs */
export function gridKey(rs) {
  return `${rs.activePer}:${rs.activeDir}`;
}

/**
 * A route file without periods still opens for editing: give it the default period and direction.
 * @param {any} rs
 * @param {string} lang
 */
export function fillMissingPeriod(rs, lang) {
  if (rs.periods.length) return;
  const fresh = newRouteState(lang);
  const perId = Math.max(rs.nextId, 1);
  const dirId = rs.directions[0]?.id ?? perId + 1;
  rs.periods = [{ ...fresh.periods[0], id: perId }];
  if (!rs.directions.length) rs.directions = [{ ...fresh.directions[0], id: dirId }];
  rs.activePer = perId;
  rs.activeDir = rs.directions[0].id;
  rs.nextId = Math.max(perId, rs.activeDir) + 1;
  for (const d of rs.directions) rs.grids[`${perId}:${d.id}`] = emptyGrid();
}

/**
 * @param {any} rs
 * @param {string} name
 * @param {boolean} copyFromActive copy the active period's grids
 * @returns {number} the new period's id
 */
export function addPeriod(rs, name, copyFromActive) {
  const id = rs.nextId++;
  rs.periods.push({ id, name, from: '', to: '', from2: '', to2: '' });
  for (const d of rs.directions) {
    const src = rs.grids[`${rs.activePer}:${d.id}`];
    const copy = copyFromActive && src ? JSON.parse(JSON.stringify(src)) : emptyGrid();
    // Copied trips are new trips: each gets its own stable ID (line header spec §4).
    for (const col of copy.cols) col.uid = crypto.randomUUID();
    rs.grids[`${id}:${d.id}`] = copy;
  }
  return id;
}

/**
 * Delete the active period and move to the first remaining one.
 * @param {any} rs
 * @returns {boolean} false when it is the last period
 */
export function deletePeriod(rs) {
  if (rs.periods.length <= 1) return false;
  for (const d of rs.directions) delete rs.grids[`${rs.activePer}:${d.id}`];
  rs.periods = rs.periods.filter((/** @type {any} */ p) => p.id !== rs.activePer);
  rs.activePer = rs.periods[0].id;
  return true;
}

/**
 * @param {any} rs
 * @param {string} name
 * @param {boolean} copyReversed copy the active direction's stops in reverse order (no trips)
 * @returns {number} the new direction's id
 */
export function addDirection(rs, name, copyReversed) {
  const id = rs.nextId++;
  rs.directions.push({ id, name });
  for (const p of rs.periods) {
    const src = rs.grids[`${p.id}:${rs.activeDir}`];
    rs.grids[`${p.id}:${id}`] = copyReversed && src
      ? { stops: JSON.parse(JSON.stringify(src.stops)).reverse(), cols: [] }
      : emptyGrid();
  }
  return id;
}

/**
 * Delete the active direction and move to the first remaining one.
 * @param {any} rs
 * @returns {boolean} false when it is the last direction
 */
export function deleteDirection(rs) {
  if (rs.directions.length <= 1) return false;
  for (const p of rs.periods) delete rs.grids[`${p.id}:${rs.activeDir}`];
  rs.directions = rs.directions.filter((/** @type {any} */ d) => d.id !== rs.activeDir);
  rs.activeDir = rs.directions[0].id;
  return true;
}

/** @param {any} g */
const hasData = (g) => !!g && (g.stops.length > 0 || g.cols.length > 0);

/** @param {any} rs @param {number} perId */
export function periodHasData(rs, perId) {
  return rs.directions.some((/** @type {any} */ d) => hasData(rs.grids[`${perId}:${d.id}`]));
}

/** @param {any} rs @param {number} dirId */
export function directionHasData(rs, dirId) {
  return rs.periods.some((/** @type {any} */ p) => hasData(rs.grids[`${p.id}:${dirId}`]));
}
