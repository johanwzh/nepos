// A small validity bar for the list pages (Linjer, Kalendere): the same 365-day window and colours
// as the timeline in the timetable (a tenth in the past, a NOW line), small enough for a table cell.
import { timelineModel, TIMELINE_DAYS } from '../core/timeline.js';

/**
 * @param {string[]} days valid days, YYYYMMDD
 * @param {string} today YYYYMMDD
 * @returns {string} HTML
 */
export function validityBar(days, today) {
  const m = timelineModel({ periodDays: days, colDays: null, today });
  const rects = m.days.map((d, i) => (d.state === 'valid' ? `<rect class="tl-day valid" x="${i}" y="0" width="1" height="10"/>` : '')).join('');
  const now = `${(m.nowIndex / TIMELINE_DAYS) * 100}%`;
  return `<span class="vb">${m.before ? '<span class="vb-before">‹</span>' : ''}<svg class="vb-svg" viewBox="0 0 ${TIMELINE_DAYS} 10" preserveAspectRatio="none" aria-hidden="true">${rects}</svg><span class="vb-now" style="left:${now}"></span>${m.after ? '<span class="vb-after">›</span>' : ''}</span>`;
}

/** Today as YYYYMMDD. */
export function todayYmd() {
  const n = new Date();
  return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}${String(n.getDate()).padStart(2, '0')}`;
}
