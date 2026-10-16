// Kalendere (calendars page spec): a tab of its own. Without a calendar open it is a list of the
// project's calendars (span, days, which lines use them, status); with one open it is the editor —
// a switcher on the left, the name and span, a run of months, and save/discard like lines. Edits
// live in app.calendarDrafts until saved, so lines, the timeline and the export use the saved
// calendar meanwhile. The file is never written when it could not be read.
import { app } from './state.js';
import { onRefresh, currentPage, runAction, setPage } from './shell.js';
import { t } from '../i18n/strings.js';
import { writeCalendars, newCalendar } from '../project/calendars-store.js';
import { calendarDays, setDays, shiftRanges, normalizeRanges } from '../core/calendars.js';
import { renderMonthsView } from './year-view.js';
import { openCalendarReplace } from './calendar-replace-ui.js';
import { lineState, lineLabel } from './line-info.js';
import { validityBar, todayYmd } from './validity-bar.js';
import { createListView, validityOf } from './list-view.js';
import { selectRoute, switchTableSet } from './route-editor.js';
import { norwegianHolidays } from '../core/holidays.js';
import { lineRows } from './line-rows.js';

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
 * @typedef {{ code: string, label: string, set: string, index: number }} Use  a line's table (by its place in the line) using a calendar
 */

/**
 * The line + table pairs that use a calendar (unsaved line edits included).
 * @param {string} id
 * @returns {Use[]}
 */
function usage(id) {
  /** @type {Use[]} */
  const out = [];
  for (const r of app.routes) {
    const rs = lineState(r.code);
    if (rs) {
      rs.tableSets.forEach((/** @type {any} */ set, /** @type {number} */ index) => {
        const uses = rs.periods.some((/** @type {any} */ p) => p.setId === set.id && p.calendarIds.includes(id));
        if (uses) out.push({ code: r.code, label: `${lineLabel(r.code)} · ${set.name || '—'}`, set: set.name, index });
      });
      continue;
    }
    let setName = '', index = -1, last = -2;
    for (const line of r.text.split(/\r?\n/)) {
      const f = line.trim().split(';');
      if (f[0] === '#TRA') { setName = f[1] ?? ''; index++; }
      if (f[0] === '#KAL' && (f[1] ?? '').trim() === id && index !== last) {
        last = index;
        out.push({ code: r.code, label: `${lineLabel(r.code)} · ${setName || '—'}`, set: setName, index: Math.max(0, index) });
      }
    }
  }
  return out;
}

/** The uses grouped by line, in the order met. @param {Use[]} uses */
function byLine(uses) {
  /** @type {Map<string, Use[]>} */
  const lines = new Map();
  for (const u of uses) lines.set(u.code, [...(lines.get(u.code) ?? []), u]);
  return [...lines.values()];
}

/** Open a line in the timetable at one of its tables. @param {string} code @param {number} index */
async function openLineAt(code, index) {
  await selectRoute(code);
  setPage('edit');
  const rs = app.routeState;
  const set = rs?.tableSets?.[index];
  if (set && set.id !== rs.activeSet) switchTableSet(set.id);
}

