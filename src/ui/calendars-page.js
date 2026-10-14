// Ressurser → Kalendere (timetable structure spec §3): a list of the project's calendars and an
// editor for the selected one — its name, a whole-year view where days are switched on and off,
// "duplicate as next season" and "replace in all periods". A calendar is saved once it has a
// name, a saved name cannot be blanked, and the file is never written when it could not be read.
import { app } from './state.js';
import { $, onRefresh, currentPage, runAction } from './shell.js';
import { t } from '../i18n/strings.js';
import { writeCalendars, newCalendar } from '../project/calendars-store.js';
import { calendarDays, setDays, shiftRanges } from '../core/calendars.js';
import { renderYearView } from './year-view.js';
import { openCalendarReplace } from './calendar-replace-ui.js';

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

/** @param {string | null} id */
function select(id) {
  app.calendarSelected = id;
  app.calendarYear = 0;
  renderCalendarsPage();
}

/** @param {import('../core/calendars.js').Calendar} cal */
function yearOf(cal) {
  return app.calendarYear || Number((calendarDays(cal)[0] ?? String(new Date().getFullYear())).slice(0, 4));
}

export function renderCalendarsPage() {
  if (currentPage() !== 'assets' || app.assetsSection !== 'calendars') return;
  const body = $('assets-body');
  body.innerHTML = '';
  body.appendChild(el('div', 'assets-title', t('calTitle')));
  if (!app.meta) { body.appendChild(el('p', 'assets-coming', t('noProjectOpen'))); return; }
  if (app.calendarsError) { body.appendChild(el('p', 'assets-status bad', t('calsUnreadable'))); return; }

  const page = el('div', 'cal-page');
  const list = el('div', 'cal-list');
  if (!app.calendars.length) list.appendChild(el('p', 'assets-hint', t('calNone')));
  for (const cal of app.calendars) {
    const item = el('div', `cal-item${cal.id === app.calendarSelected ? ' active' : ''}`);
    item.dataset.cal = cal.id;
    item.append(el('div', '', cal.name || t('tableSetUnnamed')), el('small', 'cal-days', t('calDays', calendarDays(cal).length)));
    item.addEventListener('click', () => select(cal.id));
    list.appendChild(item);
  }
  const add = el('button', 'cal-add', t('calAdd'));
  add.addEventListener('click', () => {
    const cal = newCalendar('');
    app.calendars = [...app.calendars, cal];
    select(cal.id);
    /** @type {HTMLInputElement | null} */ (body.querySelector('.cal-name'))?.focus();
  });
  list.appendChild(add);
  page.appendChild(list);

  const editor = el('div', 'cal-editor');
  const cal = app.calendars.find((c) => c.id === app.calendarSelected);
  if (!cal) editor.appendChild(el('p', 'assets-hint', app.calendars.length ? t('calSelect') : ''));
  else {
    const head = el('div', 'cal-toolbar');
    const name = /** @type {HTMLInputElement} */ (el('input', 'cal-name'));
    name.value = cal.name;
    name.placeholder = t('calNamePh');
    name.classList.toggle('invalid', !cal.name.trim());
    name.addEventListener('keydown', (e) => e.stopPropagation());
    // The name typed so far counts at once: clicking a day re-renders the page before this field
    // would report a change.
    name.addEventListener('input', () => { const v = name.value.trim(); if (v) cal.name = v; });
    name.addEventListener('change', () => {
      // A saved name is kept until a new one is typed: blanking it would drop the calendar from
      // the file while periods still use it.
      const next = name.value.trim();
      if (!next && cal.name) { name.value = cal.name; return; }
      cal.name = next;
      save();
      renderCalendarsPage();
    });
    head.append(name, el('span', 'cal-days', t('calDays', calendarDays(cal).length)));
    const del = el('button', 'cal-del', '×');
    del.title = t('deleteCalendar');
    del.addEventListener('click', () => {
      if (!confirm(t('calDeleteConfirm', cal.name, usedBy(cal.id)))) return;
      app.calendars = app.calendars.filter((c) => c !== cal);
      save();
      select(null);
    });
    head.appendChild(del);
    editor.appendChild(head);

    const year = yearOf(cal);
    const nav = el('div', 'cal-toolbar');
    const prev = el('button', 'cal-year-prev', '‹');
    prev.title = t('calPrevYear');
    prev.addEventListener('click', () => { app.calendarYear = year - 1; renderCalendarsPage(); });
    const next = el('button', 'cal-year-next', '›');
    next.title = t('calNextYear');
    next.addEventListener('click', () => { app.calendarYear = year + 1; renderCalendarsPage(); });
    const dup = el('button', 'cal-dup', t('calDuplicate'));
    dup.addEventListener('click', () => {
      const copy = { ...newCalendar(t('calCopyName', cal.name)), ranges: shiftRanges(cal.ranges, 364) };
      app.calendars = [...app.calendars, copy];
      save();
      select(copy.id);
    });
    const replace = el('button', 'cal-replace', t('calReplace'));
    replace.addEventListener('click', () => openCalendarReplace(cal.id));
    nav.append(prev, el('strong', 'cal-year', String(year)), next, dup, replace);
    editor.appendChild(nav);

    const view = el('div', 'cal-year-view');
    renderYearView(view, {
      year, active: new Set(calendarDays(cal)), lang: app.settings.lang === 'en' ? 'en' : 'no',
      onChange: (days, on) => { cal.ranges = setDays(cal, days, on).ranges; save(); renderCalendarsPage(); },
    });
    editor.appendChild(view);
  }
  page.appendChild(editor);
  body.appendChild(page);
}

export function initCalendarsPage() {
  onRefresh(renderCalendarsPage);
}
