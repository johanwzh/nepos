// The export probe (user 2026-10-30): reads a NeTEx export as XML and checks it twice — on its own (every reference
// resolves, passing times run forward, every trip runs on some day) and against the project it came from (every trip of
// every table, generated interval trips included, with its stops, times, day offsets, notes and operating days).
// The expected side uses Nepos's own model of a trip (parse, blocks, calendars, journeys) — the same definition as the
// export; what is checked independently is the XML that was actually written. Add a check here with each new feature
// that changes the export (docs/RELEASING.md §4).
import { parseERN } from '../../src/core/ern/parse.js';
import { UUID_PATTERN } from '../../src/core/ern/serialize.js';
import { expandRoute } from '../../src/core/blocks.js';
import { unionDays, tripDays, isoDate } from '../../src/core/calendars.js';
import { tripVariants } from '../../src/core/netex/journeys.js';
import { uuid5 } from '../../src/core/uuid5.js';

/** @param {string} s */
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
/** @param {string} block @param {string} tag */
const val = (block, tag) => { const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(block); return m ? unesc(m[1]) : undefined; };
/** @param {string} block @param {string} tag */
const refOf = (block, tag) => new RegExp(`<${tag} ref="([^"]+)"`).exec(block)?.[1];
/** @param {string} xml @param {string} tag */
const blocks = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag} [^>]*?id="([^"]+)"[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => ({ id: m[1], body: m[2] }));

/** Minutes from day 0. @param {string | undefined} time HH:MM:SS @param {string | undefined} off */
const xmlMins = (time, off) => (time === undefined ? null : Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + 1440 * Number(off || 0));
/** @param {any} cell */
const cellMins = (cell) => (cell ? (cell.dayOffset || 0) * 1440 + Number(cell.time.slice(0, 2)) * 60 + Number(cell.time.slice(2, 4)) : null);
/** 14:05+1 @param {number | null} m */
export const fmt = (m) => (m == null ? '—' : `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}${m >= 1440 ? `+${Math.floor(m / 1440)}` : ''}`);

/**
 * What the XML says, per file and across files.
 * @param {Map<string, string>} files name → XML
 */
