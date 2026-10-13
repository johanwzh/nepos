// Project format versioning (spec §5). The project file records formatVersion; older projects
// are upgraded one step at a time, newer ones are refused by openProject.
import { writeJson } from './fs.js';
import { PROJECT_FILE, BACKUPS_DIR, backupStamp } from './layout.js';

export const CURRENT_FORMAT_VERSION = 1;

/**
 * Ordered upgrade steps. A step with `from: n` upgrades a version-n project to n+1.
 * Nepos 2.0 ships the framework with no steps.
 * @type {{ from: number, run: (fs: import('./fs.js').ProjectFs) => Promise<void> }[]}
 */
export const MIGRATIONS = [];

/**
 * @param {any} meta contents of data/nepos-project.json
 * @param {number} [current]
 * @returns {'current' | 'older' | 'newer' | 'invalid'}
 */
export function checkFormatVersion(meta, current = CURRENT_FORMAT_VERSION) {
  const v = meta?.formatVersion;
  if (!Number.isInteger(v) || v < 1) return 'invalid';
  if (v === current) return 'current';
  return v < current ? 'older' : 'newer';
}

/**
 * Copy every file under `from` to `to`, skipping the `skip` subfolder.
 * @param {import('./fs.js').ProjectFs} fs
 * @param {string} from
 * @param {string} to
 * @param {string} skip
 */
async function copyTree(fs, from, to, skip) {
  for (const entry of await fs.list(from)) {
    const src = `${from}/${entry.name}`;
    if (src === skip) continue;
    if (entry.kind === 'directory') await copyTree(fs, src, `${to}/${entry.name}`, skip);
    else await fs.writeBytes(`${to}/${entry.name}`, await fs.readBytes(src));
  }
}

/**
 * Upgrade a project to the target format version.
 * @param {import('./fs.js').ProjectFs} fs
 * @param {{ formatVersion: number } & Record<string, any>} meta
 * @param {{ now?: Date, migrations?: typeof MIGRATIONS, target?: number }} [opts]
 */
export async function migrateProject(fs, meta, { now = new Date(), migrations = MIGRATIONS, target = CURRENT_FORMAT_VERSION } = {}) {
  let version = meta.formatVersion;
  for (let v = version; v < target; v++) {
    if (!migrations.some((m) => m.from === v)) throw new Error(`No upgrade step from format version ${v}`);
  }
  await copyTree(fs, 'data', `${BACKUPS_DIR}/format-${version}-${backupStamp(now)}`, BACKUPS_DIR);
  while (version < target) {
    const step = migrations.find((m) => m.from === version);
    await step.run(fs);
    version++;
  }
  const upgraded = { ...meta, formatVersion: version };
  await writeJson(fs, PROJECT_FILE, upgraded);
  return upgraded;
}
