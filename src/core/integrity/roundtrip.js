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
 * @param {Map<string, string>} dst Bokmål #DST ID → its text and via texts
 * @returns {string | null} null: a record Nepos leaves out on purpose
 */
function normalize(line, dst) {
  const f = line.split(';');
  switch (f[0]) {
    case '#LEV': // personal data is removed on purpose
      return f.slice(0, 3).join(';');
    case '#TTL': { // the trip-number row: its label and fonts follow the line's mode on purpose; the label and vehicle rows keep their flag
      const flags = parseInt(f[6] ?? '', 10) || 0;
      return `#TTL;${f[1]}${flags & 1 ? ';label' : flags & 2 ? ';vehicle' : ''}`;
    }
    case '#TTC': // a column's trip number: only the column and the number count
      return `#TTC;${f[1]};${f[4] ?? ''}`;
    case '#TUR': // the 1.x vehicle field is removed on purpose
      return f.slice(0, 7).join(';');
    case '#UID': // a valid column ID is kept; an invalid or duplicated one is replaced on purpose
      return '#UID';
    case '#SEK': { // the ID is trimmed; a full NeTEx ID decides the role flags
      f[1] = (f[1] ?? '').trim();
      const role = orgRole(f[1]);
      if (role) { f[3] = role === 'authority' ? '1' : '0'; f[4] = role === 'operator' ? '1' : '0'; }
      return f.join(';');
    }
    case '#TRL': { // both row layouts (ERN 2.0 and Nepos's older one) compare as row, stop, name, bold, underline, price, km, zone, flags, platform
      const old = (f[4] ?? '').trim() === '34';
      const bits = Math.max(0, parseInt(old ? f[5] : f[4], 10) || 0);
      const p = Number(old ? f[6] : f[7]);
      const price = (old ? f[6] : f[7]) !== undefined && Number.isFinite(p) && p >= 0 ? p.toFixed(6) : '-1';
      const rest = old ? ['-1', '-1', '0', f[9] ?? '-1'] : [f[5], f[6], f[8], f[9]].map((v, i) => (v ?? '').trim() || ['-1', '-1', '0', '-1'][i]);
      return ['#TRL', f[1], f[2], f[3], (bits & (old ? 1 : 2)) ? 1 : 0, (bits & (old ? 2 : 8)) ? 1 : 0, price, ...rest].join(';');
    }
    case '#TRC': { // request stop: bit 3 in Nepos's older files, bit 8 in ERN 2.0
      const m = parseInt(f[7] ?? '', 10) || 0;
      if (m & 8) f[7] = String((m & ~8) | 256);
      return f.join(';');
    }
    case '#BOD': { // all fifteen fields; an empty bitmask may be written as 0
      const g = [...f, ...Array(15).fill('')].slice(0, 15);
      for (const i of [10, 11]) if (g[i] === '0') g[i] = '';
      return g.join(';');
    }
    case '#BOF': // empty language = Bokmål
      return `#BOF;${f[1]};${f[2]};${f[3] ?? ''};${(f[4] ?? '').trim() || 'nob'}`;
    case '#MOD': // renamed in ERN 2.0
      return ['#TRM', ...f.slice(1)].join(';');
    case '#BRA':
      return ['#MRK', ...f.slice(1)].join(';');
    case '#DSS': // the vehicle's sign is not kept (the integrity check notes it)
      return null;
    case '#DST': { // destinations are renumbered and compacted on save: compared where they are used (#DSK)
      return null;
    }
    case '#DSK': { // only the destination counts, by its text and vias
      const id = (f[4] ?? '').trim();
      return id ? `#DSK;${f[1]};${f[2]};${dst.get(id) ?? `?${id}`}` : null;
    }
    case '#CUR': // Nepos 2 does not keep the currency (ERN 2.0: #VAL)
    case '#VAL':
      return null;
    case '#KOM': case '#KON': case '#KOE': case '#KOT': { // the line note, one per language: saved as #FOT -1;-1
      const lang = f[0] === '#KOM' ? ((f[2] ?? '').trim().toLowerCase() || 'nob') : { '#KON': 'nno', '#KOE': 'eng', '#KOT': 'deu' }[f[0]];
      return `#FOT;-1;-1;${f[1] ?? ''};${lang}`;
    }
    case '#FOT': { // the language: empty or 0 = Bokmål
      const lang = (f[4] ?? '').trim().toLowerCase();
      if (lang === '' || lang === '0') f[4] = 'nob';
      return f.slice(0, 5).join(';');
    }
    default:
      return line;
  }
}

