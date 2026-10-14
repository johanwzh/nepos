import { describe, it, expect } from 'vitest';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { createProject } from '../../src/project/create.js';
import { writeRoute, readRoute } from '../../src/project/routes.js';
import { openProject, updateOutdatedRoutes } from '../../src/project/open.js';
import { sample } from '../fixtures/sample-project.js';
import { parseERN } from '../../src/core/ern/parse.js';
import { serializeERN } from '../../src/core/ern/serialize.js';

const now = new Date(2026, 9, 13, 12, 0, 0);
const nepos2Route = serializeERN(parseERN(sample.routes[1].text), '20', { delivery: { name: 'Test', codespace: 'TST' }, orgs: [] });

async function newProject() {
  const fs = createMemoryFs();
  await createProject(fs, { name: 'Test', codespace: 'TST' });
  return fs;
}

describe('openProject', () => {
  it('opens a project and checks every route', async () => {
    const fs = await newProject();
    await writeRoute(fs, '20', nepos2Route, { now });
    await writeRoute(fs, '10', sample.routes[0].text, { now });
    const opened = await openProject(fs);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.meta).toEqual({ formatVersion: 1, name: 'Test', codespace: 'TST', orgExportMode: 'codespace' });
    expect(opened.routes.map((r) => [r.code, r.status])).toEqual([['10', 'outdated'], ['20', 'ok']]);
    expect(opened.summary).toEqual({ ok: 1, outdated: 1, damaged: 0 });
    expect(opened.migrated).toBe(false);
    expect(opened.orgsError).toBe(null);
  });

  it('says so when the folder is not a Nepos 2 project', async () => {
    expect(await openProject(createMemoryFs({ 'publicationdelivery.json': '{}' }))).toEqual({ ok: false, reason: 'not-nepos-project' });
  });

  it('refuses a broken project file', async () => {
    expect(await openProject(createMemoryFs({ 'data/nepos-project.json': '{nope' }))).toEqual({ ok: false, reason: 'invalid-project-file' });
    expect(await openProject(createMemoryFs({ 'data/nepos-project.json': '{"name":"x"}' }))).toEqual({ ok: false, reason: 'invalid-project-file' });
  });

  it('refuses an invalid codespace', async () => {
    const fs = createMemoryFs({ 'data/nepos-project.json': '{"formatVersion":1,"name":"x","codespace":"1869"}' });
    expect(await openProject(fs)).toEqual({ ok: false, reason: 'invalid-codespace' });
  });

  it('upper-cases a lower-case codespace', async () => {
    const fs = createMemoryFs({ 'data/nepos-project.json': '{"formatVersion":1,"name":"x","codespace":"abc"}' });
    const opened = await openProject(fs);
    expect(opened.ok && opened.meta.codespace).toBe('ABC');
  });

  it('refuses a project from a newer Nepos without writing anything', async () => {
    const fs = createMemoryFs({ 'data/nepos-project.json': '{"formatVersion":99,"name":"x","codespace":"ABC"}' });
    expect(await openProject(fs, { now })).toEqual({ ok: false, reason: 'newer-format', formatVersion: 99 });
    expect(fs.paths()).toEqual(['data/nepos-project.json']);
  });

  it('reports an unreadable organisations file', async () => {
    const fs = await newProject();
    await fs.writeBytes('data/orgs.json', new TextEncoder().encode('[{'));
    const opened = await openProject(fs);
    expect(opened.ok && opened.orgsError).toBe('unreadable');
  });
});

describe('updateOutdatedRoutes', () => {
  it('rewrites outdated routes in the Nepos 2 format, with a backup', async () => {
    const fs = await newProject();
    await writeRoute(fs, '10', sample.routes[0].text, { now });
    const opened = await openProject(fs);
    if (!opened.ok) throw new Error('should open');
    const updated = await updateOutdatedRoutes(fs, opened, { now });
    expect(updated.map((r) => [r.code, r.status])).toEqual([['10', 'ok']]);
    const text = await readRoute(fs, '10');
    expect(text.startsWith('#LEV;Test;TST\r\n')).toBe(true);
    expect(text).not.toContain('creator@example.invalid');
    const backups = (await fs.list('data/backups')).map((e) => e.name);
    expect(backups).toEqual(['10.2026-10-13T120000.txt']);
    expect(await readText(fs, 'data/backups/10.2026-10-13T120000.txt')).toContain('creator@example.invalid');
  });

  it('never touches a damaged route', async () => {
    const fs = await newProject();
    const damaged = sample.routes[0].text.replace('#TRA;10\r\n', '#TRA;10\r\n#KOS;4;x;0\r\n');
    await writeRoute(fs, '10', damaged, { now });
    const opened = await openProject(fs);
    if (!opened.ok) throw new Error('should open');
    expect(opened.routes[0].status).toBe('damaged');
    expect(await updateOutdatedRoutes(fs, opened, { now })).toEqual([]);
    expect(await readRoute(fs, '10')).toBe(damaged);
  });
});

describe('openProject with odd route files', () => {
  it('does not crash on a route file with an upper-case .TXT extension', async () => {
    const fs = await newProject();
    await writeRoute(fs, '20', nepos2Route, { now });
    await fs.writeBytes('data/routes/12.TXT', new TextEncoder().encode('#RUT;-1;12;x;;1;\r\n'));
    const opened = await openProject(fs);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.routes.map((r) => r.code)).toEqual(['20']);
  });
});
