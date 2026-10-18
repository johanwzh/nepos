export function crc32(data) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
        c ^= data[i];
        for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Build an uncompressed (store-only) zip archive.
 * @param {{ name: string, data: Uint8Array }[]} files
 * @param {{ date?: Date }} [opts] the entries' date and time (default: now)
 * @returns {Uint8Array}
 */
export function buildZip(files, { date = new Date() } = {}) {
    return assemble(files.map((f) => ({ ...f, packed: f.data, method: 0 })), date);
}

/**
 * The same, with each file compressed (deflate) where the browser can; store-only where it cannot.
 * @param {{ name: string, data: Uint8Array }[]} files
 * @param {{ date?: Date }} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function buildZipCompressed(files, { date = new Date() } = {}) {
    if (typeof CompressionStream === 'undefined') return buildZip(files, { date });
    const entries = [];
    try {
        for (const f of files) {
            const packed = new Uint8Array(await new Response(new Blob([/** @type {BlobPart} */ (f.data)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
            entries.push({ ...f, packed, method: 8 });
        }
    } catch {
        return buildZip(files, { date }); // streams not available here: store only
    }
    return assemble(entries, date);
}

/** DOS time and date (local time, two-second steps) in one 32-bit value: time low, date high. @param {Date} d */
function dosDateTime(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const day = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return ((day << 16) | time) >>> 0;
}

/**
 * @param {{ name: string, data: Uint8Array, packed: Uint8Array, method: number }[]} files
 * @param {Date} date
 */
function assemble(files, date) {
    const stamp = dosDateTime(date);
    // files: [{name: string, data: Uint8Array}]
    const enc = s => new TextEncoder().encode(s);
    const u32le = (v, a, o) => { a[o]=v&0xFF; a[o+1]=(v>>8)&0xFF; a[o+2]=(v>>16)&0xFF; a[o+3]=(v>>24)&0xFF; };
    const u16le = (v, a, o) => { a[o]=v&0xFF; a[o+1]=(v>>8)&0xFF; };

    const localParts = [];
    const cdParts    = [];
    let offset = 0;

    for (const { name, data, packed, method } of files) {
        const nb  = enc(name);
        const crc = crc32(data);
        const sz  = data.length, csz = packed.length;

        // Local file header (30 + name)
        const lfh = new Uint8Array(30 + nb.length);
        u32le(0x04034b50, lfh,  0);  // sig
        u16le(20,         lfh,  4);  // version needed
        u16le(0,          lfh,  6);  // flags
        u16le(method,     lfh,  8);  // compression: 0 store, 8 deflate
        u32le(stamp,      lfh, 10);  // mod time+date
        u32le(crc,        lfh, 14);
        u32le(csz,        lfh, 18);  // compressed
        u32le(sz,         lfh, 22);  // uncompressed
        u16le(nb.length,  lfh, 26);
        u16le(0,          lfh, 28);  // extra
        lfh.set(nb, 30);

        // Central directory entry (46 + name)
        const cde = new Uint8Array(46 + nb.length);
        u32le(0x02014b50, cde,  0);  // sig
        u16le(20,         cde,  4);  // version made by
        u16le(20,         cde,  6);  // version needed
        u16le(0,          cde,  8);  // flags
        u16le(method,     cde, 10);  // compression
        u32le(stamp,      cde, 12);  // mod time+date
        u32le(crc,        cde, 16);
        u32le(csz,        cde, 20);
        u32le(sz,         cde, 24);
        u16le(nb.length,  cde, 28);
        u16le(0,          cde, 30);  // extra
        u16le(0,          cde, 32);  // comment
        u32le(offset,     cde, 42);  // local header offset
        cde.set(nb, 46);

        localParts.push(lfh, packed);
        cdParts.push(cde);
        offset += lfh.length + csz;
    }

    const cdSize = cdParts.reduce((s, c) => s + c.length, 0);
    const eocd = new Uint8Array(22);
    u32le(0x06054b50,  eocd,  0);  // sig
    u16le(0,           eocd,  4);  // disk#
    u16le(0,           eocd,  6);  // start disk
    u16le(files.length,eocd,  8);  // entries here
    u16le(files.length,eocd, 10);  // total entries
    u32le(cdSize,      eocd, 12);  // cd size
    u32le(offset,      eocd, 16);  // cd offset

    const all = [...localParts, ...cdParts, eocd];
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let pos = 0;
    for (const p of all) { out.set(p, pos); pos += p.length; }
    return out;
}
