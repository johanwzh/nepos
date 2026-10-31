// Nettverkskart (Analyse spec 2026-10-31, part 2): the network map over the whole page, opened from Analyse, for the
// node picked there. Each line's stretches (along the road where routed), the main stops, and the trips running at a
// date and a time: a dot moving along its leg, a ring while it waits at a stop. A jog and a slider move the time, ▶
// plays it. What the planner looks for: buses bunching, gaps in coverage. Esc or ✕ closes.
import { app } from './state.js';
import { t } from '../i18n/strings.js';
import { quayInfo } from './quays.js';
import { lineState, lineLabel } from './line-info.js';
import { createMapView } from './map-view.js';
import { styleUrlFor } from '../core/map-style.js';
import { networkOf } from '../core/network.js';
import { tripsAt } from '../core/analysis/positions.js';
import { inMotion, busiestDate } from '../core/analysis/time.js';
import { clock } from '../core/analysis/text.js';
import { isExportable } from '../core/link-state.js';
import { decodePolyline } from '../routing/geometry.js';
import { jogDial } from './jog/jogDial.js';
import { analysisSelection, selectedNode, factsFor } from './analysis-page.js';

/** @typedef {[number, number]} LonLat */
const PALETTE = ['#2563eb', '#d97706', '#16a34a', '#db2777', '#7c3aed', '#0891b2', '#b45309', '#4d7c0f', '#be123c', '#0f766e'];
const esc = (/** @type {unknown} */ s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const ymd = (/** @type {Date} */ d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const iso = (/** @type {string} */ d) => (d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '');

let isOpen = false;
let date = '';
let minute = 7 * 60;
/** @type {any} */
let timer = null;
/** @type {ReturnType<typeof createMapView> | null} */
let view = null;
/** The node's lines, facts and geometry while the view is open. @type {{ codes: string[], facts: import('../core/analysis/facts.js').TripFact[], colour: Map<string, string>, legs: Map<string, LonLat[]>, last: number } | null} */
let scene = null;

const root = () => /** @type {HTMLElement} */ (document.getElementById('network-view'));
/** @param {string} id @returns {LonLat | null} */
const stopPos = (id) => { const q = quayInfo.get(id); return q && Number.isFinite(q.lon) && Number.isFinite(q.lat) ? [q.lon, q.lat] : null; };

/** The trips at the time on screen, onto the map and into the readout. */
function placeTrips() {
  if (!scene || !view) return;
  const s = scene;
  const trips = tripsAt(s.facts, date, minute, { legLine: (k) => s.legs.get(k) ?? null, stopPos });
  view.setTrips(trips.map((p) => ({ line: p.line, lon: p.lon, lat: p.lat, waiting: p.waiting, c: s.colour.get(p.line) ?? PALETTE[0], tooltip: esc(lineLabel(p.line)) })));
  const at = root().querySelector('.nv-at');
  if (at) at.textContent = t('nvAt', clock(minute), trips.length);
  const slider = /** @type {HTMLInputElement | null} */ (root().querySelector('.nv-time'));
  if (slider && Number(slider.value) !== minute) slider.value = String(minute);
}

/** @param {number} m */
function setMinute(m) {
  minute = Math.max(0, Math.min(scene?.last ?? 1440, Math.round(m)));
  placeTrips();
}

function stop() { clearInterval(timer); timer = null; const b = root().querySelector('.nv-play'); if (b) b.textContent = '▶'; }

function build() {
  const node = selectedNode();
  const { period } = analysisSelection();
  const codes = node.lines;
  const facts = factsFor(codes);
  date = busiestDate(facts, period) ?? ymd(new Date());
  const m = inMotion(facts, date);
  /** @type {Map<string, LonLat[]>} the routed legs the export would write, by key */
  const legs = new Map();
  for (const code of codes) for (const [key, link] of Object.entries(app.lineLinks.get(code)?.links ?? {})) {
    if (!legs.has(key) && isExportable(key, link, quayInfo)) try { legs.set(key, decodePolyline(link.polyline, link.precision ?? 6)); } catch { /* a broken polyline: straight */ }
  }
  scene = { codes, facts, colour: new Map(codes.map((c, i) => [c, PALETTE[i % PALETTE.length]])), legs, last: Math.max(m.slots.length * 15, 1440) };
  minute = m.peak.count ? m.peak.slot * 15 : 7 * 60;
  const el = root();
  el.innerHTML = `<div class="nv-top"><span class="nv-title">${esc(t('nvTitle'))}</span><span>${esc(node.name)}</span>`
    + `<input type="date" class="nv-date" value="${iso(date)}"><span class="nv-jog"></span>`
    + `<input type="range" class="nv-time" min="0" max="${scene.last}" step="1" value="${minute}"><button type="button" class="pop-btn nv-play" title="${esc(t('nvPlay'))}">▶</button>`
    + `<span class="nv-at"></span><button type="button" class="rv-x nv-close" title="${esc(t('nvClose'))}">✕</button></div><div class="nv-map"></div>`;
  const dial = jogDial({ size: 26, detents: true, pxPerNotch: 8, onNudge: (/** @type {1 | -1} */ dir, /** @type {boolean} */ coarse) => { stop(); setMinute(minute + dir * (coarse ? 10 : 1)); } });
  el.querySelector('.nv-jog')?.append(dial);
  const host = /** @type {HTMLElement} */ (el.querySelector('.nv-map'));
  const routes = codes.map((code) => ({ code, rs: lineState(code), problem: false, links: app.lineLinks.get(code)?.links })).filter((r) => r.rs);
  const net = networkOf(routes, quayInfo);
  if (!net.stops.length) { host.innerHTML = `<p class="home-empty nv-none">${esc(t('nvNone'))}</p>`; view = null; return; }
  try {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    view = createMapView(host, { style: styleUrlFor(app.settings, dark ? 'dark' : 'light'), dark });
    const most = Math.max(...net.segments.map((s) => s.trips), 1);
    // Drawn as on Oversikt before (2026-10-31): width by trips, main stops only, small
    view.setNetwork({
      lines: net.segments.map((s) => ({ coords: s.coords, w: 2 + 6 * Math.log1p(s.trips) / Math.log1p(most), c: '#9aa7b4', tooltip: `${esc(s.lines.map(lineLabel).join(', '))} · ${s.trips}` })),
      stops: net.stops.filter((p) => p.main).map((p) => ({ lon: p.lon, lat: p.lat, r: p.lines > 1 ? 3 : 2.5, tooltip: esc(p.name) })),
    });
    const v = view;
    v.whenReady(() => v.fit(net.stops.map((p) => /** @type {LonLat} */ ([p.lon, p.lat])), { padding: 30, maxZoom: 13 }));
    v.resize();
  } catch { view = null; /* no map here (no WebGL) */ }
  placeTrips();
}

/** Open the view for the node on Analyse. */
export function openNetworkView() {
  isOpen = true;
  document.body.classList.add('network-on');
  root().hidden = false;
  build();
}

function close() {
  isOpen = false;
  stop();
  document.body.classList.remove('network-on');
  const el = root();
  el.hidden = true;
  el.replaceChildren();
  try { view?.destroy(); } catch { /* already gone */ }
  view = null; scene = null;
}

let wired = false;
export function initNetworkView() {
  if (isOpen) close();
  if (wired) return;
  wired = true;
  document.addEventListener('keydown', (e) => { if (isOpen && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }, true);
  document.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    if (!isOpen || !el.closest?.('#network-view')) return;
    if (el.closest('.nv-close')) close();
    else if (el.closest('.nv-play')) {
      if (timer) { stop(); return; }
      /** @type {HTMLElement} */ (el.closest('.nv-play')).textContent = '⏸';
      timer = setInterval(() => { if (minute >= (scene?.last ?? 1440)) stop(); else setMinute(minute + 1); }, 200);
    }
  });
  document.addEventListener('input', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (isOpen && el.matches?.('#network-view .nv-time')) { stop(); setMinute(Number(el.value)); }
  });
  document.addEventListener('change', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (isOpen && el.matches?.('#network-view .nv-date') && el.value) { stop(); date = el.value.replace(/-/g, ''); placeTrips(); }
  });
}
