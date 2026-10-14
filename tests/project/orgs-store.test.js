import { describe, it, expect } from 'vitest';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { readOrgs, writeOrgs } from '../../src/project/orgs-store.js';
import { projectCopy } from '../fixtures/orgs.js';

describe('project copy of organisations', () => {
  it('round-trips the companies', async () => {
    const fs = createMemoryFs();
    await writeOrgs(fs, projectCopy());
    expect(JSON.parse(await readText(fs, 'data/orgs.json')).companies).toHaveLength(2);
    expect(await readOrgs(fs)).toEqual({ orgs: projectCopy(), error: null });
  });

  it('treats a missing file as an empty copy', async () => {
    expect(await readOrgs(createMemoryFs())).toEqual({ orgs: [], error: null });
  });

  it('reports bad JSON, the old list format and wrong shapes as unreadable', async () => {
    for (const text of ['[{', '[{"id":"TST:Operator:1","name":"X"}]', '{"companies":[{"name":1}]}', '{"companies":"x"}']) {
      const fs = createMemoryFs({ 'data/orgs.json': text });
      expect((await readOrgs(fs)).error, text).toBe('unreadable');
    }
  });
});
