// _shared_data.xml generator, ported from Nepos 1.5.7 (nepos.html lines 6076–6220).
import { xe, pubDelivery, compositeFrame } from './xml.js';
import { stopLocalId, quayRef } from '../quays.js';
import { decodePolyline } from '../../shapes/geometry.js';
import { authorityNetworkLocalId } from '../orgs.js';

/**
 * The ServiceLinks the line files use (2.3, Lasse's spec): the routed shape as a gml:LineString in lat lon order,
 * Quay to Quay, between the two ScheduledStopPoints. Empty when none.
 * @param {any} data
 */
function serviceLinksXml(data) {
    if (!data.usedLinks?.size) return '';
    const cs = data.cs, CS = String(cs).toUpperCase();
    const links = [...data.usedLinks.values()].map((/** @type {any} */ l) => {
        const uuid = l.id.split(':').pop();
        const pts = decodePolyline(l.shape.polyline, l.shape.precision ?? 6);
        const pos = pts.map(([lon, lat]) => `${lat.toFixed(6)} ${lon.toFixed(6)}`).join(' ');
        return `      <ServiceLink id="${l.id}" version="1">
        <Distance>${Math.round(l.shape.distanceM)}</Distance>
        <projections>
          <LinkSequenceProjection id="${cs}:LinkSequenceProjection:${uuid}" version="1">
            <gml:LineString gml:id="${CS}_LinkSequenceProjection_${uuid}" srsName="WGS84">
              <gml:posList srsDimension="2" count="${pts.length}">${pos}</gml:posList>
            </gml:LineString>
          </LinkSequenceProjection>
        </projections>
        <FromPointRef ref="${cs}:ScheduledStopPoint:${stopLocalId(l.fromId)}" version="1"/>
        <ToPointRef ref="${cs}:ScheduledStopPoint:${stopLocalId(l.toId)}" version="1"/>
      </ServiceLink>`;
    }).join('\n');
    return `\n      <serviceLinks>\n${links}\n      </serviceLinks>`;
}

/**
 * @param {any} data from collectNeTExData
 * @param {{ deliveryName?: string, timestamp?: string }} [opts]
 */
