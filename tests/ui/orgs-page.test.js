// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppMarkup, flush } from './dom-setup.js';
import { app } from '../../src/ui/state.js';
import { initShell, setPage } from '../../src/ui/shell.js';
import { initOrgsPage } from '../../src/ui/orgs-page.js';
import { openFs } from '../../src/ui/project-ui.js';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';

/** @type {any} */
let fs;
const body = () => document.getElementById('assets-body');
const idInputs = () => /** @type {HTMLInputElement[]} */ ([...body().querySelectorAll('.asset-id-in')]);
const nameInputs = () => /** @type {HTMLInputElement[]} */ ([...body().querySelectorAll('.asset-name-in')]);
/** @param {HTMLInputElement} input @param {string} value */
const edit = (input, value) => { input.value = value; input.dispatchEvent(new Event('change')); };

beforeEach(() => {
  loadAppMarkup();
  initShell();
  initOrgsPage();
  fs = createMemoryFs({ 'data/orgs.json': '[]' });
  Object.assign(app, {
    fs, meta: { formatVersion: 1, name: 'X', codespace: 'TST' },
    orgs: [{ id: 'TST:Authority:1', name: 'A' }, { id: 'TST:Operator:1', name: 'B' }],
    orgsError: null, orgsStatus: '',
  });
  setPage('assets');
});

describe('organisations page', () => {
  it('keeps the other fields in place after an edit, so the next click or keystroke is not lost', async () => {
    const nextField = nameInputs()[0];
    const addButton = body().querySelector('.asset-add');
    edit(idInputs()[0], 'TST:Authority:2');
    await flush();
    expect(nameInputs()[0]).toBe(nextField);
    expect(body().querySelector('.asset-add')).toBe(addButton);
    expect(JSON.parse(await readText(fs, 'data/orgs.json'))[0].id).toBe('TST:Authority:2');
  });

  it('marks an invalid ID in place and does not write the file', async () => {
    const nextField = nameInputs()[0];
    edit(idInputs()[0], 'tst:authority:1');
    await flush();
    expect(nameInputs()[0]).toBe(nextField);
    expect(body().querySelectorAll('.asset-row.invalid')).toHaveLength(1);
    expect(body().textContent).toContain('ABC:Authority:123');
    expect(await readText(fs, 'data/orgs.json')).toBe('[]');
  });

  it('tells the user when saving fails instead of showing Saved', async () => {
    fs.writeBytes = async () => { throw new Error('disk full'); };
    edit(nameInputs()[0], 'Nytt navn');
    await flush();
    expect(/** @type {any} */ (document.getElementById('msg-dlg')).open).toBe(true);
    expect(document.getElementById('msg-text').textContent).toContain('disk full');
    expect(body().querySelector('.assets-status').textContent).not.toBe('Lagret');
  });

  it('forgets the save status when another project is opened', async () => {
    edit(nameInputs()[0], 'Nytt navn');
    await flush();
    expect(body().querySelector('.assets-status')?.textContent).toBe('Lagret');
    const other = createMemoryFs();
    await createProject(other, { name: 'Y', codespace: 'ABC' });
    await openFs(other);
    setPage('assets');
    expect(body().querySelector('.assets-status')).toBe(null);
  });
});
