// Table-set tabs above the grid (timetable structure spec §2, navigation spec §1): one tab per
// table set (#TRA). Click switches, double-click renames, "+" adds one (stops copied in the same
// or reversed order), "×" on the active tab deletes it.
import { app } from './state.js';
import { $, onRefresh, markDirty, showMessage } from './shell.js';
import { t } from '../i18n/strings.js';
import { addTableSet, deleteTableSet, tableSetHasData } from './route-state.js';
import { switchTableSet, isRouteReadOnly, storeGrid } from './route-editor.js';

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
    name.addEventListener('click', () => { if (set.id !== rs.activeSet) switchTableSet(set.id); });
    name.addEventListener('dblclick', () => {
      if (ro) return;
      const next = prompt(t('tableSetNamePrompt'), set.name);
      if (next == null || next.trim() === set.name) return;
      set.name = next.trim();
      markDirty();
    });
    tab.appendChild(name);
    if (!ro && set.id === rs.activeSet && rs.tableSets.length > 1) {
      const del = document.createElement('button');
      del.className = 'ts-del';
      del.textContent = '×';
      del.title = t('deleteTableSet');
      del.addEventListener('click', () => {
        if (tableSetHasData(rs, set.id) && !confirm(t('deleteTableSetConfirm', set.name || t('tableSetUnnamed')))) return;
        if (!deleteTableSet(rs)) { showMessage(t('lastTableSet')); return; }
        markDirty();
        switchTableSet(rs.activeSet, { store: false });
      });
      tab.appendChild(del);
    }
    el.appendChild(tab);
  }
  if (!ro) {
    const add = document.createElement('button');
    add.className = 'ts-add';
    add.textContent = '+';
    add.title = t('newTableSet');
    add.addEventListener('click', () => {
      const name = prompt(t('tableSetNamePrompt'), '');
      if (name == null) return;
      const reversed = confirm(t('tableSetReversed'));
      storeGrid();
      const id = addTableSet(rs, name.trim(), { reversed });
      markDirty();
      switchTableSet(id, { store: false });
    });
    el.appendChild(add);
  }
}

export function initTableSetTabs() {
  onRefresh(renderTableSetTabs);
}
