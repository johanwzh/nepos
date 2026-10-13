// Finds records a save would lose or change. Rather than listing every way the parser and
// serializer can drop data, it does the save — parse, then serialize — and compares the result
// with the original, record by record. Records are compared with their position (period, table,
// row) but not their order inside a table, so footnotes written in a different order still match.
// Differences Nepos makes on purpose (see docs/ern/ern-format.md) are normalised away first.
import { parseERN } from '../ern/parse.js';
import { serializeERN } from '../ern/serialize.js';
import { orgRole } from '../orgs.js';

/**
 * Apply the deliberate Nepos 2 changes to one record, so they do not count as losses.
 * @param {string} line trimmed record line
 */
function normalize(line) {
  const f = line.split(';');
  switch (f[0]) {
    case '#LEV': // personal data is removed on purpose
      return f.slice(0, 3).join(';');
    case '#TUR': // the 1.x vehicle field is removed on purpose
      return f.slice(0, 7).join(';');
    case '#SEK': { // the ID is trimmed; a full NeTEx ID decides the role flags
      f[1] = (f[1] ?? '').trim();
      const role = orgRole(f[1]);
      if (role) { f[3] = role === 'authority' ? '1' : '0'; f[4] = role === 'operator' ? '1' : '0'; }
      return f.join(';');
    }
    case '#TRL': { // the price is written with six decimals
      const price = Number(f[6]);
      if (f[6] !== undefined && f[6] !== '' && Number.isFinite(price) && price >= 0) f[6] = price.toFixed(6);
      return f.join(';');
    }
    default:
      return line;
  }
}

/**
 * Key each record by where it sits in the file. Route-level records have no position.
 * @param {string} text
 * @returns {{ line: number, key: string, record: string }[]}
 */
function keyRecords(text) {
  let per = -1, tab = -1, row = -1;
  /** @type {{ line: number, key: string, record: string }[]} */
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const record = line.split(';')[0];
    const norm = normalize(line);
    let where = '';
    if (record === '#PER') { per++; tab = -1; row = -1; where = `P${per}`; }
    else if (record === '#TAB') { tab++; row = -1; where = `P${per}T${tab}`; }
    else if (record === '#TUR' || record === '#FOT' || record === '#UNT') where = `P${per}T${tab}`;
    else if (record === '#TRL') { row++; where = `P${per}T${tab}R${row}`; }
    else if (record === '#TRC') where = `P${per}T${tab}R${row}`;
    out.push({ line: i + 1, key: `${where}|${norm}`, record });
  });
  return out;
}

/**
 * Records in `text` that would not survive a save, with their line numbers.
 * @param {string} text decoded route file
 * @returns {{ line: number, record: string }[]}
 */
export function findLostRecords(text) {
  const lev = text.split(/\r?\n/).map((l) => l.trim().split(';')).find((f) => f[0] === '#LEV') ?? [];
  const rut = text.split(/\r?\n/).map((l) => l.trim().split(';')).find((f) => f[0] === '#RUT') ?? [];
  const saved = serializeERN(parseERN(text), rut[2] ?? '', { delivery: { name: lev[1] ?? '', codespace: lev[2] ?? '' } });

  /** @type {Map<string, number>} */
  const available = new Map();
  for (const { key } of keyRecords(saved)) available.set(key, (available.get(key) ?? 0) + 1);

  /** @type {{ line: number, record: string }[]} */
  const lost = [];
  for (const { line, key, record } of keyRecords(text)) {
    const left = available.get(key) ?? 0;
    if (left > 0) available.set(key, left - 1);
    else lost.push({ line, record });
  }
  return lost;
}
