import { describe, it, expect } from 'vitest';
import { createMemoryFs, createHandleFs, readText, writeText, writeJson } from '../../src/project/fs.js';
import { FakeDir } from './fake-handle.js';

const implementations = {
  memory: () => createMemoryFs(),
  handle: () => createHandleFs(new FakeDir()),
};

for (const [label, make] of Object.entries(implementations)) {
  describe(`ProjectFs (${label})`, () => {
    it('returns null for a missing file', async () => {
      expect(await make().readBytes('data/nope.txt')).toBe(null);
    });

    it('writes into folders that do not exist yet and reads the bytes back', async () => {
      const fs = make();
      await fs.writeBytes('data/routes/10.txt', new Uint8Array([1, 2, 3]));
      expect([...(await fs.readBytes('data/routes/10.txt'))]).toEqual([1, 2, 3]);
    });

    it('replaces a file completely on rewrite', async () => {
      const fs = make();
      await fs.writeBytes('a.txt', new Uint8Array([1, 2, 3, 4]));
      await fs.writeBytes('a.txt', new Uint8Array([9]));
      expect([...(await fs.readBytes('a.txt'))]).toEqual([9]);
    });

    it('lists the direct children of a folder, sorted', async () => {
      const fs = make();
      await fs.writeBytes('data/routes/20.txt', new Uint8Array());
      await fs.writeBytes('data/routes/10.txt', new Uint8Array());
      await fs.writeBytes('data/orgs.json', new Uint8Array());
      expect(await fs.list('data')).toEqual([
        { name: 'orgs.json', kind: 'file' },
        { name: 'routes', kind: 'directory' },
      ]);
      expect((await fs.list('data/routes')).map((e) => e.name)).toEqual(['10.txt', '20.txt']);
    });

    it('lists a missing folder as empty and an empty project folder as empty', async () => {
      const fs = make();
      expect(await fs.list('data/backups')).toEqual([]);
      expect(await fs.list('')).toEqual([]);
    });

    it('creates empty folders with mkdir', async () => {
      const fs = make();
      await fs.mkdir('data/backups');
      expect(await fs.list('data')).toEqual([{ name: 'backups', kind: 'directory' }]);
      expect(await fs.list('data/backups')).toEqual([]);
    });

    it('reads and writes text and JSON as UTF-8', async () => {
      const fs = make();
      await writeText(fs, 'private/note.txt', 'Florø – ok');
      expect(await readText(fs, 'private/note.txt')).toBe('Florø – ok');
      await writeJson(fs, 'data/x.json', { a: 1 });
      expect(await readText(fs, 'data/x.json')).toBe('{\n  "a": 1\n}\n');
      expect(await readText(fs, 'missing.json')).toBe(null);
    });

    it('removes a file and ignores removing a missing one', async () => {
      const fs = make();
      await fs.writeBytes('data/routes/10.txt', new Uint8Array([1]));
      await fs.remove('data/routes/10.txt');
      expect(await fs.readBytes('data/routes/10.txt')).toBe(null);
      await fs.remove('data/routes/10.txt');
      await fs.remove('nowhere/x.txt');
    });
  });
}
