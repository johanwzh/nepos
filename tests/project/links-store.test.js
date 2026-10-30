import { describe, it, expect } from 'vitest';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { emptyLineLinks, readLineLinks, writeLineLinks, deleteLineLinks, renameLineLinks, readAllLinks } from '../../src/project/links-store.js';
import { deleteRoute } from '../../src/project/routes.js';
import { findFileNameProblems, repairFileNames } from '../../src/project/repair.js';

const now = new Date(2026, 9, 31, 12, 0, 0);
/** @returns {any} */
const link = (m) => ({
  polyline: '_p~iF~ps|U', precision: 5, distanceM: m, status: 'OK', from: [10, 59], to: [10.1, 59.1], ferryM: 0, seconds: 60,
  via: [], roads: ['Rv 111'], flags: [], routedAt: '2026-10-31T12:00:00Z',
  tiles: { set: 'road', built: '2026-10-30T00:00:00Z', dataDate: '2026-10-29T21:21:26Z', hashes: { '43_479': 'abcdefabcdef' } },
});
const snap = { way: 7, lon: 10, lat: 59, along: true, off: 3, road: 'Rv 111' };

describe('links store', () => {
  it('starts empty for a line without a file', async () => {
    const fs = createMemoryFs();
    expect(await readLineLinks(fs, 'L1')).toEqual(emptyLineLinks('L1'));
    expect(emptyLineLinks('L1')).toEqual({ version: 1, line: 'L1', links: {}, snaps: {} });
  });

  it('writes keys sorted and reads them back', async () => {
    const fs = createMemoryFs();
    /** @type {any} */
    const data = { version: 1, line: 'L1', links: { 'NSR:Quay:2|NSR:Quay:1|bus': link(20), 'NSR:Quay:1|NSR:Quay:2|bus': link(10) },
      snaps: { 'NSR:Quay:2': snap, 'NSR:Quay:1': snap } };
    await writeLineLinks(fs, 'L1', data, { now });
    const text = await readText(fs, 'data/links/L1.json');
    expect(text.indexOf('NSR:Quay:1|NSR:Quay:2|bus')).toBeLessThan(text.indexOf('NSR:Quay:2|NSR:Quay:1|bus'));
    expect(Object.keys(JSON.parse(text).snaps)).toEqual(['NSR:Quay:1', 'NSR:Quay:2']);
    expect(await readLineLinks(fs, 'L1')).toEqual(data);
  });

  it('backs up the previous file on the second write', async () => {
    const fs = createMemoryFs();
    await writeLineLinks(fs, 'L1', emptyLineLinks('L1'), { now });
    expect(fs.paths()).toEqual(['data/links/L1.json']);
    await writeLineLinks(fs, 'L1', { ...emptyLineLinks('L1'), links: { 'a|b|bus': link(5) } }, { now });
    expect(fs.paths()).toEqual(['data/backups/links-L1.2026-10-31T120000.json', 'data/links/L1.json']);
    expect(JSON.parse(await readText(fs, 'data/backups/links-L1.2026-10-31T120000.json')).links).toEqual({});
  });

  it('moves an unreadable file to the backups and starts empty', async () => {
    const fs = createMemoryFs({ 'data/links/L1.json': '{ not json' });
    expect(await readLineLinks(fs, 'L1', { now })).toEqual(emptyLineLinks('L1'));
    expect(fs.paths()).toEqual(['data/backups/links-L1.2026-10-31T120000.broken.json']);
    expect(await readText(fs, 'data/backups/links-L1.2026-10-31T120000.broken.json')).toBe('{ not json');
  });

  it('treats a file of the wrong shape as unreadable', async () => {
    const fs = createMemoryFs({ 'data/links/L1.json': '{"version":1,"links":[]}' });
    expect(await readLineLinks(fs, 'L1', { now })).toEqual(emptyLineLinks('L1'));
    expect(fs.paths()).toEqual(['data/backups/links-L1.2026-10-31T120000.broken.json']);
  });

  it('deletes with a backup, and renames', async () => {
    const fs = createMemoryFs({ 'data/links/L1.json': JSON.stringify(emptyLineLinks('L1')) });
    await renameLineLinks(fs, 'L1', 'L2');
    expect(fs.paths()).toEqual(['data/links/L2.json']);
    expect((await readLineLinks(fs, 'L2')).line).toBe('L2');
    await deleteLineLinks(fs, 'L2', { now });
    expect(fs.paths()).toEqual(['data/backups/links-L2.2026-10-31T120000.deleted.json']);
    await deleteLineLinks(fs, 'L2', { now });
    await renameLineLinks(fs, 'L9', 'L8');
    expect(fs.paths()).toEqual(['data/backups/links-L2.2026-10-31T120000.deleted.json']);
  });

  it('reads every line in the links folder', async () => {
    const fs = createMemoryFs({
      'data/links/L1.json': JSON.stringify(emptyLineLinks('L1')),
      'data/links/L2.json': JSON.stringify({ ...emptyLineLinks('L2'), links: { 'a|b|bus': link(5) } }),
      'data/links/notes.txt': 'x',
    });
    const all = await readAllLinks(fs);
    expect([...all.keys()]).toEqual(['L1', 'L2']);
    expect(all.get('L2')?.links['a|b|bus'].distanceM).toBe(5);
    expect(await readAllLinks(createMemoryFs())).toEqual(new Map());
  });

  it('keeps the 10 newest backups of a line', async () => {
    const fs = createMemoryFs();
    for (let s = 0; s < 12; s++) await writeLineLinks(fs, 'L1', emptyLineLinks('L1'), { now: new Date(2026, 9, 31, 12, 0, s) });
    expect(fs.paths().filter((p) => p.startsWith('data/backups/')).length).toBe(10);
  });
});

describe('a line\'s links follow the line file', () => {
  it('deleteRoute also deletes the links file, with a backup', async () => {
    const fs = createMemoryFs({ 'data/routes/L1.txt': 'route', 'data/links/L1.json': JSON.stringify(emptyLineLinks('L1')) });
    await deleteRoute(fs, 'L1', { now });
    expect(fs.paths()).toEqual(['data/backups/L1.2026-10-31T120000.deleted.txt', 'data/backups/links-L1.2026-10-31T120000.deleted.json']);
  });

  it('repairFileNames renames the links file with its line', async () => {
    const fs = createMemoryFs({ 'data/routes/Ø-ekspress.txt': 'route', 'data/links/Ø-ekspress.json': JSON.stringify(emptyLineLinks('Ø-ekspress')) });
    await repairFileNames(fs, await findFileNameProblems(fs), { now });
    expect(fs.paths()).toContain('data/links/O-ekspress.json');
    expect(fs.paths()).not.toContain('data/links/Ø-ekspress.json');
    expect((await readLineLinks(fs, 'O-ekspress')).line).toBe('O-ekspress');
  });
});
