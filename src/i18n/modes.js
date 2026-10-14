// Labels for the Transmodel modes and submodes (core/modes.js), Norwegian and English.
/** @type {Record<string, [string, string]>} key → [no, en] */
const MODES = {
  bus: ['Buss', 'Bus'], coach: ['Langdistansebuss', 'Coach'], rail: ['Tog', 'Rail'], tram: ['Trikk', 'Tram'],
  metro: ['T-bane', 'Metro'], water: ['Båt', 'Water'], air: ['Fly', 'Air'], taxi: ['Taxi', 'Taxi'],
  cableway: ['Taubane', 'Cableway'], funicular: ['Kabelbane', 'Funicular'], lift: ['Heis', 'Lift'],
  trolleyBus: ['Trolleybuss', 'Trolleybus'], snowAndIce: ['Snø og is', 'Snow and ice'], ferry: ['Ferge', 'Ferry'],
  other: ['Annet', 'Other'],
};
/** @type {Record<string, [string, string]>} */
const SUBMODES = {
  localBus: ['Lokalbuss', 'Local bus'], regionalBus: ['Regionbuss', 'Regional bus'], expressBus: ['Ekspressbuss', 'Express bus'],
  nightBus: ['Nattbuss', 'Night bus'], shuttleBus: ['Shuttlebuss', 'Shuttle bus'], airportLinkBus: ['Flybuss', 'Airport bus'],
  railReplacementBus: ['Buss for tog', 'Rail replacement bus'], schoolBus: ['Skolebuss', 'School bus'],
  schoolAndPublicServiceBus: ['Skole- og rutebuss', 'School and public bus'], highFrequencyBus: ['Høyfrekvent buss', 'High-frequency bus'],
  dedicatedLaneBus: ['Buss i eget felt', 'Dedicated lane bus'], demandAndResponseBus: ['Bestillingsbuss', 'Demand-responsive bus'],
  postBus: ['Postbuss', 'Post bus'], specialNeedsBus: ['Buss for spesielle behov', 'Special needs bus'],
  mobilityBus: ['Tilrettelagt buss', 'Mobility bus'], mobilityBusForRegisteredDisabled: ['Buss for registrerte funksjonshemmede', 'Mobility bus for registered disabled'],
  sightseeingBus: ['Sightseeingbuss', 'Sightseeing bus'],
  internationalCoach: ['Internasjonal buss', 'International coach'], nationalCoach: ['Nasjonal buss', 'National coach'],
  regionalCoach: ['Regional langdistansebuss', 'Regional coach'], commuterCoach: ['Pendlerbuss', 'Commuter coach'],
  shuttleCoach: ['Shuttle (langdistanse)', 'Shuttle coach'], specialCoach: ['Spesialbuss', 'Special coach'],
  schoolCoach: ['Skolebuss (langdistanse)', 'School coach'], sightseeingCoach: ['Sightseeing (langdistanse)', 'Sightseeing coach'],
  touristCoach: ['Turistbuss', 'Tourist coach'],
  local: ['Lokaltog', 'Local train'], regionalRail: ['Regiontog', 'Regional train'], interregionalRail: ['Intercity', 'Interregional train'],
  longDistance: ['Fjerntog', 'Long-distance train'], highSpeedRail: ['Høyhastighetstog', 'High-speed train'],
  international: ['Internasjonalt tog', 'International train'], suburbanRailway: ['Forstadsbane', 'Suburban railway'],
  airportLinkRail: ['Flytog', 'Airport train'], nightRail: ['Nattog', 'Night train'], sleeperRailService: ['Sovevogntog', 'Sleeper train'],
  touristRailway: ['Turist-/museumsbane', 'Tourist railway'], railShuttle: ['Togpendel', 'Rail shuttle'],
  replacementRailService: ['Erstatningstog', 'Replacement rail service'], specialTrain: ['Spesialtog', 'Special train'],
  crossCountryRail: ['Tverrforbindelse', 'Cross-country train'], carTransportRailService: ['Biltog', 'Car transport train'],
  rackAndPinionRailway: ['Tannradbane', 'Rack railway'],
  localTram: ['Lokaltrikk', 'Local tram'], cityTram: ['Bytrikk', 'City tram'], regionalTram: ['Regiontrikk', 'Regional tram'],
  shuttleTram: ['Pendeltrikk', 'Shuttle tram'], trainTram: ['Tog-trikk', 'Train-tram'], sightseeingTram: ['Sightseeingtrikk', 'Sightseeing tram'],
  metro: ['T-bane', 'Metro'], tube: ['Undergrunnsbane', 'Tube'], urbanRailway: ['Bybane', 'Urban railway'],
  localPassengerFerry: ['Lokal passasjerbåt', 'Local passenger ferry'], regionalPassengerFerry: ['Regional passasjerbåt', 'Regional passenger ferry'],
  nationalPassengerFerry: ['Nasjonal passasjerbåt', 'National passenger ferry'], internationalPassengerFerry: ['Internasjonal passasjerbåt', 'International passenger ferry'],
  localCarFerry: ['Lokal bilferge', 'Local car ferry'], regionalCarFerry: ['Regional bilferge', 'Regional car ferry'],
  nationalCarFerry: ['Nasjonal bilferge', 'National car ferry'], internationalCarFerry: ['Internasjonal bilferge', 'International car ferry'],
  highSpeedPassengerService: ['Hurtigbåt', 'High-speed passenger service'], highSpeedVehicleService: ['Hurtiggående bilferge', 'High-speed vehicle service'],
  sightseeingService: ['Sightseeingbåt', 'Sightseeing boat'], airportBoatLink: ['Flybåt', 'Airport boat'], postBoat: ['Postbåt', 'Post boat'],
  schoolBoat: ['Skolebåt', 'School boat'], cableFerry: ['Kabelferge', 'Cable ferry'], riverBus: ['Elvebåt', 'River bus'],
  scheduledFerry: ['Ruteferge', 'Scheduled ferry'], shuttleFerryService: ['Pendelferge', 'Shuttle ferry'], trainFerry: ['Togferge', 'Train ferry'],
  roadFerryLink: ['Fergesamband', 'Road ferry link'],
  domesticFlight: ['Innenlandsfly', 'Domestic flight'], internationalFlight: ['Utenlandsfly', 'International flight'],
  shortHaulInternationalFlight: ['Kort utenlandsfly', 'Short-haul international flight'], SchengenAreaFlight: ['Schengen-fly', 'Schengen flight'],
  helicopterService: ['Helikopter', 'Helicopter'], domesticCharterFlight: ['Innenlands charter', 'Domestic charter'],
  internationalCharterFlight: ['Utenlands charter', 'International charter'], intercontinentalCharterFlight: ['Interkontinental charter', 'Intercontinental charter'],
  roundTripCharterFlight: ['Rundtur-charter', 'Round-trip charter'], sightseeingFlight: ['Sightseeingfly', 'Sightseeing flight'],
  airshipService: ['Luftskip', 'Airship'],
  communalTaxi: ['Kommunetaxi', 'Communal taxi'], charterTaxi: ['Leietaxi', 'Charter taxi'], waterTaxi: ['Vanntaxi', 'Water taxi'],
  telecabin: ['Gondolbane', 'Telecabin'], cableCar: ['Kabinbane', 'Cable car'], telecabinLink: ['Gondolforbindelse', 'Telecabin link'],
  chairLift: ['Stolheis', 'Chair lift'], dragLift: ['Skitrekk', 'Drag lift'], lift: ['Heis', 'Lift'],
  funicular: ['Kabelbane', 'Funicular'], streetCableCar: ['Gatekabelbane', 'Street cable car'],
  allFunicularServices: ['Alle kabelbaner', 'All funicular services'], undefinedFunicular: ['Uspesifisert kabelbane', 'Undefined funicular'],
  snowCoach: ['Beltebil', 'Snow coach'],
};

/** @param {string} mode @param {'no' | 'en'} lang */
export function modeLabel(mode, lang) { return MODES[mode]?.[lang === 'en' ? 1 : 0] ?? mode; }
/** @param {string} submode @param {'no' | 'en'} lang */
export function submodeLabel(submode, lang) { return SUBMODES[submode]?.[lang === 'en' ? 1 : 0] ?? submode; }
