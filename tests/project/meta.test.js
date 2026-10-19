import { describe, it, expect } from 'vitest';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { writeProjectName, orgExportMode, writeOrgExportMode, writeSpeedLimits } from '../../src/project/meta.js';

describe('writeProjectName', () => {
  it('changes only the name and keeps every other key', async () => {
    const fs = createMemoryFs();
    const meta = { formatVersion: 1, name: 'Old', codespace: 'ABC', futureKey: 7 };
    const updated = await writeProjectName(fs, meta, '  Kystruter  ');
    expect(updated).toEqual({ formatVersion: 1, name: 'Kystruter', codespace: 'ABC', futureKey: 7 });
    expect(JSON.parse(await readText(fs, 'data/nepos-project.json'))).toEqual(updated);
  });
});

describe('organisation export mode', () => {
  it('defaults to codespace and stores the choice in the project file, keeping other keys', async () => {
    const fs = createMemoryFs();
    const meta = { formatVersion: 1, name: 'X', codespace: 'TST', extra: 1 };
    expect(orgExportMode(meta)).toBe('codespace');
    const updated = await writeOrgExportMode(fs, meta, 'nog');
    expect(orgExportMode(updated)).toBe('nog');
    expect(JSON.parse(await readText(fs, 'data/nepos-project.json'))).toEqual({ ...meta, orgExportMode: 'nog' });
    expect(orgExportMode({ ...meta, orgExportMode: 'weird' })).toBe('codespace');
  });
});

describe('speed limits (customer 2026-10-19)', () => {
  it('stores only the levels that differ from the defaults, keeping other keys', async () => {
    const fs = createMemoryFs();
    const meta = { formatVersion: 1, name: 'X', codespace: 'TST', extra: 1 };
    const updated = await writeSpeedLimits(fs, meta, { bus: 120, tram: 60, coach: NaN, metro: 0 });
    expect(updated.speedLimits).toEqual({ bus: 120 });
    expect(JSON.parse(await readText(fs, 'data/nepos-project.json'))).toEqual({ ...meta, speedLimits: { bus: 120 } });
    const cleared = await writeSpeedLimits(fs, updated, {});
    expect('speedLimits' in cleared).toBe(false);
  });
});