export function genSharedXml(data, { deliveryName = '', timestamp } = {}) {
    const { cs, orgs, orgMode, usedStops, destDisps, operDays, overallFrom, overallTo } = data;

    /** One organisation element (organisations spec §6.3): details only when it is in the project copy. */
    const orgXml = (/** @type {any} */ o) => {
        const kind = o.role === 'Authority' ? 'authority' : 'operator';
        if (!o.company) return `      <${o.role} id="${xe(o.id)}" version="1">
        <Name>${xe(o.name)}</Name>
        <OrganisationType>${kind}</OrganisationType>
      </${o.role}>`;
        const c = o.company, ct = o.entry.contact;
        const el = (/** @type {string} */ n, /** @type {string} */ v, ind = '        ') => v ? `\n${ind}<${n}>${xe(v)}</${n}>` : '';
        const contact = ct.email || ct.phone || ct.url
            ? `\n        <ContactDetails>${el('Email', ct.email, '          ')}${el('Phone', ct.phone, '          ')}${el('Url', ct.url, '          ')}\n        </ContactDetails>` : '';
        return `      <${o.role} id="${xe(o.id)}" version="1">${el('CompanyNumber', c.companyNumber)}${el('Name', c.name)}${el('LegalName', c.legalName)}${el('TradingName', c.tradingName)}${contact}
        <OrganisationType>${kind}</OrganisationType>
      </${o.role}>`;
    };
    const all = [...orgs.values()];
    const authOrgs = all.filter((o) => o.role === 'Authority');
    // Brandings (typesOfValue) come before organisations in a ResourceFrame (line header spec §6).
    const brandXml = [...data.brandings.values()].map((/** @type {any} */ b) => {
        const el = (/** @type {string} */ n, /** @type {string} */ v) => v ? `\n          <${n}>${xe(v)}</${n}>` : '';
        return `        <Branding id="${xe(b.id)}" version="1">${el('Name', b.name)}${el('ShortName', b.shortName)}${el('Description', b.description)}${el('Image', b.imageUrl)}${el('Url', b.url)}
        </Branding>`;
    }).join('\n');
    const typesXml = brandXml ? `\n      <typesOfValue>\n${brandXml}\n      </typesOfValue>` : '';
    const orgsXml = orgMode === 'nog' ? '' : `\n      <organisations>\n${[...authOrgs, ...all.filter((o) => o.role === 'Operator')].map(orgXml).join('\n')}\n      </organisations>`;
    const resFrame = typesXml || orgsXml ? `    <ResourceFrame id="${cs}:ResourceFrame:shared" version="1">${typesXml}${orgsXml}\n    </ResourceFrame>` : '';

    // Entur's import needs an AuthorityRef on the Network itself (user 2026-10-18): the first authority sits
    // there, the others on additional networks. Each line points to its own authority's network.
    const addNetItems = authOrgs.slice(1).map(o=>`      <Network id="${cs}:Network:${xe(authorityNetworkLocalId(o.networkKey))}" version="1">
        <Name>${xe(o.name)}</Name>
        <AuthorityRef ref="${xe(o.id)}" version="1"/>
      </Network>`).join('\n');

    const first = authOrgs[0];
    const netXml = first
        ? `    <Network id="${cs}:Network:${xe(authorityNetworkLocalId(first.networkKey))}" version="1">
      <Name>${xe(first.name)}</Name>
      <AuthorityRef ref="${xe(first.id)}" version="1"/>
    </Network>${addNetItems ? `\n    <additionalNetworks>\n${addNetItems}\n    </additionalNetworks>` : ''}`
        : `    <Network id="${cs}:Network:${cs}" version="1">
      <Name>${xe(deliveryName||cs)}</Name>
    </Network>`;

    const sspXml = [...usedStops.values()].map(s=>`      <ScheduledStopPoint id="${cs}:ScheduledStopPoint:${stopLocalId(s.id)}" version="1">
        <Name>${xe(s.name)}</Name>
      </ScheduledStopPoint>`).join('\n');

    // PassengerStopAssignments point at the NSR Quays themselves (spec §8): no _stops.xml.
    const psaXml = [...usedStops.keys()].map((sid,i)=>`      <PassengerStopAssignment id="${cs}:PassengerStopAssignment:${stopLocalId(sid)}" version="1" order="${i+1}">
        <ScheduledStopPointRef ref="${cs}:ScheduledStopPoint:${stopLocalId(sid)}" version="1"/>
        <QuayRef ref="${xe(quayRef(sid, cs))}"/>
      </PassengerStopAssignment>`).join('\n');

    // One per distinct destination (destination displays spec); a via refers to its own display
    const ddXml = [...destDisps.values()].map((/** @type {any} */ dd)=>{
        const vias = dd.viaIds.length ? `\n        <vias>${dd.viaIds.map((/** @type {string} */ v) => `\n          <Via>\n            <DestinationDisplayRef ref="${xe(v)}" version="1"/>\n          </Via>`).join('')}\n        </vias>` : '';
        return `      <DestinationDisplay id="${xe(dd.id)}" version="1">\n        <FrontText>${xe(dd.text)}</FrontText>${vias}\n      </DestinationDisplay>`;
    }).join('\n');

    const svcFrame = `    <ServiceFrame id="${cs}:ServiceFrame:shared" version="1">
${netXml}${ddXml ? `\n      <destinationDisplays>\n${ddXml}\n      </destinationDisplays>` : ''}
      <scheduledStopPoints>
${sspXml}
      </scheduledStopPoints>${serviceLinksXml(data)}
      <stopAssignments>
${psaXml}
      </stopAssignments>
    </ServiceFrame>`;

    // ServiceCalendarFrame: only the OperatingDays the DatedServiceJourneys refer to (timetable
    // structure spec §7) — no DayTypes, OperatingPeriods or DayTypeAssignments.
    const odXml = [...operDays.keys()].sort().map((k) => {
        const od = operDays.get(k);
        return `      <OperatingDay id="${od.ntxId}" version="1">\n        <CalendarDate>${od.date}</CalendarDate>\n      </OperatingDay>`;
    }).join('\n');
    const calFrame = odXml ? `    <ServiceCalendarFrame id="${cs}:ServiceCalendarFrame:shared" version="1">
      <operatingDays>
${odXml}
      </operatingDays>
    </ServiceCalendarFrame>` : '';

    const frames = [resFrame, svcFrame, calFrame].filter(Boolean);
    const cf = compositeFrame(cs,'shared',overallFrom,overallTo,false,...frames);
    return pubDelivery(cs, cf, timestamp);
}
