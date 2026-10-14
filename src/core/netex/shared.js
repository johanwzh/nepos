// _shared_data.xml generator, ported from Nepos 1.5.7 (nepos.html lines 6076–6220).
import { xe, pubDelivery, compositeFrame } from './xml.js';
import { stopLocalId, quayRef } from '../quays.js';
import { authorityNetworkLocalId } from '../orgs.js';

/**
 * @param {any} data from collectNeTExData
 * @param {{ deliveryName?: string, timestamp?: string }} [opts]
 */
export function genSharedXml(data, { deliveryName = '', timestamp } = {}) {
    const { cs, orgs, orgMode, usedStops, destDisps, operDays, operPers, dayTypes, dtAssignments, overallFrom, overallTo } = data;

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
    const resFrame = `    <ResourceFrame id="${cs}:ResourceFrame:shared" version="1">
      <organisations>
${[...authOrgs, ...all.filter((o) => o.role === 'Operator')].map(orgXml).join('\n')}
      </organisations>
    </ResourceFrame>`;

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

    // ServiceCalendarFrame
    // 1. DayTypes — day-of-week pattern OR specific-dates (no PropertyOfDay for the latter)
    const dtXml = [...dayTypes.values()].map(dt=> {
        const props = dt.daysOfWeek
            ? `\n        <properties><PropertyOfDay><DaysOfWeek>${dt.daysOfWeek}</DaysOfWeek></PropertyOfDay></properties>` : '';
        return `      <DayType id="${dt.ntxId}" version="1">${props}\n      </DayType>`;
    }).join('\n');

    // 2. OperatingDays — one per real calendar date; ID = date (reusable across routes)
    const odXml = [...operDays.values()].map(od=>
        `      <OperatingDay id="${od.ntxId}" version="1">\n        <CalendarDate>${od.date}</CalendarDate>\n      </OperatingDay>`
    ).join('\n');

    // 3. OperatingPeriods — reference OperatingDays for from/to (avoids DateTime ambiguity)
    const opXml = [...operPers.values()].map(op=>
        `      <OperatingPeriod id="${op.ntxId}" version="1">
        <FromOperatingDayRef ref="${op.fromDayId}" version="1"/>
        <ToOperatingDayRef ref="${op.toDayId}" version="1"/>
      </OperatingPeriod>`
    ).join('\n');

    // 4. DayTypeAssignments — either → OperatingPeriod (day-of-week) or → OperatingDay (specific date)
    const dtaXml = dtAssignments.map((a,i)=> {
        const ref = a.opDayNtxId
            ? `<OperatingDayRef ref="${a.opDayNtxId}" version="1"/>`
            : `<OperatingPeriodRef ref="${a.opNtxId}" version="1"/>`;
        return `      <DayTypeAssignment id="${a.ntxId}" version="1" order="${i+1}">
        ${ref}
        <DayTypeRef ref="${a.dtNtxId}" version="1"/>
      </DayTypeAssignment>`;
    }).join('\n');

    const calFrame = `    <ServiceCalendarFrame id="${cs}:ServiceCalendarFrame:shared" version="1">
      <dayTypes>
${dtXml}
      </dayTypes>
      <operatingDays>
${odXml}
      </operatingDays>
      <operatingPeriods>
${opXml}
      </operatingPeriods>
      <dayTypeAssignments>
${dtaXml}
      </dayTypeAssignments>
    </ServiceCalendarFrame>`;

    const frames = orgMode === 'nog' ? [svcFrame, calFrame] : [resFrame, svcFrame, calFrame];
    const cf = compositeFrame(cs,'shared',overallFrom,overallTo,false,...frames);
    return pubDelivery(cs, `${cs} shared data`, cf, timestamp);
}
