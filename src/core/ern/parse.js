// ERN parser, ported from Nepos 1.5.7 (nepos.html lines 2812–3005). See docs/ern/ern-format.md.
import { orgRole } from '../orgs.js';
import { modeFromErn } from '../modes.js';
import { UUID_PATTERN } from './serialize.js';

/**
 * Parse an ERN route file into a route state.
 * @param {string} text decoded file contents
 * @param {{ lang?: 'en' | 'no' }} [opts] kept for callers; table sets are named in the file
 */
export function parseERN(text, { lang: _lang = 'en' } = {}) {
    const rs = {
        routeName:'', publicCode:'', privateCode:'', mode:'', submode:'', brandingId:'', exported:true, isPublic:true, transportMode:6, kom:'', sek:[],
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

    function finalizeTAB() {
        if (!curPer || !curSet || !inTab) return;
        inTab = false;
        const key = `${curPer.id}:${curSet.id}`;
        const colXtoIdx = {};
        cols.forEach((c,i) => { colXtoIdx[c.x] = i; });
        const gCols2 = cols.map(c => ({
            dayCode: c.dayCode, uid: c.uid ?? null, note: '', dates: [], tripNo: c.tripNo ?? '',
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
        const grid = { stops: stopsCopy, cols: gCols2, tripRow: _tripRow };
        // Notes and dates from #FOT/#UNT: on the column (row -1) or on a cell that has a time
        _pendingNotes.forEach(({ ci, ri, note, date }) => {
            if (ci < 0 || ci >= grid.cols.length) return;
            const target = ri === -1 ? grid.cols[ci] : (ri >= 0 && ri < grid.stops.length ? grid.cols[ci].cells[ri] : null);
            if (!target) return;
            if (note != null) target.note = note;
            if (date) (target.dates ??= []).push(date);
        });
        rs.grids[key] = grid;
        cols=[]; rows=[]; cellMap={};
        _pendingNotes = [];
        _tripRow = false; _ttlRow = NaN;
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
                curSet = { id: rs.nextId++, name: f[1]||'', uid: null };
                rs.tableSets.push(curSet);
                if (rs.activeSet == null) rs.activeSet = curSet.id;
                curPer = null;
                break;
            case '#MOD':
                rs.mode = (f[1]||'').trim(); rs.submode = (f[2]||'').trim(); sawMod = true;
                break;
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
            case '#KOM':
                if (!rs.kom) rs.kom = f[1]||'';  // first #KOM = route-wide comment
                break;
            case '#PER': {
                // A period: its days come from its calendars (#KAL); name and dates are not used.
                finalizeTAB();
                if (!curSet) { curSet = { id: rs.nextId++, name: '', uid: null }; rs.tableSets.push(curSet); if (rs.activeSet == null) rs.activeSet = curSet.id; }
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
                const priceField = parseFloat(f[6]);
                const price = (!isNaN(priceField) && priceField >= 0) ? priceField : null;
                // field[5]: Nepos flags bitmask (bit0=bold, bit1=sep). Negative/NaN → 0.
                const flags = Math.max(0, parseInt(f[5]) || 0);
                rows.push({
                    name: f[3]||'', stopId: sid,
                    bold: (flags & 1) !== 0, sep: (flags & 2) !== 0,
                    isDwellArr: false, price
                });
                break;
            }
            case '#CUR': {
                // Prices are hidden in Nepos 2; the currency id and rate are kept exactly as read
                // so they are written back unchanged.
                if (f[1]) rs.currency = f[1];
                if (f[2]) rs.currencyRate = f[2];
                break;
            }
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
                if (mask&8) suffix='x'; else if (mask&1) suffix='a'; else if (mask&2) suffix='p';
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
                cellMap[`${cx}:${ri}`] = { time, dayOffset:dOff, suffix, interchange };
                break;
            }
            case '#TTL':
                _ttlRow = parseInt(f[1]);
                if (_ttlRow === -1) _tripRow = true;
                break;
            case '#TTC': {
                if (_ttlRow !== -1) break; // a cell of another info row
                const col = cols.find((c) => c.x === parseInt(f[1]));
                if (col && f[4]) col.tripNo = f[4];
                break;
            }
            case '#FOT': {
                // A note on a column (row -1) or a cell
                const txt = f[3] || '';
                if (!txt) break;
                _pendingNotes.push({ ci: buildXtoIdx()[parseInt(f[1])] ?? parseInt(f[1]), ri: parseInt(f[2]), note: txt });
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

    function buildXtoIdx() {
        const m={}; cols.forEach((c,i)=>{ m[c.x]=i; }); return m;
    }
}
