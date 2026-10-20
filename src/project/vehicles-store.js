// Vehicles (user 2026-10-20): the project's own list of vehicles ("Buss 7"), in data/vehicles.json, kept like the
// labels (a name and a colour for the timetable) plus the vehicle's own data (core/vehicles.js). A column refers to a
// vehicle by its name (ERN text row, flags 512); not exported yet. This list is Nepos's go-between: a vehicle here will
// later refer to Entur's vehicle register.
import { writeJson } from './fs.js';
import { VEHICLES_FILE } from './layout.js';
import { readTagList, newTag } from './labels-store.js';
import { normalizeVehicle } from '../core/vehicles.js';

/** @typedef {import('../core/vehicles.js').Vehicle} Vehicle */

/** @param {import('./fs.js').ProjectFs} fs @returns {Promise<{ vehicles: Vehicle[], error: null | 'unreadable' }>} */
export async function readVehicles(fs) {
  const { list, error } = await readTagList(fs, VEHICLES_FILE);
  return { vehicles: list.map(normalizeVehicle), error };
}

/** @param {import('./fs.js').ProjectFs} fs @param {Vehicle[]} vehicles */
export async function writeVehicles(fs, vehicles) {
  await writeJson(fs, VEHICLES_FILE, vehicles);
}

/** A new, unnamed vehicle with the next colour in turn and a vehicle type ID in the project's codespace.
 *  @param {number} [n] how many vehicles there are already @param {string} [codespace] @returns {Vehicle} */
export function newVehicle(n = 0, codespace = '') {
  const t = newTag(n);
  return { ...normalizeVehicle(t), vehicleTypeId: vehicleTypeIdFor(codespace) };
}

/** A new vehicle type ID: "ABC:VehicleType:<uuid>". @param {string} codespace */
export const vehicleTypeIdFor = (codespace) => `${codespace}:VehicleType:${crypto.randomUUID()}`;
