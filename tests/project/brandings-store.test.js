import { describe, it, expect } from 'vitest';
import { createMemoryFs } from '../../src/project/fs.js';
import { readBrandings, writeBrandings, newBranding } from '../../src/project/brandings-store.js';

describe('brandings', () => {
  it('round-trips, treats a missing file as empty and reports a damaged one', async () => {
    const fs = createMemoryFs();
    expect(await readBrandings(fs)).toEqual({ brandings: [], error: null });
    const b = { ...newBranding('TST'), name: 'Sørlandsekspressen' };
    expect(b.id).toMatch(/^TST:Branding:[0-9a-f-]{36}$/);
    await writeBrandings(fs, [b]);
    expect(await readBrandings(fs)).toEqual({ brandings: [b], error: null });
    expect((await readBrandings(createMemoryFs({ 'data/brandings.json': '[{"name":1}]' }))).error).toBe('unreadable');
  });
});
