// Prices are hidden in Nepos 2, but the #CUR record is written back exactly as 1.5.7 did.
// The rates mirror 1.5.7's CURRENCIES table (nepos.html lines 1770–1777). Unknown ids fall back
// to neposcoin, matching 1.5.7's getCurrency() fallback to the first table entry.
export const CURRENCY_RATES = {
  neposcoin: 1.0,
  gbp: 1.0,
  spd: 9.0,
  riksdaler: 6.9,
  rigsdaler: 5.2,
  vereinsthaler: 6.5,
};

/**
 * @param {string} id
 * @returns {number}
 */
export function currencyRate(id) {
  return CURRENCY_RATES[id] ?? CURRENCY_RATES.neposcoin;
}
