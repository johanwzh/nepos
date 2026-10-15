// The Linjer page (Alt+3; was the lines pane's maxi view, navigation spec §3.2): a table of all
// lines with search, sort, filters, multi-select and batch actions. Double-click opens a line.
// Batch edits leave the lines unsaved (§2); "Lagre" saves the selected lines.
import { app } from './state.js';
import { $, onRefresh, onLinesChanged, showMessage, currentPage, setPage } from './shell.js';
import { t } from '../i18n/strings.js';
import { modeIconSvg } from './mode-icons.js';
import { modeLabel } from '../i18n/modes.js';
import { lineRows, sortLines, loadLineSort, saveLineSort } from './line-rows.js';
import { editLines, setOrg, duplicateLines, deleteLines } from './line-batch.js';
import { selectRoute, saveRoutes } from './route-editor.js';
import { createOrgPicker } from './org-picker.js';
import { replaceCalendarInState } from '../core/calendar-replace.js';

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** @param {string} d YYYYMMDD */
const day = (d) => (d ? `${d.slice(6, 8)}.${d.slice(4, 6)}.${d.slice(0, 4)}` : '');
const lang = () => /** @type {'no' | 'en'} */ (app.settings.lang);

const COLS = ['mode', 'code', 'name', 'branding', 'authority', 'operator', 'valid', 'exported', 'public', 'status'];

/** @type {Set<string>} */
let selected = new Set();
/** @type {string | null} */
let anchor = null;
/** @type {string[]} the codes in the order shown */
let shown = [];

/** @param {string} id */
const field = (id) => /** @type {HTMLInputElement & HTMLSelectElement} */ (document.getElementById(id));


/** @param {import('./line-rows.js').LineRow} r */
function matches(r) {
  const q = field('lt-search').value.trim().toLowerCase();
  if (q && ![r.publicCode, r.name, r.brand, r.authority, r.operator].some((v) => v.toLowerCase().includes(q))) return false;
  const mode = field('lt-f-mode').value, org = field('lt-f-org').value, status = field('lt-f-status').value;
  const exp = field('lt-f-exp').value, pub = field('lt-f-pub').value;
  if (mode && r.mode !== mode) return false;
  if (org && r.authority !== org && r.operator !== org) return false;
  if (status === 'problems' && !(r.errors || r.warnings || r.damaged)) return false;
  if (status === 'expired' && !r.expired) return false;
  if (status === 'unsaved' && !r.unsaved) return false;
  if (exp && !r.exported !== (exp === '1')) return false; // '1' = Eksporter ikke is set
  if (pub && !r.isPublic !== (pub === '1')) return false;
  return true;
}

/** @param {HTMLSelectElement} sel @param {[string, string][]} options value, label (the first is "all") */
function fillSelect(sel, options) {
  const keep = sel.value;
  sel.innerHTML = options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  sel.value = options.some(([v]) => v === keep) ? keep : options[0][0];
}

/** @param {import('./line-rows.js').LineRow} r */
function statusText(r) {
  return [r.unsaved ? '●' : '', r.damaged ? `⚠ ${t('statusDamaged')}` : r.errors || r.warnings ? `⚠ ${r.errors + r.warnings}` : '',
    r.expired ? t('lineExpired') : ''].filter(Boolean).join(' ');
}

/** @param {{ edited: string[], skipped: string[] }} result */
function reportSkipped(result) {
  if (result.skipped.length) showMessage(t('batchSkipped', result.skipped.join(', ')));
}

/** @param {(rs: any) => void} fn */
const batch = (fn) => reportSkipped(editLines([...selected], fn));

