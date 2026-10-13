import { describe, it, expect } from 'vitest';
import { createMemoryFs, createHandleFs, readText } from '../../src/project/fs.js';
import { findFileNameProblems, repairFileNames } from '../../src/project/repair.js';
import { FakeDir } from './fake-handle.js';

const now = new Date(2026, 9, 13, 12, 0, 0);
const enc = (s) => new TextEncoder().encode(s);

describe('findFileNameProblems', () => {
  it('lists problem files with the rename that fixes them', async () => {
    const fs = createMemoryFs({ 'data/routes/10.txt': 'a', 'data/routes/40.TXT': 'b', 'data/routes/Ø-ekspress.txt': 'c', 'data/routes/notes.md': 'd' });
    expect(await findFileNameProblems(fs)).toEqual([
      { fileName: '40.TXT', problem: 'extension-case', rename: '40.txt' },
      { fileName: 'Ø-ekspress.txt', problem: 'invalid-code', rename: 'O-ekspress.txt' },
    ]);
  });

  it('offers no rename when the target name is already taken', async () => {
    const fs = createMemoryFs({ 'data/routes/10.txt': 'mine', 'data/routes/10.TXT': 'other' });
    expect(await findFileNameProblems(fs)).toEqual([{ fileName: '10.TXT', problem: 'extension-case', rename: null }]);
  });

  it('finds nothing in a clean project or without a routes folder', async () => {
    expect(await findFileNameProblems(createMemoryFs({ 'data/routes/10.txt': 'a' }))).toEqual([]);
    expect(await findFileNameProblems(createMemoryFs())).toEqual([]);
  });
});

describe('repairFileNames', () => {
  it('renames, backs up the original, and leaves no temporary file', async () => {
    const fs = createMemoryFs({ 'data/routes/40.TXT': 'route 40' });
    const done = await repairFileNames(fs, await findFileNameProblems(fs), { now });
    expect(done).toEqual([{ from: '40.TXT', to: '40.txt' }]);
    expect(fs.paths()).toEqual(['data/backups/40.TXT.2026-10-13T120000', 'data/routes/40.txt']);
    expect(await readText(fs, 'data/routes/40.txt')).toBe('route 40');
  });

  it('keeps the content when only the case changes on a case-insensitive file system', async () => {
    const root = new FakeDir('', { caseInsensitive: true });
    const fs = createHandleFs(root);
    await fs.writeBytes('data/routes/40.TXT', enc('route 40'));
    const done = await repairFileNames(fs, await findFileNameProblems(fs), { now });
    expect(done).toEqual([{ from: '40.TXT', to: '40.txt' }]);
    expect(await readText(fs, 'data/routes/40.txt')).toBe('route 40');
    expect((await fs.list('data/routes')).map((e) => e.name)).toEqual(['40.txt']);
  });

  it('skips problems without a rename and never overwrites another file', async () => {
    const fs = createMemoryFs({ 'data/routes/10.txt': 'mine', 'data/routes/10.TXT': 'other' });
    expect(await repairFileNames(fs, await findFileNameProblems(fs), { now })).toEqual([]);
    expect(await readText(fs, 'data/routes/10.txt')).toBe('mine');
    expect(await readText(fs, 'data/routes/10.TXT')).toBe('other');
  });

  it('skips a rename whose target appeared after the check', async () => {
    const fs = createMemoryFs({ 'data/routes/40.TXT': 'b' });
    const problems = await findFileNameProblems(fs);
    await fs.writeBytes('data/routes/40.txt', enc('new'));
    expect(await repairFileNames(fs, problems, { now })).toEqual([]);
    expect(await readText(fs, 'data/routes/40.txt')).toBe('new');
  });
});
