import { createGdeltWorldEventsStore } from './worldEvents/snapshot.js';
import { createIodaInternetOutagesStore } from './internetOutages/snapshot.js';
import { makeRateLimiter, clientKey } from './common/rate-limit.js';

function sendJson(res, status, value) {
  if (res.destroyed) return;
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...(status === 405 ? { Allow: 'GET' } : {}),
    ...(status === 429 ? { 'Retry-After': '60' } : {}),
  });
  res.end(JSON.stringify(value));
}

/**
 * Build a GET-only, rate-limited JSON route over a snapshot store. Stores are
 * created lazily on the first request so constructing the plugin fetches
 * nothing.
 */
function snapshotRoute({ name, path, createStore, readQuery, errorCode }) {
  let store = null;
  const allow = makeRateLimiter({ windowMs: 60_000, max: 60, globalMax: 1200 });

  async function handler(req, res) {
    if (req.method !== 'GET')
      return sendJson(res, 405, { error: 'method_not_allowed' });
    const url = new URL(req.url || '/', 'http://local');
    if (url.pathname !== '/' && url.pathname !== '')
      return sendJson(res, 404, { error: 'unknown_route' });
    let query;
    try {
      query = readQuery(url.searchParams);
    } catch {
      return sendJson(res, 400, { error: 'invalid_query' });
    }
    if (!allow(clientKey(req)))
      return sendJson(res, 429, { error: 'rate_limited' });
    store ||= createStore();
    try {
      sendJson(res, 200, await store.getSnapshot(query));
    } catch {
      sendJson(res, 502, { error: errorCode });
    }
  }

  return {
    name,
    configureServer({ middlewares }) {
      middlewares.use(path, handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use(path, handler);
    },
  };
}

/** Geolocated GDELT news events, unpacked from the 15-minute export archives. */
export function worldEventsProxy({
  createStore = createGdeltWorldEventsStore,
} = {}) {
  return snapshotRoute({
    name: 'world-events',
    path: '/api/world-events',
    createStore,
    errorCode: 'world_events_unavailable',
    readQuery(params) {
      if (!params.has('hours')) return { hours: 6 };
      const hours = Number(params.get('hours'));
      if (!Number.isInteger(hours) || hours < 1 || hours > 24)
        throw new RangeError('hours');
      return { hours };
    },
  });
}

/** IODA country-level internet outage scores for the last 24 hours. */
export function internetOutagesProxy({
  createStore = createIodaInternetOutagesStore,
} = {}) {
  return snapshotRoute({
    name: 'internet-outages',
    path: '/api/internet-outages',
    createStore,
    errorCode: 'internet_outages_unavailable',
    readQuery() {
      return {};
    },
  });
}
