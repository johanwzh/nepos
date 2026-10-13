/**
 * The route's name and public code for the route list, read straight from the text so that
 * listing many routes does not need a full parse.
 * @param {string} text
 */
export function routeSummary(text) {
  let name = '', publicCode = '';
  for (const raw of text.split(/\r?\n/)) {
    const f = raw.trim().split(';');
    if (f[0] === '#RUT' && !name) name = f[3] ?? '';
    if (f[0] === '#TRA' && !publicCode) publicCode = f[1] ?? '';
    if (name && publicCode) break;
  }
  return { name, publicCode };
}
