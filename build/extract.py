"""Extract POI candidates from one Geofabrik .osm.pbf into JSON lines.

Usage: python build/extract.py <input.osm.pbf> <output.jsonl>

One line per object: {"k": "n123"|"w123"|"r123", "t": {tags}, "c": [lat, lng], "g": [[lat, lng], ...]}
"g" (outer ring of the area) is written only for the main categories; helper objects
(toilets, restaurants, plain car parks near hotels) get the centre point only.
Classification happens later in build/classify.mjs.
"""
import json
import sys

import osmium

PAIRS = [
    ('amenity', 'fuel'), ('amenity', 'parking'), ('amenity', 'car_wash'),
    ('amenity', 'shower'), ('amenity', 'toilets'), ('amenity', 'restaurant'),
    ('amenity', 'fast_food'), ('amenity', 'cafe'),
    ('highway', 'services'), ('highway', 'rest_area'),
    ('tourism', 'hotel'), ('tourism', 'motel'),
    ('shop', 'truck_repair'), ('shop', 'truck'), ('shop', 'tyres'),
]

HELPER_AMENITIES = {'shower', 'toilets', 'restaurant', 'fast_food', 'cafe'}

KEEP_TAGS = {
    'name', 'brand', 'operator', 'amenity', 'highway', 'tourism', 'shop', 'hgv', 'capacity',
    'capacity:hgv', 'supervised', 'shower', 'toilets', 'opening_hours', 'access', 'parking',
    'parking:hgv', 'fuel:HGV_diesel', 'fuel:diesel', 'fuel:adblue', 'fuel:lng', 'fuel:cng',
    'payment:dkv', 'payment:uta', 'payment:as24', 'payment:e100', 'payment:eurowag',
    'motorcar', 'restaurant', 'disused', 'surveillance', 'fence', 'lit',
}


def is_main(tags):
    a = tags.get('amenity')
    if a in HELPER_AMENITIES:
        return False
    if a == 'parking':
        return tags.get('hgv') in ('yes', 'designated', 'only') or 'capacity:hgv' in tags
    return True


def ring_centroid(ring):
    area = cx = cy = 0.0
    n = len(ring)
    for i in range(n):
        y0, x0 = ring[i - 1]
        y1, x1 = ring[i]
        f = x0 * y1 - x1 * y0
        area += f
        cx += (x0 + x1) * f
        cy += (y0 + y1) * f
    if abs(area) < 1e-14:
        return [sum(p[0] for p in ring) / n, sum(p[1] for p in ring) / n]
    area *= 3
    return [cy / area, cx / area]


def ring_area(ring):
    s = 0.0
    for i in range(len(ring)):
        y0, x0 = ring[i - 1]
        y1, x1 = ring[i]
        s += x0 * y1 - x1 * y0
    return abs(s) / 2


def tags_of(obj):
    return {t.k: t.v for t in obj.tags if t.k in KEEP_TAGS}


def main(src, dst):
    tag_filter = osmium.filter.TagFilter(*PAIRS)
    fp = (osmium.FileProcessor(src)
          .with_areas(osmium.filter.TagFilter(*PAIRS))
          .with_filter(tag_filter))
    n = 0
    with open(dst, 'w', encoding='utf-8') as out:
        for obj in fp:
            if obj.is_node():
                if not obj.location.valid():
                    continue
                rec = {'k': f'n{obj.id}', 't': tags_of(obj),
                       'c': [round(obj.location.lat, 6), round(obj.location.lon, 6)]}
            elif obj.is_area():
                rings = []
                for r in obj.outer_rings():
                    pts = [[round(nr.lat, 6), round(nr.lon, 6)] for nr in r if nr.location.valid()]
                    if len(pts) >= 4:
                        rings.append(pts)
                if not rings:
                    continue
                ring = max(rings, key=ring_area)
                tags = tags_of(obj)
                kind = 'w' if obj.from_way() else 'r'
                rec = {'k': f'{kind}{obj.orig_id()}', 't': tags, 'c': [round(v, 6) for v in ring_centroid(ring)]}
                if is_main(tags):
                    rec['g'] = ring
            elif obj.is_way():
                # Closed ways come back as areas; only open ways (rare, e.g. a rest area drawn
                # as a line) are kept here, as their midpoint.
                if obj.is_closed():
                    continue
                pts = [[nd.lat, nd.lon] for nd in obj.nodes if nd.location.valid()]
                if not pts:
                    continue
                mid = pts[len(pts) // 2]
                rec = {'k': f'w{obj.id}', 't': tags_of(obj), 'c': [round(mid[0], 6), round(mid[1], 6)]}
            else:
                continue
            out.write(json.dumps(rec, ensure_ascii=False, separators=(',', ':')) + '\n')
            n += 1
    print(f'{src}: {n} objects')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
