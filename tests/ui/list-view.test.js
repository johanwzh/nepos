// @vitest-environment jsdom
// The shared list frame (list pages spec, 2026-10-16): a left pane with Finn and Verktøy, sortable
// headers, rows of a record line and a timeline band, click/Shift/Ctrl selection, keys, and a
// state that lasts the session.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createListView, resetListStates } from '../../src/ui/list-view.js';

const ITEMS = [
  { id: 'a', name: 'Alta', n: 3, days: ['20261016', '20270301'] },
  { id: 'b', name: 'Bergen', n: 1, days: [] },
  { id: 'c', name: 'Drammen', n: 2, days: ['20250101'] },
];

/** @type {HTMLElement} */ let root;
/** @type {any} */ let view;
/** @type {any[]} */ let edits;
/** @type {any[]} */ let deletes;

function make() {
  edits = []; deletes = [];
  view = createListView(root, {
    id: 'test',
    today: () => '20261016',
    rows: () => ITEMS,
    rowId: (r) => r.id,
    columns: [
      { key: 'name', label: () => 'Navn', sort: (r) => r.name, cell: (r) => r.name, text: (r) => r.name },
      { key: 'n', label: () => 'Antall', sort: (r) => r.n, cell: (r) => String(r.n), text: (r) => String(r.n) },
    ],
    band: (r) => r.days,
    renderFinders: (box, state, changed) => {
      box.innerHTML = '<input id="f-q">';
      const q = /** @type {HTMLInputElement} */ (box.querySelector('#f-q'));
      q.value = state.q ?? '';
      q.addEventListener('input', () => { state.q = q.value; changed(); });
    },
    matches: (r, state) => !state.q || r.name.toLowerCase().includes(state.q.toLowerCase()),
    tools: [
      { id: 't-edit', label: () => 'Rediger', enabled: (sel) => sel.length === 1, run: (sel) => edits.push(sel) },
    ],
    onEdit: (id) => edits.push(id),
    onDelete: (ids) => deletes.push(ids),
  });
  view.render();
}

const rows = () => /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.lv-row')]);
const names = () => rows().map((r) => r.querySelector('.lv-rec')?.children[0]?.textContent);
const key = (/** @type {string} */ k, opts = {}) => root.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));

beforeEach(() => {
  resetListStates();
  document.body.innerHTML = '<div id="host"></div>';
  root = /** @type {HTMLElement} */ (document.getElementById('host'));
  make();
});

describe('the shared list frame', () => {
  it('has a left pane with Finn and Verktøy apart, and sortable headers on top', () => {
    expect(root.querySelector('.lv-pane .lv-find')).not.toBeNull();
    expect(root.querySelector('.lv-pane .lv-tools')).not.toBeNull();
    expect(root.querySelector('.lv-pane .lv-split')).not.toBeNull();
    expect([...root.querySelectorAll('.lv-head [data-col]')].map((h) => h.textContent)).toEqual(['Navn', 'Antall']);
    /** @type {HTMLElement} */ (root.querySelector('.lv-head [data-col="n"]')).click();
    expect(names()).toEqual(['Bergen', 'Drammen', 'Alta']);
  });

  it('draws each row as a record line over a timeline band, with a validity strip', () => {
    const a = rows()[0];
    expect(a.querySelector('.lv-rec')).not.toBeNull();
    expect(a.querySelector('.lv-band .vb')).not.toBeNull();
    expect(a.classList.contains('lv-valid')).toBe(true);
    expect(rows()[1].classList.contains('lv-none')).toBe(true);
    expect(rows()[2].classList.contains('lv-expired')).toBe(true);
  });

  it('selects by click, Shift-click and Ctrl-click (no checkboxes); Rediger and double-click open', () => {
    expect(root.querySelector('input[type=checkbox]')).toBeNull();
    rows()[0].click();
    rows()[2].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(rows().filter((r) => r.classList.contains('selected'))).toHaveLength(3);
    rows()[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(view.selected()).toEqual(['a', 'c']);
    const edit = /** @type {HTMLButtonElement} */ (root.querySelector('#t-edit'));
    expect(edit.disabled).toBe(true);
    rows()[0].click();
    expect(edit.disabled).toBe(false);
    rows()[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(edits).toEqual(['b']);
  });

  it('works by keyboard: arrows, Shift+arrows, Ctrl+A, Enter, Delete and Ctrl+C', async () => {
    const copied = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText: copied } });
    rows()[0].click();
    key('ArrowDown');
    expect(view.selected()).toEqual(['b']);
    key('ArrowDown', { shiftKey: true });
    expect(view.selected()).toEqual(['b', 'c']);
    key('a', { ctrlKey: true });
    expect(view.selected()).toHaveLength(3);
    key('Delete');
    expect(deletes).toEqual([['a', 'b', 'c']]);
    rows()[1].click();
    key('Enter');
    expect(edits).toEqual(['b']);
    key('c', { ctrlKey: true });
    expect(copied).toHaveBeenCalledWith('Navn\tAntall\nBergen\t1');
  });

  it('looks the same when you come back: search, sort and selection last the session', () => {
    const q = /** @type {HTMLInputElement} */ (root.querySelector('#f-q'));
    q.value = 'er';
    q.dispatchEvent(new Event('input'));
    rows()[0].click();
    root.innerHTML = '';
    make(); // a new visit to the page
    expect(/** @type {HTMLInputElement} */ (root.querySelector('#f-q')).value).toBe('er');
    expect(names()).toEqual(['Bergen']);
    expect(view.selected()).toEqual(['b']);
    resetListStates(); // a page reload
    root.innerHTML = '';
    make();
    expect(names()).toHaveLength(3);
  });

  it('gives the order shown, for the editors\' navigator', () => {
    const q = /** @type {HTMLInputElement} */ (root.querySelector('#f-q'));
    q.value = 'a';
    q.dispatchEvent(new Event('input'));
    expect(view.order()).toEqual(['a', 'c']);
  });
});
