// The Linjer page (Alt+2), on the shared list frame (list-view.js): every line with its timeline
// band (all its valid days), a validity strip, and drafts (not exported) hatched. Finn: search and
// filters; Verktøy: + Ny linje, Rediger, Dupliser, the batch edits, Slett. Rediger (or double-click,
// or Enter) opens the line in Rediger rutetabell. Batch edits leave the lines unsaved (§2); the Offentlig and
// Eksporteres switches on the rows are saved at once (line-flags.js, 2.5).
import { app } from './state.js';
import { $, onRefresh, onLinesChanged, showMessage, currentPage, setPage, runAction } from './shell.js';
import { t } from '../i18n/strings.js';
import { modeIconSvg } from './mode-icons.js';
import { modeLabel } from '../i18n/modes.js';
import { lineRows } from './line-rows.js';
import { editLines, setOrg, duplicateLines, deleteLines } from './line-batch.js';
import { selectRoute, newRoute, saveAllRoutes, discardLineChanges } from './route-editor.js';
import { unsavedCodes } from './drafts.js';
import { createOrgPicker } from './org-picker.js';
import { replaceCalendarInState } from '../core/calendar-replace.js';
import { unionDays } from '../core/calendars.js';
import { createListView, validityOf } from './list-view.js';
import { todayYmd } from './validity-bar.js';
import { toggleLineFlag } from './line-flags.js';

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** @param {string} d YYYYMMDD */
const day = (d) => (d ? `${d.slice(6, 8)}.${d.slice(4, 6)}.${d.slice(0, 4)}` : '');
const lang = () => /** @type {'no' | 'en'} */ (app.settings.lang);

/** @typedef {import('./line-rows.js').LineRow & { days: string[] }} Row */

/** Whole days from a to b (YYYYMMDD). @param {string} a @param {string} b */
const daysBetween = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6, 8)) - Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6, 8))) / 86400000);

/** @type {ReturnType<typeof createListView> | null} */
let view = null;

/** The line's valid days: every day of every calendar its table sets use. @param {string[]} ids */
const daysOf = (ids) => unionDays(/** @type {any[]} */ (ids.map((id) => app.calendars.find((c) => c.id === id)).filter(Boolean)));
const calName = (/** @type {string} */ id) => app.calendars.find((c) => c.id === id)?.name ?? `⚠ ${id}`;

/** @returns {Row[]} */
function rows() {
  return lineRows().map((r) => ({ ...r, days: daysOf(r.calendarIds) }));
}

/** The status tag: validity, unsaved, problems (export and public are the switches). @param {Row} r */
function status(r) {
  const now = todayYmd();
  const v = validityOf(r.days, now);
  const text = v === 'valid' ? t('lvValid') : v === 'future' ? t('lvFrom', day(r.days[0])) : v === 'expired' ? t('lineExpired')
    : v === 'none' ? t('calNoDates') : t('lvEndsIn', daysBetween(now, r.days[r.days.length - 1]));
  const parts = [`<span class="lv-tag ${v}">${esc(text)}</span>`];
  if (r.unsaved) parts.push('<span class="lv-unsaved">●</span>');
  if (r.damaged) parts.push(`<span class="lv-problems bad">⚠ ${esc(t('statusDamaged'))}</span>`);
  else if (r.errors || r.warnings) parts.push(`<span class="lv-problems${r.errors ? ' bad' : ''}">⚠ ${r.errors + r.warnings}</span>`);
  return parts.join(' ');
}

/** A switch for a line flag, saved at once (disabled for a damaged file). @param {Row} r @param {'exported' | 'isPublic'} flag */
function flagSwitch(r, flag) {
  const on = !!r[flag];
  return `<button class="lv-switch" role="switch" aria-checked="${on}" data-flag="${flag}"${r.damaged ? ' disabled' : ''} title="${esc(t(flag === 'exported' ? (on ? 'exportIn' : 'exportOut') : (on ? 'pubOpen' : 'pubClosed')))}"></button>`;
}

/** @param {{ edited: string[], skipped: string[] }} result */
function reportSkipped(result) {
  if (result.skipped.length) showMessage(t('batchSkipped', result.skipped.join(', ')));
}

/** @param {string[]} sel @param {(rs: any) => void} fn */
const batch = (sel, fn) => reportSkipped(editLines(sel, fn));