/** A chip per line; the tables using the calendar on hover. @param {Use[]} uses */
function lineChips(uses) {
  return byLine(uses).map((sets) => `<button class="lt-calchip cl-linechip" data-code="${esc(sets[0].code)}" data-index="${sets[0].index}" title="${esc(sets.map((u) => t('calTable', u.set || '—')).join('\n'))}">${esc(shortLabel(sets[0].code))}</button>`).join('');
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

/**
 * Where the run of months starts. Fixed when the calendar opens (its first valid month, or this
 * month when it is empty or past), so switching days never moves the view; only the buttons do.
 * @param {Calendar} cal
 */
function startMonth(cal) {
  if (!app.calendarMonth) {
    const s = span(cal);
    const now = today();
    app.calendarMonth = (s && s[1] >= now ? s[0] : now).slice(0, 6);
  }
  return app.calendarMonth;
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

/** Write the saved calendars with these calendars' drafts in place. @param {string[]} ids */
async function saveCalendars(ids) {
  const fs = app.fs;
  if (!fs || app.calendarsError) return;
  const drafts = ids.map((id) => app.calendarDrafts.get(id)).filter((d) => d && d.name.trim());
  if (!drafts.length) return;
  const next = [...app.calendars.map((c) => drafts.find((d) => d?.id === c.id) ?? c),
    ...drafts.filter((d) => d && !app.calendars.some((c) => c.id === d.id))];
  const ok = await runAction(() => writeCalendars(fs, /** @type {Calendar[]} */ (next).filter((c) => c.name.trim())));
  if (!ok) return;
  app.calendars = /** @type {Calendar[]} */ (next);
  for (const d of drafts) app.calendarDrafts.delete(/** @type {Calendar} */ (d).id);
  renderCalendarsPage();
}
/** @param {string} id */
const saveCalendar = (id) => saveCalendars([id]);

/** Delete calendars after asking once, naming the line + table sets that use them. @param {string[]} ids */
async function deleteCalendars(ids) {
  const cals = ids.map(current).filter(Boolean);
  if (!cals.length) return;
  const uses = cals.flatMap((c) => usage(/** @type {Calendar} */ (c).id));
  const list = uses.map((u) => `• ${u.label}`).join('\n');
  const ask = cals.length === 1 ? t('calDeleteAsk', /** @type {Calendar} */ (cals[0]).name || '—', uses.length, list) : t('calDeleteMany', cals.length, uses.length, list);
  if (!confirm(ask)) return;
  for (const id of ids) app.calendarDrafts.delete(id);
  if (app.calendars.some((c) => ids.includes(c.id))) {
    const fs = app.fs;
    if (!fs || app.calendarsError) return;
    const next = app.calendars.filter((c) => !ids.includes(c.id));
    if (!(await runAction(() => writeCalendars(fs, next)))) return;
    app.calendars = next;
  }
  if (app.calendarSelected && ids.includes(app.calendarSelected)) app.calendarSelected = null;
  renderCalendarsPage();
}
/** @param {Calendar} cal */
const deleteCalendar = (cal) => deleteCalendars([cal.id]);

// ─── The list (the shared list frame) ───────────────────────────────────────
/** @type {ReturnType<typeof createListView> | null} */
let view = null;

/** The rows: each calendar with its span, days, use and status. */
/** @type {Map<string, string>} the short line labels (as the lines pane), per showing of the list */
let shortLabels = new Map();
/** @param {string} code */
const shortLabel = (code) => shortLabels.get(code) ?? code;

function listRows() {
  shortLabels = new Map(lineRows().map((l) => [l.code, l.label]));
  return allCalendars().map((cal) => {
    const uses = usage(cal.id);
    return { cal, uses, s: span(cal), days: calendarDays(cal), unsaved: app.calendarDrafts.has(cal.id) };
  });
}

/** @param {string} v */
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** @param {{ cal: Calendar, uses: any[], days: string[], unsaved: boolean }} r */
function statusCell(r) {
  const v = validityOf(r.days, today());
  const text = v === 'valid' ? t('lvValid') : v === 'future' ? t('lvFuture') : v === 'ending' ? t('lvEnding') : v === 'expired' ? t('lineExpired') : t('calStatusEmpty');
  const parts = [`<span class="lv-tag ${v}">${esc(text)}</span>`];
  if (!r.uses.length && r.days.length) parts.push(`<span class="lv-tag none">${esc(t('calStatusUnused'))}</span>`);
  if (r.unsaved) parts.push('<span class="lv-unsaved">●</span>');
  return parts.join(' ');
}

/** @param {HTMLElement} host */
function makeView(host) {
  view = createListView(host, {
    id: 'calendars',
    defaultSort: { col: 'name', dir: 1 },
    rows: listRows,
    rowId: (r) => r.cal.id,
    columns: [
      { key: 'name', label: () => t('ltCol_name'), width: 'minmax(0, 2fr)', sort: (r) => r.cal.name || '', cell: (r) => esc(r.cal.name || t('tableSetUnnamed')), text: (r) => r.cal.name },
      { key: 'days', label: () => t('calColDays'), width: '70px', sort: (r) => r.days.length, cell: (r) => String(r.days.length), text: (r) => String(r.days.length) },
      { key: 'lines', label: () => t('calColLines'), width: 'minmax(0, 1.5fr)', sort: (r) => byLine(r.uses).length,
        cell: (r) => lineChips(r.uses), text: (r) => byLine(r.uses).map((sets) => shortLabel(sets[0].code)).join(', ') },
      { key: 'valid', label: () => t('ltCol_valid'), width: '190px', sort: (r) => r.s?.[0] ?? '', cell: (r) => (r.s ? `${show(r.s[0])} – ${show(r.s[1])}` : ''), text: (r) => (r.s ? `${show(r.s[0])} – ${show(r.s[1])}` : '') },
      { key: 'status', label: () => t('ltCol_status'), width: '200px', sort: (r) => validityOf(r.days, today()), cell: statusCell },
    ],
    band: (r) => r.days,
    renderFinders: (box, state, changed) => {
      box.innerHTML = `<input id="cl-search" type="search" autocomplete="off" placeholder="${esc(t('calSearch'))}">
        <select id="cl-f-status"><option value="">${esc(t('ltAllStatus'))}</option><option value="valid">${esc(t('lvValid'))}</option><option value="future">${esc(t('lvFuture'))}</option>
          <option value="ending">${esc(t('lvEnding'))}</option><option value="expired">${esc(t('lineExpired'))}</option><option value="none">${esc(t('calStatusEmpty'))}</option>
          <option value="unused">${esc(t('calStatusUnused'))}</option><option value="unsaved">${esc(t('unsavedDot'))}</option></select>`;
      for (const id of ['cl-search', 'cl-f-status']) {
        const f = /** @type {HTMLInputElement} */ (box.querySelector('#' + id));
        if (state[id] != null) f.value = state[id];
        f.addEventListener(id === 'cl-search' ? 'input' : 'change', () => { state[id] = f.value; changed(); });
      }
    },
    matches: (r, st) => {
      const q = String(st['cl-search'] ?? '').trim().toLowerCase();
      if (q && !(r.cal.name || '').toLowerCase().includes(q)) return false;
      const f = st['cl-f-status'];
      if (f === 'unsaved') return r.unsaved;
      if (f === 'unused') return !r.uses.length;
      return !f || validityOf(r.days, today()) === f;
    },
    tools: [
      { id: 'cl-new', label: () => t('calAdd'), run: () => newDraft() },
      { id: 'cl-edit', label: () => t('lvEdit'), enabled: (sel) => sel.length === 1, run: (sel) => open(sel[0]) },
      { id: 'cl-dup', label: () => t('calDuplicate'), enabled: (sel) => sel.length > 0, run: (sel) => {
        const made = sel.map(current).filter(Boolean).map((c) => {
          const copy = { ...newCalendar(t('calCopyName', /** @type {Calendar} */ (c).name)), ranges: shiftRanges(/** @type {Calendar} */ (c).ranges, 364) };
          app.calendarDrafts.set(copy.id, copy);
          return copy.id;
        });
        view?.select(made);
        renderCalendarsPage();
      } },
      { id: 'cl-replace', label: () => t('calReplace'), enabled: (sel) => sel.length === 1, run: (sel) => openCalendarReplace(sel[0]) },
      { id: 'cl-del', label: () => t('ltDelete'), danger: true, enabled: (sel) => sel.length > 0, run: (sel) => { void deleteCalendars(sel); } },
    ],
    onEdit: (id) => open(id),
    onDelete: (ids) => { void deleteCalendars(ids); },
    empty: () => t(allCalendars().length ? 'noMatches' : 'calNone'),
  });
  // Linjer: a line's chip opens it in the timetable, at the first table using the calendar
  host.addEventListener('click', (e) => {
    const chip = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.cl-linechip'));
    if (!chip) return;
    void openLineAt(/** @type {string} */ (chip.dataset.code), Number(chip.dataset.index));
  });
}

/** @param {HTMLElement} body */
function renderList(body) {
  if (body.dataset.mode !== 'list' || !view) {
    body.innerHTML = '';
    body.dataset.mode = 'list';
    const host = el('div', 'cl-list-host');
    body.appendChild(host);
    makeView(host);
  }
  /** @type {ReturnType<typeof createListView>} */ (view).render();
}

/** The calendars in the order (and filter) the list shows them: the editor's navigator follows it. */
function calendarOrder() {
  // The list's last view (filter and order); when it shows nothing that exists now (not visited yet,
  // another project), all calendars by name.
  const ids = view ? view.order().filter((id) => current(id)) : [];
  return ids.length ? ids : allCalendars().map((c) => c.id);
}

export function newDraft() {
  const cal = newCalendar('');
  app.calendarDrafts.set(cal.id, cal);
  open(cal.id);
  /** @type {HTMLInputElement | null} */ (document.querySelector('#calendars-body .ce-name'))?.focus();
}

// ─── The editor ──────────────────────────────────────────────────────────────
function renderEditor(/** @type {HTMLElement} */ body, /** @type {Calendar} */ cal) {
  const wrap = el('div', 'cl-editor');
  // Right: the navigator — the calendars as the list shows them (its filter and order)
  const side = el('div', 'ce-switch');
  const back = el('button', 'ce-back', t('calBack'));
  back.addEventListener('click', () => open(null));
  side.appendChild(back);
  const ids = calendarOrder();
  if (!ids.includes(cal.id)) ids.unshift(cal.id);
  for (const c of /** @type {Calendar[]} */ (ids.map(current).filter(Boolean))) {
    const item = el('div', `ce-item${c.id === cal.id ? ' active' : ''}`, `${c.name || t('tableSetUnnamed')}${app.calendarDrafts.has(c.id) ? ' ●' : ''}`);
    item.dataset.cal = c.id;
    item.addEventListener('click', () => { if (c.id !== cal.id) open(c.id); });
    side.appendChild(item);
  }
  const add = el('button', 'ce-add', t('calAdd'));
  add.addEventListener('click', newDraft);
  side.appendChild(add);

  // Left: name, span, tools, months, footer
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
  const prev = el('button', 'ce-prev', '↑');
  prev.title = t('calPrevMonth');
  prev.addEventListener('click', () => { app.calendarMonth = addMonths(start, -3); renderCalendarsPage(); });
  const now = el('button', 'ce-today', t('calToday'));
  now.title = t('calTodayHint');
  now.addEventListener('click', () => { app.calendarMonth = addMonths(today().slice(0, 6), -4); renderCalendarsPage(); });
  const next = el('button', 'ce-next', '↓');
  next.title = t('calNextMonth');
  next.addEventListener('click', () => { app.calendarMonth = addMonths(start, 3); renderCalendarsPage(); });
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
  // Holidays in the months shown: take them all out (the usual need), or put them all in
  const holidays = () => {
    const from = `${start}01`, to = `${addMonths(start, 12)}01`;
    /** @type {string[]} */ const days = [];
    for (let y = Number(start.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
      for (const d of norwegianHolidays(y).keys()) if (d >= from && d < to) days.push(d);
    }
    return days;
  };
  const holOff = el('button', 'ce-hol-off', t('calHolidaysOff'));
  holOff.addEventListener('click', () => edit(cal, (c) => ({ ...c, ranges: setDays(c, holidays(), false).ranges })));
  const holOn = el('button', 'ce-hol-on', t('calHolidaysOn'));
  holOn.addEventListener('click', () => edit(cal, (c) => ({ ...c, ranges: setDays(c, holidays(), true).ranges })));
  tools.append(prev, now, next, el('span', 'ce-gap'), holOff, holOn, dup, replace, del);
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

  wrap.append(main, side);
  body.appendChild(wrap);
}

export function renderCalendarsPage() {
  if (currentPage() !== 'calendars') return;
  const body = document.getElementById('calendars-body');
  if (!body) return;
  const reset = (/** @type {string} */ mode) => { body.innerHTML = ''; body.dataset.mode = mode; };
  if (!app.meta) { reset('none'); body.appendChild(el('p', 'assets-coming', t('noProjectOpen'))); return; }
  if (app.calendarsError) { reset('none'); body.appendChild(el('p', 'assets-status bad', t('calsUnreadable'))); return; }
  const cal = app.calendarSelected ? current(app.calendarSelected) : null;
  if (cal) { reset('editor'); renderEditor(body, cal); return; }
  app.calendarSelected = null;
  renderList(body);
}

/** "Lagre" / Ctrl+S on Kalendere: the open calendar. */
export function saveOpenCalendar() {
  if (app.calendarSelected && app.calendarDrafts.has(app.calendarSelected)) void saveCalendars([app.calendarSelected]);
}

let keysWired = false;
export function initCalendarsPage() {
  onRefresh(renderCalendarsPage);
  if (!keysWired) {
    keysWired = true;
    document.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 's' || currentPage() !== 'calendars' || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      // a name being typed counts
      const name = /** @type {HTMLInputElement | null} */ (document.querySelector('#calendars-body .ce-name'));
      if (name && document.activeElement === name) name.dispatchEvent(new Event('input'));
      saveOpenCalendar();
    }, true);
  }
}
