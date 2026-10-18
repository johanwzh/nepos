import { describe, it, expect } from 'vitest';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { writeExport } from '../../src/project/export.js';

const files = [{ name: '_TST-shared.xml', xml: '<a>æøå</a>' }, { name: 'TST-Line-10.xml', xml: '<b/>' }];
const now = new Date(2026, 9, 14, 9, 30, 0);
const latin1 = (/** @type {Uint8Array} */ bytes) => new TextDecoder('latin1').decode(bytes);

describe('writeExport', () => {
  it('writes a ZIP named after the codespace into exports/<time>/', async () => {
    const fs = createMemoryFs();
    const path = await writeExport(fs, files, { codespace: 'tst', asZip: true, now });
    expect(path).toBe('exports/2026-10-14T093000/TST_2026-10-14T093000.zip');
    const bytes = /** @type {Uint8Array} */ (await fs.readBytes(path));
    expect(latin1(bytes.slice(0, 2))).toBe('PK');
    expect(latin1(bytes)).toContain('_TST-shared.xml');
    expect(latin1(bytes)).toContain('TST-Line-10.xml');
  });

  it('writes loose UTF-8 files when asked', async () => {
    const fs = createMemoryFs();
    const path = await writeExport(fs, files, { codespace: 'TST', asZip: false, now });
    expect(path).toBe('exports/2026-10-14T093000');
    expect(await readText(fs, 'exports/2026-10-14T093000/_TST-shared.xml')).toBe('<a>æøå</a>');
    expect(await readText(fs, 'exports/2026-10-14T093000/TST-Line-10.xml')).toBe('<b/>');
  });

  it('never overwrites an earlier export from the same second', async () => {
    const fs = createMemoryFs();
    await writeExport(fs, files, { codespace: 'TST', asZip: true, now });
    expect(await writeExport(fs, files, { codespace: 'TST', asZip: true, now })).toBe('exports/2026-10-14T093000-2/TST_2026-10-14T093000-2.zip');
    expect(await writeExport(fs, files, { codespace: 'TST', asZip: false, now })).toBe('exports/2026-10-14T093000-3');
  });
});
