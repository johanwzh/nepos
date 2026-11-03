// A vehicle's own data (user 2026-10-20), named as in NeTEx's VehicleType: mode, fuel, low floor, seats, size, the
// vehicle type ID Nepos makes and a VehicleTypeRef under the fixed NMR:VehicleType: prefix.
import { describe, it, expect } from 'vitest';
import { FUEL_TYPES, VEHICLE_TYPE_REF_PREFIX, normalizeVehicle, vehicleProblems, vehicleShown, vehicleFitsLine } from '../../src/core/vehicles.js';

const base = { id: 'v1', name: 'Buss 7', colour: '#2f6fb5' };

describe('vehicle data', () => {
  it('offers NeTEx\'s fuel types (FuelTypeEnumeration)', () => {
    expect(FUEL_TYPES).toEqual(['battery', 'biodiesel', 'diesel', 'dieselBatteryHybrid', 'electricContact', 'electricity', 'ethanol',
      'hydrogen', 'liquidGas', 'tpg', 'methane', 'naturalGas', 'petrol', 'petrolBatteryHybrid', 'petrolLeaded', 'petrolUnleaded', 'none', 'other']);
  });

  it('fills in what an older vehicle lacks, and drops what is not valid', () => {
    expect(normalizeVehicle(base)).toEqual({ ...base, shortCode: '', transportMode: '', fuelType: '', lowFloor: false, seats: null,
      length: null, width: null, height: null, vehicleTypeId: '', vehicleTypeRef: '' });
    expect(normalizeVehicle({ ...base, fuelType: 'coal', lowFloor: 'yes', seats: 'many', length: -2 })).toMatchObject({ fuelType: '', lowFloor: false, seats: null, length: null });
  });

  it('keeps a field it does not know (a newer Nepos wrote it; backlog 29), and still cleans the ones it knows', () => {
    const v = normalizeVehicle({ ...base, seats: 'many', depot: 'Nord', axles: 3 });
    expect(v).toMatchObject({ depot: 'Nord', axles: 3, seats: null });
    expect(Object.keys(v)).toEqual(expect.arrayContaining(['id', 'name', 'colour', 'depot', 'axles']));
  });

  it('accepts a full vehicle', () => {
    const v = normalizeVehicle({ ...base, shortCode: 'B7', transportMode: 'bus', fuelType: 'electricity', lowFloor: true, seats: 45,
      length: 12.2, width: 2.55, height: 3.3, vehicleTypeId: 'TST:VehicleType:x', vehicleTypeRef: `${VEHICLE_TYPE_REF_PREFIX}ABC-12` });
    expect(vehicleProblems(v)).toEqual({});
  });

  it('says what is wrong, field by field', () => {
    const v = { ...normalizeVehicle(base), shortCode: 'TOOLONGCODE', seats: 4.5, width: 0, vehicleTypeRef: `${VEHICLE_TYPE_REF_PREFIX}a b` };
    expect(Object.keys(vehicleProblems(v)).sort()).toEqual(['seats', 'shortCode', 'vehicleTypeRef', 'width']);
    expect(Object.keys(vehicleProblems({ ...normalizeVehicle(base), shortCode: 'A;B' }))).toEqual(['shortCode']);
  });

  it('shows the short code in the timetable when there is one', () => {
    expect(vehicleShown({ ...normalizeVehicle(base), shortCode: 'B7' })).toBe('B7');
    expect(vehicleShown(normalizeVehicle(base))).toBe('Buss 7');
  });
});

describe('vehicle and line modes that go together (backlog 70, user 2026-11-03)', () => {
  it('a road vehicle (bus, coach, taxi) may run any road line', () => {
    for (const v of ['bus', 'coach', 'taxi']) for (const line of ['bus', 'coach', 'taxi']) expect(vehicleFitsLine(v, line), `${v} on ${line}`).toBe(true);
  });

  it('a ferry (the old mode) and a boat go together', () => {
    expect(vehicleFitsLine('water', 'water')).toBe(true);
    expect(vehicleFitsLine('ferry', 'water')).toBe(true);
    expect(vehicleFitsLine('water', 'ferry')).toBe(true);
    expect(vehicleFitsLine('ferry', 'ferry')).toBe(true);
  });

  it('a snowcoach may run a bus line, but a bus may not run a snowAndIce line', () => {
    expect(vehicleFitsLine('snowAndIce', 'bus')).toBe(true);
    expect(vehicleFitsLine('bus', 'snowAndIce')).toBe(false);
    expect(vehicleFitsLine('coach', 'snowAndIce')).toBe(false);
    expect(vehicleFitsLine('snowAndIce', 'snowAndIce')).toBe(true);
  });

  it('every other mode must match exactly', () => {
    expect(vehicleFitsLine('tram', 'tram')).toBe(true);
    for (const [v, line] of [['tram', 'bus'], ['bus', 'tram'], ['water', 'bus'], ['bus', 'water'], ['rail', 'metro'], ['snowAndIce', 'water'], ['snowAndIce', 'coach'], ['ferry', 'bus']]) {
      expect(vehicleFitsLine(v, line), `${v} on ${line}`).toBe(false);
    }
  });

  it('a vehicle or a line without a mode fits anything (nothing to compare)', () => {
    expect(vehicleFitsLine('', 'bus')).toBe(true);
    expect(vehicleFitsLine('water', '')).toBe(true);
    expect(vehicleFitsLine('', '')).toBe(true);
  });

  it('a vehicle saved with the old mode "ferry" is read as "water"', () => {
    expect(normalizeVehicle({ ...base, transportMode: 'ferry' }).transportMode).toBe('water');
    expect(normalizeVehicle({ ...base, transportMode: 'water' }).transportMode).toBe('water');
    expect(normalizeVehicle({ ...base, transportMode: 'bus' }).transportMode).toBe('bus');
  });
});
