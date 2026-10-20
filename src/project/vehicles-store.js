// Vehicles (user 2026-10-20): the project's own list of vehicles ("Buss 7"), each with a colour, in data/vehicles.json,
// kept like the labels. A column refers to a vehicle by its name (ERN text row, flags 512); not exported yet. This list
// is Nepos's go-between: a vehicle here will later refer to Entur's vehicle register.
import { writeJson } from './fs.js';
import { VEHICLES_FILE } from './layout.js';
import { readTagList, newTag } from './labels-store.js';

/** @typedef {import('./labels-store.js').Label} Vehicle */

/** @param {import('./fs.js').ProjectFs} fs @returns {Promise<{ vehicles: Vehicle[], error: null | 'unreadable' }>} */
export async function readVehicles(fs) {
  const { list, error } = await readTagList(fs, VEHICLES_FILE);
  return { vehicles: list, error };
}

/** @param {import('./fs.js').ProjectFs} fs @param {Vehicle[]} vehicles */
export async function writeVehicles(fs, vehicles) {
  await writeJson(fs, VEHICLES_FILE, vehicles);
}

/** A new, unnamed vehicle with the next colour in turn. @param {number} [n] how many vehicles there are already @returns {Vehicle} */
export const newVehicle = newTag;
