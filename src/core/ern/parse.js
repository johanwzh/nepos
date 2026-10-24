// ERN parser, ported from Nepos 1.5.7 (nepos.html lines 2812–3005). See docs/ern/ern-format.md.
import { orgRole } from '../orgs.js';
import { modeFromErn } from '../modes.js';
import { UUID_PATTERN } from './serialize.js';
import { normalizeDests, servedRows } from '../destinations.js';
import { readDirection } from '../directions.js';
import { normalizeBooking, fromBits, BOOKING_METHODS, BUY_WHEN } from '../booking.js';

/**
 * Parse an ERN route file into a route state.
 * @param {string} text decoded file contents
 * @param {{ lang?: 'en' | 'no' }} [opts] kept for callers; table sets are named in the file
 */
export function parseERN(text, { lang: _lang = 'en' } = {}) {
    const rs = {
        routeName:'', publicCode:'', privateCode:'', mode:'', submode:'', brandingId:'', exported:true, isPublic:true, transportMode:6, kom:'', komOther:[], sek:[],
        // Table sets (#TRA) with their periods (#PER + #KAL), one grid per period (timetable
        // structure spec §1–§4). Grids are keyed `${periodId}:${tableSetId}`.
        tableSets:[], periods:[], activeSet:null, activePer:null,
        nextId:1, grids:{}
    };
    let curPer = null, curSet = null, inTab = false, lastRec = '';
    let sawMod = false;
    let cols = [], rows = [], cellMap = {};
    // Notes (#FOT) and dates (#UNT) for the current table, put on their column or cell once it is built
    let _pendingNotes = [];
    // The trip-number row (#TTL) of the current table; numbers (#TTC) go on the columns
    let _tripRow = false, _ttlRow = NaN;
    // The label row (#TTL with field 5 bit 0, user 2026-10-19) and the vehicle row (bit 1, user 2026-10-20): their
    // #TTC cells go on the columns
    let _labelRow = false, _vehicleRow = false, _ttlIsLabel = false, _ttlIsVehicle = false;
    // Destinations (#DST, Bokmål only: id → text and via IDs) and where they start (#DSK), resolved
    // once the whole file is read
    /** @type {Map<string, { text: string, viaIds: string[] }>} */
    const dstMap = new Map();
    /** @type {{ ci: number, ri: number, dstId: string }[]} */
    let _pendingDsk = [];
    /** @type {{ grid: any, links: { ci: number, ri: number, dstId: string }[] }[]} */
    const dskByGrid = [];

    function finalizeTAB() {
        if (!curPer || !curSet || !inTab) return;
        inTab = false;
        const key = `${curPer.id}:${curSet.id}`;
        const colXtoIdx = {};
        cols.forEach((c,i) => { colXtoIdx[c.x] = i; });
        const gCols2 = cols.map(c => ({
            dayCode: c.dayCode, uid: c.uid ?? null, note: '', dates: [], tripNo: c.tripNo ?? '', label: c.label ?? '', vehicle: c.vehicle ?? '',
            cells: rows.map((_,ri) => {
                const cell = cellMap[`${c.x}:${ri}`];
                return cell || null;
            })
        }));
        // Detect dwell pairs: consecutive rows with the same stopId where the SAME column
        // has times in BOTH rows. This distinguishes a true dwell (passenger stays on board
        // within one trip) from a multi-day split (same stop appears twice because one column
        // arrives and a different column departs — stay-seated interchange between services).
        const stopsCopy = rows.map(r=>({...r}));
        for (let i=0; i<stopsCopy.length-1; i++) {
            if (stopsCopy[i].stopId != null && stopsCopy[i].stopId === stopsCopy[i+1].stopId) {
                const trueDwell = gCols2.some(col => {
                    const ci = col.cells[i],   ci1 = col.cells[i+1];
                    return ci?.time && ci.time!=='|' && ci1?.time && ci1.time!=='|';
                });
                if (trueDwell) stopsCopy[i].isDwellArr = true;
            }
        }
        const grid = { stops: stopsCopy, cols: gCols2, tripRow: _tripRow, labelRow: _labelRow, vehicleRow: _vehicleRow };
        // Notes and dates from #FOT/#UNT: on the column (row -1) or on a cell that has a time
        _pendingNotes.forEach(({ ci, ri, note, date, booking }) => {
            if (ci < 0 || ci >= grid.cols.length) return;
            const target = ri === -1 ? grid.cols[ci] : (ri >= 0 && ri < grid.stops.length ? grid.cols[ci].cells[ri] : null);
            if (!target) return;
            if (note != null) target.note = note;
            if (date) (target.dates ??= []).push(date);
            if (booking) { const b = normalizeBooking({ ...(target.booking ?? {}), ...booking }); if (b) target.booking = b; }
        });
        rs.grids[key] = grid;
        dskByGrid.push({ grid, links: _pendingDsk });
        cols=[]; rows=[]; cellMap={};
        _pendingNotes = [];
        _pendingDsk = [];
        _tripRow = false; _ttlRow = NaN; _labelRow = false; _vehicleRow = false; _ttlIsLabel = false; _ttlIsVehicle = false;
    }

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('//')) continue;
        const f = line.split(';');
        switch (f[0]) {
            case '#LEV': break; // handled by publicationdelivery.json
            case '#RUT':
                rs.privateCode   = (f[1]||'').trim() === '-1' ? '' : (f[1]||'').trim();
                rs.publicCode    = f[2]||'';
                rs.routeName     = f[3]||'';
                rs.transportMode = f[5] === undefined || f[5].trim() === '' ? 6 : (parseInt(f[5]) || 0);
                break;
            case '#SEK': {
                // Nepos 2: the org ID is text, normally a full NeTEx ID whose role wins over the flags.
                const orgId = (f[1]||'').trim();
                if (!orgId || orgId === '-1') break;
                const role = orgRole(orgId);
                rs.sek.push({
                    orgId,
                    isAuthority: role ? role === 'authority' : parseInt(f[3])===1,
                    isOperator:  role ? role === 'operator'  : parseInt(f[4])===1,
                    name:        f[2]||'',   // written back if the org list lacks this org
                });
                break;
            }
            case '#TRA':
                // A table set: a master pattern the user navigates between (spec §2).
                finalizeTAB();
                curSet = { id: rs.nextId++, name: f[1]||'', uid: null, direction: readDirection(f[2]) }; // field 1: NeTEx DirectionType
                rs.tableSets.push(curSet);
                if (rs.activeSet == null) rs.activeSet = curSet.id;
                curPer = null;
                break;
            case '#TRM': // transport mode (ERN 2.0); #MOD in Nepos's older files
            case '#MOD':
                rs.mode = (f[1]||'').trim(); rs.submode = (f[2]||'').trim(); sawMod = true;
                break;
            case '#MRK': // brand (ERN 2.0); #BRA in Nepos's older files
            case '#BRA':
                rs.brandingId = (f[1]||'').trim();
                break;
            case '#EKS': // Eksporteres (navigation spec §4); only 0 means no
                rs.exported = (f[1]||'').trim() !== '0';
                break;
            case '#OFF': // Offentlig
                rs.isPublic = (f[1]||'').trim() !== '0';
                break;
            case '#UID': {
                // Belongs to the record directly before it: a table set (#TRA) or a column (#TUR).
                const uid = (f[1]||'').trim() || null;
                if (lastRec === '#TRA' && curSet && curSet.uid == null) curSet.uid = uid;
                else if (lastRec === '#TUR') { const last = cols[cols.length - 1]; if (last && last.uid == null) last.uid = uid; }
                break;
            }
            case '#KAL':
                if (curPer && (f[1]||'').trim()) curPer.calendarIds.push(f[1].trim());
                break;
            case '#KOM': {
                // Older files: the line's note in one language (field 1, empty = Bokmål). ERN 2.0 has #KOM as
                // the table's description and the note as #FOT -1;-1; Nepos reads it as the note and saves it so.
                const lang = (f[2]||'').trim().toLowerCase();
                if (!lang || lang === 'nob') { if (!rs.kom) rs.kom = f[1]||''; }
                else rs.komOther.push({ text: f[1]||'', lang });
                break;
            }
            case '#KON': case '#KOE': case '#KOT': // deprecated: #KOM with a language code
                rs.komOther.push({ text: f[1]||'', lang: { '#KON': 'nno', '#KOE': 'eng', '#KOT': 'deu' }[f[0]] });
                break;
            case '#PER': {
                // A period: its days come from its calendars (#KAL); name and dates are not used.
                finalizeTAB();
                if (!curSet) { curSet = { id: rs.nextId++, name: '', uid: null, direction: '' }; rs.tableSets.push(curSet); if (rs.activeSet == null) rs.activeSet = curSet.id; }
                curPer = { id: rs.nextId++, setId: curSet.id, calendarIds: [] };
                rs.periods.push(curPer);
                if (rs.activePer == null) rs.activePer = curPer.id;
                break;
            }
            case '#TAB': {
                // Exactly one table per period. A second one replaces the first, which the
                // integrity check reports as data a save would lose.
                finalizeTAB();
                inTab = !!curPer;
                cols=[]; rows=[]; cellMap={};
                break;
            }
            case '#TUR': {
                // Field 6 (1.x vehicle reference) is ignored; vehicles are dropped in Nepos 2.
                cols.push({ x:parseInt(f[1])||cols.length, dayCode:f[2]||'', uid:null });
                break;
            }
            case '#TRL': {
                // Nepos 2: the stop ID is text (an NSR Quay ID such as NSR:Quay:12345; old files
                // have numbers). Empty, 0 and negative numbers mean "no stop ID".
                const rawId = (f[2] ?? '').trim();
                const sid = rawId === '' || (/^-?\d+$/.test(rawId) && parseInt(rawId, 10) <= 0) ? null : rawId;
                // ERN 2.0 / v1.8: typography in field 3 (bold = bit 1, underline = bit 3), price in field 6.
                // Nepos's older files: field 3 is always 34, its own flags in field 4 (bit 0 bold, bit 1
                // separator) and the price in field 5.
                const oldNepos = (f[4]||'').trim() === '34';
                const priceField = parseFloat(oldNepos ? f[6] : f[7]);
                const price = (!isNaN(priceField) && priceField >= 0) ? priceField : null;
                const bits = Math.max(0, parseInt(oldNepos ? f[5] : f[4]) || 0);
                rows.push({
                    name: f[3]||'', stopId: sid,
                    bold: (bits & (oldNepos ? 1 : 2)) !== 0, sep: (bits & (oldNepos ? 2 : 8)) !== 0,
                    isDwellArr: false, price
                });
                break;
            }
            case '#VAL': // currency (ERN 2.0; #CUR before): Nepos 2 does not use it and does not write it
            case '#CUR':
                break;
            case '#TRC': {
                const cx   = parseInt(f[1]);
                const time = f[2]||'';
                const dOff = parseInt(f[3])||0;
                const dx   = parseInt(f[5])||0;
                const dy   = parseInt(f[6])||0;
                const mask = parseInt(f[7])||0;
                const ri   = rows.length - 1;
                if (ri < 0 || !time) break;
                let suffix = '';
                // Request stop: bit 8 (ERN 2.0); Nepos's older files used bit 3
                // It sits beside the boarding rule (bits 0/1), not instead of it (booking spec 2026-10-22)
                if (mask&1) suffix='a'; else if (mask&2) suffix='p';
                const req = !!((mask&256) || (mask&8));
                let interchange = null;
                if ((mask&0x400)||(mask&0x800)) {
                    const colXtoIdx2 = {};
                    cols.forEach((c,i)=>{ colXtoIdx2[c.x]=i; });
                    interchange = {
                        targetC: (colXtoIdx2[cx]??cx) + dx,
                        targetR: ri + dy,
                        type: (mask&0x800)?'stayseated':'guaranteed'
                    };
                }
                cellMap[`${cx}:${ri}`] = req ? { time, dayOffset:dOff, suffix, interchange, req } : { time, dayOffset:dOff, suffix, interchange };
                break;
            }
            case '#TTL':
                _ttlRow = parseInt(f[1]);
                _ttlIsLabel = ((parseInt(f[6]) || 0) & 1) === 1; // field 5 bit 0: a row of column labels
                _ttlIsVehicle = !_ttlIsLabel && ((parseInt(f[6]) || 0) & 2) === 2; // bit 1: a row of vehicles
                if (_ttlRow === -1 && _ttlIsLabel) _labelRow = true;
                else if (_ttlRow === -1 && _ttlIsVehicle) _vehicleRow = true;
                else if (_ttlRow === -1) _tripRow = true;
                break;
            case '#TTC': {
                if (_ttlRow !== -1) break; // a cell of another info row
                const col = cols.find((c) => c.x === parseInt(f[1]));
                if (col && f[4]) { if (_ttlIsLabel) col.label = f[4]; else if (_ttlIsVehicle) col.vehicle = f[4]; else col.tripNo = f[4]; }
                break;
            }
            case '#FOT': {
                // A note on a column (row -1) or a cell
                const txt = f[3] || '';
                if (!txt) break;
                // On the whole table (X = -1): the line's note (rs.kom, Bokmål; other languages kept beside it)
                if (parseInt(f[1]) === -1) {
                    const lang = (f[4]||'').trim().toLowerCase();
                    if (!lang || lang === 'nob' || lang === '0') { if (!rs.kom) rs.kom = txt; }
                    else if (!rs.komOther.some((/** @type {any} */ k) => k.lang === lang)) rs.komOther.push({ text: txt, lang });
                    break;
                }
                // Language (field 3): a three-letter code, empty = Bokmål; older files: 0 = Norwegian, 1 = English
                const lang = (f[4]||'').trim().toLowerCase();
                if (lang && lang !== 'nob' && lang !== '0') break; // notes in other languages: not shown (the check says so)
                _pendingNotes.push({ ci: buildXtoIdx()[parseInt(f[1])] ?? parseInt(f[1]), ri: parseInt(f[2]), note: txt });
                break;
            }
            case '#BOD': case '#BOF': {
                // Booking (booking spec 2026-10-22): (column, row) a stop on a trip, (column, -1) a trip, (-1, -1) the line
                const x = parseInt(f[1]), y = parseInt(f[2]);
                /** @type {any} */
                let part;
                if (f[0] === '#BOF') {
                    const lang = (f[4]||'').trim().toLowerCase();
                    if (lang && lang !== 'nob') break; // other languages: not shown, as notes
                    part = { note: f[3] || '' };
                } else {
                    part = { contact: f[3], phone: f[4], email: f[5], url: f[6], details: f[7], access: f[8], bookWhen: f[9],
                        methods: fromBits(parseInt(f[10]) || 0, BOOKING_METHODS), buyWhen: fromBits(parseInt(f[11]) || 0, BUY_WHEN),
                        latest: f[12], minAhead: f[13], maxAhead: f[14] };
                }
                if (x === -1) { if (y === -1) rs.booking = normalizeBooking({ ...(rs.booking ?? {}), ...part }); break; }
                _pendingNotes.push({ ci: buildXtoIdx()[x] ?? x, ri: y, booking: part });
                break;
            }
            case '#DST': {
                // A destination in one language; Nepos keeps Bokmål (empty = Bokmål)
                const lang = (f[3]||'').trim().toLowerCase();
                const id = (f[1]||'').trim();
                if (!id || (lang && lang !== 'nob')) break;
                dstMap.set(id, { text: f[2]||'', viaIds: f.slice(4).map((v) => v.trim()).filter(Boolean) });
                break;
            }
            case '#DSK': {
                // Where a trip's destination starts or changes; the sign (field 2) is not used by Nepos
                const dstId = (f[4]||'').trim();
                if (!dstId) break;
                _pendingDsk.push({ ci: buildXtoIdx()[parseInt(f[1])] ?? parseInt(f[1]), ri: parseInt(f[2]), dstId });
                break;
            }
            case '#UNT': {
                // Dates on a column or a cell: PMU bit 13 = runs on these days, bit 14 = does not
                const from=f[3]||'', pmu=parseInt(f[4])||0, to=f[5]||'';
                if (!from && !to) break;
                _pendingNotes.push({ ci: buildXtoIdx()[parseInt(f[1])] ?? parseInt(f[1]), ri: parseInt(f[2]), date: { from, to, on: (pmu & 8192) > 0 } });
                break;
            }
        }
        lastRec = f[0];
    }
    finalizeTAB();
    resolveDestinations();
    if (!sawMod) { const m = modeFromErn(rs.transportMode); rs.mode = m.mode; rs.submode = m.submode; }
    // A column ID that is not a UUID, or is used twice, is replaced now so every save writes the same
    // text; a missing one is filled in when the grid is shown (line header spec §4).
    const seenUids = new Set();
    for (const set of rs.tableSets) {
        if (set.uid == null) continue;
        if (!UUID_PATTERN.test(set.uid) || seenUids.has(set.uid)) set.uid = null;
        else seenUids.add(set.uid);
    }
    for (const grid of Object.values(rs.grids)) {
        for (const col of /** @type {any} */ (grid).cols) {
            if (col.uid == null) continue;
            if (!UUID_PATTERN.test(col.uid) || seenUids.has(col.uid)) col.uid = crypto.randomUUID();
            seenUids.add(col.uid);
        }
    }
    return rs;

    /** Put each #DSK on its column: the first one is the start, the others are changes. */
    function resolveDestinations() {
        /** A via that leads back to the record, directly or through other vias, is skipped. @param {string} from @param {string} target @param {Set<string>} seen @returns {boolean} */
        const leadsTo = (from, target, seen) => {
            if (from === target) return true;
            if (seen.has(from)) return false;
            seen.add(from);
            return (dstMap.get(from)?.viaIds ?? []).some((v) => leadsTo(v, target, seen));
        };
        /** @param {string} id */
        const destOf = (id) => {
            const rec = dstMap.get(id);
            if (!rec) return null;
            const vias = rec.viaIds.filter((v) => dstMap.has(v) && !leadsTo(v, id, new Set())).map((v) => /** @type {any} */ (dstMap.get(v)).text);
            return { text: rec.text, vias };
        };
        for (const { grid, links } of dskByGrid) {
            normalizeDests(grid);
            // The start is the #DSK on the first stop the trip serves, else its first one; the others are changes
            grid.cols.forEach((/** @type {any} */ col, /** @type {number} */ ci) => {
                const own = links.filter((l) => l.ci === ci).sort((a, b) => a.ri - b.ri);
                if (!own.length) return;
                const first = servedRows(grid, col)[0];
                const start = own.find((l) => l.ri === first) ?? own[0];
                for (const l of own) {
                    const dest = destOf(l.dstId);
                    if (!dest) continue;
                    if (l === start) col.dest = dest;
                    else if (l.ri >= 0 && l.ri < col.dests.length) col.dests[l.ri] = dest;
                }
            });
            normalizeDests(grid); // a change on a waiting stop's arrival row moves to its departure row
        }
    }

    function buildXtoIdx() {
        const m={}; cols.forEach((c,i)=>{ m[c.x]=i; }); return m;
    }
}
