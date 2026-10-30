import { describe, it, expect } from 'vitest';
import { TRANSMODEL_MODES, isValidMode, modeFromErn, ernCodeFor, submodeElement, NORDIC_MODES } from '../../src/core/modes.js';
import { modeLabel, submodeLabel } from '../../src/i18n/modes.js';

describe('Transmodel modes', () => {
  it('lists the modes Entur accepts, with their submodes', () => {
    expect(TRANSMODEL_MODES.map((m) => m.mode)).toEqual(['bus', 'coach', 'rail', 'tram', 'metro', 'water', 'air', 'taxi',
      'cableway', 'funicular', 'lift', 'trolleyBus', 'snowAndIce', 'ferry', 'other']);
    expect(TRANSMODEL_MODES.find((m) => m.mode === 'bus')?.submodes).toContain('expressBus');
    expect(TRANSMODEL_MODES.find((m) => m.mode === 'ferry')?.submodes).toEqual([]);
  });

  it('validates a mode and submode pair', () => {
    expect(isValidMode('bus', 'expressBus')).toBe(true);
    expect(isValidMode('bus', '')).toBe(true);
    expect(isValidMode('bus', 'localCarFerry')).toBe(false);
    expect(isValidMode('spaceship', '')).toBe(false);
  });

  it('maps ERN codes to Transmodel and back without changing a code that already fits', () => {
    expect(modeFromErn(13)).toEqual({ mode: 'bus', submode: 'expressBus' });
    expect(modeFromErn(99)).toEqual({ mode: '', submode: '' });
    expect(ernCodeFor('bus', 'airportLinkBus', 15)).toBe(15);
    expect(ernCodeFor('bus', 'airportLinkBus')).toBe(4);
    expect(ernCodeFor('bus', 'nightBus')).toBe(1);
    expect(ernCodeFor('cableway', 'telecabin')).toBe(0);
  });

  it('names the NeTEx submode element', () => {
    expect(submodeElement('water')).toBe('WaterSubmode');
    expect(submodeElement('cableway')).toBe('TelecabinSubmode');
    expect(submodeElement('snowAndIce')).toBe('SnowAndIceSubmode');
  });

  it('has a Norwegian and an English label for every mode and submode', () => {
    for (const { mode, submodes } of TRANSMODEL_MODES) {
      for (const lang of /** @type {('no' | 'en')[]} */ (['no', 'en'])) {
        expect(modeLabel(mode, lang), `${lang} ${mode}`).not.toBe(mode);
        for (const s of submodes) expect(submodeLabel(s, lang), `${lang} ${s}`).not.toBe(s);
      }
    }
  });
});

describe('the Nordic profile (user 2026-10-30)', () => {
  it('has the profile\'s modes and submodes only', () => {
    expect(NORDIC_MODES.find((m) => m.mode === 'cableway')?.submodes).toEqual(['telecabin']);
    expect(NORDIC_MODES.find((m) => m.mode === 'water')?.submodes).toEqual(['localPassengerFerry', 'internationalPassengerFerry', 'localCarFerry', 'nationalCarFerry', 'internationalCarFerry', 'highSpeedPassengerService', 'highSpeedVehicleService', 'sightseeingService']);
    expect(NORDIC_MODES.some((m) => m.mode === 'lift' || m.mode === 'trolleyBus' || m.mode === 'ferry')).toBe(false);
  });
});
