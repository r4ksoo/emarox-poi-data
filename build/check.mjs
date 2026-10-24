// Safety valve before publishing: refuse a build that lost data compared with the one live
// now. A failed check fails the workflow, so GitHub Pages keeps serving the previous build
// and GitHub e-mails the repository owner.
//
// node build/check.mjs --dist <dist> [--prev https://r4ksoo.github.io/emarox-poi-data/v1/]

import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const DIST = arg('dist', 'dist');
const PREV = arg('prev', 'https://r4ksoo.github.io/emarox-poi-data/v1/');

const MAX_TOTAL_DROP = 0.05;     // whole data set
const MAX_CAT_DROP = 0.10;       // per category
const MAX_REGION_DROP = 0.10;    // per 5° × 5° region with at least REGION_MIN objects
const REGION_MIN = 300;

const next = JSON.parse(fs.readFileSync(path.join(DIST, 'v1', 'manifest.json'), 'utf8'));
const problems = [];

if (!next.total || next.total < 1000) problems.push(`only ${next.total} records`);
for (const s of ['osm', 'sstpa', 'autobahn']) if (!next.sources || !next.sources[s]) problems.push(`source ${s} missing`);

let prev = null;
try {
    const res = await fetch(`${PREV}manifest.json`, { cache: 'no-store' });
    if (res.ok) prev = await res.json();
} catch { /* first build */ }

function regions(tiles, grid) {
    const out = {};
    for (const [k, n] of Object.entries(tiles)) {
        const [y, x] = k.split('_').map(Number);
        const key = `${Math.floor((y * grid) / 5) * 5}_${Math.floor((x * grid) / 5) * 5}`;
        out[key] = (out[key] || 0) + n;
    }
    return out;
}

if (prev) {
    if (next.total < prev.total * (1 - MAX_TOTAL_DROP)) problems.push(`total ${prev.total} → ${next.total}`);
    for (const [cat, n] of Object.entries(prev.counts || {})) {
        const now = (next.counts || {})[cat] || 0;
        if (now < n * (1 - MAX_CAT_DROP)) problems.push(`${cat} ${n} → ${now}`);
    }
    const before = regions(prev.tiles || {}, prev.grid || 0.5);
    const after = regions(next.tiles || {}, next.grid || 0.5);
    for (const [r, n] of Object.entries(before)) {
        if (n < REGION_MIN) continue;
        const now = after[r] || 0;
        if (now < n * (1 - MAX_REGION_DROP)) problems.push(`region ${r}° ${n} → ${now}`);
    }
    console.log(`previous ${prev.version}: ${prev.total} records; new ${next.version}: ${next.total}`);
} else {
    console.log(`no previous build online; new ${next.version}: ${next.total} records`);
}

if (problems.length) {
    console.error('Refusing to publish:\n  ' + problems.join('\n  '));
    process.exit(1);
}
console.log('check passed');
