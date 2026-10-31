// Ruting (routing editor, 2026-10-31, the user's drawing): an editor of its own in place of the timetable. Top: the
// line's table sets and ✕. Left: the selected journey pattern's stops. Centre: a map with its legs and stop names, the
// table set's other patterns faint. Bottom: one thumbnail per pattern, framed red / orange / green. Right: the info,
// layered by what is selected (table set → pattern → pattern + leg), and the actions. The user is in control: opening
// routes nothing; Route makes a proposal, Accept or Keep writes data/links/<line>.json, Discard drops it. While the
// view is open the rest of the app is locked (power tools); ✕ and Esc are the ways out.
import { app } from './state.js';
import { t } from '../i18n/strings.js';
import { onRefresh, refreshAll, runAction } from './shell.js';
import { onToolChange, setTool, setLeaveGuard, setToolAvailable, setToolEsc, activeTool } from './power-tools.js';
import { createMapView } from './map-view.js';
import { quayInfo } from './quays.js';
import { lineState } from './line-info.js';
import { isRoadLine } from '../routing/profiles.js';
import { decodePolyline } from '../routing/geometry.js';
import { createRoutingSession } from '../routing/session.js';
import { createRoutingClient } from '../routing/client.js';
import { createTileSource } from '../routing/tile-source.js';
import { emptyLineLinks, writeLineLinks } from '../project/links-store.js';
import { DEFAULT_SETTINGS } from '../project/settings.js';
import { styleUrlFor } from '../core/map-style.js';
import { patternThumb } from '../core/pattern-thumb.js';
import { pruneLineLinks } from '../core/route-patterns.js';

/** @typedef {[number, number]} LonLat */
/** @typedef {ReturnType<typeof createRoutingSession>} Session */
/** @typedef {(ctx: { code: string, rs: any, setId: number, onProgress: (done: number, total: number) => void }) => Session} SessionFactory */
/** @typedef {import('../core/route-patterns.js').Pattern} Pattern */
/** @typedef {import('../core/link-state.js').SavedLink} SavedLink */

/** The real session: the table set's patterns, the router worker, the project's tile cache. @type {SessionFactory} */
function defaultSession({ code, rs, setId, onProgress }) {
  return createRoutingSession({ code, rs, setId, onProgress, calendars: app.calendars, lineLinks: app.lineLinks.get(code) ?? emptyLineLinks(code), quayInfo,
    router: createRoutingClient(), tiles: createTileSource({ fs: /** @type {any} */ (app.fs), baseUrl: app.settings.routingTilesUrl || DEFAULT_SETTINGS.routingTilesUrl }) });
}

/** @type {SessionFactory} */
let makeSession = defaultSession;
/** @type {Session | null} */
let session = null;
let code = '';
/** @type {any} */
let rs = null;
let setId = 0;
/** @type {string | null} */
let selPattern = null;
/** @type {string | null} */
let selLeg = null;
/** @type {number | null} the selected waypoint of the selected leg */
let selWp = null;
let busy = false;
/** What a busy view is waiting for: the map data downloaded so far ('' while it routes). */
let progress = '';
let error = '';
let fitFor = '';
/** Changes run one after the other; each session has its own queue (a closed one may never settle: plan-3 final I1). */
let queue = Promise.resolve();
/** @type {import('./map-view.js').MapView | null} */
let view = null;
/** @type {HTMLElement | null} */
let mapEl = null;

