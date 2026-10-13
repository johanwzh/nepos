import { describe, it, expect } from 'vitest';
import { sample } from '../fixtures/sample-project.js';
import { readBaselineJson } from './load-baseline.js';
import { parseERN } from '../../src/core/ern/parse.js';
import { readBaseline } from './load-baseline.js';
import { serializeERN } from '../../src/core/ern/serialize.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

describe('ERN parser matches 1.5.7', () => {
  for (const { code, text } of sample.routes) {
    it(`route ${code}`, () => {
      expect(plain(parseERN(text))).toEqual(readBaselineJson(`${code}.parsed.json`));
    });
  }
});

describe('ERN round-trip matches 1.5.7', () => {
  for (const { code, text } of sample.routes) {
    it(`route ${code}`, () => {
      const out = serializeERN(parseERN(text), code, { delivery: sample.delivery, orgs: sample.orgs });
      expect(out).toBe(readBaseline(`${code}.roundtrip.txt`));
    });
  }
});
