// Windows-1252 differs from Latin-1 only in 0x80–0x9F. Map those code points explicitly;
// everything else up to 0xFF is the same byte as its Unicode code point.
const EXTRAS = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
const QUESTION_MARK = 0x3f;

/**
 * Encode text as Windows-1252. Characters the encoding cannot hold become '?'.
 * @param {string} str
 * @returns {Uint8Array}
 */
export function encodeWin1252(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) out[i] = c;
    else out[i] = EXTRAS[c] ?? QUESTION_MARK;
  }
  return out;
}

/**
 * Decode Windows-1252 bytes to text.
 * @param {Uint8Array | ArrayBuffer} bytes
 * @returns {string}
 */
export function decodeWin1252(bytes) {
  return new TextDecoder('windows-1252').decode(bytes);
}
