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
 * @returns {Uint8Array}
 */
export function buildZip(files) {
    // files: [{name: string, data: Uint8Array}]
    const enc = s => new TextEncoder().encode(s);
    const u32le = (v, a, o) => { a[o]=v&0xFF; a[o+1]=(v>>8)&0xFF; a[o+2]=(v>>16)&0xFF; a[o+3]=(v>>24)&0xFF; };
    const u16le = (v, a, o) => { a[o]=v&0xFF; a[o+1]=(v>>8)&0xFF; };

    const localParts = [];
    const cdParts    = [];
    let offset = 0;

    for (const { name, data } of files) {
        const nb  = enc(name);
        const crc = crc32(data);
        const sz  = data.length;

        // Local file header (30 + name)
        const lfh = new Uint8Array(30 + nb.length);
        u32le(0x04034b50, lfh,  0);  // sig
        u16le(20,         lfh,  4);  // version needed
        u16le(0,          lfh,  6);  // flags
        u16le(0,          lfh,  8);  // compression: STORE
        u32le(0,          lfh, 10);  // mod time+date
        u32le(crc,        lfh, 14);
        u32le(sz,         lfh, 18);  // compressed
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
        u16le(0,          cde, 10);  // compression
        u32le(0,          cde, 12);  // mod time+date
        u32le(crc,        cde, 16);
        u32le(sz,         cde, 20);
        u32le(sz,         cde, 24);
        u16le(nb.length,  cde, 28);
        u16le(0,          cde, 30);  // extra
        u16le(0,          cde, 32);  // comment
        u32le(offset,     cde, 42);  // local header offset
        cde.set(nb, 46);

        localParts.push(lfh, data);
        cdParts.push(cde);
        offset += lfh.length + sz;
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