function render() {
  const el = $('line-table');
  if (!el || !document.getElementById('lt-body')) return; // not built yet
  if (builtLang !== app.settings.lang) buildChrome();
  el.hidden = !app.meta;
  if (el.hidden || currentPage() !== 'lines') return; // drawn while its page is shown
  selected = new Set([...selected].filter((c) => app.routes.some((r) => r.code === c))); // lines can go away
  const all = lineRows();
  const sort = loadLineSort();
  fillSelect(field('lt-f-mode'), [['', t('ltAllModes')], ...[...new Set(all.map((r) => r.mode).filter(Boolean))].sort().map((m) => /** @type {[string, string]} */ ([m, modeLabel(m, lang())]))]);
  fillSelect(field('lt-f-org'), [['', t('ltAllOrgs')], ...[...new Set(all.flatMap((r) => [r.authority, r.operator]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')).map((o) => /** @type {[string, string]} */ ([o, o]))]);
  const rows = sortLines(all, sort).filter(matches);
  shown = rows.map((r) => r.code);

  el.querySelectorAll('th[data-col]').forEach((/** @type {Element} */ th) => {
    const col = /** @type {HTMLElement} */ (th).dataset.col;
    th.classList.toggle('sorted', col === sort.col);
    th.setAttribute('data-dir', col === sort.col ? String(sort.dir) : '');
  });
  $('lt-body').innerHTML = rows.map((r) => `<tr data-code="${esc(r.code)}" class="${selected.has(r.code) ? 'selected' : ''}${r.code === app.activeRoute ? ' active' : ''}">
    <td><input type="checkbox" class="lt-check"${selected.has(r.code) ? ' checked' : ''}></td>
    <td title="${esc(modeLabel(r.mode, lang()))}">${modeIconSvg(r.mode, r.submode)}</td>
    <td class="lt-code">${esc(r.publicCode)}</td><td class="lt-name">${esc(r.name)}</td><td>${esc(r.brand)}</td>
    <td>${esc(r.authority)}</td><td>${esc(r.operator)}</td>
    <td class="lt-valid">${r.firstDay ? `${day(r.firstDay)} – ${day(r.lastDay)}` : ''}</td>
    <td class="lt-flag lt-flag-exp">${r.exported ? '' : '✓'}</td><td class="lt-flag lt-flag-pub">${r.isPublic ? '' : '✓'}</td>
    <td class="lt-status${r.errors || r.damaged ? ' has-errors' : ''}">${esc(statusText(r))}</td></tr>`).join('')
    || `<tr><td colspan="11" class="lt-empty">${esc(t('noMatches'))}</td></tr>`;

  const none = !selected.size;
  for (const id of ['lt-dup', 'lt-del', 'lt-save', 'lt-cal', 'lt-exp', 'lt-pub', 'lt-brand']) field(id).disabled = none;
  $('lt-count').textContent = none ? '' : t('ltSelected', selected.size);
  fillSelect(field('lt-brand'), [['', t('ltSetBranding')], ['-', t('brandingNone')],
    ...[...app.brandings].sort((a, b) => a.name.localeCompare(b.name, 'nb')).map((b) => /** @type {[string, string]} */ ([b.id, b.name]))]);
  const pickers = $('lt-orgs');
  pickers.innerHTML = '';
  for (const role of /** @type {('authority' | 'operator')[]} */ (['authority', 'operator'])) {
    pickers.appendChild(createOrgPicker({ role, currentId: '', currentName: '', projectCompanies: app.orgs,
      registerCompanies: app.orgRegister?.companies ?? [], invalid: '', disabled: none,
      onPick: (company) => batch((rs) => setOrg(rs, role, company)) }));
  }
}

/** @param {MouseEvent} e */
function onRowClick(e) {
  const tr = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('tr[data-code]'));
  if (!tr) return;
  const code = /** @type {string} */ (tr.dataset.code);
  const onCheck = /** @type {HTMLElement} */ (e.target).classList.contains('lt-check');
  if (e.shiftKey && anchor && shown.includes(anchor)) {
    const [a, b] = [shown.indexOf(anchor), shown.indexOf(code)].sort((x, y) => x - y);
    selected = new Set(shown.slice(a, b + 1));
  } else if (e.ctrlKey || e.metaKey || onCheck) {
    if (selected.has(code)) selected.delete(code); else selected.add(code);
    anchor = code;
  } else {
    selected = new Set([code]);
    anchor = code;
  }
  render();
}

function openCalendarDialog() {
  // The calendars the selected lines use now (unsaved edits included), to replace with another.
  const used = new Set(lineRows().filter((r) => selected.has(r.code)).flatMap((r) => r.calendarIds));
  const name = (/** @type {string} */ id) => app.calendars.find((c) => c.id === id)?.name ?? `⚠ ${id}`;
  fillSelect(field('lt-cal-from'), [...used].map((id) => /** @type {[string, string]} */ ([id, name(id)])).concat(used.size ? [] : [['', '—']]));
  fillSelect(field('lt-cal-to'), app.calendars.filter((c) => c.name.trim()).map((c) => /** @type {[string, string]} */ ([c.id, c.name])).concat(app.calendars.length ? [] : [['', '—']]));
  /** @type {HTMLDialogElement} */ ($('lt-cal-dlg')).showModal();
}

/** The language the toolbar and headings were built in; rebuilt when it changes. */
let builtLang = '';
const FILTERS = ['lt-f-mode', 'lt-f-org', 'lt-f-status', 'lt-f-exp', 'lt-f-pub'];

/** Build the toolbar, headings and dialog in the current language, keeping the search and filters. */
function buildChrome() {
  const kept = { search: field('lt-search')?.value ?? '', filters: FILTERS.map((id) => field(id)?.value ?? '') };
  const el = $('line-table');
  el.innerHTML = `
    <div class="lt-bar">
      <input id="lt-search" type="search" autocomplete="off" placeholder="${esc(t('ltSearch'))}">
      <select id="lt-f-mode"></select><select id="lt-f-org"></select>
      <select id="lt-f-status"><option value="">${esc(t('ltAllStatus'))}</option><option value="problems">${esc(t('ltProblems'))}</option><option value="expired">${esc(t('lineExpired'))}</option><option value="unsaved">${esc(t('unsavedDot'))}</option></select>
      <select id="lt-f-exp"><option value="">${esc(t('flagExported'))}: ${esc(t('ltAll'))}</option><option value="1">${esc(t('flagExported'))}: ${esc(t('yes'))}</option><option value="0">${esc(t('flagExported'))}: ${esc(t('no'))}</option></select>
      <select id="lt-f-pub"><option value="">${esc(t('flagPublic'))}: ${esc(t('ltAll'))}</option><option value="1">${esc(t('flagPublic'))}: ${esc(t('yes'))}</option><option value="0">${esc(t('flagPublic'))}: ${esc(t('no'))}</option></select>
      <span class="lt-spacer"></span>
    </div>
    <div class="lt-bar lt-actions">
      <span id="lt-count"></span>
      <button class="pop-btn" id="lt-dup">${esc(t('ltDuplicate'))}</button>
      <button class="pop-btn" id="lt-del">${esc(t('ltDelete'))}</button>
      <span id="lt-orgs" class="lt-orgs"></span>
      <select id="lt-brand"></select>
      <select id="lt-exp"><option value="">${esc(t('flagExported'))}…</option><option value="1">${esc(t('yes'))}</option><option value="0">${esc(t('no'))}</option></select>
      <select id="lt-pub"><option value="">${esc(t('flagPublic'))}…</option><option value="1">${esc(t('yes'))}</option><option value="0">${esc(t('no'))}</option></select>
      <button class="pop-btn" id="lt-cal">${esc(t('ltReplaceCalendar'))}</button>
      <button class="pop-btn primary" id="lt-save">${esc(t('ltSave'))}</button>
    </div>
    <div class="lt-scroll"><table class="lt-table">
      <thead><tr><th></th>${COLS.map((c) => `<th data-col="${c}">${esc(t(`ltCol_${c}`))}</th>`).join('')}</tr></thead>
      <tbody id="lt-body"></tbody>
    </table></div>
    <dialog class="n2-dialog" id="lt-cal-dlg">
      <p><strong>${esc(t('ltReplaceCalendar'))}</strong></p>
      <p><select id="lt-cal-from"></select> → <select id="lt-cal-to"></select></p>
      <div class="n2-actions"><button class="pop-btn" id="lt-cal-cancel">${esc(t('cancel'))}</button><button class="pop-btn primary" id="lt-cal-ok">${esc(t('ok'))}</button></div>
    </dialog>`;
  builtLang = app.settings.lang;

  field('lt-search').addEventListener('input', render);
  for (const id of ['lt-f-mode', 'lt-f-org', 'lt-f-status', 'lt-f-exp', 'lt-f-pub']) field(id).addEventListener('change', render);
  el.querySelectorAll('th[data-col]').forEach((/** @type {Element} */ th) => th.addEventListener('click', () => {
    const col = /** @type {string} */ (/** @type {HTMLElement} */ (th).dataset.col);
    const sort = loadLineSort();
    saveLineSort({ col, dir: sort.col === col ? /** @type {1 | -1} */ (-sort.dir) : 1 });
    render();
  }));
  $('lt-body').addEventListener('click', onRowClick);
  $('lt-body').addEventListener('dblclick', (/** @type {MouseEvent} */ e) => {
    const tr = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('tr[data-code]'));
    if (!tr) return;
    void selectRoute(/** @type {string} */ (tr.dataset.code));
    setPage('edit');
  });
  $('lt-dup').addEventListener('click', async () => { const made = await duplicateLines([...selected]); if (made.length) selected = new Set(made); render(); });
  $('lt-del').addEventListener('click', async () => { await deleteLines([...selected]); selected = new Set([...selected].filter((c) => app.routes.some((r) => r.code === c))); render(); });
  $('lt-save').addEventListener('click', () => { void saveRoutes([...selected]); });
  for (const [id, prop] of /** @type {[string, string][]} */ ([['lt-exp', 'exported'], ['lt-pub', 'isPublic']])) {
    field(id).addEventListener('change', () => {
      const v = field(id).value;
      field(id).value = '';
      if (v) batch((rs) => { rs[prop] = v !== '1'; }); // '1' sets the flag: not exported / not public
    });
  }
  field('lt-brand').addEventListener('change', () => {
    const v = field('lt-brand').value;
    if (v) batch((rs) => { rs.brandingId = v === '-' ? '' : v; });
  });
  $('lt-cal').addEventListener('click', openCalendarDialog);
  $('lt-cal-cancel').addEventListener('click', () => /** @type {HTMLDialogElement} */ ($('lt-cal-dlg')).close());
  $('lt-cal-ok').addEventListener('click', () => {
    const from = field('lt-cal-from').value, to = field('lt-cal-to').value;
    /** @type {HTMLDialogElement} */ ($('lt-cal-dlg')).close();
    if (from && to && from !== to) batch((rs) => { replaceCalendarInState(rs, from, to); });
  });
  field('lt-search').value = kept.search;
  FILTERS.forEach((id, i) => {
    const sel = field(id);
    const v = kept.filters[i];
    if (v && ![...sel.options].some((o) => o.value === v)) sel.add(new Option(v, v)); // refilled on render
    sel.value = v;
  });
}

export function initLineTable() {
  if (field('lt-search')) field('lt-search').value = ''; // a fresh page
  buildChrome();
  selected = new Set();
  anchor = null;
  onRefresh(render);
  onLinesChanged(render);
}
