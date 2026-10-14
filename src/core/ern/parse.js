// ERN parser, ported from Nepos 1.5.7 (nepos.html lines 2812–3005). See docs/ern/ern-format.md.
import { orgRole } from '../orgs.js';
import { modeFromErn } from '../modes.js';

/**
 * Parse an ERN route file into a route state.
 * @param {string} text decoded file contents
 * @param {{ lang?: 'en' | 'no' }} [opts] language for the default direction names
 */
export function parseERN(text, { lang = 'en' } = {}) {
    const rs = {
        routeName:'', publicCode:'', privateCode:'', mode:'', submode:'', brandingId:'', tra:'', transportMode:6, kom:'', sek:[], footnotes:[],
        periods:[], directions:[], activePer:null, activeDir:null,
        nextId:1, grids:{}
    };
    let curPer = null, curDir = null;
    let sawMod = false;
    let cols = [], rows = [], cellMap = {};
    const dirMap = {};
    let _fnParseMap = null, _fnPendingAttach = [];

    function finalizeTAB() {
        if (!curPer || !curDir) return;
        const key = `${curPer.id}:${curDir.id}`;
        const colXtoIdx = {};
        cols.forEach((c,i) => { colXtoIdx[c.x] = i; });
        const gCols2 = cols.map(c => ({
            dayCode: c.dayCode, uid: c.uid ?? null, footnote: '', footnoteId: null,
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
        const grid = { stops: stopsCopy, cols: gCols2 };
        // Apply footnote attachments collected from FOT/UNT records
        _fnPendingAttach.forEach(({ci,ri,fnId}) => {
            if (ci < 0 || ci >= grid.cols.length) return;
            if (ri === -1) { grid.cols[ci].footnoteId = fnId; }
            else if (ri >= 0 && ri < grid.stops.length) {
                const cell = grid.cols[ci].cells[ri];
                if (cell) cell.footnoteId = fnId;
            }
        });
        rs.grids[key] = grid;
        cols=[]; rows=[]; cellMap={};
        _fnParseMap = null; _fnPendingAttach = [];
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
                rs.tra = f[1]||'';   // kept as read; plan 4c gives it its meaning
                break;
            case '#MOD':
                rs.mode = (f[1]||'').trim(); rs.submode = (f[2]||'').trim(); sawMod = true;
                break;
            case '#BRA':
                rs.brandingId = (f[1]||'').trim();
                break;
            case '#UID': {
                // Belongs to the #TUR directly before it (a column's stable ID).
                const last = cols[cols.length - 1];
                if (last && last.uid == null) last.uid = (f[1]||'').trim() || null;
                break;
            }
            case '#KOM':
                if (!rs.kom) rs.kom = f[1]||'';  // first #KOM = route-wide comment
                break;
            case '#PER': {
                finalizeTAB();
                const id = rs.nextId++;
                curPer = { id, name:f[1]||'', from:f[2]||'', to:f[3]||'', from2:f[4]||'', to2:f[5]||'' };
                rs.periods.push(curPer);
                if (!rs.activePer) rs.activePer = id;
                curDir = null;
                break;
            }
            case '#TAB': {
                finalizeTAB();
                const isRet = f[1]==='1';
                const dKey  = isRet ? 1 : 0;
                if (!dirMap[dKey]) {
                    const id = rs.nextId++;
                    const name = isRet ? (lang==='no'?'Retur':'Return') : (lang==='no'?'Tur':'Outbound');
                    dirMap[dKey] = id;
                    rs.directions.push({ id, name });
                }
                curDir = rs.directions.find(d=>d.id===dirMap[dKey]);
                if (!rs.activeDir) rs.activeDir = curDir.id;
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
                cellMap[`${cx}:${ri}`] = { time, dayOffset:dOff, suffix, interchange, footnoteId:null };
                break;
            }
            case '#FOT': {
                // Text footnote — attach to column (y=-1) or cell
                const fx=parseInt(f[1]), fy=parseInt(f[2]), txt=f[3]||'';
                if (!txt) break;
                const fnObj = getOrCreateFn(rs, {cx:fx, cy:fy, colXtoIdx:buildXtoIdx()});
                fnObj.text = txt;
                break;
            }
            case '#UNT': {
                const fx=parseInt(f[1]), fy=parseInt(f[2]);
                const from=f[3]||'', pmu=parseInt(f[4])||0, to=f[5]||'';
                const runsOnly = (pmu & 8192) > 0;
                if (!from && !to) break;
                const fnObj = getOrCreateFn(rs, {cx:fx, cy:fy, colXtoIdx:buildXtoIdx()});
                fnObj.exceptions.push({ runsOnly, from, to });
                break;
            }
        }
    }
    finalizeTAB();
    if (!sawMod) { const m = modeFromErn(rs.transportMode); rs.mode = m.mode; rs.submode = m.submode; }
    return rs;

    function buildXtoIdx() {
        const m={}; cols.forEach((c,i)=>{ m[c.x]=i; }); return m;
    }
    function getOrCreateFn(rs, {cx,cy,colXtoIdx}) {
        // Determine attachment key
        const ci = colXtoIdx[cx] ?? cx;
        const key = cy===-1 ? `col:${ci}` : `cell:${ci}:${cy}`;
        if (!_fnParseMap) _fnParseMap = {};
        if (!_fnParseMap[key]) {
            const id = rs.footnotes.length + 1;
            const fn = { id, text:'', exceptions:[] };
            rs.footnotes.push(fn);
            _fnParseMap[key] = fn;
            // Attach — will be applied after finalizeTAB
            _fnPendingAttach.push({ ci, ri: cy, fnId: id });
        }
        return _fnParseMap[key];
    }
}
