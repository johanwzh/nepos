// When each line was last exported (user 2026-10-21, for Oversikt): data/exports.json, written after every export.
import { describe, it, expect } from 'vitest';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { readExports, writeExports, recordExports } from '../../src/project/exports-store.js';
import { textHash } from '../../src/core/hash.js';

describe('export records', () => {
  it('a project without the file has no records; a broken file reads as none', async () => {
    const fs = createMemoryFs();
    expect(await readExports(fs)).toEqual({});
    await fs.writeBytes('data/exports.json', new TextEncoder().encode('{nope'));
    expect(await readExports(fs)).toEqual({});
  });

  it('records the time and a fingerprint of each exported line, and keeps the others', () => {
    const before = { 12: { at: '2026-01-01T10:00:00.000Z', hash: 'aaaa' } };
    const after = recordExports(before, [{ code: '50', text: 'line 50' }], new Date('2026-10-21T08:00:00Z'));
    expect(after).toEqual({ 12: before[12], 50: { at: '2026-10-21T08:00:00.000Z', hash: textHash('line 50') } });
  });

  it('writes and reads data/exports.json', async () => {
    const fs = createMemoryFs();
    await writeExports(fs, { 50: { at: '2026-10-21T08:00:00.000Z', hash: 'abcd' } });
    expect(JSON.parse(/** @type {string} */ (await readText(fs, 'data/exports.json')))).toEqual({ version: 1, lines: { 50: { at: '2026-10-21T08:00:00.000Z', hash: 'abcd' } } });
    expect(await readExports(fs)).toEqual({ 50: { at: '2026-10-21T08:00:00.000Z', hash: 'abcd' } });
  });

  it('the fingerprint changes with the text', () => {
    expect(textHash('#TRC;0;0700')).not.toBe(textHash('#TRC;0;0701'));
    expect(textHash('abc')).toBe(textHash('abc'));
  });
});
