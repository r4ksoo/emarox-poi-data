// Copies the live build (manifest, tiles, official lists) into a local folder, so it can be
// published to a second host without rebuilding from OpenStreetMap.
// node build/mirror.mjs --out dist [--from https://r4ksoo.github.io/emarox-poi-data/v1/]
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, def) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : def;
};
const FROM = arg('from', 'https://r4ksoo.github.io/emarox-poi-data/v1/');
const OUT = path.join(arg('out', 'dist'), 'v1');

async function get(rel) {
    for (let attempt = 1; ; attempt++) {
        const r = await fetch(FROM + rel);
        if (r.ok) return Buffer.from(await r.arrayBuffer());
        if (attempt === 3) throw new Error(`${rel}: HTTP ${r.status}`);
        await new Promise(res => setTimeout(res, 2000 * attempt));
    }
}
function save(rel, buf) {
    const file = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
}

const manifestBuf = await get('manifest.json');
const manifest = JSON.parse(manifestBuf);
const files = [...Object.keys(manifest.tiles).map(k => `t/${k}.json`), 'src/sstpa.json', 'src/autobahn.json'];
let next = 0;
async function worker() {
    while (next < files.length) {
        const rel = files[next++];
        save(rel, await get(rel));
    }
}
await Promise.all(Array.from({ length: 16 }, worker));
save('manifest.json', manifestBuf);    // last, so a partial copy never looks complete
console.log(`mirrored ${files.length} files of build ${manifest.version}`);
