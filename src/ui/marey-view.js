// The visual timetable (Marey chart, design 2026-10-27): Alt+V swaps the open table for a chart of it, and back. View only.
// The arithmetic is in core/marey.js; this draws it as SVG and handles the controls, zoom and pan.
import { app } from './state.js';
import { t } from '../i18n/strings.js';
import { gridData, onGridRender } from './grid.js';
import { quayInfo } from './quays.js';
import { unionDays } from '../core/calendars.js';
import { rowOffsets, periodDays, tripLines, tribes, weekdayOf } from '../core/marey.js';

const NS = 'http://www.w3.org/2000/svg';
const L = 170, R = 20, TP = 34, B = 16;
const TRIBE = ['rgba(0, 200, 180, .16)', 'rgba(250, 160, 0, .16)', 'rgba(120, 90, 230, .14)', 'rgba(230, 60, 120, .13)', 'rgba(60, 150, 240, .15)', 'rgba(120, 190, 40, .16)'];

const state = {
  on: false, spacing: /** @type {'dist' | 'even'} */ ('dist'), range: /** @type {'day' | 'week' | 'month'} */ ('day'), date: '',
  hi: /** @type {Set<number>} */ (new Set()), picked: /** @type {Set<number>} */ (new Set()), tribes: true,
  view: /** @type {[number, number] | null} */ (null), key: '',
};
let geo = { t0: 0, t1: 1440, W: 900 };
let moved = false;
let wired = false;

/** Whether the chart is showing. */
export const mareyOn = () => state.on;

/** @param {string} tag @param {Record<string, any>} attrs @param {Element} [parent] */
function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent?.appendChild(e);
  return e;
}
/** @param {number} m */
const clock = (m) => { const d = Math.floor(m / 1440), r = m - d * 1440; return `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(Math.round(r % 60)).padStart(2, '0')}${d ? ` +${d}` : ''}`; };
const iso = (/** @type {string} */ s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const today = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };

/** The open table, its calendars' days, and its rows' places. */
function source() {
  const rs = app.routeState;
  const per = rs?.periods?.find((/** @type {any} */ p) => p.id === rs.activePer) ?? rs?.periods?.[0];
  const grid = gridData();
  const calendarDays = per ? unionDays(app.calendars.filter((c) => per.calendarIds.includes(c.id))) : [];
  const y = rowOffsets(grid.stops, (id) => /** @type {any} */ (quayInfo.get(id)) ?? null, state.spacing);
  return { rs, per, grid, calendarDays, y };
}

function controls() {
  const box = /** @type {HTMLElement} */ (document.getElementById('marey'));
  const seg = (/** @type {string} */ k, /** @type {[string, string][]} */ opts) => `<span class="mr-seg" data-k="${k}">${opts.map(([v, label]) =>
    `<button type="button" data-v="${v}" class="${/** @type {any} */ (state)[k] === v ? 'on' : ''}">${t(label)}</button>`).join('')}</span>`;
  box.innerHTML = `<div class="mr-bar">
      ${seg('spacing', [['dist', 'mrDist'], ['even', 'mrEven']])}
      ${seg('range', [['day', 'mrDay'], ['week', 'mrWeek'], ['month', 'mrMonth']])}
      <span class="mr-date"><button type="button" class="mr-prev">◀</button><input type="date" class="mr-day"><button type="button" class="mr-next">▶</button></span>
      <span class="mr-wds">${(/** @type {string[]} */ (/** @type {unknown} */ (t('mrWeekdays')))).map((w, i) => `<button type="button" class="mr-wd${state.hi.has(i) ? ' on' : ''}" data-i="${i}">${w}</button>`).join('')}</span>
      <label class="mr-check"><input type="checkbox" class="mr-tribes"${state.tribes ? ' checked' : ''}> ${t('mrPatterns')}</label>
      <button type="button" class="mr-all">${t('mrWholeDay')}</button>
      <span class="mr-info"></span>
    </div>
    <div class="mr-wrap"><svg class="mr-svg"></svg></div>
    <div class="mr-help">${t('mrHelp')}</div>
    <div class="mr-tip" hidden></div>`;
  for (const s of box.querySelectorAll('.mr-seg')) for (const b of s.querySelectorAll('button')) {
    b.addEventListener('click', () => { /** @type {any} */ (state)[/** @type {HTMLElement} */ (s).dataset.k ?? ''] = b.dataset.v; controls(); });
  }
  const day = /** @type {HTMLInputElement} */ (box.querySelector('.mr-day'));
  day.value = iso(state.date);
  day.addEventListener('change', () => { if (day.value) { state.date = day.value.replace(/-/g, ''); draw(); } });
  const step = (/** @type {number} */ dir) => {
    const d = new Date(Date.UTC(+state.date.slice(0, 4), +state.date.slice(4, 6) - 1, +state.date.slice(6, 8)));
    if (state.range === 'month') d.setUTCMonth(d.getUTCMonth() + dir); else d.setUTCDate(d.getUTCDate() + dir * (state.range === 'week' ? 7 : 1));
    state.date = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    day.value = iso(state.date);
    draw();
  };
  box.querySelector('.mr-prev')?.addEventListener('click', () => step(-1));
  box.querySelector('.mr-next')?.addEventListener('click', () => step(1));
  for (const b of box.querySelectorAll('.mr-wd')) b.addEventListener('click', () => {
    const i = Number(/** @type {HTMLElement} */ (b).dataset.i);
    if (state.hi.has(i)) state.hi.delete(i); else state.hi.add(i);
    b.classList.toggle('on');
    draw();
  });
  box.querySelector('.mr-tribes')?.addEventListener('change', (e) => { state.tribes = /** @type {HTMLInputElement} */ (e.target).checked; draw(); });
  box.querySelector('.mr-all')?.addEventListener('click', () => { state.view = null; draw(); });
  const wrap = /** @type {HTMLElement} */ (box.querySelector('.mr-wrap'));
  // Zoom the time axis around the mouse; drag to pan
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const x = e.clientX - wrap.getBoundingClientRect().left - L;
    const { t0, t1, W } = geo, at = t0 + (Math.max(0, Math.min(W, x)) / W) * (t1 - t0);
    const span = Math.max(10, Math.min(2880, (t1 - t0) * (e.deltaY > 0 ? 1.2 : 1 / 1.2))), f = (at - t0) / (t1 - t0);
    state.view = [at - f * span, at - f * span + span];
    draw();
  }, { passive: false });
  wrap.addEventListener('mousedown', (e) => { drag = { x: e.clientX, t0: geo.t0, t1: geo.t1 }; moved = false; });
  draw();
}

