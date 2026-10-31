// Analyse's Excel export (spec 2026-10-31): a minimal SpreadsheetML workbook in Nepos's own zip, no dependency.
import { describe, it, expect } from 'vitest';
import { buildXlsx } from '../../src/core/xlsx.js';

/** The stored (uncompressed) entries of a zip. @param {Uint8Array} zip */
function entries(zip) {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  /** @type {Record<string, string>} */
  const out = {};
  let p = 0;
  while (p + 30 <= zip.length && dv.getUint32(p, true) === 0x04034b50) {
    const size = dv.getUint32(p + 18, true), nameLen = dv.getUint16(p + 26, true), extra = dv.getUint16(p + 28, true);
    const name = new TextDecoder().decode(zip.subarray(p + 30, p + 30 + nameLen));
    const start = p + 30 + nameLen + extra;
    out[name] = new TextDecoder().decode(zip.subarray(start, start + size));
    p = start + size;
  }
  return out;
}

describe('buildXlsx', () => {
  it('writes a zip whose sheet holds inline strings and numbers', () => {
    const files = entries(buildXlsx([{ name: 'Omfang', rows: [['Linjer', 38], ['Ukjent', null, 'A & B']] }, { name: 'Per drivstoff: [kjent]?', rows: [['x']] }]));
    expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
    const s1 = files['xl/worksheets/sheet1.xml'];
    expect(s1).toContain('<c r="A1" t="inlineStr"><is><t>Linjer</t></is></c>');
    expect(s1).toContain('<c r="B1"><v>38</v></c>');
    expect(s1).toContain('<c r="C2" t="inlineStr"><is><t>A &amp; B</t></is></c>');
    expect(s1).not.toContain('r="B2"');
    expect(files['xl/workbook.xml']).toContain('<sheet name="Omfang" sheetId="1" r:id="rId1"/>');
    expect(files['xl/workbook.xml']).toContain('name="Per drivstoff kjent"');
  });

  it('cuts a sheet name to 31 characters', () => {
    const files = entries(buildXlsx([{ name: 'A'.repeat(40), rows: [] }]));
    expect(files['xl/workbook.xml']).toContain(`name="${'A'.repeat(31)}"`);
  });
});
