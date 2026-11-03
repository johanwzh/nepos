// The project's JSON files are backed up on save like the lines (user 2026-10-26, backlog 79): calendars, organisations,
// brandings, labels and vehicles. The old file goes to data/backups/<name>.<stamp>.json and the 10 newest are kept.
import { describe, it, expect } from 'vitest';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { BACKUP_KEEP } from '../../src/project/layout.js';
import { createProject } from '../../src/project/create.js';
import { writeCalendars } from '../../src/project/calendars-store.js';
import { writeOrgs } from '../../src/project/orgs-store.js';
import { writeBrandings } from '../../src/project/brandings-store.js';
import { writeLabels } from '../../src/project/labels-store.js';
import { writeVehicles } from '../../src/project/vehicles-store.js';

/** @type {[string, string, (fs: any, value: any, opts?: { now?: Date }) => Promise<void>, (n: number) => any][]} */
const FILES = [
  ['calendars', 'data/calendars.json', writeCalendars, (n) => [{ id: 'c1', name: `Vinter ${n}`, ranges: [] }]],
  ['orgs', 'data/orgs.json', writeOrgs, (n) => [{ name: `Selskap ${n}`, organisationId: 'TST:Authority:1', authority: null, operator: null }]],
  ['brandings', 'data/brandings.json', writeBrandings, (n) => [{ id: 'b1', name: `Merke ${n}`, shortName: '', description: '', url: '', imageUrl: '' }]],
  ['labels', 'data/labels.json', writeLabels, (n) => [{ id: 'l1', name: `Rush ${n}`, colour: '#2e8b57' }]],
  ['vehicles', 'data/vehicles.json', writeVehicles, (n) => [{ id: 'v1', name: `Buss ${n}`, colour: '#2e8b57' }]],
];

const T1 = new Date(2026, 10, 3, 10, 0, 0);
const T2 = new Date(2026, 10, 3, 10, 5, 0);
const backups = (/** @type {any} */ fs) => fs.paths().filter((/** @type {string} */ p) => p.startsWith('data/backups/')).sort();

describe.each(FILES)('%s is backed up on save', (name, path, write, make) => {
  it('makes no backup on the first save, and the next one keeps the version it replaced', async () => {
    const fs = createMemoryFs();
    await write(fs, make(1), { now: T1 });
    expect(backups(fs)).toEqual([]);
    const first = await readText(fs, path);
    await write(fs, make(2), { now: T2 });
    expect(backups(fs)).toEqual([`data/backups/${name}.2026-11-03T100500.json`]);
    expect(await readText(fs, `data/backups/${name}.2026-11-03T100500.json`)).toBe(first);
    expect(await readText(fs, path)).not.toBe(first);
  });

  it('makes no backup when nothing changed', async () => {
    const fs = createMemoryFs();
    await write(fs, make(1), { now: T1 });
    await write(fs, make(1), { now: T2 });
    expect(backups(fs)).toEqual([]);
  });
});

describe.each(FILES)('rotating the backups of %s', (name, path, write, make) => {
  it('keeps the 10 newest after a save', async () => {
    /** @type {Record<string, string>} */
    const files = { [path]: '[{"old":true}]\n' };
    for (let i = 0; i < 12; i++) files[`data/backups/${name}.2026-10-24T10${String(i).padStart(2, '0')}00.json`] = 'x';
    const fs = createMemoryFs(files);
    await write(fs, make(1), { now: new Date(2026, 9, 24, 12, 0, 0) });
    expect(backups(fs)).toHaveLength(10);
    expect(backups(fs)).toContain(`data/backups/${name}.2026-10-24T120000.json`);
    expect(backups(fs)).not.toContain(`data/backups/${name}.2026-10-24T100000.json`);
  });
});

