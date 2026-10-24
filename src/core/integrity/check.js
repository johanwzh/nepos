// Integrity check for ERN route files (spec §9). Runs before anyone edits a route, and again
// before export. "damaged" = Nepos would misread the file or lose data by saving it, so the UI
// opens it read-only. "outdated" = valid, but written with an older Nepos convention; saving
// (or "update") rewrites it. Issues carry codes; the UI translates them.
import { isValidDayCode, isValidCellTime, isValidDate } from '../ern/validate.js';
import { findLostRecords, dwellArrivalRows } from './roundtrip.js';
import { isValidMode } from '../modes.js';

/**
 * @typedef {{ code: string, severity: 'damaged' | 'outdated' | 'note', line?: number, detail?: string }} IntegrityIssue
 * @typedef {{ status: 'ok' | 'outdated' | 'damaged', issues: IntegrityIssue[] }} IntegrityResult
 */

// Records the Nepos parser reads and writes back. Anything else would be dropped on save.
const KNOWN = new Set(['#LEV', '#RUT', '#SEK', '#VAL', '#TRA', '#KOM', '#PER', '#TAB', '#TUR', '#TRL', '#TRC', '#FOT', '#UNT', '#TTL', '#TTC', '#TRM', '#MRK', '#EKS', '#OFF', '#UID', '#KAL', '#DSS', '#DST', '#DSK', '#BOD', '#BOF', '#INT',
  // Nepos's older names and the deprecated comment records: read, and updated to ERN 2.0
  '#MOD', '#BRA', '#CUR', '#KON', '#KOE', '#KOT']);

/**
 * @param {string} text decoded route file
 * @returns {IntegrityResult}
 */
