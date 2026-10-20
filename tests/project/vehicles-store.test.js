import { describe, it, expect } from 'vitest';
import { createMemoryFs, readText } from '../../src/project/fs.js';
import { readVehicles, writeVehicles, newVehicle } from '../../src/project/vehicles-store.js';
import { createProject } from '../../src/project/create.js';
import { openProject } from '../../src/project/open.js';

describe('vehicles (user 2026-10-20)', () => {
  it('writes and reads data/vehicles.json', async () => {
    const fs = createMemoryFs();
    const v = { ...newVehicle(), name: 'Buss 7', colour: '#2f6fb5' };
    await writeVehicles(fs, [v]);
    expect(JSON.parse(/** @type {string} */ (await readText(fs, 'data/vehicles.json')))).toEqual([v]);
    expect(await readVehicles(fs)).toEqual({ vehicles: [v], error: null });
  });

  it('a project without the file has no vehicles; a broken file is unreadable', async () => {
    const fs = createMemoryFs();
    expect(await readVehicles(fs)).toEqual({ vehicles: [], error: null });
    await fs.writeBytes('data/vehicles.json', new TextEncoder().encode('[{"id":1}]'));
    expect((await readVehicles(fs)).error).toBe('unreadable');
  });

  it('a new vehicle has an ID and a colour', () => {
    expect(newVehicle()).toMatchObject({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), name: '', colour: expect.stringMatching(/^#[0-9a-f]{6}$/) });
  });

  it('comes with the project when it opens', async () => {
    const fs = createMemoryFs();
    await createProject(fs, { name: 'T', codespace: 'TST' });
    await writeVehicles(fs, [{ ...newVehicle(), name: 'Buss 7' }]);
    const r = /** @type {any} */ (await openProject(fs));
    expect(r.vehicles.map((/** @type {any} */ x) => x.name)).toEqual(['Buss 7']);
    expect(r.vehiclesError).toBe(null);
  });
});
