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
// Until Plan 3 switches stop references to NSR Quay IDs, the shared file's QuayRefs point at
// Quays no file defines.

/** NeTEx file names: Entur delivery convention. */
export const NETEX_FILE_NAMES = {
  '_shared_data.xml': '_TST-shared.xml',
  'Line-TST_10_timetable.xml': 'TST-Line-10.xml',
  'Line-TST_20_timetable.xml': 'TST-Line-20.xml',
};