export function readExport(files) {
  const all = [...files.values()].join('\n');
  /** @type {Map<string, string>} id → element */
  const ids = new Map();
  /** @type {string[]} a repeat within one file (the Codespaces, for one, are in every file) */
  const duplicates = [];
  for (const [name, xml] of files) {
    /** @type {Set<string>} */
    const seen = new Set();
    for (const m of xml.matchAll(/<([A-Za-z]+)\s[^>]*?\bid="([^"]+)"/g)) {
      if (seen.has(`${m[1]} ${m[2]}`)) duplicates.push(`${m[1]} ${m[2]} (${name})`);
      seen.add(`${m[1]} ${m[2]}`);
      ids.set(m[2], m[1]);
    }
  }
  const refs = [...all.matchAll(/\bref="([^"]+)"/g)].map((m) => m[1]);
  /** @type {Map<string, string>} ScheduledStopPoint → Quay */
  const quayOf = new Map();
  for (const { body } of blocks(all, 'PassengerStopAssignment')) quayOf.set(/** @type {string} */ (refOf(body, 'ScheduledStopPointRef')), /** @type {string} */ (refOf(body, 'QuayRef')));
  /** @type {Map<string, string[]>} JourneyPattern → its StopPointInJourneyPattern IDs in order */
  const jpPoints = new Map();
  /** @type {Map<string, string>} StopPointInJourneyPattern → ScheduledStopPoint */
  const spOf = new Map();
  for (const { id, body } of blocks(all, 'JourneyPattern')) {
    const pts = blocks(body, 'StopPointInJourneyPattern');
    jpPoints.set(id, pts.map((p) => p.id));
    for (const p of pts) spOf.set(p.id, /** @type {string} */ (refOf(p.body, 'ScheduledStopPointRef')));
  }
  /** @type {Map<string, string>} Notice → text */
  const noticeText = new Map(blocks(all, 'Notice').map(({ id, body }) => [id, val(body, 'Text') ?? '']));
  /** @type {Map<string, string[]>} noticed object → notice texts */
  const notesOn = new Map();
  for (const { body } of blocks(all, 'NoticeAssignment')) {
    const obj = /** @type {string} */ (refOf(body, 'NoticedObjectRef'));
    notesOn.set(obj, [...(notesOn.get(obj) ?? []), noticeText.get(/** @type {string} */ (refOf(body, 'NoticeRef'))) ?? '?']);
  }
  /** @type {Map<string, { file: string, jp: string, pts: { id: string, sp: string, arr: number | null, dep: number | null, seconds: boolean }[] }>} */
  const sjs = new Map();
  for (const [file, xml] of files) for (const { id, body } of blocks(xml, 'ServiceJourney')) {
    const pts = blocks(body, 'TimetabledPassingTime').map((p) => {
      const at = val(p.body, 'ArrivalTime'), dt = val(p.body, 'DepartureTime');
      return { id: p.id, sp: /** @type {string} */ (refOf(p.body, 'StopPointInJourneyPatternRef')), arr: xmlMins(at, val(p.body, 'ArrivalDayOffset')), dep: xmlMins(dt, val(p.body, 'DepartureDayOffset')), seconds: [at, dt].some((x) => x && !x.endsWith(':00')) };
    });
    sjs.set(id, { file, jp: /** @type {string} */ (refOf(body, 'JourneyPatternRef')), pts });
  }
  /** @type {Map<string, string[]>} ServiceJourney → its days (YYYY-MM-DD) */
  const daysOf = new Map();
  /** @type {string[]} */
  const dsjDuplicates = [];
  for (const { body } of blocks(all, 'DatedServiceJourney')) {
    const sj = /** @type {string} */ (refOf(body, 'ServiceJourneyRef')), day = (refOf(body, 'OperatingDayRef') ?? '').split(':').pop() ?? '';
    const list = daysOf.get(sj) ?? [];
    if (list.includes(day)) dsjDuplicates.push(`${sj} ${day}`);
    list.push(day); daysOf.set(sj, list);
  }
  const interchanges = blocks(all, 'ServiceJourneyInterchange').map(({ id, body }) => ({ id, from: refOf(body, 'FromJourneyRef'), to: refOf(body, 'ToJourneyRef'), fromPt: refOf(body, 'FromPointRef'), toPt: refOf(body, 'ToPointRef') }));
  return { ids, duplicates, refs, quayOf, jpPoints, spOf, notesOn, sjs, daysOf, dsjDuplicates, interchanges };
}

/**
 * The trips the project should export, as the export defines them.
 * @param {{ codespace: string, routes: { code: string, text: string }[], calendars: any[] }} project
 */
