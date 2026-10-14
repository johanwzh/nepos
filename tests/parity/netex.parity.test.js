import { describe, it, expect } from 'vitest';
import { sample, TIMESTAMP } from '../fixtures/sample-project.js';
import { readBaseline } from './load-baseline.js';
import { NETEX_FILE_NAMES, expectedNetex } from './intentional.js';
import { parseERN } from '../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../src/core/netex/export.js';

const files = buildNeTExFiles({
  codespace: sample.delivery.codespace,
  deliveryName: sample.delivery.name,
  routes: sample.routes.map(({ code, text }) => ({ code, rs: parseERN(text) })),
  orgs: [], orgMode: 'codespace',
  timestamp: TIMESTAMP,
});

describe('NeTEx export matches 1.5.7 (with intentional differences)', () => {
  it('uses the Entur file names', () => {
    expect(files.map((f) => f.name)).toEqual(Object.values(NETEX_FILE_NAMES));
  });

  for (const [v1Name, name] of Object.entries(NETEX_FILE_NAMES)) {
    it(name, () => {
      expect(files.find((f) => f.name === name)?.xml).toBe(expectedNetex(readBaseline(`netex/${v1Name}`)));
    });
  }
});
