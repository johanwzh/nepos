// The export probe from the command line (docs/RELEASING.md §4):
//   npm run probe-export -- <export.zip | folder of XML> [project folder] [--routes <folder>]
// The project folder holds nepos-project.json and data/ (or is data/ itself); by default it is found from the zip's
// own place, <project>/exports/<time>/<name>.zip. --routes reads the route files from another folder, e.g. a copy of
// the backups taken when the export was made. Exits 1 when there are errors.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { unzip } from './unzip.js';
import { probeExport } from './checks.js';
import { decodeWin1252 } from '../../src/core/ern/win1252.js';

const args = process.argv.slice(2);
const ri = args.indexOf('--routes');
const routesOverride = ri >= 0 ? args.splice(ri, 2)[1] : undefined;
const [input, projectArg] = args;
if (!input) { console.log('usage: npm run probe-export -- <export.zip | folder> [project folder] [--routes <folder>]'); process.exit(2); }

/** @type {Map<string, string>} */
const files = new Map();
const inputPath = resolve(input);
if (statSync(inputPath).isDirectory()) {
  for (const n of readdirSync(inputPath).filter((f) => f.endsWith('.xml'))) files.set(n, readFileSync(join(inputPath, n), 'utf8'));
} else {
  for (const [n, data] of unzip(readFileSync(inputPath))) if (n.endsWith('.xml')) files.set(n, new TextDecoder().decode(data));
}
const exportedAt = statSync(inputPath).mtimeMs;

// The project: given, or two folders up from the zip's export folder
const guess = resolve(dirname(inputPath), '..', '..');
const projectDir = projectArg ? resolve(projectArg) : existsSync(join(guess, 'data')) || existsSync(join(guess, 'nepos-project.json')) ? guess : undefined;
/** @type {string[]} */
const notes = [];
let project;
if (projectDir) {
  const data = existsSync(join(projectDir, 'data')) ? join(projectDir, 'data') : projectDir;
  const metaPath = [join(data, 'nepos-project.json'), join(projectDir, 'nepos-project.json')].find(existsSync);
  const meta = metaPath ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
  const routesDir = routesOverride ? resolve(routesOverride) : join(data, 'routes');
  const calPath = join(data, 'calendars.json');
  const calendars = existsSync(calPath) ? JSON.parse(readFileSync(calPath, 'utf8')) : [];
  const routes = readdirSync(routesDir).filter((f) => f.endsWith('.txt')).map((f) => {
    // A backup's name is <code>.<time>.txt; a route file's is <code>.txt
    const code = f.replace(/\.txt$/, '').split('.')[0];
    if (!routesOverride && statSync(join(routesDir, f)).mtimeMs > exportedAt) notes.push(`${f} was saved after the export — re-export, or use --routes with the version that was exported`);
    return { code, text: decodeWin1252(readFileSync(join(routesDir, f))) };
  });
  if (existsSync(calPath) && statSync(calPath).mtimeMs > exportedAt) notes.push('calendars.json was saved after the export');
  project = { codespace: meta.codespace, routes, calendars };
  console.log(`Project: ${meta.name ?? projectDir} (${meta.codespace}), ${routes.length} route file(s) from ${routesDir}`);
} else console.log('No project found: only the checks of the XML on its own are run.');

const { errors, warnings, stats } = probeExport({ files, project });
console.log(`Export:  ${basename(inputPath)} — ${stats.files} files`);
console.log(`  ${stats.journeys} journeys (${stats.expected} expected), ${stats.passingTimes} passing times, ${stats.datedJourneys} dated journeys`);
console.log(`  day offsets up to +${stats.maxDayOffset}, ${stats.startAfterMidnight} journeys start after midnight, ${stats.interchanges} interchanges, ${stats.references} references`);
for (const n of notes) console.log(`! ${n}`);
/** @param {string} title @param {string[]} list */
const show = (title, list) => { if (!list.length) return; console.log(`\n${title} (${list.length}):`); for (const l of list.slice(0, 40)) console.log(`  - ${l}`); if (list.length > 40) console.log(`  … and ${list.length - 40} more`); };
show('Warnings', warnings);
show('Errors', errors);
console.log(errors.length ? `\n✗ ${errors.length} error(s)` : '\n✓ No errors');
process.exit(errors.length ? 1 : 0);
