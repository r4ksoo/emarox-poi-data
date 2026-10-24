// EU list of certified Safe and Secure Truck Parking Areas (Delegated Regulation (EU) 2022/1012),
// published by the European Commission at eu-parkings.eu. Every certified site, at any level,
// must offer separate showers and toilets, food 24/7 and a dining area (Annex, "mandatory
// service requirements"), so those facilities count as officially confirmed.

const MAP_URL = 'https://eu-parkings.eu/sstpas/sstpas-map/';
const UA = 'emarox-poi-data/1.0 (+https://github.com/r4ksoo/emarox-poi-data)';
const LEVELS = ['platinum', 'gold', 'silver', 'bronze'];

const decode = (s) => s
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
    return res.text();
}

export async function fetchSstpa({ log = console.log } = {}) {
    const html = await get(MAP_URL);
    const m = html.match(/data-gk-map="([^"]*)"/);
    if (!m) throw new Error('SSTPA: map data not found');
    const markers = JSON.parse(decode(m[1])).markers_data || [];
    const out = [];
    for (const mk of markers) {
        const lat = Number(mk.lat), lng = Number(mk.long);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        let name = null, level = null;
        try {
            const page = await get(mk.url);
            const text = decode(page.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
                .replace(/<[^>]+>/g, '\n'));
            const lm = text.match(/\n\s*([^\n]+?)\s*-\s*Certification level:\s*(\w+)/i);
            if (lm) {
                name = lm[1].trim();
                const lv = lm[2].toLowerCase();
                level = LEVELS.includes(lv) ? lv : null;
            }
        } catch (err) {
            log(`  SSTPA entry ${mk.entry_id}: ${err.message}`);
        }
        out.push({ ref: `sstpa:${mk.entry_id}`, lat, lng, name, level, url: mk.url });
        await sleep(800);
    }
    if (out.length < 30) throw new Error(`SSTPA: only ${out.length} sites, refusing`);
    return out;
}
