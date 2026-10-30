// @vitest-environment jsdom
// Oversikt (dashboard design 2026-10-21): the first page of a project, in plain sentences: what needs the planner
// today, what soon, and that the rest is fine.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage, currentPage, applyLang } from '../../src/ui/shell.js';
import { initProjectUi, openFs } from '../../src/ui/project-ui.js';
import { initGrid } from '../../src/ui/grid.js';
import { initFootnoteEditor } from '../../src/ui/footnote-editor.js';
import { initRouteEditor } from '../../src/ui/route-editor.js';
import { initDashboardPage } from '../../src/ui/dashboard-page.js';
import { setQuayLookup } from '../../src/ui/quays.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute } from '../../src/project/routes.js';
import { writeCalendars } from '../../src/project/calendars-store.js';
import { writeExports } from '../../src/project/exports-store.js';
import { lineState } from '../../src/ui/line-info.js';
import { lineErn } from '../../src/ui/line-text.js';
import { textHash } from '../../src/core/hash.js';
import { writeOrgs } from '../../src/project/orgs-store.js';
import { projectCopy, registerCompanies } from '../fixtures/orgs.js';
import { closeProject } from '../../src/ui/project-ui.js';

/** A day so many days from today, YYYYMMDD. @param {number} n */
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
const route = (/** @type {string} */ code) => [
  '#LEV;Test;TST', `#RUT;-1;${code};A - B;;1;`, '#SEK;NOG:Authority:aaaaaaaaaa1;F;1;0;0;0', '#SEK;NOG:Operator:bbbbbbbbbb2;B;0;1;0;0', '#DST;1;B;', '#TRA;A - B',
  '#PER;;;;;;', '#KAL;cal-1', '#TAB;0;;;;', '#TUR;0;D;0;0;0;0',
  '#TRL;0;NSR:Quay:1;A;34;0;-1;-1;34;-1', '#TRC;0;0700;0;0;0;0;0', '#TRL;1;NSR:Quay:2;B;34;0;-1;-1;34;-1', '#TRC;0;0710;0;0;0;0;0', '#DSK;0;0;;1',
].join('\r\n') + '\r\n';
const settle = async () => { for (let i = 0; i < 8; i++) await flush(); };
const body = () => /** @type {HTMLElement} */ (document.getElementById('home-body'));

/** @param {number} endsIn days until the calendar ends @param {(fs: any) => Promise<void>} [extra] */
async function openProject(endsIn, extra, text = route('50')) {
  setQuayLookup(async (ids) => new Map(ids.map((id, n) => [id, { quayId: id, publicCode: '', stopPlaceId: 'NSR:StopPlace:1', stopPlaceName: id, mode: 'bus', lat: 60 + n * 0.01, lon: 10 }])));
  const fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  await writeCalendars(fs, [{ id: 'cal-1', name: 'Høst', ranges: [[day(-30), day(endsIn)]] }]);
  await writeOrgs(fs, projectCopy().map((c, n) => ({ ...c, authority: c.authority && { ...c.authority, alias: `TST:Authority:${n + 1}` }, operator: c.operator && { ...c.operator, alias: `TST:Operator:${n + 1}` } })));
  await writeRoute(fs, '50', text);
  if (extra) await extra(fs);
  await openFs(fs, { landing: true });
  app.orgRegister = { companies: registerCompanies(), fetchedAt: new Date().toISOString() };
  setPage('lines'); setPage('home');
  /** @type {any} */ (document.getElementById('check-dlg')).close();
  await settle();
  return fs;
}

let wired = false;
beforeEach(async () => {
  loadAppMarkup();
  initShell();
  setPage('edit');
  await initProjectUi({ restoreLast: false });
  if (!wired) { initGrid(); initFootnoteEditor(); wired = true; }
  initRouteEditor();
  initDashboardPage();
  window.confirm = vi.fn(() => true);
});

describe('Oversikt', () => {
  it('is where a project opens, and Alt+6 goes there', async () => {
    await openProject(200);
    expect(currentPage()).toBe('home');
    setPage('lines');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '6', altKey: true, bubbles: true }));
    expect(currentPage()).toBe('home');
  });

  it('says a line stops running soon, and its button opens the line', async () => {
    await openProject(12);
    const card = /** @type {HTMLElement} */ (body().querySelector('.home-card'));
    expect(card.textContent).toContain('slutter å gå om 12 dager');
    /** @type {HTMLElement} */ (card.querySelector('button')).click();
    await settle();
    expect(currentPage()).toBe('edit');
    expect(app.activeRoute).toBe('50');
  });

  it('puts a line ending within 120 days under "Snart", with Entur\'s requirement', async () => {
    await openProject(60);
    expect(body().querySelector('.home-cards')).toBeNull();
    expect(body().querySelector('.home-soon')?.textContent).toContain('om 60 dager');
    expect(body().querySelector('.home-soon')?.textContent).toContain('120');
  });

  it('a line changed since its last export is for today', async () => {
    await openProject(200, (fs) => writeExports(fs, { 50: { at: new Date().toISOString(), hash: 'stale000' } }));
    expect(body().querySelector('.home-card')?.textContent).toContain('endret, men ikke eksportert');
  });

  it('says all is well when every line is valid long enough and exported as it is', async () => {
    await openProject(200);
    app.exports = { 50: { at: new Date().toISOString(), hash: textHash(lineErn('50', lineState('50'))) } };
    setPage('lines'); setPage('home');
    expect(body().textContent).toContain('Alt ser bra ut');
    expect(body().querySelector('.home-ok')?.textContent).toContain('Linjen er gyldig til minst');
  });

  it('shows every line\'s validity against the 30, 60, 90 and 120 day marks', async () => {
    await openProject(200);
    expect([...body().querySelectorAll('.home-mark')].map((m) => m.textContent)).toEqual(['30', '60', '90', '120']);
    expect(body().querySelectorAll('.home-bar')).toHaveLength(1);
  });

  it("the network section follows a change of language (user 2026-10-30)", async () => {
    await openProject(200);
    const sec = /** @type {HTMLElement} */ (body().querySelector('.home-network'));
    expect(sec.querySelector('h3')?.textContent).toBe('Nettverket');
    app.settings.lang = 'en'; applyLang();
    expect(sec.querySelector('h3')?.textContent).toBe('The network');
    expect(sec.textContent).toContain('Every line that is exported');
    app.settings.lang = 'no'; applyLang();
  });

  it('without a project, says so', async () => {
    await openProject(200);
    await closeProject();
    setPage('home');
    expect(body().textContent).toMatch(/prosjekt/i);
  });
});

describe('Oversikt: one card per line', () => {
  it('a line that ends soon and has errors gets one card, with both', async () => {
    await openProject(12, undefined, route('50').replace('#DSK;0;0;;1\r\n', '')); // a trip without a destination: an error
    const cards = [...body().querySelectorAll('.home-card')];
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('slutter å gå om 12 dager');
    expect(cards[0].querySelector('.home-also')).not.toBeNull();
    expect(body().querySelector('.home-summary')?.textContent).toBe('Én ting trenger deg i dag.');
  });
});
