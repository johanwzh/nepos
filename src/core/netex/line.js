// Line timetable file generator, ported from Nepos 1.5.7 (nepos.html lines 6223–6483).
import { xe, hhmm2t, ernModeNeTEx, pubDelivery, compositeFrame } from './xml.js';
import { authorityNetworkLocalId } from '../orgs.js';
import { stopLocalId } from '../quays.js';
import { journeyStops } from './journeys.js';
import { uuid5 } from '../uuid5.js';
import { isoDate } from '../calendars.js';
import { submodeElement } from '../modes.js';
import { UUID_PATTERN } from '../ern/serialize.js';

/**
 * @param {string} routeCode
 * @param {any} rs route state
 * @param {any} data from collectNeTExData
 * @param {{ timestamp?: string }} [opts]
 */
export function genLineXml(routeCode, rs, data, { timestamp } = {}) {
    const { cs, colDays } = data;
    const lineId = `${cs}:Line:${routeCode}`;

    // Line from/to dates
    // The line's validity: its trips' first and last operating day (timetable structure spec §7)
    const myDays = (rs.periods||[]).flatMap((/** @type {any} */ per) => (rs.grids[`${per.id}:${per.setId}`]?.cols||[]).flatMap((/** @type {any} */ c) => colDays.get(c) ?? [])).sort();
    const lineFrom = myDays[0] ?? '', lineTo = myDays[myDays.length - 1] ?? '';

    // Transmodel mode from #TRM (#MOD in older files; line header spec §3); files without it fall back to the ERN code.
    const fromErn = ernModeNeTEx(rs.transportMode||6);
    const lineMode = rs.mode || fromErn.mode;
    const lineSub = rs.mode ? rs.submode : fromErn.sub;
    const subEl = lineSub ? `\n      <TransportSubmode>\n        <${submodeElement(lineMode)}>${xe(lineSub)}</${submodeElement(lineMode)}>\n      </TransportSubmode>` : '';
    const brandRef = rs.brandingId && data.brandings.has(rs.brandingId) ? `\n        <BrandingRef ref="${xe(rs.brandingId)}"/>` : '';
    const pubEl = rs.publicCode ? `\n        <PublicCode>${xe(rs.publicCode)}</PublicCode>` : '';
    const privEl = rs.privateCode ? `\n        <PrivateCode>${xe(rs.privateCode)}</PrivateCode>` : '';
    const firstOper = (rs.sek||[]).find(s=>s.isOperator);
    const firstAuth = (rs.sek||[]).find(s=>s.isAuthority);   // route's own authority
    // OperatorRef is cross-file (→ _shared_data.xml) — no version attribute
    const operOut = firstOper ? data.orgFor(firstOper, 'Operator') : null;
    const authOut = firstAuth ? data.orgFor(firstAuth, 'Authority') : null;
    const operRef = operOut ? `\n        <OperatorRef ref="${xe(operOut.id)}"/>` : '';
    const komRef  = rs.kom?.trim() ? `\n      <noticeAssignments>\n        <NoticeAssignment id="${cs}:NoticeAssignment:${routeCode}-kom" version="1">\n          <NoticeRef ref="${cs}:Notice:${routeCode}-kom" version="1"/>\n          <NoticedObjectRef ref="${lineId}" version="1"/>\n        </NoticeAssignment>\n      </noticeAssignments>` : '';

    // Element order per the NeTEx XSD (line header spec §7): BrandingRef → Name → TransportMode →
    // TransportSubmode → PublicCode → PrivateCode → OperatorRef → RepresentedByGroupRef
    // Offentlig = nei: delivered, but not for public release (NeTEx PR 899).
    const pubAttr = rs.isPublic === false ? ' publication="restricted"' : '';
    const lineXml = `      <Line id="${lineId}" version="1"${pubAttr}>${brandRef}
        <Name>${xe(rs.routeName||routeCode)}</Name>
        <TransportMode>${lineMode}</TransportMode>${subEl}${pubEl}${privEl}${operRef}
        <RepresentedByGroupRef ref="${cs}:Network:${authOut ? xe(authorityNetworkLocalId(authOut.networkKey)) : cs}"/>
      </Line>`;

    // Per-direction: routes, routePoints, journeyPatterns
    const routePointsMap = new Map(); // stopId → used as RoutePoint
    const routesXml = [], jpsXml = [], noticeSvcXml = [];
    const sjs = []; // ServiceJourney XML for the TimetableFrame
    /** @type {string[]} */ const trainNumbers = []; // TrainNumbers (rail trip numbers) for the TimetableFrame
    const sjIds = new Set(); // the ServiceJourneys actually written
    const ixs = []; // interchanges: written only when both journeys exist
    const dsjs = []; // DatedServiceJourneys, one per trip per operating day

    /** A column's ServiceJourney ID: its #UID when it has one, else the old position-based ID. @param {any} col @param {number} di @param {any} per @param {number} ci */
    const sjIdOf = (col, di, per, ci) => col?.uid && UUID_PATTERN.test(col.uid) ? `${cs}:ServiceJourney:${col.uid}` : `${cs}:ServiceJourney:${routeCode}-${di}-${per.id}-${ci}`;

    const jpRegistry = new Map(); // "dirIdx:stopSeqKey" → jpId

    // One Route per table set (timetable structure spec §7); its JourneyPatterns are the distinct
    // stop sequences of its trips.
    for (let di=0; di<(rs.tableSets||[]).length; di++) {
        const set = rs.tableSets[di];
        const setKey = set.uid && UUID_PATTERN.test(set.uid) ? set.uid : `${routeCode}-${di}`;
        const routeId = `${cs}:Route:${setKey}`;
        let jpN = 0;

        // Collect all columns across all periods for this direction
        // to find unique JPs
        const jpMap = new Map(); // stopSeqKey → {jpId, stops: [{stopId,isDwellArr,name,forBrd,forAlt,isReq}], spijpIds:[]}

        for (const per of (rs.periods||[]).filter((/** @type {any} */ p) => p.setId === set.id)) {
            const grid = rs.grids[`${per.id}:${set.id}`]||{stops:[],cols:[]};

            for (let ci=0; ci<grid.cols.length; ci++) {
                const col = grid.cols[ci];
                // The trip's calls, exactly as the whole export defines them (journeys.js). A column
                // with fewer than two calls is not a trip.
                const calls = journeyStops(grid, col);
                if (calls.length < 2) continue;
                const jpStopList = calls.map(({ stopId, name, arrCell, depCell }) => ({
                    stopId, name, arrCell, depCell,
                    forBoarding:  depCell.suffix !== 'a',
                    forAlighting: depCell.suffix !== 'p',
                    requestStop:  depCell.suffix === 'x',
                }));
                for (const st of jpStopList) routePointsMap.set(st.stopId, st.name);

                // JP key = the stop sequence and the boarding rules at each stop (a/p/x): trips that differ
                // in either need their own pattern. The ID stays as before for a pattern without rules.
                const rules = jpStopList.map(s => (s.forBoarding ? '' : 'a') + (s.forAlighting ? '' : 'p') + (s.requestStop ? 'x' : '')).join(',');
                const ruled = /[apx]/.test(rules) ? `|rules:${rules}` : '';
                const jpKey = `${di}:${jpStopList.map(s=>s.stopId??s.name).join(':')}${ruled}`;
                if (!jpMap.has(jpKey)) {
                    const jpId = `${cs}:JourneyPattern:${uuid5(`${setKey}|${jpStopList.map(s=>s.stopId).join('|')}${ruled}`)}`;
                    jpMap.set(jpKey, { jpId, stopList:jpStopList, routeId, name: `${set.name}-${++jpN}` });
                }
                // The pattern gives the IDs; the times are this trip's own
                const { jpId } = jpMap.get(jpKey);
                const stopList = jpStopList;

                // Build ServiceJourney
                // The trip's operating days (collect.js): none → no trip
                const days = colDays.get(col) ?? [];
                if (!days.length) continue;

                const sjId = sjIdOf(col, di, per, ci);
                let ptXml = '';
                stopList.forEach((s,idx) => {
                    const spijpId = `${cs}:StopPointInJourneyPattern:${jpId.split(':').pop()}-${idx+1}`;
                    const arrTime = s.arrCell ? `\n            <ArrivalTime>${hhmm2t(s.arrCell.time)}</ArrivalTime>${s.arrCell.dayOffset?`\n            <ArrivalDayOffset>${s.arrCell.dayOffset}</ArrivalDayOffset>`:''}` : '';
                    const depTime = `\n            <DepartureTime>${hhmm2t(s.depCell.time)}</DepartureTime>${s.depCell.dayOffset?`\n            <DepartureDayOffset>${s.depCell.dayOffset}</DepartureDayOffset>`:''}`;
                    ptXml += `
          <TimetabledPassingTime id="${cs}:TimetabledPassingTime:${sjId.split(':').pop()}-${idx+1}" version="1">
            <StopPointInJourneyPatternRef ref="${spijpId}" version="1"/>${arrTime}${depTime}
          </TimetabledPassingTime>`;
                });

                sjIds.add(sjId);
                // The trip number (the grid's trip-number row): for rail a TrainNumber (NeTEx's own element,
                // in the TimetableFrame, referred to here); for other modes the ServiceJourney's PrivateCode
                const isTrain = !!col.tripNo && lineMode === 'rail';
                const sjPriv = col.tripNo && !isTrain ? `\n        <PrivateCode>${xe(col.tripNo)}</PrivateCode>` : '';
                const tnId = `${cs}:TrainNumber:${uuid5(`${sjId}|train`)}`;
                if (isTrain) trainNumbers.push(`      <TrainNumber id="${tnId}" version="1">\n        <ForAdvertisement>${xe(col.tripNo)}</ForAdvertisement>\n      </TrainNumber>`);
                const sjTrain = isTrain ? `\n        <trainNumbers>\n          <TrainNumberRef ref="${tnId}" version="1"/>\n        </trainNumbers>` : '';
                sjs.push(`      <ServiceJourney id="${sjId}" version="1"${pubAttr}>${sjPriv}
        <TransportMode>${lineMode}</TransportMode>
        <JourneyPatternRef ref="${jpId}" version="1"/>${sjTrain}
        <passingTimes>${ptXml}
        </passingTimes>
      </ServiceJourney>`);
                for (const d of days) dsjs.push(`      <DatedServiceJourney id="${cs}:DatedServiceJourney:${uuid5(`${sjId}|${d}`)}" version="1"${pubAttr}>
        <ServiceJourneyRef ref="${sjId}" version="1"/>
        <OperatingDayRef ref="${cs}:OperatingDay:${isoDate(d)}"/>
      </DatedServiceJourney>`);

                // Interchanges from TRC bits 10/11
                for (let ri=0; ri<grid.stops.length; ri++) {
                    const cell = col.cells[ri];
                    if (!cell?.interchange) continue;
                    const { targetC, targetR, type } = cell.interchange;
                    if (targetC<0||targetC>=grid.cols.length) continue;
                    // The target cell itself needs a time: otherwise the target stop is not in the
                    // target journey (and may not be exported at all).
                    const tgtCell = grid.cols[targetC]?.cells?.[targetR];
                    if (!tgtCell?.time || tgtCell.time === '|') continue;
                    const tgtStop = grid.stops[targetR];
                    const srcStop = grid.stops[ri];
                    if (!tgtStop||!srcStop) continue;
                    if (srcStop.stopId == null || tgtStop.stopId == null) continue; // no ScheduledStopPoint to refer to
                    const toSjId = sjIdOf(grid.cols[targetC], di, per, targetC);
                    const staySeated = type==='stayseated' ? '\n        <StaySeated>true</StaySeated>' : '';
                    const guaranteed = type==='guaranteed'  ? '\n        <Guaranteed>true</Guaranteed>' : '';
                    ixs.push({ fromSjId: sjId, toSjId, xml: `      <!-- interchange from col ${ci} to col ${targetC} -->
      <ServiceJourneyInterchange id="${cs}:ServiceJourneyInterchange:${sjId.split(':').pop()}-${ri}-${targetC}-${targetR}" version="1">${staySeated}${guaranteed}
        <FromPointRef ref="${cs}:ScheduledStopPoint:${stopLocalId(srcStop.stopId)}"/>
        <ToPointRef ref="${cs}:ScheduledStopPoint:${stopLocalId(tgtStop.stopId)}"/>
        <FromJourneyRef ref="${sjId}" version="1"/>
        <ToJourneyRef ref="${toSjId}" version="1"/>
      </ServiceJourneyInterchange>` });
                }
            }
        }

        // A direction without trips gets no Route (an empty pointsInSequence is not valid NeTEx)
        if (!jpMap.size) continue;

        // Route: RoutePoints sequence (unique stops in JP order, first JP of this direction)
        const firstJP = jpMap.values().next().value;
        const routeStopList = firstJP ? firstJP.stopList : [];
        const porXml = routeStopList.map((s,i)=>`          <PointOnRoute id="${cs}:PointOnRoute:${routeCode}-${di}-${i+1}" version="1" order="${i+1}">
            <RoutePointRef ref="${cs}:RoutePoint:${stopLocalId(s.stopId)}" version="1"/>
          </PointOnRoute>`).join('\n');
        routesXml.push(`      <Route id="${routeId}" version="1">
        <Name>${xe(set.name)}</Name>
        <LineRef ref="${lineId}" version="1"/>
        <pointsInSequence>
${porXml}
        </pointsInSequence>
      </Route>`);

        // Emit JourneyPatterns
        for (const [, { jpId, stopList, name }] of jpMap) {
            const lastStop = stopList[stopList.length-1];
            const ddRef = lastStop?.stopId!=null
                ? `\n          <DestinationDisplayRef ref="${cs}:DestinationDisplay:${stopLocalId(lastStop.stopId)}"/>` : '';

            // DestinationDisplay only on the FIRST stop (front sign at departure)
            const spijpList = stopList.map((s,i)=>{
                const spijpId = `${cs}:StopPointInJourneyPattern:${jpId.split(':').pop()}-${i+1}`;
                const dd  = (i===0) ? ddRef : '';
                const brd = s.forBoarding  ? '' : '\n            <ForBoarding>false</ForBoarding>';
                const alt = s.forAlighting ? '' : '\n            <ForAlighting>false</ForAlighting>';
                const req = s.requestStop  ? '\n            <RequestStop>true</RequestStop>' : '';
                return `          <StopPointInJourneyPattern id="${spijpId}" version="1" order="${i+1}">
            <ScheduledStopPointRef ref="${cs}:ScheduledStopPoint:${stopLocalId(s.stopId)}"/>${dd}${brd}${alt}${req}
          </StopPointInJourneyPattern>`;
            }).join('\n');

            jpsXml.push(`      <JourneyPattern id="${jpId}" version="1">
        <Name>${xe(name)}</Name>
        <RouteRef ref="${routeId}" version="1"/>
        <pointsInSequence>
${spijpList}
        </pointsInSequence>
      </JourneyPattern>`);
        }
    }

    // RoutePoints
    const rpXml = [...routePointsMap.keys()].map(sid=>`      <RoutePoint id="${cs}:RoutePoint:${stopLocalId(sid)}" version="1">
        <projections>
          <PointProjection id="${cs}:PointProjection:${stopLocalId(sid)}" version="1">
            <ProjectedPointRef ref="${cs}:ScheduledStopPoint:${stopLocalId(sid)}"/>
          </PointProjection>
        </projections>
      </RoutePoint>`).join('\n');

    // Notice for KOM
    const komNotice = rs.kom?.trim()
        ? `      <notices>\n        <Notice id="${cs}:Notice:${routeCode}-kom" version="1">\n          <Text>${xe(rs.kom)}</Text>\n        </Notice>\n      </notices>` : '';

    const svcFrame = `    <ServiceFrame id="${cs}:ServiceFrame:Line_${routeCode}" version="1">
      <routePoints>
${rpXml}
      </routePoints>
      <routes>
${routesXml.join('\n')}
      </routes>
      <lines>
${lineXml}${komRef}
      </lines>
${komNotice}
      <journeyPatterns>
${jpsXml.join('\n')}
      </journeyPatterns>
    </ServiceFrame>`;

    // Interchanges only between journeys that were written (no dangling FromJourneyRef/ToJourneyRef)
    const sjOnly  = sjs;
    const ixOnly  = ixs.filter(x=>sjIds.has(x.fromSjId) && sjIds.has(x.toSjId)).map(x=>x.xml);

    const ttFrame = `    <TimetableFrame id="${cs}:TimetableFrame:Line_${routeCode}" version="1">
      <vehicleJourneys>
${[...sjOnly, ...dsjs].join('\n')}
      </vehicleJourneys>${trainNumbers.length ? `\n      <trainNumbers>\n${trainNumbers.join('\n')}\n      </trainNumbers>` : ''}${ixOnly.length?`\n      <journeyInterchanges>\n${ixOnly.join('\n')}\n      </journeyInterchanges>`:''}
    </TimetableFrame>`;

    const cf = compositeFrame(cs,`Line_${routeCode}`,lineFrom,lineTo,false,svcFrame,ttFrame);
    return pubDelivery(cs, `${cs} Line ${routeCode}`, cf, timestamp);
}
