import { writeJson } from './fs.js';
import { PROJECT_FILE } from './layout.js';

/**
 * Rename the project. Every other key in the project file is kept as it is.
 * @template {Record<string, any>} M
 * @param {import('./fs.js').ProjectFs} fs
 * @param {M} meta current project file contents
 * @param {string} name
 * @returns {Promise<M>}
 */
export async function writeProjectName(fs, meta, name) {
  const updated = { ...meta, name: String(name ?? '').trim() };
  await writeJson(fs, PROJECT_FILE, updated);
  return updated;
}
