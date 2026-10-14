import { modeFromErn } from '../core/modes.js';

/**
 * The route's name, public code, mode and branding for the route list, read straight from the text so that
 * listing many routes does not need a full parse.
 * @param {string} text
 */
export function routeSummary(text) {
  let name = '', publicCode = '', mode = '', submode = '', brandingId = '', ern = 0, sawRut = false;
  for (const raw of text.split(/\r?\n/)) {
    const f = raw.trim().split(';');
    if (f[0] === '#RUT' && !sawRut) { sawRut = true; name = f[3] ?? ''; publicCode = f[2] ?? ''; ern = parseInt(f[5] ?? '') || 0; }
    else if (f[0] === '#MOD' && !mode) { mode = f[1] ?? ''; submode = f[2] ?? ''; }
    else if (f[0] === '#BRA' && !brandingId) brandingId = f[1] ?? '';
    else if (f[0] === '#TRA' || f[0] === '#PER') break;
  }
  if (!mode && ern) ({ mode, submode } = modeFromErn(ern));
  return { name, publicCode, mode, submode, brandingId };
}
