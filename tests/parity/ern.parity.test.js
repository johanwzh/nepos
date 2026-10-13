import { describe, it, expect } from 'vitest';
import { sample } from '../fixtures/sample-project.js';
import { readBaselineJson } from './load-baseline.js';
import { parseERN } from '../../src/core/ern/parse.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

describe('ERN parser matches 1.5.7', () => {
  for (const { code, text } of sample.routes) {
    it(`route ${code}`, () => {
      expect(plain(parseERN(text))).toEqual(readBaselineJson(`${code}.parsed.json`));
    });
  }
});
