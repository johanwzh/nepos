// The routing power tool (2.6, spec §6–§7): Ruting routes every leg of the shown table set in a session on the map.
// The map is the tool; the rest of the page is locked. A box on the map shows progress, the legs that need a look,
// the selected leg, and Apply / ✕. Click a leg to select it, click it again to add a waypoint; drag a waypoint to move
// it; right-click or Delete removes it. Apply writes data/links/<line>.json; ✕ and Esc leave without writing.
import { app } from './state.js';
import { t } from '../i18n/strings.js';
import { onRefresh, refreshAll, openPanel, runAction } from './shell.js';
import { onToolChange, setTool, setLeaveGuard, setToolAvailable, activeTool } from './power-tools.js';
import { drawExtra, redraw } from './map-panel.js';
import { quayInfo } from './quays.js';
import { lineState } from './line-info.js';
import { linkChains } from '../core/link-pairs.js';
import { isRoadLine } from '../routing/profiles.js';
import { decodePolyline } from '../routing/geometry.js';
import { createRoutingSession } from '../routing/session.js';
import { createRoutingClient } from '../routing/client.js';
import { createTileSource } from '../routing/tile-source.js';
import { emptyLineLinks, writeLineLinks } from '../project/links-store.js';
import { DEFAULT_SETTINGS } from '../project/settings.js';

/** @typedef {[number, number]} LonLat */
/** @typedef {any} Session the plan-3 session (replaced by route-view.js, routing editor 2026-10-31) */
/** @typedef {(ctx: { code: string, rs: any }) => Session} SessionFactory */

/** The real session: the shown table set's chains, the router worker, the project's tile cache. @type {SessionFactory} */
function defaultSession({ code, rs }) {
  const chains = linkChains(rs, { calendars: app.calendars, quayInfo, setId: rs.activeSet });
  return /** @type {any} */ (createRoutingSession)({ code, chains, lineLinks: app.lineLinks.get(code) ?? emptyLineLinks(code), quayInfo, router: createRoutingClient(),
    tiles: createTileSource({ fs: /** @type {any} */ (app.fs), baseUrl: app.settings.routingTilesUrl || DEFAULT_SETTINGS.routingTilesUrl }) });
}

/** @type {SessionFactory} */
let makeSession = defaultSession;
/** @type {Session | null} */
let session = null;
let code = '';
let status = /** @type {'loading' | 'ready' | 'error'} */ ('loading');
let progress = '';
let error = '';
let applied = false;
let applying = false;
/** @type {string | null} */
let selected = null;
/** @type {number | null} the selected waypoint of the selected leg */
let selectedWp = null;
let fitted = false;
/** Changes run one after the other; each session has its own queue (a closed one may never settle: final review I1). */
let queue = Promise.resolve();
/** @type {HTMLElement | null} */
let box = null;
const clickWired = new WeakSet();

const km = (/** @type {number} */ m) => {
  const s = (m / 1000).toFixed(1);
  return app.settings.lang === 'en' ? s : s.replace('.', ',');
};
const esc = (/** @type {string} */ s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const name = (/** @type {{ quayId: string }} */ q) => quayInfo.get(q.quayId)?.stopPlaceName || q.quayId;
/** The roads of a leg, each once; OSM's "ref;name" reads "162 Ring 1". @param {string[]} roads */
const roadList = (roads) => [...new Set(roads.map((r) => r.replace(/;/g, ' ')).filter(Boolean))].join(', ');
const failed = (/** @type {any} */ p) => p.state === 'no-route' || p.state === 'no-road' || p.state === 'pending';

/** @param {any} p */
function reason(p) {
  if (p.error) return message({ message: p.error });
  if (p.state === 'no-route') return t('rtNoRoute');
  if (p.state === 'no-road') return t('rtNoRoad');
  if (p.state === 'pending') return t('rtPending');
  return p.flags.map((/** @type {string} */ f) => (f === 'detour' ? t('rtDetour') : t('rtFarSnap'))).join(', ');
}

/** The leg's line on the map: the routed polyline, or a straight line between the Quays. @param {any} p @returns {LonLat[]} */
function coordsOf(p) {
  if (p.state === 'routed' && p.link) return /** @type {LonLat[]} */ (decodePolyline(p.link.polyline, p.link.precision ?? 6));
  return [[p.from.lon, p.from.lat], [p.to.lon, p.to.lat]];
}

/** Where along a line a point lies (segment index + fraction), to keep the waypoints in driving order. @param {LonLat[]} line @param {LonLat} p */
function along(line, p) {
  let best = Infinity, at = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1], [bx, by] = line[i];
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const f = len ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len)) : 0;
    const d = (ax + f * dx - p[0]) ** 2 + (ay + f * dy - p[1]) ** 2;
    if (d < best) { best = d; at = i - 1 + f; }
  }
  return at;
}

