import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lookupQuays } from '../../src/services/nsr.js';

const recorded = JSON.parse(readFileSync('tests/fixtures/nsr/stop-places-by-quay.json', 'utf8'));
const opts = { baseUrl: 'https://api.entur.io/stop-places/v1/read/', clientName: 'test-nepos' };

/** A fetch that answers with the recorded response and remembers what it was asked. */
function fakeFetch(body = recorded, { ok = true, status = 200 } = {}) {
  /** @type {{ url: string, headers: any }[]} */
  const calls = [];
  const fn = async (/** @type {string} */ url, /** @type {any} */ init) => {
    calls.push({ url, headers: init?.headers });
    return { ok, status, json: async () => body };
  };
  return { fn, calls };
}

describe('lookupQuays', () => {
  it('asks NSR once for a batch and names the client', async () => {
    const { fn, calls } = fakeFetch();
    await lookupQuays(['NSR:Quay:7203', 'NSR:Quay:563', 'NSR:Quay:999999999'], { ...opts, fetch: fn });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.entur.io/stop-places/v1/read/stop-places?count=3&quayIds=NSR:Quay:7203,NSR:Quay:563,NSR:Quay:999999999');
    expect(calls[0].headers['ET-Client-Name']).toBe('test-nepos');
  });

  it('describes each Quay it found, and gives null for the ones NSR does not know', async () => {
    const { fn } = fakeFetch();
    const result = await lookupQuays(['NSR:Quay:7203', 'NSR:Quay:563', 'NSR:Quay:999999999'], { ...opts, fetch: fn });
    expect(result.get('NSR:Quay:7203')).toEqual({
      quayId: 'NSR:Quay:7203', publicCode: 'A', stopPlaceId: 'NSR:StopPlace:4000', stopPlaceName: 'Jernbanetorget',
      mode: 'bus', lat: 59.911425, lon: 10.749736,
    });
    expect(result.get('NSR:Quay:563')?.mode).toBe('rail');
    expect(result.get('NSR:Quay:999999999')).toBe(null);
    expect(result.has('NSR:Quay:570')).toBe(false); // other Quays of the same stop place are not reported
  });

  it('splits long lists into batches of 50 and skips what is not an NSR Quay ID', async () => {
    const { fn, calls } = fakeFetch([]);
    const ids = Array.from({ length: 120 }, (_, i) => `NSR:Quay:${1000 + i}`);
    const result = await lookupQuays([...ids, '101', 'NSR:Quay:1000'], { ...opts, fetch: fn });
    expect(calls.map((c) => new URL(c.url).searchParams.get('count'))).toEqual(['50', '50', '20']);
    expect(result.size).toBe(120);
  });

  it('does not call NSR for an empty list', async () => {
    const { fn, calls } = fakeFetch();
    expect((await lookupQuays([], { ...opts, fetch: fn })).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('fails loudly on an error response', async () => {
    const { fn } = fakeFetch({}, { ok: false, status: 503 });
    await expect(lookupQuays(['NSR:Quay:7203'], { ...opts, fetch: fn })).rejects.toThrow('503');
  });
});