describe('a new project', () => {
  it('makes no backup of the empty files it starts with when they are first saved', async () => {
    const fs = createMemoryFs();
    await createProject(fs, { name: 'Test', codespace: 'TST' });
    await writeCalendars(fs, [{ id: 'c1', name: 'Vinter', ranges: [] }], { now: T1 });
    await writeOrgs(fs, /** @type {any} */ ([{ name: 'Selskap', organisationId: 'TST:Authority:1', authority: null, operator: null }]), { now: T1 });
    await writeBrandings(fs, [{ id: 'b1', name: 'Merke', shortName: '', description: '', url: '', imageUrl: '' }], { now: T1 });
    expect(backups(fs)).toEqual([]);
  });

  it('does back up a list the user emptied', async () => {
    const fs = createMemoryFs();
    await writeCalendars(fs, [{ id: 'c1', name: 'Vinter', ranges: [] }], { now: T1 });
    await writeCalendars(fs, [], { now: T2 });
    expect(backups(fs)).toEqual(['data/backups/calendars.2026-11-03T100500.json']);
  });
});

describe('rotating the project file backups', () => {
  /** Twelve backups, one a minute: …T100000 to …T101100. @param {Record<string, string>} files @param {string} name @param {string} ext */
  const twelve = (files, name, ext) => { for (let i = 0; i < 12; i++) files[`data/backups/${name}.2026-10-24T10${String(i).padStart(2, '0')}00${ext}`] = 'x'; };

  it('keeps the 10 newest of one file and leaves every other backup alone', async () => {
    /** @type {Record<string, string>} */
    const files = { 'data/calendars.json': '[{ "id": "c0", "name": "Gammel", "ranges": [] }]\n' };
    twelve(files, 'calendars', '.json');
    twelve(files, 'orgs', '.json'); // another project file
    twelve(files, 'calendars', '.txt'); // a line coded "calendars"
    twelve(files, 'links-calendars', '.json'); // that line's routed links
    files['data/backups/format-1-2026-10-01T000000/data/calendars.json'] = 'x';
    const fs = createMemoryFs(files);
    await writeCalendars(fs, [{ id: 'c1', name: 'Ny', ranges: [] }], { now: new Date(2026, 9, 24, 12, 0, 0) });
    const mine = backups(fs).filter((/** @type {string} */ p) => /^data\/backups\/calendars\.[^/]*\.json$/.test(p));
    expect(BACKUP_KEEP).toBe(10);
    expect(mine).toHaveLength(10);
    expect(mine).not.toContain('data/backups/calendars.2026-10-24T100000.json'); // the oldest went
    expect(mine).not.toContain('data/backups/calendars.2026-10-24T100200.json');
    expect(mine).toContain('data/backups/calendars.2026-10-24T120000.json'); // the new one stays
    for (const other of ['orgs.', 'calendars.', 'links-calendars.']) {
      const ext = other === 'orgs.' || other === 'links-calendars.' ? '.json' : '.txt';
      expect(backups(fs).filter((/** @type {string} */ p) => p.startsWith(`data/backups/${other}`) && p.endsWith(ext))).toHaveLength(12);
    }
    expect(backups(fs)).toContain('data/backups/format-1-2026-10-01T000000/data/calendars.json');
  });

  it('gives a second save in the same second its own copy (-2)', async () => {
    const fs = createMemoryFs();
    await writeLabels(fs, [{ id: 'l1', name: 'A', colour: '#2e8b57' }], { now: T1 });
    await writeLabels(fs, [{ id: 'l1', name: 'B', colour: '#2e8b57' }], { now: T2 });
    await writeLabels(fs, [{ id: 'l1', name: 'C', colour: '#2e8b57' }], { now: T2 });
    expect(backups(fs)).toEqual(['data/backups/labels.2026-11-03T100500-2.json', 'data/backups/labels.2026-11-03T100500.json']);
    expect(JSON.parse(await readText(fs, 'data/backups/labels.2026-11-03T100500.json'))[0].name).toBe('A');
    expect(JSON.parse(await readText(fs, 'data/backups/labels.2026-11-03T100500-2.json'))[0].name).toBe('B');
  });
});