/** Run a change after the ones before it, then draw. @param {() => Promise<void>} fn */
function enqueue(fn) {
  const s = session;
  queue = queue.then(fn).catch((e) => { if (session === s) error = message(e); }).then(() => { if (session === s) { render(); redraw(); } });
  return queue;
}

/** @param {any} e */
function message(e) {
  const m = String(e?.message ?? e);
  if (m === 'routing-offline') return t('rtOffline');
  if (m === 'routing-bad-tile') return t('rtBadTile');
  return t('rtFailed', m);
}

/** New waypoints for a leg. @param {string} key @param {LonLat[]} via */
function setVia(key, via) {
  const s = session;
  if (!s) return;
  enqueue(() => s.setWaypoints(key, via));
}

/** @param {string} key @param {LonLat} at */
function onLeg(key, at) {
  if (!session || status !== 'ready') return;
  if (selected !== key) { selected = key; selectedWp = null; render(); redraw(); return; }
  const p = session.pairs().find((x) => x.key === key);
  if (!p) return;
  const line = coordsOf(p), via = [...p.via];
  const pos = along(line, at);
  const i = via.filter((v) => along(line, v) < pos).length;
  via.splice(i, 0, at);
  selectedWp = i;
  setVia(key, via);
}

/** The session's legs and the selected leg's waypoints. @param {import('./map-view.js').MapView} v */
function draw(v) {
  if (!clickWired.has(v)) { clickWired.add(v); v.onLinkClick((key, at) => onLeg(key, at)); }
  v.setTrip({ line: [], dots: [], ring: null });
  v.setDashed([]);
  const pairs = session?.pairs() ?? [];
  const links = pairs.map((p) => ({ key: p.key, coords: coordsOf(p),
    state: /** @type {'routed' | 'flagged' | 'failed' | 'selected'} */ (p.key === selected ? 'selected' : failed(p) ? 'failed' : p.flags.length ? 'flagged' : 'routed') }));
  v.setLinks(links);
  const sel = pairs.find((p) => p.key === selected);
  v.setMarkers((sel?.via ?? []).map(([lon, lat], i) => ({
    lon, lat, html: '', cls: `rt-wp${i === selectedWp ? ' on' : ''}`, size: 14, z: 900, draggable: true,
    onClick: () => { selectedWp = i; redraw(); },
    onContext: () => { const via = [...sel.via]; via.splice(i, 1); selectedWp = null; setVia(sel.key, via); },
    onDragEnd: (/** @type {LonLat} */ p) => { const via = [...sel.via]; via[i] = p; selectedWp = i; setVia(sel.key, via); },
  })));
  if (!fitted && status === 'ready' && links.length) { fitted = true; v.fit(links.flatMap((l) => l.coords), { padding: 30, maxZoom: 15 }); }
}

