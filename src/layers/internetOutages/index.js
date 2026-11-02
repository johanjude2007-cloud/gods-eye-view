import * as Cesium from 'cesium';
import { outageSeverity } from './records.js';
export * from './records.js';
export { createIodaInternetOutagesSource } from './source.js';

// A portable package (no i18n): the error stays English data and the layer
// panel shows it translated.
const msg = (text) => text;

const RING_COLOR = Cesium.Color.fromCssColorString('#9d4edd');

/** Own the internet-outage display (IODA, by country) and its refresh lifecycle. */
export function createInternetOutagesLayer({ source } = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Internet outages require a snapshot source');
  let _request = null;
  let _dataSource = null;
  let _rows = [];
  let _byId = new Map();
  let _count = 0;
  let _lastUpdate = null;
  let _lastError = null;
  let _enabled = false;

  return {
    id: 'internet-outages',
    name: 'Internet outages (24h)',
    icon: '⚡',
    source: 'IODA · Georgia Tech',
    updateInterval: 15 * 60 * 1000,

    init(viewer) {
      if (_dataSource)
        throw new Error('Internet outages layer is already initialized');
      _dataSource = new Cesium.CustomDataSource('internet-outages');
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
        _dataSource.entities.removeAll();
        for (const row of rows) {
          const severity = outageSeverity(row.score);
          const radius = 120000 + severity * 90000;
          _dataSource.entities.add({
            id: `internet-outage:${row.code}`,
            name: row.name,
            position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
            ellipse: {
              semiMajorAxis: radius,
              semiMinorAxis: radius,
              material: RING_COLOR.withAlpha(0.12 + severity * 0.06),
              outline: true,
              outlineColor: RING_COLOR.withAlpha(0.95),
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
            // The country name appears on the click card (world-overlay host);
            // raw Cesium labels are not used for world text in this app.
            properties: {
              countryCode: row.code,
              country: row.name,
              score: row.score,
              events: row.events,
              url: row.url,
            },
          });
        }
        _rows = rows;
        _byId = new Map(rows.map((r) => [r.code, r]));
        _count = rows.length;
        _lastUpdate = Date.now();
        _lastError = null;
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:InternetOutages] Fetch error:', e);
        _lastError = e?.message || msg('Internet outage source unavailable');
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

    /** The record behind a picked `internet-outage:<id>` entity, or null. */
    getRecord(id) {
      return _byId.get(String(id).replace(/^internet-outage:/, '')) ?? null;
    },

    /** Plain, JSON-safe records for the analyst; [] while disabled. */
    getAnalystRecords(maxCount = 300) {
      if (!_dataSource?.show) return [];
      return _rows
        .slice(0, Math.max(1, Math.floor(maxCount) || 300))
        .map(({ code, name, score, events, lat, lon, url }) => ({
          countryCode: code,
          country: name,
          score,
          events,
          lat,
          lon,
          url,
        }));
    },

    getStats() {
      return { count: _count, lastUpdate: _lastUpdate, error: _lastError };
    },
  };
}
