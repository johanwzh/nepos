// Project upgrades (backlog 29): every frozen project in tests/fixtures/projects/ (one folder per project format, as that
// Nepos version wrote it; see its README) still opens in this version, loses nothing, and its old line files can be
// updated. A user may skip versions, so every folder must keep passing. A change that breaks an old project fails here.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createHandleFs } from '../../src/project/fs.js';
import { FakeDir } from './fake-handle.js';
import { openProject, updateOutdatedRoutes } from '../../src/project/open.js';
import { CURRENT_FORMAT_VERSION } from '../../src/project/format.js';
import { readOrgs, writeOrgs } from '../../src/project/orgs-store.js';
import { readBrandings, writeBrandings } from '../../src/project/brandings-store.js';
import { readLabels, writeLabels } from '../../src/project/labels-store.js';
import { readVehicles, writeVehicles } from '../../src/project/vehicles-store.js';
import { readCalendars, writeCalendars } from '../../src/project/calendars-store.js';
import { readExports, writeExports } from '../../src/project/exports-store.js';
import { readAllLinks, writeLineLinks } from '../../src/project/links-store.js';
import { readRoute } from '../../src/project/routes.js';
import { checkRouteFile } from '../../src/core/integrity/check.js';
import { findLostRecords } from '../../src/core/integrity/roundtrip.js';
import { parseERN } from '../../src/core/ern/parse.js';
import { decodeWin1252 } from '../../src/core/ern/win1252.js';

const FIXTURES = path.join('tests', 'fixtures', 'projects');
const folders = readdirSync(FIXTURES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const dec = new TextDecoder();

/** Every file under a folder, by '/'-separated path relative to it. @param {string} dir @param {string} [prefix] @returns {Map<string, Uint8Array>} */
function filesOf(dir, prefix = '') {
  /** @type {Map<string, Uint8Array>} */
  const out = new Map();
  for (const e of readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) for (const [k, v] of filesOf(dir, rel)) out.set(k, v);
    else out.set(rel, new Uint8Array(readFileSync(path.join(dir, rel))));
  }
  return out;
}

/** A fixture loaded into the fake file system the project code runs on in the tests. @param {string} folder */
async function load(folder) {
  const files = filesOf(path.join(FIXTURES, folder));
  const fs = createHandleFs(new FakeDir(folder));
  for (const [rel, bytes] of files) await fs.writeBytes(rel, bytes);
  /** @param {string} rel */
  const json = (rel) => (files.has(rel) ? JSON.parse(dec.decode(files.get(rel))) : null);
  return { fs, files, json, formatVersion: json('data/nepos-project.json').formatVersion };
}

/** @param {import('../../src/project/open.js').OpenFailure | import('../../src/project/open.js').OpenSuccess} opened */
function mustOpen(opened) {
  if (!opened.ok) throw new Error(`the project did not open: ${/** @type {any} */ (opened).reason}`);
  return opened;
}

/** [id, name] of each item, for comparing a store's items with what the file holds. @param {any[]} list */
const idName = (list) => list.map((x) => [x.id ?? x.organisationId, x.name]);

