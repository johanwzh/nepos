// The search window (spec §7.1): find a stop place by name, open it, pick one of its Quays from
// the list or the map — or type an NSR Quay ID (accepted even if NSR does not know it yet) or a
// StopPlace ID. Only a Quay can be picked. Services and map are injectable for tests.
import { app } from './state.js';
import { $ } from './shell.js';
import { t, getLang } from '../i18n/strings.js';
import { searchStopPlaces } from '../services/geocoder.js';
import { getStopPlace, lookupQuays } from '../services/nsr.js';
import { NSR_QUAY_PATTERN, NSR_STOP_PLACE_PATTERN, modeMatches } from '../core/quays.js';
import { ERN_MODES } from '../core/ern/modes.js';

/**
 * @typedef {{ quayId: string, name: string, info: import('../services/nsr.js').QuayInfo | null | undefined }} Pick
 *   info: what NSR said; null when NSR answered it does not know the Quay; undefined when NSR has not
 *   answered (still checking, or could not be reached) — then nothing is known yet.
 */
/** @typedef {{ show(points: { id: string, lat: number, lon: number, label: string }[], onClick: (id: string) => void): void }} WorkbenchMap */

let services = { search: searchStopPlaces, getStopPlace, lookupQuays };
/** Replace the Entur adapters (tests). @param {Partial<typeof services>} s */
export function setWorkbenchServices(s) {
  services = { ...services, ...s };
}

/** @type {((el: HTMLElement) => WorkbenchMap) | null} */
let mapFactory = null;
/** @type {WorkbenchMap | null} */
let map = null;
/** How the window draws its map (the Leaflet one in the app, a fake in tests). @param {(el: HTMLElement) => WorkbenchMap} factory */
export function setWorkbenchMap(factory) {
  mapFactory = factory;
  map = null;
}

/**
 * @type {{ resolve: (pick: Pick | null) => void, ernMode: number, hits: any[], place: any, direct: any,
 *          seq: number, timer: any } | null}
 */
let session = null;

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const opts = (/** @type {'geocoder' | 'nsr'} */ which) => ({
  baseUrl: which === 'geocoder' ? app.settings.geocoderUrl : app.settings.stopPlacesUrl,
  clientName: app.settings.clientName || 'nepos-online',
});
const modeName = (/** @type {number} */ ernMode) => {
  const m = /** @type {any} */ (ERN_MODES)[ernMode];
  return m ? String(m[getLang()] ?? m.en).toLowerCase() : '';
};

/**
 * Open the window. Resolves with the picked Quay, or null when it is closed.
 * @param {{ query?: string, ernMode?: number }} [opts]
 * @returns {Promise<Pick | null>}
 */
export function openWorkbench({ query = '', ernMode = 0 } = {}) {
  if (session) finish(null);
  return new Promise((resolve) => {
    session = { resolve, ernMode, hits: [], place: null, direct: null, seq: 0, timer: null };
    const q = /** @type {HTMLInputElement} */ ($('ws-q'));
    q.value = query;
    q.placeholder = t('wsPlaceholder');
    $('ws-only-mode').checked = true;
    $('ws-only-mode-label').textContent = t('wsOnlyMode', modeName(ernMode));
    $('ws-only-mode').parentElement.hidden = !modeName(ernMode);
    setStatus('');
    $('ws-dlg').showModal();
    if (!map && mapFactory) map = mapFactory($('ws-map'));
    q.focus();
    q.select();
    render();
    if (query.trim()) search();
  });
}

/** @param {Pick | null} pick */
function finish(pick) {
  if (!session) return;
  const s = session;
  session = null;
  clearTimeout(s.timer);
  if ($('ws-dlg').open) $('ws-dlg').close();
  s.resolve(pick);
}

/** @param {string} text */
function setStatus(text) {
  $('ws-status').textContent = text;
}

/** Search, or open a typed ID. Answers to older searches are ignored. */
async function search() {
  const s = session;
  if (!s) return;
  clearTimeout(s.timer);
  const q = /** @type {HTMLInputElement} */ ($('ws-q')).value.trim();
  const seq = ++s.seq;
  const current = () => session === s && s.seq === seq;
  s.place = null;
  s.direct = null;
  if (!q) { s.hits = []; setStatus(''); render(); return; }

  if (NSR_QUAY_PATTERN.test(q)) {
    s.direct = { quayId: q, info: undefined };
    s.hits = [];
    setStatus('');
    render();
    try {
      const found = await services.lookupQuays([q], opts('nsr'));
      if (current()) { s.direct.info = found.get(q) ?? null; render(); }
    } catch {
      if (current()) { s.direct.failed = true; render(); } // stays "not checked"; still pickable
    }
    return;
  }

  setStatus(t('wsSearching'));
  try {
    if (NSR_STOP_PLACE_PATTERN.test(q)) {
      const place = await services.getStopPlace(q, opts('nsr'));
      if (!current()) return;
      if (!place) { setStatus(t('wsNotFound', q)); s.hits = []; render(); return; }
      s.place = place;
      setStatus('');
    } else {
      const hits = await services.search(q, opts('geocoder'));
      if (!current()) return;
      s.hits = hits;
      setStatus('');
    }
    render();
  } catch (e) {
    if (current()) setStatus(t('wsFailed', /** @type {Error} */ (e).message));
  }
}

