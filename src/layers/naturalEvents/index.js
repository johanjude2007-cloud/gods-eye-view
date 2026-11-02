import * as Cesium from 'cesium';
import { NATURAL_EVENT_CATEGORIES } from './records.js';
export * from './records.js';
export { createEonetNaturalEventsSource } from './source.js';

// A portable package (no i18n): the error stays English data and the layer
// panel shows it translated.
const msg = (text) => text;

const glyphCache = new Map();
/** Draw a category glyph once and reuse it for every billboard. */
function glyph(category) {
  const char = NATURAL_EVENT_CATEGORIES[category] || '⚠️';
  if (glyphCache.has(char)) return glyphCache.get(char);
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 48;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(8, 14, 22, 0.72)';
  g.beginPath();
  g.arc(24, 24, 21, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(144, 224, 239, 0.9)';
  g.lineWidth = 2;
  g.stroke();
  g.font =
    '26px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(char, 24, 26);
  glyphCache.set(char, canvas);
  return canvas;
}

/** Own the open-natural-events display (NASA EONET) and its refresh lifecycle. */
export function createNaturalEventsLayer({ source } = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Natural events require a snapshot source');
  let _request = null;
  let _dataSource = null;
  let _rows = [];
  let _byId = new Map();
  let _count = 0;
  let _lastUpdate = null;
  let _lastError = null;
  let _enabled = false;

  return {
    id: 'natural-events',
    name: 'Storms, volcanoes & floods',
    icon: '🌀',
    source: 'NASA EONET',
    updateInterval: 15 * 60 * 1000,

    init(viewer) {
      if (_dataSource)
        throw new Error('Natural events layer is already initialized');
      _dataSource = new Cesium.CustomDataSource('natural-events');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      if (_dataSource) _dataSource.show = false;
    },

    async update() {
      if (!_enabled || !_dataSource) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const rows = await source.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        const entities = [];
        for (const row of rows) {
          entities.push(
            new Cesium.Entity({
              id: `natural-event:${row.id}`,
              name: row.title,
              position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
              billboard: {
                image: glyph(row.category),
                width: 30,
                height: 30,
                // Default depth handling hides glyphs on the far side of the
                // globe; disabling the depth test would show them through it.
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                scaleByDistance: new Cesium.NearFarScalar(
                  2e5,
                  1.0,
                  2.5e7,
                  0.55,
                ),
              },
              properties: {
                eonetId: row.id,
                title: row.title,
                category: row.category,
                categoryTitle: row.categoryTitle,
                time: row.timeMs,
                url: row.url,
              },
            }),
          );
          if (row.category === 'severeStorms' && row.track.length > 1) {
            entities.push(
              new Cesium.Entity({
                id: `natural-event-track:${row.id}`,
                polyline: {
                  positions: Cesium.Cartesian3.fromDegreesArray(
                    row.track.flat(),
                  ),
                  width: 2,
                  clampToGround: true,
                  material: new Cesium.PolylineDashMaterialProperty({
                    color:
                      Cesium.Color.fromCssColorString('#90e0ef').withAlpha(
                        0.85,
                      ),
                  }),
                },
              }),
            );
          }
        }
        _dataSource.entities.removeAll();
        for (const entity of entities) _dataSource.entities.add(entity);
        _rows = rows;
        _byId = new Map(rows.map((r) => [r.id, r]));
        _count = rows.length;
        _lastUpdate = Date.now();
        _lastError = null;
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:NaturalEvents] Fetch error:', e);
        _lastError = e?.message || msg('Natural events source unavailable');
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    destroy(viewer) {
      _request?.abort();
      _request = null;
      _enabled = false;
      if (_dataSource) {
        viewer?.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
      _rows = [];
      _byId = new Map();
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
    },

    /** The record behind a picked `natural-event:<id>` entity, or null. */
    getRecord(id) {
      return _byId.get(String(id).replace(/^natural-event:/, '')) ?? null;
    },

    /** Plain, JSON-safe records for the analyst; [] while disabled. */
    getAnalystRecords(maxCount = 500) {
      if (!_dataSource?.show) return [];
      return _rows
        .slice(0, Math.max(1, Math.floor(maxCount) || 500))
        .map((r) => ({
          id: r.id,
          title: r.title,
          category: r.categoryTitle,
          lat: r.lat,
          lon: r.lon,
          timeMs: r.timeMs,
          url: r.url,
        }));
    },

    getStats() {
      return { count: _count, lastUpdate: _lastUpdate, error: _lastError };
    },
  };
}
