// Entur geocoder v3 (spec §7.1): searching stop places by name. `multimodal=child` gives the
// single-mode stop places (a bus stop, a tram stop, …) instead of their multimodal parents, so
// every hit has one transport mode — and Quays hang under exactly these stop places.

/**
 * @typedef {{ id: string, name: string, context: string, description: string, modes: string[],
 *             lat: number | null, lon: number | null }} StopPlaceHit
 */

/**
 * @param {string} text
 * @param {{ baseUrl: string, clientName: string, limit?: number, fetch?: (url: string, init?: any) => Promise<any> }} opts
 * @returns {Promise<StopPlaceHit[]>}
 */
export async function searchStopPlaces(text, { baseUrl, clientName, limit = 20, fetch: doFetch = (url, init) => fetch(url, init) }) {
  const params = new URLSearchParams({ q: text, limit: String(limit), lang: 'no', layers: 'stopPlace', multimodal: 'child' });
  const res = await doFetch(`${baseUrl.replace(/\/$/, '')}/autocomplete?${params}`, {
    headers: { 'ET-Client-Name': clientName, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`The geocoder answered ${res.status}`);
  const body = await res.json();
  return (body.features ?? []).map((/** @type {any} */ f) => {
    const p = f.properties ?? {};
    const [lon, lat] = f.geometry?.coordinates ?? [null, null];
    return {
      id: p.id,
      name: p.names?.default ?? p.name ?? '',
      context: [p.address?.locality, p.address?.county].filter(Boolean).join(', '),
      description: p.description?.nor ?? p.description?.eng ?? '',
      modes: (p.transportModes ?? []).map((/** @type {any} */ m) => String(m.mode ?? '').toLowerCase()).filter(Boolean),
      lat, lon,
    };
  });
}
