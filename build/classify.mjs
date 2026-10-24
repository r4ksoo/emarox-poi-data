// Turns raw extract lines (build/extract.py) into POI records.
//
// Record: { id, cat, name, lat, lng, poly?, tir, bus, a: {attr: value}, s: {attr: sourceCode} }
//   cat  'parking' | 'rest' | 'fuel' | 'hotel' | 'wash' | 'service'
//   s    source per attribute; missing = OSM ('o'). 'e' = EU SSTPA list, 'd' = Autobahn GmbH.
// Rules (poi.md section 2): a vehicle flag is set only when the data supports it, an attribute
// is written only when a tag or a nearby mapped object confirms it — never guessed.

import { distM, distToRing, pointInRing, simplify, round5 } from './geo.mjs';

const HGV_OK = new Set(['yes', 'designated', 'only']);
const YES = (v) => v !== undefined && v !== 'no' && v !== '0';
const CARDS = ['dkv', 'uta', 'as24', 'e100', 'eurowag'];

// Simple spatial hash for "what is near this point" lookups (cell ~ 1.1 km).
class Grid {
    constructor(cell = 0.01) { this.cell = cell; this.map = new Map(); }
    key(lat, lng) { return `${Math.floor(lat / this.cell)}:${Math.floor(lng / this.cell)}`; }
    add(item) {
        const k = this.key(item.lat, item.lng);
        let arr = this.map.get(k);
        if (!arr) this.map.set(k, arr = []);
        arr.push(item);
    }
    near(lat, lng, radiusM) {
        const r = Math.ceil(radiusM / (this.cell * 111000)) + 1;
        const cy = Math.floor(lat / this.cell), cx = Math.floor(lng / this.cell);
        const out = [];
        for (let y = cy - r; y <= cy + r; y++) {
            for (let x = cx - r; x <= cx + r; x++) {
                const arr = this.map.get(`${y}:${x}`);
                if (arr) for (const it of arr) out.push(it);
            }
        }
        return out;
    }
}

function excluded(t) {
    return t.access === 'private' || t.access === 'no' || YES(t.disused);
}

// Distance from an object (polygon or point) to a point.
function objDist(o, lat, lng) {
    return o.poly ? distToRing(lat, lng, o.poly) : distM(o.lat, o.lng, lat, lng);
}

function baseRecord(raw, cat) {
    const [lat, lng] = raw.c;
    const t = raw.t;
    return {
        id: raw.k, cat,
        name: t.name || t.brand || t.operator || null,
        lat, lng, poly: raw.g || null,
        tir: false, bus: false, a: {}, s: {}, t,
    };
}

export function classifyRaw(raws) {
    const mains = [];
    const helpers = new Grid();
    const carparks = new Grid();
    const hgvParks = new Grid();

    for (const raw of raws) {
        const t = raw.t;
        const [lat, lng] = raw.c;
        const a = t.amenity;
        if (a === 'shower' || a === 'toilets' || a === 'restaurant' || a === 'fast_food' || a === 'cafe') {
            if (!excluded(t)) helpers.add({ lat, lng, kind: a });
            continue;
        }
        if (a === 'parking' && !t.highway) {
            const hgv = HGV_OK.has(t.hgv) || Number(t['capacity:hgv']) > 0;
            if (!excluded(t)) {
                carparks.add({ lat, lng });
                if (hgv) hgvParks.add({ lat, lng });
            }
            if (!hgv || t.hgv === 'no' || t['capacity:hgv'] === '0') continue;
        }
        if (excluded(t)) continue;
        const rec = classifyOne(raw);
        if (rec) mains.push(rec);
    }

    // Hotels: shown only with a confirmed car park (BUS) / truck park (TIR) next to them.
    for (const r of mains) {
        if (r.cat !== 'hotel') continue;
        const t = r.t;
        const tagHgv = HGV_OK.has(t.hgv) || HGV_OK.has(t['parking:hgv']);
        const nearHgv = hgvParks.near(r.lat, r.lng, 200).some((p) => objDist(r, p.lat, p.lng) <= 200);
        const nearCar = carparks.near(r.lat, r.lng, 100).some((p) => objDist(r, p.lat, p.lng) <= 100);
        const tagCar = t.parking && t.parking !== 'no';
        if (tagHgv || nearHgv) { r.tir = true; r.a.ph = 1; }
        if (tagHgv || nearHgv || nearCar || tagCar) { r.bus = true; r.a.pk = 1; }
    }

    let recs = mains.filter((r) => r.tir || r.bus);
    recs = dedupe(recs);

    // Facilities at rest areas and truck parks, from objects mapped inside or right next to them.
    for (const r of recs) {
        if (r.cat !== 'rest' && r.cat !== 'parking') continue;
        const reach = r.poly ? 30 : 150;
        for (const h of helpers.near(r.lat, r.lng, reach + 50)) {
            if (objDist(r, h.lat, h.lng) > reach) continue;
            if (h.kind === 'shower') r.a.sh = 1;
            else if (h.kind === 'toilets') r.a.wc = 1;
            else r.a.food = 1;
        }
    }

    // Fuel at a motorway service area: a TIR-capable station by construction of the area.
    const services = recs.filter((r) => r.cat === 'rest' && r.t.highway === 'services');
    const servGrid = new Grid(0.02);
    services.forEach((s) => servGrid.add(s));
    for (const r of recs) {
        if (r.cat !== 'fuel' || r.tir || r.t.hgv === 'no') continue;
        const at = servGrid.near(r.lat, r.lng, 300).find((s) => objDist(s, r.lat, r.lng) <= 50);
        if (at) { r.tir = true; r.a.mop = 1; }
    }

    for (const r of recs) {
        if (r.poly) r.poly = simplify(r.poly, 2).map(([y, x]) => [round5(y), round5(x)]);
        r.lat = round5(r.lat); r.lng = round5(r.lng);
        delete r.t;
    }
    return recs;
}

