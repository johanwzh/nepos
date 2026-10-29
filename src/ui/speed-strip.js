// The speed profile under the timetable (user test 2026-10-16): the selected trip's stops as dots
// across the full width, placed by their share of the running time; each leg an arc whose height
// is the straight-line speed, coloured against the mode's limit, capped so an extreme value never fills the
// screen. Layovers are flat. The selected row's stop is ringed as on the map; a click on a dot or a leg selects that
// row. Fixed height: the table never jumps. 2.5 (user 2026-10-29): a line at the trip's own average instead of the
// limit (the colour warns); a faint band round each arc for the speeds the minutes allow (seconds are never typed);
// hovering a leg shows just its km/h, with the details in the status bar — no tooltips.
import { app } from './state.js';
import { onRefresh, currentPage } from './shell.js';
import { t } from '../i18n/strings.js';
import { grid, selectedColumn, selectedRowIndex, selectRow, onGridRender } from './grid.js';
import { quayInfo, onQuaysLoaded } from './quays.js';
import { speedProfile } from '../core/speed-profile.js';
import { ERN_MODES } from '../core/ern/modes.js';

const H = 64;          // the strip's height
const BASE = H - 12;   // the line the dots sit on
const TOP = 10;        // room above the highest arc for its mark
const CAP = 1.5;       // arcs stop growing at 1.5 × the limit
const PAD = 14;        // left and right

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (/** @type {number} */ n, d = 1) => n.toLocaleString(app.settings.lang === 'en' ? 'en' : 'nb', { maximumFractionDigits: d });

function lineMode() {
  const rs = app.routeState;
  return rs?.mode || /** @type {any} */ (ERN_MODES)[rs?.transportMode ?? 0]?.mode || '';
}

function render() {
  const box = document.getElementById('speed-strip');
  if (!box) return;
  box.hidden = currentPage() !== 'edit' || !grid.active;
  if (box.hidden) return;
  const col = grid.cols[selectedColumn()];
  const p = col ? speedProfile(grid, col, quayInfo, lineMode(), app.meta?.speedLimits) : null;
  if (!p || p.points.length < 2) { box.innerHTML = `<div class="sp-none">${esc(t(p ? 'spdNoPositions' : 'spdNone'))}</div>`; return; }

  const W = Math.max(200, box.clientWidth || 1000);
  const x = (/** @type {number} */ f) => PAD + f * (W - 2 * PAD);
  const room = BASE - TOP;
  const height = (/** @type {number} */ kmh) => (Math.min(kmh / p.limit, CAP) / CAP) * room;
  const xOf = new Map(p.points.map((pt) => [pt.ri, x(pt.x)]));
  const parts = [`<line class="sp-base" x1="${PAD}" x2="${W - PAD}" y1="${BASE}" y2="${BASE}"></line>`];
  shownLegs = p.legs;
  p.legs.forEach((leg, li) => {
    const x1 = /** @type {number} */ (xOf.get(leg.from)), x2 = /** @type {number} */ (xOf.get(leg.to)), mx = (x1 + x2) / 2;
    // The speeds the typed minutes allow: a lens between the slowest and the fastest arc, under the arc
    if (leg.kmhMin != null && leg.kmhMax != null) {
      const lo = height(leg.kmhMin), hi = height(leg.kmhMax);
      parts.push(`<path class="sp-band ${leg.kind}" d="M ${x1} ${BASE} Q ${mx} ${BASE - 2 * hi} ${x2} ${BASE} Q ${mx} ${BASE - 2 * lo} ${x1} ${BASE} Z"></path>`);
    }
    const capped = leg.kmh != null && leg.kmh > p.limit * CAP;
    if (leg.kmh == null) {
      // Flat: a layover (grey), or a time that cannot be right (red)
      parts.push(`<g class="sp-leg ${leg.kind}" data-to="${leg.to}" data-leg="${li}"><line x1="${x1}" x2="${x2}" y1="${BASE}" y2="${BASE}"></line>
        <line class="sp-hit" x1="${x1}" x2="${x2}" y1="${BASE}" y2="${BASE}"></line></g>`);
      return;
    }
    const h = height(leg.kmh);
    const d = `M ${x1} ${BASE} Q ${mx} ${BASE - 2 * h} ${x2} ${BASE}`;
    parts.push(`<g class="sp-leg ${leg.kind}" data-to="${leg.to}" data-leg="${li}"${capped ? ' data-capped="1"' : ''}>
      <path d="${d}"></path><path class="sp-hit" d="${d}"></path></g>`);
  });
  // The trip's own average: arcs above it run faster than the trip does, arcs below slower
  if (p.avg != null) {
    const y = BASE - height(p.avg);
    parts.push(`<line class="sp-avg" x1="${PAD}" x2="${W - PAD}" y1="${y}" y2="${y}"></line>
      <text class="sp-avg-t" x="${W - PAD}" y="${Math.max(9, y - 2)}" text-anchor="end">${esc(t('spdAvg', fmt(p.avg, 0)))}</text>`);
  }
  peak = (li) => {
    const leg = p.legs[li];
    const kmh = leg?.kmh ?? (leg?.kmhMin != null && leg.kmhMax != null ? (leg.kmhMin + leg.kmhMax) / 2 : null);
    return kmh == null ? null : { x: ((xOf.get(leg.from) ?? 0) + (xOf.get(leg.to) ?? 0)) / 2, y: BASE - height(kmh), kmh };
  };
  const sel = selectedRowIndex();
  for (const pt of p.points) {
    parts.push(`<circle class="sp-dot${pt.bold ? ' bold' : ''}" data-ri="${pt.ri}" cx="${x(pt.x)}" cy="${BASE}" r="${pt.bold ? 5.5 : 3.5}"><title>${esc(pt.name)}</title></circle>`);
  }
  // The selected row: its own stop, or a dwell arrival's departure
  const here = p.points.find((pt) => pt.ri === sel || (sel != null && grid.stops[sel]?.isDwellArr && pt.ri === sel + 1));
  if (here) parts.push(`<circle class="sp-here" data-ri="${here.ri}" cx="${x(here.x)}" cy="${BASE}" r="9"></circle>`);
  box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
}

