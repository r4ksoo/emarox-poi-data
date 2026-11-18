// French government fuel price feed (prix-carburants, Licence Ouverte 2.0): every station in
// France with its services. "Piste poids lourds" = the station has a truck lane, which is what
// the TIR layer needs to know. Coordinates are WGS84 × 100000 at address precision.

import zlib from 'node:zlib';

const URL_INSTANT = 'https://donnees.roulez-eco.fr/opendata/instantane';
const UA = 'emarox-poi-data/1.0 (+https://github.com/r4ksoo/emarox-poi-data)';

// The feed is a ZIP with one deflated XML file; read its first entry without a zip library.
function firstZipEntry(buf) {
    if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('not a zip file');
    const method = buf.readUInt16LE(8);
    const nameLen = buf.readUInt16LE(26), extraLen = buf.readUInt16LE(28);
    const start = 30 + nameLen + extraLen;
    // The compressed size may be in a data descriptor; inflateRaw stops at the end of the stream.
    const body = buf.subarray(start);
    if (method === 0) return body.subarray(0, buf.readUInt32LE(18));
    if (method !== 8) throw new Error(`zip method ${method}`);
    return zlib.inflateRawSync(body, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
}

export function parseFrFuel(xml) {
    const out = [];
    for (const m of xml.matchAll(/<pdv\s([^>]*)>([\s\S]*?)<\/pdv>/g)) {
        const attrs = Object.fromEntries([...m[1].matchAll(/(\w[\w-]*)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
        const lat = Number(attrs.latitude) / 1e5, lng = Number(attrs.longitude) / 1e5;
        if (!(lat > 41 && lat < 52 && lng > -6 && lng < 10)) continue;   // mainland France + Corsica
        out.push({ ref: `frfuel:${attrs.id}`, lat, lng, hgvLane: /<service>\s*Piste poids lourds\s*<\/service>/.test(m[2]) });
    }
    return out;
}

export async function fetchFrFuel() {
    const res = await fetch(URL_INSTANT, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = firstZipEntry(Buffer.from(await res.arrayBuffer())).toString('latin1');
    const list = parseFrFuel(xml);
    if (list.length < 5000) throw new Error(`only ${list.length} stations`);
    return list;
}
