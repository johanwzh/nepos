// When links are routed (design §1, §4, §6, §10): the open line's missing links a moment after the grid rests;
// on opening a line its missing links, then its stale ones at idle time (at most 100 per page load); "Route
// missing links" for the export. Results are saved in data/shapes.json (never for a read-only line), shared by every
// line. A link the planner blocked is only routed again by "Route again". Nothing runs for lines not opened, and the
// tile budget stops background work. The map draws the selected trip's links from here.
import { app } from './state.js';
import { onRefresh } from './shell.js';
import { t } from '../i18n/strings.js';
import { grid, onGridRender } from './grid.js';
import { quayInfo, onQuaysLoaded } from './quays.js';
import { lineState } from './line-info.js';
import { linkPairs, tripLinks } from '../core/link-pairs.js';
import { toSaved, isStale, isExportable, blocked } from '../core/link-state.js';
import { writeShapes } from '../project/shapes-store.js';
import { profileFor } from '../shapes/profiles.js';
import { decodePolyline, haversineM } from '../shapes/geometry.js';

/** @typedef {import('../core/link-pairs.js').LinkPair} LinkPair */
/** @typedef {import('../core/link-state.js').SavedShape} SavedShape */
/** @typedef {{ shapeLink: (from: any, to: any, profile: any, opts?: any) => Promise<import('../shapes/engine.js').LinkResult>, tilesUsed: () => number }} EngineLike */

/** @type {EngineLike | null} */ let engine = null;
/** @type {(() => Promise<EngineLike | null>) | null} */ let makeEngine = null;
/** @type {Promise<EngineLike | null> | null} */ let making = null;
let now = () => new Date();
/** @type {(fn: () => void) => void} */
let idle = (fn) => setTimeout(fn, 200);
let restMs = 300;
let staleCap = 100;
let staleDone = 0;
let budgetLeft = true;
/** @type {any} */ let restTimer = null;
let lastRoute = /** @type {string | null} */ (null);
/** Results kept for this page load only: errors (retried next time) and links of read-only lines. @type {Map<string, SavedShape>} */
const session = new Map();
/** @type {Map<string, LinkPair>} queued now (the planner is waiting) */
const queue = new Map();
/** @type {Map<string, LinkPair>} stale links, routed when idle */
const staleQueue = new Map();
/** @type {Set<string>} in flight */
const inFlight = new Set();
let running = false;
/** @type {(() => void)[]} */
const listeners = [];
/** @type {any} */ let saveTimer = null;

/**
 * @param {{ engine?: EngineLike | null, makeEngine?: () => Promise<EngineLike | null>, now?: () => Date,
 *           idle?: (fn: () => void) => void, restMs?: number, staleCap?: number }} [opts]
 */
export function initLinkRouter(opts = {}) {
  engine = opts.engine ?? null;
  makeEngine = opts.makeEngine ?? null;
  making = null;
  if (opts.now) now = opts.now;
  if (opts.idle) idle = opts.idle;
  if (opts.restMs != null) restMs = opts.restMs;
  if (opts.staleCap != null) staleCap = opts.staleCap;
  staleDone = 0; budgetLeft = true; lastRoute = null;
  session.clear(); queue.clear(); staleQueue.clear(); inFlight.clear();
  onGridRender(onRender);
  onRefresh(onRefreshed);
  onQuaysLoaded(() => { if (app.activeRoute) routeLine(app.activeRoute); });
}

/** Called when links change (the map redraws). @param {() => void} fn */
export function onLinksChanged(fn) { if (!listeners.includes(fn)) listeners.push(fn); }
const changed = () => { for (const fn of listeners) fn(); };

/** Is there tile budget left this page load? */
export const linkBudgetLeft = () => budgetLeft;

/** The saved (or this session's) shape of a link. @param {string} key @returns {SavedShape | null} */
export function linkFor(key) { return app.shapes.get(key) ?? session.get(key) ?? null; }

