import * as Cesium from 'cesium';
import { WORLD_EVENT_KINDS } from './records.js';
export * from './records.js';
export { createGdeltWorldEventsSource } from './source.js';

// A portable package (no i18n): the error stays English data and the layer
// panel shows it translated.
const msg = (text) => text;

/** Marker colour per event kind. */
export const WORLD_EVENT_COLORS = Object.freeze({
  conflict: '#ff3b3b',
  protest: '#ff9f1c',
  tension: '#ffd60a',
  cooperation: '#2ec4b6',
});

/** Kinds drawn by default; diplomacy and cooperation are mostly noise on a map. */
export const DEFAULT_WORLD_EVENT_KINDS = Object.freeze([
  'conflict',
  'protest',
  'tension',
]);

const SCALE = new Cesium.NearFarScalar(2e5, 1.4, 2e7, 0.8);

/** Own the geolocated news-events display (GDELT) and its refresh lifecycle. */
export function createWorldEventsLayer({
  source,
  kinds = DEFAULT_WORLD_EVENT_KINDS,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('World events require a snapshot source');
  const shownKinds = new Set(
    kinds.filter((k) => WORLD_EVENT_KINDS.includes(k)),
  );
  let _viewer = null;
  let _request = null;
  let _points = null;
  let _rows = [];
  let _byId = new Map();
  let _count = 0;
  let _lastUpdate = null;
  let _lastError = null;
  let _enabled = false;

  function draw() {
    if (!_points) return;
    _points.removeAll();
    let count = 0;
    for (const row of _rows) {
      if (!shownKinds.has(row.kind)) continue;
      count++;
      _points.add({
        id: `world-event:${row.id}`,
        position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
        pixelSize: Math.min(5 + Math.log2(1 + row.mentions) * 1.5, 13),
        color: Cesium.Color.fromCssColorString(
          WORLD_EVENT_COLORS[row.kind],
        ).withAlpha(0.8),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.55),
        outlineWidth: 1,
        scaleByDistance: SCALE,
      });
    }
    _count = count;
  }

  return {
    id: 'world-events',
    name: 'World news events',
    icon: '📰',
    source: 'GDELT Project',
    updateInterval: 5 * 60 * 1000,

    init(viewer) {
      if (_viewer) throw new Error('World events layer is already initialized');
      _viewer = viewer;
      _points = viewer.scene.primitives.add(
        new Cesium.PointPrimitiveCollection(),
      );
      _points.show = false;
    },

    enable() {
      _enabled = true;
      if (_points) _points.show = true;
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      if (_points) _points.show = false;
    },

    async update() {
      if (!_enabled || !_points) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const rows = await source.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        _rows = rows;
        _byId = new Map(rows.map((r) => [r.id, r]));
        draw();
        _lastUpdate = Date.now();
        _lastError = null;
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:WorldEvents] Fetch error:', e);
        _lastError = e?.message || msg('World events source unavailable');
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    destroy(viewer = _viewer) {
      _request?.abort();
      _request = null;
      _enabled = false;
      if (_points) {
        viewer?.scene.primitives.remove(_points);
        _points = null;
      }
      _viewer = null;
      _rows = [];
      _byId = new Map();
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
    },

    /** Show or hide one event kind without refetching. */
    setKindVisible(kind, visible) {
      if (!WORLD_EVENT_KINDS.includes(kind)) return;
      if (visible) shownKinds.add(kind);
      else shownKinds.delete(kind);
      draw();
    },

    getVisibleKinds() {
      return WORLD_EVENT_KINDS.filter((k) => shownKinds.has(k));
    },

    /** The record behind a picked `world-event:<id>` primitive, or null. */
    getRecord(id) {
      return _byId.get(String(id).replace(/^world-event:/, '')) ?? null;
    },

    /** Plain, JSON-safe records for the analyst; [] while disabled. */
    getAnalystRecords(maxCount = 2000) {
      if (!_points?.show) return [];
      const limit = Math.max(1, Math.floor(maxCount) || 2000);
      return _rows
        .filter((r) => shownKinds.has(r.kind))
        .sort((a, b) => b.mentions - a.mentions)
        .slice(0, limit)
        .map(
          ({
            id,
            kind,
            label,
            lat,
            lon,
            timeMs,
            mentions,
            place,
            actors,
            url,
          }) => ({
            id,
            kind,
            label,
            lat,
            lon,
            timeMs,
            mentions,
            place,
            actors,
            url,
          }),
        );
    },

    getStats() {
      return { count: _count, lastUpdate: _lastUpdate, error: _lastError };
    },
  };
}