function classifyOne(raw) {
    const t = raw.t;
    const hgvTag = t.hgv;
    if (t.highway === 'services' || t.highway === 'rest_area') {
        const r = baseRecord(raw, 'rest');
        r.tir = hgvTag !== 'no';
        r.bus = true;
        applyCommon(r, t);
        return r;
    }
    if (t.amenity === 'parking') {
        const r = baseRecord(raw, 'parking');
        r.tir = true;
        r.bus = hgvTag !== 'only';
        applyCommon(r, t);
        return r;
    }
    if (t.amenity === 'fuel') {
        const r = baseRecord(raw, 'fuel');
        r.tir = HGV_OK.has(hgvTag) || t['fuel:HGV_diesel'] === 'yes';
        r.bus = true;
        if (t['fuel:HGV_diesel'] === 'yes') r.a.hgvd = 1;
        if (t['fuel:adblue'] === 'yes') r.a.adblue = 1;
        if (t['fuel:lng'] === 'yes') r.a.lng = 1;
        if (t['fuel:cng'] === 'yes') r.a.cng = 1;
        const cards = CARDS.filter((c) => t[`payment:${c}`] === 'yes');
        if (cards.length) r.a.cards = cards;
        if (t.brand) r.a.brand = t.brand;
        if (t.opening_hours === '24/7') r.a.h24 = 1;
        return r;
    }
    if (t.tourism === 'hotel' || t.tourism === 'motel') {
        const r = baseRecord(raw, 'hotel');
        if (t.tourism === 'motel') r.a.motel = 1;
        return r;
    }
    if (t.amenity === 'car_wash' && HGV_OK.has(hgvTag)) {
        const r = baseRecord(raw, 'wash');
        r.tir = true;
        if (t.opening_hours === '24/7') r.a.h24 = 1;
        return r;
    }
    if (t.shop === 'truck_repair' || t.shop === 'truck' || (t.shop === 'tyres' && HGV_OK.has(hgvTag))) {
        const r = baseRecord(raw, 'service');
        r.tir = true;
        if (t.shop === 'tyres') r.a.tyres = 1;
        return r;
    }
    return null;
}

function applyCommon(r, t) {
    const cap = Number(t['capacity:hgv']);
    if (cap > 0) r.a.cap = cap;
    if (t.shower !== undefined) r.a.sh = YES(t.shower) ? 1 : 0;
    if (t.toilets !== undefined) r.a.wc = YES(t.toilets) ? 1 : 0;
    if (t.supervised === 'yes') r.a.sec = 1;
    if (t.opening_hours === '24/7') r.a.h24 = 1;
    if (t.restaurant === 'yes') r.a.food = 1;
}

// The same place is often mapped twice: a node plus a polygon, or a truck park inside a
// service area. Keep the polygon, fold the smaller object's facts into it.
function dedupe(recs) {
    const polys = recs.filter((r) => r.poly);
    const grid = new Grid(0.02);
    polys.forEach((p) => grid.add(p));
    const drop = new Set();
    // Points first, then polygons from small to large, so facts folded into a host travel on
    // if that host is itself folded into a bigger one later.
    const order = [...recs].sort((x, y) => (x.poly ? x.poly.length : 0) - (y.poly ? y.poly.length : 0));

    const sameFamily = (inner, outer) => {
        if (inner.cat === outer.cat) return true;
        return inner.cat === 'parking' && outer.cat === 'rest';
    };

    for (const r of order) {
        const cands = grid.near(r.lat, r.lng, 300)
            .filter((p) => p !== r && !drop.has(p.id) && sameFamily(r, p));
        let host = null;
        for (const p of cands) {
            if (r.poly && r.cat === p.cat) {
                // Two polygons of the same category: drop the one whose centre lies in the other,
                // keeping the larger.
                if (!pointInRing(r.lat, r.lng, p.poly) || p.poly.length < r.poly.length) continue;
            } else if (objDist(p, r.lat, r.lng) > (r.poly ? 0 : 25)) {
                continue;
            }
            host = p;
            break;
        }
        if (!host) continue;
        drop.add(r.id);
        if (r.tir) host.tir = true;
        if (r.bus) host.bus = true;
        if (!host.name && r.name) host.name = r.name;
        for (const [k, v] of Object.entries(r.a)) {
            if (k === 'cap' && host.a.cap) host.a.cap += v;
            else if (host.a[k] === undefined) host.a[k] = v;
        }
    }
    return recs.filter((r) => !drop.has(r.id));
}
