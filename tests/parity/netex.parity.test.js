import { describe, it, expect } from 'vitest';
import { sample, TIMESTAMP } from '../fixtures/sample-project.js';
import { readBaseline } from './load-baseline.js';
import { parseERN } from '../../src/core/ern/parse.js';
import { buildNeTExFiles } from '../../src/core/netex/export.js';

const files = buildNeTExFiles({
  codespace: sample.delivery.codespace,
  deliveryName: sample.delivery.name,
  routes: sample.routes.map(({ code, text }) => ({ code, rs: parseERN(text) })),
  orgs: sample.orgs,
  stopDb: sample.stopDb,
  timestamp: TIMESTAMP,
});

describe('NeTEx export matches 1.5.7', () => {
  it('produces the shared file and one file per line', () => {
    expect(files.map((f) => f.name)).toEqual([
      '_shared_data.xml',
      'Line-TST_10_timetable.xml',
      'Line-TST_20_timetable.xml',
    ]);
  });

  for (const name of ['_shared_data.xml', 'Line-TST_10_timetable.xml', 'Line-TST_20_timetable.xml']) {
    it(name, () => {
      expect(files.find((f) => f.name === name)?.xml).toBe(readBaseline(`netex/${name}`));
    });
  }
});
