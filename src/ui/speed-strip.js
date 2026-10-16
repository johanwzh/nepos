// The speed profile under the timetable (user test 2026-10-16): the selected trip's stops as dots
// across the full width, placed by their share of the running time; each leg an arc whose height
// is the straight-line speed, coloured against the mode's limit (dashed line), capped so an
// extreme value never fills the screen. Layovers are flat. The selected row's stop is ringed as on
// the map; a click on a dot or a leg selects that row. Fixed height: the table never jumps.
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
  const p = col ? speedProfile(grid, col, quayInfo, lineMode()) : null;
  if (!p || p.points.length < 2) { box.innerHTML = `<div class="sp-none">${esc(t(p ? 'spdNoPositions' : 'spdNone'))}</div>`; return; }

  const W = Math.max(200, box.clientWidth || 1000);
  const x = (/** @type {number} */ f) => PAD + f * (W - 2 * PAD);
  const room = BASE - TOP;
  const height = (/** @type {number} */ kmh) => (Math.min(kmh / p.limit, CAP) / CAP) * room;
  const limitY = BASE - height(p.limit);
  const xOf = new Map(p.points.map((pt) => [pt.ri, x(pt.x)]));
  const parts = [`<line class="sp-limit" x1="${PAD}" x2="${W - PAD}" y1="${limitY}" y2="${limitY}"><title>${esc(t('spdLimit', p.limit))}</title></line>`,
    `<line class="sp-base" x1="${PAD}" x2="${W - PAD}" y1="${BASE}" y2="${BASE}"></line>`];
  for (const leg of p.legs) {
    const x1 = /** @type {number} */ (xOf.get(leg.from)), x2 = /** @type {number} */ (xOf.get(leg.to));
    // Short: the speed and the distance (the line itself shows the rest)
    const title = leg.kind === 'layover' ? t('spdLayover', leg.minutes)
      : leg.kmh == null ? t(leg.kind === 'zero' ? 'spdZero' : 'spdNegative')
      : t('spdLeg', fmt(leg.kmh, 0), fmt(leg.km));
    const capped = leg.kmh != null && leg.kmh > p.limit * CAP;
    if (leg.kmh == null) {
      // Flat: a layover (grey), or a time that cannot be right (red)
      parts.push(`<g class="sp-leg ${leg.kind}" data-to="${leg.to}"><title>${esc(title)}</title><line x1="${x1}" x2="${x2}" y1="${BASE}" y2="${BASE}"></line>
        <line class="sp-hit" x1="${x1}" x2="${x2}" y1="${BASE}" y2="${BASE}"></line></g>`);
      continue;
    }
    const h = height(leg.kmh);
    const d = `M ${x1} ${BASE} Q ${(x1 + x2) / 2} ${BASE - 2 * h} ${x2} ${BASE}`;
    parts.push(`<g class="sp-leg ${leg.kind}" data-to="${leg.to}"${capped ? ' data-capped="1"' : ''}><title>${esc(title)}</title>
      <path d="${d}"></path><path class="sp-hit" d="${d}"></path></g>`);
  }
  const sel = selectedRowIndex();
  for (const pt of p.points) {
    parts.push(`<circle class="sp-dot${pt.bold ? ' bold' : ''}" data-ri="${pt.ri}" cx="${x(pt.x)}" cy="${BASE}" r="${pt.bold ? 5.5 : 3.5}"><title>${esc(pt.name)}</title></circle>`);
  }
  // The selected row: its own stop, or a dwell arrival's departure
  const here = p.points.find((pt) => pt.ri === sel || (sel != null && grid.stops[sel]?.isDwellArr && pt.ri === sel + 1));
  if (here) parts.push(`<circle class="sp-here" data-ri="${here.ri}" cx="${x(here.x)}" cy="${BASE}" r="9"></circle>`);
  box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
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
  if (!wired && box && typeof ResizeObserver !== 'undefined') {
    wired = true;
    let last = 0;
    new ResizeObserver(() => { const w = box.clientWidth; if (w !== last) { last = w; render(); } }).observe(box);
  }
  render();
}
