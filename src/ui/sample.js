// A small in-memory project for checking the screens during development (/?sample). It holds
// one OK route, one outdated (1.x) route, one damaged route and a file whose name needs repair.
// Only loaded when import.meta.env.DEV is true; never part of a production build's behaviour.
import { createMemoryFs } from '../project/fs.js';
import { createProject } from '../project/create.js';
import { writeOrgs } from '../project/orgs-store.js';
import { encodeWin1252 } from '../core/ern/win1252.js';

const crlf = (/** @type {string[]} */ lines) => lines.join('\r\n') + '\r\n';

/** @param {string} code @param {string} name */
const route = (code, name) => [
  `#RUT;-1;${code};${name};;1;`,
  '#SEK;TST:Authority:1;Eksempel fylkeskommune;1;0;0;0',
  '#SEK;TST:Operator:1;Eksempel Buss AS;0;1;0;0',
  '#CUR;neposcoin;1',
  `#TRA;${code}`,
  '#PER;Vinter;20260101;20260630;;;',
  '#TAB;0;;;;',
  '#TUR;0;DX67;0;0;0;0',
  '#TRL;0;1;Sentrum;34;0;-1;-1;34;-1',
  '#TRC;0;0700;0;0;0;0;0',
  '#TRL;1;2;Flyplass;34;0;-1;-1;34;-1',
  '#TRC;0;0745;0;0;0;0;0',
];

const OK = crlf(['#LEV;Eksempelprosjekt;TST', ...route('10', 'Sentrum - Flyplass')]);
const OUTDATED = crlf(['#LEV;Eksempelprosjekt;TST;Test Creator;creator@example.invalid', ...route('20', 'Sentrum - Havna')]);
const DAMAGED = crlf(['#LEV;Eksempelprosjekt;TST', ...route('30', 'Sentrum - Skolen'), '#KOS;4;Bytte i sentrum;0']);
const BAD_NAME = crlf(['#LEV;Eksempelprosjekt;TST', ...route('40', 'Sentrum - Stranda')]);

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
