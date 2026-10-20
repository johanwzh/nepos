// Column labels (user 2026-10-19): the project's own list of labels a planner puts on trips ("Normal", "Rush"),
// each with a colour, in data/labels.json. A column refers to a label by its name (ERN text row); not exported.
// Vehicles (vehicles-store.js) are kept the same way; both are "tags" here.
import { readText, writeJson } from './fs.js';
import { LABELS_FILE } from './layout.js';

/** @typedef {{ id: string, name: string, colour: string }} Label */

/** Colours offered for a new label, in turn. */
export const LABEL_COLOURS = ['#2e8b57', '#2f6fb5', '#c0392b', '#d08000', '#8e44ad', '#16a085', '#7f8c8d'];

/** @param {any} l */
const isTag = (l) => l && typeof l === 'object' && typeof l.id === 'string' && typeof l.name === 'string' && /^#[0-9a-fA-F]{6}$/.test(l.colour);

/** A list of tags (id, name, colour) from a project file. @param {import('./fs.js').ProjectFs} fs @param {string} file
 *  @returns {Promise<{ list: Label[], error: null | 'unreadable' }>} */
export async function readTagList(fs, file) {
  const text = await readText(fs, file);
  if (text === null) return { list: [], error: null };
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) && value.every(isTag) ? { list: value, error: null } : { list: [], error: 'unreadable' };
  } catch {
    return { list: [], error: 'unreadable' };
  }
}

/** A new, unnamed tag with the next colour in turn. @param {number} [n] how many there are already @returns {Label} */
export function newTag(n = 0) {
  return { id: crypto.randomUUID(), name: '', colour: LABEL_COLOURS[n % LABEL_COLOURS.length] };
}

/** @param {import('./fs.js').ProjectFs} fs @returns {Promise<{ labels: Label[], error: null | 'unreadable' }>} */
export async function readLabels(fs) {
  const { list, error } = await readTagList(fs, LABELS_FILE);
  return { labels: list, error };
}

/** @param {import('./fs.js').ProjectFs} fs @param {Label[]} labels */
export async function writeLabels(fs, labels) {
  await writeJson(fs, LABELS_FILE, labels);
}

/** A new, unnamed label with the next colour in turn. @param {number} [n] how many labels there are already @returns {Label} */
export const newLabel = newTag;