function onRender() {
  clearTimeout(restTimer);
  restTimer = setTimeout(() => { if (app.activeRoute) routeLine(app.activeRoute, { only: 'missing' }); }, restMs);
}

function onRefreshed() {
  if (app.activeRoute !== lastRoute) {
    lastRoute = app.activeRoute;
    if (lastRoute) routeLine(lastRoute);
  }
}

/** @param {string} code */
function pairsOf(code) {
  const rs = lineState(code);
  return rs ? linkPairs(rs, { calendars: app.calendars, quayInfo }) : [];
}

/**
 * Queue the line's links: missing ones now, stale ones at idle time.
 * @param {string} code @param {{ only?: 'missing' | 'stale' | 'all' }} [opts]
 */
export function routeLine(code, { only = 'all' } = {}) {
  let added = false;
  for (const p of pairsOf(code)) {
    const s = linkFor(p.key);
    if (!s || s.status === 'ERROR') {
      if (only !== 'stale' && !queue.has(p.key) && !inFlight.has(p.key) && !(s && session.has(p.key))) { queue.set(p.key, p); added = true; }
    } else if (only !== 'missing' && isStale(p.key, s, quayInfo, now()) && app.shapes.has(p.key)) {
      staleQueue.set(p.key, p);
    }
  }
  if (added) void run();
  if (staleQueue.size) idle(() => { void run(); });
}

/** Route what is queued, one link at a time (the worker does the work), the planner's own links first. */
async function run() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      /** @type {LinkPair | undefined} */
      let p = queue.values().next().value;
      let stale = false;
      if (p) queue.delete(p.key);
      else if (budgetLeft && staleDone < staleCap) {
        p = staleQueue.values().next().value;
        if (p) { staleQueue.delete(p.key); stale = true; staleDone++; }
      }
      if (!p) break;
      const e = await ensureEngine();
      if (!e) break;
      const fs = app.fs;
      inFlight.add(p.key);
      const r = await e.shapeLink(p.from, p.to, p.profile);
      inFlight.delete(p.key);
      if (r.warnings.includes('cancelled')) continue;
      if (r.warnings.includes('tile budget used')) { budgetLeft = false; staleQueue.clear(); }
      if (app.fs !== fs || !fs) continue; // another project was opened meanwhile: not for this one
      store(p.key, toSaved(r, now()));
      if (stale && !budgetLeft) break;
    }
  } finally {
    running = false;
  }
}

/** @returns {Promise<EngineLike | null>} */
async function ensureEngine() {
  if (engine) return engine;
  if (!makeEngine) return null;
  if (!making) making = makeEngine().then((e) => { engine = e; return e; }, () => null);
  return making;
}

/** Keep a result: saved for the project, or for this page load only (errors, read-only lines). @param {string} key @param {SavedShape} s */
function store(key, s) {
  if (s.status === 'ERROR' || grid.readOnly) { session.set(key, s); changed(); return; }
  session.delete(key);
  app.shapes.set(key, s);
  changed();
  scheduleSave();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  const fs = app.fs;
  saveTimer = setTimeout(() => { if (fs && app.fs === fs) void saveNow(); }, 400);
}

/** Write data/shapes.json now. */
export async function saveNow() {
  clearTimeout(saveTimer);
  if (!app.fs) return;
  try {
    await writeShapes(app.fs, app.shapes, { previousError: app.shapesError });
    app.shapesError = '';
  } catch (e) {
    console.warn('Saving links failed', e);
  }
}

/** The pair a key names, with today's Quay positions. @param {string} key @returns {LinkPair | null} */
function pairOf(key) {
  const [fromId, toId, profile] = key.split('|');
  const f = quayInfo.get(fromId), to = quayInfo.get(toId);
  if (f?.lat == null || to?.lat == null) return null;
  return { key, from: { quayId: fromId, lon: f.lon, lat: f.lat }, to: { quayId: toId, lon: to.lon, lat: to.lat }, profile: /** @type {any} */ (profile) };
}

