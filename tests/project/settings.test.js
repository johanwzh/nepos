import { describe, it, expect } from 'vitest';
import { createMemoryFs, readText, writeJson } from '../../src/project/fs.js';
import { DEFAULT_SETTINGS, readSettings, writeSettings, readSecrets } from '../../src/project/settings.js';
import { readOrgs, writeOrgs } from '../../src/project/orgs-store.js';
import { backupStamp, uniqueBackupPath } from '../../src/project/layout.js';

describe('settings', () => {
  it('gives the defaults when there is no settings file', async () => {
    expect(await readSettings(createMemoryFs())).toEqual({ settings: { ...DEFAULT_SETTINGS }, recovered: false });
  });

  it('fills in missing keys and keeps unknown ones', async () => {
    const fs = createMemoryFs({ 'private/settings.json': '{"lang":"en","futureThing":42}' });
    const { settings } = await readSettings(fs);
    expect(settings.lang).toBe('en');
    expect(settings.theme).toBe('system');
    expect(settings.futureThing).toBe(42);
  });

  it('falls back to defaults for a corrupt file or invalid values, and says so', async () => {
    expect((await readSettings(createMemoryFs({ 'private/settings.json': '{oops' }))).recovered).toBe(true);
    const r = await readSettings(createMemoryFs({ 'private/settings.json': '{"lang":"de","theme":"blue"}' }));
    expect(r.recovered).toBe(true);
    expect(r.settings.lang).toBe('no');
    expect(r.settings.theme).toBe('system');
  });

  it('writes settings to private/settings.json', async () => {
    const fs = createMemoryFs();
    await writeSettings(fs, { ...DEFAULT_SETTINGS, lang: 'en' });
    expect(JSON.parse(await readText(fs, 'private/settings.json')).lang).toBe('en');
  });

  it('gives an empty secrets object when there is none', async () => {
    expect(await readSecrets(createMemoryFs())).toEqual({ secrets: {}, recovered: false });
  });
});

describe('organisations file', () => {
  it('reads a missing file as an empty list', async () => {
    expect(await readOrgs(createMemoryFs())).toEqual({ orgs: [], error: null });
  });

  it('reports an unreadable file instead of pretending it is empty', async () => {
    expect(await readOrgs(createMemoryFs({ 'data/orgs.json': '[{"id":' }))).toEqual({ orgs: [], error: 'unreadable' });
    expect(await readOrgs(createMemoryFs({ 'data/orgs.json': '{"id":"x"}' }))).toEqual({ orgs: [], error: 'unreadable' });
  });

  it('round-trips the list', async () => {
    const fs = createMemoryFs();
    await writeOrgs(fs, [{ id: 'RUT:Authority:1', name: 'Ruter' }]);
    expect(await readOrgs(fs)).toEqual({ orgs: [{ id: 'RUT:Authority:1', name: 'Ruter' }], error: null });
  });
});

describe('backup names', () => {
  it('stamps local time to the second', () => {
    expect(backupStamp(new Date(2026, 9, 13, 9, 5, 7))).toBe('2026-10-13T090507');
  });

  it('never reuses an existing backup name', async () => {
    const fs = createMemoryFs({ 'data/backups/10.x.txt': 'a', 'data/backups/10.x-2.txt': 'b' });
    expect(await uniqueBackupPath(fs, 'data/backups/10.x', '.txt')).toBe('data/backups/10.x-3.txt');
    expect(await uniqueBackupPath(fs, 'data/backups/20.x', '.txt')).toBe('data/backups/20.x.txt');
  });
});

describe('organisations file entries', () => {
  it('reports entries that are not organisations instead of passing them on', async () => {
    for (const bad of ['[null]', '[5]', '[{"name":"x"}]', '[{"id":7,"name":"x"}]', '[{"id":"RUT:Authority:1"}]']) {
      expect(await readOrgs(createMemoryFs({ 'data/orgs.json': bad }))).toEqual({ orgs: [], error: 'unreadable' });
    }
  });
});

describe('exportAsZip setting', () => {
  it('defaults to a ZIP', async () => {
    const { settings, recovered } = await readSettings(createMemoryFs());
    expect(settings.exportAsZip).toBe(true);
    expect(recovered).toBe(false);
  });

  it('keeps a stored choice and resets a value that is not true or false', async () => {
    const fs = createMemoryFs();
    await writeJson(fs, 'private/settings.json', { exportAsZip: false });
    expect((await readSettings(fs)).settings.exportAsZip).toBe(false);
    await writeJson(fs, 'private/settings.json', { exportAsZip: 'yes' });
    const { settings, recovered } = await readSettings(fs);
    expect(settings.exportAsZip).toBe(true);
    expect(recovered).toBe(true);
  });
});
