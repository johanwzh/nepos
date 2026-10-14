import { modeFromErn } from '../core/modes.js';

/**
 * The route's name, public code, mode, branding, flags, calendars and organisations for the line
 * list, read straight from the text so that listing many lines does not need a full parse.
 * @param {string} text
 */
export function routeSummary(text) {
  let name = '', publicCode = '', mode = '', submode = '', brandingId = '', ern = 0, sawRut = false, inTables = false;
  let exported = true, isPublic = true;
  /** @type {string[]} */ const calendarIds = [];
  /** @type {string[]} */ const authorities = [];
  /** @type {string[]} */ const operators = [];
  for (const raw of text.split(/\r?\n/)) {
    const f = raw.trim().split(';');
    if (f[0] === '#KAL') { const id = (f[1] ?? '').trim(); if (id && !calendarIds.includes(id)) calendarIds.push(id); continue; }
    if (f[0] === '#TRA' || f[0] === '#PER') inTables = true;
    if (inTables) continue;
    if (f[0] === '#RUT' && !sawRut) { sawRut = true; name = f[3] ?? ''; publicCode = f[2] ?? ''; ern = parseInt(f[5] ?? '') || 0; }
    else if (f[0] === '#MOD' && !mode) { mode = f[1] ?? ''; submode = f[2] ?? ''; }
    else if (f[0] === '#BRA' && !brandingId) brandingId = f[1] ?? '';
    else if (f[0] === '#EKS') exported = (f[1] ?? '').trim() !== '0';
    else if (f[0] === '#OFF') isPublic = (f[1] ?? '').trim() !== '0';
    else if (f[0] === '#SEK') {
      const id = (f[1] ?? '').trim();
      if (!id || id === '-1') continue;
      if (f[3] === '1') authorities.push(id);
      else operators.push(id);
    }
  }
  if (!mode && ern) ({ mode, submode } = modeFromErn(ern));
  return { name, publicCode, mode, submode, brandingId, exported, isPublic, calendarIds, orgIds: [...authorities, ...operators] };
}