/**
 * The arrival rows of waiting stops, per column, as "P<period>T<table>R<row>C<column>": a row whose stop is
 * also the next row's, in a column with a time in both. A destination there belongs on the next row.
 * @param {string} text
 * @returns {Set<string>}
 */
export function dwellArrivalRows(text) {
  /** @type {Set<string>} */ const out = new Set();
  let per = -1, tab = -1;
  /** @type {{ stop: string, cols: Set<string> }[]} */ let rows = [];
  const flush = () => {
    rows.forEach((r, i) => {
      const next = rows[i + 1];
      if (next && r.stop && r.stop === next.stop) for (const c of r.cols) if (next.cols.has(c)) out.add(`P${per}T${tab}R${i}C${c}`);
    });
    rows = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const f = raw.trim().split(';');
    if (f[0] === '#PER') { flush(); per++; tab = -1; }
    else if (f[0] === '#TAB') { flush(); tab++; }
    else if (f[0] === '#TRA') flush();
    else if (f[0] === '#TRL') { const id = (f[2] ?? '').trim(); rows.push({ stop: id === '' || /^-?\d+$/.test(id) && Number(id) <= 0 ? '' : id, cols: new Set() }); }
    else if (f[0] === '#TRC' && rows.length && (f[2] ?? '') && f[2] !== '|') rows[rows.length - 1].cols.add(f[1]);
  }
  flush();
  return out;
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
  // Bokmål destinations by ID, as text and via texts: their IDs change on save
  /** @type {Map<string, { text: string, vias: string[] }>} */ const recs = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const f = raw.trim().split(';');
    const lang = (f[3] ?? '').trim().toLowerCase();
    if (f[0] === '#DST' && (!lang || lang === 'nob')) recs.set((f[1] ?? '').trim(), { text: f[2] ?? '', vias: f.slice(4).map((v) => v.trim()).filter(Boolean) });
  }
  /** @type {Map<string, string>} */ const dst = new Map();
  /** A via that leads back to the record is left out, as the parser does. @param {string} from @param {string} target @param {Set<string>} seen @returns {boolean} */
  const leadsTo = (from, target, seen) => from === target || (!seen.has(from) && (seen.add(from), (recs.get(from)?.vias ?? []).some((v) => leadsTo(v, target, seen))));
  for (const [id, r] of recs) dst.set(id, [r.text, ...r.vias.filter((v) => recs.has(v) && !leadsTo(v, id, new Set())).map((v) => recs.get(v)?.text)].join('|'));
  const dwellRows = dwellArrivalRows(text);
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const record = line.split(';')[0];
    let norm = normalize(line, dst);
    // A destination on a waiting stop's arrival row is saved on its departure row (ERN 2.0 rule)
    if (norm && record === '#DSK') { const g = norm.split(';'); if (dwellRows.has(`P${per}T${tab}R${g[2]}C${g[1]}`)) { g[2] = String(Number(g[2]) + 1); norm = g.join(';'); } }
    if (norm === null) return; // left out on purpose
    let where = '';
    if (['#KOM', '#KON', '#KOE', '#KOT'].includes(record)) where = 'P0T0'; // the line note goes into the first table
    else if (record === '#PER') { per++; tab = -1; row = -1; where = `P${per}`; }
    else if (record === '#KAL') where = `P${per}`;
    else if (record === '#TAB') { tab++; row = -1; where = `P${per}T${tab}`; }
    else if ((record === '#BOD' || record === '#BOF') && norm.split(';')[1] === '-1') where = 'P0T0'; // the line's booking goes into the first table
    else if (record === '#TUR' || record === '#FOT' || record === '#UNT' || record === '#DSK' || record === '#BOD' || record === '#BOF' || record === '#INT') where = `P${per}T${tab}`;
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
