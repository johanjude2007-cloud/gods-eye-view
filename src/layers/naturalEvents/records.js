/** EONET category ids this layer draws, with the glyph shown on the globe. */
export const NATURAL_EVENT_CATEGORIES = Object.freeze({
  wildfires: '🔥',
  severeStorms: '🌀',
  volcanoes: '🌋',
  seaLakeIce: '🧊',
  floods: '🌊',
  earthquakes: '〰️',
  drought: '☀️',
  dustHaze: '🌫️',
  landslides: '⛰️',
  snow: '❄️',
  tempExtremes: '🌡️',
  waterColor: '💧',
  manmade: '🏭',
});

const finiteLonLat = (pair) =>
  Array.isArray(pair) &&
  Number.isFinite(pair[0]) &&
  Number.isFinite(pair[1]) &&
  Math.abs(pair[0]) <= 180 &&
  Math.abs(pair[1]) <= 90;

/** First vertex of a Point or Polygon geometry, or null. */
function anchorOf(geometry) {
  const coords = geometry?.coordinates;
  if (geometry?.type === 'Point' && finiteLonLat(coords)) return coords;
  if (geometry?.type === 'Polygon' && finiteLonLat(coords?.[0]?.[0]))
    return coords[0][0];
  return null;
}

/**
 * Validate a complete NASA EONET v3 events response before it can replace the
 * displayed events. Returns null when the payload is not an EONET event list.
 * Events with no usable geometry are skipped; the newest geometry anchors the
 * marker and a storm's earlier Point fixes become its track.
 * @param {object} payload EONET `/api/v3/events` JSON.
 * @returns {Array<{id: string, title: string, category: string,
 *   categoryTitle: string, lon: number, lat: number, timeMs: number|null,
 *   url: string|null, track: Array<[number, number]>}>|null}
 */
export function normalizeNaturalEventsSnapshot(payload) {
  if (!Array.isArray(payload?.events)) return null;
  const rows = [];
  const ids = new Set();
  for (const event of payload.events) {
    if (!event || typeof event !== 'object') return null;
    const id = String(event.id ?? '').trim();
    if (!id || ids.has(id)) continue;
    const geometries = Array.isArray(event.geometry) ? event.geometry : [];
    const latest = geometries[geometries.length - 1];
    const anchor = anchorOf(latest);
    if (!anchor) continue;
    ids.add(id);
    const category = String(event.categories?.[0]?.id ?? 'other');
    const timeMs = Date.parse(latest?.date);
    const sourceUrl = event.sources?.[0]?.url ?? event.link ?? null;
    rows.push({
      id,
      title: String(event.title ?? '').slice(0, 200) || id,
      category,
      categoryTitle: String(event.categories?.[0]?.title ?? 'Other'),
      lon: anchor[0],
      lat: anchor[1],
      timeMs: Number.isFinite(timeMs) ? timeMs : null,
      url: isHttpUrl(sourceUrl) ? sourceUrl : null,
      track: geometries
        .filter((g) => g?.type === 'Point' && finiteLonLat(g.coordinates))
        .map((g) => [g.coordinates[0], g.coordinates[1]]),
    });
  }
  return rows;
}

/** True for an absolute http(s) URL. */
export function isHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
