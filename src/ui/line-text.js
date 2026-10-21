// A line's ERN text as Nepos writes it (the same for saving, exporting and comparing with the last export).
import { app } from './state.js';
import { serializeERN } from '../core/ern/serialize.js';
import { orgNameList } from '../core/orgs.js';

/** @param {string} code @param {any} rs */
export const lineErn = (code, rs) => serializeERN(rs, code, { delivery: { name: app.meta?.name ?? '', codespace: app.meta?.codespace ?? '' }, orgs: orgNameList(app.orgs) });
