// Footnote / date-exception editor (F7), ported from Nepos 1.5.7 (nepos.html lines 4751–5047).
// A footnote is a route-wide definition ({ id, text, exceptions }) attached to a column or a cell.
import { app } from './state.js';
import { t, getLang } from '../i18n/strings.js';
import { markDirty } from './shell.js';
import { grid, render } from './grid.js';
import { dayCodeToWeekdayNums, generateRecurring, fnToText, fnSummary, yyyymmddToDisplay, yyyymmddToInput, inputToYyyymmdd } from '../core/footnotes.js';

const $ = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));

/** @param {number | null | undefined} id */
export function fnById(id) {
  return id == null ? null : app.routeState?.footnotes?.find((/** @type {any} */ f) => f.id === id) ?? null;
}

/** @param {any} fn */
export function footnoteSummary(fn) {
  return fnSummary(fn, getLang());
}

/** @type {{ type: 'col' | 'cell', ri: number, ci: number } | null} */
let ctx = null;
/** @type {{ id: number | null, text: string, exceptions: any[] } | null} */
let draft = null;

function nextId() {
  const ids = (app.routeState?.footnotes ?? []).map((/** @type {any} */ f) => f.id);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

/** Show the selected column's or cell's footnote under the grid. @param {{ type: 'col' | 'cell', ri: number, ci: number } | null} where */
export function updateFnPreview(where = null) {
  const el = $('fn-preview');
  if (!el) return;
  let fn = null;
  if (where && grid.active) {
    const col = grid.cols[where.ci];
    if (where.type === 'cell' && col?.cells[where.ri]?.footnoteId != null) fn = fnById(col.cells[where.ri].footnoteId);
    else if (col?.footnoteId != null) { fn = fnById(col.footnoteId); where = { type: 'col', ri: 0, ci: where.ci }; }
  }
  if (!fn) { el.classList.remove('visible'); el.onclick = null; return; }
  el.textContent = fnToText(fn, getLang()) || footnoteSummary(fn);
  el.classList.add('visible');
  const target = where;
  el.onclick = () => openFnEditor(target.type, target.ri, target.ci);
}

/**
 * @param {'col' | 'cell'} type
 * @param {number} ri
 * @param {number} ci
 */
export function openFnEditor(type, ri, ci) {
  if (!app.routeState || grid.readOnly) return;
  ctx = { type, ri, ci };
  const src = type === 'col' ? grid.cols[ci] : grid.cols[ci]?.cells[ri];
  if (type === 'cell' && !src) return; // notes attach to cells with a time
  const existing = fnById(src?.footnoteId);
  draft = existing
    ? { id: existing.id, text: existing.text || '', exceptions: JSON.parse(JSON.stringify(existing.exceptions || [])) }
    : { id: null, text: '', exceptions: [] };
  renderFnEditor();
  const el = $('fn-editor');
  const anchor = document.querySelector(type === 'col' ? `.g-dc-cell[data-ci="${ci}"]` : `[data-r="${ri}"][data-c="${ci}"]`);
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    el.style.left = `${Math.min(r.left, window.innerWidth - 380)}px`;
    el.style.top = `${r.bottom + 4}px`;
  } else {
    el.style.left = '200px';
    el.style.top = '120px';
  }
  el.classList.add('open');
}

function closeFnEditor() {
  $('fn-editor').classList.remove('open');
  ctx = null;
  draft = null;
}

