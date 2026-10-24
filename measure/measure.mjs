// Accuracy measurement on fixed test routes (poi.md section 7).
//
// node measure/measure.mjs --dist <dist> --sources <dir> --borders <countryBorders.js>
//
// Compares the built data set inside a 3 km corridor of each route against official lists:
//   Autobahn GmbH truck rest areas (DE), EU SSTPA list, all fuel stations of FR and ES.
// Only records that came from OSM count as "found" — records added from the official lists
// themselves would make the comparison circular.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { distM, distToRing, distToSegment } from '../build/geo.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const DIST = arg('dist', 'dist');
const SRC = arg('sources');
const BORDERS = arg('borders');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORRIDOR = 3000;

// --- data ---
const recs = [];
for (const f of fs.readdirSync(path.join(DIST, 'v1', 't'))) {
    for (const r of JSON.parse(fs.readFileSync(path.join(DIST, 'v1', 't', f), 'utf8'))) recs.push(r);
}
const fromOsm = (r) => /^[nwr]\d/.test(r.i);
const bordersSrc = fs.readFileSync(BORDERS, 'utf8');
const BORDERS_GEO = JSON.parse(bordersSrc.slice(bordersSrc.indexOf('{'), bordersSrc.lastIndexOf('}') + 1));

function pipXY(x, y, ring) {
    let ins = false;
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
        const [xi, yi] = ring[a], [xj, yj] = ring[b];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
}
function countryOf(lat, lng) {
    for (const [k, polys] of Object.entries(BORDERS_GEO)) {
        for (const p of polys) {
            const ring = Array.isArray(p[0][0]) ? p[0] : p;
            if (pipXY(lng, lat, ring)) return k;
        }
    }
    return '??';
}

function readOfficial() {
    const ab = JSON.parse(fs.readFileSync(path.join(SRC, 'autobahn.json'), 'utf8'));
    const sstpa = JSON.parse(fs.readFileSync(path.join(SRC, 'sstpa.json'), 'utf8'));
    const fr = fs.readFileSync(path.join(SRC, 'fr-stations.csv'), 'utf8').split(/\r?\n/).slice(1)
        .map((l) => l.split(';')).filter((c) => c.length > 2 && c[1] && c[2])
        .map((c) => ({ lat: Number(c[1]) / 1e5, lng: Number(c[2]) / 1e5 }))
        .filter((s) => Number.isFinite(s.lat) && Math.abs(s.lat) > 1);
    const esRaw = JSON.parse(fs.readFileSync(path.join(SRC, 'es-stations.json'), 'utf8'));
    const num = (v) => Number(String(v).replace(',', '.'));
    const es = (esRaw.ListaEESSPrecio || []).map((s) => ({ lat: num(s.Latitud), lng: num(s['Longitud (WGS84)']) }))
        .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
    return { ab, sstpa, fr, es };
}

// --- corridor ---
function corridor(coords) {
    const cell = 0.05;
    const grid = new Map();
    for (let i = 0; i < coords.length - 1; i++) {
        const [a, b] = [coords[i], coords[i + 1]];
        const ys = [Math.floor(Math.min(a[0], b[0]) / cell), Math.floor(Math.max(a[0], b[0]) / cell)];
        const xs = [Math.floor(Math.min(a[1], b[1]) / cell), Math.floor(Math.max(a[1], b[1]) / cell)];
        for (let y = ys[0]; y <= ys[1]; y++) for (let x = xs[0]; x <= xs[1]; x++) {
            const k = `${y}:${x}`;
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(i);
        }
    }
    return (lat, lng) => {
        const cy = Math.floor(lat / cell), cx = Math.floor(lng / cell);
        let best = Infinity;
        for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
            for (const i of grid.get(`${y}:${x}`) || []) {
                best = Math.min(best, distToSegment(lat, lng, coords[i], coords[i + 1]));
            }
        }
        return best;
    };
}

const recDist = (r, lat, lng) => (r.g ? distToRing(lat, lng, r.g) : distM(r.p[0], r.p[1], lat, lng));

