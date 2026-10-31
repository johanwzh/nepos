// Knutepunkt's approval round (interchanges spec 2026-10-31, "Matching and approval"), like Ruting's route & accept:
// Finn treff matches each picked trip again and compares with what was approved; Godkjenn writes the result. Nothing
// reaches the export without the user's approval.
import { lineTrips } from './trips.js';
import { candidates } from './match.js';
import { hubState } from './hub.js';

/** @typedef {import('./match.js').Candidate} Candidate */
/** @typedef {import('./hub.js').HubLink} HubLink */
/**
 * new: one candidate, nothing approved · same: the approved feeder still arrives as approved · changed: the approved
 * feeder arrives at another time, or another single candidate replaces it · gone: approved, nothing matches any more ·
 * pick: several candidates and none of them approved (the user picks one) · none: nothing found, nothing approved ·
 * lost: the hub row's stop was changed.
 * @typedef {'new' | 'same' | 'changed' | 'gone' | 'pick' | 'none' | 'lost'} ProposalState
 * @typedef {{ trip: string, ci: number, dep: number | null, state: ProposalState, pick: Candidate | null, candidates: Candidate[], link: HubLink }} Proposal
 */

/**
 * @param {{ stops: any[], cols: any[] }} grid our grid as it is now (inside ownCode's route state in `lines`)
 * @param {number} ri the hub's row
 * @param {{ code: string, rs: any }[]} lines
 * @param {{ calendars: import('../calendars.js').Calendar[], quayInfo: Map<string, any>, ownCode: string }} ctx
 * @returns {Proposal[]} one per picked trip, by departure
 */
export function proposals(grid, ri, lines, ctx) {
  const hub = grid.stops[ri]?.hub;
  if (!hub) return [];
  const lost = hubState(grid, ri) === 'lost';
  const ours = lines.find((l) => l.code === ctx.ownCode);
  const memo = new WeakMap(); // each line read once this round
  const trips = ours ? lineTrips(ours.rs, { calendars: ctx.calendars, memo }) : [];
  /** @type {Proposal[]} */
  const out = [];
  grid.cols.forEach((col, ci) => {
    const link = col.cells[ri]?.hubLink;
    if (!link) return;
    const trip = trips.find((t) => t.uid === col.uid && t.calls.some((c) => c.ri === ri));
    const dep = trip?.calls.find((c) => c.ri === ri)?.dep ?? null;
    if (lost) { out.push({ trip: col.uid, ci, dep, state: 'lost', pick: null, candidates: [], link }); return; }
    const cands = trip ? candidates(hub, ri, trip, lines, { ...ctx, memo }) : [];
    out.push({ trip: col.uid, ci, dep, link, candidates: cands, ...stateOf(link, cands) });
  });
  return out.sort((a, b) => (a.dep ?? Infinity) - (b.dep ?? Infinity));
}

/** @param {HubLink} link @param {Candidate[]} cands @returns {{ state: ProposalState, pick: Candidate | null }} */
function stateOf(link, cands) {
  if (!link.line) {
    if (!cands.length) return { state: 'none', pick: null };
    return cands.length === 1 ? { state: 'new', pick: cands[0] } : { state: 'pick', pick: null };
  }
  const sameTrip = cands.filter((c) => c.line === link.line && c.trip === link.trip);
  const same = sameTrip.find((c) => c.arr === link.arr);
  if (same) return { state: 'same', pick: same };
  if (sameTrip.length) return { state: 'changed', pick: sameTrip[0] };
  if (!cands.length) return { state: 'gone', pick: null };
  return cands.length === 1 ? { state: 'changed', pick: cands[0] } : { state: 'pick', pick: null };
}

/**
 * What Godkjenn writes on each picked trip's cell: new and changed links, a chosen pick; gone and lost clear the link
 * (the trip stays picked); same, an unchosen pick and none stay as they were.
 * @param {Proposal[]} props @param {Record<string, number>} choices trip uid → index into its candidates @param {Date} now
 * @returns {Record<string, HubLink>}
 */
export function approve(props, choices, now) {
  /** @type {Record<string, HubLink>} */
  const out = {};
  const linkOf = (/** @type {Candidate} */ c) => ({ line: c.line, trip: c.trip, stopId: c.stopId, arr: c.arr, at: now.toISOString() });
  for (const p of props) {
    const chosen = p.state === 'pick' && choices[p.trip] != null ? p.candidates[choices[p.trip]] : null;
    if ((p.state === 'new' || p.state === 'changed') && p.pick) out[p.trip] = linkOf(p.pick);
    else if (chosen) out[p.trip] = linkOf(chosen);
    else if (p.state === 'gone' || p.state === 'lost') out[p.trip] = {};
    else out[p.trip] = p.link;
  }
  return out;
}
