// The NSR stop-place read API (spec §7.2): the only code that asks NSR about Quays.
// One request per batch: GET {baseUrl}/stop-places?count=N&quayIds=a,b,c returns each stop place
// that has one of the Quays, with its name, transport mode and all its Quays. Quays NSR does not
// know (or no longer lists) are simply absent.
import { NSR_QUAY_PATTERN } from '../core/quays.js';

const BATCH = 50;

/**
 * @typedef {{ quayId: string, publicCode: string, stopPlaceId: string, stopPlaceName: string,
 *             mode: string, lat: number | null, lon: number | null }} QuayInfo
 */

/**
 * @param {string[]} ids NSR Quay IDs; anything else is skipped
 * @param {{ baseUrl: string, clientName: string, fetch?: (url: string, init?: any) => Promise<any> }} opts
 * @returns {Promise<Map<string, QuayInfo | null>>} every requested Quay; null when NSR does not know it
 */
export async function lookupQuays(ids, { baseUrl, clientName, fetch: doFetch = (url, init) => fetch(url, init) }) {
  const wanted = [...new Set(ids)].filter((id) => NSR_QUAY_PATTERN.test(id));
  /** @type {Map<string, QuayInfo | null>} */
  const result = new Map(wanted.map((id) => [id, null]));
  const base = baseUrl.replace(/\/$/, '');
  for (let i = 0; i < wanted.length; i += BATCH) {
    const batch = wanted.slice(i, i + BATCH);
    // A stop place holds one or more of the Quays, so `count` = batch size never cuts the answer short.
    const res = await doFetch(`${base}/stop-places?count=${batch.length}&quayIds=${batch.join(',')}`, {
      headers: { 'ET-Client-Name': clientName, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`NSR answered ${res.status}`);
    const places = await res.json();
    for (const place of Array.isArray(places) ? places : []) {
      for (const quay of place.quays?.quayRefOrQuay ?? []) {
        if (!result.has(quay.id)) continue;
        const loc = quay.centroid?.location;
        result.set(quay.id, {
          quayId: quay.id,
          publicCode: quay.publicCode ?? '',
          stopPlaceId: place.id,
          stopPlaceName: place.name?.value ?? '',
          mode: String(place.transportMode ?? '').toLowerCase(),
          lat: loc?.latitude ?? null,
          lon: loc?.longitude ?? null,
        });
      }
    }
  }
  return result;
}

/**
 * @typedef {{ id: string, name: string, description: string, mode: string,
 *             quays: { quayId: string, publicCode: string, description: string, lat: number | null, lon: number | null }[] }} StopPlace
 */

/**
 * One stop place with its Quays (spec §7.1: drilling from a stop place to the Quays).
 * @param {string} id NSR StopPlace ID
 * @param {{ baseUrl: string, clientName: string, fetch?: (url: string, init?: any) => Promise<any> }} opts
 * @returns {Promise<StopPlace | null>} null when NSR does not know the stop place
 */
export async function getStopPlace(id, { baseUrl, clientName, fetch: doFetch = (url, init) => fetch(url, init) }) {
  const res = await doFetch(`${baseUrl.replace(/\/$/, '')}/stop-places/${id}`, {
    headers: { 'ET-Client-Name': clientName, Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`NSR answered ${res.status}`);
  const place = await res.json();
  return {
    id: place.id,
    name: place.name?.value ?? '',
    description: place.description?.value ?? '',
    mode: String(place.transportMode ?? '').toLowerCase(),
    quays: (place.quays?.quayRefOrQuay ?? []).filter((/** @type {any} */ q) => q.id).map((/** @type {any} */ q) => ({
      quayId: q.id,
      publicCode: q.publicCode ?? '',
      description: q.description?.value ?? '',
      lat: q.centroid?.location?.latitude ?? null,
      lon: q.centroid?.location?.longitude ?? null,
    })),
  };
}
