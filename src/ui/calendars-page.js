// Kalendere (calendars page spec): a tab of its own. Without a calendar open it is a list of the
// project's calendars (span, days, which lines use them, status); with one open it is the editor —
// a switcher on the left, the name and span, a run of months, and save/discard like lines. Edits
// live in app.calendarDrafts until saved, so lines, the timeline and the export use the saved
// calendar meanwhile. The file is never written when it could not be read.
import { app } from './state.js';
import { onRefresh, currentPage, runAction } from './shell.js';
import { t } from '../i18n/strings.js';
import { writeCalendars, newCalendar } from '../project/calendars-store.js';
import { calendarDays, setDays, shiftRanges, normalizeRanges } from '../core/calendars.js';
import { renderMonthsView } from './year-view.js';
import { openCalendarReplace } from './calendar-replace-ui.js';
import { lineState, lineLabel } from './line-info.js';

/** @typedef {import('../core/calendars.js').Calendar} Calendar */

/** @param {string} tag @param {string} cls @param {string} [text] */
const el = (tag, cls, text = '') => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };
/** @param {string} d YYYYMMDD */
const show = (d) => `${d.slice(6, 8)}.${d.slice(4, 6)}.${d.slice(0, 4)}`;
function today() {
  const n = new Date();
  return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}${String(n.getDate()).padStart(2, '0')}`;
}

/** The calendar as the user sees it: the unsaved draft, else the saved one. @param {string} id */
const current = (id) => app.calendarDrafts.get(id) ?? app.calendars.find((c) => c.id === id) ?? null;
/** Saved calendars and new unsaved ones, sorted by name. */
function allCalendars() {
  const list = app.calendars.map((c) => current(c.id) ?? c);
  for (const d of app.calendarDrafts.values()) if (!app.calendars.some((c) => c.id === d.id)) list.push(d);
  return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'nb'));
}

/** @param {Calendar} cal @returns {[string, string] | null} first and last valid day */
function span(cal) {
  const r = normalizeRanges(cal.ranges);
  return r.length ? [r[0][0], r[r.length - 1][1]] : null;
}

/**
 * The line + table set pairs that use a calendar (unsaved line edits included).
 * @param {string} id
 * @returns {{ code: string, label: string }[]}
 */
function usage(id) {
  /** @type {{ code: string, label: string }[]} */
  const out = [];
  for (const r of app.routes) {
    const rs = lineState(r.code);
    if (rs) {
      for (const set of rs.tableSets) {
        const uses = rs.periods.some((/** @type {any} */ p) => p.setId === set.id && p.calendarIds.includes(id));
        if (uses) out.push({ code: r.code, label: `${lineLabel(r.code)} · ${set.name || '—'}` });
      }
      continue;
    }
    let setName = '';
    for (const line of r.text.split(/\r?\n/)) {
      const f = line.trim().split(';');
      if (f[0] === '#TRA') setName = f[1] ?? '';
      if (f[0] === '#KAL' && (f[1] ?? '').trim() === id) out.push({ code: r.code, label: `${lineLabel(r.code)} · ${setName || '—'}` });
    }
  }
  return out;
}

/** @param {{ code: string }[]} uses */
function usedText(uses) {
  const lines = new Set(uses.map((u) => u.code)).size;
  return t('calUsedBy', lines, uses.length);
}

/** @param {Calendar} cal @param {number} nUses */
function statusOf(cal, nUses) {
  const s = span(cal);
  if (!s) return t('calStatusEmpty');
  if (s[1] < today()) return t('lineExpired');
  if (!nUses) return t('calStatusUnused');
  return '';
}

/** @param {string | null} id */
function open(id) {
  app.calendarSelected = id;
  app.calendarMonth = '';
  renderCalendarsPage();
}

/** Where the run of months starts: the first valid month, or this month when empty or past. @param {Calendar} cal */
function startMonth(cal) {
  if (app.calendarMonth) return app.calendarMonth;
  const s = span(cal);
  const now = today();
  return (s && s[1] >= now ? s[0] : now).slice(0, 6);
}

/** @param {string} ym @param {number} n */
function addMonths(ym, n) {
  const idx = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(4, 6)) - 1 + n;
  return `${Math.floor(idx / 12)}${String((idx % 12) + 1).padStart(2, '0')}`;
}

/** Change the open calendar: the change is a draft until saved. @param {Calendar} cal @param {(c: Calendar) => Calendar} fn */
function edit(cal, fn) {
  app.calendarDrafts.set(cal.id, fn({ ...cal, ranges: cal.ranges.map((r) => /** @type {[string, string]} */ ([...r])) }));
  renderCalendarsPage();
}

/** Write the saved calendars, with this one's draft in place. @param {string} id */
async function saveCalendar(id) {
  const fs = app.fs;
  const draft = app.calendarDrafts.get(id);
  if (!fs || app.calendarsError || !draft || !draft.name.trim()) return;
  const next = app.calendars.some((c) => c.id === id) ? app.calendars.map((c) => (c.id === id ? draft : c)) : [...app.calendars, draft];
  const ok = await runAction(() => writeCalendars(fs, next.filter((c) => c.name.trim())));
  if (!ok) return;
  app.calendars = next;
  app.calendarDrafts.delete(id);
  renderCalendarsPage();
}

/** @param {Calendar} cal */
async function deleteCalendar(cal) {
  const uses = usage(cal.id);
  const list = uses.map((u) => `• ${u.label}`).join('\n');
  if (!confirm(t('calDeleteAsk', cal.name || '—', uses.length, list))) return;
  app.calendarDrafts.delete(cal.id);
  if (app.calendars.some((c) => c.id === cal.id)) {
    const fs = app.fs;
    if (!fs || app.calendarsError) return;
    const next = app.calendars.filter((c) => c.id !== cal.id);
    if (!(await runAction(() => writeCalendars(fs, next)))) return;
    app.calendars = next;
  }
  open(null);
}

// ─── The list ────────────────────────────────────────────────────────────────
function renderList(/** @type {HTMLElement} */ body) {
  const bar = el('div', 'lt-bar');
  const add = el('button', 'pop-btn primary cl-new', t('calAdd'));
  add.addEventListener('click', newDraft);
  bar.appendChild(add);
  body.appendChild(bar);
  const cals = allCalendars();
  if (!cals.length) { body.appendChild(el('p', 'assets-hint', t('calNone'))); return; }
  const table = el('table', 'lt-table cl-table');
  table.innerHTML = `<thead><tr><th>${t('ltCol_name')}</th><th>${t('ltCol_valid')}</th><th>${t('calColDays')}</th><th>${t('calColUsed')}</th><th>${t('ltCol_status')}</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  for (const cal of cals) {
    const uses = usage(cal.id);
    const s = span(cal);
    const tr = document.createElement('tr');
    tr.dataset.cal = cal.id;
    tr.append(
      el('td', 'cl-name', `${cal.name || t('tableSetUnnamed')}${app.calendarDrafts.has(cal.id) ? ' ●' : ''}`),
      el('td', 'lt-valid', s ? `${show(s[0])} – ${show(s[1])}` : ''),
      el('td', 'cl-days', String(calendarDays(cal).length)),
      el('td', 'cl-used', usedText(uses)),
      el('td', 'cl-status lt-status', statusOf(cal, uses.length)),
    );
    tr.addEventListener('dblclick', () => open(cal.id));
    tr.addEventListener('click', () => open(cal.id));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  body.appendChild(table);
}