export function checkRouteFile(text) {
  /** @type {IntegrityIssue[]} */
  const issues = [];
  /**
   * @param {string} code
   * @param {number} [line]
   * @param {string} [detail]
   */
  const damaged = (code, line, detail) => issues.push(clean({ code, severity: 'damaged', line, detail }));
  /**
   * @param {string} code
   * @param {number} [line]
   */
  const outdated = (code, line) => issues.push(clean({ code, severity: 'outdated', line }));

  let seenLEV = false, seenRUT = false, seenPER = false, inTAB = false, haveTUR = false, haveTRL = false;
  /** @type {Set<string>} */ const komLangs = new Set();
  let lastRec = ''; // #UID belongs to the record directly before it
  const dwellRows = dwellArrivalRows(text);
  let per = -1, tab = -1;
  /** @type {Set<string>} notes already given once */ const noted = new Set();
  /** @param {string} code @param {number} line */
  const noteOnce = (code, line) => { if (!noted.has(code)) issues.push({ code, severity: 'note', line }); noted.add(code); };
  /** @type {Map<string, string[]>} #DST ID → its via IDs (all languages) */ const dstVias = new Map();
  /** @type {{ id: string, line: number }[]} */ const dstLines = [];

  text.split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (!line || line.startsWith('//')) return;
    const f = line.split(';');
    const rec = f[0];
    if (!rec.startsWith('#')) { damaged('unreadable-line', n); return; }
    if (!KNOWN.has(rec)) { damaged('unsupported-record', n, rec); return; }

    switch (rec) {
      case '#LEV':
        seenLEV = true;
        if (f.length > 3) outdated('personal-data-in-lev', n);
        break;
      case '#RUT':
        seenRUT = true;
        if (f[4]) damaged('unsupported-field', n, '#RUT extra name');
        if (f[7]) damaged('unsupported-field', n, '#RUT return name');
        break;
      case '#KOM': {
        // Older files' line note: one per language (a second one would be lost); saved as #FOT -1;-1
        const lang = (f[2] ?? '').trim().toLowerCase() || 'nob';
        if (komLangs.has(lang)) damaged('extra-comment', n);
        komLangs.add(lang);
        outdated('old-line-note', n);
        break;
      }
      case '#KON':
      case '#KOE':
      case '#KOT':
        outdated('old-comment-language', n);
        break;
      case '#CUR':
      case '#BRA':
        outdated('old-record-name', n);
        break;
      case '#PER': // name and dates are not used (the period's days come from #KAL)
        per++; tab = -1;
        seenPER = true; inTAB = false; haveTUR = false; haveTRL = false;
        break;
      case '#KAL': // belongs to the #PER above it
        if (lastRec !== '#PER' && lastRec !== '#KAL') damaged('out-of-order', n, rec);
        break;
      case '#TAB':
        if (!seenPER) damaged('out-of-order', n, rec);
        inTAB = true; haveTUR = false; haveTRL = false;
        tab++;
        break;
      case '#TUR':
        if (!inTAB) damaged('out-of-order', n, rec);
        haveTUR = true;
        if (!isValidDayCode(f[2] ?? '')) damaged('invalid-day-code', n, f[2]);
        if (f.length > 7) outdated('vehicle-field', n);
        break;
      case '#TRL':
        if (!inTAB) damaged('out-of-order', n, rec);
        haveTRL = true;
        if ((f[4] ?? '').trim() === '34') outdated('old-row-layout', n); // Nepos's older row layout
        break;
      case '#TRC':
        if (!haveTRL) damaged('out-of-order', n, rec);
        if (!isValidCellTime(f[2] ?? '')) damaged('invalid-time', n, f[2]);
        if (f[4] && f[4] !== '0') damaged('unsupported-field', n, '#TRC hour offset');
        if ((parseInt(f[7] ?? '', 10) || 0) & 8) outdated('old-request-stop', n); // request stop is bit 8 now
        break;
      case '#FOT':
        if (!haveTUR) damaged('out-of-order', n, rec);
        if (/^[01]$/.test((f[4] ?? '').trim())) outdated('old-language-code', n);
        break;
      case '#TTL':
      case '#TTC':
        if (!haveTUR) damaged('out-of-order', n, rec);
        break;
      case '#MOD':
        outdated('old-record-name', n);
        if (!isValidMode(f[1] ?? '', f[2] ?? '')) damaged('invalid-mode', n, `${f[1] ?? ''} ${f[2] ?? ''}`.trim());
        break;
      case '#TRM':
        if (!isValidMode(f[1] ?? '', f[2] ?? '')) damaged('invalid-mode', n, `${f[1] ?? ''} ${f[2] ?? ''}`.trim());
        break;
      case '#EKS':
      case '#OFF':
        if (!/^[01]$/.test((f[1] ?? '').trim())) damaged('invalid-flag', n, `${rec};${f[1] ?? ''}`);
        break;
      case '#UID':
        if (lastRec !== '#TUR' && lastRec !== '#TRA') damaged('out-of-order', n, rec);
        break;
      case '#DSK': // on a waiting stop's arrival row: saved on the departure row (ERN 2.0 rule)
        if (dwellRows.has(`P${per}T${tab}R${(f[2] ?? '').trim()}C${(f[1] ?? '').trim()}`)) outdated('dest-on-arrival-row', n);
        break;
      case '#DSS': // the vehicle's sign: Nepos makes data for journey planning only
        noteOnce('sign-not-kept', n);
        break;
      case '#DST': {
        const id = (f[1] ?? '').trim();
        dstVias.set(id, [...(dstVias.get(id) ?? []), ...f.slice(4).map((v) => v.trim()).filter(Boolean)]);
        dstLines.push({ id, line: n });
        const lang = (f[3] ?? '').trim().toLowerCase();
        if (lang && lang !== 'nob') noteOnce('destination-language-not-kept', n);
        break;
      }
      case '#UNT':
        if (!haveTUR) damaged('out-of-order', n, rec);
        if (!isValidDate(f[3] ?? '') || !isValidDate(f[5] ?? '')) damaged('invalid-date', n);
        break;
    }
    lastRec = rec;
  });

  // A destination whose vias lead back to itself (the standard forbids it)
  /** @param {string} from @param {string} target @param {Set<string>} seen @returns {boolean} */
  const leadsTo = (from, target, seen) => {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (dstVias.get(from) ?? []).some((v) => leadsTo(v, target, seen));
  };
  for (const { id, line } of dstLines) {
    // Nepos reads it without the looping via, so saving repairs it
    if ((dstVias.get(id) ?? []).some((v) => leadsTo(v, id, new Set()))) issues.push({ code: 'destination-via-loop', severity: 'note', line, detail: id });
  }

  // Anything else a save would lose or change (see roundtrip.js). Lines already reported as
  // damaged above are not reported twice.
  const flagged = new Set(issues.filter((x) => x.severity === 'damaged').map((x) => x.line));
  try {
    for (const { line, record } of findLostRecords(text)) {
      if (!flagged.has(line)) damaged('lost-on-save', line, record);
    }
  } catch {
    damaged('unreadable-file');
  }

  if (!seenRUT) damaged('missing-route-record');
  if (seenRUT && !seenLEV) outdated('missing-lev');
  if (seenRUT && !seenPER) issues.push({ code: 'no-periods', severity: 'note' });

  const status = issues.some((x) => x.severity === 'damaged') ? 'damaged'
    : issues.some((x) => x.severity === 'outdated') ? 'outdated' : 'ok';
  return { status, issues };
}

/**
 * Drop undefined line/detail so issues compare cleanly.
 * @param {IntegrityIssue} issue
 */
function clean(issue) {
  if (issue.line === undefined) delete issue.line;
  if (issue.detail === undefined) delete issue.detail;
  return issue;
}

/**
 * @param {{ status: 'ok' | 'outdated' | 'damaged' }[]} results
 */
export function summarizeIntegrity(results) {
  const summary = { ok: 0, outdated: 0, damaged: 0 };
  for (const r of results) summary[r.status]++;
  return summary;
}