const esc = (/** @type {string} */ s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const km = (/** @type {number} */ m) => {
  const s = (m / 1000).toFixed(1);
  return app.settings.lang === 'en' ? s : s.replace('.', ',');
};
const mins = (/** @type {number} */ s) => Math.round(s / 60);
/** The roads of a leg, each once; OSM's "ref;name" reads "162 Ring 1". @param {string[]} roads */
const roadList = (roads) => [...new Set(roads.map((r) => r.replace(/;/g, ' ')).filter(Boolean))].join(', ');
const isLink = (/** @type {any} */ l) => l?.status === 'OK';
const REASON = /** @type {Record<string, string>} */ ({ none: 'rvNone', unroutable: 'rvUnroutable', moved: 'rvMoved', map: 'rvMap', changed: 'rvChanged' });

/** @param {any} e */
function message(e) {
  const m = String(e?.message ?? e);
  if (m === 'routing-offline') return t('rtOffline');
  if (m === 'routing-bad-tile') return t('rtBadTile');
  return t('rtFailed', m);
}

const states = () => session?.states() ?? [];
const current = () => states().find((s) => s.pattern.id === selPattern) ?? null;

/** The route a leg has now: the proposal's, else the saved link. @param {any} st @param {string} key @returns {SavedLink | { state: string, error?: string } | undefined} */
function legNow(st, key) {
  return st.proposal?.legs.get(key) ?? session?.file().links[key];
}

/** A leg's line on the map: routed, or straight between its stops. @param {Pattern} p @param {number} i @param {any} l */
function coordsOf(p, i, l) {
  if (isLink(l)) return /** @type {LonLat[]} */ (decodePolyline(l.polyline, l.precision ?? 6));
  const a = p.stops[i].quay, b = p.stops[i + 1].quay;
  return a && b ? /** @type {LonLat[]} */ ([[a.lon, a.lat], [b.lon, b.lat]]) : [];
}

/** The waypoints of a leg: set in the proposal, else saved. @param {any} st @param {string} key @returns {LonLat[]} */
const viaOf = (st, key) => st.proposal?.via.get(key) ?? /** @type {any} */ (session?.file().links[key])?.via ?? [];

/** Why a leg needs a look ('' when it does not). @param {any} st @param {number} i */
function reason(st, i) {
  const leg = st.legs[i];
  const p = leg.key ? st.proposal?.legs.get(leg.key) : null;
  if (p && !isLink(p)) return p.error ? message({ message: p.error }) : t(p.state === 'no-road' ? 'rtNoRoad' : 'rtNoRoute');
  if (!p && REASON[leg.state]) return t(REASON[leg.state]);
  const l = leg.key ? legNow(st, leg.key) : null;
  return (/** @type {any} */ (l)?.flags ?? []).map((/** @type {string} */ f) => (f === 'detour' ? t('rtDetour') : t('rtFarSnap'))).join(', ');
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

/** Run a change after the ones before it, then draw. @param {(s: Session) => Promise<void>} fn */
function enqueue(fn) {
  const s = session;
  if (!s) return Promise.resolve();
  busy = true;
  render();
  queue = queue.then(() => (session === s ? fn(s) : undefined)).catch((e) => { if (session === s) error = message(e); })
    .then(() => { if (session === s) { busy = false; progress = ''; render(); } });
  return queue;
}

/** The last write of the links file: a new session waits for it, so it starts from what was saved (final review 3). */
let writing = Promise.resolve();

/**
 * Write the file accept / keep / update all returned — only for the session still open: a result that comes in after
 * the user left (and was asked) is not saved. @param {Session} s @param {import('../project/links-store.js').LineLinks} data
 */
async function write(s, data) {
  const fs = app.fs, c = code;
  if (!fs || session !== s) return;
  const w = runAction(() => writeLineLinks(fs, c, data)).then((ok) => { if (ok) app.lineLinks = new Map(app.lineLinks).set(c, data); });
  writing = w.catch(() => {});
  await w;
}

// ─── Selection ──────────────────────────────────────────────────────────────

/** @param {string | null} id */
function selectPattern(id) {
  if (id === selPattern) return;
  if (selPattern && session?.proposal(selPattern)) {
    if (!confirm(t('rvSwitch'))) return;
    session.discard(selPattern);
  }
  selPattern = id; selLeg = null; selWp = null;
  render();
}

/** @param {string | null} key */
function selectLeg(key) { selLeg = key; selWp = null; render(); }

/** @param {number} id */
function selectSet(id) {
  if (id === setId) return;
  if (session?.pending().length && !confirm(t('rvSwitch'))) return;
  start(id);
}

/** New waypoints for the selected leg. @param {string} key @param {LonLat[]} via */
function setVia(key, via) {
  const id = selPattern;
  if (!id) return;
  enqueue((s) => s.setWaypoints(id, key, via));
}

/** A click on a leg: select it; on the selected leg, add a waypoint. @param {string} key @param {LonLat} at */
function onLeg(key, at) {
  const st = current();
  if (!st || busy) return;
  const i = st.pattern.keys.indexOf(key);
  if (i < 0) return;
  if (selLeg !== key) { selectLeg(key); return; }
  const line = coordsOf(st.pattern, i, legNow(st, key)), via = [...viaOf(st, key)];
  const pos = along(line, at);
  const n = via.filter((v) => along(line, v) < pos).length;
  via.splice(n, 0, at);
  selWp = n;
  setVia(key, via);
}

// ─── Drawing ────────────────────────────────────────────────────────────────

function theme() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }

function ensureMap() {
  const el = /** @type {HTMLElement | null} */ (document.getElementById('rv-map'));
  if (!el) return null;
  if (!view || mapEl !== el) {
    view = createMapView(el, { style: styleUrlFor(app.settings, theme()), dark: theme() === 'dark' });
    mapEl = el;
    view.onLinkClick((key, at) => { if (session) onLeg(key, at); });
  }
  return view;
}

function drawMap() {
  const v = ensureMap();
  if (!v) return;
  v.resize();
  const st = current();
  /** @type {import('./map-view.js').MapLink[]} */
  const links = [];
  const mine = new Set(st?.pattern.keys ?? []);
  const seen = new Set();
  for (const o of states()) {
    if (o === st) continue;
    o.pattern.keys.forEach((k, i) => {
      if (!k || mine.has(k) || seen.has(k)) return;
      seen.add(k);
      links.push({ key: k, coords: coordsOf(o.pattern, i, legNow(o, k)), state: 'faint' });
    });
  }
  if (st) {
    st.pattern.keys.forEach((k, i) => {
      const key = k ?? `#${i}`;
      const l = k ? legNow(st, k) : undefined;
      const prop = k ? st.proposal?.legs.get(k) : undefined;
      // The comparison: the saved (or replaced) route dashed under the proposal
      const oldKey = k ? st.proposal?.old.get(k) ?? (prop ? k : null) : null;
      const old = oldKey ? session?.file().links[oldKey] : undefined;
      if (old && prop && isLink(old) && old !== prop) links.push({ key: `old:${key}`, coords: /** @type {LonLat[]} */ (decodePolyline(old.polyline, old.precision ?? 6)), state: 'old' });
      const legState = st.legs[i].state;
      const ok = isLink(l) && (prop || legState === 'routed' || legState === 'moved' || legState === 'map');
      /** @type {import('./map-view.js').MapLink['state']} */
      const state = key === selLeg ? 'selected' : !ok ? 'failed' : !prop && legState !== 'routed' ? 'stale'
        : /** @type {any} */ (l).flags?.length ? 'flagged' : /** @type {any} */ (l).via?.length ? 'via' : 'routed';
      links.push({ key, coords: coordsOf(st.pattern, i, ok ? l : undefined), state });
    });
  }
  v.setLinks(links);
  v.setStopLabels((st?.pattern.stops ?? []).flatMap((s, i) => (s.quay ? [{ lon: s.quay.lon, lat: s.quay.lat, name: s.name, n: i + 1 }] : [])));
  const via = st && selLeg ? viaOf(st, selLeg) : [];
  v.setMarkers(via.map(([lon, lat], i) => ({
    lon, lat, html: '', cls: `rt-wp${i === selWp ? ' on' : ''}`, size: 14, z: 900, draggable: true,
    onClick: () => { selWp = i; drawMap(); },
    onContext: () => { const next = [...via]; next.splice(i, 1); selWp = null; if (selLeg) setVia(selLeg, next); },
    onDragEnd: (/** @type {LonLat} */ p) => { const next = [...via]; next[i] = p; selWp = i; if (selLeg) setVia(selLeg, next); },
  })));
  const fitKey = `${setId}|${selPattern ?? ''}`;
  if (fitFor !== fitKey) {
    const pts = (st ? links.filter((l) => l.state !== 'faint') : links).flatMap((l) => l.coords);
    if (pts.length) { fitFor = fitKey; v.whenReady(() => v.fit(pts, { padding: 40, maxZoom: 15 })); }
  }
}

/** The pattern's thumbnail. @param {any} st */
function thumb(st) {
  const legs = st.pattern.keys.map((/** @type {string | null} */ k, /** @type {number} */ i) => coordsOf(st.pattern, i, k ? legNow(st, k) : undefined));
  const first = st.pattern.stops[0]?.name ?? '', last = st.pattern.stops.at(-1)?.name ?? '';
  return `<button type="button" class="rv-thumb rv-${st.state}${st.pattern.id === selPattern ? ' on' : ''}${st.proposal ? ' rv-pending' : ''}" data-id="${esc(st.pattern.id)}" title="${esc(`${first} – ${last}`)}">`
    + `<svg viewBox="0 0 90 56" aria-hidden="true"><path d="${patternThumb(legs, 90, 56)}"/></svg><span>${esc(t('rvStops', st.pattern.stops.length))} · ${esc(t('rvRuns', st.pattern.runs ?? 0))}</span></button>`;
}

/** Km and seconds of the pattern's legs, by a choice of link per leg. @param {any} st @param {(k: string) => any} pick */
function totals(st, pick) {
  let m = 0, s = 0;
  for (const k of st.pattern.keys) { const l = k ? pick(k) : null; if (isLink(l)) { m += l.distanceM; s += l.seconds ?? 0; } }
  return { m, s };
}

/**
 * The links no trip of the line uses: kept (not exported) until the user removes them, so fixing a typo in the timetable
 * brings the same link back (user 2026-10-31).
 */
function unused() {
  const file = session?.file();
  if (!file || !rs) return 0;
  const next = pruneLineLinks(rs, file);
  return next ? Object.keys(file.links).length - Object.keys(next.links).length : 0;
}

function info() {
  const all = states();
  const st = current();
  if (!st) {
    const n = (/** @type {string} */ s) => all.filter((x) => x.state === s).length;
    const keys = new Set(all.flatMap((x) => x.pattern.keys.filter(Boolean)));
    const m = [...keys].reduce((sum, k) => { const l = session?.file().links[/** @type {string} */ (k)]; return sum + (isLink(l) ? /** @type {any} */ (l).distanceM : 0); }, 0);
    return `<div class="rv-head">${esc(t('rtTitle'))}</div><div>${esc(t('rvSetSummary', all.length, n('green'), n('orange'), n('red')))}</div>`
      + `<div>${esc(t('rvLegsKm', keys.size, km(m)))}</div>${session?.newerMap() ? `<div class="rv-note">${esc(t('rtNewer'))}</div>` : ''}`
      + (unused() ? `<div class="rv-unused-note">${esc(t('rvUnused', unused()))} <button type="button" class="pop-btn rv-unused"${busy ? ' disabled' : ''}>${esc(t('rvRemoveUnused'))}</button></div>` : '');
  }
  const p = st.pattern;
  const now = totals(st, (k) => legNow(st, k));
  let html = `<div class="rv-head">${esc(p.stops[0]?.name)} – ${esc(p.stops.at(-1)?.name)}</div><div>${esc(t('rvStops', p.stops.length))}</div>`
    + `<div>${esc(t('rvPatternKm', km(now.m), mins(now.s)))}</div>`;
  const check = st.legs.map((_, i) => i).filter((i) => reason(st, i));
  if (check.length) {
    html += `<div class="rv-sub">${esc(t('rvToCheck'))}</div><ul class="rv-check">${check.map((i) =>
      `<li data-key="${esc(st.legs[i].key ?? '')}" class="rv-${st.state === 'red' && !isLink(legNow(st, st.legs[i].key ?? '')) ? 'failed' : 'flagged'}">${esc(p.stops[i].name)} – ${esc(p.stops[i + 1].name)}: ${esc(reason(st, i))}</li>`).join('')}</ul>`;
  }
  if (st.proposal) {
    // The comparison: before → after, per leg and for the pattern
    const before = (/** @type {string} */ k) => session?.file().links[st.proposal?.old.get(k) ?? k];
    const was = totals(st, before);
    const rows = [...st.proposal.legs.entries()].filter(([, l]) => isLink(l)).map(([k, l]) => {
      const i = p.keys.indexOf(k), b = /** @type {any} */ (before(k));
      const a = /** @type {SavedLink} */ (l);
      return `<li>${esc(p.stops[i]?.name)} – ${esc(p.stops[i + 1]?.name)}: ${isLink(b) ? `${km(b.distanceM)} → ` : ''}${km(a.distanceM)} km, ${isLink(b) ? `${mins(b.seconds ?? 0)} → ` : ''}${mins(a.seconds ?? 0)} min</li>`;
    });
    html += `<div class="rv-proposal"><div>${esc(t('rvProposal'))}</div><div class="rv-sub">${esc(t('rvCompare'))}</div><ul>${rows.join('')}</ul>`
      + `<div>${esc(t('rvPatternKm', `${was.m ? `${km(was.m)} → ` : ''}${km(now.m)}`, mins(now.s)))}</div></div>`;
  }
  if (selLeg) {
    const i = p.keys.indexOf(selLeg);
    const l = /** @type {any} */ (legNow(st, selLeg));
    const snaps = session?.file().snaps ?? {};
    const a = /** @type {any} */ (snaps[p.stops[i]?.quay?.quayId ?? '']), z = /** @type {any} */ (snaps[p.stops[i + 1]?.quay?.quayId ?? '']);
    const via = viaOf(st, selLeg);
    const viaPending = via.length && !st.proposal?.legs.has(selLeg) && JSON.stringify(via) !== JSON.stringify(l?.via ?? []);
    html += `<div class="rv-leg-info"><b>${esc(p.stops[i]?.name)} – ${esc(p.stops[i + 1]?.name)}</b>`;
    if (isLink(l)) {
      html += `<div>${esc(t('rtLeg', km(l.distanceM), mins(l.seconds ?? 0)))}${l.ferryM ? `, ${esc(t('rtFerry', km(l.ferryM)))}` : ''}</div>`
        + `<div>${esc(roadList(l.roads ?? []))}</div>${a && z ? `<div>${esc(t('rtSnaps', Math.round(a.off ?? 0), Math.round(z.off ?? 0)))}</div>` : ''}`;
    }
    if (via.length) html += `<div>${esc(t('rvWaypoints', via.length))}</div>`;
    if (viaPending) html += `<div class="rv-note">${esc(t('rvViaHint'))}</div>`;
    if (reason(st, i)) html += `<div class="rv-why">${esc(reason(st, i))}</div>`;
    html += '</div>';
  }
  return html;
}

function actions() {
  const st = current();
  const b = (/** @type {string} */ cls, /** @type {string} */ key, primary = false) => `<button type="button" class="pop-btn${primary ? ' primary' : ''} ${cls}"${busy ? ' disabled' : ''}>${esc(t(key))}</button>`;
  let html = '';
  if (st && st.pattern.keys.some(Boolean)) html += b('rv-route', 'rvRoute', !st.proposal && st.state !== 'green');
  if (st?.proposal?.legs.size) html += b('rv-accept', 'rvAccept', true);
  if (st && !st.proposal && st.legs.some((l) => l.state === 'moved' || l.state === 'map')) html += b('rv-keep', 'rvKeep');
  if (app.settings.autoRoute) html += b('rv-all', 'rvUpdateAll');
  return html;
}

/**
 * The table set's rows, each with the pattern's call it is (null: passed) — so the stops are as recognisable as in the
 * timetable (user 2026-10-31). A dwell's arrival row is left out (the call is one stop). Null when the rows do not hold
 * the pattern (then its own stops are listed). @param {Pattern} p @returns {{ name: string, call: number | null }[] | null}
 */
function rowsOf(p) {
  const per = (rs?.periods ?? []).find((/** @type {any} */ x) => x.setId === setId);
  const grid = per ? rs.grids?.[`${per.id}:${setId}`] : null;
  if (!grid) return null;
  let i = 0;
  const rows = grid.stops.filter((/** @type {any} */ r) => !r.isDwellArr).map((/** @type {any} */ r) => {
    const call = i < p.stops.length && String(r.stopId ?? '') === p.stops[i].stopId ? i++ : null;
    return { name: String(r.name ?? ''), call };
  });
  return i === p.stops.length ? rows : null;
}

function stopList() {
  const st = current();
  if (!st) return `<div class="rv-pick">${esc(t('rvPick'))}</div>`;
  const p = st.pattern;
  const rows = rowsOf(p) ?? p.stops.map((s, i) => ({ name: s.name, call: /** @type {number | null} */ (i) }));
  /** The leg the rows below a call belong to (-1 before the first call). */
  let leg = -1;
  const bad = (/** @type {number} */ i) => st.legs[i].state !== 'routed' && !(p.keys[i] && isLink(st.proposal?.legs.get(/** @type {string} */ (p.keys[i]))));
  return `<ol>${rows.map((r) => {
    if (r.call === null) {
      const inLeg = leg >= 0 && leg < p.keys.length;
      return `<li class="rv-st rv-pass${inLeg ? ` rv-in${bad(leg) ? ' rv-bad' : ''}` : ''}">| ${esc(r.name)}</li>`;
    }
    const i = r.call;
    leg = i;
    let li = `<li class="rv-st${p.stops[i].quay ? '' : ' rv-nopos'}">${esc(r.name)}</li>`;
    if (i < p.keys.length) {
      const k = p.keys[i];
      li += `<li class="rv-gap${bad(i) ? ' rv-bad' : ''}${k && k === selLeg ? ' on' : ''}"${k ? ` data-key="${esc(k)}"` : ''}></li>`;
    }
    return li;
  }).join('')}</ol>`;
}

/** The way out, at the bottom right (user 2026-10-31): Forkast drops the open proposal, Bruk accepts it, saves and closes, Lukk closes. */
function footer() {
  const open = !!session?.pending().length;
  const b = (/** @type {string} */ cls, /** @type {string} */ key, on = true, primary = false) => `<button type="button" class="pop-btn${primary ? ' primary' : ''} ${cls}"${busy || !on ? ' disabled' : ''}>${esc(t(key))}</button>`;
  return b('rv-discard', 'rvDiscard', open) + b('rv-apply', 'rvApply', open, true) + `<button type="button" class="pop-btn rv-close" title="Esc">${esc(t('rvClose'))}</button>`;
}

function render() {
  const root = document.getElementById('route-view');
  if (!root || !session) return;
  const sets = (rs?.tableSets ?? []).map((/** @type {any} */ s) => `<button type="button" class="rv-set${s.id === setId ? ' on' : ''}" data-set="${s.id}">${esc(s.name || t('tableSetUnnamed'))}</button>`).join('');
  /** @type {HTMLElement} */ (root.querySelector('.rv-sets')).innerHTML = sets;
  /** @type {HTMLElement} */ (root.querySelector('.rv-stops')).innerHTML = stopList();
  const wait = busy ? `<div class="rv-busy"><span class="rv-spin" aria-hidden="true"></span>${esc(progress || t('rvWorking'))}</div>` : '';
  /** @type {HTMLElement} */ (root.querySelector('.rv-info')).innerHTML = wait + info() + (error ? `<div class="rv-error">${esc(error)}</div>` : '')
    + `<div class="rv-hint">${esc(t('rvHint'))}</div>`;
  /** @type {HTMLElement} */ (root.querySelector('.rv-actions')).innerHTML = actions();
  /** @type {HTMLElement} */ (root.querySelector('.rv-foot')).innerHTML = footer();
  /** @type {HTMLElement} */ (root.querySelector('.rv-strip')).innerHTML = states().map(thumb).join('');
  drawMap();
}

// ─── Opening and closing ────────────────────────────────────────────────────

function build() {
  const root = /** @type {HTMLElement} */ (document.getElementById('route-view'));
  // The legend (user 2026-10-31): the map's colours and dashes, built once so it stays open or closed as the user left it
  const lg = /** @type {[string, string][]} */ ([['routed', 'rvLgRouted'], ['via', 'rvLgVia'], ['flagged', 'rvLgCheck'], ['failed', 'rvLgNone'],
    ['old', 'rvLgOld'], ['selected', 'rvLgSelected'], ['faint', 'rvLgOther']]);
  const legend = `<details class="rv-legend"><summary>${esc(t('rvLegend'))}</summary><ul>${lg.map(([c, k]) => `<li><i class="rv-lg rv-lg-${c}"></i>${esc(t(k))}</li>`).join('')}</ul></details>`;
  root.innerHTML = `<div class="rv-top"><span class="rv-title">${esc(t('rtTitle'))}</span><div class="rv-sets"></div></div>`
    + '<div class="rv-body"><div class="rv-stops"></div><div class="rv-mapwrap"><div id="rv-map"></div>'
    + `<div class="rv-attr">${esc(t('rtAttribution'))}</div></div><div class="rv-side"><div class="rv-info"></div>${legend}<div class="rv-actions"></div><div class="rv-foot"></div></div></div>`
    + '<div class="rv-strip"></div>';
  root.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    const id = selPattern;
    if (el.closest('.rv-close')) setTool('');
    // While it routes or saves, the selection stays (final review 3: no switch from under a write, no hidden proposal)
    else if (busy && el.closest('.rv-set, .rv-thumb, .rv-gap, .rv-check li, .rv-foot, .rv-unused')) return;
    else if (el.closest('.rv-discard')) { for (const p of session?.pending() ?? []) session?.discard(p); render(); }
    else if (el.closest('.rv-apply')) {
      enqueue(async (s) => { for (const p of s.pending()) await s.accept(p); await write(s, s.file()); }).then(() => { if (!error) setTool(''); });
    } else if (el.closest('.rv-unused')) {
      if (confirm(t('rvRemoveUnusedQ', unused()))) enqueue(async (s) => write(s, s.removeUnused()));
    }
    else if (el.closest('.rv-set')) selectSet(Number(/** @type {HTMLElement} */ (el.closest('.rv-set')).dataset.set));
    else if (el.closest('.rv-thumb')) selectPattern(/** @type {HTMLElement} */ (el.closest('.rv-thumb')).dataset.id ?? null);
    else if (el.closest('.rv-gap[data-key]')) selectLeg(/** @type {HTMLElement} */ (el.closest('.rv-gap')).dataset.key ?? null);
    else if (el.closest('.rv-check li[data-key]')) selectLeg(/** @type {HTMLElement} */ (el.closest('li')).dataset.key || null);
    else if (busy || !id) {
      if (el.closest('.rv-all')) enqueue(async (s) => write(s, await s.updateAll()));
    } else if (el.closest('.rv-route')) { const leg = selLeg ?? undefined; enqueue((s) => s.route(id, leg)); }
    else if (el.closest('.rv-accept')) enqueue(async (s) => write(s, await s.accept(id)));
    else if (el.closest('.rv-keep')) enqueue(async (s) => write(s, s.keep(id)));
    else if (el.closest('.rv-all')) enqueue(async (s) => write(s, await s.updateAll()));
  });
}

