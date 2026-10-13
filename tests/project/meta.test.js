import { describe, it, expect } from 'vitest';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { writeProjectName } from '../../src/project/meta.js';

describe('writeProjectName', () => {
  it('changes only the name and keeps every other key', async () => {
    const fs = createMemoryFs();
    const meta = { formatVersion: 1, name: 'Old', codespace: 'ABC', futureKey: 7 };
    const updated = await writeProjectName(fs, meta, '  Kystruter  ');
    expect(updated).toEqual({ formatVersion: 1, name: 'Kystruter', codespace: 'ABC', futureKey: 7 });
    expect(JSON.parse(await readText(fs, 'data/nepos-project.json'))).toEqual(updated);
  });
});
