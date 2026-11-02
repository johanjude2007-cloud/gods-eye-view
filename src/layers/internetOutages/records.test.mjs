import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeInternetOutagesSnapshot, outageSeverity } from './records.js';

test('outages are validated, sorted by score and link to IODA', () => {
  const rows = normalizeInternetOutagesSnapshot({
    outages: [
      { code: 'fi', name: 'Finland', score: 1200, events: 1, lat: 64, lon: 26 },
      { code: 'NF', name: 'Norfolk Island', score: 60000, events: 2, lat: -29, lon: 168 },
      { code: 'XXX', name: 'Bad code', score: 5, lat: 0, lon: 0 },
      { code: 'ZZ', name: 'No place', score: 5 },
      { code: 'FI', name: 'Duplicate', score: 9e9, lat: 0, lon: 0 },
    ],
  });
  assert.deepEqual(
    rows.map((r) => [r.code, r.score, r.url]),
    [
      ['NF', 60000, 'https://ioda.inetintel.cc.gatech.edu/country/NF'],
      ['FI', 1200, 'https://ioda.inetintel.cc.gatech.edu/country/FI'],
    ],
  );
});

test('a payload without an outages array is rejected', () => {
  assert.equal(normalizeInternetOutagesSnapshot({}), null);
  assert.equal(normalizeInternetOutagesSnapshot({ outages: [null] }), null);
});

test('outage severity bands are logarithmic', () => {
  assert.equal(outageSeverity(0), 0);
  assert.equal(outageSeverity(500), 1);
  assert.equal(outageSeverity(20000), 2);
  assert.equal(outageSeverity(250000), 3);
});
