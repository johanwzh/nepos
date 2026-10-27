// Table-set tabs above the grid (timetable structure spec §2, navigation spec §1): one tab per
// table set (#TRA). Click switches; right-click opens a menu (new, duplicate, edit, delete); double-click
// or Edit opens a dialog with the name and the direction (user 2026-10-19); "+" adds one (stops copied in
// the same or reversed order); "×" on the active tab deletes it. A tab reads "<name> [<direction>]".
import { app } from './state.js';
import { $, onRefresh, markDirty, showMessage } from './shell.js';
import { t } from '../i18n/strings.js';
import { addTableSet, deleteTableSet, tableSetHasData, duplicateTableSet, blankGrid } from './route-state.js';
import { DIRECTION_TYPES } from '../core/directions.js';
import { placeMenu } from './place-menu.js';
import { switchTableSet, isRouteReadOnly, storeGrid } from './route-editor.js';
import { toggleDestColumns, destColumnsOpen, onDestToggle } from './dest-columns.js';
import { toggleMarey, mareyOn } from './marey-view.js';

export function renderTableSetTabs() {
  const el = $('ts-tabs');
  if (!el) return;
  const rs = app.routeState;
  el.innerHTML = '';
  el.hidden = !rs;
  if (!rs) return;
  const ro = isRouteReadOnly();
  for (const set of rs.tableSets) {
    const tab = document.createElement('div');
    tab.className = `ts-tab${set.id === rs.activeSet ? ' active' : ''}`;
    tab.dataset.set = String(set.id);
    const name = document.createElement('span');
    name.className = 'ts-name';
    name.textContent = set.name || t('tableSetUnnamed');
    // The whole tab is the surface, the direction part too (user 2026-10-19)
    tab.addEventListener('click', () => { if (set.id !== rs.activeSet) switchTableSet(set.id); });
    tab.addEventListener('dblclick', (e) => { if (!ro && !/** @type {Element} */ (e.target).closest('.ts-del')) openEditDialog(set.id); });
    tab.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!ro) openTabMenu(set.id, e.clientX, e.clientY); });
    tab.appendChild(name);
    if (set.direction) {
      const dir = document.createElement('span');
      dir.className = 'ts-dir';
      dir.textContent = `[${t(`dir_${set.direction}`)}]`;
      tab.appendChild(dir);
    }
    if (!ro && set.id === rs.activeSet && rs.tableSets.length > 1) {
      const del = document.createElement('button');
      del.className = 'ts-del';
      del.textContent = '×';
      del.title = t('deleteTableSet');
      del.addEventListener('click', () => deleteSet(set.id));
      tab.appendChild(del);
    }
    el.appendChild(tab);
  }
  if (!ro) {
    const add = document.createElement('button');
    add.className = 'ts-add';
    add.textContent = '+';
    add.title = t('newTableSet');
    add.addEventListener('click', () => openNewTableSet());
    el.appendChild(add);
  }
  // The destination columns' toggle, at the right end of the row (destination displays spec)
  const dest = document.createElement('button');
  dest.className = `ts-dest-toggle${destColumnsOpen() ? ' on' : ''}`;
  dest.textContent = t('destToggle');
  dest.title = 'Alt+D';
  dest.addEventListener('click', toggleDestColumns);
  dest.disabled = mareyOn(); // nothing to show while the visual timetable is open
  el.appendChild(dest);
  // The visual timetable (Marey chart, 2.5), next to it
  const marey = document.createElement('button');
  marey.className = `ts-marey-toggle${mareyOn() ? ' on' : ''}`;
  marey.textContent = t('mrToggle');
  marey.title = 'Alt+V';
  marey.addEventListener('click', toggleMarey);
  el.appendChild(marey);
}

/** Delete a table set (the active one, after switching to it), asking when it has data. @param {number} setId */
function deleteSet(setId) {
  const rs = app.routeState;
  if (!rs) return;
  if (rs.tableSets.length <= 1) { showMessage(t('lastTableSet')); return; }
  storeGrid(); // the grid on screen counts as data too
  const set = rs.tableSets.find((/** @type {any} */ x) => x.id === setId);
  if (tableSetHasData(rs, setId) && !confirm(t('deleteTableSetConfirm', set?.name || t('tableSetUnnamed')))) return;
  if (rs.activeSet !== setId) switchTableSet(setId);
  if (!deleteTableSet(rs)) { showMessage(t('lastTableSet')); return; }
  markDirty();
  switchTableSet(rs.activeSet, { store: false });
}

/** The tab's menu: new, duplicate, edit, delete. @param {number} setId @param {number} x @param {number} y */
function openTabMenu(setId, x, y) {
  const m = $('ts-menu');
  m.dataset.set = String(setId);
  m.style.display = 'block';
  placeMenu(m, x, y);
}
function hideTabMenu() { const m = $('ts-menu'); if (m) m.style.display = 'none'; }

