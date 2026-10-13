// Line timetable file generator, ported from Nepos 1.5.7 (nepos.html lines 6223–6483).
import { xe, hhmm2t, ernModeNeTEx, dirType, pubDelivery, compositeFrame } from './xml.js';
import { netexOrgId, authorityNetworkLocalId } from '../orgs.js';

/**
 * @param {string} routeCode
 * @param {any} rs route state
 * @param {any} data from collectNeTExData
 * @param {{ timestamp?: string }} [opts]
 */
export function genLineXml(routeCode, rs, data, { timestamp } = {}) {
    const { cs, dayTypes, operPers, stopDb } = data;
    const lineId = `${cs}:Line:${routeCode}`;

    // Line from/to dates
    const perFromDates = (rs.periods||[]).map(p=>p.from).filter(Boolean);
    const perToDates   = (rs.periods||[]).map(p=>p.to).filter(Boolean);
    const lineFrom = perFromDates.length ? perFromDates.reduce((a,b)=>a<b?a:b) : '';
    const lineTo   = perToDates.length   ? perToDates.reduce((a,b)=>a>b?a:b)   : '';

    const { mode:lineMode, sub:lineSub } = ernModeNeTEx(rs.transportMode||6);
    const subEl = lineSub ? `\n      <TransportSubmode>\n        <${lineMode.charAt(0).toUpperCase()+lineMode.slice(1)}Submode>${lineSub}</${lineMode.charAt(0).toUpperCase()+lineMode.slice(1)}Submode>\n      </TransportSubmode>` : '';
    const firstOper = (rs.sek||[]).find(s=>s.isOperator);
    const firstAuth = (rs.sek||[]).find(s=>s.isAuthority);   // route's own authority
    // OperatorRef is cross-file (→ _shared_data.xml) — no version attribute
    const operRef = firstOper ? `\n        <OperatorRef ref="${xe(netexOrgId(firstOper.orgId,'Operator',cs))}"/>` : '';
    const komRef  = rs.kom?.trim() ? `\n      <noticeAssignments>\n        <NoticeAssignment id="${cs}:NoticeAssignment:${routeCode}-kom" version="1">\n          <NoticeRef ref="${cs}:Notice:${routeCode}-kom" version="1"/>\n          <NoticedObjectRef ref="${lineId}" version="1"/>\n        </NoticeAssignment>\n      </noticeAssignments>` : '';

    // Element order per Norwegian NeTEx profile:
    // Name → TransportMode → TransportSubmode → PublicCode → OperatorRef → RepresentedByGroupRef
    const lineXml = `      <Line id="${lineId}" version="1">
        <Name>${xe(rs.routeName||routeCode)}</Name>
        <TransportMode>${lineMode}</TransportMode>${subEl}
        <PublicCode>${xe(rs.publicCode||routeCode)}</PublicCode>${operRef}
        <RepresentedByGroupRef ref="${cs}:Network:${firstAuth ? xe(authorityNetworkLocalId(firstAuth.orgId)) : cs}"/>
      </Line>`;

    // Per-direction: routes, routePoints, journeyPatterns
    const routePointsMap = new Map(); // stopId → used as RoutePoint
    const routesXml = [], jpsXml = [], noticeSvcXml = [];
    const sjs = []; // [{sjXml}] for TimetableFrame

    let jpCtr=0;
    const jpRegistry = new Map(); // "dirIdx:stopSeqKey" → jpId

    for (let di=0; di<(rs.directions||[]).length; di++) {
        const dir = rs.directions[di];
        const dType = dirType(di);
        const routeId = `${cs}:Route:${routeCode}-${di}`;

        // Collect all columns across all periods for this direction
        // to find unique JPs
        const jpMap = new Map(); // stopSeqKey → {jpId, stops: [{stopId,isDwellArr,name,forBrd,forAlt,isReq}], spijpIds:[]}

        for (const per of rs.periods||[]) {
            const grid = rs.grids[`${per.id}:${dir.id}`]||{stops:[],cols:[]};
            const opKey = `${per.from}-${per.to}`;
            const op = operPers.get(opKey);

            for (let ci=0; ci<grid.cols.length; ci++) {
                const col = grid.cols[ci];
                // Collect stops with times (skip pipe, skip null, handle dwell)
                const jpStopList = []; // {stopId, name, arrIdx, depIdx, forBrd, forAlt, isReq}
                let pendingDwellTime = null; // time from isDwellArr row

                for (let ri=0; ri<grid.stops.length; ri++) {
                    const stop = grid.stops[ri];
                    const cell = col.cells[ri];

                    if (stop.isDwellArr) {
                        // Arrival row of a dwell pair — but only treat it as such for THIS column
                        // if the NEXT row also has a time in this column (true dwell).
                        // If the next row has no time here (e.g. stay-seated split where arrival
                        // and departure belong to different columns), fall through and treat as
                        // a regular stop so the interchange has a valid FromPoint reference.
                        const nextCell = col.cells[ri + 1];
                        const nextTimedHere = nextCell?.time && nextCell.time !== '|';
                        if (nextTimedHere) {
                            // True dwell for this column: capture arrival time, skip this row
                            if (cell?.time && cell.time!=='|') pendingDwellTime = cell;
                            continue;
                        }
                        // Not a dwell for this column — fall through to normal stop processing
                    }

                    if (!cell?.time || cell.time==='|') { pendingDwellTime=null; continue; }

                    const arrCell = pendingDwellTime; // may be null
                    pendingDwellTime = null;

                    // Resolve stop — skip if not in stopDb (mirrors collectNeTExData logic)
                    let dbStop = stop.stopId != null ? stopDb.find(s=>+s.id===+stop.stopId) : null;
                    if (!dbStop && stop.name) dbStop = stopDb.find(s=>s.name===stop.name);
                    if (!dbStop) { pendingDwellTime = null; continue; }
                    const resolvedId = dbStop.id;
                    jpStopList.push({
                        stopId: resolvedId,
                        name:   stop.name,
                        arrCell,
                        depCell: cell,
                        forBoarding:  cell.suffix !== 'a',
                        forAlighting: cell.suffix !== 'p',
                        requestStop:  cell.suffix === 'x',
                    });
                    routePointsMap.set(resolvedId, stop.name);
                }

                if (jpStopList.length < 2) continue;

                // JP key = sequence of stopIds
                const jpKey = `${di}:${jpStopList.map(s=>s.stopId??s.name).join(':')}`;
                if (!jpMap.has(jpKey)) {
                    const jpId = `${cs}:JourneyPattern:${routeCode}-${di}-${++jpCtr}`;
                    jpMap.set(jpKey, { jpId, stopList:jpStopList, routeId });
                }
                const { jpId, stopList } = jpMap.get(jpKey);

                // Build ServiceJourney
                const dtKey = `${col.dayCode||'D'}:${opKey}`;
                const dtEntry = dayTypes.get(dtKey);
                if (!dtEntry) continue;

                const sjId = `${cs}:ServiceJourney:${routeCode}-${di}-${per.id}-${ci}`;
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

                sjs.push(`      <ServiceJourney id="${sjId}" version="1">
        <TransportMode>${lineMode}</TransportMode>
        <dayTypes><DayTypeRef ref="${dtEntry.ntxId}"/></dayTypes>
        <JourneyPatternRef ref="${jpId}" version="1"/>
        <passingTimes>${ptXml}
        </passingTimes>
      </ServiceJourney>`);

                // Interchanges from TRC bits 10/11
                for (let ri=0; ri<grid.stops.length; ri++) {
                    const cell = col.cells[ri];
                    if (!cell?.interchange) continue;
                    const { targetC, targetR, type } = cell.interchange;
                    if (targetC<0||targetC>=grid.cols.length) continue;
                    // Skip if the target column has no times — no ServiceJourney was generated for it
                    const tgtColHasTimes = grid.cols[targetC]?.cells?.some(c=>c?.time&&c.time!=='|');
                    if (!tgtColHasTimes) continue;
                    const tgtStop = grid.stops[targetR];
                    const srcStop = grid.stops[ri];
                    if (!tgtStop||!srcStop) continue;
                    const toSjId = `${cs}:ServiceJourney:${routeCode}-${di}-${per.id}-${targetC}`;
                    const staySeated = type==='stayseated' ? '\n        <StaySeated>true</StaySeated>' : '';
                    const guaranteed = type==='guaranteed'  ? '\n        <Guaranteed>true</Guaranteed>' : '';
                    sjs.push(`      <!-- interchange from col ${ci} to col ${targetC} -->
      <ServiceJourneyInterchange id="${cs}:ServiceJourneyInterchange:${sjId.split(':').pop()}-${targetC}" version="1">${staySeated}${guaranteed}
        <FromPointRef ref="${cs}:ScheduledStopPoint:${srcStop.stopId??''}"/>
        <ToPointRef ref="${cs}:ScheduledStopPoint:${tgtStop.stopId??''}"/>
        <FromJourneyRef ref="${sjId}" version="1"/>
        <ToJourneyRef ref="${toSjId}" version="1"/>
      </ServiceJourneyInterchange>`);
                }
            }
        }

        // Route: RoutePoints sequence (unique stops in JP order, first JP of this direction)
        const firstJP = jpMap.values().next().value;
        const routeStopList = firstJP ? firstJP.stopList : [];
        const porXml = routeStopList.map((s,i)=>`          <PointOnRoute id="${cs}:PointOnRoute:${routeCode}-${di}-${i+1}" version="1" order="${i+1}">
            <RoutePointRef ref="${cs}:RoutePoint:${s.stopId}" version="1"/>
          </PointOnRoute>`).join('\n');
        routesXml.push(`      <Route id="${routeId}" version="1">
        <LineRef ref="${lineId}" version="1"/>
        <DirectionType>${dType}</DirectionType>
        <pointsInSequence>
${porXml}
        </pointsInSequence>
      </Route>`);

        // Emit JourneyPatterns
        for (const [, { jpId, stopList }] of jpMap) {
            const lastStop = stopList[stopList.length-1];
            const ddRef = lastStop?.stopId!=null
                ? `\n          <DestinationDisplayRef ref="${cs}:DestinationDisplay:${lastStop.stopId}"/>` : '';

            // DestinationDisplay only on the FIRST stop (front sign at departure)
            const spijpList = stopList.map((s,i)=>{
                const spijpId = `${cs}:StopPointInJourneyPattern:${jpId.split(':').pop()}-${i+1}`;
                const dd  = (i===0) ? ddRef : '';
                const brd = s.forBoarding  ? '' : '\n            <ForBoarding>false</ForBoarding>';
                const alt = s.forAlighting ? '' : '\n            <ForAlighting>false</ForAlighting>';
                const req = s.requestStop  ? '\n            <RequestStop>true</RequestStop>' : '';
                return `          <StopPointInJourneyPattern id="${spijpId}" version="1" order="${i+1}">
            <ScheduledStopPointRef ref="${cs}:ScheduledStopPoint:${s.stopId}"/>${dd}${brd}${alt}${req}
          </StopPointInJourneyPattern>`;
            }).join('\n');

            // Skip same-stop pairs (dwell stops — no ServiceLink between a stop and itself)
            const slInJpItems = [];
            for (let i=0; i<stopList.length-1; i++) {
                // Only skip true dwell pairs — same NON-NULL stopId.
                // null === null would incorrectly skip unresolved stops.
                const sa = stopList[i].stopId, sb = stopList[i+1].stopId;
                if (sa != null && sa === sb) continue;
                slInJpItems.push(
                    `          <ServiceLinkInJourneyPattern id="${cs}:ServiceLinkInJourneyPattern:${jpId.split(':').pop()}-${slInJpItems.length+1}" version="1" order="${slInJpItems.length+1}">
            <ServiceLinkRef ref="${cs}:ServiceLink:${stopList[i].stopId}-${stopList[i+1].stopId}"/>
          </ServiceLinkInJourneyPattern>`
                );
            }
            const slInJpList = slInJpItems.join('\n');

            jpsXml.push(`      <JourneyPattern id="${jpId}" version="1">
        <RouteRef ref="${routeId}" version="1"/>
        <DirectionType>${dirType(di)}</DirectionType>
        <pointsInSequence>
${spijpList}
        </pointsInSequence>
        <linksInSequence>
${slInJpList}
        </linksInSequence>
      </JourneyPattern>`);
        }
    }

    // RoutePoints
    const rpXml = [...routePointsMap.keys()].map(sid=>`      <RoutePoint id="${cs}:RoutePoint:${sid}" version="1">
        <projections>
          <PointProjection id="${cs}:PointProjection:${sid}" version="1">
            <ProjectedPointRef ref="${cs}:ScheduledStopPoint:${sid}"/>
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

    // Separate interchanges from sjs
    const sjOnly  = sjs.filter(x=>!x.includes('ServiceJourneyInterchange'));
    const ixOnly  = sjs.filter(x=>x.includes('ServiceJourneyInterchange'));

    const ttFrame = `    <TimetableFrame id="${cs}:TimetableFrame:Line_${routeCode}" version="1">
      <vehicleJourneys>
${sjOnly.join('\n')}
      </vehicleJourneys>${ixOnly.length?`\n      <journeyInterchanges>\n${ixOnly.join('\n')}\n      </journeyInterchanges>`:''}
    </TimetableFrame>`;

    const cf = compositeFrame(cs,`Line_${routeCode}`,lineFrom,lineTo,false,svcFrame,ttFrame);
    return pubDelivery(cs, `${cs} Line ${routeCode}`, cf, timestamp);
}