let starts = 0;
/** A session on table set `id`, once the last write has landed. @param {number} id */
async function start(id) {
  session?.close();
  session = null;
  const n = ++starts;
  await writing;
  if (n !== starts || !isOpen) return;
  setId = id;
  selPattern = null; selLeg = null; selWp = null; error = ''; busy = false; fitFor = '';
  queue = Promise.resolve();
  session = makeSession({ code, rs, setId, onProgress: (done, total) => { progress = t('rvFetching', done, total); render(); } });
  const s = session;
  render();
  enqueue(() => s.open());
}

let isOpen = false;

function open() {
  rs = app.activeRoute ? lineState(app.activeRoute) : null;
  if (!rs || !app.activeRoute) { setTool(''); return; }
  code = app.activeRoute;
  isOpen = true;
  document.body.classList.add('route-on');
  build();
  start(rs.activeSet);
}

function close() {
  isOpen = false;
  session?.close();
  session = null;
  document.body.classList.remove('route-on');
  const root = document.getElementById('route-view');
  if (root) root.replaceChildren();
  view = null; mapEl = null;
  refreshAll();
}

/** Esc steps back: the leg, then the pattern; with nothing selected the view closes. */
function stepBack() {
  if (selLeg) { selectLeg(null); return true; }
  if (selPattern) { selectPattern(null); return true; }
  return false;
}

/** @param {{ createSession?: SessionFactory }} [opts] a test can hand in its own session */
export function initRouteView({ createSession } = {}) {
  makeSession = createSession ?? defaultSession;
  if (isOpen) close();
  // Leaving with a proposal, or while it routes or saves, asks first
  setLeaveGuard('route', () => !session || (!busy && !session.pending().length) || confirm(t('rvLeave')));
  setToolEsc('route', stepBack);
  const available = () => setToolAvailable('route', isRoadLine(app.routeState), t('ptRouteNoRoad'));
  available();
  if (wired) return;
  wired = true;
  onRefresh(available);
  onToolChange((name) => {
    if (name === 'route' && !isOpen) open();
    else if (name !== 'route' && isOpen) close();
  });
  // Delete or Backspace removes the selected waypoint (only while one is selected)
  document.addEventListener('keydown', (e) => {
    if (activeTool() !== 'route' || selWp == null || !selLeg || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
    const st = current();
    if (!st) return;
    e.preventDefault(); e.stopPropagation();
    const via = [...viaOf(st, selLeg)];
    via.splice(selWp, 1);
    selWp = null;
    setVia(selLeg, via);
  }, true);
}
let wired = false;