/** Open a stop place from the results or the map. @param {string} id */
async function openPlace(id) {
  const s = session;
  if (!s) return;
  clearTimeout(s.timer); // a pending typed search must not replace the stop place just clicked
  const seq = ++s.seq;
  setStatus(t('wsSearching'));
  try {
    const place = await services.getStopPlace(id, opts('nsr'));
    if (session !== s || s.seq !== seq) return;
    if (!place) { setStatus(t('wsNotFound', id)); return; }
    s.place = place;
    setStatus('');
    render();
  } catch (e) {
    if (session === s && s.seq === seq) setStatus(t('wsFailed', /** @type {Error} */ (e).message));
  }
}

/** @param {any} place @param {any} quay @returns {Pick} */
function quayPick(place, quay) {
  return {
    quayId: quay.quayId,
    name: place.name,
    info: { quayId: quay.quayId, publicCode: quay.publicCode, stopPlaceId: place.id, stopPlaceName: place.name, mode: place.mode, lat: quay.lat, lon: quay.lon },
  };
}

/** @param {string} html @param {() => void} onClick @param {string} [cls] */
function row(html, onClick, cls = 'n2-ws-row') {
  const div = document.createElement('div');
  div.className = cls;
  div.innerHTML = html;
  div.addEventListener('click', onClick);
  return div;
}

function render() {
  const s = session;
  const list = $('ws-list');
  list.innerHTML = '';
  if (!s) return;
  /** @type {{ id: string, lat: number, lon: number, label: string }[]} */
  let points = [];
  /** @type {(id: string) => void} */
  let onMapClick = () => {};

  if (s.direct) {
    const info = s.direct.info;
    const label = info ? `${info.stopPlaceName} ${info.publicCode}`.trim()
      : info === null ? t('wsNotSeen') : s.direct.failed ? t('wsUnchecked') : t('wsChecking');
    list.appendChild(row(`${esc(t('wsUseId', s.direct.quayId))}<small>${esc(label)}</small>`,
      () => finish({ quayId: s.direct.quayId, name: info?.stopPlaceName ?? '', info })));
    if (info?.lat != null && info.lon != null) points = [{ id: s.direct.quayId, lat: info.lat, lon: info.lon, label }];
    onMapClick = () => finish({ quayId: s.direct.quayId, name: info?.stopPlaceName ?? '', info });
  } else if (s.place) {
    const place = s.place;
    if (s.hits.length) list.appendChild(row(esc(t('wsBack')), () => { s.place = null; setStatus(''); render(); }, 'n2-ws-back'));
    const otherMode = place.mode && !modeMatches(s.ernMode, place.mode);
    const head = document.createElement('div');
    head.className = 'n2-ws-place';
    head.innerHTML = `${esc(place.name)}<small>${esc(place.description)}${otherMode ? ` · <span class="n2-ws-warn">${esc(t('wsOtherMode'))}</span>` : ''}</small>`;
    list.appendChild(head);
    if (!place.quays.length) setStatus(t('wsNoQuays'));
    for (const quay of place.quays) {
      list.appendChild(row(`${esc(t('wsQuay', quay.publicCode))}<small>${esc(quay.quayId)}${quay.description ? ` · ${esc(quay.description)}` : ''}</small>`,
        () => finish(quayPick(place, quay))));
    }
    points = place.quays.filter((/** @type {any} */ q) => q.lat != null && q.lon != null)
      .map((/** @type {any} */ q) => ({ id: q.quayId, lat: q.lat, lon: q.lon, label: `${place.name} ${q.publicCode}`.trim() }));
    onMapClick = (id) => {
      const quay = place.quays.find((/** @type {any} */ q) => q.quayId === id);
      if (quay) finish(quayPick(place, quay));
    };
  } else {
    const onlyMode = $('ws-only-mode').checked && modeName(s.ernMode);
    const shownHits = onlyMode
      ? s.hits.filter((h) => !h.modes.length || h.modes.some((/** @type {string} */ m) => modeMatches(s.ernMode, m)))
      : s.hits;
    const hidden = s.hits.length - shownHits.length;
    if (s.hits.length && !$('ws-status').textContent) setStatus(hidden ? t('wsHidden', hidden) : '');
    if (s.seq && !s.hits.length && !$('ws-status').textContent) setStatus(t('wsNoResults'));
    for (const h of shownHits) {
      const detail = [h.description, h.context, h.modes.join(', ')].filter(Boolean).join(' · ');
      list.appendChild(row(`${esc(h.name)}<small>${esc(detail)}</small>`, () => { openPlace(h.id); }));
    }
    points = shownHits.filter((h) => h.lat != null && h.lon != null).map((h) => ({ id: h.id, lat: h.lat, lon: h.lon, label: h.name }));
    onMapClick = (id) => { openPlace(id); };
  }
  map?.show(points, onMapClick);
}

/** Wire the window once its markup is in the page. */
export function initWorkbench() {
  const q = /** @type {HTMLInputElement} */ ($('ws-q'));
  q.addEventListener('keydown', (e) => {
    e.stopPropagation(); // the grid and the shell must not see typing in the search box
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // A second Enter on a pasted Quay ID picks it (no mouse needed).
    const direct = session?.direct;
    if (direct && q.value.trim() === direct.quayId) finish({ quayId: direct.quayId, name: direct.info?.stopPlaceName ?? '', info: direct.info });
    else search();
  });
  q.addEventListener('input', () => {
    if (!session) return;
    clearTimeout(session.timer);
    session.timer = setTimeout(search, 350);
  });
  $('ws-only-mode').addEventListener('change', () => { if (session) { setStatus(''); render(); } });
  $('ws-close').addEventListener('click', () => finish(null));
  // Escape closes a modal dialog: 'cancel', then 'close'.
  // The close event arrives later; ignore it when a new session has already opened the window.
  $('ws-dlg').addEventListener('close', () => { if (!$('ws-dlg').open) finish(null); });
}
