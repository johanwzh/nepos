import { describe, it, expect } from 'vitest';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { readLabels, writeLabels, newLabel } from '../../src/project/labels-store.js';
import { createProject } from '../../src/project/create.js';
import { openProject } from '../../src/project/open.js';

describe('labels (62)', () => {
  it('writes and reads data/labels.json', async () => {
    const fs = createMemoryFs();
    const l = { ...newLabel(), name: 'Rush', colour: '#c0392b' };
    await writeLabels(fs, [l]);
    expect(JSON.parse(/** @type {string} */ (await readText(fs, 'data/labels.json')))).toEqual([l]);
    expect(await readLabels(fs)).toEqual({ labels: [l], error: null });
  });

  it('a project without the file has no labels; a broken file is unreadable', async () => {
    const fs = createMemoryFs();
    expect(await readLabels(fs)).toEqual({ labels: [], error: null });
    await fs.writeBytes('data/labels.json', new TextEncoder().encode('{nope'));
    expect((await readLabels(fs)).error).toBe('unreadable');
  });

  it('a new label has an ID and a colour', () => {
    expect(newLabel()).toMatchObject({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), name: '', colour: expect.stringMatching(/^#[0-9a-f]{6}$/) });
  });

  it('comes with the project when it opens', async () => {
    const fs = createMemoryFs();
    await createProject(fs, { name: 'T', codespace: 'TST' });
    await writeLabels(fs, [{ ...newLabel(), name: 'Normal' }]);
    const r = /** @type {any} */ (await openProject(fs));
    expect(r.labels.map((/** @type {any} */ x) => x.name)).toEqual(['Normal']);
    expect(r.labelsError).toBe(null);
  });
});
