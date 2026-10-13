import { writeJson } from './fs.js';
import { PROJECT_FILE, ORGS_FILE, ROUTES_DIR, BACKUPS_DIR } from './layout.js';
import { DEFAULT_SETTINGS, writeSettings, writeSecrets } from './settings.js';
import { CURRENT_FORMAT_VERSION } from './format.js';
import { normalizeCodespace } from '../core/codespace.js';

// Files the operating system puts in folders on its own; they do not make a folder "used".
const SYSTEM_FILES = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);

/**
 * Create a new, empty project in an empty folder.
 * @param {import('./fs.js').ProjectFs} fs
 * @param {{ name: string, codespace: string }} input
 * @returns {Promise<{ ok: true, meta: { formatVersion: number, name: string, codespace: string } }
 *   | { ok: false, error: 'codespace-required' | 'codespace-format' | 'folder-not-empty', found?: string[] }>}
 */
export async function createProject(fs, { name, codespace }) {
  const cs = normalizeCodespace(codespace);
  if (cs.ok === false) return { ok: false, error: cs.error === 'required' ? 'codespace-required' : 'codespace-format' };
  const found = (await fs.list(''))
    .filter((e) => !(e.kind === 'file' && SYSTEM_FILES.has(e.name.toLowerCase())))
    .map((e) => e.name);
  if (found.length > 0) return { ok: false, error: 'folder-not-empty', found: found.slice(0, 5) };

  const meta = { formatVersion: CURRENT_FORMAT_VERSION, name: String(name ?? '').trim(), codespace: cs.value };
  await writeJson(fs, PROJECT_FILE, meta);
  await writeJson(fs, ORGS_FILE, []);
  await fs.mkdir(ROUTES_DIR);
  await fs.mkdir(BACKUPS_DIR);
  await writeSettings(fs, { ...DEFAULT_SETTINGS });
  await writeSecrets(fs, {});
  return { ok: true, meta };
}
