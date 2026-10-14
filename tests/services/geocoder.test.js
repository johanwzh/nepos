import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { searchStopPlaces, nearbyStopPlaces } from '../../src/services/geocoder.js';

const recorded = JSON.parse(readFileSync('tests/fixtures/geocoder/autocomplete-jernbanetorget.json', 'utf8'));
const opts = { baseUrl: 'https://api.entur.io/geocoder/v3/', clientName: 'test-nepos' };

function fakeFetch(body = recorded, { ok = true, status = 200 } = {}) {
  /** @type {{ url: string, headers: any }[]} */
  const calls = [];
  const fn = async (/** @type {string} */ url, /** @type {any} */ init) => { calls.push({ url, headers: init?.headers }); return { ok, status, json: async () => body }; };
  return { fn, calls };
}

describe('searchStopPlaces', () => {
  it('asks for monomodal stop places and names the client', async () => {
    const { fn, calls } = fakeFetch();
    await searchStopPlaces('jernbane torget', { ...opts, fetch: fn });
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe('https://api.entur.io/geocoder/v3/autocomplete');
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'jernbane torget', limit: '20', lang: 'no', layers: 'stopPlace', multimodal: 'child' });
    expect(calls[0].headers['ET-Client-Name']).toBe('test-nepos');
  });

  it('turns the answer into stop places with mode, place and position', async () => {
    const { fn } = fakeFetch();
    const hits = await searchStopPlaces('jernbanetorget', { ...opts, fetch: fn });
    expect(hits.map((h) => `${h.id} ${h.modes.join('/')}`)).toEqual(['NSR:StopPlace:3990 metro', 'NSR:StopPlace:4013 bus', 'NSR:StopPlace:3986 tram']);
    expect(hits[1]).toEqual({
      id: 'NSR:StopPlace:4013', name: 'Jernbanetorget', context: 'Oslo, Oslo', description: 'i Strandgata',
      modes: ['bus'], lat: 59.909414, lon: 10.749009,
    });
  });

  it('fails loudly on an error response', async () => {
    const { fn } = fakeFetch({}, { ok: false, status: 502 });
    await expect(searchStopPlaces('x', { ...opts, fetch: fn })).rejects.toThrow('502');
  });
});

describe('nearbyStopPlaces', () => {
  it('asks the v3 reverse search for up to 50 monomodal stop places around a point', async () => {
    const { fn, calls } = fakeFetch();
    const hits = await nearbyStopPlaces({ lat: 59.91, lon: 10.75, radiusKm: 0.4 }, { ...opts, fetch: fn });
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe('https://api.entur.io/geocoder/v3/reverse');
    expect(Object.fromEntries(url.searchParams)).toEqual({ lat: '59.91', lon: '10.75', radius: '0.4', limit: '50', layers: 'stopPlace', multimodal: 'child' });
    expect(calls[0].headers['ET-Client-Name']).toBe('test-nepos');
    expect(hits[1].id).toBe('NSR:StopPlace:4013');
  });

  it('fails loudly on an error response', async () => {
    const { fn } = fakeFetch({}, { ok: false, status: 503 });
    await expect(nearbyStopPlaces({ lat: 1, lon: 1, radiusKm: 1 }, { ...opts, fetch: fn })).rejects.toThrow('503');
  });
});
