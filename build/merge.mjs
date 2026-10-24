// Folds official sources into the OSM-derived records. Matching is one-to-one, nearest first,
// so the two carriageway sides of a motorway rest area cannot both claim the same record.

import { distM, distToRing } from './geo.mjs';

function matchOneToOne(recs, sites, maxM, accept) {
    const pairs = [];
    for (let si = 0; si < sites.length; si++) {
        const s = sites[si];
        for (const r of recs) {
            if (!accept(r)) continue;
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
