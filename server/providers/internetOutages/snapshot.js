import { loadCountryAnchors, normalizeIodaSummary } from './ioda.js';
import { readResponseJsonCapped } from '../common/http.js';

const API = 'https://api.ioda.inetintel.cc.gatech.edu/v2/outages/summary';
const TTL_MS = 15 * 60 * 1000;
const WINDOW_HOURS = 24;

/**
 * Serve the last 24 hours of IODA country outage scores, refreshed upstream
 * at most every 15 minutes.
 * @param {{ fetchImpl?: typeof fetch, now?: () => number }} [options]
 */
export function createIodaInternetOutagesStore({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
} = {}) {
  let cached = null;
  let cachedAt = 0;
  let pending = null;

  async function load(signal) {
    const until = Math.floor(now() / 1000);
    const from = until - WINDOW_HOURS * 3600;
    const url = `${API}?from=${from}&until=${until}&entityType=country&limit=200`;
    const response = await fetchImpl(url, { signal, redirect: 'error' });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`IODA HTTP ${response.status}`);
    }
    const outages = normalizeIodaSummary(
      await readResponseJsonCapped(response, 2 * 1024 * 1024, signal),
      await loadCountryAnchors(),
    );
    return {
      generatedAt: new Date(now()).toISOString(),
      windowHours: WINDOW_HOURS,
      outages,
    };
  }

  return {
    async getSnapshot({ signal } = {}) {
      if (cached && now() - cachedAt < TTL_MS) return cached;
      // Shared by every caller, so it gets its own time limit rather than
      // the first caller's abort signal.
      pending ||= load(AbortSignal.timeout(60_000))
        .then((snapshot) => {
          cached = snapshot;
          cachedAt = now();
          return snapshot;
        })
        .finally(() => {
          pending = null;
        });
      try {
        return await pending;
      } catch (error) {
        // Serve the last good snapshot through a short upstream failure.
        if (cached) return cached;
        throw error;
      }
    },
  };
}
