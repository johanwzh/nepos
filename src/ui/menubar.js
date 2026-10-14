// A small application menu bar (navigation spec §6): menu buttons with dropdowns, submenus,
// disabled and checked items, shortcut hints, and keyboard use (arrows, Enter, Escape).

/**
 * @typedef {{ label: string, action?: () => void, disabled?: boolean, checked?: boolean, hint?: string,
 *             submenu?: () => MenuItem[] } | 'separator'} MenuItem
 * @typedef {{ label: () => string, items: () => MenuItem[] }} Menu
 */

/** @type {{ bar: HTMLElement, index: number, drop: HTMLElement, sub: HTMLElement | null } | null} */
let open = null;

function closeAll() {
  if (!open) return;
  open.drop.remove();
  open.sub?.remove();
  open.bar.querySelectorAll('.mb-menu.open').forEach((b) => b.classList.remove('open'));
  open = null;
}

/**
 * @param {MenuItem[]} items
 * @param {number} left @param {number} top
 * @param {boolean} isSub
 */
function buildDrop(items, left, top, isSub) {
  const drop = document.createElement('div');
  drop.className = `mb-drop${isSub ? ' mb-subdrop' : ''}`;
  drop.style.left = `${left}px`;
  drop.style.top = `${top}px`;
  for (const it of items) {
    if (it === 'separator') { const sep = document.createElement('div'); sep.className = 'mb-sep'; drop.appendChild(sep); continue; }
    const row = document.createElement('div');
    row.className = `mb-item${it.disabled ? ' disabled' : ''}${it.checked ? ' checked' : ''}${it.submenu ? ' mb-sub' : ''}`;
    const check = document.createElement('span');
    check.className = 'mb-check';
    check.textContent = it.checked ? '✓' : '';
    const label = document.createElement('span');
    label.className = 'mb-label';
    label.textContent = it.label;
    const hint = document.createElement('span');
    hint.className = 'mb-hint';
    hint.textContent = it.submenu ? '›' : it.hint ?? '';
    row.append(check, label, hint);
    if (!it.disabled) {
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (it.submenu) { openSub(row, it.submenu()); return; }
        closeAll();
        it.action?.();
      });
      if (it.submenu) row.addEventListener('mouseenter', () => { if (it.submenu) openSub(row, it.submenu()); });
      else if (!isSub) row.addEventListener('mouseenter', () => { open?.sub?.remove(); if (open) open.sub = null; });
    }
    drop.appendChild(row);
  }
  document.body.appendChild(drop);
  return drop;
}

/** @param {HTMLElement} row @param {MenuItem[]} items */
function openSub(row, items) {
  if (!open) return;
  open.sub?.remove();
  const r = row.getBoundingClientRect();
  open.sub = buildDrop(items, r.right, r.top, true);
}

/** @param {HTMLElement} bar @param {Menu[]} menus @param {number} index */
function openMenu(bar, menus, index) {
  closeAll();
  const btn = /** @type {HTMLElement} */ (bar.querySelector(`.mb-menu[data-menu="${index}"]`));
  btn.classList.add('open');
  const r = btn.getBoundingClientRect();
  open = { bar, index, drop: buildDrop(menus[index].items(), r.left, r.bottom, false), sub: null };
}

/** @param {number} dir */
function moveActive(dir) {
  if (!open) return;
  const host = open.sub ?? open.drop;
  const rows = /** @type {HTMLElement[]} */ ([...host.querySelectorAll('.mb-item:not(.disabled)')]);
  if (!rows.length) return;
  const at = rows.findIndex((r) => r.classList.contains('active'));
  rows.forEach((r) => r.classList.remove('active'));
  rows[(at + dir + rows.length) % rows.length].classList.add('active');
}

let documentWired = false;
function wireDocument() {
  if (documentWired) return;
  documentWired = true;
  document.addEventListener('mousedown', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (open && !target.closest?.('.mb-drop') && !target.closest?.('#menubar')) closeAll();
  });
  document.addEventListener('keydown', (e) => {
    if (!open) return;
    const keys = ['Escape', 'ArrowDown', 'ArrowUp', 'Enter', 'ArrowRight', 'ArrowLeft'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation(); // the grid must not react while a menu is open
    if (e.key === 'Escape') {
      if (open.sub) { open.sub.remove(); open.sub = null; } else closeAll();
    } else if (e.key === 'ArrowDown') moveActive(1);
    else if (e.key === 'ArrowUp') moveActive(-1);
    else if (e.key === 'ArrowLeft' && open.sub) { open.sub.remove(); open.sub = null; }
    else if (e.key === 'Enter' || e.key === 'ArrowRight') {
      const active = /** @type {HTMLElement | null} */ ((open.sub ?? open.drop).querySelector('.mb-item.active'));
      if (active && (e.key === 'Enter' || active.classList.contains('mb-sub'))) active.click();
    }
  }, true);
}

/**
 * @param {HTMLElement} container
 * @param {Menu[]} menus
 * @returns {() => void} re-labels the menu buttons (after a language change)
 */
export function createMenuBar(container, menus) {
  wireDocument();
  container.innerHTML = '';
  menus.forEach((menu, i) => {
    const b = document.createElement('button');
    b.className = 'mb-menu';
    b.dataset.menu = String(i);
    b.textContent = menu.label();
    b.addEventListener('click', () => { if (open && open.index === i) closeAll(); else openMenu(container, menus, i); });
    b.addEventListener('mouseenter', () => { if (open && open.index !== i) openMenu(container, menus, i); });
    container.appendChild(b);
  });
  return () => menus.forEach((menu, i) => {
    const b = container.querySelector(`.mb-menu[data-menu="${i}"]`);
    if (b) b.textContent = menu.label();
  });
}
