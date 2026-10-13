import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'baseline');

/** @param {string} relPath path inside tests/parity/baseline */
export function readBaseline(relPath) {
  return readFileSync(join(dir, relPath), 'utf8');
}

/** @param {string} relPath path inside tests/parity/baseline */
export function readBaselineJson(relPath) {
  return JSON.parse(readBaseline(relPath));
}
