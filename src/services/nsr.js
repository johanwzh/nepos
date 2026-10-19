// The NSR stop-place read API (spec §7.2): the only code that asks NSR about Quays.
// One request per batch: GET {baseUrl}/stop-places?count=N&quayIds=a,b,c returns each stop place
// that has one of the Quays, with its name, transport mode and all its Quays. Quays NSR does not
// know (or no longer lists) are simply absent.
import { NSR_QUAY_PATTERN } from '../core/quays.js';

const BATCH = 50;

/**
 * @typedef {{ quayId: string, publicCode: string, privateCode?: string, stopPlaceId: string, stopPlaceName: string,
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
          privateCode: quay.privateCode?.value ?? '',
        });
      }
    }
  }
  return result;
}

/**
 * @typedef {'yes' | 'no' | 'partial' | ''} Access
 * @typedef {{ quayId: string, publicCode: string, privateCode?: string, description: string, lat: number | null, lon: number | null,
 *             bearing?: number | null, shelter?: 'enclosed' | 'open' | null, sign?: boolean, wheelchair?: Access, stepFree?: Access }} StopQuay
 * @typedef {{ id: string, name: string, description: string, mode: string, type?: string,
 *             waitingRoom?: { seats: number, heated: boolean } | null, quays: StopQuay[] }} StopPlace
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
  return toStopPlace(await res.json());
}

/**
 * Stop places by ID, with their Quays (stop picking spec §4: the Quays of the stop places in view).
 * @param {string[]} ids NSR StopPlace IDs
 * @param {{ baseUrl: string, clientName: string, fetch?: (url: string, init?: any) => Promise<any> }} opts
 * @returns {Promise<StopPlace[]>} the ones NSR knows
 */
export async function getStopPlaces(ids, { baseUrl, clientName, fetch: doFetch = (url, init) => fetch(url, init) }) {
  const wanted = [...new Set(ids)];
  const base = baseUrl.replace(/\/$/, '');
  /** @type {StopPlace[]} */
  const out = [];
  for (let i = 0; i < wanted.length; i += BATCH) {
    const batch = wanted.slice(i, i + BATCH);
    const res = await doFetch(`${base}/stop-places?count=${batch.length}&ids=${batch.join(',')}`, {
      headers: { 'ET-Client-Name': clientName, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`NSR answered ${res.status}`);
    const places = await res.json();
    for (const place of Array.isArray(places) ? places : []) out.push(toStopPlace(place));
  }
  return out;
}

/** @param {any} x @returns {any[]} */
const equipment = (x) => x?.placeEquipments?.installedEquipmentRefOrInstalledEquipment ?? [];
/** @param {any} v @returns {Access} */
const access = (v) => (v === 'TRUE' ? 'yes' : v === 'FALSE' ? 'no' : v === 'PARTIAL' ? 'partial' : '');

/** @param {any} place @returns {StopPlace} */
function toStopPlace(place) {
  const waiting = equipment(place).find((e) => e.type === 'WaitingRoomEquipment')?.value;
  return {
    id: place.id,
    name: place.name?.value ?? '',
    description: place.description?.value ?? '',
    mode: String(place.transportMode ?? '').toLowerCase(),
    type: place.stopPlaceType ?? '',
    waitingRoom: waiting ? { seats: Number(waiting.seats) || 0, heated: !!waiting.heated } : null,
    quays: (place.quays?.quayRefOrQuay ?? []).filter((/** @type {any} */ q) => q.id).map((/** @type {any} */ q) => {
      const shelter = equipment(q).find((e) => e.type === 'ShelterEquipment')?.value;
      const limits = q.accessibilityAssessment?.limitations?.accessibilityLimitation;
      return {
        quayId: q.id,
        publicCode: q.publicCode ?? '',
        privateCode: q.privateCode?.value ?? '',
        description: q.description?.value ?? '',
        lat: q.centroid?.location?.latitude ?? null,
        lon: q.centroid?.location?.longitude ?? null,
        bearing: typeof q.compassBearing === 'number' ? q.compassBearing : null,
        shelter: shelter ? (shelter.enclosed ? 'enclosed' : 'open') : null,
        sign: equipment(q).some((e) => e.type === 'GeneralSign'),
        wheelchair: access(limits?.wheelchairAccess),
        stepFree: access(limits?.stepFreeAccess),
      };
    }),
  };
}
