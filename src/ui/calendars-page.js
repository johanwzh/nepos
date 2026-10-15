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
import { pick } from './selection.js';

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
  selectedIds = new Set([...selectedIds].filter((id) => !ids.includes(id)));
  if (app.calendarSelected && ids.includes(app.calendarSelected)) app.calendarSelected = null;
  renderCalendarsPage();
}
/** @param {Calendar} cal */
const deleteCalendar = (cal) => deleteCalendars([cal.id]);

// ─── The list (like Linjer: search, filter, sort, select, act) ─────────────
const SORT_KEY = 'nepos.calSort';
/** @returns {{ col: string, dir: 1 | -1 }} */
function loadSort() {
  try { const v = JSON.parse(localStorage.getItem(SORT_KEY) ?? 'null'); if (v && typeof v.col === 'string' && (v.dir === 1 || v.dir === -1)) return v; } catch { /* the default */ }
  return { col: 'name', dir: 1 };
}
/** @param {{ col: string, dir: 1 | -1 }} v */
function saveSort(v) { try { localStorage.setItem(SORT_KEY, JSON.stringify(v)); } catch { /* not remembered */ } }

/** @type {Set<string>} */
let selectedIds = new Set();
/** @type {string | null} */
let anchor = null;
/** @type {string[]} */
let shown = [];

/** The rows as shown: each calendar with its span, days, use and status. */
function listRows() {
  const now = today();
  return allCalendars().map((cal) => {
    const uses = usage(cal.id);
    const s = span(cal);
    const days = calendarDays(cal);
    const unsaved = app.calendarDrafts.has(cal.id);
    const state = !s ? 'empty' : s[1] < now ? 'expired' : !uses.length ? 'unused' : '';
    return { cal, uses, s, days, unsaved, state, status: [unsaved ? '●' : '', statusOf(cal, uses.length)].filter(Boolean).join(' ') };
  });
}

/** @type {Record<string, (r: ReturnType<typeof listRows>[number]) => string | number>} */
const KEYS = { name: (r) => r.cal.name || '', valid: (r) => r.s?.[0] ?? '', days: (r) => r.days.length, used: (r) => r.uses.length, status: (r) => r.status };

/** @param {HTMLElement} body */
function buildListChrome(body) {
  body.innerHTML = `
    <div class="lt-bar">
      <button class="pop-btn primary cl-new" id="cl-new">${t('calAdd')}</button>
      <input id="cl-search" type="search" autocomplete="off" placeholder="${t('calSearch')}">
      <select id="cl-f-status"><option value="">${t('ltAllStatus')}</option><option value="expired">${t('lineExpired')}</option>
        <option value="empty">${t('calStatusEmpty')}</option><option value="unused">${t('calStatusUnused')}</option><option value="unsaved">${t('unsavedDot')}</option></select>
    </div>
    <div class="lt-bar lt-actions">
      <span id="cl-count"></span>
      <button class="pop-btn" id="cl-dup">${t('calDuplicate')}</button>
      <button class="pop-btn" id="cl-replace">${t('calReplace')}</button>
      <button class="pop-btn" id="cl-del">${t('ltDelete')}</button>
      <button class="pop-btn primary" id="cl-save">${t('ltSave')}</button>
    </div>
    <div class="lt-scroll"><table class="lt-table cl-table">
      <thead><tr><th></th><th data-col="name">${t('ltCol_name')}</th><th data-col="valid">${t('ltCol_valid')}</th><th></th>
        <th data-col="days">${t('calColDays')}</th><th data-col="used">${t('calColUsed')}</th><th data-col="status">${t('ltCol_status')}</th></tr></thead>
      <tbody></tbody>
    </table></div>`;
  body.dataset.mode = 'list';
  body.dataset.lang = app.settings.lang;
  const field = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ (body.querySelector('#' + id));
  field('cl-new').addEventListener('click', newDraft);
  field('cl-search').addEventListener('input', () => renderList(body));
  field('cl-f-status').addEventListener('change', () => renderList(body));
  body.querySelectorAll('th[data-col]').forEach((th) => th.addEventListener('click', () => {
    const col = /** @type {string} */ (/** @type {HTMLElement} */ (th).dataset.col);
    const sort = loadSort();
    saveSort({ col, dir: sort.col === col ? /** @type {1 | -1} */ (-sort.dir) : 1 });
    renderList(body);
  }));
  const tbody = /** @type {HTMLElement} */ (body.querySelector('tbody'));
  tbody.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const link = /** @type {HTMLElement | null} */ (target.closest('.cl-used a'));
    const tr = /** @type {HTMLElement | null} */ (target.closest('tr[data-cal]'));
    if (!tr) return;
    if (link) { // "Brukes av": the lines that use it, on Linjer
      e.preventDefault();
      app.linesFilterCal = /** @type {string} */ (tr.dataset.cal);
      setPage('lines');
      return;
    }
    ({ selected: selectedIds, anchor } = pick({ selected: selectedIds, anchor }, shown, /** @type {string} */ (tr.dataset.cal),
      { shift: /** @type {MouseEvent} */ (e).shiftKey, ctrl: /** @type {MouseEvent} */ (e).ctrlKey || /** @type {MouseEvent} */ (e).metaKey, toggle: target.classList.contains('lt-check') }));
    renderList(body);
  });
  tbody.addEventListener('dblclick', (e) => {
    const tr = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('tr[data-cal]'));
    if (tr) open(/** @type {string} */ (tr.dataset.cal));
  });
  field('cl-dup').addEventListener('click', () => {
    const made = [...selectedIds].map(current).filter(Boolean).map((c) => {
      const copy = { ...newCalendar(t('calCopyName', /** @type {Calendar} */ (c).name)), ranges: shiftRanges(/** @type {Calendar} */ (c).ranges, 364) };
      app.calendarDrafts.set(copy.id, copy);
      return copy.id;
    });
    selectedIds = new Set(made);
    renderList(body);
  });
  field('cl-replace').addEventListener('click', () => { if (selectedIds.size === 1) openCalendarReplace([...selectedIds][0]); });
  field('cl-del').addEventListener('click', () => { void deleteCalendars([...selectedIds]); });
  field('cl-save').addEventListener('click', () => { void saveCalendars([...selectedIds]); });
}

