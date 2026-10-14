import { describe, it, expect } from 'vitest';
import { pickerMapModel } from '../../src/core/picker-map-model.js';

const info = (/** @type {string} */ id, /** @type {number} */ lat, code = 'A') => ({ quayId: id, publicCode: code, stopPlaceId: `SP${id}`, stopPlaceName: `Stop ${id}`, mode: 'bus', lat, lon: 10 });
const hit = (/** @type {string} */ id, /** @type {string} */ mode, lat = 60) => ({ id, name: id, context: '', description: '', modes: [mode], lat, lon: 10 });
const base = {
  lineStops: [
    { n: 1, stopId: 'Q1', name: 'A', info: info('Q1', 59.1) },
    { n: 2, stopId: 'Q2', name: 'B', info: info('Q2', 59.2) },
    { n: 3, stopId: null, name: 'C', info: null },
  ],
  row: 1, current: info('Q2', 59.2), candidate: null, hits: [], place: null, browse: [], browseQuays: [], onlyMode: true, ernMode: 1,
};
const kinds = (/** @type {any} */ m) => m.markers.map((/** @type {any} */ x) => `${x.kind}:${x.id}`);

describe('picker map model', () => {
  it('shows the line faded and numbered, and the row\'s current Quay apart', () => {
    const m = pickerMapModel(base);
    expect(kinds(m)).toEqual(['line:Q1', 'current:Q2']);
    expect(m.markers[0].n).toBe(1);
    expect(m.line).toEqual([[59.1, 10], [59.2, 10]]);
  });

  it('shows search hits as stop places, filtered by the line mode, and browsed ones apart', () => {
    const m = pickerMapModel({ ...base, hits: [hit('P1', 'bus'), hit('P2', 'rail')], browse: [hit('P1', 'bus'), hit('P3', 'bus'), hit('P4', 'tram')] });
    expect(kinds(m)).toEqual(['line:Q1', 'current:Q2', 'place:P1', 'browsePlace:P3']);
    expect(m.markers.find((/** @type {any} */ x) => x.id === 'P1').mode).toBe('bus');
    expect(pickerMapModel({ ...base, onlyMode: false, hits: [hit('P2', 'rail')] }).markers.some((/** @type {any} */ x) => x.id === 'P2')).toBe(true);
  });

  it('shows the Quays of the open stop place and of browsed places, and the candidate', () => {
    const place = { id: 'P1', name: 'Torget', description: '', mode: 'bus', quays: [{ quayId: 'Q7', publicCode: 'C', description: '', lat: 59.5, lon: 10 }] };
    const other = { id: 'P3', name: 'Other', description: '', mode: 'bus', quays: [{ quayId: 'Q8', publicCode: 'D', description: '', lat: 59.6, lon: 10 }] };
    const m = pickerMapModel({ ...base, place, browseQuays: [place, other], candidate: info('Q7', 59.5, 'C') });
    // The candidate Quay marks itself (no ring drawn on top of it).
    expect(kinds(m)).toEqual(['line:Q1', 'current:Q2', 'quay:Q7', 'quay:Q8']);
    expect(m.markers.find((/** @type {any} */ x) => x.id === 'Q7').state).toBe('candidate');
    expect(m.markers.find((/** @type {any} */ x) => x.id === 'Q8').state).toBe('');
    expect(m.markers.find((/** @type {any} */ x) => x.id === 'Q8').label).toBe('D');
    expect(m.fit).toEqual([[59.5, 10]]);
  });

  it('marks the row’s current Quay on its own square when that Quay is shown', () => {
    const place = { id: 'SPQ2', name: 'B', description: '', mode: 'bus', quays: [{ quayId: 'Q2', publicCode: 'A', description: '', lat: 59.2, lon: 10 }] };
    const m = pickerMapModel({ ...base, place });
    expect(kinds(m)).toEqual(['line:Q1', 'quay:Q2']);
    expect(m.markers[1].state).toBe('current');
  });

  it('draws the candidate on its own when no Quay square shows it (a pasted ID)', () => {
    expect(kinds(pickerMapModel({ ...base, candidate: info('Q9', 59.9) }))).toEqual(['line:Q1', 'current:Q2', 'candidate:Q9']);
  });

  it('fits to the search hits while they are shown, else to the current stop', () => {
    expect(pickerMapModel({ ...base, hits: [hit('P1', 'bus', 61), hit('P5', 'bus', 62)] }).fit).toEqual([[61, 10], [62, 10]]);
    expect(pickerMapModel(base).fit).toEqual([[59.2, 10]]);
  });
});
