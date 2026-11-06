// Writes the NeTEx export of the made-up sample project (tests/fixtures/sample-project.js) to a folder, with a fixed
// timestamp. Run it on the commit you branched from and on your branch, then compare the two folders with `diff -r`:
// the normal export must not change unless the work is about the export.
//
//   node <path to this file> <output folder>      (run from the repo root)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = process.argv[2];
if (!out) { console.log('usage: node <path to export-snapshot.mjs> <output folder>   (run from the repo root)'); process.exit(2); }

/** @param {string} path a file under the repo root */
const load = (path) => import(pathToFileURL(resolve(path)).href);
const { sample, calendars, TIMESTAMP } = await load('tests/fixtures/sample-project.js');
const { parseERN } = await load('src/core/ern/parse.js');
const { buildNeTExFiles } = await load('src/core/netex/export.js');

const files = buildNeTExFiles({
  codespace: 'TST', deliveryName: 'Testprosjekt', orgs: [], calendars, timestamp: TIMESTAMP,
  routes: sample.routes.map(({ code, text }) => ({ code, rs: parseERN(text) })),
});
mkdirSync(resolve(out), { recursive: true });
for (const f of files) writeFileSync(join(resolve(out), f.name), f.xml, 'utf8');
console.log(`${files.length} files written to ${resolve(out)}`);