function renderFnEditor() {
  if (!draft || !ctx) return;
  const d = draft;
  $('fn-title').textContent = t('fnTitle');
  $('fn-text-label').textContent = t('fnTextLabel');
  $('fn-exc-label').textContent = t('fnExcLabel');
  $('fn-add-exc').textContent = t('fnAddExc');
  $('fn-remove').textContent = t('fnRemove');
  $('fn-apply').textContent = t('fnApply');

  const sel = $('fn-def-sel');
  sel.innerHTML = '';
  const newOpt = document.createElement('option');
  newOpt.value = 'new';
  newOpt.textContent = t('fnNew');
  sel.appendChild(newOpt);
  for (const f of app.routeState.footnotes ?? []) {
    const o = document.createElement('option');
    o.value = String(f.id);
    o.textContent = footnoteSummary(f).slice(0, 40) || `#${f.id}`;
    if (f.id === d.id) o.selected = true;
    sel.appendChild(o);
  }

  $('fn-text').value = d.text;

  const list = $('fn-exc-list');
  list.innerHTML = '';
  d.exceptions.forEach((ex, i) => {
    if ((!ex.to || ex.from === ex.to) && !ex._rangeForced) ex._single = true;
    const single = !!ex._single;
    const row = document.createElement('div');
    row.className = 'fn-exc-row';

    const type = document.createElement('select');
    type.className = 'fn-exc-type';
    type.style.flexShrink = '0';
    for (const [value, label] of [['1', t('fnRunsOnly')], ['0', t('fnNotRun')]]) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      o.selected = (value === '1') === !!ex.runsOnly;
      type.appendChild(o);
    }
    type.addEventListener('change', () => { ex.runsOnly = type.value === '1'; });

    const from = document.createElement('input');
    from.type = 'date';
    from.className = 'fn-exc-date fn-from';
    from.value = yyyymmddToInput(ex.from || '');
    from.addEventListener('change', () => { ex.from = inputToYyyymmdd(from.value); if (ex._single) ex.to = ex.from; });

    const toggle = document.createElement('button');
    toggle.className = `fn-single-tog${single ? ' on' : ''}`;
    toggle.title = t('fnSingleToggle');
    toggle.textContent = single ? '1d' : '↔';
    toggle.addEventListener('click', () => {
      if (ex._single) { ex._single = false; ex._rangeForced = true; } else { ex._single = true; ex.to = ex.from; }
      renderFnEditor();
    });

    const del = document.createElement('button');
    del.className = 'fn-exc-del';
    del.textContent = '×';
    del.addEventListener('click', () => { d.exceptions.splice(i, 1); renderFnEditor(); });

    row.append(type, from, toggle);
    if (!single) {
      const to = document.createElement('input');
      to.type = 'date';
      to.className = 'fn-exc-date fn-to';
      to.value = yyyymmddToInput(ex.to || ex.from || '');
      to.addEventListener('change', () => { ex.to = inputToYyyymmdd(to.value); });
      row.append(to);
    }
    row.append(del);
    list.appendChild(row);
  });

  renderGenerator(list);
}

/** "Generate from pattern": every N weeks on a weekday, between two dates. @param {HTMLElement} list */
function renderGenerator(list) {
  const d = /** @type {any} */ (draft);
  const dayCode = grid.cols[ctx.ci]?.dayCode || 'D';
  const days = dayCodeToWeekdayNums(dayCode);
  const names = /** @type {string[]} */ (/** @type {unknown} */ (t('weekdays')));

  const genBtn = document.createElement('button');
  genBtn.className = 'fn-gen-btn';
  genBtn.textContent = t('fnGenerate');
  list.appendChild(genBtn);

  const form = document.createElement('div');
  form.className = 'fn-gen-form';
  form.style.display = 'none';
  form.innerHTML = `
    <div class="fn-gen-row"><select class="fn-gen-type"></select></div>
    <div class="fn-gen-row"><span class="fn-gen-l-from"></span><input type="date" class="fn-gen-from"><span class="fn-gen-l-until"></span><input type="date" class="fn-gen-until"></div>
    <div class="fn-gen-row"><span class="fn-gen-l-every"></span><input type="number" class="fn-gen-n" value="2" min="1" max="52"><span class="fn-gen-l-weeks"></span><select class="fn-gen-day"></select></div>
    <div class="fn-gen-row"><span class="fn-gen-preview"></span><button class="fn-gen-add" disabled></button></div>`;
  list.appendChild(form);

  const q = (/** @type {string} */ c) => /** @type {any} */ (form.querySelector(c));
  for (const [value, label] of [['1', t('fnRunsOnly')], ['0', t('fnNotRun')]]) {
    const o = document.createElement('option'); o.value = value; o.textContent = label; q('.fn-gen-type').appendChild(o);
  }
  for (const day of days) {
    const o = document.createElement('option'); o.value = String(day); o.textContent = names[day]; q('.fn-gen-day').appendChild(o);
  }
  q('.fn-gen-l-from').textContent = `${t('fnFrom')}:`;
  q('.fn-gen-l-until').textContent = `${t('fnUntil')}:`;
  q('.fn-gen-l-every').textContent = t('fnEvery');
  q('.fn-gen-l-weeks').textContent = t('fnWeeksOn');
  q('.fn-gen-add').textContent = t('fnAdd');

  const dates = () => generateRecurring(q('.fn-gen-from').value, q('.fn-gen-until').value,
    parseInt(q('.fn-gen-n').value) || 2, parseInt(q('.fn-gen-day').value) || days[0] || 1);
  const preview = () => {
    const ds = dates();
    q('.fn-gen-preview').textContent = ds.length
      ? `→ ${t('fnDates', ds.length)}: ${ds.slice(0, 3).map(yyyymmddToDisplay).join(', ')}${ds.length > 3 ? '…' : ''}`
      : '';
    q('.fn-gen-add').disabled = ds.length === 0;
  };
  for (const c of ['.fn-gen-from', '.fn-gen-until', '.fn-gen-n', '.fn-gen-day']) {
    q(c).addEventListener('change', preview);
    q(c).addEventListener('input', preview);
  }
  genBtn.addEventListener('click', () => {
    const open = form.style.display !== 'none';
    form.style.display = open ? 'none' : '';
    genBtn.textContent = open ? t('fnGenerate') : t('fnGenClose');
  });
  q('.fn-gen-add').addEventListener('click', () => {
    const runsOnly = q('.fn-gen-type').value === '1';
    for (const day of dates()) d.exceptions.push({ runsOnly, from: day, to: day, _single: true });
    renderFnEditor();
  });
}

