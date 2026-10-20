// A vehicle's own data (user 2026-10-20), named as in NeTEx's VehicleType: mode, fuel, low floor, seats, size, the
// vehicle type ID Nepos makes and a VehicleTypeRef under the fixed NMR:VehicleType: prefix.
import { describe, it, expect } from 'vitest';
import { FUEL_TYPES, VEHICLE_TYPE_REF_PREFIX, normalizeVehicle, vehicleProblems, vehicleShown } from '../../src/core/vehicles.js';

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
