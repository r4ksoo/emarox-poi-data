import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRaw } from '../build/classify.mjs';
import { mergeSstpa, mergeAutobahn } from '../build/merge.mjs';

const sq = (lat, lng, d = 0.001) => [[lat, lng], [lat, lng + d], [lat + d, lng + d], [lat + d, lng], [lat, lng]];
const by = (recs, id) => recs.find((r) => r.id === id);

test('vehicle flags follow the tags, never guesses', () => {
    const recs = classifyRaw([
        { k: 'n1', t: { amenity: 'fuel' }, c: [50, 10] },
        { k: 'n2', t: { amenity: 'fuel', hgv: 'yes' }, c: [50.1, 10] },
        { k: 'n3', t: { amenity: 'fuel', 'fuel:HGV_diesel': 'yes' }, c: [50.2, 10] },
        { k: 'n4', t: { amenity: 'parking', hgv: 'only' }, c: [50.3, 10] },
        { k: 'n5', t: { amenity: 'parking' }, c: [50.4, 10] },
        { k: 'n6', t: { highway: 'rest_area', hgv: 'no' }, c: [50.5, 10] },
        { k: 'n7', t: { amenity: 'fuel', access: 'private' }, c: [50.6, 10] },
    ]);
    assert.deepEqual([by(recs, 'n1').tir, by(recs, 'n1').bus], [false, true]);
    assert.equal(by(recs, 'n2').tir, true);
    assert.equal(by(recs, 'n3').a.hgvd, 1);
    assert.deepEqual([by(recs, 'n4').tir, by(recs, 'n4').bus], [true, false]);
    assert.equal(by(recs, 'n5'), undefined, 'plain car park is not a POI');
    assert.deepEqual([by(recs, 'n6').tir, by(recs, 'n6').bus], [false, true]);
    assert.equal(by(recs, 'n7'), undefined, 'private station dropped');
});

test('a node inside a polygon of the same place is merged into the polygon', () => {
    const recs = classifyRaw([
        { k: 'w1', t: { amenity: 'fuel', name: 'Orlen' }, c: [52.0005, 17.0005], g: sq(52, 17) },
        { k: 'n9', t: { amenity: 'fuel', 'fuel:adblue': 'yes' }, c: [52.0004, 17.0004] },
    ]);
    assert.equal(recs.length, 1);
    assert.equal(recs[0].id, 'w1');
    assert.equal(recs[0].a.adblue, 1);
});

test('truck park inside a service area folds into it with its capacity', () => {
    const recs = classifyRaw([
        { k: 'w2', t: { highway: 'services', name: 'MOP Września' }, c: [52.0025, 17.0025], g: sq(52, 17, 0.005) },
        { k: 'w3', t: { amenity: 'parking', hgv: 'designated', 'capacity:hgv': '40' }, c: [52.001, 17.001], g: sq(52.0008, 17.0008, 0.0005) },
        { k: 'n10', t: { amenity: 'shower' }, c: [52.002, 17.002] },
        { k: 'w4', t: { amenity: 'fuel' }, c: [52.004, 17.004], g: sq(52.0038, 17.0038, 0.0004) },
    ]);
    const mop = by(recs, 'w2');
    assert.ok(mop && !by(recs, 'w3'));
    assert.equal(mop.a.cap, 40);
    assert.equal(mop.a.sh, 1);
    assert.equal(by(recs, 'w4').tir, true, 'station in a service area');
    assert.equal(by(recs, 'w4').a.mop, 1);
});

test('hotels need a confirmed car park, TIR needs a truck park', () => {
    const recs = classifyRaw([
        { k: 'n20', t: { tourism: 'hotel', name: 'A' }, c: [48, 11] },
        { k: 'n21', t: { amenity: 'parking' }, c: [48.0005, 11] },              // ~55 m
        { k: 'n22', t: { tourism: 'hotel', name: 'B' }, c: [48.5, 11] },          // nothing nearby
        { k: 'n23', t: { tourism: 'motel', name: 'C' }, c: [47, 11] },
        { k: 'n24', t: { amenity: 'parking', hgv: 'yes' }, c: [47.001, 11] },    // ~110 m
    ]);
    assert.deepEqual([by(recs, 'n20').bus, by(recs, 'n20').tir], [true, false]);
    assert.equal(by(recs, 'n22'), undefined);
    assert.deepEqual([by(recs, 'n23').bus, by(recs, 'n23').tir, by(recs, 'n23').a.motel], [true, true, 1]);
});

