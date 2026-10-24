// Small geometry helpers. Coordinates are [lat, lng] in degrees, distances in metres.

const R = 6371008.8;
const rad = (d) => d * Math.PI / 180;

export function distM(lat1, lng1, lat2, lng2) {
    const dLat = rad(lat2 - lat1);
    const dLng = rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Area-weighted centroid of a closed ring; falls back to the vertex mean for degenerate rings.
export function centroid(ring) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [y0, x0] = ring[j];
        const [y1, x1] = ring[i];
        const f = x0 * y1 - x1 * y0;
        a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
    if (Math.abs(a) < 1e-14) {
        const n = ring.length;
        return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
    }
    a *= 3;
    return [cy / a, cx / a];
}

// Area of a closed ring in square metres (local equirectangular projection, fine below a few km).
export function ringAreaM2(ring) {
    const lat0 = rad(ring[0][0]);
    const kx = R * Math.cos(lat0) * Math.PI / 180, ky = R * Math.PI / 180;
    let s = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        s += ring[j][1] * kx * ring[i][0] * ky - ring[i][1] * kx * ring[j][0] * ky;
    }
    return Math.abs(s) / 2;
}

export function pointInRing(lat, lng, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [yi, xi] = ring[i];
        const [yj, xj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

// Distance from a point to a ring's boundary (0 when inside).
export function distToRing(lat, lng, ring) {
    if (pointInRing(lat, lng, ring)) return 0;
    let best = Infinity;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        best = Math.min(best, distToSegment(lat, lng, ring[j], ring[i]));
    }
    return best;
}

// Point-to-segment distance on a local equirectangular projection (accurate for short segments).
export function distToSegment(lat, lng, a, b) {
    const kx = Math.cos(rad(lat)) * 111320;
    const ky = 110574;
    const ax = (a[1] - lng) * kx, ay = (a[0] - lat) * ky;
    const bx = (b[1] - lng) * kx, by = (b[0] - lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(ax + t * dx, ay + t * dy);
}

// Douglas-Peucker on [lat, lng] points with a tolerance in metres.
export function simplify(points, tolM) {
    if (points.length <= 4) return points;
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [s, e] = stack.pop();
        let maxD = 0, idx = -1;
        for (let i = s + 1; i < e; i++) {
            const d = distToSegment(points[i][0], points[i][1], points[s], points[e]);
            if (d > maxD) { maxD = d; idx = i; }
        }
        if (maxD > tolM && idx > 0) {
            keep[idx] = 1;
            stack.push([s, idx], [idx, e]);
        }
    }
    const out = points.filter((_, i) => keep[i]);
    return out.length >= 4 ? out : points;
}

export const round5 = (v) => Math.round(v * 1e5) / 1e5;
