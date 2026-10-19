import { describe, it, expect } from 'vitest';
import { createMemoryFs, readText, writeText } from '../../src/project/fs.js';
import { readShapes, writeShapes } from '../../src/project/shapes-store.js';
import { toSaved, isExportable, isStale, blocked } from '../../src/core/link-state.js';
import { ENGINE_VERSION } from '../../src/shapes/profiles.js';
import { decodePolyline } from '../../src/shapes/geometry.js';

const KEY = 'NSR:Quay:1|NSR:Quay:2|bus';
const result = /** @type {any} */ ({ key: KEY, status: 'OK', from: { quayId: 'NSR:Quay:1', lon: 10.75, lat: 59.91 }, to: { quayId: 'NSR:Quay:2', lon: 10.76, lat: 59.912 },
  profile: 'bus', coordinates: [[10.75, 59.91], [10.755, 59.911], [10.76, 59.912]], distanceM: 642, arriveBearing: 80, warnings: [], source: 'ofm b1', engine: ENGINE_VERSION });
const NOW = new Date('2026-10-19T12:00:00Z');
const quays = (/** @type {number} */ moveM = 0) => new Map([['NSR:Quay:1', { lon: 10.75, lat: 59.91 + moveM / 111200 }], ['NSR:Quay:2', { lon: 10.76, lat: 59.912 }]]);
const daysLater = (/** @type {number} */ d) => new Date(NOW.getTime() + d * 86400000);

describe('data/shapes.json', () => {
  it('round trips the saved links', async () => {
    const fs = createMemoryFs();
    await writeShapes(fs, new Map([[KEY, toSaved(result, NOW)]]));
    const back = await readShapes(fs);
    expect(back.error).toBe('');
    const s = /** @type {any} */ (back.shapes.get(KEY));
    expect(s).toMatchObject({ status: 'OK', distanceM: 642, precision: 6, source: 'ofm b1', engine: ENGINE_VERSION, routedAt: '2026-10-19T12:00:00.000Z', from: [10.75, 59.91] });
    expect(decodePolyline(s.polyline)).toHaveLength(3);
    expect(JSON.parse(await readText(fs, 'data/shapes.json')).version).toBe(1);
  });

  it('a project from 2.2 (no file) opens with no links and no error', async () => {
    const back = await readShapes(createMemoryFs());
    expect(back.shapes.size).toBe(0);
    expect(back.error).toBe('');
  });

  it('an unreadable file is reported, and the next write keeps a backup of it', async () => {
    const fs = createMemoryFs();
    await writeText(fs, 'data/shapes.json', '{ not json');
    const back = await readShapes(fs);
    expect(back.error).toBe('unreadable');
    await writeShapes(fs, new Map([[KEY, toSaved(result, NOW)]]), { previousError: back.error });
    const backups = await fs.list('data/backups');
    expect(backups.some((/** @type {any} */ e) => e.name.startsWith('shapes'))).toBe(true);
    expect((await readShapes(fs)).error).toBe('');
  });
});

describe('when a saved link is stale or exportable (design §6, §7, §10)', () => {
  const saved = toSaved(result, NOW);

  it('is stale after 180 days, not before', () => {
    expect(isStale(KEY, saved, quays(), daysLater(179))).toBe(false);
    expect(isStale(KEY, saved, quays(), daysLater(181))).toBe(true);
  });

  it('is stale when made by an older engine, or when NSR has moved a Quay more than 5 m', () => {
    expect(isStale(KEY, { ...saved, engine: ENGINE_VERSION - 1 }, quays(), NOW)).toBe(true);
    expect(isStale(KEY, saved, quays(6), NOW)).toBe(true);
    expect(isStale(KEY, saved, quays(3), NOW)).toBe(false);
  });

  it('a blocked link is never stale', () => {
    const b = blocked(saved);
    expect(b.status).toBe('BLOCKED');
    for (const [q, at] of [[quays(), daysLater(400)], [quays(50), NOW]]) expect(isStale(KEY, b, /** @type {any} */ (q), /** @type {Date} */ (at))).toBe(false);
    expect(isStale(KEY, { ...b, engine: 0 }, quays(), NOW)).toBe(false);
  });

  it('only an OK link whose Quays have not moved is exportable; unknown positions do not hold it back', () => {
    expect(isExportable(KEY, saved, quays())).toBe(true);
    expect(isExportable(KEY, saved, quays(6))).toBe(false);
    expect(isExportable(KEY, { ...saved, status: 'NO_PATH' }, quays())).toBe(false);
    expect(isExportable(KEY, blocked(saved), quays())).toBe(false);
    expect(isExportable(KEY, saved, new Map())).toBe(true); // NSR could not be reached
  });
});
