// The stop at the selected row, at the top of the map pane (user test 2026-10-16): a sign with the
// mode, the stop place's name, the platform, the Quay ID (with a copy button), a link to the stop
// place in NSR, and what NSR tells about it — shelter, sign, access, waiting room. Follows the
// selected row in any column. Details are fetched once per stop place in a session.
// Every slot has its place and height, filled or blank, so the block never changes size.
import { app } from './state.js';
import { onRefresh } from './shell.js';
import { t } from '../i18n/strings.js';
import { grid, selectedRowIndex, onGridRender } from './grid.js';
import { quayInfo, onQuaysLoaded } from './quays.js';
import { getStopPlace } from '../services/nsr.js';
import { modeIconSvg } from './mode-icons.js';

/** @typedef {import('../services/nsr.js').StopPlace} StopPlace */

let services = { getStopPlace };
/** Replace the NSR adapter (tests). @param {Partial<typeof services>} s */
export function setStopCardServices(s) {
  services = { ...services, ...s };
  details.clear();
}

/** @type {Map<string, StopPlace | null | 'loading'>} stop places with their details, this session */
const details = new Map();

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** @param {string} placeId */
function load(placeId) {
  if (details.has(placeId)) return;
  details.set(placeId, 'loading');
  services.getStopPlace(placeId, { baseUrl: app.settings.stopPlacesUrl, clientName: app.settings.clientName || 'nepos-online' })
    .then((p) => { details.set(placeId, p); }, () => { details.delete(placeId); })
    .then(render);
}

// The facts' symbols (2.5): small line drawings in the text colour, each with a short word — no hover text
const svg = (/** @type {string} */ d) => `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="${d}"/></svg>`;
const ICONS = {
  shelter: svg('M2 7 L8 2 L14 7 M3.5 6 V14 M12.5 6 V14 M3.5 14 H12.5'),
  shelterOpen: svg('M2 7 L8 2 L14 7 M3.5 6 V14 M12.5 6 V14'),
  sign: svg('M8 15 V8 M8 8 a3 3 0 1 0 0.01 0'),
  wheelchair: svg('M8 2.5 a1 1 0 1 0 0.01 0 M8 5 V9 H11 L12.5 12.5 M6.5 6.5 a4 4 0 1 0 4 6.5'),
  stepFree: svg('M1.5 13.5 H14.5 L14.5 6 Z'),
  waiting: svg('M4 2.5 V13.5 M4 8 H11 V13.5 M11 8 V5'),
};

/** What NSR says about the Quay and its stop place: a symbol and a short word each. @param {StopPlace} place @param {string} quayId */
function facts(place, quayId) {
  const q = /** @type {any} */ (place.quays.find((x) => x.quayId === quayId));
  /** @type {{ icon: string, text: string, cls?: string }[]} */
  const out = [];
  if (q?.shelter) out.push({ icon: q.shelter === 'enclosed' ? ICONS.shelter : ICONS.shelterOpen, text: t(q.shelter === 'enclosed' ? 'scShelterEnclosed' : 'scShelterOpen') });
  if (q?.sign) out.push({ icon: ICONS.sign, text: t('scSign') });
  if (q?.wheelchair === 'yes') out.push({ icon: ICONS.wheelchair, text: t('scWheelchairYes') });
  else if (q?.wheelchair === 'partial') out.push({ icon: ICONS.wheelchair, text: t('scWheelchairPartial'), cls: 'part' });
  else if (q?.wheelchair === 'no') out.push({ icon: ICONS.wheelchair, text: t('scWheelchairNo'), cls: 'no' });
  if (q?.stepFree === 'yes' && q?.wheelchair !== 'yes') out.push({ icon: ICONS.stepFree, text: t('scStepFree') });
  if (place.waitingRoom) out.push({ icon: ICONS.waiting, text: t('scWaitingRoom', place.waitingRoom.seats, place.waitingRoom.heated) });
  return out;
}

export function renderStopCard() { render(); }

/**
 * The block, always with the same slots: row, sign on its post, name, platform, facts, ID line.
 * @param {{ row?: string, icon?: string, name?: string, nameMuted?: boolean, quay?: string, quayMuted?: boolean,
 *           facts?: { icon: string, text: string, cls?: string }[], id?: string, placeId?: string, lat?: number | null, lon?: number | null }} v
 */
function skeleton(v) {
  return `<div class="sc-row">${esc(v.row ?? '')}</div>
    <div class="sc"><div class="sc-post"><div class="sc-plate${v.icon ? '' : ' empty'}">${v.icon ?? ''}</div><div class="sc-pole"></div></div>
      <div class="sc-main"><div class="sc-name${v.nameMuted ? ' sc-muted' : ''}">${esc(v.name ?? '')}</div>
        <div class="sc-quay${v.quayMuted ? ' sc-muted' : ''}">${esc(v.quay ?? '')}</div></div></div>
    <div class="sc-facts">${(v.facts ?? []).map((x) => `<span class="sc-fact${x.cls ? ` ${x.cls}` : ''}">${x.icon} ${esc(x.text)}</span>`).join('')}</div>
    <div class="sc-id">${v.id ? `<code>${esc(v.id)}</code><button class="sc-chip sc-copy">${esc(t('scCopy'))}</button>` : ''}
      ${v.placeId ? `<a class="sc-chip sc-nsr" href="https://stoppested.entur.org/stop_place/${esc(v.placeId)}" target="_blank" rel="noopener">NSR ↗</a>` : ''}
      ${v.lat != null && v.lon != null ? `<a class="sc-chip sc-sv" href="https://www.google.com/maps/@?api=1&amp;map_action=pano&amp;viewpoint=${v.lat},${v.lon}" target="_blank" rel="noopener">StreetView ↗</a>` : ''}</div>`;
}

function render() {
  const box = document.getElementById('map-stop');
  if (!box) return;
  const ri = grid.active ? selectedRowIndex() : null;
  const stop = ri == null ? null : grid.stops[ri];
  if (!stop) { box.innerHTML = skeleton({ name: t('scNone'), nameMuted: true }); return; }
  const row = t('scRow', ri + 1);
  if (!stop.stopId) { box.innerHTML = skeleton({ row, name: stop.name || '—', quay: t('scNotLinked'), quayMuted: true }); return; }
  const id = String(stop.stopId);
  const info = quayInfo.get(id);
  const placeId = info?.stopPlaceId ?? '';
  if (placeId) load(placeId);
  const place = placeId ? details.get(placeId) : null;
  const mode = info?.mode || /** @type {any} */ (place && place !== 'loading' ? place.mode : '') || '';
  box.innerHTML = skeleton({
    row, icon: modeIconSvg(mode), name: info?.stopPlaceName || stop.name || id,
    quay: info === null ? t('scUnknown') : info?.publicCode ? t('wsQuay', info.publicCode) : '', quayMuted: info === null,
    facts: place && place !== 'loading' ? facts(place, id) : [], id, placeId, lat: info?.lat, lon: info?.lon, // Street View: the label is English (user 2026-10-30)
  });
  const copy = /** @type {HTMLButtonElement} */ (box.querySelector('.sc-copy'));
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(id).then(() => { copy.textContent = t('scCopied'); setTimeout(() => { copy.textContent = t('scCopy'); }, 1200); }, () => {});
  });
}

export function initStopCard() {
  onGridRender(render);
  onRefresh(render);
  onQuaysLoaded(render);
  render();
}
