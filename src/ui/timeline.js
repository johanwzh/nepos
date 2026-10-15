// The validity timeline under the calendar chips: the table set's valid days over 365 days (a tenth
// in the past), and — with the cursor in a trip column — what that column keeps and what its day
// code takes away. Colours are the shared calendar colours (--cal-valid, --cal-removed).
import { app } from './state.js';
import { t } from '../i18n/strings.js';
import { grid, selectedColumn, selectedStopRow } from './grid.js';
import { unionDays, columnDays } from '../core/calendars.js';
import { timelineModel, TIMELINE_DAYS } from '../core/timeline.js';

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (/** @type {number} */ i) => `${(i / TIMELINE_DAYS) * 100}%`;
/** @param {string} d YYYYMMDD */
const show = (d) => `${d.slice(6, 8)}.${d.slice(4, 6)}.${d.slice(0, 4)}`;

function todayYmd() {
  const n = new Date();
  return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}${String(n.getDate()).padStart(2, '0')}`;
}

export function renderTimeline() {
  const el = document.getElementById('cal-timeline');
  if (!el) return;
  const rs = app.routeState;
  if (!rs) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  const per = rs.periods.find((/** @type {any} */ p) => p.id === rs.activePer);
  const cals = (per?.calendarIds ?? []).map((/** @type {string} */ id) => app.calendars.find((c) => c.id === id)).filter(Boolean);
  const periodDays = unionDays(/** @type {any[]} */ (cals));
  const ci = selectedColumn();
  const col = grid.active && selectedStopRow() == null ? grid.cols[ci] : null;
  const colDays = col ? columnDays(periodDays, col.dayCode ?? '') : null;
  const m = timelineModel({ periodDays, colDays, today: todayYmd() });

  const label = { valid: t('tlValid'), column: t('tlColumn'), removed: t('tlRemoved') };
  const rects = m.days.map((d, i) => (d.state === 'none' ? '' : `<rect class="tl-day ${d.state}" x="${i}" y="0" width="1" height="10"><title>${show(d.date)} · ${esc(label[d.state])}</title></rect>`)).join('');
  const months = m.months.map((mo) => `<span class="tl-month" style="left:${pct(mo.index)}">${esc(mo.label.slice(5) === '01' ? mo.label.slice(0, 4) : mo.label.slice(5))}</span>`).join('');
  el.innerHTML = `
    <div class="tl-track">
      ${m.before ? `<span class="tl-before" title="${esc(t('tlBefore'))}">◀</span>` : ''}
      <svg class="tl-svg" viewBox="0 0 ${TIMELINE_DAYS} 10" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>
      <span class="tl-now" style="left:${pct(m.nowIndex)}" title="${esc(t('tlNow'))}"></span>
      ${m.after ? `<span class="tl-after" title="${esc(t('tlAfter'))}">▶</span>` : ''}
    </div>
    <div class="tl-months">${months}<span class="tl-now-label" style="left:${pct(m.nowIndex)}">${esc(t('tlNow'))}</span></div>
    ${col ? `<div class="tl-legend"><span class="tl-key column"></span>${esc(t('tlColumn'))} <span class="tl-key removed"></span>${esc(t('tlRemoved'))}</div>` : ''}`;
}
