// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { refreshAll, onRefresh, onLinesChanged, notifyLinesChanged, onPanelToggle, initShell } from '../../src/ui/shell.js';
import { onGridRender, initGrid, loadGrid, render } from '../../src/ui/grid.js';
import { onQuaysLoaded, setQuayLookup, loadQuays } from '../../src/ui/quays.js';

// Parts register their redraw functions when they start. Starting a part again (tests reload the
// page markup before every test) must not stack copies: each copy redraws again on every keystroke.
describe('listener registration', () => {
  it('runs a refresh function once, however often it is registered', () => {
    loadAppMarkup();
    initShell();
    const fn = vi.fn();
    onRefresh(fn); onRefresh(fn);
    refreshAll();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs a lines listener once, however often it is registered', () => {
    const fn = vi.fn();
    onLinesChanged(fn); onLinesChanged(fn);
    notifyLinesChanged();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs a grid render listener once, however often it is registered', () => {
    loadAppMarkup();
    initGrid();
    loadGrid({ stops: [{ name: 'A' }], cols: [] });
    const fn = vi.fn();
    onGridRender(fn); onGridRender(fn);
    render();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs a panel listener once, however often it is registered', () => {
    loadAppMarkup();
    initShell();
    const fn = vi.fn();
    onPanelToggle(fn); onPanelToggle(fn);
    /** @type {HTMLElement} */ (document.getElementById('map-strip')).click(); // opens the map panel
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs a quay listener once, however often it is registered', async () => {
    setQuayLookup(async (ids) => new Map(ids.map((id) => [id, { quayId: id, publicCode: '', stopPlaceId: 'NSR:StopPlace:1', stopPlaceName: 'Q', mode: 'bus', lat: 60, lon: 5 }])));
    const fn = vi.fn();
    onQuaysLoaded(fn); onQuaysLoaded(fn);
    await loadQuays(['NSR:Quay:1']);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
