// Writing a NeTEx delivery into the project folder: exports/<time>/ holds either <CS>_<time>.zip or the
// loose XML files. An export never overwrites an earlier one.
import { EXPORTS_DIR, backupStamp } from './layout.js';
import { buildZipCompressed } from '../core/zip.js';

const utf8 = new TextEncoder();

/**
 * A folder under exports/ that does not exist yet: <stamp>, else <stamp>-2, <stamp>-3, …
 * @param {import('./fs.js').ProjectFs} fs
 * @param {Date} now
 */
async function newExportDir(fs, now) {
  const base = `${EXPORTS_DIR}/${backupStamp(now)}`;
  let candidate = base;
  for (let n = 2; (await fs.list(candidate)).length > 0; n++) candidate = `${base}-${n}`;
  return candidate;
}

/**
 * @param {import('./fs.js').ProjectFs} fs
 * @param {{ name: string, xml: string }[]} files
 * @param {{ codespace: string, asZip: boolean, now?: Date }} opts
 * @returns {Promise<string>} the ZIP file or the folder written, relative to the project folder
 */
export async function writeExport(fs, files, { codespace, asZip, now = new Date() }) {
  const dir = await newExportDir(fs, now);
  if (asZip) {
    // Entur's import wants a new file name for every upload (user 2026-10-18): the folder's time goes in it
    const path = `${dir}/${codespace.toUpperCase()}_${dir.split('/').pop()}.zip`;
    await fs.writeBytes(path, await buildZipCompressed(files.map((f) => ({ name: f.name, data: utf8.encode(f.xml) }))));
    return path;
  }
  for (const f of files) await fs.writeBytes(`${dir}/${f.name}`, utf8.encode(f.xml));
  return dir;
}
