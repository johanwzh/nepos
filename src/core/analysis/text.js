// Analyse's Tekst export (spec 2026-10-31): the receipt as plain text, columns aligned with spaces, for pasting into an
// e-mail. The words come from the caller (labels), so the text follows the app's language.

/** @typedef {import('./receipt.js').Receipt} Receipt */
/**
 * t: a UI string by key; mode, fuel, profile: a row's name ('' is Ukjent).
 * @typedef {{ t: (key: string) => string, mode: (m: string) => string, fuel: (f: string) => string, profile: (p: string) => string }} Labels
 */

/** A whole number with thousands spaced (131 200). @param {number} n */
export const int = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
/** One decimal with a comma (37,6). @param {number} n */
export const dec1 = (n) => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');
/** A clock time from minutes; past midnight with its day offset (00:40 +1). @param {number | null} m */
export const clock = (m) => {
  if (m == null) return '—';
  const d = Math.floor(m / 1440), v = m - d * 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}${d ? ` +${d}` : ''}`;
};

/** A share in whole percent, — of nothing. @param {number} part @param {number} whole */
export const pct = (part, whole) => (whole ? `${Math.round((100 * part) / whole)} %` : '—');

/** Fixed-width columns: the first left-aligned, the rest right-aligned. @param {string[]} head @param {string[][]} rows */
function table(head, rows) {
  const all = [head, ...rows];
  const w = head.map((_, c) => Math.max(...all.map((r) => (r[c] ?? '').length)));
  return all.map((r) => r.map((v, c) => (c === 0 ? (v ?? '').padEnd(w[c]) : (v ?? '').padStart(w[c]))).join('   ')).join('\n');
}

/**
 * @param {Receipt} r
 * @param {{ title: string, periodText: string, labels: Labels, children?: { name: string, departures: number, km: number, hours: number }[] }} opts
 * @returns {string}
 */
export function receiptText(r, { title, periodText, labels: L, children = [] }) {
  const t = L.t;
  const km = (/** @type {number | null} */ n) => (n == null ? '—' : int(n));
  const p = r.production;
  const lf = r.access.lowFloor, bk = r.access.booked;
  const blocks = [
    [t('anScopeHead'), table(['', t('anLines'), t('anTrips'), t('anDepartures'), t('anStops')], [
      ...r.scope.rows.map((x) => [L.mode(x.mode), int(x.lines), int(x.trips), int(x.departures), int(x.stops)]),
      [t('anSum'), int(r.scope.sum.lines), int(r.scope.sum.trips), int(r.scope.sum.departures), int(r.scope.sum.stops)]])],
    [t('anNetworkHead'), table(['', t('anStretches'), t('anKm')], [
      ...r.network.groups.flatMap((g) => [[L.profile(g.profile), '', ''], [`  ${t('anRouted')}`, int(g.routed.stretches), int(g.routed.km)], [`  ${t('anUnknown')}`, int(g.unknown), '—']]),
      [t('anSumKnown'), int(r.network.sum.stretches), int(r.network.sum.km)]])],
    [t('anProdHead'), table(['', t('anPlanned'), t('anDone'), t('anRemaining')], [
      [t('anDepartures'), int(p.planned.departures), int(p.done.departures), int(p.remaining.departures)],
      [t('anHours'), int(p.planned.hours), int(p.done.hours), int(p.remaining.hours)],
      [t('anKmKnown'), int(p.planned.km), int(p.done.km), int(p.remaining.km)],
      [t('anUnknownKmDeps'), int(p.planned.unknownKmDepartures), int(p.done.unknownKmDepartures), int(p.remaining.unknownKmDepartures)],
      [t('anAvgSpeed'), p.avgKmh == null ? '—' : `${dec1(p.avgKmh)} km/t`, '', '']])],
    [t('anFuelHead'), `${table(['', t('anDepartures'), t('anKm'), t('anHours'), t('anSeatKm')], [
      ...r.fuel.rows.map((x) => [L.fuel(x.fuel), int(x.departures), int(x.km), int(x.hours), km(x.seatKm)]),
      [t('anSum'), int(r.fuel.sum.departures), int(r.fuel.sum.km), int(r.fuel.sum.hours), int(r.fuel.sum.seatKm)],
      [`  ${t('anOfWhichUnknownKm')}`, int(r.fuel.unknownKm.departures), '—', int(r.fuel.unknownKm.hours), '—']])}`],
    [t('anAccessHead'), table(['', t('anAccYes'), t('anAccNo'), t('anAccUnknown'), t('anAccShare')], [
      [t('anLowFloor'), int(lf.yes), int(lf.no), int(lf.unknown), pct(lf.yes, lf.yes + lf.no + lf.unknown)],
      [t('anBooking'), int(bk.yes), int(bk.no), '—', pct(bk.yes, bk.yes + bk.no)]])],
    [t('anDayHead'), table(['', t('anDates'), t('anDepartures'), t('anHours'), t('anFirstLast')],
      r.dayTypes.map((d) => [t(`anDay_${d.type}`), int(d.dates), int(d.departures), int(d.hours), d.first == null ? '—' : `${clock(d.first)} – ${clock(d.last)}`]))],
  ];
  if (children.length) {
    blocks.push([t('anChildrenHead'), table(['', t('anDepartures'), t('anKm'), t('anHours')], [
      ...children.map((c) => [c.name, int(c.departures), int(c.km), int(c.hours)]),
      [t('anSum'), int(children.reduce((n, c) => n + c.departures, 0)), int(children.reduce((n, c) => n + c.km, 0)), int(children.reduce((n, c) => n + c.hours, 0))]])]);
  }
  return `${title}\n${periodText}\n\n${blocks.map(([h, body]) => `${h}\n${body}`).join('\n\n')}\n`;
}