/** @type {import('../core/speed-profile.js').ProfileLeg[]} the legs drawn now */
let shownLegs = [];
/** Where a leg's number goes (its arc's top) and the number. @type {(li: number) => { x: number, y: number, kmh: number } | null} */
let peak = () => null;

/** Hover: just the km/h over the arc; the details in the status bar. @param {number} li */
function showLeg(li) {
  const svg = document.querySelector('#speed-strip svg');
  const leg = shownLegs[li];
  if (!svg || !leg) return;
  svg.querySelector('.sp-num')?.remove();
  const at = peak(li);
  if (at) {
    const num = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    num.setAttribute('class', 'sp-num');
    num.setAttribute('x', String(at.x));
    num.setAttribute('y', String(Math.max(10, at.y - 3)));
    num.setAttribute('text-anchor', 'middle');
    num.textContent = String(Math.round(at.kmh));
    svg.appendChild(num);
  }
  const hint = document.getElementById('sb-hint');
  if (hint) hint.textContent = leg.kind === 'layover' ? `${leg.fromName} → ${leg.toName} · ${t('spdLayover', leg.minutes)}`
    : leg.kmhMin == null || leg.kmhMax == null ? `${leg.fromName} → ${leg.toName} · ${t('spdNegative')}`
    : t('spdHint', leg.fromName, leg.toName, fmt(leg.km), leg.minutes, fmt(leg.kmhMin, 0), fmt(leg.kmhMax, 0));
}

function clearLeg() {
  document.querySelector('#speed-strip .sp-num')?.remove();
  const hint = document.getElementById('sb-hint');
  if (hint) hint.textContent = '';
}

let wired = false;
export function initSpeedStrip() {
  onGridRender(render);
  onQuaysLoaded(render);
  onRefresh(render);
  const box = document.getElementById('speed-strip');
  box?.addEventListener('click', (e) => {
    const el = /** @type {Element} */ (e.target);
    const dot = el.closest('.sp-dot');
    const leg = el.closest('.sp-leg');
    const ri = dot ? Number(/** @type {any} */ (dot).dataset.ri) : leg ? Number(leg.getAttribute('data-to')) : NaN;
    if (!Number.isNaN(ri)) selectRow(ri);
  });
  box?.addEventListener('mouseover', (e) => {
    const leg = /** @type {Element} */ (e.target).closest('.sp-leg');
    if (leg) showLeg(Number(leg.getAttribute('data-leg')));
  });
  box?.addEventListener('mouseleave', clearLeg);
  if (!wired && box && typeof ResizeObserver !== 'undefined') {
    wired = true;
    let last = 0;
    new ResizeObserver(() => { const w = box.clientWidth; if (w !== last) { last = w; render(); } }).observe(box);
  }
  render();
}
