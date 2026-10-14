// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage } from '../../src/ui/shell.js';
import { initOrgsPage } from '../../src/ui/orgs-page.js';
import { createMemoryFs } from '../../src/project/fs.js';
import { projectCopy } from '../fixtures/orgs.js';

const body = () => document.getElementById('assets-body');

beforeEach(() => {
  loadAppMarkup();
  initShell();
  initOrgsPage();
  Object.assign(app, { fs: createMemoryFs(), meta: { formatVersion: 1, name: 'X', codespace: 'TST' }, orgs: projectCopy(), orgsError: null });
  setPage('assets');
});

describe('organisations page', () => {
  it('lists the companies in the project', () => {
    expect(body().textContent).toContain('Eksempel fylkeskommune');
    expect(body().textContent).toContain('Eksempel Buss AS');
  });

  it('says so when the organisation file cannot be read', () => {
    app.orgsError = 'unreadable';
    setPage('edit'); setPage('assets');
    expect(body().textContent).toContain('data/orgs.json');
  });
});
