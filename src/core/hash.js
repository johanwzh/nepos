// A short fingerprint of a text (FNV-1a, 32 bits), to tell whether a line changed since it was exported. Not for security.

/** @param {string} text @returns {string} 8 hex digits */
export function textHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