function newDraft() {
  const cal = newCalendar('');
  app.calendarDrafts.set(cal.id, cal);
  open(cal.id);
  /** @type {HTMLInputElement | null} */ (document.querySelector('#calendars-body .ce-name'))?.focus();
}

// ─── The editor ──────────────────────────────────────────────────────────────
function renderEditor(/** @type {HTMLElement} */ body, /** @type {Calendar} */ cal) {
  const wrap = el('div', 'cl-editor');
  // Left: the switcher
  const side = el('div', 'ce-switch');
  const back = el('button', 'ce-back', t('calBack'));
  back.addEventListener('click', () => open(null));
  side.appendChild(back);
  for (const c of allCalendars()) {
    const item = el('div', `ce-item${c.id === cal.id ? ' active' : ''}`, `${c.name || t('tableSetUnnamed')}${app.calendarDrafts.has(c.id) ? ' ●' : ''}`);
    item.dataset.cal = c.id;
    item.addEventListener('click', () => { if (c.id !== cal.id) open(c.id); });
    side.appendChild(item);
  }
  const add = el('button', 'ce-add', t('calAdd'));
  add.addEventListener('click', newDraft);
  side.appendChild(add);

  // Right: name, span, tools, months, footer
  const main = el('div', 'ce-main');
  const head = el('div', 'ce-head');
  const name = /** @type {HTMLInputElement} */ (el('input', 'ce-name'));
  name.value = cal.name;
  name.placeholder = t('calNamePh');
  name.classList.toggle('invalid', !cal.name.trim());
  name.addEventListener('keydown', (e) => e.stopPropagation());
  name.addEventListener('input', () => {
    const draft = app.calendarDrafts.get(cal.id) ?? { ...cal };
    draft.name = name.value.trim();
    app.calendarDrafts.set(cal.id, draft);
    name.classList.toggle('invalid', !draft.name);
    /** @type {HTMLButtonElement} */ (main.querySelector('.ce-save')).disabled = !draft.name;
    main.querySelector('.ce-state')?.replaceChildren(document.createTextNode(`● ${t('unsavedChanges')}`));
  });
  const s = span(cal);
  head.append(name, el('div', 'ce-span', s ? `${show(s[0])} – ${show(s[1])}` : t('calNoDates')));
  main.appendChild(head);

  const start = startMonth(cal);
  const tools = el('div', 'cal-toolbar');
  const prev = el('button', 'ce-prev', '‹');
  prev.title = t('calPrevMonth');
  prev.addEventListener('click', () => { app.calendarMonth = addMonths(start, -1); renderCalendarsPage(); });
  const next = el('button', 'ce-next', '›');
  next.title = t('calNextMonth');
  next.addEventListener('click', () => { app.calendarMonth = addMonths(start, 1); renderCalendarsPage(); });
  const dup = el('button', 'ce-dup', t('calDuplicate'));
  dup.addEventListener('click', () => {
    const copy = { ...newCalendar(t('calCopyName', cal.name)), ranges: shiftRanges(cal.ranges, 364) };
    app.calendarDrafts.set(copy.id, copy);
    open(copy.id);
  });
  const replace = el('button', 'ce-replace', t('calReplace'));
  replace.addEventListener('click', () => openCalendarReplace(cal.id));
  const del = el('button', 'ce-del', t('deleteCalendar'));
  del.addEventListener('click', () => { void deleteCalendar(cal); });
  tools.append(prev, next, el('span', 'ce-gap'), dup, replace, del);
  main.appendChild(tools);

  const view = el('div', 'cal-year-view');
  renderMonthsView(view, {
    start, count: 12, active: new Set(calendarDays(cal)), today: today(), lang: app.settings.lang === 'en' ? 'en' : 'no',
    onChange: (days, on) => edit(cal, (c) => ({ ...c, ranges: setDays(c, days, on).ranges })),
  });
  main.appendChild(view);

  const dirty = app.calendarDrafts.has(cal.id);
  const foot = el('div', 'ce-foot');
  const state = el('span', 'ce-state ef-state', dirty ? `● ${t('unsavedChanges')}` : '');
  const discard = /** @type {HTMLButtonElement} */ (el('button', 'ce-discard ef-discard', t('discardLine')));
  discard.disabled = !dirty;
  discard.addEventListener('click', () => {
    app.calendarDrafts.delete(cal.id);
    if (!app.calendars.some((c) => c.id === cal.id)) open(null); // a new one that was never saved
    else renderCalendarsPage();
  });
  const save = /** @type {HTMLButtonElement} */ (el('button', `ce-save ef-save-btn${dirty ? ' dirty' : ''}`, t(dirty ? 'save' : 'savedBtn')));
  save.disabled = !dirty || !cal.name.trim();
  save.addEventListener('click', () => { void saveCalendar(cal.id); });
  foot.append(el('span', 'ef-spacer'), state, discard, save);
  main.appendChild(foot);

  wrap.append(side, main);
  body.appendChild(wrap);
}

export function renderCalendarsPage() {
  if (currentPage() !== 'calendars') return;
  const body = document.getElementById('calendars-body');
  if (!body) return;
  body.innerHTML = '';
  if (!app.meta) { body.appendChild(el('p', 'assets-coming', t('noProjectOpen'))); return; }
  if (app.calendarsError) { body.appendChild(el('p', 'assets-status bad', t('calsUnreadable'))); return; }
  const cal = app.calendarSelected ? current(app.calendarSelected) : null;
  if (cal) renderEditor(body, cal);
  else { app.calendarSelected = null; renderList(body); }
}

export function initCalendarsPage() {
  onRefresh(renderCalendarsPage);
}
