import { describe, it, expect } from 'vitest';
import { createShapeEngine } from '../../src/shapes/index.js';
import { createWorkerHandler } from '../../src/shapes/worker-core.js';

const A = { quayId: 'NSR:Quay:1', lon: 10.75, lat: 59.91 }, B = { quayId: 'NSR:Quay:2', lon: 10.76, lat: 59.91 }, C = { quayId: 'NSR:Quay:3', lon: 10.77, lat: 59.91 };

/** An in-process worker whose core answers each link after a delay given per destination Quay. */
function fakeWorker(/** @type {Record<string, number>} */ delays) {
  /** @type {any} */
  const w = { onmessage: null, terminated: false, terminate() { this.terminated = true; } };
  const handle = createWorkerHandler((/** @type {any} */ msg) => setTimeout(() => w.onmessage?.({ data: msg }), 0), {
    makeCore: () => ({
      tilesUsed: () => 7,
      shapeLink: (/** @type {any} */ from, /** @type {any} */ to, /** @type {any} */ profile) => new Promise((res) => setTimeout(() =>
        res({ key: `${from.quayId}|${to.quayId}|${profile}`, status: 'OK', from, to, profile, coordinates: [], distanceM: 1, arriveBearing: null, warnings: [], source: 's', engine: 1 }), delays[to.quayId] ?? 0)),
    }),
  });
  w.postMessage = (/** @type {any} */ msg) => { void handle(msg); };
  return w;
}
const styleSource = { tiles: ['https://t/{z}/{x}/{y}.pbf'], maxzoom: 14, buildId: 'b1' };

describe('the shape engine behind its worker', () => {
  it('gives each answer to the right request, also when they finish out of order', async () => {
    const engine = createShapeEngine({ styleSource, worker: fakeWorker({ 'NSR:Quay:2': 30, 'NSR:Quay:3': 5 }) });
    const [ab, bc] = await Promise.all([engine.shapeLink(A, B, 'bus'), engine.shapeLink(B, C, 'bus')]);
    expect(ab.key).toBe('NSR:Quay:1|NSR:Quay:2|bus');
    expect(bc.key).toBe('NSR:Quay:2|NSR:Quay:3|bus');
    expect(engine.tilesUsed()).toBe(7);
  });

  it('a second request for the same link cancels the first', async () => {
    const engine = createShapeEngine({ styleSource, worker: fakeWorker({ 'NSR:Quay:2': 20 }) });
    const first = engine.shapeLink(A, B, 'bus');
    const second = engine.shapeLink(A, B, 'bus');
    expect((await first).status).toBe('ERROR');
    expect((await first).warnings).toContain('cancelled');
    expect((await second).status).toBe('OK');
  });

  it('dispose answers everything still waiting as cancelled and stops the worker', async () => {
    const worker = fakeWorker({ 'NSR:Quay:2': 50 });
    const engine = createShapeEngine({ styleSource, worker });
    const pending = engine.shapeLink(A, B, 'bus');
    engine.dispose();
    expect((await pending).warnings).toContain('cancelled');
    expect(worker.terminated).toBe(true);
  });
});
