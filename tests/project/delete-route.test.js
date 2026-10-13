import { describe, it, expect } from 'vitest';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { deleteRoute } from '../../src/project/routes.js';

describe('deleteRoute', () => {
  it('backs the route up, then removes it', async () => {
    const fs = createMemoryFs({ 'data/routes/10.txt': 'route ten' });
    await deleteRoute(fs, '10', { now: new Date(2026, 9, 13, 12, 0, 0) });
    expect(fs.paths()).toEqual(['data/backups/10.2026-10-13T120000.deleted.txt']);
    expect(await readText(fs, 'data/backups/10.2026-10-13T120000.deleted.txt')).toBe('route ten');
  });

  it('does nothing for a route that is already gone', async () => {
    const fs = createMemoryFs();
    await deleteRoute(fs, '10');
    expect(fs.paths()).toEqual([]);
  });
});
