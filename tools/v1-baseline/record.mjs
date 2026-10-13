// One-off tool: runs the frozen Nepos 1.5.7 code on the sample project and records its output
// as the parity baseline. Re-running it must produce identical files.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { sample, TIMESTAMP } from '../../tests/fixtures/sample-project.js';

const V1_SHA256 = 'CAE28137D8CE4892561FFA0E6419852828734B2B6632AEBA6C0ED3668457D0A6';
const V1_HTML = process.env.NEPOS_V1_HTML ?? 'C:/Claude/1869/nepos/nepos.html';

// 1-based inclusive line ranges in the frozen 1.5.7 file.
const RANGES = [
  [1770, 1777], // CURRENCIES
  [1787, 1794], // allCurrencies, getCurrency
  [1912, 1932], // ERN_MODES
  [2709, 2717], // encodeWin1252
  [2720, 3005], // serializeERN, parseERN
  [4718, 4718], // fnByIdInRs
  [5216, 5221], // haversineM
  [5742, 5815], // NeTEx helpers
  [5818, 6040], // collectNeTExData
  [6043, 6483], // genStopsXml, genSharedXml, genLineXml
];

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '../../tests/parity/baseline');

const bytes = readFileSync(V1_HTML);
const sha = createHash('sha256').update(bytes).digest('hex').toUpperCase();
if (sha !== V1_SHA256) {
  throw new Error(`${V1_HTML} is not the frozen Nepos 1.5.7 build (sha256 ${sha})`);
}
const lines = bytes.toString('utf8').split(/\r?\n/);
const code = RANGES.map(([a, b]) => lines.slice(a - 1, b).join('\n')).join('\n');

// 1.5.7 stamps "today" into every NeTEx file; freeze it so baselines are reproducible.
class FixedDate extends Date {
  constructor(...args) {
    // @ts-ignore -- forwarding constructor arguments unchanged
    if (args.length) super(...args);
    else super(`${TIMESTAMP}Z`);
  }
}

const proj = {
  delivery: sample.delivery,
  orgs: sample.orgs,
  stopDb: sample.stopDb,
  vehicles: [],
  routes: sample.routes.map((r) => ({ name: r.code })),
};
const texts = Object.fromEntries(sample.routes.map((r) => [r.code, r.text]));
const context = vm.createContext({ proj, lang: 'en', Date: FixedDate, TextEncoder, __texts: texts });

const tail = `
async function loadRsForValidation(name) { return parseERN(__texts[name]); }
function getRoutePath(a, b) { return { routed: false, coords: [a.coords, b.coords] }; }
({ parseERN, serializeERN, collectNeTExData, genSharedXml, genLineXml });
`;
const v1 = vm.runInContext(`${code}\n${tail}`, context);

mkdirSync(join(outDir, 'netex'), { recursive: true });
for (const r of sample.routes) {
  writeFileSync(join(outDir, `${r.code}.parsed.json`), JSON.stringify(v1.parseERN(r.text), null, 2) + '\n');
  writeFileSync(join(outDir, `${r.code}.roundtrip.txt`), v1.serializeERN(v1.parseERN(r.text), r.code));
}
const data = await v1.collectNeTExData();
writeFileSync(join(outDir, 'netex', '_shared_data.xml'), v1.genSharedXml(data));
for (const { code: routeCode, rs } of data.routes) {
  writeFileSync(join(outDir, 'netex', `Line-${data.cs}_${routeCode}_timetable.xml`), v1.genLineXml(routeCode, rs, data));
}
console.log(`Baseline written to ${outDir}`);