/** The edit dialog: the set's name and direction. @param {number} setId */
export function openEditDialog(setId) {
  const rs = app.routeState;
  const set = rs?.tableSets.find((/** @type {any} */ x) => x.id === setId);
  if (!set) return;
  const dlg = $('tse-dlg');
  dlg.dataset.set = String(setId);
  const name = /** @type {HTMLInputElement} */ ($('tse-name'));
  name.value = set.name;
  name.classList.remove('invalid');
  const dir = /** @type {HTMLSelectElement} */ ($('tse-dir'));
  dir.innerHTML = ['', ...DIRECTION_TYPES].map((d) => `<option value="${d}">${t(d ? `dir_${d}` : 'dirNone')}</option>`).join('');
  dir.value = set.direction ?? '';
  dlg.showModal();
  name.focus();
  name.select();
}

function applyEditDialog() {
  const rs = app.routeState;
  const dlg = $('tse-dlg');
  const set = rs?.tableSets.find((/** @type {any} */ x) => x.id === Number(dlg.dataset.set));
  if (!set) { dlg.close(); return; }
  const name = /** @type {HTMLInputElement} */ ($('tse-name'));
  if (!name.value.trim()) { name.classList.add('invalid'); return; }
  set.name = name.value.trim();
  set.direction = /** @type {HTMLSelectElement} */ ($('tse-dir')).value;
  dlg.close();
  markDirty();
  renderTableSetTabs();
}

/** The new-table-set dialog (timetable structure spec §2): name, and the stops to start with (copied from `from`). @param {number} [from] */
function openNewTableSet(from) {
  $('ts-dlg').dataset.from = from != null ? String(from) : '';
  const name = /** @type {HTMLInputElement} */ ($('ts-dlg-name'));
  name.value = '';
  name.classList.remove('invalid');
  /** @type {HTMLInputElement} */ ($('ts-stops-same')).checked = true;
  $('ts-dlg').showModal();
  name.focus();
}

function createFromDialog() {
  const rs = app.routeState;
  const name = /** @type {HTMLInputElement} */ ($('ts-dlg-name'));
  if (!rs) return;
  if (!name.value.trim()) { name.classList.add('invalid'); return; }
  const stops = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="ts-stops"]:checked'))?.value ?? 'same';
  storeGrid();
  const from = Number($('ts-dlg').dataset.from) || rs.activeSet; // "Ny…" from a tab's menu copies that tab
  const id = addTableSet(rs, name.value.trim(), { reversed: stops === 'reversed', from });
  if (stops === 'empty') for (const per of rs.periods.filter((/** @type {any} */ p) => p.setId === id)) rs.grids[`${per.id}:${id}`] = blankGrid();
  $('ts-dlg').close();
  markDirty();
  switchTableSet(id, { store: false });
}

let dialogWired = false;
export function initTableSetTabs() {
  onRefresh(renderTableSetTabs);
  onDestToggle(renderTableSetTabs); // the toggle shows whether the columns are open
  if (dialogWired) return;
  dialogWired = true;
  document.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.id === 'ts-dlg-ok') createFromDialog();
    else if (target.id === 'ts-dlg-cancel') $('ts-dlg').close();
    else if (target.id === 'tse-ok') applyEditDialog();
    else if (target.id === 'tse-cancel') $('tse-dlg').close();
    else if (target.closest?.('#ts-menu .gci')) {
      const id = Number($('ts-menu').dataset.set);
      const rs = app.routeState;
      hideTabMenu();
      if (!rs) return;
      const item = /** @type {HTMLElement} */ (target.closest('.gci')).id;
      if (item === 'tsm-new') openNewTableSet(id);
      else if (item === 'tsm-edit') openEditDialog(id);
      else if (item === 'tsm-del') deleteSet(id);
      else if (item === 'tsm-dup') {
        storeGrid();
        const src = rs.tableSets.find((/** @type {any} */ x) => x.id === id);
        const newId = duplicateTableSet(rs, id, t('tableSetCopyName', src?.name || t('tableSetUnnamed')));
        markDirty();
        switchTableSet(newId, { store: false });
      }
    }
  });
  document.addEventListener('keydown', (e) => {
    const id = /** @type {HTMLElement} */ (e.target).id;
    if (e.key === 'Escape') hideTabMenu();
    if (id !== 'ts-dlg-name' && id !== 'tse-name' && id !== 'tse-dir') return;
    e.stopPropagation(); // the grid must not react to typing in the dialogs
    if (e.key === 'Enter') { e.preventDefault(); if (id === 'ts-dlg-name') createFromDialog(); else applyEditDialog(); }
  }, true);
  // A click outside the tab menu closes it
  document.addEventListener('mousedown', (e) => { if (!/** @type {HTMLElement} */ (e.target).closest?.('#ts-menu')) hideTabMenu(); });
}
