// The timeline at a Knutepunkt (interchanges spec 2026-10-31, mockup 2): our departures on top (filled = picked; a
// click picks or unpicks), one row per feeder line with its arrivals (grey outside the window), the window shaded
// before each picked departure, and the links (approved solid, proposals dashed, the candidates of a pick violet).
// Wheel zooms around the pointer, drag pans, double-click fits — as in the visual timetable.

/** @typedef {{ trip: string, dep: number, picked: boolean, block: boolean }} OurDep */
/** @typedef {{ line: string, label: string, arrs: { trip: string, arr: number, candidate: boolean }[] }} FeederRow */
/** @typedef {{ line: string, trip: string, arr: number, to: string, kind: 'approved' | 'proposal' | 'pick' }} TimelineLink */

const LABEL = 120, TOP = 28, ROW = 26;
const hhmm = (/** @type {number} */ m) => { const v = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
const esc = (/** @type {string} */ s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** A drag in progress: it outlives the redraws it causes (each move draws a new SVG). @type {{ x: number, t0: number, t1: number, px: number, moved: boolean, onView: (v: [number, number]) => void } | null} */
let pan = null;
let lastPanMoved = false;
let panWired = false;
function wirePan() {
  if (panWired) return;
  panWired = true;
  window.addEventListener('mousemove', (e) => {
    if (!pan || !(e.buttons & 1)) return;
    const dx = e.clientX - pan.x;
    if (!pan.moved && Math.abs(dx) < 3) return;
    pan.moved = true;
    const dt = (dx / pan.px) * (pan.t1 - pan.t0);
    pan.onView([pan.t0 - dt, pan.t1 - dt]);
  });
  window.addEventListener('mouseup', () => { lastPanMoved = !!pan?.moved; pan = null; setTimeout(() => { lastPanMoved = false; }, 0); });
}

/** The span that shows every departure and arrival, with a margin. @param {OurDep[]} ours @param {FeederRow[]} feeders @returns {[number, number]} */
export function fitView(ours, feeders) {
  const all = [...ours.map((o) => o.dep), ...feeders.flatMap((f) => f.arrs.map((a) => a.arr))];
  if (!all.length) return [360, 1320];
  return [Math.min(...all) - 20, Math.max(...all) + 20];
}

/**
 * @param {HTMLElement} el
 * @param {{ ours: OurDep[], feeders: FeederRow[], window: [number, number], links: TimelineLink[], view: [number, number] | null, oursLabel: string }} data
 * @param {{ onPick: (trip: string) => void, onView: (view: [number, number]) => void }} on
 */
export function drawHubTimeline(el, data, on) {
  wirePan();
  const [t0, t1] = data.view ?? fitView(data.ours, data.feeders);
  const W = Math.max(400, el.clientWidth || 640);
  const H = TOP + 30 + data.feeders.length * ROW + 24;
  const x = (/** @type {number} */ t) => LABEL + ((t - t0) / (t1 - t0)) * (W - LABEL - 10);
  const yOurs = TOP;
  const yFeed = (/** @type {number} */ i) => TOP + 34 + i * ROW;
  const step = [15, 30, 60, 120, 180].find((s) => (t1 - t0) / s <= 12) ?? 240;
  /** @type {string[]} */
  const parts = [];
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
    parts.push(`<line class="hv-tick" x1="${x(t)}" x2="${x(t)}" y1="${TOP - 14}" y2="${H - 16}"/><text class="hv-axis" x="${x(t)}" y="${H - 4}" text-anchor="middle">${hhmm(t)}</text>`);
  }
  for (const o of data.ours) if (o.picked) parts.push(`<rect class="hv-win" x="${x(o.dep - data.window[1])}" y="${TOP - 10}" width="${Math.max(0, x(o.dep - data.window[0]) - x(o.dep - data.window[1]))}" height="${H - TOP - 16}"/>`);
  parts.push(`<text class="hv-rowlabel" x="4" y="${yOurs + 4}">${esc(data.oursLabel)}</text>`);
  data.feeders.forEach((f, i) => parts.push(`<text class="hv-rowlabel" x="4" y="${yFeed(i) + 4}">${esc(f.label)}</text>`));
  const feedRow = new Map(data.feeders.map((f, i) => [f.line, i]));
  const depOf = new Map(data.ours.map((o) => [o.trip, o.dep]));
  for (const l of data.links) {
    const i = feedRow.get(l.line), dep = depOf.get(l.to);
    if (i == null || dep == null) continue;
    parts.push(`<line class="hv-link hv-link-${l.kind}" x1="${x(l.arr)}" y1="${yFeed(i) - 5}" x2="${x(dep)}" y2="${yOurs + 6}"/>`);
  }
  data.feeders.forEach((f, i) => {
    for (const a of f.arrs) parts.push(`<rect class="hv-arr${a.candidate ? '' : ' hv-out'}" x="${x(a.arr) - 5}" y="${yFeed(i) - 5}" width="10" height="10"><title>${hhmm(a.arr)}</title></rect>`);
  });
  for (const o of data.ours) {
    parts.push(`<text class="hv-deptime" x="${x(o.dep)}" y="${yOurs - 10}" text-anchor="middle">${hhmm(o.dep)}</text>`);
    parts.push(`<circle class="hv-dep${o.picked ? ' on' : ''}${o.block ? ' hv-block' : ''}" data-trip="${esc(o.trip)}" cx="${x(o.dep)}" cy="${yOurs}" r="6"/>`);
  }
  el.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" data-t0="${t0}" data-t1="${t1}">${parts.join('')}</svg>`;
  const svg = /** @type {SVGSVGElement} */ (el.querySelector('svg'));
  /** The time under a pointer. @param {number} clientX */
  const timeAt = (clientX) => {
    const r = svg.getBoundingClientRect();
    const px = r.width ? ((clientX - r.left) / r.width) * W : LABEL;
    return t0 + ((Math.max(LABEL, px) - LABEL) / (W - LABEL - 10)) * (t1 - t0);
  };
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = e.deltaY > 0 ? 1.25 : 0.8;
    const span = Math.min(2880, Math.max(30, (t1 - t0) * f));
    const tm = timeAt(e.clientX);
    const left = tm - ((tm - t0) / (t1 - t0)) * span;
    on.onView([left, left + span]);
  }, { passive: false });
  svg.addEventListener('mousedown', (e) => { pan = { x: e.clientX, t0, t1, px: (W - LABEL - 10) / W * (svg.getBoundingClientRect().width || W), moved: false, onView: on.onView }; });
  svg.addEventListener('dblclick', () => on.onView(fitView(data.ours, data.feeders)));
  svg.addEventListener('click', (e) => {
    const dot = /** @type {HTMLElement} */ (e.target).closest?.('.hv-dep');
    if (!dot || dot.classList.contains('hv-block') || lastPanMoved) return;
    on.onPick(/** @type {string} */ (dot.getAttribute('data-trip')));
  });
}
