// Folds official sources into the OSM-derived records. Matching is one-to-one, nearest first,
// so the two carriageway sides of a motorway rest area cannot both claim the same record.

import { distM, distToRing } from './geo.mjs';

function matchOneToOne(recs, sites, maxM, accept) {
    // Accepted records bucketed by 0.01° × 0.015° cell: the candidate window below spans
    // the neighbouring cells, so thousands of sites stay fast on a Europe-wide record list.
    const cell = (lat, lng) => `${Math.floor(lat / 0.01)}:${Math.floor(lng / 0.015)}`;
    const buckets = new Map();
    for (const r of recs) {
        if (!accept(r)) continue;
        const k = cell(r.lat, r.lng);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(r);
    }
    const pairs = [];
    for (let si = 0; si < sites.length; si++) {
        const s = sites[si];
        const cy = Math.floor(s.lat / 0.01), cx = Math.floor(s.lng / 0.015);
        const near = [];
        for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) near.push(...(buckets.get(`${y}:${x}`) || []));
        for (const r of near) {
            if (Math.abs(r.lat - s.lat) > 0.01 || Math.abs(r.lng - s.lng) > 0.015) continue;
            const d = r.poly ? distToRing(s.lat, s.lng, r.poly) : distM(r.lat, r.lng, s.lat, s.lng);
            if (d <= maxM) pairs.push([d, si, r]);
        }
    }
    pairs.sort((a, b) => a[0] - b[0]);
    const usedSite = new Set(), usedRec = new Set(), out = new Map();
    for (const [, si, r] of pairs) {
        if (usedSite.has(si) || usedRec.has(r.id)) continue;
        usedSite.add(si); usedRec.add(r.id);
        out.set(si, r);
    }
    return out;
}

const parkingLike = (r) => r.cat === 'parking' || r.cat === 'rest';

export function mergeSstpa(recs, sites) {
    const matched = matchOneToOne(recs, sites, 300, parkingLike);
    let added = 0;
    sites.forEach((site, i) => {
        let r = matched.get(i);
        if (!r) {
            r = { id: site.ref, cat: 'parking', name: site.name, lat: site.lat, lng: site.lng,
                poly: null, tir: true, bus: true, a: {}, s: {} };
            recs.push(r);
            added++;
        }
        r.tir = true;
        if (!r.name && site.name) r.name = site.name;
        if (site.level) { r.a.cert = site.level; r.s.cert = 'e'; }
        for (const k of ['sec', 'sh', 'wc', 'food']) { r.a[k] = 1; r.s[k] = 'e'; }
    });
    return { matched: matched.size, added };
}

// French government station list: a station with "Piste poids lourds" confirms the TIR layer
// for the OSM station it matches. The list's coordinates are at address precision (median
// 34 m from OSM), hence 150 m. Every station takes part in the matching, so a truck-lane
// station cannot claim an OSM station that belongs to a nearer one without a truck lane.
// Stations missing from OSM are not added: the list carries no brand or name.
export function mergeFrFuel(recs, sites) {
    const matched = matchOneToOne(recs, sites, 150, (r) => r.cat === 'fuel' && !r.a.hx);
    let confirmed = 0;
    for (const [i, r] of matched) {
        if (!sites[i].hgvLane) continue;
        r.a.hgvl = 1; r.s.hgvl = 'f';
        if (!r.tir) { r.tir = true; confirmed++; }
    }
    return { matched: matched.size, added: 0, confirmed };
}

export function mergeAutobahn(recs, sites) {
    const matched = matchOneToOne(recs, sites, 250, parkingLike);
    let added = 0;
    sites.forEach((site, i) => {
        let r = matched.get(i);
        if (!r) {
            r = { id: site.ref, cat: 'rest', name: site.name, lat: site.lat, lng: site.lng,
                poly: null, tir: true, bus: true, a: {}, s: {} };
            recs.push(r);
            added++;
        }
        r.tir = true;
        if (!r.name && site.name) r.name = site.name;
        if (site.cap != null) { r.a.cap = site.cap; r.s.cap = 'd'; }
    });
    return { matched: matched.size, added };
}