function render() {
  if (!box || !session) return;
  const pairs = session.pairs();
  const check = [...pairs.filter(failed), ...pairs.filter((p) => !failed(p) && p.flags.length)];
  const sel = pairs.find((p) => p.key === selected);
  const snaps = session.result().snaps;
  let html = `<div class="rt-head">${esc(t('rtTitle'))}</div>`;
  if (status === 'loading') html += `<div class="rt-progress">${esc(progress || t('rtLoading'))}</div>`;
  if (status === 'ready') {
    html += `<div class="rt-count">${esc(t('rtCount', pairs.length - check.filter(failed).length, check.length))}</div>`;
    if (check.length) html += `<ul class="rt-check">${check.map((p) => `<li data-key="${esc(p.key)}" class="${failed(p) ? 'rt-failed' : 'rt-flagged'}">${esc(name(p.from))} – ${esc(name(p.to))}: ${esc(reason(p))}</li>`).join('')}</ul>`;
    if (sel) {
      const l = sel.link;
      const off = (/** @type {string} */ id) => Math.round(snaps[id]?.off ?? 0);
      html += `<div class="rt-leg"><b>${esc(name(sel.from))} – ${esc(name(sel.to))}</b><br>${l && sel.state === 'routed'
        ? `${esc(t('rtLeg', km(l.distanceM), Math.round((l.seconds ?? 0) / 60)))}${l.ferryM ? `, ${esc(t('rtFerry', km(l.ferryM)))}` : ''}<br>${esc(roadList(l.roads ?? []))}<br>${esc(t('rtSnaps', off(sel.from.quayId), off(sel.to.quayId)))}`
        : esc(reason(sel))}</div>`;
    }
    if (session.newerMap()) html += `<div class="rt-newer">${esc(t('rtNewer'))}</div>`;
    html += `<div class="rt-hint">${esc(t('rtHint'))}</div>`;
  }
  if (error) html += `<div class="rt-error">${esc(error)}</div>`;
  html += `<div class="rt-attr">${esc(t('rtAttribution'))}</div>`;
  html += `<div class="rt-foot"><button type="button" class="pop-btn primary rt-apply"${status === 'ready' ? '' : ' disabled'}>${esc(t('rtApply'))}</button></div>`;
  html += '<button type="button" class="rt-x" title="Esc">✕</button>';
  box.innerHTML = html;
}

async function apply() {
  const s = session, fs = app.fs, c = code;
  if (!s || !fs || status !== 'ready' || applying) return;
  applying = true;
  try {
    await queue;
    // Left without saving while a re-route finished, or another session opened since: write nothing (final review I2)
    if (session !== s) return;
    const data = s.result();
    if (!(await runAction(() => writeLineLinks(fs, c, data)))) return;
    app.lineLinks = new Map(app.lineLinks).set(c, data);
  } finally {
    applying = false;
  }
  applied = true;
  setTool('');
  refreshAll();
}

function open() {
  const rs = app.activeRoute ? lineState(app.activeRoute) : null;
  if (!rs || !app.activeRoute) { setTool(''); return; }
  code = app.activeRoute;
  status = 'loading'; progress = ''; error = ''; applied = false; applying = false; selected = null; selectedWp = null; fitted = false;
  queue = Promise.resolve();
  session = makeSession({ code, rs });
  openPanel('right');
  box = document.createElement('div');
  box.className = 'rt-box';
  box.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    if (el.closest('.rt-x')) setTool('');
    else if (el.closest('.rt-apply')) apply();
    else {
      const li = /** @type {HTMLElement | null} */ (el.closest('.rt-check li'));
      if (li?.dataset.key) { selected = li.dataset.key; selectedWp = null; render(); redraw(); }
    }
  });
  // Above the map in its panel, never over it
  const inner = document.getElementById('map-inner');
  if (inner?.parentElement) inner.parentElement.insertBefore(box, inner); else document.body.appendChild(box);
  render();
  drawExtra(draw);
  const s = session;
  enqueue(async () => {
    try {
      await s.start((done, total) => { progress = t('rtRouting', done, total); render(); redraw(); });
      if (session === s) status = 'ready';
    } catch (e) {
      if (session === s) status = 'error';
      throw e;
    }
  });
}

function close() {
  session?.close();
  session = null;
  box?.remove();
  box = null;
  drawExtra(null);
}

/** @param {{ createSession?: SessionFactory }} [opts] a test can hand in its own session */
export function initRouteSessionUi({ createSession } = {}) {
  makeSession = createSession ?? defaultSession;
  close();
  setLeaveGuard('route', () => applied || !session || !session.dirty() || confirm(t('rtLeave')));
  const available = () => setToolAvailable('route', isRoadLine(app.routeState), t('ptRouteNoRoad'));
  available();
  if (wired) return;
  wired = true;
  onRefresh(available);
  onToolChange((name) => {
    if (name === 'route' && !session) open();
    else if (name !== 'route' && session) close();
  });
  // Delete or Backspace removes the selected waypoint (only while one is selected: the grid keeps its keys otherwise)
  document.addEventListener('keydown', (e) => {
    if (activeTool() !== 'route' || selectedWp == null || !selected || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
    const p = session?.pairs().find((x) => x.key === selected);
    if (!p) return;
    e.preventDefault(); e.stopPropagation();
    const via = [...p.via];
    via.splice(selectedWp, 1);
    selectedWp = null;
    setVia(p.key, via);
  }, true);
}
let wired = false;