/** @param {HTMLElement} body */
function renderList(body) {
  if (body.dataset.mode !== 'list' || body.dataset.lang !== app.settings.lang) buildListChrome(body);
  const field = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ (body.querySelector('#' + id));
  const q = field('cl-search').value.trim().toLowerCase();
  const status = field('cl-f-status').value;
  const sort = loadSort();
  const key = KEYS[sort.col] ?? KEYS.name;
  const all = listRows();
  selectedIds = new Set([...selectedIds].filter((id) => all.some((r) => r.cal.id === id)));
  const rows = all
    .filter((r) => !q || (r.cal.name || '').toLowerCase().includes(q))
    .filter((r) => !status || (status === 'unsaved' ? r.unsaved : r.state === status))
    .sort((a, b) => { const x = key(a), y = key(b); return sort.dir * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'nb', { numeric: true })); });
  shown = rows.map((r) => r.cal.id);
  body.querySelectorAll('th[data-col]').forEach((th) => {
    const col = /** @type {HTMLElement} */ (th).dataset.col;
    th.classList.toggle('sorted', col === sort.col);
    th.setAttribute('data-dir', col === sort.col ? String(sort.dir) : '');
  });
  const now = todayYmd();
  const esc = (/** @type {string} */ v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  /** @type {HTMLElement} */ (body.querySelector('tbody')).innerHTML = rows.map((r) => `<tr data-cal="${esc(r.cal.id)}" class="${selectedIds.has(r.cal.id) ? 'selected' : ''}">
    <td><input type="checkbox" class="lt-check"${selectedIds.has(r.cal.id) ? ' checked' : ''}></td>
    <td class="cl-name">${esc(`${r.cal.name || t('tableSetUnnamed')}${r.unsaved ? ' ●' : ''}`)}</td>
    <td class="lt-valid">${r.s ? `${show(r.s[0])} – ${show(r.s[1])}` : ''}</td>
    <td class="lt-bar">${validityBar(r.days, now)}</td>
    <td class="cl-days">${r.days.length}</td>
    <td class="cl-used">${r.uses.length ? `<a href="#">${esc(usedText(r.uses))}</a>` : esc(usedText(r.uses))}</td>
    <td class="cl-status lt-status">${esc(r.status)}</td></tr>`).join('')
    || `<tr><td colspan="7" class="lt-empty">${esc(t(allCalendars().length ? 'noMatches' : 'calNone'))}</td></tr>`;
  const none = !selectedIds.size;
  for (const id of ['cl-dup', 'cl-del']) field(id).disabled = none;
  field('cl-replace').disabled = selectedIds.size !== 1;
  field('cl-save').disabled = ![...selectedIds].some((id) => app.calendarDrafts.has(id));
  field('cl-count').textContent = none ? '' : t('ltSelected', selectedIds.size);
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
  prev.addEventListener('click', () => { app.calendarMonth = addMonths(start, -3); renderCalendarsPage(); });
  const now = el('button', 'ce-today', t('calToday'));
  now.title = t('calTodayHint');
  now.addEventListener('click', () => { app.calendarMonth = addMonths(today().slice(0, 6), -4); renderCalendarsPage(); });
  const next = el('button', 'ce-next', '›');
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
  tools.append(prev, now, next, el('span', 'ce-gap'), dup, replace, del);
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
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's' || currentPage() !== 'calendars' || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      // a name being typed counts
      const name = /** @type {HTMLInputElement | null} */ (document.querySelector('#calendars-body .ce-name'));
      if (name && document.activeElement === name) name.dispatchEvent(new Event('input'));
      saveOpenCalendar();
    }, true);
  }
}
