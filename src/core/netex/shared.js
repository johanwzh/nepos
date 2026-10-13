// _shared_data.xml generator, ported from Nepos 1.5.7 (nepos.html lines 6076–6220).
import { xe, pubDelivery, compositeFrame } from './xml.js';
import { haversineM } from './geo.js';
import { netexOrgId, authorityNetworkLocalId } from '../orgs.js';

/**
 * @param {any} data from collectNeTExData
 * @param {{ deliveryName?: string, timestamp?: string }} [opts]
 */
export function genSharedXml(data, { deliveryName = '', timestamp } = {}) {
    const { cs, orgs, usedStops, stopPairs, destDisps, operDays, operPers, dayTypes, dtAssignments, overallFrom, overallTo } = data;

    // ResourceFrame
    const authXml = [...orgs.values()].filter(o=>o.isAuthority).map(o=>`      <Authority id="${xe(netexOrgId(o.id,'Authority',cs))}" version="1">
        <Name>${xe(o.name)}</Name>
        <OrganisationType>authority</OrganisationType>
      </Authority>`).join('\n');
    const operXml = [...orgs.values()].filter(o=>o.isOperator).map(o=>`      <Operator id="${xe(netexOrgId(o.id,'Operator',cs))}" version="1">
        <Name>${xe(o.name)}</Name>
        <OrganisationType>operator</OrganisationType>
      </Operator>`).join('\n');
    const resFrame = `    <ResourceFrame id="${cs}:ResourceFrame:shared" version="1">
      <organisations>
${authXml}
${operXml}
      </organisations>
    </ResourceFrame>`;

    // ServiceFrame: one Network per unique authority so each Line can point to the right one
    const authOrgs = [...orgs.values()].filter(o=>o.isAuthority);
    // Fallback: if no authorities defined, create one unnamed network
    // Primary Network: the package itself (no AuthorityRef — just a grouping container)
    // Additional Networks: one per unique authority from SEK records, each with AuthorityRef
    const addNetItems = authOrgs.map(o=>`      <Network id="${cs}:Network:${xe(authorityNetworkLocalId(o.id))}" version="1">
        <Name>${xe(o.name)}</Name>
        <AuthorityRef ref="${xe(netexOrgId(o.id,'Authority',cs))}" version="1"/>
      </Network>`).join('\n');
    const netXml = `    <Network id="${cs}:Network:${cs}" version="1">
      <Name>${xe(deliveryName||cs)}</Name>
    </Network>${authOrgs.length > 0 ? `\n    <additionalNetworks>\n${addNetItems}\n    </additionalNetworks>` : ''}`;

    const sspXml = [...usedStops.values()].map(s=>`      <ScheduledStopPoint id="${cs}:ScheduledStopPoint:${s.id}" version="1">
        <Name>${xe(s.name)}</Name>
        <TimingPointStatus>timingPoint</TimingPointStatus>
      </ScheduledStopPoint>`).join('\n');

    const slXml = [...stopPairs.values()].map(p=>{
        // GML posList: lat lon order (WGS84 geographic CRS standard)
        // All coords in one space-separated list — matches Norwegian NeTEx profile convention
        const posList = (p.coords||[]).map(([lon,lat])=>`${lat} ${lon}`).join(' ');
        // Approximate distance in metres (sum of haversine segments)
        let distM = 0;
        for (let i=0;i<(p.coords||[]).length-1;i++) distM += haversineM(p.coords[i], p.coords[i+1]);
        return `      <ServiceLink id="${cs}:ServiceLink:${p.fromId}-${p.toId}" version="1">
        <Distance>${distM.toFixed(1)}</Distance>
        <projections>
          <LinkSequenceProjection id="${cs}:LinkSequenceProjection:${p.fromId}-${p.toId}" version="1">
            <gml:LineString gml:id="LSP_${p.fromId}_${p.toId}">
              <gml:posList srsDimension="2" count="${(p.coords||[]).length}">${posList}</gml:posList>
            </gml:LineString>
          </LinkSequenceProjection>
        </projections>
        <FromPointRef ref="${cs}:ScheduledStopPoint:${p.fromId}" version="1"/>
        <ToPointRef ref="${cs}:ScheduledStopPoint:${p.toId}" version="1"/>
      </ServiceLink>`;
    }).join('\n');

    const psaXml = [...usedStops.keys()].map((sid,i)=>`      <PassengerStopAssignment id="${cs}:PassengerStopAssignment:${sid}" version="1" order="${i+1}">
        <ScheduledStopPointRef ref="${cs}:ScheduledStopPoint:${sid}" version="1"/>
        <QuayRef ref="${cs}:Quay:${sid}"/>
      </PassengerStopAssignment>`).join('\n');

    const ddXml = [...destDisps.entries()].map(([sid,name])=>`      <DestinationDisplay id="${cs}:DestinationDisplay:${sid}" version="1">
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
      <serviceLinks>
${slXml}
      </serviceLinks>
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

    const cf = compositeFrame(cs,'shared',overallFrom,overallTo,false,resFrame,svcFrame,calFrame);
    return pubDelivery(cs, `${cs} shared data`, cf, timestamp);
}
