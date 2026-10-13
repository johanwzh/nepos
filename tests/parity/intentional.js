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
 * Parsed route state: columns no longer carry vehicleId.
 * @param {any} v1Parsed
 */
export function expectedParsed(v1Parsed) {
  const copy = JSON.parse(JSON.stringify(v1Parsed));
  for (const grid of Object.values(copy.grids)) {
    for (const col of /** @type {any} */ (grid).cols) delete col.vehicleId;
  }
  return copy;
}

/** NeTEx file names: Entur delivery convention. */
export const NETEX_FILE_NAMES = {
  '_shared_data.xml': '_TST-shared.xml',
  'Line-TST_10_timetable.xml': 'TST-Line-10.xml',
  'Line-TST_20_timetable.xml': 'TST-Line-20.xml',
};
