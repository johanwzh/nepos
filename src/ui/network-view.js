// Nettverkskart (Analyse spec 2026-10-31, part 2): the network map over the whole page, opened from Analyse, for the
// node picked there. Each line's stretches (along the road where routed), the main stops, and the trips running at a
// date and a time: a dot moving along its leg, a ring while it waits at a stop. A jog and a slider move the time in
// 10-second steps, ▶ plays it (a plan-minute per 0.6 s, ×5 and ×20 faster); between stops the dot glides, its place
// worked out for the second. What the planner looks for: buses bunching, gaps in coverage. Esc or ✕ closes.
import { app } from './state.js';
import { t } from '../i18n/strings.js';
import { quayInfo } from './quays.js';
import { lineState, lineLabel } from './line-info.js';
import { createMapView } from './map-view.js';
import { styleUrlFor } from '../core/map-style.js';
import { networkOf } from '../core/network.js';
import { tripsAt } from '../core/analysis/positions.js';
import { inMotion, busiestDate } from '../core/analysis/time.js';
import { isExportable } from '../core/link-state.js';
import { decodePolyline } from '../routing/geometry.js';
import { jogDial } from './jog/jogDial.js';
import { analysisSelection, selectedNode, factsFor } from './analysis-page.js';

/** @typedef {[number, number]} LonLat */
const PALETTE = ['#2563eb', '#d97706', '#16a34a', '#db2777', '#7c3aed', '#0891b2', '#b45309', '#4d7c0f', '#be123c', '#0f766e'];
const esc = (/** @type {unknown} */ s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const ymd = (/** @type {Date} */ d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const iso = (/** @type {string} */ d) => (d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '');

const STEP = 10; // seconds: the jog's, the slider's and ▶'s step
const TICK = 100; // ms between ▶'s steps: ×1 is a plan-minute per 0.6 s
const SPEEDS = [1, 5, 20];

let isOpen = false;
let date = '';
/** The time on screen, in seconds after the date's midnight. */
let second = 7 * 3600;
let speed = 1;
/** @type {any} */
let timer = null;
/** @type {ReturnType<typeof createMapView> | null} */
let view = null;
/** The node's lines, facts and geometry while the view is open. @type {{ codes: string[], facts: import('../core/analysis/facts.js').TripFact[], colour: Map<string, string>, legs: Map<string, LonLat[]>, last: number } | null} */
let scene = null;

const root = () => /** @type {HTMLElement} */ (document.getElementById('network-view'));
/** @param {string} id @returns {LonLat | null} */
const stopPos = (id) => { const q = quayInfo.get(id); return q && Number.isFinite(q.lon) && Number.isFinite(q.lat) ? [q.lon, q.lat] : null; };

/** A clock time with seconds from seconds after midnight (07:05:10; past midnight +1). @param {number} s */
const hms = (s) => {
  const d = Math.floor(s / 86400), v = s - d * 86400, two = (/** @type {number} */ n) => String(Math.floor(n)).padStart(2, '0');
  return `${two(v / 3600)}:${two((v % 3600) / 60)}:${two(v % 60)}${d ? ` +${d}` : ''}`;
};

/** The trips at the time on screen, onto the map and into the readout. */
function placeTrips() {
  if (!scene || !view) return;
  const s = scene;
  const trips = tripsAt(s.facts, date, second / 60, { legLine: (k) => s.legs.get(k) ?? null, stopPos });
  view.setTrips(trips.map((p) => ({ line: p.line, lon: p.lon, lat: p.lat, waiting: p.waiting, c: s.colour.get(p.line) ?? PALETTE[0], tooltip: esc(lineLabel(p.line)) })));
  const at = root().querySelector('.nv-at');
  if (at) at.textContent = t('nvAt', hms(second), trips.length);
  const slider = /** @type {HTMLInputElement | null} */ (root().querySelector('.nv-time'));
  if (slider && Number(slider.value) !== second) slider.value = String(second);
}

/** @param {number} s seconds, to the step */
function setSecond(s) {
  second = Math.max(0, Math.min((scene?.last ?? 1440) * 60, Math.round(s / STEP) * STEP));
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
  second = (m.peak.count ? m.peak.slot * 15 : 7 * 60) * 60;
  const el = root();
  el.innerHTML = `<div class="nv-top"><span class="nv-title">${esc(node.name)}</span>`
    + `<input type="date" class="nv-date" value="${iso(date)}"><span class="nv-jog"></span>`
    + `<input type="range" class="nv-time" min="0" max="${scene.last * 60}" step="${STEP}" value="${second}"><button type="button" class="pop-btn nv-play" title="${esc(t('nvPlay'))}">▶</button>`
    + `<button type="button" class="an-chip nv-speed" title="${esc(t('nvSpeed'))}">×${speed}</button>`
    + `<span class="nv-at"></span></div><div class="nv-map"></div>`;
  const dial = jogDial({ size: 26, detents: true, pxPerNotch: 8, onNudge: (/** @type {1 | -1} */ dir, /** @type {boolean} */ coarse) => { stop(); setSecond(second + dir * (coarse ? 60 : STEP)); } });
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

/** Draw the map for the node picked on Statistikk (Analyse → Nettverkskart, user 2026-11-01: a sub-page, not a lock-in). */
export function openNetworkView() {
  isOpen = true;
  build();
}

/** Remove the map and its WebGL context (Statistikk is shown, or another page). */
export function closeNetworkView() {
  isOpen = false;
  stop();
  root().replaceChildren();
  try { view?.destroy(); } catch { /* already gone */ }
  view = null; scene = null;
}

export const isNetworkOpen = () => isOpen;

let wired = false;
export function initNetworkView() {
  if (isOpen) closeNetworkView();
  if (wired) return;
  wired = true;
  document.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    if (!isOpen || !el.closest?.('#network-view')) return;
    if (el.closest('.nv-play')) {
      if (timer) { stop(); return; }
      /** @type {HTMLElement} */ (el.closest('.nv-play')).textContent = '⏸';
      timer = setInterval(() => { if (second >= (scene?.last ?? 1440) * 60) stop(); else setSecond(second + STEP * speed); }, TICK);
    } else if (el.closest('.nv-speed')) {
      speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
      /** @type {HTMLElement} */ (el.closest('.nv-speed')).textContent = `×${speed}`;
    }
  });
  document.addEventListener('input', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (isOpen && el.matches?.('#network-view .nv-time')) { stop(); setSecond(Number(el.value)); }
  });
  document.addEventListener('change', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (isOpen && el.matches?.('#network-view .nv-date') && el.value) { stop(); date = el.value.replace(/-/g, ''); placeTrips(); }
  });
}