/** @param {HTMLSelectElement} sel @param {[string, string][]} options value, label (the first is "all") */
function fillSelect(sel, options) {
  const keep = sel.value;
  sel.innerHTML = options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  sel.value = options.some(([v]) => v === keep) ? keep : options[0][0];
}

/** Edit a line: open it in Rediger rutetabell. @param {string} code */
function editLine(code) {
  void selectRoute(code);
  setPage('edit');
}

/** @param {HTMLElement} box @param {Record<string, any>} state @param {() => void} changed */
function renderFinders(box, state, changed) {
  box.innerHTML = `
    <input id="lt-search" type="search" autocomplete="off" placeholder="${esc(t('ltSearch'))}">
    <span id="lt-f-cal"></span>
    <select id="lt-f-mode"></select>
    <select id="lt-f-org"></select>
    <select id="lt-f-status"><option value="">${esc(t('ltAllStatus'))}</option><option value="valid">${esc(t('lvValid'))}</option><option value="future">${esc(t('lvFuture'))}</option>
      <option value="ending">${esc(t('lvEnding'))}</option><option value="expired">${esc(t('lineExpired'))}</option><option value="problems">${esc(t('ltProblems'))}</option><option value="unsaved">${esc(t('unsavedDot'))}</option></select>
    <select id="lt-f-exp"><option value="">${esc(t('ltExpAll'))}</option><option value="0">${esc(t('exportIn'))}</option><option value="1">${esc(t('exportOut'))}</option></select>
    <select id="lt-f-pub"><option value="">${esc(t('ltPubAll'))}</option><option value="0">${esc(t('pubOpen'))}</option><option value="1">${esc(t('pubClosed'))}</option></select>`;
  const field = (/** @type {string} */ id) => /** @type {HTMLInputElement & HTMLSelectElement} */ (box.querySelector('#' + id));
  const all = rows();
  fillSelect(field('lt-f-mode'), [['', t('ltAllModes')], ...[...new Set(all.map((r) => r.mode).filter(Boolean))].sort().map((m) => /** @type {[string, string]} */ ([m, modeLabel(m, lang())]))]);
  fillSelect(field('lt-f-org'), [['', t('ltAllOrgs')], ...[...new Set(all.flatMap((r) => [r.authority, r.operator]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')).map((o) => /** @type {[string, string]} */ ([o, o]))]);
  for (const id of ['lt-search', 'lt-f-mode', 'lt-f-org', 'lt-f-status', 'lt-f-exp', 'lt-f-pub']) {
    const el = field(id);
    if (state[id] != null) el.value = state[id];
    el.addEventListener(id === 'lt-search' ? 'input' : 'change', () => { state[id] = el.value; changed(); });
  }
}

/** @param {Row} r @param {Record<string, any>} st */
function matches(r, st) {
  if (app.linesFilterCal && !r.calendarIds.includes(app.linesFilterCal)) return false;
  const q = String(st['lt-search'] ?? '').trim().toLowerCase();
  if (q && ![r.publicCode, r.name, r.brand, r.authority, r.operator, r.privateCode ?? ''].some((v) => String(v).toLowerCase().includes(q))) return false;
  const mode = st['lt-f-mode'], org = st['lt-f-org'], stat = st['lt-f-status'], exp = st['lt-f-exp'], pub = st['lt-f-pub'];
  if (mode && r.mode !== mode) return false;
  if (org && r.authority !== org && r.operator !== org) return false;
  const v = validityOf(r.days, todayYmd());
  if (stat === 'problems' && !(r.errors || r.warnings || r.damaged)) return false;
  if (stat === 'unsaved' && !r.unsaved) return false;
  if (['valid', 'future', 'ending', 'expired'].includes(stat) && v !== stat) return false;
  if (exp && !r.exported !== (exp === '1')) return false; // '1' = Eksporteres ikke
  if (pub && !r.isPublic !== (pub === '1')) return false;
  return true;
}

/** The batch edits (the Verktøy section): organisations, merkevare, calendar. @param {HTMLElement} box @param {string[]} sel */
function renderBatch(box, sel) {
  const none = !sel.length;
  box.innerHTML = `<div class="lv-h lv-h-sub">${esc(t('lvBatch'))}</div><div id="lt-orgs" class="lt-orgs"></div>
    <select id="lt-brand"${none ? ' disabled' : ''}></select>
    <button class="lv-tool" id="lt-cal"${none ? ' disabled' : ''}>${esc(t('ltReplaceCalendar'))}</button>`;
  const field = (/** @type {string} */ id) => /** @type {HTMLInputElement & HTMLSelectElement} */ (box.querySelector('#' + id));
  fillSelect(field('lt-brand'), [['', t('ltSetBranding')], ['-', t('brandingNone')],
    ...[...app.brandings].sort((a, b) => a.name.localeCompare(b.name, 'nb')).map((b) => /** @type {[string, string]} */ ([b.id, b.name]))]);
  const orgs = /** @type {HTMLElement} */ (box.querySelector('#lt-orgs'));
  for (const role of /** @type {('authority' | 'operator')[]} */ (['authority', 'operator'])) {
    orgs.appendChild(createOrgPicker({ role, currentId: '', currentName: '', projectCompanies: app.orgs,
      registerCompanies: app.orgRegister?.companies ?? [], invalid: '', disabled: none,
      onPick: (company) => batch(sel, (rs) => setOrg(rs, role, company)) }));
  }
  field('lt-brand').addEventListener('change', () => {
    const v = field('lt-brand').value;
    if (v) batch(sel, (rs) => { rs.brandingId = v === '-' ? '' : v; });
  });
  field('lt-cal').addEventListener('click', () => openCalendarDialog(sel));
}

/** @param {string[]} sel */
function openCalendarDialog(sel) {
  const used = new Set(lineRows().filter((r) => sel.includes(r.code)).flatMap((r) => r.calendarIds));
  const field = (/** @type {string} */ id) => /** @type {HTMLSelectElement} */ ($(id));
  fillSelect(field('lt-cal-from'), [...used].map((id) => /** @type {[string, string]} */ ([id, calName(id)])).concat(used.size ? [] : [['', '—']]));
  fillSelect(field('lt-cal-to'), app.calendars.filter((c) => c.name.trim()).map((c) => /** @type {[string, string]} */ ([c.id, c.name])).concat(app.calendars.length ? [] : [['', '—']]));
  const dlg = /** @type {HTMLDialogElement} */ ($('lt-cal-dlg'));
  dlg.dataset.sel = JSON.stringify(sel);
  dlg.showModal();
}

/** The lines in the order the list shows them (the editor's navigator follows this). */
export function lineOrder() {
  return view ? view.order() : [];
}

function render() {
  const el = $('line-table');
  if (!el || !view) return;
  el.hidden = !app.meta;
  if (el.hidden || currentPage() !== 'lines') return; // drawn while its page is shown
  view.render();
  // the calendar filter (from Kalendere's "Brukes av"), shown as a removable chip in Finn
  const chip = /** @type {HTMLElement | null} */ (el.querySelector('#lt-f-cal'));
  if (chip) {
    chip.innerHTML = app.linesFilterCal ? `<span class="lt-fchip">${esc(t('ltFilterCal', calName(app.linesFilterCal)))}<button title="${esc(t('ltFilterClear'))}">×</button></span>` : '';
    chip.querySelector('button')?.addEventListener('click', () => { app.linesFilterCal = null; render(); });
  }
}

export function initLineTable() {
  const el = $('line-table');
  el.innerHTML = '';
  delete el.dataset.lv;
  view = createListView(el, {
    id: 'lines',
    defaultSort: { col: 'code', dir: 1 },
    rows,
    rowId: (r) => r.code,
    columns: [
      // The mode's icon before the code: a column of its own was fixed-width room it never needed (user 2026-10-30)
      { key: 'code', label: () => t('ltCol_code'), width: '84px', sort: (r) => r.publicCode, cell: (r) => `<span class="lt-mode">${modeIconSvg(r.mode, r.submode)}</span>${esc(r.publicCode)}`, text: (r) => r.publicCode },
      { key: 'name', label: () => t('ltCol_name'), width: 'minmax(0, 2fr)', sort: (r) => r.name, cell: (r) => esc(r.name), text: (r) => r.name },
      { key: 'branding', label: () => t('ltCol_branding'), sort: (r) => r.brand, cell: (r) => esc(r.brand), text: (r) => r.brand },
      { key: 'authority', label: () => t('ltCol_authority'), sort: (r) => r.authority, cell: (r) => esc(r.authority), text: (r) => r.authority },
      { key: 'operator', label: () => t('ltCol_operator'), sort: (r) => r.operator, cell: (r) => esc(r.operator), text: (r) => r.operator },
      { key: 'calendars', label: () => t('ltCol_calendars'), width: 'minmax(0, 1.2fr)', cell: (r) => r.calendarIds.map((id) => `<button class="lt-calchip" data-cal="${esc(id)}">${esc(calName(id))}</button>`).join(''), text: (r) => r.calendarIds.map(calName).join(', ') },
      // (no Gyldig column: the timeline under each row shows it better, user 2026-10-30)
      { key: 'public', label: () => t('ltCol_public'), width: '72px', sort: (r) => (r.isPublic ? 1 : 0), cell: (r) => flagSwitch(r, 'isPublic'), text: (r) => t(r.isPublic ? 'pubOpen' : 'pubClosed') },
      { key: 'exported', label: () => t('ltCol_exported'), width: '72px', sort: (r) => (r.exported ? 1 : 0), cell: (r) => flagSwitch(r, 'exported'), text: (r) => t(r.exported ? 'exportIn' : 'exportOut') },
      { key: 'status', label: () => t('ltCol_status'), width: '180px', sort: (r) => `${r.exported ? 1 : 0}${validityOf(r.days, todayYmd())}`, cell: status },
    ],
    band: (r) => r.days,
    rowClass: (r) => (r.exported ? '' : 'lv-draft'),
    renderFinders,
    matches,
    tools: [
      { id: 'lt-new', label: () => t('ltNewLine'), run: () => { void newRoute().then(() => setPage('edit')); } },
      { id: 'lt-edit', label: () => t('lvEdit'), enabled: (sel) => sel.length === 1, run: (sel) => editLine(sel[0]) },
      { id: 'lt-dup', label: () => t('ltDuplicate'), enabled: (sel) => sel.length > 0, run: async (sel) => { const made = await duplicateLines(sel); if (made.length) view?.select(made); render(); } },
      { id: 'lt-del', label: () => t('ltDelete'), danger: true, enabled: (sel) => sel.length > 0, run: async (sel) => { await deleteLines(sel); render(); } },
    ],
    renderExtraTools: renderBatch,
    onEdit: editLine,
    onDelete: async (sel) => { await deleteLines(sel); render(); },
    empty: () => t(app.routes.length ? 'noMatches' : 'ltNoLines'),
    footer: { count: () => unsavedCodes().length, save: () => saveAllRoutes(), discard: discardLineChanges, kind: () => t('lvKindLines') },
  });
  // a flag switch: the selected lines when its row is selected, else its own line; saved at once
  el.addEventListener('click', (e) => {
    const sw = /** @type {HTMLButtonElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.lv-switch'));
    const code = /** @type {HTMLElement | null} */ (sw?.closest('.lv-row'))?.dataset.id;
    if (!sw || sw.disabled || !code || !view) return;
    const flag = /** @type {'exported' | 'isPublic'} */ (sw.dataset.flag);
    const sel = view.selected();
    const codes = sel.includes(code) ? sel : [code];
    const value = sw.getAttribute('aria-checked') !== 'true';
    void runAction(async () => reportSkipped(await toggleLineFlag(codes, flag, value)));
  });
  // a calendar chip opens that calendar in Kalendere
  el.addEventListener('click', (e) => {
    const chip = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.lt-calchip'));
    if (!chip) return;
    app.calendarSelected = /** @type {string} */ (chip.dataset.cal);
    app.calendarMonth = '';
    setPage('calendars');
  });
  // the "Bytt kalender" window
  if (!document.getElementById('lt-cal-dlg')) {
    const dlg = document.createElement('dialog');
    dlg.className = 'n2-dialog';
    dlg.id = 'lt-cal-dlg';
    dlg.innerHTML = `<p><strong>${esc(t('ltReplaceCalendar'))}</strong></p><p><select id="lt-cal-from"></select> → <select id="lt-cal-to"></select></p>
      <div class="n2-actions"><button class="pop-btn" id="lt-cal-cancel">${esc(t('cancel'))}</button><button class="pop-btn primary" id="lt-cal-ok">${esc(t('ok'))}</button></div>`;
    document.body.appendChild(dlg);
    $('lt-cal-cancel').addEventListener('click', () => dlg.close());
    $('lt-cal-ok').addEventListener('click', () => {
      const from = /** @type {HTMLSelectElement} */ ($('lt-cal-from')).value, to = /** @type {HTMLSelectElement} */ ($('lt-cal-to')).value;
      const sel = JSON.parse(dlg.dataset.sel ?? '[]');
      dlg.close();
      if (from && to && from !== to) batch(sel, (rs) => { replaceCalendarInState(rs, from, to); });
    });
  }
  onRefresh(render);
  onLinesChanged(render);
}