/** @type {{ x: number, t0: number, t1: number } | null} */
let drag = null;

function draw() {
  const box = document.getElementById('marey');
  const svg = box?.querySelector('.mr-svg');
  if (!state.on || !box || !svg) return;
  const { grid, calendarDays, y } = source();
  const days = periodDays(state.date, state.range);
  const lines = tripLines(grid, calendarDays, days, y);
  const hiOn = state.hi.size > 0 || state.picked.size > 0;
  const lit = (/** @type {import('../core/marey.js').TripLine} */ l) => state.picked.has(l.n) || (state.hi.size > 0 && l.days.some((d) => state.hi.has(weekdayOf(d))));
  const n = grid.stops.length, total = y[n - 1] || 1;
  const times = lines.flatMap((l) => l.stops.map((s) => s.m));
  const f0 = times.length ? Math.floor((Math.min(...times) - 15) / 60) * 60 : 360, f1 = times.length ? Math.ceil((Math.max(...times) + 15) / 60) * 60 : 1320;
  const [t0, t1] = state.view ?? [f0, f1];
  const wrap = /** @type {HTMLElement} */ (box.querySelector('.mr-wrap'));
  const W = Math.max(600, (wrap.clientWidth || 1000) - L - R), H = Math.max(260, Math.min(760, 70 * n));
  geo = { t0, t1, W };
  svg.innerHTML = '';
  svg.setAttribute('width', String(W + L + R));
  svg.setAttribute('height', String(H + TP + B));
  const X = (/** @type {number} */ m) => L + ((m - t0) / (t1 - t0)) * W;
  const Y = (/** @type {number} */ r) => TP + (y[r] / total) * H;
  const clip = el('clipPath', { id: 'mr-plot' }, el('defs', {}, svg));
  el('rect', { x: L, y: 0, width: W, height: H + TP + B }, clip);
  grid.stops.forEach((row, r) => {
    el('line', { x1: L, x2: L + W, y1: Y(r), y2: Y(r), class: 'mr-grid' }, svg);
    if (row.isDwellArr && grid.stops[r + 1]?.stopId === row.stopId) return; // a waiting stop is named once
    el('text', { x: L - 10, y: Y(r) + 4, 'text-anchor': 'end', class: 'mr-row-name' }, svg).textContent = row.name;
  });
  const stepM = [60, 30, 15, 5, 1].reduce((s, c) => (W / ((t1 - t0) / c) > 44 ? c : s), 60);
  const axis = el('g', { 'clip-path': 'url(#mr-plot)' }, svg);
  for (let m = Math.ceil(t0 / stepM) * stepM; m <= t1; m += stepM) {
    const hour = m % 60 === 0;
    el('line', { x1: X(m), x2: X(m), y1: TP - 6, y2: TP + H, class: hour ? 'mr-hour' : 'mr-tick' }, axis);
    el('text', { x: X(m), y: TP - 12, 'text-anchor': 'middle', class: hour ? 'mr-hour-t' : 'mr-tick-t' }, axis).textContent = clock(m);
  }
  const plot = el('g', { 'clip-path': 'url(#mr-plot)' }, svg);
  // Pattern bands behind the trips: one colour per pattern
  if (state.tribes) {
    const byN = new Map(lines.map((l) => [l.n, l]));
    for (const band of tribes(lines)) {
      const pts = (/** @type {number} */ k) => /** @type {import('../core/marey.js').TripLine} */ (byN.get(k)).stops.map((s) => `${X(s.m)},${Y(s.r)}`);
      el('polygon', { points: [...pts(band.members[0]), ...pts(band.members[band.members.length - 1]).reverse()].join(' '), fill: TRIBE[band.colour % TRIBE.length], class: 'mr-tribe' }, plot);
    }
  }
  const tip = /** @type {HTMLElement} */ (box.querySelector('.mr-tip'));
  for (const l of [...lines].sort((a, b) => Number(lit(a)) - Number(lit(b)))) {
    const on = lit(l);
    const g = el('g', { class: `mr-trip${on ? ' mr-lit' : ''}${hiOn && !on ? ' mr-faded' : ''}` }, plot);
    for (const s of l.segs) el('line', { x1: X(s.a.m), y1: Y(s.a.r), x2: X(s.b.m), y2: Y(s.b.r), class: s.skip ? 'mr-seg-line mr-skip' : 'mr-seg-line' }, g);
    for (const s of l.stops) el('circle', { cx: X(s.m), cy: Y(s.r), r: on ? 3.6 : 3, class: 'mr-dot' }, g);
    const hit = el('polyline', { points: l.stops.map((s) => `${X(s.m)},${Y(s.r)}`).join(' '), class: 'mr-hit' }, g);
    hit.addEventListener('mousemove', (e) => {
      const me = /** @type {MouseEvent} */ (e);
      tip.hidden = false;
      tip.style.left = `${me.clientX + 12}px`;
      tip.style.top = `${me.clientY + 12}px`;
      tip.textContent = `${l.gen ? `${t('mrInterval')} · ` : ''}${l.dayCode} · ${l.cells.map((c) => (typeof c === 'number' ? clock(c) : c === '|' ? '|' : '')).filter(Boolean).join(' → ')} · ${t('mrDaysOf', l.days.length, days.length)}`;
    });
    hit.addEventListener('mouseleave', () => { tip.hidden = true; });
    hit.addEventListener('click', () => { if (moved) return; if (state.picked.has(l.n)) state.picked.delete(l.n); else state.picked.add(l.n); draw(); });
    hit.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const ms = l.stops.map((s) => s.m), pad = Math.max(5, (Math.max(...ms) - Math.min(...ms)) * 0.15);
      state.view = [Math.min(...ms) - pad, Math.max(...ms) + pad];
      draw();
    });
  }
  // Interchanges: a dotted line to the waiting trip; a guaranteed one's bar as long as it waits
  const byN = new Map(lines.map((l) => [l.n, l]));
  for (const l of lines) for (const ix of l.ix) {
    const a = l.cells[ix.r], to = byN.get(ix.toN), b = to?.cells[ix.toR];
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    const kind = ix.type === 'guaranteed' ? 'mr-ix-g' : 'mr-ix-s';
    el('line', { x1: X(a), y1: Y(ix.r), x2: X(b), y2: Y(ix.toR), class: `mr-ix ${kind}` }, plot);
    if (ix.type === 'guaranteed' && ix.maxWait != null) el('line', { x1: X(b), y1: Y(ix.toR), x2: X(b + ix.maxWait), y2: Y(ix.toR), class: `mr-wait ${kind}` }, plot);
    el('circle', { cx: X(b), cy: Y(ix.toR), r: 5, class: `mr-ix-ring ${kind}` }, plot);
  }
  const info = box.querySelector('.mr-info');
  if (info) info.textContent = `${state.range === 'day' ? iso(state.date) : `${iso(days[0])} – ${iso(days[days.length - 1])}`} · ${t('mrTrips', lines.length)}`;
}

/** Show or hide the chart (Alt+V on the timetable page). */
export function toggleMarey() {
  state.on = !state.on;
  document.body.classList.toggle('marey-on', state.on);
  if (!state.on) return;
  const { calendarDays, rs } = source();
  const key = `${rs?.routeName ?? ''}|${rs?.activeSet}|${rs?.activePer}`;
  if (key !== state.key || !state.date) {
    // a new table: start on today, else the first day it runs
    const now = today();
    state.date = [...calendarDays].sort().find((d) => d >= now) ?? calendarDays[0] ?? now;
    state.view = null;
    state.picked.clear();
    state.key = key;
  }
  controls();
}

/** Wire the chart once: redraw with the table, move with the mouse. */
export function initMarey() {
  if (wired) return;
  wired = true;
  onGridRender(() => { if (state.on) draw(); });
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 3) moved = true;
    if (!moved) return;
    const dt = (dx / geo.W) * (drag.t1 - drag.t0);
    state.view = [drag.t0 - dt, drag.t1 - dt];
    draw();
  });
  window.addEventListener('mouseup', () => { drag = null; setTimeout(() => { moved = false; }); });
  window.addEventListener('resize', () => { if (state.on) draw(); });
}
