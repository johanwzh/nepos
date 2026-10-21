// NeTEx XML helpers, ported from Nepos 1.5.7 (nepos.html lines 5742–5815).
import { ERN_MODES } from '../ern/modes.js';
import { VERSION } from '../../version.js';

export const NETEX_PROFILE = '1.15:NO-NeTEx-networktimetable:1.5';

// ─── XML / NeTEx helpers ──────────────────────────────────────────────────────
export function xe(s)  { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
export function hhmm2t(t)  { return (!t||t.length!==4)?'00:00:00':`${t.slice(0,2)}:${t.slice(2,4)}:00`; }
export function yyyymmdd2d(d) { return (!d||d.length!==8)?'':`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`; }
export function yyyymmdd2ts(d) { const x=yyyymmdd2d(d); return x?`${x}T00:00:00`:''; }

export function dayCodeToDoW(code) {
    const ALL=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    const M={'1':'Monday','2':'Tuesday','3':'Wednesday','4':'Thursday','5':'Friday','6':'Saturday','7':'Sunday'};
    if (!code||code==='D') return 'Everyday';
    let days;
    if (code.startsWith('DX')) {
        const ex=new Set(code.slice(2).split('').map(c=>M[c]).filter(Boolean));
        days=ALL.filter(d=>!ex.has(d));
    } else if (/^[1-7]+$/.test(code)) {
        days=[...new Set(code.split('').map(c=>M[c]).filter(Boolean))];
        days.sort((a,b)=>ALL.indexOf(a)-ALL.indexOf(b));
    } else return 'Everyday';
    if (days.length===7) return 'Everyday';
    const j=days.join(' ');
    if (j==='Monday Tuesday Wednesday Thursday Friday') return 'Weekdays';
    if (j==='Saturday Sunday') return 'Weekend';
    return j;
}

export function sptToNeTEx(s) { return {ferryPort:'ferryStop',railStation:'railStation',onstreetBus:'onstreetBus'}[s]||'other'; }
export function modeToNeTEx(m) { return {water:'water',rail:'rail',bus:'bus',metro:'metro',tram:'tram'}[m]||'other'; }
export function ernModeNeTEx(n) { const m=ERN_MODES[+n]; return m?{mode:m.mode,sub:m.sub}:{mode:'other',sub:''}; }

export function dirType(i) { return i===0?'outbound':'inbound'; }

/** Where the files come from (user 2026-10-21): every PublicationDelivery's Description names Nepos and its version. */
const NEPOS_URL = 'https://github.com/johanwzh/nepos';

export function pubDelivery(cs, desc, compositeFrame, timestamp = new Date().toISOString().slice(0,10)+'T00:00:00') {
    const ts = timestamp;
    return `<?xml version="1.0" encoding="utf-8"?>
<PublicationDelivery
    xmlns="http://www.netex.org.uk/netex"
    xmlns:gml="http://www.opengis.net/gml/3.2"
    version="${NETEX_PROFILE}">
  <PublicationTimestamp>${ts}</PublicationTimestamp>
  <ParticipantRef>${xe(cs)}</ParticipantRef>
  <Description>${xe(`${desc} · made with Nepos ${VERSION} (${NEPOS_URL})`)}</Description>
  <dataObjects>
${compositeFrame}
  </dataObjects>
</PublicationDelivery>`;
}

export function compositeFrame(cs, id, fromDate, toDate, codespaceExtra, ...frames) {
    const codeExtra = codespaceExtra ? `
    <Codespace id="rej">
      <Xmlns>REJ</Xmlns>
      <XmlnsUrl>http://www.rutebanken.org/ns/rej</XmlnsUrl>
    </Codespace>` : '';
    const validity = (fromDate && toDate) ? `
  <validityConditions>
    <AvailabilityCondition id="${cs}:AvailabilityCondition:${id}" version="1">
      <FromDate>${yyyymmdd2ts(fromDate)}</FromDate>
      <ToDate>${yyyymmdd2ts(toDate)}</ToDate>
    </AvailabilityCondition>
  </validityConditions>` : '';
    return `  <CompositeFrame id="${cs}:CompositeFrame:${id}" version="1">${validity}
  <codespaces>
    <Codespace id="${cs.toLowerCase()}">
      <Xmlns>${cs}</Xmlns>
      <XmlnsUrl>http://www.rutebanken.org/ns/${cs.toLowerCase()}</XmlnsUrl>
    </Codespace>${cs.toUpperCase() === 'NSR' ? '' : `
    <Codespace id="nsr">
      <Xmlns>NSR</Xmlns>
      <XmlnsUrl>http://www.rutebanken.org/ns/nsr</XmlnsUrl>
    </Codespace>`}${codeExtra}
  </codespaces>
  <frames>
${frames.filter(Boolean).join('\n')}
  </frames>
  </CompositeFrame>`;
}
