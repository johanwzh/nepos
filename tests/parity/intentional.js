// Every deliberate difference between Nepos 2 output and the recorded 1.5.7 baseline.
// Parity tests apply these to the baseline, so anything NOT listed here must still match exactly.

/**
 * ERN text: #LEV keeps only name and codespace (no personal data); #TUR drops the
 * vehicle-reference field (vehicles are dropped in Nepos 2).
 * @param {string} v1Text
 */
export function expectedRoundtrip(v1Text) {
  return v1Text
    .replace(/^#LEV;([^;\r\n]*);([^;\r\n]*)(?:;[^\r\n]*)?(?=\r?\n)/m, '#LEV;$1;$2')
    .replace(/^(#TUR;[^;\r\n]*;[^;\r\n]*;0;0;0;0);[^\r\n]*(?=\r?\n)/gm, '$1');
}

/**
 * Parsed route state: columns no longer carry vehicleId, #SEK org IDs are strings and keep the
 * name from the file, and the #CUR rate is kept as read (1.5.7 replaced it with its built-in
 * table value on write). Stop IDs are text (NSR Quay IDs), not numbers.
 * @param {any} v1Parsed
 * @param {string} ernText the ERN file the state was parsed from
 */
export function expectedParsed(v1Parsed, ernText) {
  const copy = JSON.parse(JSON.stringify(v1Parsed));
  for (const grid of Object.values(copy.grids)) {
    for (const col of /** @type {any} */ (grid).cols) delete col.vehicleId;
  }
  // Stop IDs are text in Nepos 2 (NSR Quay IDs); 1.5.7 parsed them as numbers.
  for (const grid of Object.values(copy.grids)) {
    for (const stop of /** @type {any} */ (grid).stops) if (stop.stopId != null) stop.stopId = String(stop.stopId);
  }
  const rate = ernText.match(/^#CUR;[^;\r\n]*;([^;\r\n]+)/m)?.[1];
  if (rate) copy.currencyRate = rate;
  const sekLines = ernText.split(/\r?\n/).filter((l) => l.startsWith('#SEK;')).map((l) => l.split(';'));
  for (const s of copy.sek) {
    // #SEK org IDs are kept as text (they are full NeTEx IDs in Nepos 2).
    s.orgId = String(s.orgId);
    // #SEK keeps the organisation name from the file, so a save never blanks it.
    s.name = sekLines.find((f) => f[1].trim() === s.orgId)?.[2] || '';
  }
  return copy;
}

// Not a transform, but a deliberate difference all the same: 1.5.7 also wrote _stops.xml.
// Nepos 2 never produces it (stops belong to NSR), so it is neither recorded nor compared.
// QuayRefs point at NSR Quays directly; the sample's old numeric IDs keep 1.5.7's CS:Quay:<id>.

/**
 * 1.5.7 dropped a trip whose column note says "runs only" on single dates: it filed the trip
 * under a DayType of those dates but looked it up by its day code, found nothing and wrote no
 * ServiceJourney (while an interchange still pointed at it). Nepos 2 writes it, on the DayType of
 * its dates. In the sample this is route 10, column 1 (runs only 15 June).
 */
const RESTORED_RUNS_ONLY_TRIP = `      <ServiceJourney id="TST:ServiceJourney:10-0-1-1" version="1">
        <TransportMode>water</TransportMode>
        <dayTypes><DayTypeRef ref="TST:DayType:2"/></dayTypes>
        <JourneyPatternRef ref="TST:JourneyPattern:10-0-2" version="1"/>
        <passingTimes>
          <TimetabledPassingTime id="TST:TimetabledPassingTime:10-0-1-1-1" version="1">
            <StopPointInJourneyPatternRef ref="TST:StopPointInJourneyPattern:10-0-2-1" version="1"/>
            <DepartureTime>14:00:00</DepartureTime>
          </TimetabledPassingTime>
          <TimetabledPassingTime id="TST:TimetabledPassingTime:10-0-1-1-2" version="1">
            <StopPointInJourneyPatternRef ref="TST:StopPointInJourneyPattern:10-0-2-2" version="1"/>
            <ArrivalTime>16:30:00</ArrivalTime>
            <DepartureTime>16:45:00</DepartureTime>
          </TimetabledPassingTime>
        </passingTimes>
      </ServiceJourney>
`;

/**
 * NeTEx: Nepos 2 produces no ServiceLinks (spec §8), so the shared file has no <serviceLinks>
 * and journey patterns have no <linksInSequence>; and it writes the "runs only" trip 1.5.7
 * dropped (see above).
 * @param {string} v1Xml
 */
export function expectedNetex(v1Xml) {
  const withoutLinks = v1Xml
    .replace(/\n {6}<serviceLinks>[\s\S]*?\n {6}<\/serviceLinks>/g, '')
    .replace(/\n {8}<linksInSequence>[\s\S]*?\n {8}<\/linksInSequence>/g, '');
  const anchor = '      <ServiceJourney id="TST:ServiceJourney:10-0-1-2" version="1">';
  return withoutLinks.includes(anchor) ? withoutLinks.replace(anchor, RESTORED_RUNS_ONLY_TRIP + anchor) : withoutLinks;
}

/** NeTEx file names: Entur delivery convention. */
export const NETEX_FILE_NAMES = {
  '_shared_data.xml': '_TST-shared.xml',
  'Line-TST_10_timetable.xml': 'TST-Line-10.xml',
  'Line-TST_20_timetable.xml': 'TST-Line-20.xml',
};
