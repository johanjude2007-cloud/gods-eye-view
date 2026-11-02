import { readFile } from 'node:fs/promises';
import { decodeRing } from '../../../src/data/adminBoundaries.js';

const COUNTRIES_URL = new URL(
  '../../../src/data/local_data/natural_earth/countries.json',
  import.meta.url,
);

/** Signed planar area and area-weighted centroid of an open [lon, lat] ring. */
export function ringAreaCentroid(ring) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j];
    const [x1, y1] = ring[i];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (!a) return { area: 0, lon: ring[0]?.[0], lat: ring[0]?.[1] };
  return { area: Math.abs(a / 2), lon: cx / (3 * a), lat: cy / (3 * a) };
}

/**
 * Map ISO alpha-2 code → { name, lat, lon } at the centroid of each country's
 * largest outer ring, from the bundled Natural Earth pack (public domain).
 * @param {object} pack Parsed `countries.json`.
 * @returns {Map<string, {name: string, lat: number, lon: number}>}
 */
export function buildCountryAnchors(pack) {
  const decimals = Number(pack?.meta?.decimals ?? 3);
  // Several features can share a code (Clipperton Island is tagged FR), so
  // the largest ring across all of them wins.
  const best = new Map();
  for (const feature of pack?.features ?? []) {
    const code = String(feature?.iso2 ?? '');
    if (!/^[A-Z]{2}$/.test(code)) continue;
    for (const polygon of feature.polygons ?? []) {
      const outer = polygon?.[0];
      if (!Array.isArray(outer) || outer.length < 6) continue;
      const c = ringAreaCentroid(decodeRing(outer, decimals));
      if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
      const current = best.get(code);
      if (!current || c.area > current.area)
        best.set(code, { ...c, name: String(feature.name ?? code) });
    }
  }
  const anchors = new Map();
  for (const [code, c] of best)
    anchors.set(code, {
      name: c.name,
      lat: Math.round(c.lat * 1000) / 1000,
      lon: Math.round(c.lon * 1000) / 1000,
    });
  return anchors;
}

let anchorsPromise = null;
/** Country anchors, read from disk once per process. */
export function loadCountryAnchors() {
  anchorsPromise ||= readFile(COUNTRIES_URL, 'utf8').then((text) =>
    buildCountryAnchors(JSON.parse(text)),
  );
  return anchorsPromise;
}

/**
 * Convert an IODA `/v2/outages/summary` response into placed outage rows.
 * Countries the bundled pack cannot place are dropped.
 * @param {object} payload IODA JSON.
 * @param {Map<string, {name: string, lat: number, lon: number}>} anchors
 */
export function normalizeIodaSummary(payload, anchors) {
  if (!Array.isArray(payload?.data)) throw new Error('Malformed IODA response');
  const outages = [];
  for (const item of payload.data) {
    const code = String(item?.entity?.code ?? '').toUpperCase();
    const anchor = anchors.get(code);
    const score = Number(item?.scores?.overall);
    if (!anchor || !Number.isFinite(score)) continue;
    outages.push({
      code,
      name: String(item?.entity?.name || anchor.name),
      score: Math.round(score),
      events: Number.isFinite(item?.event_cnt) ? item.event_cnt : 0,
      lat: anchor.lat,
      lon: anchor.lon,
    });
  }
  return outages.sort((a, b) => b.score - a.score);
}