test('official lists: one-to-one match, facts tagged with their source', () => {
    const recs = classifyRaw([
        { k: 'n30', t: { highway: 'rest_area', name: 'Nord' }, c: [51.0, 7.0] },
        { k: 'n31', t: { highway: 'rest_area', name: 'Süd' }, c: [50.999, 7.0] },
    ]);
    const ab = mergeAutobahn(recs, [
        { ref: 'autobahn:A', name: 'Nord', lat: 51.0001, lng: 7.0, cap: 30 },
        { ref: 'autobahn:B', name: 'Süd', lat: 50.9991, lng: 7.0, cap: 12 },
        { ref: 'autobahn:C', name: 'Fern', lat: 51.5, lng: 7.5, cap: 5 },
    ]);
    assert.deepEqual(ab, { matched: 2, added: 1 });
    assert.equal(by(recs, 'n30').a.cap, 30);
    assert.equal(by(recs, 'n31').a.cap, 12);
    assert.equal(by(recs, 'n31').s.cap, 'd');
    assert.equal(by(recs, 'autobahn:C').cat, 'rest');

    const ss = mergeSstpa(recs, [{ ref: 'sstpa:1', lat: 51.0, lng: 7.0, name: 'X', level: 'gold' }]);
    assert.equal(ss.matched, 1);
    assert.deepEqual([by(recs, 'n30').a.cert, by(recs, 'n30').a.sh, by(recs, 'n30').s.sh], ['gold', 1, 'e']);
});

test('VAN and TIR layers are separate for parkings, washes and workshops', () => {
    const big = sq(51, 12, 0.0007);                 // ~78 m x 49 m, ~3800 m²
    const small = sq(51.1, 12, 0.0002);             // ~300 m²
    const recs = classifyRaw([
        { k: 'w30', t: { amenity: 'parking', hgv: 'yes' }, c: [51.2, 12], g: sq(51.2, 12) },
        { k: 'w31', t: { amenity: 'parking' }, c: [51.00035, 12.00035], g: big },
        { k: 'w32', t: { amenity: 'parking' }, c: [51.1001, 12.0001], g: small },
        { k: 'w33', t: { amenity: 'parking', parking: 'multi-storey', capacity: '400' }, c: [51.3, 12], g: sq(51.3, 12) },
        { k: 'n34', t: { amenity: 'parking', capacity: '50', maxheight: '2.1' }, c: [51.4, 12] },
        { k: 'n35', t: { amenity: 'parking', capacity: '60' }, c: [51.5, 12] },
        { k: 'n36', t: { amenity: 'parking', access: 'customers', capacity: '200' }, c: [51.6, 12] },
        { k: 'n40', t: { amenity: 'car_wash', hgv: 'yes' }, c: [52, 12] },
        { k: 'n41', t: { amenity: 'car_wash' }, c: [52.1, 12] },
        { k: 'n42', t: { amenity: 'car_wash', maxheight: '2.0' }, c: [52.2, 12] },
        { k: 'n50', t: { shop: 'truck_repair' }, c: [53, 12] },
        { k: 'n51', t: { shop: 'car_repair' }, c: [53.1, 12] },
        { k: 'n52', t: { shop: 'tyres' }, c: [53.2, 12] },
        { k: 'n53', t: { amenity: 'fuel', hgv: 'only' }, c: [53.3, 12] },
    ]);
    const mode = (id) => { const r = by(recs, id); return r ? `${r.tir ? 'T' : ''}${r.bus ? 'B' : ''}` : null; };
    assert.equal(mode('w30'), 'T', 'truck park: TIR only');
    assert.equal(mode('w31'), 'B', 'big open car park: VAN');
    assert.equal(mode('w32'), null, 'small car park left out');
    assert.equal(mode('w33'), null, 'multi-storey left out');
    assert.equal(mode('n34'), null, 'too low for a van');
    assert.equal(mode('n35'), 'B', 'capacity 50: VAN');
    assert.equal(mode('n36'), null, 'customers only');
    assert.equal(mode('n40'), 'T');
    assert.equal(mode('n41'), 'B');
    assert.equal(mode('n42'), null);
    assert.equal(mode('n50'), 'T');
    assert.equal(mode('n51'), 'B');
    assert.equal(mode('n52'), 'B');
    assert.equal(mode('n53'), 'T', 'truck-only station');
});
