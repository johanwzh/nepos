// @vitest-environment jsdom
// The map pane can be made much wider (most of the window, leaving room for the timetable) and
// keeps its width in this browser (user test 2026-10-16).
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { initShell, setPage } from '../../src/ui/shell.js';

const panel = () => /** @type {HTMLElement} */ (document.getElementById('panel-right'));
function drag(/** @type {number} */ from, /** @type {number} */ to) {
  document.getElementById('rh-right')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: from }));
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: to }));
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}
function start() {
  loadAppMarkup();
  initShell();
  setPage('edit');
  /** @type {HTMLElement} */ (document.getElementById('map-strip')).click();
}

beforeEach(() => {
  try { localStorage.removeItem('nepos.mapWidth'); } catch { /* none */ }
  Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true });
  start();
});

describe('the map pane width', () => {
  it('can be dragged far wider than before, leaving 400 px for the timetable', () => {
    const w0 = parseInt(panel().style.width, 10);
    drag(100, 100 + 900 - w0);
    expect(panel().style.width).toBe('900px');
    drag(100, 2000);
    expect(panel().style.width).toBe('1200px');
  });

  it('remembers its width', () => {
    const w0 = parseInt(panel().style.width, 10);
    drag(100, 100 + 700 - w0);
    expect(localStorage.getItem('nepos.mapWidth')).toBe('700');
    start();
    expect(panel().style.width).toBe('700px');
  });
});
