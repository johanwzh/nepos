// The stop at the selected row, at the top of the map pane (user test 2026-10-16): a sign with the
// mode, the stop place's name, the platform, the Quay ID (with a copy button), a link to the stop
// place in NSR, and what NSR tells about it — shelter, sign, access, waiting room, heading. Follows
// the selected row in any column. Details are fetched once per stop place in a session.
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

/** The 8-point compass name of a bearing. @param {number} deg */
const compass = (deg) => t('scCompass')[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

/** @param {string} placeId */
function load(placeId) {
  if (details.has(placeId)) return;
  details.set(placeId, 'loading');
  services.getStopPlace(placeId, { baseUrl: app.settings.stopPlacesUrl, clientName: app.settings.clientName || 'nepos-online' })
    .then((p) => { details.set(placeId, p); }, () => { details.delete(placeId); })
    .then(render);
}

/** What NSR says about the Quay and its stop place, as short phrases. @param {StopPlace} place @param {string} quayId */
function facts(place, quayId) {
  const q = /** @type {any} */ (place.quays.find((x) => x.quayId === quayId));
  /** @type {string[]} */
  const out = [];
  if (q?.shelter) out.push(t(q.shelter === 'enclosed' ? 'scShelterEnclosed' : 'scShelterOpen'));
  if (q?.sign) out.push(t('scSign'));
  if (q?.wheelchair === 'yes') out.push(t('scWheelchairYes'));
  else if (q?.wheelchair === 'partial') out.push(t('scWheelchairPartial'));
  else if (q?.wheelchair === 'no') out.push(t('scWheelchairNo'));
  if (q?.stepFree === 'yes' && q?.wheelchair !== 'yes') out.push(t('scStepFree'));
  if (place.waitingRoom) out.push(t('scWaitingRoom', place.waitingRoom.seats, place.waitingRoom.heated));
  if (q?.bearing != null) out.push(`${t('scHeading')} <span class="sc-arrow" style="transform:rotate(${Number(q.bearing)}deg)">↑</span> ${esc(compass(Number(q.bearing)))}`);
  return out;
}

export function renderStopCard() { render(); }

function render() {
  const box = document.getElementById('map-stop');
  if (!box) return;
  const ri = grid.active ? selectedRowIndex() : null;
  const stop = ri == null ? null : grid.stops[ri];
  if (!stop) { box.innerHTML = `<div class="sc-none">${esc(t('scNone'))}</div>`; return; }
  const row = `<div class="sc-row">${esc(t('scRow', ri + 1))}</div>`;
  if (!stop.stopId) {
    box.innerHTML = `${row}<div class="sc"><div class="sc-sign sc-sign-empty"></div><div class="sc-main">
      <div class="sc-name">${esc(stop.name || '—')}</div><div class="sc-quay sc-muted">${esc(t('scNotLinked'))}</div></div></div>`;
    return;
  }
  const id = String(stop.stopId);
  const info = quayInfo.get(id);
  const placeId = info?.stopPlaceId ?? '';
  if (placeId) load(placeId);
  const place = placeId ? details.get(placeId) : null;
  const mode = info?.mode || /** @type {any} */ (place && place !== 'loading' ? place.mode : '') || '';
  const name = info?.stopPlaceName || stop.name || id;
  const quay = info === null ? t('scUnknown') : info?.publicCode ? t('wsQuay', info.publicCode) : '';
  const list = place && place !== 'loading' ? facts(place, id) : [];
  box.innerHTML = `${row}
    <div class="sc"><div class="sc-sign">${modeIconSvg(mode)}</div><div class="sc-main">
      <div class="sc-name">${esc(name)}</div>${quay ? `<div class="sc-quay${info === null ? ' sc-muted' : ''}">${esc(quay)}</div>` : ''}</div></div>
    ${list.length ? `<div class="sc-facts">${list.map((f) => `<span>${f}</span>`).join('')}</div>` : ''}
    <div class="sc-id"><code>${esc(id)}</code><button class="sc-copy" title="${esc(t('scCopy'))}">${esc(t('scCopy'))}</button>
      ${placeId ? `<a class="sc-nsr" href="https://stoppested.entur.org/stop_place/${esc(placeId)}" target="_blank" rel="noopener">${esc(t('scNsr'))}</a>` : ''}</div>`;
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