/** "Don't route this link": a straight line, a warning in the export check, kept until "Route again". @param {string} key */
export function blockLink(key) {
  const s = linkFor(key);
  const p = pairOf(key);
  const base = s ?? (p ? toSaved({ key, status: 'BLOCKED', from: p.from, to: p.to, profile: p.profile, coordinates: [[p.from.lon, p.from.lat], [p.to.lon, p.to.lat]],
    distanceM: haversineM([p.from.lon, p.from.lat], [p.to.lon, p.to.lat]), arriveBearing: null, warnings: [], source: '', engine: 0 }, now()) : null);
  if (!base) return;
  queue.delete(key); staleQueue.delete(key); session.delete(key);
  app.shapes.set(key, blocked(base));
  changed();
  scheduleSave();
}

/** "Route again": clear a block or a failure and route the link now. @param {string} key */
export function routeAgain(key) {
  const p = pairOf(key);
  if (!p) return;
  app.shapes.delete(key);
  session.delete(key);
  queue.set(key, p);
  changed();
  void run();
}

/** How many lines use a link. @param {string} key */
export function linesUsing(key) {
  return app.routes.filter((r) => pairsOf(r.code).some((p) => p.key === key)).length;
}

/**
 * "Route missing links" (export page): every pair of these lines without an exportable link, except blocked ones
 * (fallbacks and stale ones are tried again). Stops at the tile budget.
 * @param {string[]} codes
 * @returns {Promise<{ done: number, left: number }>}
 */
export async function routeMissingForExport(codes) {
  /** @type {Map<string, LinkPair>} */
  const todo = new Map();
  for (const code of codes) for (const p of pairsOf(code)) {
    const s = linkFor(p.key);
    if (s?.status === 'BLOCKED') continue;
    if (s && s.status === 'TOO_FAR' && !isStale(p.key, s, quayInfo, now())) continue; // only when its limit changed
    if (s && isExportable(p.key, s, quayInfo) && !isStale(p.key, s, quayInfo, now())) continue;
    todo.set(p.key, p);
  }
  const e = await ensureEngine();
  let done = 0;
  const fs = app.fs;
  for (const p of todo.values()) {
    if (!e || app.fs !== fs) break;
    const r = await e.shapeLink(p.from, p.to, p.profile);
    if (r.warnings.includes('tile budget used')) { budgetLeft = false; break; }
    if (r.warnings.includes('cancelled')) continue;
    store(p.key, toSaved(r, now()));
    done++;
  }
  await saveNow();
  return { done, left: todo.size - done };
}

/** The tooltip for a link that is not routed. @param {string} status */
const why = (status) => t(`linkStatus:${status}`);

/**
 * What the map draws for one trip of the open line: one feature per link, or null when the line's mode is not
 * routed (the map keeps its straight trip line).
 * @param {{ cells: any[] }} col
 */
export function linkFeatures(col) {
  const rs = app.routeState;
  const profile = profileFor(rs?.mode ?? '', rs?.submode ?? '');
  if (!profile || !grid.active) return null;
  /** @type {any[]} */
  const out = [];
  for (const l of tripLinks(grid, col, profile)) {
    const s = linkFor(l.key);
    const p = pairOf(l.key);
    if (!p) continue;
    const straight = [[p.from.lon, p.from.lat], [p.to.lon, p.to.lat]];
    const status = s ? s.status : 'PENDING';
    const coordinates = s && s.status === 'OK' ? decodePolyline(s.polyline, s.precision) : straight;
    const warn = s?.warnings?.includes('long detour') ? ` · ${t('linkDetour')}` : '';
    out.push({ type: 'Feature', properties: { key: l.key, status, tooltip: status === 'OK' ? (warn ? warn.slice(3) : '') : why(status) + warn },
      geometry: { type: 'LineString', coordinates } });
  }
  return out;
}
