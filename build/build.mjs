// Builds the published data set from extracted country files and official sources.
//
// node build/build.mjs --raw <dir with *.jsonl> --sources <dir with sstpa.json, autobahn.json> --out <dist>
//
// Output (served by GitHub Pages):
//   <out>/v1/manifest.json   version, build date, source dates, counts per category and per tile
//   <out>/v1/t/<y>_<x>.json  records of one 0.5° × 0.5° cell, y = floor(lat * 2), x = floor(lng * 2)
// Compact record: { i, c, n, p: [lat, lng], g?: [[lat, lng], ...], m: 1 TIR | 2 BUS, a, s? }

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { classifyRaw } from './classify.mjs';
import { mergeSstpa, mergeAutobahn } from './merge.mjs';

export const GRID = 0.5;
export const tileKey = (lat, lng) => `${Math.floor(lat / GRID)}_${Math.floor(lng / GRID)}`;

function arg(name, def) {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : def;
}

async function readJsonl(file) {
    const out = [];
    const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
    for await (const line of rl) if (line) out.push(JSON.parse(line));
    return out;
}

export function compact(r) {
    const o = { i: r.id, c: r.cat, n: r.name || undefined, p: [r.lat, r.lng], m: (r.tir ? 1 : 0) | (r.bus ? 2 : 0) };
    if (r.poly) o.g = r.poly;
    if (Object.keys(r.a).length) o.a = r.a;
    if (Object.keys(r.s).length) o.s = r.s;
    return o;
}

async function main() {
    const rawDir = arg('raw');
    const srcDir = arg('sources');
    const outDir = arg('out', 'dist');
    const today = new Date().toISOString().slice(0, 10);

    const byId = new Map();
    for (const f of fs.readdirSync(rawDir).filter((f) => f.endsWith('.jsonl')).sort()) {
        const recs = classifyRaw(await readJsonl(path.join(rawDir, f)));
        let n = 0;
        for (const r of recs) if (!byId.has(r.id)) { byId.set(r.id, r); n++; }
        console.log(`${f}: ${recs.length} POI (${n} new)`);
    }
    const recs = [...byId.values()];

    const sources = { osm: today };
    const datesFile = path.join(srcDir, 'dates.json');
    const dates = fs.existsSync(datesFile) ? JSON.parse(fs.readFileSync(datesFile, 'utf8')) : {};
    const official = {};
    for (const [name, merge] of [['sstpa', mergeSstpa], ['autobahn', mergeAutobahn]]) {
        const file = path.join(srcDir, `${name}.json`);
        if (!fs.existsSync(file)) continue;
        official[name] = JSON.parse(fs.readFileSync(file, 'utf8'));
        const res = merge(recs, official[name]);
        sources[name] = dates[name] || fs.statSync(file).mtime.toISOString().slice(0, 10);
        console.log(`${name}: ${res.matched} matched, ${res.added} added`);
    }

    const tiles = new Map();
    const counts = {};
    for (const r of recs) {
        const k = tileKey(r.lat, r.lng);
        if (!tiles.has(k)) tiles.set(k, []);
        tiles.get(k).push(compact(r));
        counts[r.cat] = (counts[r.cat] || 0) + 1;
    }

    const vDir = path.join(outDir, 'v1');
    fs.rmSync(vDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(vDir, 't'), { recursive: true });
    const tileCounts = {};
    let bytes = 0, biggest = 0;
    for (const [k, list] of tiles) {
        const json = JSON.stringify(list);
        fs.writeFileSync(path.join(vDir, 't', `${k}.json`), json);
        tileCounts[k] = list.length;
        bytes += json.length;
        biggest = Math.max(biggest, json.length);
    }
    // The official lists travel with the build: the next run falls back to them when a
    // source website is down (build/fetch-sources.mjs).
    fs.mkdirSync(path.join(vDir, 'src'), { recursive: true });
    for (const [name, data] of Object.entries(official)) {
        fs.writeFileSync(path.join(vDir, 'src', `${name}.json`), JSON.stringify(data));
    }
    const manifest = { version: today, built: new Date().toISOString(), grid: GRID, sources, total: recs.length, counts, tiles: tileCounts };
    fs.writeFileSync(path.join(vDir, 'manifest.json'), JSON.stringify(manifest));
    console.log(`Total ${recs.length} POI in ${tiles.size} tiles, ${(bytes / 1e6).toFixed(1)} MB, largest tile ${(biggest / 1e3).toFixed(0)} kB`);
    console.log(counts);
}

if (process.argv[1].endsWith('build.mjs')) {
    main().catch((e) => { console.error(e); process.exit(1); });
}
