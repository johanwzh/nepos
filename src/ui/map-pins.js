// Quays as teardrop pins (stop picking 2, 2.5): the tip is the Quay's coordinate (the marker is anchored at its
// bottom). A platform code sits in a bigger round head; a Quay without one gets a smaller, hollow pin. The row's own
// Quay is the same pin, highlighted.

/** @param {string} s */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * @param {{ lat: number, lon: number, label: string, state: string }} m the picker model's quay marker
 * @returns {{ lat: number, lon: number, cls: string, html: string, size: number, height: number, anchor: 'bottom', z: number }}
 */
export function quayPin(m) {
  const code = String(m.label ?? '').trim();
  const cls = ['pm-pin', code ? 'pm-pin-code' : '', m.state === 'current' ? 'pm-pin-current' : ''].filter(Boolean).join(' ');
  const z = m.state ? 900 : 500;
  if (code) {
    // A 22 px round head with the code, its point 8 px below
    const html = `<svg viewBox="0 0 22 30" width="22" height="30"><path class="pm-pin-body" d="M11 29 L4 18.5 A10 10 0 1 1 18 18.5 Z"/>`
      + `<text x="11" y="15" text-anchor="middle">${esc(code)}</text></svg>`;
    return { lat: m.lat, lon: m.lon, cls, html, size: 22, height: 30, anchor: 'bottom', z };
  }
  // A 12 px hollow head
  const html = '<svg viewBox="0 0 12 18" width="12" height="18"><path class="pm-pin-body" d="M6 17 L1.8 9.5 A5 5 0 1 1 10.2 9.5 Z"/>'
    + '<circle class="pm-pin-hole" cx="6" cy="6" r="2.2"/></svg>';
  return { lat: m.lat, lon: m.lon, cls, html, size: 12, height: 18, anchor: 'bottom', z };
}
