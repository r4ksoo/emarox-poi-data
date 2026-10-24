// Fetch the official sources. When a source is down, fall back to the copy published with
// the previous build (v1/src/*.json), so one unreachable website does not stop the weekly
// update — and never silently drops its facts either.
//
// node build/fetch-sources.mjs --out <dir> [--prev https://r4ksoo.github.io/emarox-poi-data/v1/]

import fs from 'node:fs';
import path from 'node:path';
import { fetchSstpa } from './sources/sstpa.mjs';
import { fetchAutobahn } from './sources/autobahn.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', 'work/sources');
const PREV = arg('prev', 'https://r4ksoo.github.io/emarox-poi-data/v1/');

fs.mkdirSync(OUT, { recursive: true });

const today = new Date().toISOString().slice(0, 10);

// Returns the date the data was taken from the source.
async function one(name, fetcher) {
    const file = path.join(OUT, `${name}.json`);
    try {
        const data = await fetcher();
        fs.writeFileSync(file, JSON.stringify(data));
        console.log(`${name}: ${data.length} live`);
        return today;
    } catch (err) {
        console.warn(`${name}: live fetch failed (${err.message}), using the previous build's copy`);
        const [res, man] = await Promise.all([fetch(`${PREV}src/${name}.json`), fetch(`${PREV}manifest.json`)]);
        if (!res.ok || !man.ok) throw new Error(`${name}: no live data and no previous copy`);
        const data = await res.json();
        fs.writeFileSync(file, JSON.stringify(data));
        const date = ((await man.json()).sources || {})[name];
        console.log(`${name}: ${data.length} from previous build (${date})`);
        return date;
    }
}

const dates = {
    sstpa: await one('sstpa', fetchSstpa),
    autobahn: await one('autobahn', fetchAutobahn),
};
fs.writeFileSync(path.join(OUT, 'dates.json'), JSON.stringify(dates));
