// Reads a zip (stored or deflated entries), enough for Nepos's own export zips. Node only.
import { inflateRawSync } from 'node:zlib';

/**
 * The files in a zip, by name.
 * @param {Uint8Array} buf
 * @returns {Map<string, Uint8Array>}
 */
export function unzip(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file (no end of central directory)');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  /** @type {Map<string, Uint8Array>} */
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('broken zip (central directory)');
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = buf.subarray(start, start + size);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, new Uint8Array(inflateRawSync(data)));
    else throw new Error(`${name}: zip method ${method} is not supported`);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
