// Analyse's Tekst export (spec 2026-10-31): the receipt as plain text with aligned columns, for an e-mail.
import { describe, it, expect } from 'vitest';
import { receiptText } from '../../src/core/analysis/text.js';
import { receipt } from '../../src/core/analysis/receipt.js';

/** @param {Partial<import('../../src/core/analysis/facts.js').TripFact>} o @returns {import('../../src/core/analysis/facts.js').TripFact} */
const fact = (o = {}) => ({ line: 'L1', mode: 'bus', profile: 'bus', days: ['20260105', '20260106'], start: 420, end: 450, runMin: 30,
  calls: [], legs: [{ key: 'A|B|bus', km: 12 }], km: 12, stopPlaces: ['A', 'B'], fuel: 'diesel', seats: 50, lowFloor: false, booked: false, ...o });
const labels = { t: (/** @type {string} */ k) => k, mode: (/** @type {string} */ m) => m || 'Ukjent', fuel: (/** @type {string} */ f) => f || 'Ukjent', profile: (/** @type {string} */ p) => p || 'Ukjent' };

describe('receiptText', () => {
  it('aligns numbers right in fixed columns and writes Ukjent rows like any other', () => {
    const r = receipt([fact(), fact({ line: 'L2', mode: '', profile: null, days: Array.from({ length: 1200 }, () => '20260105'), km: null, legs: [{ key: 'X|Y|none', km: null }] })], { period: null, today: '20250101' });
    const text = receiptText(r, { title: 'Hele prosjektet', periodText: '5.–6. jan. 2026', labels, children: [{ name: 'Vy Buss AS', departures: 2, km: 24, hours: 1 }] });
    const lines = text.split('\n');
    expect(lines[0]).toBe('Hele prosjektet');
    expect(lines[1]).toBe('5.–6. jan. 2026');
    const head = lines.findIndex((l) => l.startsWith('anScopeHead'));
    expect(head).toBeGreaterThan(1);
    const bus = /** @type {string} */ (lines.find((l) => l.startsWith('bus ')));
    const unk = /** @type {string} */ (lines.find((l) => l.startsWith('Ukjent ')));
    const sum = /** @type {string} */ (lines.slice(head).find((l) => l.startsWith('anSum')));
    // Columns line up: every row of the table has the same width, numbers flush right with thousands spaced
    expect(bus.length).toBe(unk.length);
    expect(sum.length).toBe(bus.length);
    expect(unk.trimEnd().endsWith('2')).toBe(true);
    expect(sum).toContain('1 202');
    expect(text).toContain('Vy Buss AS');
    expect(text.endsWith('\n')).toBe(true);
  });
});