export function expectedTrips({ codespace: cs, routes, calendars }) {
  /** @type {Map<string, { route: string, label: string, calls: { stopId: string, arr: number | null, dep: number | null, notes: string[] }[], note: string, days: string[] }>} */
  const trips = new Map();
  let interchanges = 0;
  for (const { code, text } of routes) {
    const rs = expandRoute(parseERN(text));
    (rs.tableSets ?? []).forEach((/** @type {any} */ set, /** @type {number} */ di) => {
      for (const per of (rs.periods ?? []).filter((/** @type {any} */ p) => p.setId === set.id)) {
        const grid = rs.grids[`${per.id}:${set.id}`] ?? { stops: [], cols: [] };
        const periodDays = unionDays(calendars.filter((c) => per.calendarIds.includes(c.id)));
        /** @param {any} col @param {number} ci */
        const baseId = (col, ci) => (col?.uid && UUID_PATTERN.test(col.uid) ? `${cs}:ServiceJourney:${col.uid}` : `${cs}:ServiceJourney:${code}-${di}-${per.id}-${ci}`);
        /** @param {string} base @param {any} v */
        const variantId = (base, v) => (v.main ? base : `${cs}:ServiceJourney:${uuid5(`${base}|calls:${v.calls.map((/** @type {any} */ c) => c.ri).join(',')}`)}`);
        const daysOfCol = (/** @type {any} */ col) => tripDays(periodDays, col);
        grid.cols.forEach((/** @type {any} */ col, /** @type {number} */ ci) => {
          for (const v of tripVariants(grid, col, daysOfCol(col))) {
            if (v.calls.length < 2 || !v.days.length) continue;
            const id = variantId(baseId(col, ci), v);
            const calls = v.calls.map((/** @type {any} */ c, /** @type {number} */ i) => {
              const last = i === v.calls.length - 1;
              return { stopId: c.stopId, arr: cellMins(last ? (c.arrCell ?? c.depCell) : i === 0 ? null : c.arrCell), dep: last ? null : cellMins(c.depCell),
                notes: [c.arrCell, c.depCell].map((x) => x?.note?.trim()).filter(Boolean) };
            });
            const label = `${rs.publicCode || code} ${set.name ?? ''} ${col.dayCode} ${fmt(calls[0].dep)}${col.parentCi != null ? ' (interval)' : ''}`;
            trips.set(id, { route: code, label, calls, note: col.note?.trim() ?? '', days: v.days.map(isoDate) });
            // Interchanges, on the same conditions as the export (line.js)
            for (let ri = 0; ri < grid.stops.length; ri++) {
              const cell = col.cells[ri];
              if (!cell?.interchange || !v.calls.some((/** @type {any} */ c) => c.ri === ri || (c.arrCell && c.ri - 1 === ri))) continue;
              const { targetC, targetR } = cell.interchange;
              const tgt = grid.cols[targetC]?.cells?.[targetR];
              if (!tgt?.time || tgt.time === '|' || grid.stops[ri]?.stopId == null || grid.stops[targetR]?.stopId == null) continue;
              const tv = tripVariants(grid, grid.cols[targetC], daysOfCol(grid.cols[targetC]));
              if (tv.some((x) => x.calls.some((/** @type {any} */ c) => c.ri === targetR || (c.arrCell && c.ri - 1 === targetR)))) interchanges++;
            }
          }
        });
      }
    });
  }
  return { trips, interchanges };
}

/**
 * Every check. Errors are what is wrong in the export; warnings are worth a look.
 * @param {{ files: Map<string, string>, project?: { codespace: string, routes: { code: string, text: string }[], calendars: any[] } }} input
 */
