// Line timetable file generator, ported from Nepos 1.5.7 (nepos.html lines 6223–6483).
import { xe, hhmm2t, ernModeNeTEx, pubDelivery, compositeFrame } from './xml.js';
import { authorityNetworkLocalId } from '../orgs.js';
import { stopLocalId } from '../quays.js';
import { tripVariants } from './journeys.js';
import { uuid5 } from '../uuid5.js';
import { isoDate } from '../calendars.js';
import { submodeElement } from '../modes.js';
import { UUID_PATTERN } from '../ern/serialize.js';
import { destSegments, destKey } from '../destinations.js';
import { bookingElements } from './booking.js';
import { bookingKey } from '../booking.js';

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
    // Notes (Notices): one per distinct text; assignments to the Line (ServiceFrame) and to ServiceJourneys
    // and TimetabledPassingTimes (TimetableFrame)
    /** @type {Map<string, string>} text → Notice ID */ const notices = new Map();
    /** @param {string} text */
    const noticeId = (text) => {
        if (!notices.has(text)) notices.set(text, text === rs.kom?.trim() ? `${cs}:Notice:${routeCode}-kom` : `${cs}:Notice:${uuid5(`${routeCode}|notice|${text}`)}`);
        return /** @type {string} */ (notices.get(text));
    };
    /** @type {string[]} */ const lineAssigns = [], ttAssigns = [];
    /** @param {string[]} list @param {string} text @param {string} objRef @param {string} [id] */
    const assign = (list, text, objRef, id) => list.push(`      <NoticeAssignment id="${id ?? `${cs}:NoticeAssignment:${uuid5(`${objRef}|${text}`)}`}" version="1" order="${list.length + 1}">\n        <NoticeRef ref="${noticeId(text)}" version="1"/>\n        <NoticedObjectRef ref="${objRef}" version="1"/>\n      </NoticeAssignment>`);
    if (rs.kom?.trim()) assign(lineAssigns, rs.kom.trim(), lineId, `${cs}:NoticeAssignment:${routeCode}-kom`);

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
    /** A variant's ServiceJourney ID: the usual one keeps the column's, the others are derived from it. @param {string} base @param {{ calls: any[], main: boolean }} v */
    const variantSjId = (base, v) => (v.main ? base : `${cs}:ServiceJourney:${uuid5(`${base}|calls:${v.calls.map((c) => c.ri).join(',')}`)}`);

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
                // One ServiceJourney per variant: a time switched off on some days splits the trip (journeys.js)
                for (const variant of tripVariants(grid, col, colDays.get(col) ?? [])) {
                    const calls = variant.calls;
                    if (calls.length < 2) continue;
                    const jpStopList = calls.map(({ stopId, name, arrCell, depCell }) => ({
                        stopId, name, arrCell, depCell,
                        forBoarding:  depCell.suffix !== 'a',
                        forAlighting: depCell.suffix !== 'p',
                        requestStop:  !!depCell.req,
                        booking:      depCell.booking ?? null,
                    }));
                    for (const st of jpStopList) routePointsMap.set(st.stopId, st.name);
                    // The destination starting at each call: the trip's start on the first, a change further on
                    const segs = destSegments(grid, col).filter((s) => s.state === 'ok');
                    const inEffect = (/** @type {number} */ row) => segs.filter((s) => s.row <= row).pop()?.dest ?? null;
                    const callDests = calls.map((c, i) => (i === 0 ? inEffect(c.ri) : i < calls.length - 1 && inEffect(c.ri) !== inEffect(calls[i - 1].ri) ? inEffect(c.ri) : null));
                    jpStopList.forEach((st, i) => { /** @type {any} */ (st).dd = callDests[i]; });

                    // JP key = the stop sequence and the boarding rules at each stop (a/p/x): trips that differ
                    // in either need their own pattern. The ID stays as before for a pattern without rules.
                    const rules = jpStopList.map(s => (s.forBoarding ? '' : 'a') + (s.forAlighting ? '' : 'p') + (s.requestStop ? 'x' : '')).join(',');
                    // and the bookings on its stops (booking spec 2026-10-22)
                    const booked = jpStopList.map((s) => bookingKey(s.booking));
                    const ruled = (/[apx]/.test(rules) ? `|rules:${rules}` : '')
                        + (booked.some(Boolean) ? `|booking:${booked.join(',')}` : '')
                        // trips with other destinations need their own pattern
                        + (callDests.some(Boolean) ? `|dd:${callDests.map((d) => (d ? destKey(d) : '')).join(',')}` : '');
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
                    const days = variant.days;
                    if (!days.length) continue;

                    const sjId = variantSjId(sjIdOf(col, di, per, ci), variant);
                    let ptXml = '';
                    stopList.forEach((s,idx) => {
                        const spijpId = `${cs}:StopPointInJourneyPattern:${jpId.split(':').pop()}-${idx+1}`;
                        // The first call only departs and the last only arrives (Entur's import, user 2026-10-18);
                        // a waiting stop in between has both
                        const last = idx === stopList.length - 1;
                        const arr = last ? (s.arrCell ?? s.depCell) : idx === 0 ? null : s.arrCell;
                        const arrTime = arr ? `\n            <ArrivalTime>${hhmm2t(arr.time)}</ArrivalTime>${arr.dayOffset?`\n            <ArrivalDayOffset>${arr.dayOffset}</ArrivalDayOffset>`:''}` : '';
                        const depTime = last ? '' : `\n            <DepartureTime>${hhmm2t(s.depCell.time)}</DepartureTime>${s.depCell.dayOffset?`\n            <DepartureDayOffset>${s.depCell.dayOffset}</DepartureDayOffset>`:''}`;
                        ptXml += `
          <TimetabledPassingTime id="${cs}:TimetabledPassingTime:${sjId.split(':').pop()}-${idx+1}" version="1">
            <StopPointInJourneyPatternRef ref="${spijpId}" version="1"/>${arrTime}${depTime}
          </TimetabledPassingTime>`;
                    });

                    sjIds.add(sjId);
                    // The trip's note, and each time's note (on its passing time; a dwell stop's arrival note too)
                    if (col.note?.trim()) assign(ttAssigns, col.note.trim(), sjId);
                    stopList.forEach((/** @type {any} */ s, /** @type {number} */ idx) => {
                        const tpt = `${cs}:TimetabledPassingTime:${sjId.split(':').pop()}-${idx+1}`;
                        for (const c of [s.arrCell, s.depCell]) if (c?.note?.trim()) assign(ttAssigns, c.note.trim(), tpt);
                    });
                    // The trip number (the grid's trip-number row): for rail a TrainNumber (NeTEx's own element,
                    // in the TimetableFrame, referred to here); for other modes the ServiceJourney's PrivateCode
                    const isTrain = !!col.tripNo && lineMode === 'rail';
                    const sjPriv = col.tripNo && !isTrain ? `\n        <PrivateCode>${xe(col.tripNo)}</PrivateCode>` : '';
                    const tnId = `${cs}:TrainNumber:${uuid5(`${sjId}|train`)}`;
                    if (isTrain) trainNumbers.push(`      <TrainNumber id="${tnId}" version="1">\n        <ForAdvertisement>${xe(col.tripNo)}</ForAdvertisement>\n      </TrainNumber>`);
                    const sjTrain = isTrain ? `\n        <trainNumbers>\n          <TrainNumberRef ref="${tnId}" version="1"/>\n        </trainNumbers>` : '';
                    // The trip's booking, else the line's (booking spec 2026-10-22). Provisional until Entur answers how a
                    // fixed line where every trip is booked is delivered: the line's booking on every trip without its own
                    const fspEls = bookingElements(col.booking ?? rs.booking, '          ');
                    const fsp = fspEls ? `\n        <FlexibleServiceProperties id="${cs}:FlexibleServiceProperties:${uuid5(`${sjId}|booking`)}" version="1">\n${fspEls}\n        </FlexibleServiceProperties>` : '';
                    sjs.push(`      <ServiceJourney id="${sjId}" version="1"${pubAttr}>${sjPriv}
        <JourneyPatternRef ref="${jpId}" version="1"/>${sjTrain}
        <passingTimes>${ptXml}
        </passingTimes>${fsp}
      </ServiceJourney>`);
                    for (const d of days) dsjs.push(`      <DatedServiceJourney id="${cs}:DatedServiceJourney:${uuid5(`${sjId}|${d}`)}" version="1"${pubAttr}>
        <ServiceJourneyRef ref="${sjId}" version="1"/>
        <OperatingDayRef ref="${cs}:OperatingDay:${isoDate(d)}"/>
      </DatedServiceJourney>`);

                    // Interchanges from TRC bits 10/11
                    for (let ri=0; ri<grid.stops.length; ri++) {
                        const cell = col.cells[ri];
                        if (!cell?.interchange || !calls.some((c) => c.ri === ri || (c.arrCell && c.ri - 1 === ri))) continue;
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
                        const tgtVariants = tripVariants(grid, grid.cols[targetC], colDays.get(grid.cols[targetC]) ?? []);
                        const tgtVariant = tgtVariants.find((v) => v.calls.some((c) => c.ri === targetR || (c.arrCell && c.ri - 1 === targetR)));
                        if (!tgtVariant) continue;
                        const toSjId = variantSjId(sjIdOf(grid.cols[targetC], di, per, targetC), tgtVariant);
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
        }

        // A direction without trips gets no Route (an empty pointsInSequence is not valid NeTEx)
        if (!jpMap.size) continue;

        // Route: RoutePoints sequence (unique stops in JP order, first JP of this direction)
        // The Route's points: the stops of all its patterns, merged in order (shortest common supersequence)
        const routeStopList = [...jpMap.values()].map((jp) => jp.stopList).sort((a, b) => b.length - a.length)
            .reduce((acc, list) => mergeStops(acc, list), /** @type {any[]} */ ([]));
        const porXml = routeStopList.map((s,i)=>`          <PointOnRoute id="${cs}:PointOnRoute:${routeCode}-${di}-${i+1}" version="1" order="${i+1}">
            <RoutePointRef ref="${cs}:RoutePoint:${stopLocalId(s.stopId)}" version="1"/>
          </PointOnRoute>`).join('\n');
        routesXml.push(`      <Route id="${routeId}" version="1">
        <Name>${xe(set.name)}</Name>
        <LineRef ref="${lineId}" version="1"/>${set.direction ? `\n        <DirectionType>${set.direction}</DirectionType>` : ''}
        <pointsInSequence>
${porXml}
        </pointsInSequence>
      </Route>`);

        // Emit JourneyPatterns
        for (const [, { jpId, stopList, name }] of jpMap) {
            // A DestinationDisplay where the trip's destination starts and where it changes
            const spijpList = stopList.map((/** @type {any} */ s, /** @type {number} */ i)=>{
                const spijpId = `${cs}:StopPointInJourneyPattern:${jpId.split(':').pop()}-${i+1}`;
                const dd  = s.dd ? `\n            <DestinationDisplayRef ref="${xe(data.destDispId(s.dd))}"/>` : '';
                // No getting off at the first stop, nor on at the last (Entur's import, user 2026-10-18)
                const brd = s.forBoarding && i < stopList.length - 1 ? '' : '\n            <ForBoarding>false</ForBoarding>';
                const alt = s.forAlighting && i > 0 ? '' : '\n            <ForAlighting>false</ForAlighting>';
                const req = s.requestStop  ? '\n            <RequestStop>true</RequestStop>' : '';
                const bookingEls = bookingElements(s.booking, '              ');
                const bkg = bookingEls ? `\n            <BookingArrangements>\n${bookingEls}\n            </BookingArrangements>` : '';
                return `          <StopPointInJourneyPattern id="${spijpId}" version="1" order="${i+1}">
            <ScheduledStopPointRef ref="${cs}:ScheduledStopPoint:${stopLocalId(s.stopId)}"/>${alt}${brd}${dd}${req}${bkg}
          </StopPointInJourneyPattern>`;
            }).join('\n');

            // ServiceLinks (2.3): only when every pair of the pattern is routed
            const linkIds = data.linkRefsFor?.(rs, stopList) ?? null;
            const linksXml = linkIds ? `\n        <linksInSequence>\n${linkIds.map((/** @type {string} */ id, /** @type {number} */ i) => `          <ServiceLinkInJourneyPattern id="${cs}:ServiceLinkInJourneyPattern:${jpId.split(':').pop()}-${i + 1}" version="1" order="${i + 1}">\n            <ServiceLinkRef ref="${id}"/>\n          </ServiceLinkInJourneyPattern>`).join('\n')}\n        </linksInSequence>` : '';
            jpsXml.push(`      <JourneyPattern id="${jpId}" version="1">
        <Name>${xe(name)}</Name>
        <RouteRef ref="${routeId}" version="1"/>
        <pointsInSequence>
${spijpList}
        </pointsInSequence>${linksXml}
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

    const noticesXml = notices.size ? `\n      <notices>\n${[...notices].map(([text, id]) => `        <Notice id="${id}" version="1">\n          <Text>${xe(text)}</Text>\n        </Notice>`).join('\n')}\n      </notices>` : '';
    const lineAssignXml = lineAssigns.length ? `\n      <noticeAssignments>\n${lineAssigns.join('\n')}\n      </noticeAssignments>` : '';
    const ttAssignXml = ttAssigns.length ? `\n      <noticeAssignments>\n${ttAssigns.join('\n')}\n      </noticeAssignments>` : '';

    const svcFrame = `    <ServiceFrame id="${cs}:ServiceFrame:Line_${routeCode}" version="1">
      <routePoints>
${rpXml}
      </routePoints>
      <routes>
${routesXml.join('\n')}
      </routes>
      <lines>
${lineXml}
      </lines>
      <journeyPatterns>
${jpsXml.join('\n')}
      </journeyPatterns>${noticesXml}${lineAssignXml}
    </ServiceFrame>`;

    // Interchanges only between journeys that were written (no dangling FromJourneyRef/ToJourneyRef)
    const sjOnly  = sjs;
    const ixOnly  = ixs.filter(x=>sjIds.has(x.fromSjId) && sjIds.has(x.toSjId)).map(x=>x.xml);

    const ttFrame = `    <TimetableFrame id="${cs}:TimetableFrame:Line_${routeCode}" version="1">
      <vehicleJourneys>
${[...sjOnly, ...dsjs].join('\n')}
      </vehicleJourneys>${trainNumbers.length ? `\n      <trainNumbers>\n${trainNumbers.join('\n')}\n      </trainNumbers>` : ''}${ttAssignXml}${ixOnly.length?`\n      <journeyInterchanges>\n${ixOnly.join('\n')}\n      </journeyInterchanges>`:''}
    </TimetableFrame>`;

    const cf = compositeFrame(cs,`Line_${routeCode}`,lineFrom,lineTo,false,svcFrame,ttFrame);
    return pubDelivery(cs, cf, timestamp);
}

/**
 * The shortest sequence that holds both stop lists in order (by stop ID): a Route that every pattern runs
 * along, also when trips run the other way round part of the time (Horn → Tangen → Horn and Tangen → Horn).
 * @param {{ stopId: string }[]} a @param {{ stopId: string }[]} b
 */
function mergeStops(a, b) {
    if (!a.length) return [...b];
    const n = a.length, m = b.length;
    /** @type {number[][]} lcs[i][j]: longest common subsequence of a[i..] and b[j..] */
    const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] = a[i].stopId === b[j].stopId ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
    const out = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (a[i].stopId === b[j].stopId) { out.push(a[i]); i++; j++; }
        else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push(a[i++]);
        else out.push(b[j++]);
    }
    return [...out, ...a.slice(i), ...b.slice(j)];
}
