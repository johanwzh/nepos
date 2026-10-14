// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell } from '../../src/ui/shell.js';
import { loadCachedRegister, refreshRegister, syncProjectCopy, pruneProjectCopy, REGISTER_KEY } from '../../src/ui/org-register.js';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { writeOrgs } from '../../src/project/orgs-store.js';
import { registerCompanies, projectCopy } from '../fixtures/orgs.js';
import { readFileSync } from 'node:fs';

const xml = readFileSync('tests/fixtures/orgs/register.xml', 'utf8');
const ok = async () => ({ ok: true, status: 200, text: async () => xml });
const down = async () => { throw new Error('offline'); };

beforeEach(async () => {
  loadAppMarkup();
  initShell();
  localStorage.clear();
  const fs = createMemoryFs();
  await writeOrgs(fs, projectCopy());
  Object.assign(app, { fs, meta: { formatVersion: 1, name: 'X', codespace: 'TST' }, orgs: projectCopy(), orgsError: null,
    orgRegister: null, orgRegisterStatus: 'idle', orgChanges: { changed: [], missing: [] }, routes: [] });
});

describe('organisation register in the app', () => {
  it('downloads, caches and uses the register', async () => {
    expect(await refreshRegister({ fetch: ok })).toBe(true);
    expect(app.orgRegisterStatus).toBe('ok');
    expect(app.orgRegister?.companies.map((c) => c.name)).toEqual(['Børselv Taxi', 'Lesja Bilruter', 'Ruter']);
    app.orgRegister = null;
    loadCachedRegister();
    expect(app.orgRegister?.companies).toHaveLength(3);
  });

  it('keeps the cached register when the download fails', async () => {
    localStorage.setItem(REGISTER_KEY, JSON.stringify({ fetchedAt: '2026-10-12T10:00:00Z', companies: registerCompanies() }));
    loadCachedRegister();
    expect(await refreshRegister({ fetch: down })).toBe(false);
    expect(app.orgRegisterStatus).toBe('failed');
    expect(app.orgRegister?.fetchedAt).toBe('2026-10-12T10:00:00Z');
  });

  it('ignores a damaged cache', () => {
    localStorage.setItem(REGISTER_KEY, '{nope');
    loadCachedRegister();
    expect(app.orgRegister).toBe(null);
  });

  it('refreshes the project copy from the register and writes it, keeping aliases', async () => {
    const register = registerCompanies();
    register[1].name = 'Eksempel Buss Norge AS';
    /** @type {any} */ (app.orgs[1].operator).alias = 'KOL:Operator:309';
    app.orgRegister = { companies: register, fetchedAt: '2026-10-14T10:00:00Z' };
    await syncProjectCopy();
    const saved = JSON.parse(await readText(app.fs, 'data/orgs.json')).companies;
    expect(saved[1].name).toBe('Eksempel Buss Norge AS');
    expect(saved[1].operator.alias).toBe('KOL:Operator:309');
    expect(app.orgChanges.changed).toEqual(['135']);
  });

  it('never writes the copy when it could not be read', async () => {
    app.orgsError = 'unreadable';
    const before = await readText(app.fs, 'data/orgs.json');
    const register = registerCompanies();
    register[1].name = 'Changed';
    app.orgRegister = { companies: register, fetchedAt: 'x' };
    await syncProjectCopy();
    expect(await readText(app.fs, 'data/orgs.json')).toBe(before);
  });

  it('prunes organisations no route uses after a save', async () => {
    app.routes = [{ code: '1', text: '#RUT;-1;1;A;;1;\r\n#SEK;NOG:Operator:bbbbbbbbbb2;Eksempel Buss AS;0;1;0;0\r\n', status: 'ok', issues: [] }];
    await pruneProjectCopy();
    expect(app.orgs.map((c) => c.name)).toEqual(['Eksempel Buss AS']);
    expect(JSON.parse(await readText(app.fs, 'data/orgs.json')).companies).toHaveLength(1);
  });
});

describe('organisations the lines use', () => {
  it('adds a used organisation that is in the register but missing from the copy', async () => {
    app.orgs = [];
    app.routes = [{ code: '1', text: '#SEK;NOG:Operator:ddddddddd4;Fjord AS;0;1;0;0\r\n', status: 'ok', issues: [] }];
    app.orgRegister = { companies: registerCompanies(), fetchedAt: 'x' };
    await syncProjectCopy();
    expect(app.orgs.map((c) => c.operator?.id)).toEqual(['NOG:Operator:ddddddddd4']);
    expect(JSON.parse(await readText(app.fs, 'data/orgs.json')).companies).toHaveLength(1);
  });

  it('keeps an organisation a parked, unsaved line uses when pruning (review I3)', async () => {
    app.routes = [];
    app.routeState = null;
    app.drafts = new Map([['7', /** @type {any} */ ({ sek: [{ orgId: 'NOG:Operator:bbbbbbbbbb2', isAuthority: false, isOperator: true, name: 'Eksempel Buss AS' }] })]]);
    await pruneProjectCopy();
    expect(app.orgs.map((c) => c.name)).toEqual(['Eksempel Buss AS']);
    app.drafts = new Map();
  });

  it('keeps an organisation the open, unsaved line uses when pruning', async () => {
    app.routes = [];
    app.routeState = { sek: [{ orgId: 'NOG:Operator:bbbbbbbbbb2', isAuthority: false, isOperator: true, name: 'Eksempel Buss AS' }] };
    await pruneProjectCopy();
    expect(app.orgs.map((c) => c.name)).toEqual(['Eksempel Buss AS']);
    app.routeState = null;
  });
});
