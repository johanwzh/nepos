// Ressurser → Kalendere (timetable structure spec §3): the project's calendars as a name and a
// list of date ranges, with the number of days. Plan 4d replaces the ranges with a whole-year view.
// Rows are built once per showing; a field change saves without rebuilding the row. A calendar is
// saved once it has a name; the file is never written when it could not be read.
import { app } from './state.js';
import { $, onRefresh, currentPage, runAction } from './shell.js';
import { t } from '../i18n/strings.js';
import { writeCalendars, newCalendar } from '../project/calendars-store.js';
import { calendarDays } from '../core/calendars.js';
import { yyyymmddToInput, inputToYyyymmdd } from '../core/footnotes.js';

function save() {
  const fs = app.fs;
  if (!fs || app.calendarsError) return;
  const named = app.calendars.filter((c) => c.name.trim());
  void runAction(() => writeCalendars(fs, named));
}

/** How many periods (in saved route files) use a calendar. @param {string} id */
const usedBy = (id) => app.routes.reduce((n, r) => n + r.text.split(/\r?\n/).filter((l) => l.trim() === `#KAL;${id}`).length, 0);

/** @param {string} tag @param {string} cls @param {string} [text] */
const el = (tag, cls, text = '') => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };

export function renderCalendarsPage() {
  if (currentPage() !== 'assets' || app.assetsSection !== 'calendars') return;
  const body = $('assets-body');
  body.innerHTML = '';
  body.appendChild(el('div', 'assets-title', t('calTitle')));
  if (!app.meta) { body.appendChild(el('p', 'assets-coming', t('noProjectOpen'))); return; }
  if (app.calendarsError) { body.appendChild(el('p', 'assets-status bad', t('calsUnreadable'))); return; }
  if (!app.calendars.length) body.appendChild(el('p', 'assets-hint', t('calNone')));

  for (const cal of app.calendars) {
    const row = el('div', 'cal-row');
    const head = el('div', 'cal-head');
    const name = /** @type {HTMLInputElement} */ (el('input', 'cal-name'));
    name.value = cal.name;
    name.placeholder = t('calNamePh');
    name.classList.toggle('invalid', !cal.name.trim());
    name.addEventListener('keydown', (e) => e.stopPropagation());
    name.addEventListener('change', () => { cal.name = name.value.trim(); name.classList.toggle('invalid', !cal.name); save(); });
    const count = el('span', 'cal-days');
    const showCount = () => { count.textContent = t('calDays', calendarDays(cal).length); };
    showCount();
    const del = el('button', 'cal-del', '×');
    del.addEventListener('click', () => {
      if (!confirm(t('calDeleteConfirm', cal.name, usedBy(cal.id)))) return;
      app.calendars = app.calendars.filter((c) => c !== cal);
      save();
      renderCalendarsPage();
    });
    head.append(name, count, del);
    row.appendChild(head);

    cal.ranges.forEach((range, i) => {
      const line = el('div', 'cal-range');
      const from = /** @type {HTMLInputElement} */ (el('input', 'cal-from'));
      const to = /** @type {HTMLInputElement} */ (el('input', 'cal-to'));
      from.type = 'date'; to.type = 'date';
      from.value = yyyymmddToInput(range[0]); to.value = yyyymmddToInput(range[1]);
      const set = () => {
        const a = inputToYyyymmdd(from.value), b = inputToYyyymmdd(to.value);
        // A single day when only one end is filled in: from and to are both inclusive.
        cal.ranges[i] = [a || b, b || a];
        showCount();
        save();
      };
      from.addEventListener('change', set);
      to.addEventListener('change', set);
      const x = el('button', 'cal-range-del', '×');
      x.addEventListener('click', () => { cal.ranges.splice(i, 1); save(); renderCalendarsPage(); });
      line.append(from, el('span', 'rh-arrow', '→'), to, x);
      row.appendChild(line);
    });
    const addRange = el('button', 'cal-range-add', t('calRangeAdd'));
    addRange.addEventListener('click', () => { cal.ranges.push(['', '']); renderCalendarsPage(); });
    row.appendChild(addRange);
    body.appendChild(row);
  }
  const add = el('button', 'cal-add', t('calAdd'));
  add.addEventListener('click', () => {
    app.calendars = [...app.calendars, newCalendar('')];
    renderCalendarsPage();
    /** @type {HTMLInputElement | null} */ (body.querySelector('.cal-row:last-of-type .cal-name'))?.focus();
  });
  body.appendChild(add);
}

export function initCalendarsPage() {
  onRefresh(renderCalendarsPage);
}
