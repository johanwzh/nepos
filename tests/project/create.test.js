import { describe, it, expect } from 'vitest';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';

describe('createProject', () => {
  it('creates the data/ and private/ structure with format version 1', async () => {
    const fs = createMemoryFs();
    const result = await createProject(fs, { name: 'Kystruter', codespace: 'abc' });
    expect(result).toEqual({ ok: true, meta: { formatVersion: 1, name: 'Kystruter', codespace: 'ABC' } });
    expect(JSON.parse(await readText(fs, 'data/nepos-project.json'))).toEqual({ formatVersion: 1, name: 'Kystruter', codespace: 'ABC' });
    expect(JSON.parse(await readText(fs, 'data/orgs.json'))).toEqual([]);
    expect(await fs.list('data')).toEqual([
      { name: 'backups', kind: 'directory' },
      { name: 'nepos-project.json', kind: 'file' },
      { name: 'orgs.json', kind: 'file' },
      { name: 'routes', kind: 'directory' },
    ]);
    expect((await fs.list('private')).map((e) => e.name)).toEqual(['secrets.json', 'settings.json']);
  });

  it('puts no personal data in the project file', async () => {
    const fs = createMemoryFs();
    await createProject(fs, { name: 'X', codespace: 'ABC' });
    expect(Object.keys(JSON.parse(await readText(fs, 'data/nepos-project.json'))).sort()).toEqual(['codespace', 'formatVersion', 'name']);
  });

  it('refuses a bad codespace and writes nothing', async () => {
    const fs = createMemoryFs();
    expect(await createProject(fs, { name: 'X', codespace: '' })).toEqual({ ok: false, error: 'codespace-required' });
    expect(await createProject(fs, { name: 'X', codespace: '1869' })).toEqual({ ok: false, error: 'codespace-format' });
    expect(fs.paths()).toEqual([]);
  });

  it('refuses a folder that already has files, says what it found, and writes nothing', async () => {
    const fs = createMemoryFs({ 'notes.txt': 'mine', 'old/a.txt': 'x' });
    expect(await createProject(fs, { name: 'X', codespace: 'ABC' })).toEqual({ ok: false, error: 'folder-not-empty', found: ['notes.txt', 'old'] });
    expect(fs.paths()).toEqual(['notes.txt', 'old/a.txt']);
  });

  it('treats a folder with only system files as empty', async () => {
    const fs = createMemoryFs({ 'desktop.ini': '', 'Thumbs.db': '', '.DS_Store': '' });
    expect((await createProject(fs, { name: 'X', codespace: 'ABC' })).ok).toBe(true);
  });
});
