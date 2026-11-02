import {
  readFirstZipEntry,
  parseGdeltEvents,
  parseGdeltStamp,
  gdeltStampBefore,
} from './gdelt.js';
import {
  readResponseBytesCapped,
  readResponseTextCapped,
} from '../common/http.js';

const BASE = 'https://data.gdeltproject.org/gdeltv2/';
const KEEP_MS = 24 * 60 * 60 * 1000;
const POLL_MS = 5 * 60 * 1000;
const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
/** Batches loaded on first use: 6 hours of 15-minute exports. */
const BACKFILL_BATCHES = 24;

/**
 * Keep a rolling 24-hour window of GDELT event batches in memory and serve
 * snapshots from it. Upstream is checked at most every five minutes however
 * many clients ask.
 * @param {{ fetchImpl?: typeof fetch, now?: () => number }} [options]
 */
export function createGdeltWorldEventsStore({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
} = {}) {
  const loaded = new Set();
  /** @type {Array<object>} events, oldest first */
  let events = [];
  /** @type {Array<{at: number, byCountry: object}>} */
  const batches = [];
  let lastCheck = 0;
  let refreshing = null;

  async function get(url, signal) {
    const response = await fetchImpl(url, { signal, redirect: 'error' });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`GDELT HTTP ${response.status}`);
    }
    return response;
  }

  async function fetchArchive(stamp, signal) {
    const response = await get(`${BASE}${stamp}.export.CSV.zip`, signal);
    const bytes = await readResponseBytesCapped(
      response,
      MAX_ARCHIVE_BYTES,
      signal,
    );
    const buffer = Buffer.from(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
    return readFirstZipEntry(buffer).toString('utf8');
  }

  async function refresh(signal) {
    const text = await readResponseTextCapped(
      await get(`${BASE}lastupdate.txt`, signal),
      64 * 1024,
      signal,
    );
    const stamp = /(\d{14})\.export\.CSV\.zip/.exec(text)?.[1];
    const latest = parseGdeltStamp(stamp);
    if (!latest) throw new Error('GDELT update list has no export');
    const wanted = [];
    for (let k = BACKFILL_BATCHES - 1; k >= 0; k--)
      wanted.push(gdeltStampBefore(latest, k));
    for (const batch of wanted) {
      if (loaded.has(batch)) continue;
      try {
        const { rows, byCountry } = parseGdeltEvents(
          await fetchArchive(batch, signal),
        );
        loaded.add(batch);
        events.push(...rows);
        batches.push({ at: parseGdeltStamp(batch), byCountry });
      } catch (error) {
        // A missing old batch should not hide the rest of the window, and is
        // not retried; the newest batch must load.
        if (batch === stamp) throw error;
        loaded.add(batch);
      }
    }
    const cutoff = now() - KEEP_MS;
    events = events.filter((e) => (e.timeMs ?? 0) >= cutoff);
    events.sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0));
    batches.sort((a, b) => a.at - b.at);
    while (batches.length > 96) batches.shift();
  }

  async function ensureFresh(signal) {
    if (now() - lastCheck < POLL_MS && events.length) return;
    // The refresh is shared by every caller, so it gets its own time limit
    // rather than the first caller's abort signal.
    refreshing ||= refresh(AbortSignal.timeout(90_000))
      .then(() => {
        lastCheck = now();
      })
      .finally(() => {
        refreshing = null;
      });
    try {
      await refreshing;
    } catch (error) {
      // Keep serving the last good window through a short upstream failure.
      if (!events.length) throw error;
    }
    signal?.throwIfAborted();
  }

  return {
    /**
     * Events from the last `hours` hours (1–24), newest batch included.
     * @param {{ hours?: number, signal?: AbortSignal }} [options]
     */
    async getSnapshot({ hours = 6, signal } = {}) {
      await ensureFresh(signal);
      const h = Math.min(24, Math.max(1, Number(hours) || 6));
      const cutoff = now() - h * 3600 * 1000;
      return {
        generatedAt: new Date(now()).toISOString(),
        hours: h,
        events: events
          .filter((e) => (e.timeMs ?? 0) >= cutoff)
          .map(({ country, ...row }) => row),
      };
    },

    /** Per-country event counts for each loaded 15-minute batch, oldest first. */
    getBatchStats() {
      return batches.slice();
    },
  };
}
