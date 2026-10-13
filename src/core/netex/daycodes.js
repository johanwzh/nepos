// ERN day code → explicit calendar dates. Ported from Nepos 1.5.7 (nepos.html lines 5912–5936),
// where it was nested inside collectNeTExData.

/**
 * Expand an ERN day code over a period into individual dates.
 * @param {string} dayCode e.g. 'D', 'DX67', '135'
 * @param {string} fromYMD YYYYMMDD, inclusive
 * @param {string} toYMD YYYYMMDD, inclusive
 * @returns {string[]} YYYYMMDD dates
 */
export function expandDayCode(dayCode, fromYMD, toYMD) {
    const DOW = {'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':0}; // ERN → JS getDay()
    let allowed;
    if (!dayCode || dayCode === 'D') {
        allowed = new Set([0,1,2,3,4,5,6]);
    } else if (dayCode.startsWith('DX')) {
        const ex = new Set(dayCode.slice(2).split('').map(c=>DOW[c]).filter(v=>v!==undefined));
        allowed = new Set([0,1,2,3,4,5,6].filter(d=>!ex.has(d)));
    } else if (/^[1-7]+$/.test(dayCode)) {
        allowed = new Set(dayCode.split('').map(c=>DOW[c]));
    } else {
        allowed = new Set([0,1,2,3,4,5,6]);
    }
    const pad = n => String(n).padStart(2,'0');
    const dates = [];
    // Use T12:00:00 to avoid DST/midnight UTC edge cases; use local getDate() for the string
    const cur = new Date(`${fromYMD.slice(0,4)}-${fromYMD.slice(4,6)}-${fromYMD.slice(6,8)}T12:00:00`);
    const end = new Date(`${toYMD.slice(0,4)}-${toYMD.slice(4,6)}-${toYMD.slice(6,8)}T12:00:00`);
    while (cur <= end) {
        if (allowed.has(cur.getDay()))
            dates.push(`${cur.getFullYear()}${pad(cur.getMonth()+1)}${pad(cur.getDate())}`);
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
}
