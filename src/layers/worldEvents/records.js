import { msg } from '../../i18n/marker.js';

/** Event kinds derived from CAMEO root codes, in display priority order. */
export const WORLD_EVENT_KINDS = Object.freeze([
  'conflict',
  'protest',
  'tension',
  'cooperation',
]);

/**
 * CAMEO root code (two digits) → kind. 18–20 are assault, fighting and mass
 * violence; 14 is protest; 10–17 (except 14) are demands, threats, coercion
 * and reduced relations; 01–09 are statements, consultation and cooperation.
 * @param {string} root
 * @returns {'conflict'|'protest'|'tension'|'cooperation'}
 */
export function worldEventKind(root) {
  const code = Number(root);
  if (code >= 18 && code <= 20) return 'conflict';
  if (code === 14) return 'protest';
  if (code >= 10 && code <= 17) return 'tension';
  return 'cooperation';
}

/** English CAMEO root labels; the server copies the label onto each row. */
export const CAMEO_ROOT_LABELS = Object.freeze({
  '01': 'Public statement',
  '02': 'Appeal',
  '03': 'Intent to cooperate',
  '04': 'Consultation',
  '05': 'Diplomatic cooperation',
  '06': 'Material cooperation',
  '07': 'Aid',
  '08': 'Concession',
  '09': 'Investigation',
  10: 'Demand',
  11: 'Disapproval',
  12: 'Rejection',
  13: 'Threat',
  14: 'Protest',
  15: 'Show of force',
  16: 'Reduced relations',
  17: 'Coercion',
  18: 'Assault',
  19: 'Armed fighting',
  20: 'Mass violence',
});

const text = (value, max = 200) => {
  const t = String(value ?? '').trim();
  return t ? t.slice(0, max) : null;
};

function httpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/**
 * Validate the local `/api/world-events` snapshot before it replaces displayed
 * events. Returns null for a payload that is not an event list; skips single
 * rows with unusable coordinates.
 * @param {object} payload `{ generatedAt, events: [...] }`
 * @returns {Array<{id: string, kind: string, root: string, label: string,
 *   lon: number, lat: number, timeMs: number|null, mentions: number,
 *   tone: number|null, place: string|null, actors: string|null,
 *   url: string|null}>|null}
 */
export function normalizeWorldEventsSnapshot(payload) {
  if (!Array.isArray(payload?.events)) return null;
  const rows = [];
  const ids = new Set();
  for (const event of payload.events) {
    if (!event || typeof event !== 'object') return null;
    const { lat, lon } = event;
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      continue;
    const id = text(event.id, 40);
    if (!id || ids.has(id)) continue;
    ids.add(id);
    const root = String(event.root ?? '').padStart(2, '0');
    rows.push({
      id,
      kind: worldEventKind(root),
      root,
      label: text(event.label, 60) || CAMEO_ROOT_LABELS[root] || msg('Event'),
      lon,
      lat,
      timeMs: Number.isFinite(event.timeMs) ? event.timeMs : null,
      mentions: Number.isFinite(event.mentions)
        ? Math.max(0, event.mentions)
        : 0,
      tone: Number.isFinite(event.tone) ? event.tone : null,
      place: text(event.place),
      actors: text(event.actors),
      url: httpUrl(event.url),
    });
  }
  return rows;
}
