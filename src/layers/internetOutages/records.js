/**
 * Validate the local `/api/internet-outages` snapshot before it replaces the
 * displayed countries. Returns null for a payload that is not an outage list;
 * skips rows whose country could not be placed.
 * @param {object} payload `{ generatedAt, windowHours, outages: [...] }`
 * @returns {Array<{code: string, name: string, score: number,
 *   events: number, lon: number, lat: number, url: string}>|null}
 */
export function normalizeInternetOutagesSnapshot(payload) {
  if (!Array.isArray(payload?.outages)) return null;
  const rows = [];
  const codes = new Set();
  for (const outage of payload.outages) {
    if (!outage || typeof outage !== 'object') return null;
    const code = String(outage.code ?? '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || codes.has(code)) continue;
    const { lat, lon, score } = outage;
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180 ||
      !Number.isFinite(score) ||
      score < 0
    )
      continue;
    codes.add(code);
    rows.push({
      code,
      name: String(outage.name ?? code).slice(0, 80),
      score,
      events: Number.isFinite(outage.events) ? outage.events : 0,
      lon,
      lat,
      // The dashboard link is built here, never taken from the payload.
      url: `https://ioda.inetintel.cc.gatech.edu/country/${code}`,
    });
  }
  return rows.sort((a, b) => b.score - a.score);
}

/**
 * Severity band for an IODA outage score. Scores are unbounded and skewed, so
 * the bands are logarithmic.
 * @param {number} score
 * @returns {0|1|2|3}
 */
export function outageSeverity(score) {
  if (!Number.isFinite(score) || score <= 0) return 0;
  const magnitude = Math.log10(score);
  if (magnitude >= 5) return 3;
  if (magnitude >= 4) return 2;
  return 1;
}
