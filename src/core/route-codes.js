const isNumber = (/** @type {string} */ s) => /^\d+$/.test(s);

/**
 * Route order: all-digit codes first, numerically; then the rest in Norwegian alphabetical order.
 * @param {string} a
 * @param {string} b
 */
export function compareRouteCodes(a, b) {
  if (isNumber(a) && isNumber(b)) return Number(a) - Number(b);
  if (isNumber(a) !== isNumber(b)) return isNumber(a) ? -1 : 1;
  return a.localeCompare(b, 'nb');
}

/**
 * The code for a new route: one more than the highest numeric code.
 * @param {string[]} codes
 */
export function nextRouteCode(codes) {
  const numbers = codes.filter(isNumber).map(Number);
  return String(numbers.length ? Math.max(...numbers) + 1 : 1);
}
