// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage, refreshAll } from '../../src/ui/shell.js';
import { initOrgsPage } from '../../src/ui/orgs-page.js';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { writeOrgs } from '../../src/project/orgs-store.js';
import { registerCompanies, projectCopy } from '../fixtures/orgs.js';

/** @type {any} */ let fs;
const body = () => /** @type {HTMLElement} */ (document.getElementById('assets-body'));
const busIn = (/** @type {any[]} */ companies) => companies.find((c) => c.operator?.id === 'NOG:Operator:bbbbbbbbbb2');
const aliasIn = (/** @type {string} */ nog) => /** @type {HTMLInputElement} */ (body().querySelector(`.org-alias-in[data-nog="${nog}"]`));

beforeEach(async () => {
  loadAppMarkup();
  initShell();
  initOrgsPage();
  fs = createMemoryFs();
  await writeOrgs(fs, projectCopy());
  Object.assign(app, { fs, meta: { formatVersion: 1, name: 'X', codespace: 'TST' }, orgs: projectCopy(), orgsError: null,
    orgRegister: { companies: registerCompanies(), fetchedAt: '2026-10-14T12:40:00Z' }, orgRegisterStatus: 'ok',
    orgChanges: { changed: [], missing: [] },
    routes: [{ code: '1', text: '#SEK;NOG:Operator:bbbbbbbbbb2;Eksempel Buss AS;0;1;0;0\r\n', status: 'ok', issues: [] }] });
  app.assetsSection = 'orgs';
  setPage('assets');
});

describe('organisations page', () => {
  it('shows the register status with a refresh button and the contact note', () => {
    expect(body().querySelector('.org-status')?.textContent).toContain('3 selskaper');
    expect(document.getElementById('org-refresh')).not.toBe(null);
    expect(body().querySelector('.org-missing-note a')?.getAttribute('href')).toBe('mailto:kollektivdata@entur.org');
    expect(body().textContent).not.toContain('Legg til');
  });

  it('says when the refresh failed and which list is used', () => {
    app.orgRegisterStatus = 'failed';
    refreshAll();
    expect(body().querySelector('.org-status')?.textContent).toContain('Kunne ikke hente');
    expect(body().querySelector('.org-status')?.textContent).toContain('14.10.2026');
  });

  it('lists the project companies with how many lines use them and the generated alias as placeholder', () => {
    const rows = body().querySelectorAll('.org-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Eksempel Buss AS'); // sorted by name: "Buss" < "fylkeskommune"
    expect(rows[0].textContent).toContain('1 linjer');
    expect(aliasIn('NOG:Operator:bbbbbbbbbb2').placeholder).toBe('TST:Operator:bbbbbbbbbb2');
  });

  it('saves a valid alias without rebuilding the row', async () => {
    const input = aliasIn('NOG:Operator:bbbbbbbbbb2');
    input.value = 'KOL:Operator:309';
    input.dispatchEvent(new Event('change'));
    await flush();
    expect(aliasIn('NOG:Operator:bbbbbbbbbb2')).toBe(input);
    expect(busIn(JSON.parse(await readText(fs, 'data/orgs.json')).companies).operator.alias).toBe('KOL:Operator:309');
  });

  it('marks an alias with the wrong role as the user types and does not save it', async () => {
    const input = aliasIn('NOG:Operator:bbbbbbbbbb2');
    input.value = 'KOL:Authority:309';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    await flush();
    expect(input.classList.contains('invalid')).toBe(true);
    expect(busIn(JSON.parse(await readText(fs, 'data/orgs.json')).companies).operator.alias).toBe('');
  });

  it('marks companies that changed or are gone from the register', () => {
    app.orgChanges = { changed: ['135'], missing: ['NOG:Authority:aaaaaaaaaa1'] };
    refreshAll();
    expect(body().textContent).toContain('endret ved siste oppdatering');
    expect(body().textContent).toContain('finnes ikke lenger i Entur sitt register');
  });

  it('opens the details of a company', () => {
    /** @type {HTMLElement} */ (body().querySelector('.org-row-head')).click();
    expect(body().querySelector('.org-details')?.textContent).toContain('NOG:Operator:bbbbbbbbbb2');
    expect(body().querySelector('.org-details')?.textContent).toContain('61245400');
  });

  it('says so when the organisation file cannot be read', () => {
    app.orgsError = 'unreadable';
    refreshAll();
    expect(body().textContent).toContain('data/orgs.json');
    expect(body().querySelector('.org-alias-in')).toBe(null);
  });
});
