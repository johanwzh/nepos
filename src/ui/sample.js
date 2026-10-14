// A small in-memory project for checking the screens during development (/?sample). It holds
// one OK route, one outdated (1.x) route, one damaged route and a file whose name needs repair.
// Only loaded when import.meta.env.DEV is true; never part of a production build's behaviour.
import { createMemoryFs } from '../project/fs.js';
import { createProject } from '../project/create.js';
import { writeOrgs } from '../project/orgs-store.js';
import { encodeWin1252 } from '../core/ern/win1252.js';

const crlf = (/** @type {string[]} */ lines) => lines.join('\r\n') + '\r\n';

/**
 * @param {string} code
 * @param {string} name
 * @param {[string, string][]} stops [NSR Quay ID, name]
 */
const route = (code, name, stops) => [
  `#RUT;-1;${code};${name};;1;`,
  '#SEK;TST:Authority:1;Eksempel fylkeskommune;1;0;0;0',
  '#SEK;TST:Operator:1;Eksempel Buss AS;0;1;0;0',
  '#CUR;neposcoin;1',
  `#TRA;${code}`,
  '#PER;Vinter;20260101;20260630;;;',
  '#TAB;0;;;;',
  '#TUR;0;DX67;0;0;0;0',
  ...stops.flatMap(([id, stopName], i) => [`#TRL;${i};${id};${stopName};34;0;-1;-1;34;-1`, `#TRC;0;07${String(i * 15).padStart(2, '0')};0;0;0;0;0`]),
];

/** @type {[string, string][]} */
const CENTRE = [['NSR:Quay:7203', 'Jernbanetorget'], ['NSR:Quay:11972', 'Oslo bussterminal']];
const OK = crlf(['#LEV;Eksempelprosjekt;TST', ...route('10', 'Jernbanetorget - Oslo bussterminal', CENTRE)]);
// Also shows the marks: a rail Quay on a bus line, and a Quay NSR does not know.
const OUTDATED = crlf(['#LEV;Eksempelprosjekt;TST;Test Creator;creator@example.invalid', ...route('20', 'Jernbanetorget - Oslo S', [
  ...CENTRE, ['NSR:Quay:563', 'Oslo S'], ['NSR:Quay:999999999', 'Ny holdeplass'],
])]);
const DAMAGED = crlf(['#LEV;Eksempelprosjekt;TST', ...route('30', 'Jernbanetorget - Skolen', CENTRE), '#KOS;4;Bytte i sentrum;0']);
const BAD_NAME = crlf(['#LEV;Eksempelprosjekt;TST', ...route('40', 'Jernbanetorget - Stranda', CENTRE)]);

export async function createSampleFs() {
  const fs = createMemoryFs();
  await createProject(fs, { name: 'Eksempelprosjekt', codespace: 'TST' });
  await writeOrgs(fs, [
    { id: 'TST:Authority:1', name: 'Eksempel fylkeskommune' },
    { id: 'TST:Operator:1', name: 'Eksempel Buss AS' },
  ]);
  await fs.writeBytes('data/routes/10.txt', encodeWin1252(OK));
  await fs.writeBytes('data/routes/20.txt', encodeWin1252(OUTDATED));
  await fs.writeBytes('data/routes/30.txt', encodeWin1252(DAMAGED));
  await fs.writeBytes('data/routes/40.TXT', encodeWin1252(BAD_NAME));
  return fs;
}
