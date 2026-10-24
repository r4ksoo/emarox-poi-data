// Autobahn GmbH des Bundes open data API: every rest area on German motorways with truck
// parking ("parking_lorry"), with the official number of truck spaces.

const BASE = 'https://verkehr.autobahn.de/o/autobahn';
const UA = 'emarox-poi-data/1.0 (+https://github.com/r4ksoo/emarox-poi-data)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
    for (let i = 0; i < 3; i++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
            if (res.ok) return res.json();
            if (res.status === 404) return null;
        } catch { /* retry */ }
        await sleep(3000 * (i + 1));
    }
    throw new Error(`${url} failed`);
}

export async function fetchAutobahn({ log = console.log } = {}) {
    const { roads } = await getJson(`${BASE}/`);
    const byId = new Map();
    for (const road of roads) {
        const id = road.trim();
        if (!id) continue;
        const data = await getJson(`${BASE}/${encodeURIComponent(id)}/services/parking_lorry`);
        for (const p of data?.parking_lorry || []) {
            const [lng, lat] = p.coordinate?.coordinates || [];
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            const desc = (p.description || []).join(' | ');
            const lkw = desc.match(/LKW Stellplätze:\s*(\d+)/i);
            byId.set(p.identifier, {
                ref: `autobahn:${p.identifier}`,
                road: id,
                name: p.subtitle || null,
                lat, lng,
                cap: lkw ? Number(lkw[1]) : null,
                features: (p.lorryParkingFeatureIcons || []).map((f) => f.description || f.icon).filter(Boolean),
            });
        }
        await sleep(300);
    }
    const out = [...byId.values()];
    log(`  Autobahn: ${out.length} truck rest areas`);
    if (out.length < 500) throw new Error(`Autobahn: only ${out.length} sites, refusing`);
    return out;
}
