// The session's NSR lookups (spec §7.2): looked up when a project opens and when a stop ID is
// typed; kept in memory only. Advisory: a failed lookup leaves stops "not checked".
import { app } from './state.js';
import { t } from '../i18n/strings.js';
import { lookupQuays } from '../services/nsr.js';
import { NSR_QUAY_PATTERN, quayIdsInErn, quayStatus } from '../core/quays.js';

/**
 * Quay ID → what NSR said, or null when NSR does not know it. No entry = not looked up.
 * @type {Map<string, import('../services/nsr.js').QuayInfo | null>}
 */
export const quayInfo = new Map();

let lookup = lookupQuays;
let generation = 0;
/** @type {(() => void)[]} */
const listeners = [];

/** Replace the NSR lookup (tests). @param {typeof lookupQuays} fn */
export function setQuayLookup(fn) {
  lookup = fn;
}

/** Called after new lookup results arrive. @param {() => void} fn */
export function onQuaysLoaded(fn) {
  listeners.push(fn);
}

/** Forget everything (another project opened). Lookups still running are ignored when they finish. */
export function clearQuays() {
  quayInfo.clear();
  generation++;
}

/**
 * Look up the NSR Quays not looked up yet.
 * @param {string[]} ids
 */
export async function loadQuays(ids) {
  const todo = [...new Set(ids)].filter((id) => NSR_QUAY_PATTERN.test(id) && !quayInfo.has(id));
  if (!todo.length) return;
  const gen = generation;
  try {
    const found = await lookup(todo, {
      baseUrl: app.settings.stopPlacesUrl,
      clientName: app.settings.clientName || 'nepos-online',
    });
    if (gen !== generation) return;
    for (const [id, info] of found) quayInfo.set(id, info);
    for (const fn of listeners) fn();
  } catch (e) {
    console.warn('NSR lookup failed', e);
  }
}

/** Look up every Quay the open project uses. */
export function loadProjectQuays() {
  clearQuays();
  return loadQuays(app.routes.flatMap((r) => quayIdsInErn(r.text)));
}

/**
 * How the grid marks a stop: a CSS class and a tooltip.
 * @param {{ stopId: string | null }} stop
 */
export function stopMark(stop) {
  const id = stop.stopId == null ? '' : String(stop.stopId);
  const info = quayInfo.get(id);
  switch (quayStatus(id, info, app.routeState?.transportMode ?? 0)) {
    case 'missing': return { cls: 'stop-unlinked', title: t('quayMissing') };
    case 'not-nsr': return { cls: 'stop-unlinked', title: t('quayNotNsr', id) };
    case 'not-seen': return { cls: 'n2-quay-notseen', title: t('quayNotSeen', id) };
    case 'mode-mismatch': return { cls: 'stop-broken', title: t('quayMismatch', id, info?.stopPlaceName ?? '', info?.mode ?? '') };
    case 'confirmed': return { cls: '', title: t('quayConfirmed', id, `${info?.stopPlaceName ?? ''} ${info?.publicCode ?? ''}`.trim()) };
    default: return { cls: '', title: t('quayUnknown', id) };
  }
}
