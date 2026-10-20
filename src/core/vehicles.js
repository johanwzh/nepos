// A vehicle's own data (user 2026-10-20), named as in NeTEx's VehicleType so it can be exported later: the mode it
// runs (must match the line), fuel, low floor, seats, its size in metres, the vehicle type ID Nepos makes, and a
// VehicleTypeRef into the national vehicle register under the fixed NMR:VehicleType: prefix.

/** NeTEx FuelTypeEnumeration (netex_nm_equipmentEnergy_support.xsd), in the schema's order. */
export const FUEL_TYPES = ['battery', 'biodiesel', 'diesel', 'dieselBatteryHybrid', 'electricContact', 'electricity', 'ethanol',
  'hydrogen', 'liquidGas', 'tpg', 'methane', 'naturalGas', 'petrol', 'petrolBatteryHybrid', 'petrolLeaded', 'petrolUnleaded', 'none', 'other'];

/** The fixed start of a VehicleTypeRef: only the rest is typed. */
export const VEHICLE_TYPE_REF_PREFIX = 'NMR:VehicleType:';

/** The longest short code (it has to fit in a timetable column). */
export const SHORT_CODE_MAX = 8;

/**
 * @typedef {{ id: string, name: string, colour: string, shortCode: string, transportMode: string, fuelType: string,
 *   lowFloor: boolean, seats: number | null, length: number | null, width: number | null, height: number | null,
 *   vehicleTypeId: string, vehicleTypeRef: string }} Vehicle
 */

/** @param {any} v */
const positive = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
/** @param {any} v */
const str = (v) => (typeof v === 'string' ? v : '');

/** A vehicle as read from the file: missing fields filled in, invalid ones emptied. @param {any} v @returns {Vehicle} */
export function normalizeVehicle(v) {
  return {
    id: v.id, name: v.name, colour: v.colour,
    shortCode: str(v.shortCode),
    transportMode: str(v.transportMode),
    fuelType: FUEL_TYPES.includes(v.fuelType) ? v.fuelType : '',
    lowFloor: v.lowFloor === true,
    seats: Number.isInteger(v.seats) && v.seats >= 0 ? v.seats : null,
    length: positive(v.length), width: positive(v.width), height: positive(v.height),
    vehicleTypeId: str(v.vehicleTypeId),
    vehicleTypeRef: str(v.vehicleTypeRef),
  };
}

/**
 * What is wrong with a vehicle's own fields (the name is checked with the other vehicles), by field.
 * Numbers are checked as typed: seats a whole number, sizes positive. @param {Vehicle | any} v
 * @returns {Record<string, true>}
 */
export function vehicleProblems(v) {
  /** @type {Record<string, true>} */
  const p = {};
  if (v.shortCode && (v.shortCode.length > SHORT_CODE_MAX || v.shortCode.includes(';'))) p.shortCode = true;
  if (v.seats != null && !(Number.isInteger(v.seats) && v.seats >= 0)) p.seats = true;
  for (const k of ['length', 'width', 'height']) if (v[k] != null && !(typeof v[k] === 'number' && Number.isFinite(v[k]) && v[k] > 0)) p[k] = true;
  const ref = str(v.vehicleTypeRef);
  if (ref && !(ref.startsWith(VEHICLE_TYPE_REF_PREFIX) && /^[A-Za-z0-9_-]+$/.test(ref.slice(VEHICLE_TYPE_REF_PREFIX.length)))) p.vehicleTypeRef = true;
  return p;
}

/** What the timetable shows for a vehicle: its short code, or its name. @param {{ name: string, shortCode?: string }} v */
export const vehicleShown = (v) => v.shortCode || v.name;