export function probeExport({ files, project }) {
  /** @type {string[]} */ const errors = [];
  /** @type {string[]} */ const warnings = [];
  const x = readExport(files);
  const names = [...files.keys()];
  const cs = project?.codespace ?? names.find((n) => n.startsWith('_'))?.slice(1).split('-')[0] ?? '';
  const own = new RegExp(`^${cs}:`, 'i');

  // ── The XML on its own ──
  if (!names.some((n) => /^_.*-shared\.xml$/.test(n))) errors.push('no shared file (_CS-shared.xml)');
  for (const d of x.duplicates) errors.push(`duplicate id: ${d}`);
  const unresolved = [...new Set(x.refs.filter((r) => own.test(r) && !x.ids.has(r)))];
  for (const r of unresolved) errors.push(`reference to nothing: ${r}`);
  for (const d of x.dsjDuplicates) errors.push(`a trip twice on one day: ${d}`);
  let maxOffset = 0, afterMidnight = 0, passingTimes = 0;
  for (const [id, sj] of x.sjs) {
    const pts = x.jpPoints.get(sj.jp) ?? [];
    passingTimes += sj.pts.length;
    if (sj.pts.length < 2) errors.push(`${id}: fewer than two passing times`);
    if (sj.pts.length !== pts.length || sj.pts.some((p, i) => p.sp !== pts[i])) errors.push(`${id}: passing times do not follow its JourneyPattern's stop points`);
    if (sj.pts[0]?.arr != null) errors.push(`${id}: the first call has an arrival`);
    if (sj.pts[0]?.dep == null) errors.push(`${id}: the first call has no departure`);
    const last = sj.pts[sj.pts.length - 1];
    if (last && (last.arr == null || last.dep != null)) errors.push(`${id}: the last call should only arrive`);
    if (sj.pts.some((p) => p.seconds)) warnings.push(`${id}: times with seconds`);
    let prev = -1;
    sj.pts.forEach((p, i) => {
      for (const m of [p.arr, p.dep]) {
        if (m == null) continue;
        if (m < prev) errors.push(`${id}: time goes backwards at call ${i + 1} (${fmt(m)} after ${fmt(prev)})`);
        prev = Math.max(prev, m);
        maxOffset = Math.max(maxOffset, Math.floor(m / 1440));
      }
    });
    if ((sj.pts[0]?.dep ?? 0) >= 1440) afterMidnight++;
    if (!x.daysOf.get(id)?.length) errors.push(`${id}: runs on no day (no DatedServiceJourney)`);
  }
  for (const ix of x.interchanges) {
    for (const [sj, pt, side] of /** @type {const} */ ([[ix.from, ix.fromPt, 'from'], [ix.to, ix.toPt, 'to']])) {
      const j = sj ? x.sjs.get(sj) : undefined;
      if (!j) { errors.push(`${ix.id}: its ${side} journey is not in the export`); continue; }
      if (!j.pts.some((p) => x.spOf.get(p.sp) === pt)) errors.push(`${ix.id}: the ${side} journey does not call at ${pt}`);
    }
  }

  // ── Against the project ──
  let expected = 0;
  if (project) {
    const exp = expectedTrips(project);
    expected = exp.trips.size;
    for (const [id, t] of exp.trips) {
      const sj = x.sjs.get(id);
      if (!sj) { errors.push(`${t.label}: missing from the export (${id})`); continue; }
      if (sj.pts.length !== t.calls.length) { errors.push(`${t.label}: ${sj.pts.length} calls in the export, ${t.calls.length} in the timetable`); continue; }
      t.calls.forEach((c, i) => {
        const p = sj.pts[i];
        const quay = x.quayOf.get(x.spOf.get(p.sp) ?? '');
        if (quay !== c.stopId) errors.push(`${t.label}, call ${i + 1}: stop ${quay} in the export, ${c.stopId} in the timetable`);
        if (p.arr !== c.arr) errors.push(`${t.label}, call ${i + 1}: arrives ${fmt(p.arr)} in the export, ${fmt(c.arr)} in the timetable`);
        if (p.dep !== c.dep) errors.push(`${t.label}, call ${i + 1}: departs ${fmt(p.dep)} in the export, ${fmt(c.dep)} in the timetable`);
        const notes = (x.notesOn.get(p.id) ?? []).slice().sort().join(' | '), want = c.notes.slice().sort().join(' | ');
        if (notes !== want) errors.push(`${t.label}, call ${i + 1}: notes "${notes}" in the export, "${want}" in the timetable`);
      });
      const sjNotes = (x.notesOn.get(id) ?? []).join(' | ');
      if (sjNotes !== t.note) errors.push(`${t.label}: trip note "${sjNotes}" in the export, "${t.note}" in the timetable`);
      const days = (x.daysOf.get(id) ?? []).slice().sort();
      if (days.join() !== t.days.join()) {
        const extra = days.filter((d) => !t.days.includes(d)), missing = t.days.filter((d) => !days.includes(d));
        errors.push(`${t.label}: operating days differ — ${missing.length} missing (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ' …' : ''}), ${extra.length} extra (${extra.slice(0, 3).join(', ')}${extra.length > 3 ? ' …' : ''})`);
      }
    }
    for (const id of x.sjs.keys()) if (!exp.trips.has(id)) errors.push(`in the export but not in the timetable: ${id}`);
    if (exp.interchanges !== x.interchanges.length) errors.push(`${x.interchanges.length} interchanges in the export, ${exp.interchanges} in the timetables`);
  }

  const stats = { files: names.length, journeys: x.sjs.size, expected, passingTimes, datedJourneys: [...x.daysOf.values()].reduce((n, d) => n + d.length, 0), maxDayOffset: maxOffset, startAfterMidnight: afterMidnight, interchanges: x.interchanges.length, references: x.refs.length };
  return { errors, warnings, stats };
}