function nearestRec(list, lat, lng, maxM) {
    let best = null, bd = Infinity;
    for (const r of list) {
        if (Math.abs(r.p[0] - lat) > 0.01 || Math.abs(r.p[1] - lng) > 0.015) continue;
        const d = recDist(r, lat, lng);
        if (d < bd) { bd = d; best = r; }
    }
    return bd <= maxM ? { r: best, d: bd } : null;
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10} %` : '—');
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const p95 = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length * 0.95)]; };

// --- run ---
const off = readOfficial();
const routes = JSON.parse(fs.readFileSync(path.join(HERE, 'routes.json'), 'utf8'));
const results = { built: new Date().toISOString(), routes: [], official: {} };
const agg = { ab: [0, 0, []], sstpa: [0, 0], fr: [0, 0, [], 0], es: [0, 0, [], 0], frRev: [0, 0], esRev: [0, 0] };
const perCountry = {};

for (const rt of routes) {
    const geo = JSON.parse(fs.readFileSync(path.join(HERE, `route-${rt.id}.json`), 'utf8'));
    const dist = corridor(geo.coords);
    const inC = recs.filter((r) => dist(r.p[0], r.p[1]) <= CORRIDOR);
    const osmIn = inC.filter(fromOsm);
    const parkLike = osmIn.filter((r) => r.c === 'rest' || r.c === 'parking');
    const fuel = osmIn.filter((r) => r.c === 'fuel');

    const row = { id: rt.id, name: rt.name, km: Math.round(geo.km), counts: {}, tir: 0, bus: 0 };
    for (const r of inC) {
        row.counts[r.c] = (row.counts[r.c] || 0) + 1;
        if (r.m & 1) row.tir++;
        if (r.m & 2) row.bus++;
        const cc = countryOf(r.p[0], r.p[1]);
        const pc = perCountry[cc] ||= { total: 0, park: 0, parkSh: 0, parkWc: 0, parkCap: 0, parkNamed: 0, poly: 0, fuel: 0, fuelTir: 0, hotel: 0 };
        pc.total++;
        if (r.g) pc.poly++;
        if (r.c === 'rest' || r.c === 'parking') {
            pc.park++;
            if (r.a?.sh !== undefined) pc.parkSh++;
            if (r.a?.wc !== undefined) pc.parkWc++;
            if (r.a?.cap) pc.parkCap++;
            if (r.n) pc.parkNamed++;
        }
        if (r.c === 'fuel') { pc.fuel++; if (r.m & 1) pc.fuelTir++; }
        if (r.c === 'hotel') pc.hotel++;
    }

    // Autobahn (DE truck rest areas)
    const abIn = off.ab.filter((s) => dist(s.lat, s.lng) <= CORRIDOR);
    let abHit = 0;
    for (const s of abIn) { const m = nearestRec(parkLike, s.lat, s.lng, 250); if (m) { abHit++; agg.ab[2].push(m.d); } }
    row.autobahn = { official: abIn.length, foundInOsm: abHit };
    agg.ab[0] += abHit; agg.ab[1] += abIn.length;

    const ssIn = off.sstpa.filter((s) => dist(s.lat, s.lng) <= CORRIDOR);
    let ssHit = 0;
    for (const s of ssIn) if (nearestRec(parkLike, s.lat, s.lng, 300)) ssHit++;
    row.sstpa = { official: ssIn.length, foundInOsm: ssHit };
    agg.sstpa[0] += ssHit; agg.sstpa[1] += ssIn.length;

    for (const [key, list, cc] of [['fr', off.fr, 'FR'], ['es', off.es, 'ES']]) {
        const offIn = list.filter((s) => dist(s.lat, s.lng) <= CORRIDOR);
        let hit = 0, hitTir = 0;
        for (const s of offIn) {
            const m = nearestRec(fuel, s.lat, s.lng, 150);
            if (m) { hit++; agg[key][2].push(m.d); if (m.r.m & 1) hitTir++; }
        }
        // Reverse: OSM stations in this country's corridor that match an official active station.
        const osmFuelCc = fuel.filter((r) => countryOf(r.p[0], r.p[1]) === cc);
        let rev = 0;
        for (const r of osmFuelCc) {
            if (offIn.some((s) => Math.abs(s.lat - r.p[0]) < 0.003 && Math.abs(s.lng - r.p[1]) < 0.004 && recDist(r, s.lat, s.lng) <= 150)) rev++;
        }
        row[key] = { official: offIn.length, foundInOsm: hit, foundTir: hitTir, osmStations: osmFuelCc.length, osmConfirmed: rev };
        agg[key][0] += hit; agg[key][1] += offIn.length; agg[key][3] += hitTir;
        agg[`${key}Rev`][0] += rev; agg[`${key}Rev`][1] += osmFuelCc.length;
    }
    results.routes.push(row);
    console.log(rt.id, JSON.stringify(row));
}

results.official = {
    autobahn: { found: agg.ab[0], of: agg.ab[1], pct: pct(agg.ab[0], agg.ab[1]), medianM: median(agg.ab[2]), p95M: p95(agg.ab[2]) },
    sstpa: { found: agg.sstpa[0], of: agg.sstpa[1], pct: pct(agg.sstpa[0], agg.sstpa[1]) },
    frFuel: { found: agg.fr[0], of: agg.fr[1], pct: pct(agg.fr[0], agg.fr[1]), tirConfirmed: pct(agg.fr[3], agg.fr[0]), medianM: median(agg.fr[2]), osmExistPct: pct(agg.frRev[0], agg.frRev[1]) },
    esFuel: { found: agg.es[0], of: agg.es[1], pct: pct(agg.es[0], agg.es[1]), tirConfirmed: pct(agg.es[3], agg.es[0]), medianM: median(agg.es[2]), osmExistPct: pct(agg.esRev[0], agg.esRev[1]) },
};
results.perCountry = perCountry;
fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results.official, null, 1));
console.log(perCountry);
