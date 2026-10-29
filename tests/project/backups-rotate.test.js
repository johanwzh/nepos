// The save backups rotate (user 2026-10-24, backlog 33 part 1): the 10 newest per line (and of the shapes) are kept.
// Backups of a deleted line, format upgrades and repairs are never removed.
import { describe, it, expect } from 'vitest';
import { createMemoryFs } from '../../src/project/fs.js';
import { BACKUP_KEEP, pruneBackups } from '../../src/project/layout.js';
import { writeRoute } from '../../src/project/routes.js';

/** Twelve backups of a line, one a minute: …T100000 to …T101100. @param {Record<string, string>} files @param {string} name @param {string} ext */
const twelve = (files, name, ext) => { for (let i = 0; i < 12; i++) files[`data/backups/${name}2026-10-24T10${String(i).padStart(2, '0')}00${ext}`] = 'x'; };
const backups = (/** @type {any} */ fs) => fs.paths().filter((/** @type {string} */ p) => p.startsWith('data/backups/'));

describe('rotating the save backups', () => {
  it('a write with backup: false makes no backup (the list switches, 2.5)', async () => {
    const fs = createMemoryFs({ 'data/routes/5.txt': '#LEV;A;B' });
    await writeRoute(fs, '5', '#LEV;A;C', { backup: false });
    expect(backups(fs)).toEqual([]);
  });

  it('keeps the 10 newest backups of a line after a save', async () => {
    /** @type {Record<string, string>} */
    const files = { 'data/routes/100.txt': '#LEV;A;B' };
    twelve(files, '100.', '.txt');
    files['data/backups/100.2026-10-24T090000.deleted.txt'] = 'x';
    twelve(files, '1000.', '.txt');
    files['data/backups/format-2.0-2026-01-01T000000/data/routes/100.txt'] = 'x';
    const fs = createMemoryFs(files);
    await writeRoute(fs, '100', '#LEV;A;C', { now: new Date(2026, 9, 24, 12, 0, 0) });
    const mine = backups(fs).filter((/** @type {string} */ p) => /^data\/backups\/100\.2026[^/]*\.txt$/.test(p) && !p.includes('.deleted'));
    expect(BACKUP_KEEP).toBe(10);
    expect(mine).toHaveLength(10);
    expect(mine).not.toContain('data/backups/100.2026-10-24T100000.txt'); // the oldest went
    expect(mine).not.toContain('data/backups/100.2026-10-24T100100.txt');
    expect(mine).not.toContain('data/backups/100.2026-10-24T100200.txt');
    expect(mine).toContain('data/backups/100.2026-10-24T120000.txt'); // the new one stays
    expect(backups(fs)).toContain('data/backups/100.2026-10-24T090000.deleted.txt');
    expect(backups(fs).filter((/** @type {string} */ p) => p.startsWith('data/backups/1000.'))).toHaveLength(12);
    expect(backups(fs)).toContain('data/backups/format-2.0-2026-01-01T000000/data/routes/100.txt');
  });

  it('counts a same-second copy (-2) as newer', async () => {
    /** @type {Record<string, string>} */
    const files = {};
    twelve(files, '7.', '.txt');
    files['data/backups/7.2026-10-24T101100-2.txt'] = 'x';
    const fs = createMemoryFs(files);
    expect(await pruneBackups(fs, '7')).toBe(3);
    expect(backups(fs)).toContain('data/backups/7.2026-10-24T101100-2.txt');
  });

  it('keeps the 10 newest shapes backups', async () => {
    /** @type {Record<string, string>} */
    const files = {};
    twelve(files, 'shapes-', '.json');
    const fs = createMemoryFs(files);
    expect(await pruneBackups(fs, 'shapes')).toBe(2);
    expect(backups(fs)).toHaveLength(10);
  });
});