describe('the frozen test projects', () => {
  it('there is at least one, and each says its format in the project file', async () => {
    expect(folders.length).toBeGreaterThan(0);
    for (const folder of folders) expect((await load(folder)).formatVersion).toBeGreaterThanOrEqual(1);
  });

  for (const folder of folders) {
    describe(folder, () => {
      it('opens in this version: format current, no file damaged or unreadable', async () => {
        const { fs, formatVersion } = await load(folder);
        const o = mustOpen(await openProject(fs));
        expect(o.meta.formatVersion).toBe(CURRENT_FORMAT_VERSION);
        expect(o.migrated).toBe(formatVersion < CURRENT_FORMAT_VERSION);
        expect([o.orgsError, o.brandingsError, o.labelsError, o.vehiclesError, o.calendarsError]).toEqual([null, null, null, null, null]);
        expect(o.summary.damaged).toBe(0);
      });

      it('writes nothing when it opens a project of the current format; an older one is backed up first', async () => {
        const { fs, files, formatVersion } = await load(folder);
        mustOpen(await openProject(fs));
        const after = new Map();
        for (const rel of files.keys()) after.set(rel, await fs.readBytes(rel));
        if (formatVersion === CURRENT_FORMAT_VERSION) {
          for (const [rel, bytes] of files) expect(after.get(rel), rel).toEqual(bytes);
          expect(await fs.list('data/backups')).toEqual([]);
        } else {
          const backup = (await fs.list('data/backups')).find((e) => e.kind === 'directory' && e.name.startsWith(`format-${formatVersion}-`));
          expect(backup, 'a backup of data/ before the upgrade').toBeTruthy();
          for (const [rel, bytes] of files) if (rel.startsWith('data/') && rel !== 'data/nepos-project.json') expect(await fs.readBytes(`data/backups/${backup?.name}/${rel.slice('data/'.length)}`), rel).toEqual(bytes);
        }
      });

      it('every store reads back its items with the same ids and names as the files hold', async () => {
        const { fs, files, json } = await load(folder);
        const o = mustOpen(await openProject(fs));
        if (files.has('data/orgs.json')) expect(idName(o.orgs)).toEqual(idName(json('data/orgs.json').companies));
        if (files.has('data/brandings.json')) expect(idName(o.brandings)).toEqual(idName(json('data/brandings.json')));
        if (files.has('data/labels.json')) expect(idName(o.labels)).toEqual(idName(json('data/labels.json')));
        if (files.has('data/vehicles.json')) expect(idName(o.vehicles)).toEqual(idName(json('data/vehicles.json')));
        if (files.has('data/calendars.json')) expect(idName(o.calendars)).toEqual(idName(json('data/calendars.json')));
        if (files.has('data/exports.json')) expect(Object.keys(o.exports)).toEqual(Object.keys(json('data/exports.json').lines));
        const lines = [...files.keys()].filter((k) => /^data\/routes\/[^/]+\.txt$/.test(k)).map((k) => k.slice('data/routes/'.length, -'.txt'.length));
        expect(o.routes.map((r) => r.code).sort()).toEqual(lines.sort());

        const links = await readAllLinks(fs);
        const linkFiles = [...files.keys()].filter((k) => /^data\/links\/[^/]+\.json$/.test(k));
        expect([...links.keys()].sort()).toEqual(linkFiles.map((k) => k.slice('data/links/'.length, -'.json'.length)).sort());
        for (const k of linkFiles) {
          const raw = json(k), got = /** @type {any} */ (links.get(raw.line));
          expect(Object.keys(got.links), k).toEqual(Object.keys(raw.links));
          expect(Object.keys(got.snaps), k).toEqual(Object.keys(raw.snaps));
          expect(Object.keys(got.patterns ?? {}), k).toEqual(Object.keys(raw.patterns ?? {}));
        }
        // a links file that read as unreadable would have been moved to data/backups/
        expect((await fs.list('data/backups')).filter((e) => e.name.endsWith('.broken.json'))).toEqual([]);
      });

      it('saving what was read changes no item (the stores write what they read)', async () => {
        const { fs } = await load(folder);
        const o = mustOpen(await openProject(fs));
        await writeOrgs(fs, o.orgs); expect((await readOrgs(fs)).orgs).toEqual(o.orgs);
        await writeBrandings(fs, o.brandings); expect((await readBrandings(fs)).brandings).toEqual(o.brandings);
        await writeLabels(fs, o.labels); expect((await readLabels(fs)).labels).toEqual(o.labels);
        await writeVehicles(fs, o.vehicles); expect((await readVehicles(fs)).vehicles).toEqual(o.vehicles);
        await writeCalendars(fs, o.calendars); expect((await readCalendars(fs)).calendars).toEqual(o.calendars);
        await writeExports(fs, o.exports); expect(await readExports(fs)).toEqual(o.exports);
        for (const [code, links] of await readAllLinks(fs)) {
          await writeLineLinks(fs, code, links);
          expect((await readAllLinks(fs)).get(code)).toEqual(links);
        }
      });

      it('every line is ok once the outdated ones are updated, and each keeps its meaning', async () => {
        const { fs } = await load(folder);
        const o = mustOpen(await openProject(fs));
        const before = new Map(o.routes.map((r) => [r.code, r]));
        const updated = await updateOutdatedRoutes(fs, o);
        expect(updated.map((r) => r.code).sort()).toEqual(o.routes.filter((r) => r.status === 'outdated').map((r) => r.code).sort());
        for (const r of updated) {
          expect(r.status, `line ${r.code}`).toBe('ok');
          const old = /** @type {any} */ (before.get(r.code));
          expect(parseERN(r.text), `line ${r.code} means the same`).toEqual(parseERN(old.text));
          expect(findLostRecords(r.text), `line ${r.code} loses nothing on save`).toEqual([]);
        }
        const again = mustOpen(await openProject(fs));
        expect(again.summary).toEqual({ ok: o.routes.length, outdated: 0, damaged: 0 });
        expect(await updateOutdatedRoutes(fs, again)).toEqual([]);
        for (const r of o.routes.filter((x) => x.status === 'ok')) expect(await readRoute(fs, r.code), `line ${r.code} was not touched`).toBe(r.text);
      });
    });
  }

  it('every outdated rule of the project check has an old line in some frozen project', async () => {
    // A new rule says "older Nepos wrote this": a frozen project (a new folder, never an edited one) must hold such a line.
    const source = readFileSync(path.join('src', 'core', 'integrity', 'check.js'), 'utf8');
    const rules = [...source.matchAll(/\boutdated\('([a-z-]+)'/g)].map((m) => m[1]);
    expect(rules.length).toBeGreaterThan(5);
    /** @type {Set<string>} */
    const met = new Set();
    for (const folder of folders) {
      const { files } = await load(folder);
      for (const [rel, bytes] of files) {
        if (/^data\/routes\/[^/]+\.txt$/.test(rel)) for (const i of checkRouteFile(decodeWin1252(bytes)).issues) if (i.severity === 'outdated') met.add(i.code);
      }
    }
    expect(rules.filter((r) => !met.has(r))).toEqual([]);
  });
});

describe('format-1: a project as Nepos 2.6 saves it', () => {
  it('has lines 10 and 20 as 2.6 saves them, 30 in every older convention and 31 without #LEV', async () => {
    const { fs } = await load('format-1');
    const o = mustOpen(await openProject(fs));
    expect(o.routes.map((r) => [r.code, r.status])).toEqual([['10', 'ok'], ['20', 'ok'], ['30', 'outdated'], ['31', 'outdated']]);
    expect(o.summary).toEqual({ ok: 2, outdated: 2, damaged: 0 });
    expect(o.routes[3].issues.map((i) => i.code)).toEqual(['missing-lev']);
    expect(o.meta).toMatchObject({ name: 'Fixture format 1', codespace: 'TST', orgExportMode: 'codespace', speedLimits: { bus: 70 } });
  });

  it('a vehicle saved before backlog 70 with the mode "ferry" is read as "water"; one saved before vehicles had data is filled in', async () => {
    const { fs } = await load('format-1');
    const o = mustOpen(await openProject(fs));
    expect(o.vehicles.map((v) => v.transportMode)).toEqual(['bus', 'water', '']);
    expect(o.vehicles[2]).toMatchObject({ name: 'Gammel buss', shortCode: '', seats: null, vehicleTypeRef: '' });
  });

  it('updating line 30 rewrites its old conventions: LEV without personal data, notes as #FOT, new row layout', async () => {
    const { fs } = await load('format-1');
    const o = mustOpen(await openProject(fs));
    await updateOutdatedRoutes(fs, o);
    const text = /** @type {string} */ (await readRoute(fs, '30'));
    expect(text.startsWith('#LEV;Fixture format 1;TST\r\n')).toBe(true);
    expect(text).not.toMatch(/creator@example\.invalid|#KOM|#KON|#KOE|#KOT|#MOD|#BRA|#CUR/);
    expect(text).toContain('#FOT;-1;-1;Korrespondanse med buss i Nyeby.;nob');
    expect(text).not.toContain(';34;');
    expect(checkRouteFile(text)).toEqual({ status: 'ok', issues: [] });
    expect(await readRoute(fs, '31')).toMatch(/^#LEV;Fixture format 1;TST\r\n#RUT;-1;31;/);
    // every line that was rewritten has a backup of the old file
    expect((await fs.list('data/backups')).map((e) => e.name).sort().map((n) => n.slice(0, 2))).toEqual(['30', '31']);
  });
});
