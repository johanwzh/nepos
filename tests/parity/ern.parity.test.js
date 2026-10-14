import { describe, it, expect } from 'vitest';
import { sample } from '../fixtures/sample-project.js';
import { readBaseline, readBaselineJson } from './load-baseline.js';
import { expectedParsed, expectedRoundtrip, withoutNewRecords } from './intentional.js';
import { parseERN } from '../../src/core/ern/parse.js';
import { serializeERN } from '../../src/core/ern/serialize.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

describe('ERN parser matches 1.5.7 (with intentional differences)', () => {
  for (const { code, text } of sample.routes) {
    it(`route ${code}`, () => {
      expect(plain(parseERN(text))).toEqual(expectedParsed(readBaselineJson(`${code}.parsed.json`), text));
    });
  }
});

describe('ERN round-trip matches 1.5.7 (with intentional differences)', () => {
  for (const { code, text } of sample.routes) {
    it(`route ${code}`, () => {
      const out = serializeERN(parseERN(text), code, { delivery: sample.delivery, orgs: sample.orgs });
      expect(withoutNewRecords(out)).toBe(expectedRoundtrip(readBaseline(`${code}.roundtrip.txt`)));
    });
  }
});
