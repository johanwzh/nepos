import { describe, it, expect } from 'vitest';
import { createRoutingClient } from '../../src/routing/client.js';

/** A fake worker that answers in reverse order, so replies must be matched by id. */
function fakeWorker() {
  const queue = [];
  const w = {
    onmessage: null,
    terminated: false,
    postMessage(msg) {
      queue.push(msg);
      if (queue.length === 2) {
        for (const m of queue.reverse()) {
          const data = m.op === 'route' ? { id: m.id, result: { ok: true, n: m.chain.length } } : { id: m.id, result: m.entries.map((e) => e.key) };
          w.onmessage({ data });
        }
        queue.length = 0;
      }
    },
    terminate() { w.terminated = true; },
  };
  return w;
}

describe('routing client', () => {
  it('matches replies to requests by id', async () => {
    const worker = fakeWorker();
    const client = createRoutingClient(() => /** @type {any} */ (worker));
    const [keys, route] = await Promise.all([
      client.addTiles([{ key: 'a', buf: new ArrayBuffer(0) }]),
      client.route([{ lon: 1, lat: 2 }, { lon: 3, lat: 4 }, { lon: 5, lat: 6 }]),
    ]);
    expect(keys).toEqual(['a']);
    expect(route).toEqual({ ok: true, n: 3 });
    expect(client.has('a')).toBe(true);
    client.close();
    expect(worker.terminated).toBe(true);
  });

  it('rejects when the worker reports an error', async () => {
    const w = { onmessage: null, postMessage(m) { w.onmessage({ data: { id: m.id, error: 'boom' } }); }, terminate() {} };
    const client = createRoutingClient(() => /** @type {any} */ (w));
    await expect(client.route([])).rejects.toThrow('boom');
  });

  it('final I1: after close, a call rejects at once instead of waiting on a dead worker', async () => {
    const client = createRoutingClient(() => /** @type {any} */ (fakeWorker()));
    client.close();
    await expect(client.route([])).rejects.toThrow('routing closed');
    await expect(client.addTiles([])).rejects.toThrow('routing closed');
  });
});
