import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWorldEventsSnapshot, worldEventKind } from './records.js';

test('CAMEO root codes map to event kinds', () => {
  assert.equal(worldEventKind('19'), 'conflict');
  assert.equal(worldEventKind('20'), 'conflict');
  assert.equal(worldEventKind('14'), 'protest');
  assert.equal(worldEventKind('13'), 'tension');
  assert.equal(worldEventKind('04'), 'cooperation');
});

test('world events keep valid rows, drop bad coordinates and duplicates', () => {
  const rows = normalizeWorldEventsSnapshot({
    events: [
      {
        id: '1',
        root: '19',
        lat: 31.5,
        lon: 34.47,
        timeMs: 1793613600000,
        mentions: 12,
        tone: -6.2,
        place: 'Gaza, Israel',
        actors: 'ISRAEL / HAMAS',
        url: 'https://news.example/a',
      },
      { id: '1', root: '19', lat: 31.5, lon: 34.47 },
      { id: '2', root: '14', lat: 95, lon: 0 },
      { id: '3', root: '14', lat: 51.5, lon: -0.12, url: 'javascript:x' },
    ],
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(
    { ...rows[0] },
    {
      id: '1',
      kind: 'conflict',
      root: '19',
      label: 'Armed fighting',
      lon: 34.47,
      lat: 31.5,
      timeMs: 1793613600000,
      mentions: 12,
      tone: -6.2,
      place: 'Gaza, Israel',
      actors: 'ISRAEL / HAMAS',
      url: 'https://news.example/a',
    },
  );
  assert.equal(rows[1].kind, 'protest');
  assert.equal(rows[1].url, null);
});

test('a payload without an events array is rejected', () => {
  assert.equal(normalizeWorldEventsSnapshot({ items: [] }), null);
  assert.equal(normalizeWorldEventsSnapshot({ events: ['x'] }), null);
});