/** Strip the editor-only flags before storing. @param {any[]} exceptions */
const clean = (exceptions) => exceptions.map(({ runsOnly, from, to }) => ({ runsOnly, from, to }));

export function initFootnoteEditor() {
  $('fn-close').addEventListener('click', closeFnEditor);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('fn-editor').classList.contains('open')) { e.preventDefault(); closeFnEditor(); }
  });
  $('fn-text').addEventListener('input', () => { if (draft) draft.text = $('fn-text').value; });
  $('fn-text').addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => e.stopPropagation());
  $('fn-def-sel').addEventListener('change', () => {
    if (!draft) return;
    const v = $('fn-def-sel').value;
    const fn = v === 'new' ? null : fnById(+v);
    draft = fn ? { id: fn.id, text: fn.text || '', exceptions: JSON.parse(JSON.stringify(fn.exceptions || [])) } : { id: null, text: '', exceptions: [] };
    renderFnEditor();
  });
  $('fn-add-exc').addEventListener('click', () => {
    if (!draft) return;
    draft.exceptions.push({ runsOnly: false, from: '', to: '' });
    renderFnEditor();
  });
  $('fn-apply').addEventListener('click', () => {
    if (!ctx || !draft) return;
    const rs = app.routeState;
    let fn;
    if (draft.id === null) {
      fn = { id: nextId(), text: draft.text, exceptions: clean(draft.exceptions) };
      rs.footnotes.push(fn);
    } else {
      fn = fnById(draft.id);
      if (fn) { fn.text = draft.text; fn.exceptions = clean(draft.exceptions); }
    }
    const { type, ri, ci } = ctx;
    if (type === 'col') grid.cols[ci].footnoteId = fn.id;
    else if (grid.cols[ci].cells[ri]) grid.cols[ci].cells[ri].footnoteId = fn.id;
    closeFnEditor();
    markDirty();
    render();
  });
  $('fn-remove').addEventListener('click', () => {
    if (!ctx) return;
    const { type, ri, ci } = ctx;
    const src = type === 'col' ? grid.cols[ci] : grid.cols[ci]?.cells[ri];
    const removedId = src?.footnoteId;
    if (src) src.footnoteId = null;
    if (removedId != null) {
      const rs = app.routeState;
      const stillUsedHere = grid.cols.some((/** @type {any} */ col) => col.footnoteId === removedId || col.cells.some((/** @type {any} */ c) => c?.footnoteId === removedId));
      const usedElsewhere = Object.entries(rs.grids).some(([key, g]) => key !== `${rs.activePer}:${rs.activeDir}` &&
        /** @type {any} */ (g).cols.some((/** @type {any} */ col) => col.footnoteId === removedId || col.cells.some((/** @type {any} */ c) => c?.footnoteId === removedId)));
      if (!stillUsedHere && !usedElsewhere) rs.footnotes = rs.footnotes.filter((/** @type {any} */ f) => f.id !== removedId);
    }
    closeFnEditor();
    markDirty();
    render();
  });
}
