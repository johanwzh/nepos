// Column labels (user 2026-10-19): the project's own list of labels a planner puts on trips ("Normal", "Rush"),
// each with a colour, in data/labels.json. A column refers to a label by its name (ERN text row); not exported.
import { readText, writeJson } from './fs.js';
import { LABELS_FILE } from './layout.js';

/** @typedef {{ id: string, name: string, colour: string }} Label */

/** Colours offered for a new label, in turn. */
export const LABEL_COLOURS = ['#2e8b57', '#2f6fb5', '#c0392b', '#d08000', '#8e44ad', '#16a085', '#7f8c8d'];

/** @param {any} l */
const isLabel = (l) => l && typeof l === 'object' && typeof l.id === 'string' && typeof l.name === 'string' && /^#[0-9a-fA-F]{6}$/.test(l.colour);

/** @param {import('./fs.js').ProjectFs} fs @returns {Promise<{ labels: Label[], error: null | 'unreadable' }>} */
export async function readLabels(fs) {
  const text = await readText(fs, LABELS_FILE);
  if (text === null) return { labels: [], error: null };
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) && value.every(isLabel) ? { labels: value, error: null } : { labels: [], error: 'unreadable' };
  } catch {
    return { labels: [], error: 'unreadable' };
  }
}

/** @param {import('./fs.js').ProjectFs} fs @param {Label[]} labels */
export async function writeLabels(fs, labels) {
  await writeJson(fs, LABELS_FILE, labels);
}

/** A new, unnamed label with the next colour in turn. @param {number} [n] how many labels there are already @returns {Label} */
export function newLabel(n = 0) {
  return { id: crypto.randomUUID(), name: '', colour: LABEL_COLOURS[n % LABEL_COLOURS.length] };
}
