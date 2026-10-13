import { describe, it, expect } from 'vitest';
import { createMemoryFs } from '../../src/project/fs.js';
import { listRoutes, readRoute, writeRoute } from '../../src/project/routes.js';
import { encodeWin1252, decodeWin1252 } from '../../src/core/ern/win1252.js';

const now = new Date(2026, 9, 13, 12, 0, 0);

describe('route files', () => {
  it('lists route codes, numbers in numeric order', async () => {
    const fs = createMemoryFs({
      'data/routes/9.txt': '', 'data/routes/10.txt': '', 'data/routes/64.txt': '',
      'data/routes/Ø-ekspress.txt': '', 'data/routes/A1.txt': '', 'data/routes/notes.md': '',
    });
    expect(await listRoutes(fs)).toEqual(['9', '10', '64', 'A1', 'Ø-ekspress']);
  });

  it('lists nothing when there is no routes folder', async () => {
    expect(await listRoutes(createMemoryFs())).toEqual([]);
  });

  it('reads Windows-1252 and writes it back the same way', async () => {
    const fs = createMemoryFs({ 'data/routes/10.txt': encodeWin1252('#RUT;-1;10;Florø – Bergen;;6;\r\n') });
    expect(await readRoute(fs, '10')).toBe('#RUT;-1;10;Florø – Bergen;;6;\r\n');
    await writeRoute(fs, '20', 'Æ€', { now });
    expect([...(await fs.readBytes('data/routes/20.txt'))]).toEqual([0xc6, 0x80]);
    expect(await readRoute(fs, 'missing')).toBe(null);
  });

  it('backs up the previous version before overwriting', async () => {
    const fs = createMemoryFs({ 'data/routes/10.txt': encodeWin1252('original') });
    await writeRoute(fs, '10', 'new', { now });
    expect(decodeWin1252(await fs.readBytes('data/backups/10.2026-10-13T120000.txt'))).toBe('original');
    expect(await readRoute(fs, '10')).toBe('new');
  });

  it('does not back up a route that did not exist', async () => {
    const fs = createMemoryFs();
    await writeRoute(fs, '10', 'first', { now });
    expect(fs.paths()).toEqual(['data/routes/10.txt']);
  });

  it('keeps the original when the same route is saved twice in one second', async () => {
    const fs = createMemoryFs({ 'data/routes/10.txt': encodeWin1252('original') });
    await writeRoute(fs, '10', 'second', { now });
    await writeRoute(fs, '10', 'third', { now });
    expect(decodeWin1252(await fs.readBytes('data/backups/10.2026-10-13T120000.txt'))).toBe('original');
    expect(decodeWin1252(await fs.readBytes('data/backups/10.2026-10-13T120000-2.txt'))).toBe('second');
    expect(await readRoute(fs, '10')).toBe('third');
  });
});
