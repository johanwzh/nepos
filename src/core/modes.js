// Transmodel transport modes and submodes, as Entur accepts them (Uttu's VehicleModeEnumeration
// and VehicleSubmodeEnumeration), and the mapping to the old ERN mode codes. Pure.
import { ERN_MODES } from './ern/modes.js';

export const TRANSMODEL_MODES = [
  { mode: 'bus', submodes: ['localBus', 'regionalBus', 'expressBus', 'nightBus', 'shuttleBus', 'airportLinkBus', 'railReplacementBus',
    'schoolBus', 'schoolAndPublicServiceBus', 'highFrequencyBus', 'dedicatedLaneBus', 'demandAndResponseBus', 'postBus',
    'specialNeedsBus', 'mobilityBus', 'mobilityBusForRegisteredDisabled', 'sightseeingBus'] },
  { mode: 'coach', submodes: ['internationalCoach', 'nationalCoach', 'regionalCoach', 'commuterCoach', 'shuttleCoach',
    'specialCoach', 'schoolCoach', 'sightseeingCoach', 'touristCoach'] },
  { mode: 'rail', submodes: ['local', 'regionalRail', 'interregionalRail', 'longDistance', 'highSpeedRail', 'international',
    'suburbanRailway', 'airportLinkRail', 'nightRail', 'sleeperRailService', 'touristRailway', 'railShuttle',
    'replacementRailService', 'specialTrain', 'crossCountryRail', 'carTransportRailService', 'rackAndPinionRailway'] },
  { mode: 'tram', submodes: ['localTram', 'cityTram', 'regionalTram', 'shuttleTram', 'trainTram', 'sightseeingTram'] },
  { mode: 'metro', submodes: ['metro', 'tube', 'urbanRailway'] },
  { mode: 'water', submodes: ['localPassengerFerry', 'regionalPassengerFerry', 'nationalPassengerFerry', 'internationalPassengerFerry',
    'localCarFerry', 'regionalCarFerry', 'nationalCarFerry', 'internationalCarFerry', 'highSpeedPassengerService',
    'highSpeedVehicleService', 'sightseeingService', 'airportBoatLink', 'postBoat', 'schoolBoat', 'cableFerry', 'riverBus',
    'scheduledFerry', 'shuttleFerryService', 'trainFerry', 'roadFerryLink'] },
  { mode: 'air', submodes: ['domesticFlight', 'internationalFlight', 'shortHaulInternationalFlight', 'SchengenAreaFlight',
    'helicopterService', 'domesticCharterFlight', 'internationalCharterFlight', 'intercontinentalCharterFlight',
    'roundTripCharterFlight', 'sightseeingFlight', 'airshipService'] },
  { mode: 'taxi', submodes: ['communalTaxi', 'charterTaxi', 'waterTaxi'] },
  { mode: 'cableway', submodes: ['telecabin', 'cableCar', 'telecabinLink', 'chairLift', 'dragLift', 'lift'] },
  { mode: 'funicular', submodes: ['funicular', 'streetCableCar', 'allFunicularServices', 'undefinedFunicular'] },
  { mode: 'lift', submodes: [] },
  { mode: 'trolleyBus', submodes: [] },
  { mode: 'snowAndIce', submodes: ['snowCoach'] },
  { mode: 'ferry', submodes: [] },
  { mode: 'other', submodes: [] },
];

/** @param {string} mode @param {string} submode */
export function isValidMode(mode, submode) {
  const m = TRANSMODEL_MODES.find((x) => x.mode === mode);
  return !!m && (submode === '' || m.submodes.includes(submode));
}

/** @param {number} code */
export function modeFromErn(code) {
  const m = /** @type {any} */ (ERN_MODES)[code];
  if (!m) return { mode: '', submode: '' };
  // Some old ERN submodes are not Transmodel values (code 16 "replacementBus"): leave the submode out.
  return { mode: m.mode, submode: isValidMode(m.mode, m.sub) ? m.sub : '' };
}

/**
 * The ERN code to write in #RUT field 4 (spec §5): the current one if it still fits.
 * @param {string} mode @param {string} submode @param {number} [current]
 */
export function ernCodeFor(mode, submode, current = 0) {
  const codes = Object.keys(ERN_MODES).map(Number);
  const fits = (/** @type {number} */ c) => { const m = modeFromErn(c); return m.mode === mode && m.submode === submode; };
  if (codes.includes(current) && fits(current)) return current;
  const exact = codes.find(fits);
  if (exact !== undefined) return exact;
  const sameMode = codes.find((c) => modeFromErn(c).mode === mode);
  return sameMode ?? 0;
}

/** @param {string} mode */
export function submodeElement(mode) {
  if (mode === 'cableway') return 'TelecabinSubmode';
  return `${mode.charAt(0).toUpperCase()}${mode.slice(1)}Submode`;
}
