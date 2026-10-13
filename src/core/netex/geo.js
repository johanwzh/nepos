// Geometry helpers. haversineM is ported from Nepos 1.5.7 (nepos.html lines 5216–5221).

/**
 * Great-circle distance in metres.
 * @param {number[]} a [lon, lat]
 * @param {number[]} b [lon, lat]
 */
export function haversineM([lon1,lat1],[lon2,lat2]) {
    const R=6371000, d2r=Math.PI/180;
    const dlat=(lat2-lat1)*d2r, dlon=(lon2-lon1)*d2r;
    const a=Math.sin(dlat/2)**2+Math.cos(lat1*d2r)*Math.cos(lat2*d2r)*Math.sin(dlon/2)**2;
    return R*2*Math.asin(Math.sqrt(a));
}

/**
 * The 2.0 route path between two stops: a straight line (no routing provider yet).
 * Same return shape as 1.5.7's getRoutePath.
 * @param {{ coords: number[] }} a
 * @param {{ coords: number[] }} b
 */
export function straightLine(a, b) {
    return { routed: false, coords: [a.coords, b.coords] };
}
