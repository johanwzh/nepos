import { describe, it, expect } from 'vitest';
import { sample } from '../../fixtures/sample-project.js';
import { parseERN } from '../../../src/core/ern/parse.js';
import { serializeERN } from '../../../src/core/ern/serialize.js';

describe('Nepos 2 ERN format', () => {
  const out = serializeERN(parseERN(sample.routes[0].text), '10', { delivery: sample.delivery, orgs: sample.orgs });

  it('writes #LEV with name and codespace only — no personal data', () => {
    expect(out.split('\r\n')[0]).toBe('#LEV;Testprosjekt;TST');
    expect(out).not.toContain('creator@example.invalid');
    expect(out).not.toContain('Test Creator');
  });

  it('ignores and drops a 1.x vehicle reference in #TUR', () => {
    const withVehicle = sample.routes[1].text.replace('#TUR;0;DX67;0;0;0;0;', '#TUR;0;DX67;0;0;0;0;7');
    const written = serializeERN(parseERN(withVehicle), '20', { delivery: sample.delivery, orgs: sample.orgs });
    expect(written).toContain('#TUR;0;DX67;0;0;0;0\r\n');
    expect(written).not.toContain(';0;0;0;0;7');
  });
});
