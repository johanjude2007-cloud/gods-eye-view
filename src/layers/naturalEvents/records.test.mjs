import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeNaturalEventsSnapshot, isHttpUrl } from './records.js';

test('natural events anchor on the newest geometry and keep a storm track', () => {
  const rows = normalizeNaturalEventsSnapshot({
    events: [
      {
        id: 'EONET_1',
        title: 'Tropical Storm Ana',
        categories: [{ id: 'severeStorms', title: 'Severe Storms' }],
        sources: [{ url: 'https://www.nhc.noaa.gov/' }],
        geometry: [
          { date: '2026-11-01T00:00:00Z', type: 'Point', coordinates: [-60, 15] },
          { date: '2026-11-02T00:00:00Z', type: 'Point', coordinates: [-62, 16] },
        ],
      },
    ],
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(
    { ...rows[0] },
    {
      id: 'EONET_1',
      title: 'Tropical Storm Ana',
      category: 'severeStorms',
      categoryTitle: 'Severe Storms',
      lon: -62,
      lat: 16,
      timeMs: Date.parse('2026-11-02T00:00:00Z'),
      url: 'https://www.nhc.noaa.gov/',
      track: [
        [-60, 15],
        [-62, 16],
      ],
    },
  );
});

test('polygon events use their first vertex; unusable events are skipped', () => {
  const rows = normalizeNaturalEventsSnapshot({
    events: [
      {
        id: 'EONET_2',
        title: 'Iceberg',
        categories: [{ id: 'seaLakeIce', title: 'Sea and Lake Ice' }],
        geometry: [
          {
            date: '2026-10-30T00:00:00Z',
            type: 'Polygon',
            coordinates: [[[10, -70], [11, -70], [11, -71], [10, -70]]],
          },
        ],
      },
      { id: 'EONET_3', title: 'No geometry', geometry: [] },
      {
        id: 'EONET_4',
        title: 'Bad coords',
        geometry: [{ type: 'Point', coordinates: [500, 0] }],
      },
    ],
  });
  assert.deepEqual(
    rows.map((r) => [r.id, r.lon, r.lat, r.url]),
    [['EONET_2', 10, -70, null]],
  );
});

test('a payload without an events array is rejected', () => {
  assert.equal(normalizeNaturalEventsSnapshot({}), null);
  assert.equal(normalizeNaturalEventsSnapshot(null), null);
  assert.equal(normalizeNaturalEventsSnapshot({ events: [42] }), null);
});

test('only http(s) links are accepted', () => {
  assert.equal(isHttpUrl('https://eonet.gsfc.nasa.gov'), true);
  assert.equal(isHttpUrl('javascript:alert(1)'), false);
  assert.equal(isHttpUrl('not a url'), false);
});
