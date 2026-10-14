// _shared_data.xml generator, ported from Nepos 1.5.7 (nepos.html lines 6076–6220).
import { xe, pubDelivery, compositeFrame } from './xml.js';
import { stopLocalId, quayRef } from '../quays.js';
import { authorityNetworkLocalId } from '../orgs.js';

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

    const addNetItems = authOrgs.map(o=>`      <Network id="${cs}:Network:${xe(authorityNetworkLocalId(o.networkKey))}" version="1">
        <Name>${xe(o.name)}</Name>
        <AuthorityRef ref="${xe(o.id)}" version="1"/>
      </Network>`).join('\n');

    const netXml = `    <Network id="${cs}:Network:${cs}" version="1">
      <Name>${xe(deliveryName||cs)}</Name>
    </Network>${authOrgs.length > 0 ? `\n    <additionalNetworks>\n${addNetItems}\n    </additionalNetworks>` : ''}`;

    const sspXml = [...usedStops.values()].map(s=>`      <ScheduledStopPoint id="${cs}:ScheduledStopPoint:${stopLocalId(s.id)}" version="1">
        <Name>${xe(s.name)}</Name>
        <TimingPointStatus>timingPoint</TimingPointStatus>
      </ScheduledStopPoint>`).join('\n');

    // PassengerStopAssignments point at the NSR Quays themselves (spec §8): no _stops.xml.
    const psaXml = [...usedStops.keys()].map((sid,i)=>`      <PassengerStopAssignment id="${cs}:PassengerStopAssignment:${stopLocalId(sid)}" version="1" order="${i+1}">
        <ScheduledStopPointRef ref="${cs}:ScheduledStopPoint:${stopLocalId(sid)}" version="1"/>
        <QuayRef ref="${xe(quayRef(sid, cs))}"/>
      </PassengerStopAssignment>`).join('\n');

    const ddXml = [...destDisps.entries()].map(([sid,name])=>`      <DestinationDisplay id="${cs}:DestinationDisplay:${stopLocalId(sid)}" version="1">
        <FrontText>${xe(name)}</FrontText>
      </DestinationDisplay>`).join('\n');

    const svcFrame = `    <ServiceFrame id="${cs}:ServiceFrame:shared" version="1">
${netXml}
      <destinationDisplays>
${ddXml}
      </destinationDisplays>
      <scheduledStopPoints>
${sspXml}
      </scheduledStopPoints>
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
    return pubDelivery(cs, `${cs} shared data`, cf, timestamp);
}
