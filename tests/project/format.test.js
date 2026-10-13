import { describe, it, expect } from 'vitest';
import { createMemoryFs, readText, writeText } from '../../src/project/fs.js';
import { checkFormatVersion, migrateProject, CURRENT_FORMAT_VERSION } from '../../src/project/format.js';

describe('checkFormatVersion', () => {
  it('classifies versions against the current one', () => {
    expect(CURRENT_FORMAT_VERSION).toBe(1);
    expect(checkFormatVersion({ formatVersion: 1 })).toBe('current');
    expect(checkFormatVersion({ formatVersion: 2 })).toBe('newer');
    expect(checkFormatVersion({ formatVersion: 1 }, 3)).toBe('older');
  });

  it('treats a missing or nonsense version as invalid', () => {
    for (const meta of [{}, { formatVersion: '1' }, { formatVersion: 0 }, { formatVersion: 1.5 }, null]) {
      expect(checkFormatVersion(meta)).toBe('invalid');
    }
  });
});

describe('migrateProject', () => {
  const now = new Date(2026, 9, 13, 12, 0, 0);
  const steps = [
    { from: 1, run: async (fs) => writeText(fs, 'data/step1.txt', 'ran') },
    { from: 2, run: async (fs) => writeText(fs, 'data/step2.txt', 'ran') },
  ];

  it('backs up data/ first, runs each step in order and records the new version', async () => {
    const fs = createMemoryFs({
      'data/nepos-project.json': '{"formatVersion":1,"name":"X","codespace":"ABC"}',
      'data/routes/10.txt': 'route',
      'data/backups/old.txt': 'older backup',
      'private/settings.json': '{}',
    });
    const meta = await migrateProject(fs, { formatVersion: 1, name: 'X', codespace: 'ABC' }, { now, migrations: steps, target: 3 });
    expect(meta).toEqual({ formatVersion: 3, name: 'X', codespace: 'ABC' });
    expect(JSON.parse(await readText(fs, 'data/nepos-project.json')).formatVersion).toBe(3);
    expect(await readText(fs, 'data/step1.txt')).toBe('ran');
    expect(await readText(fs, 'data/step2.txt')).toBe('ran');
    const backup = 'data/backups/format-1-2026-10-13T120000';
    expect(await readText(fs, `${backup}/nepos-project.json`)).toContain('"formatVersion":1');
    expect(await readText(fs, `${backup}/routes/10.txt`)).toBe('route');
    expect(await readText(fs, `${backup}/backups/old.txt`)).toBe(null);
    expect(await readText(fs, `${backup}/step1.txt`)).toBe(null);
  });

  it('stops with an error when a step is missing, leaving the version unchanged', async () => {
    const fs = createMemoryFs({ 'data/nepos-project.json': '{"formatVersion":1}' });
    await expect(migrateProject(fs, { formatVersion: 1 }, { now, migrations: [], target: 2 }))
      .rejects.toThrow('No upgrade step from format version 1');
    expect(JSON.parse(await readText(fs, 'data/nepos-project.json')).formatVersion).toBe(1);
  });
});
