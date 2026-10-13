// Repairing route file names. A rename is copy → delete → write, via a temporary name, so it
// also works when only the case changes on a case-insensitive file system (Windows), where
// "40.TXT" and "40.txt" are the same file.
import { ROUTES_DIR, BACKUPS_DIR, backupStamp, uniqueBackupPath } from './layout.js';
import { checkRouteFileName } from '../core/route-names.js';

/**
 * Route file names that break the rules, with the rename that fixes each. `rename` is null when
 * there is no safe automatic fix: no usable suggestion, or another file already has that name.
 * @param {import('./fs.js').ProjectFs} fs
 * @returns {Promise<{ fileName: string, problem: 'extension-case' | 'invalid-code', rename: string | null }[]>}
 */
export async function findFileNameProblems(fs) {
  const names = (await fs.list(ROUTES_DIR)).filter((e) => e.kind === 'file').map((e) => e.name);
  /** @type {{ fileName: string, problem: 'extension-case' | 'invalid-code', rename: string | null }[]} */
  const problems = [];
  for (const fileName of names) {
    const check = checkRouteFileName(fileName);
    if (check === null || check.ok === true) continue;
    const target = check.suggestion;
    const taken = target !== null && names.some((n) => n !== fileName && n.toLowerCase() === target.toLowerCase());
    problems.push({ fileName, problem: check.problem, rename: target && !taken ? target : null });
  }
  return problems;
}

/**
 * Apply the renames from findFileNameProblems, backing each original up first.
 * @param {import('./fs.js').ProjectFs} fs
 * @param {{ fileName: string, rename: string | null }[]} problems
 * @param {{ now?: Date }} [opts]
 * @returns {Promise<{ from: string, to: string }[]>}
 */
export async function repairFileNames(fs, problems, { now = new Date() } = {}) {
  /** @type {{ from: string, to: string }[]} */
  const done = [];
  for (const { fileName, rename } of problems) {
    if (!rename) continue;
    const from = `${ROUTES_DIR}/${fileName}`;
    const to = `${ROUTES_DIR}/${rename}`;
    const caseOnly = rename.toLowerCase() === fileName.toLowerCase();
    if (!caseOnly && (await fs.readBytes(to)) !== null) continue; // appeared since the check
    if (caseOnly && (await fs.list(ROUTES_DIR)).some((e) => e.name === rename)) continue; // both exist (case-sensitive system)
    const bytes = await fs.readBytes(from);
    if (bytes === null) continue;
    await fs.writeBytes(await uniqueBackupPath(fs, `${BACKUPS_DIR}/${fileName}.${backupStamp(now)}`, ''), bytes);
    const tmp = `${to}.repair-tmp`;
    await fs.writeBytes(tmp, bytes);
    await fs.remove(from);
    await fs.writeBytes(to, bytes);
    await fs.remove(tmp);
    done.push({ from: fileName, to: rename });
  }
  return done;
}
